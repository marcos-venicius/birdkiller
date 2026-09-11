import * as THREE from 'three';
import type { AudioSystem } from '../audio/AudioSystem';
import { playBoltClose, playBoltOpen, playGunshot, playReload } from '../audio/weaponSounds';
import { CONFIG } from '../config';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import { smoothstep, TAU } from '../core/math';
import type { PlayerController } from '../player/PlayerController';
import type { HUD } from '../ui/HUD';
import { buildKar98k, type Kar98kModel } from './Kar98kModel';

interface Pose {
  pos: THREE.Vector3;
  rot: THREE.Vector3;
}

function pose(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Pose {
  return { pos: new THREE.Vector3(x, y, z), rot: new THREE.Vector3(rx, ry, rz) };
}

/** Poses no espaço da câmera da arma (x direita, y cima, -z frente). */
const HIP = pose(0.14, -0.11, -0.21, 0, 0.02, 0);
const ADS = pose(0, 0, -0.1);
const SPRINT = pose(0.1, -0.12, -0.2, -0.15, 0.55, 0.3);
const RELOAD = pose(0.16, -0.15, -0.2, 0.3, -0.05, 0.5);

type State = 'ready' | 'cycling' | 'reloading';

const _pos = new THREE.Vector3();
const _rot = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _q = new THREE.Quaternion();

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

/**
 * Rifle de ferrolho: disparo, ciclo do ferrolho, recarga automática, mira com luneta,
 * coice, clarão e poses (quadril / correndo / recarregando / mirando).
 */
export class Weapon {
  magazine: number = CONFIG.weapon.magazineSize;
  state: State = 'ready';
  /** Progresso da mira: 0 = quadril, 1 = luneta no olho. */
  aim = 0;
  /** Chamado a cada disparo com a origem e a direção exata do tiro (já com dispersão). */
  onFire?: (origin: THREE.Vector3, dir: THREE.Vector3) => void;

  private readonly model: Kar98kModel;
  private timer = 0;
  private recoil = 0;
  private readonly kick = new THREE.Vector2();
  private sprint = 0;
  private reloadPose = 0;
  private swayX = 0;
  private swayY = 0;
  private time = 0;
  private flashTimer = 0;
  private scoped = false;
  private readonly vmSun: THREE.DirectionalLight;
  private readonly vmHemi: THREE.HemisphereLight;
  private readonly vmFlash: THREE.PointLight;
  private readonly worldFlash: THREE.PointLight;

  constructor(
    private readonly engine: Engine,
    private readonly input: Input,
    private readonly player: PlayerController,
    private readonly hud: HUD,
    private readonly audio: AudioSystem,
    private readonly sunDir: THREE.Vector3,
  ) {
    const A = CONFIG.atmosphere;
    this.model = buildKar98k();
    engine.viewScene.add(this.model.group);

    // A arma tem luzes próprias, orientadas a cada quadro para bater com o sol e o céu do mundo.
    this.vmSun = new THREE.DirectionalLight(A.sunColor, A.sunIntensity * 0.55);
    this.vmHemi = new THREE.HemisphereLight(A.skyLight, A.groundLight, A.hemiIntensity * 0.9);
    this.vmFlash = new THREE.PointLight(0xffb060, 0, 1.5, 2);
    this.vmFlash.position.set(0.12, -0.12, -0.95);
    engine.viewScene.add(this.vmSun, this.vmHemi, this.vmFlash);

    // Clarão que ilumina a mata ao redor por um instante (sempre na cena, intensidade 0 em repouso).
    this.worldFlash = new THREE.PointLight(0xffa050, 0, 30, 2);
    engine.scene.add(this.worldFlash);

    hud.setAmmo(this.magazine);
  }

  update(dt: number): void {
    const W = CONFIG.weapon;
    const P = this.player;
    const cam = this.engine.camera;
    this.time += dt;
    this.timer += dt;

    if (this.state === 'cycling' && this.timer >= W.boltTime) {
      this.setState('ready');
    } else if (this.state === 'reloading' && this.timer >= W.reloadTime) {
      this.magazine = W.magazineSize;
      this.hud.setAmmo(this.magazine);
      this.hud.setReloading(false);
      this.setState('ready');
    }

    // Mira: segurar o botão direito. Recarregar tira da mira; mirar impede correr.
    const wantAim = this.input.isMouseDown(2) && this.state !== 'reloading';
    P.aiming = wantAim;
    this.aim = approach(this.aim, wantAim ? 1 : 0, dt / W.aimTime);
    const aimT = smoothstep(0, 1, this.aim);
    const zoom = smoothstep(0.35, 1, this.aim);

    if (this.input.wasMousePressed(0) && this.state === 'ready' && this.magazine > 0 && !P.running) this.fire(zoom);

    const fov = THREE.MathUtils.lerp(CONFIG.camera.fov, W.scopeFov, zoom);
    if (Math.abs(cam.fov - fov) > 1e-4) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    P.lookScale = THREE.MathUtils.lerp(1, W.scopeLookScale, zoom);

    const scoped = this.aim > 0.93;
    if (scoped !== this.scoped) {
      this.scoped = scoped;
      this.hud.setScoped(scoped);
      this.model.group.visible = !scoped;
    }
    this.hud.setCrosshairVisible(this.aim < 0.05);

    // Coice da câmera (volta sozinho) + oscilação da respiração na luneta.
    this.kick.multiplyScalar(Math.exp(-W.kickRecover * dt));
    const moving = Math.min(Math.hypot(P.velocity.x, P.velocity.z) / CONFIG.player.walkSpeed, 1.5);
    const breath = zoom * (P.crouched ? W.swayCrouched : W.sway) * (1 + moving * 2);
    P.viewOffset.set(
      this.kick.x + Math.sin(this.time * 1.7) * breath * 0.6,
      this.kick.y + Math.sin(this.time * 0.9 + 0.5) * breath,
    );

    this.updatePose(dt, aimT);
    this.updateEffects(dt);
  }

  private setState(state: State): void {
    this.state = state;
    this.timer = 0;
  }

  private fire(zoom: number): void {
    const W = CONFIG.weapon;
    const P = this.player;
    const cam = this.engine.camera;
    this.magazine--;
    this.hud.setAmmo(this.magazine);

    // Direção = centro da tela + dispersão num cone (grande no quadril, mínima na luneta).
    const moving = Math.min(Math.hypot(P.velocity.x, P.velocity.z) / CONFIG.player.walkSpeed, 1.5);
    let spread = THREE.MathUtils.lerp(W.hipSpread + W.moveSpread * moving, W.scopeSpread + W.scopeMoveSpread * moving, zoom);
    if (P.crouched) spread *= 0.6;
    if (!P.onGround) spread += W.airSpread;
    cam.updateMatrixWorld();
    cam.getWorldDirection(_dir);
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    _up.setFromMatrixColumn(cam.matrixWorld, 1);
    const a = Math.random() * TAU;
    const r = Math.tan(spread * Math.sqrt(Math.random()));
    _dir.addScaledVector(_right, r * Math.cos(a)).addScaledVector(_up, r * Math.sin(a)).normalize();
    this.onFire?.(cam.position.clone(), _dir.clone());

    this.recoil = 1;
    this.kick.x += W.kickPitch * (P.crouched ? 0.7 : 1);
    this.kick.y += (Math.random() - 0.5) * W.kickYaw;
    this.flashTimer = W.flashTime;
    this.model.flash.material.rotation = Math.random() * TAU;
    this.model.flash.scale.setScalar(0.18 + Math.random() * 0.1);
    if (this.scoped) this.hud.flash();
    playGunshot(this.audio);

    if (this.magazine > 0) {
      this.setState('cycling');
      playBoltOpen(this.audio, 0.32);
      playBoltClose(this.audio, 0.62);
    } else {
      this.setState('reloading');
      this.hud.setReloading(true);
      playReload(this.audio, W.reloadTime);
    }
  }

  /** [rotação, recuo] do ferrolho em 0..1 conforme o estado e o tempo nele. */
  private boltProgress(): [number, number] {
    const t = this.timer;
    if (this.state === 'cycling') {
      return [smoothstep(0.3, 0.4, t) - smoothstep(0.78, 0.88, t), smoothstep(0.42, 0.55, t) - smoothstep(0.62, 0.75, t)];
    }
    if (this.state === 'reloading') {
      const e = CONFIG.weapon.reloadTime;
      return [
        smoothstep(0.15, 0.28, t) - smoothstep(e - 0.4, e - 0.3, t),
        smoothstep(0.28, 0.42, t) - smoothstep(e - 0.58, e - 0.45, t),
      ];
    }
    return [0, 0];
  }

  private updatePose(dt: number, aimT: number): void {
    const P = this.player;
    const W = CONFIG.weapon;
    const m = this.model;
    this.sprint = approach(this.sprint, P.running ? 1 : 0, dt * 4);
    const reloading = this.state === 'reloading' && this.timer < W.reloadTime - 0.3;
    this.reloadPose = approach(this.reloadPose, reloading ? 1 : 0, dt * 3.5);
    this.recoil *= Math.exp(-W.recoilRecover * dt);

    const sp = smoothstep(0, 1, this.sprint);
    const rl = smoothstep(0, 1, this.reloadPose);
    _pos.copy(HIP.pos).lerp(SPRINT.pos, sp).lerp(RELOAD.pos, rl).lerp(ADS.pos, aimT);
    _rot.copy(HIP.rot).lerp(SPRINT.rot, sp).lerp(RELOAD.rot, rl).lerp(ADS.rot, aimT);

    // Balanço dos passos (quase some na mira).
    const bob = P.bobAmount * (1 - aimT * 0.9);
    _pos.x += Math.sin(P.stepPhase) * 0.014 * bob;
    _pos.y += Math.sin(P.stepPhase * 2) * 0.009 * bob;
    _rot.z += Math.sin(P.stepPhase) * 0.02 * bob;

    // A arma "atrasa" em relação ao movimento do mouse.
    const k = 1 - Math.exp(-10 * dt);
    this.swayX += (THREE.MathUtils.clamp(P.lookDelta.x * 0.0006, -0.05, 0.05) - this.swayX) * k;
    this.swayY += (THREE.MathUtils.clamp(P.lookDelta.y * 0.0006, -0.05, 0.05) - this.swayY) * k;
    const swayK = 1 - aimT * 0.85;
    _rot.y += this.swayX * swayK;
    _rot.x += this.swayY * swayK;
    _pos.x -= this.swayX * 0.05 * swayK;

    // Coice.
    _pos.z += 0.075 * this.recoil;
    _rot.x += 0.1 * this.recoil;

    const [boltRot, boltBack] = this.boltProgress();
    _rot.z += 0.12 * boltRot * (1 - aimT);

    m.group.position.copy(_pos);
    m.group.rotation.set(_rot.x, _rot.y, _rot.z);
    m.bolt.rotation.z = boltRot * 1.35;
    m.bolt.position.z = m.boltRestZ + boltBack * 0.085;
  }

  private updateEffects(dt: number): void {
    const W = CONFIG.weapon;
    const cam = this.engine.camera;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const f = this.flashTimer / W.flashTime;
    this.model.flash.visible = f > 0 && !this.scoped;
    this.vmFlash.intensity = W.flashViewLight * f;
    this.worldFlash.intensity = W.flashWorldLight * f;
    if (f > 0) {
      cam.getWorldDirection(_dir);
      this.worldFlash.position.copy(cam.position).addScaledVector(_dir, 1.5);
    }

    // Luzes da arma no referencial da câmera: sol e céu continuam coerentes ao girar.
    _q.copy(cam.quaternion).invert();
    this.vmSun.position.copy(this.sunDir).applyQuaternion(_q);
    this.vmHemi.position.set(0, 1, 0).applyQuaternion(_q);
  }
}
