import * as THREE from 'three';
import { angleDiff, raySphere, smoothstep, TAU } from '../core/math';
import type { BirdGeometry } from './birdGeometry';
import type { Species } from './species';

export type BirdState = 'perched' | 'flying' | 'fleeing' | 'landing' | 'falling' | 'dead';
/** perch = copa de árvore; ground = chão; roam = só passear até lá. */
export type TargetKind = 'perch' | 'ground' | 'roam';

/** O que o pássaro consulta no mundo — implementado pelo BirdManager. */
export interface BirdWorld {
  groundAt(x: number, z: number): number;
  /** Mantém o nadador dentro do lago; devolve o nível da água (null se saiu de um). */
  swim(pos: THREE.Vector3): number | null;
  /** Escolhe o próximo destino e chama bird.setTarget(). */
  chooseDestination(bird: Bird): void;
  releasePerch(bird: Bird): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _desired = new THREE.Vector3();
const HOP_TIME = 0.22;
const GRAVITY = 9.8;
/** Duração do encolhimento quando um corpo é removido (s). */
const SINK_TIME = 1.5;

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Um pássaro: comportamento (máquina de estados + voo por steering), morte com física e animação das asas. */
export class Bird {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  state: BirdState = 'perched';
  targetKind: TargetKind = 'roam';
  perchKey: string | null = null;
  /** Pousado no chão (true) ou numa copa (false). */
  onGround = false;
  /** Boiando num lago (patos). */
  onWater = false;
  /** Em uso (fora do pool). */
  active = false;
  /** Corpo terminou de encolher e pode voltar ao pool. */
  removable = false;
  cruise = 10;
  flockId = 0;
  leader: Bird | null = null;
  /** Pousado: tempo até decolar. Gavião planando: duração da térmica. */
  idleTime = 0;
  orbitR = 40;
  orbitSign = 1;
  yaw = 0;
  targetYaw = 0;
  actionTimer = 0;

  private readonly wingL: THREE.Mesh;
  private readonly wingR: THREE.Mesh;
  private stateTime = 0;
  private legTime = 0;
  private fleeTime = 0;
  private pitch = 0;
  private bank = 0;
  private flapPhase = Math.random() * TAU;
  private flapAmp = 0;
  private fold = 1;
  private dihedral = 0.12;
  private peck = 0;
  private hopTime = 0;
  private readonly hopFrom = new THREE.Vector3();
  private readonly hopTo = new THREE.Vector3();
  private readonly landFrom = new THREE.Vector3();
  private landDur = 1;
  private time = Math.random() * 100;
  private readonly phase = Math.random() * TAU;
  private readonly spin = new THREE.Vector3();
  private limp = 0.5;
  private restPitch = 0;
  private restBank = 0;
  private sinkTime = -1;

  constructor(
    readonly species: Species,
    geo: BirdGeometry,
    bodyMat: THREE.Material,
    wingMat: THREE.Material,
  ) {
    const body = new THREE.Mesh(geo.body, bodyMat);
    this.wingR = new THREE.Mesh(geo.wing, wingMat);
    this.wingR.position.copy(geo.shoulder);
    this.wingL = new THREE.Mesh(geo.wing, wingMat);
    this.wingL.position.set(-geo.shoulder.x, geo.shoulder.y, geo.shoulder.z);
    this.wingL.scale.x = -1;
    for (const m of [body, this.wingR, this.wingL]) {
      m.castShadow = true;
      this.group.add(m);
    }
    this.group.scale.setScalar(species.length);
    this.group.rotation.order = 'YXZ';
  }

  /** Vivo = pode ser alvo, se assustar e pontuar. */
  get alive(): boolean {
    return this.state !== 'falling' && this.state !== 'dead';
  }

  /** Tempo desde que o corpo parou no chão (s). */
  get corpseAge(): number {
    return this.state === 'dead' ? this.stateTime : 0;
  }

  /** Prepara um pássaro vindo do pool. */
  revive(): void {
    this.group.scale.setScalar(this.species.length);
    this.sinkTime = -1;
    this.removable = false;
    this.pitch = 0;
    this.bank = 0;
  }

  /** Coloca o pássaro pousado em `p` (já com a altura do corpo acima do galho/chão). */
  perchAt(p: THREE.Vector3, onGround: boolean, key: string | null): void {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.onGround = onGround;
    this.onWater = onGround && this.species.water === true;
    this.perchKey = key;
    this.targetKind = onGround ? 'ground' : 'perch';
    this.setState('perched');
    this.idleTime = rand(this.species.perchTime[0], this.species.perchTime[1]);
    this.targetYaw = this.yaw;
    this.actionTimer = rand(0.3, 1.5);
    this.bank = 0;
    this.hopTime = 0;
  }

  /** Coloca o pássaro voando em `p`, rumo a `heading` (rad), e escolhe um destino. */
  flyAt(p: THREE.Vector3, heading: number, world: BirdWorld): void {
    this.pos.copy(p);
    this.yaw = heading;
    this.onGround = false;
    this.fold = 0;
    this.flapAmp = 0.8;
    this.vel.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(this.species.speed);
    this.setState('flying');
    world.chooseDestination(this);
  }

  setTarget(v: THREE.Vector3, kind: TargetKind, key: string | null): void {
    this.target.copy(v);
    this.targetKind = kind;
    this.perchKey = key;
    this.legTime = 0;
  }

  takeOff(world: BirdWorld): void {
    this.onGround = false;
    this.setState('flying');
    world.chooseDestination(this);
    _v.subVectors(this.target, this.pos).setY(0);
    if (_v.lengthSq() < 1e-4) _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _v.normalize();
    this.vel.set(_v.x * 2, rand(2.5, 4), _v.z * 2);
  }

  /** Foge para longe de `threat` (jogador ou disparo). */
  scare(threat: THREE.Vector3, world: BirdWorld): void {
    if (!this.alive || this.state === 'fleeing') return;
    const sitting = this.state === 'perched' || this.state === 'landing';
    world.releasePerch(this);
    _v.subVectors(this.pos, threat).setY(0);
    if (_v.lengthSq() < 1e-4) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    _v.normalize().applyAxisAngle(UP, rand(-0.6, 0.6));
    this.target.copy(this.pos).addScaledVector(_v, rand(90, 150));
    this.targetKind = 'roam';
    this.legTime = 0;
    this.cruise = this.species.cruise[1] + rand(3, 8);
    this.onGround = false;
    this.setState('fleeing');
    this.fleeTime = rand(4, 8);
    if (sitting) this.vel.set(_v.x * 2.5, rand(3.5, 5), _v.z * 2.5);
  }

  /** Tiro letal: o pássaro para de voar e cai, girando, empurrado na direção do disparo. */
  kill(dir: THREE.Vector3, world: BirdWorld): void {
    if (!this.alive) return;
    world.releasePerch(this);
    this.leader = null;
    this.onGround = false;
    this.setState('falling');
    this.vel.multiplyScalar(0.4).addScaledVector(dir, rand(2, 4));
    this.vel.y += rand(0.5, 1.5);
    this.spin.set(rand(-8, 8), rand(-4, 4), rand(-10, 10));
    this.limp = rand(0.25, 0.65);
  }

  /** Começa a remover o corpo (encolhe e some). */
  sink(): void {
    if (this.sinkTime < 0) this.sinkTime = 0;
  }

  /**
   * Teste de acerto com o raio (d normalizado). Corpo e cabeça são letais; com as asas abertas,
   * passar perto do corpo pega a asa (raspão, não letal). `scale` aumenta as esferas de acerto.
   */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, scale: number): { t: number; lethal: boolean } | null {
    if (!this.alive) return null;
    const L = this.species.length;
    let t = raySphere(o, d, this.pos, 0.3 * L * scale);
    const cp = Math.cos(this.pitch);
    _v.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(0.42 * L).add(this.pos);
    _v.y += 0.12 * L;
    t = Math.min(t, raySphere(o, d, _v, 0.17 * L * scale));
    if (t < maxT) return { t, lethal: true };
    if (this.fold < 0.5) {
      const tw = raySphere(o, d, this.pos, this.species.span * L * 0.9);
      if (tw < maxT) return { t: tw, lethal: false };
    }
    return null;
  }

  update(dt: number, world: BirdWorld): void {
    this.time += dt;
    this.stateTime += dt;
    this.legTime += dt;
    switch (this.state) {
      case 'perched':
        this.updatePerched(dt, world);
        break;
      case 'landing':
        this.updateLanding(dt);
        break;
      case 'falling':
        this.updateFalling(dt, world);
        break;
      case 'dead':
        this.updateDead(dt);
        break;
      default:
        this.updateFlight(dt, world);
    }
    if (this.sinkTime >= 0) {
      this.sinkTime += dt;
      const s = Math.max(0, 1 - this.sinkTime / SINK_TIME);
      this.group.scale.setScalar(this.species.length * s);
      if (s === 0) this.removable = true;
    }
    this.updateWings(dt);
    this.applyTransform();
  }

  /** Depuração: pose estática (asas abertas com flapAmp, fechadas com fold = 1). */
  showcase(pos: THREE.Vector3, yaw: number, flapAmp: number, fold: number): void {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.bank = 0;
    this.flapAmp = flapAmp;
    this.fold = fold;
    this.flapPhase = Math.PI / 2;
    this.poseWings();
    this.applyTransform();
  }

  private setState(state: BirdState): void {
    this.state = state;
    this.stateTime = 0;
  }

  private updatePerched(dt: number, world: BirdWorld): void {
    const L = this.leader;
    const leaderLeft =
      L !== null && L !== this && L.active && L.flockId === this.flockId && (L.state === 'flying' || L.state === 'fleeing');
    if (this.stateTime > this.idleTime || (leaderLeft && Math.random() < dt * 2.5)) {
      this.takeOff(world);
      return;
    }

    if (this.onWater) {
      this.updateSwim(dt, world);
      return;
    }

    this.actionTimer -= dt;
    if (this.actionTimer <= 0) {
      const r = Math.random();
      if (this.onGround && r < 0.35) {
        this.peck = 1;
      } else if (this.onGround && r < 0.6) {
        const a = this.yaw + rand(-0.7, 0.7);
        const d = rand(0.5, 1.2) * this.species.length;
        this.hopFrom.copy(this.pos);
        this.hopTo.set(this.pos.x + Math.sin(a) * d, 0, this.pos.z + Math.cos(a) * d);
        this.hopTo.y = world.groundAt(this.hopTo.x, this.hopTo.z) + this.species.length * 0.2;
        this.targetYaw = a;
        this.hopTime = HOP_TIME;
      } else {
        this.targetYaw = this.yaw + rand(-1.4, 1.4);
      }
      this.actionTimer = rand(0.5, 2.5);
    }

    // Viradas rápidas e secas, como pássaros fazem.
    this.yaw += angleDiff(this.yaw, this.targetYaw) * (1 - Math.exp(-14 * dt));
    this.peck = Math.max(0, this.peck - dt * 3);
    this.pitch = -0.2 + Math.sin(this.peck * Math.PI) * 0.8;
    if (this.hopTime > 0) {
      this.hopTime = Math.max(0, this.hopTime - dt);
      const t = 1 - this.hopTime / HOP_TIME;
      this.pos.lerpVectors(this.hopFrom, this.hopTo, t);
      this.pos.y += Math.sin(t * Math.PI) * 0.35 * this.species.length;
    }
  }

  /** Boiando: nada devagar em curvas largas, mergulha o bico de vez em quando e balança na água. */
  private updateSwim(dt: number, world: BirdWorld): void {
    this.actionTimer -= dt;
    if (this.actionTimer <= 0) {
      this.actionTimer = rand(1.5, 5);
      this.targetYaw = this.yaw + rand(-1.3, 1.3);
      if (Math.random() < 0.35) this.peck = 1;
    }
    this.yaw += angleDiff(this.yaw, this.targetYaw) * (1 - Math.exp(-2.5 * dt));
    const speed = 0.25 + Math.sin(this.time * 0.7 + this.phase) * 0.12;
    this.pos.x += Math.sin(this.yaw) * speed * dt;
    this.pos.z += Math.cos(this.yaw) * speed * dt;
    const level = world.swim(this.pos);
    if (level === null) {
      // Saiu do lago (o lago sumiu do cache): melhor levantar voo.
      this.takeOff(world);
      return;
    }
    // Boia com um leve balanço; o bico mergulha na "bicada".
    this.pos.y = level + this.species.length * 0.16 + Math.sin(this.time * 1.7 + this.phase) * 0.015;
    this.peck = Math.max(0, this.peck - dt * 1.6);
    this.pitch = -0.05 + Math.sin(this.peck * Math.PI) * 0.7;
  }

  private updateFlight(dt: number, world: BirdWorld): void {
    const sp = this.species;
    if (this.state === 'fleeing' && this.stateTime > this.fleeTime) {
      this.setState('flying');
      world.chooseDestination(this);
    } else if (this.legTime > 60) {
      world.chooseDestination(this);
    }
    const fleeing = this.state === 'fleeing';
    const speed = sp.speed * (fleeing ? 1.35 : 1);
    const tx = this.target.x - this.pos.x;
    const tz = this.target.z - this.pos.z;
    const hd = Math.hypot(tx, tz) || 1e-6;
    const ground = world.groundAt(this.pos.x, this.pos.z);

    let dx = tx / hd;
    let dz = tz / hd;
    const soaring = sp.flight === 'soaring' && this.targetKind === 'roam' && !fleeing;
    if (soaring) {
      // Térmica: tangente ao círculo em volta do alvo + correção radial.
      const radial = (hd - this.orbitR) / this.orbitR;
      const ox = dx;
      const oz = dz;
      dx = -oz * this.orbitSign + ox * radial;
      dz = ox * this.orbitSign + oz * radial;
      if (this.legTime > this.idleTime) world.chooseDestination(this);
    }

    // Vagueio: curva suave para não voar em linha reta.
    const w = Math.sin(this.time * 0.8 + this.phase) * 0.35 * (this.targetKind === 'roam' ? 1 : smoothstep(10, 40, hd));
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    let hx = dx * cw - dz * sw;
    let hz = dx * sw + dz * cw;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;

    // Altitude de cruzeiro acima do chão; perto do destino, desce até ele.
    let desiredY = ground + this.cruise;
    if (this.targetKind !== 'roam') desiredY = THREE.MathUtils.lerp(desiredY, this.target.y + 0.4, smoothstep(45, 6, hd));
    _desired.set(hx * speed, THREE.MathUtils.clamp((desiredY - this.pos.y) * 1.2, -speed * 0.6, speed * 0.7), hz * speed);
    if (this.targetKind !== 'roam') _desired.multiplyScalar(0.45 + 0.55 * smoothstep(3, 18, hd));
    this.vel.lerp(_desired, 1 - Math.exp(-sp.agility * dt));
    const landingOnGround = this.targetKind === 'ground' && hd < 10;
    if (!landingOnGround && this.pos.y < ground + 1.2) this.vel.y = Math.max(this.vel.y, 2);
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < ground + 0.1) this.pos.y = ground + 0.1;

    if (this.targetKind === 'roam') {
      if (!soaring && hd < 12) {
        if (fleeing) this.setState('flying');
        world.chooseDestination(this);
      }
    } else if (this.pos.distanceTo(this.target) < 3) {
      this.startLanding();
    }

    this.orientToVelocity(dt);
  }

  private orientToVelocity(dt: number): void {
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) {
      const d = angleDiff(this.yaw, Math.atan2(this.vel.x, this.vel.z));
      this.yaw += d * (1 - Math.exp(-8 * dt));
      // Inclina para dentro da curva.
      this.bank += (THREE.MathUtils.clamp(-d * 2.4, -0.8, 0.8) - this.bank) * (1 - Math.exp(-5 * dt));
    }
    this.pitch = -Math.atan2(this.vel.y, Math.max(hs, 0.5)) * 0.6;
  }

  private startLanding(): void {
    this.setState('landing');
    this.landFrom.copy(this.pos);
    this.landDur = THREE.MathUtils.clamp(this.pos.distanceTo(this.target) / (this.species.speed * 0.35), 0.5, 1.4);
  }

  private updateLanding(dt: number): void {
    const t = Math.min(this.stateTime / this.landDur, 1);
    const e = 1 - (1 - t) * (1 - t);
    _v.lerpVectors(this.landFrom, this.target, e);
    _v.y += Math.sin(t * Math.PI) * 0.5 * (1 - t);
    this.vel.subVectors(_v, this.pos).divideScalar(Math.max(dt, 1e-4));
    this.pos.copy(_v);
    const dx = this.target.x - this.landFrom.x;
    const dz = this.target.z - this.landFrom.z;
    if (dx * dx + dz * dz > 1e-4) this.yaw += angleDiff(this.yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-8 * dt));
    // Freia com o peito para cima e as asas abertas.
    this.pitch += (-0.7 - this.pitch) * (1 - Math.exp(-6 * dt));
    this.bank *= Math.exp(-6 * dt);
    if (t >= 1) this.perchAt(this.target, this.targetKind === 'ground', this.perchKey);
  }

  private updateFalling(dt: number, world: BirdWorld): void {
    const L = this.species.length;
    this.vel.y -= GRAVITY * dt;
    this.vel.multiplyScalar(Math.exp(-0.5 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.pitch += this.spin.x * dt;
    this.yaw += this.spin.y * dt;
    this.bank += this.spin.z * dt;

    const rest = world.groundAt(this.pos.x, this.pos.z) + L * 0.18;
    if (this.pos.y > rest) return;
    this.pos.y = rest;
    if (this.vel.y < -2) {
      // Quique curto no chão.
      this.vel.set(this.vel.x * 0.4, -this.vel.y * 0.2, this.vel.z * 0.4);
      this.spin.multiplyScalar(0.4);
      return;
    }
    this.setState('dead');
    this.vel.set(0, 0, 0);
    // Fica de lado (mais comum) ou de barriga para cima.
    this.restBank = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) * rand(1.25, 1.5) : Math.PI;
    this.restPitch = rand(-0.25, 0.25);
  }

  private updateDead(dt: number): void {
    const k = 1 - Math.exp(-8 * dt);
    this.pitch += angleDiff(this.pitch, this.restPitch) * k;
    this.bank += angleDiff(this.bank, this.restBank) * k;
  }

  private updateWings(dt: number): void {
    const sp = this.species;
    let amp = 0;
    let fold = 0;
    let freq = sp.flapHz;
    let dihedral = 0.12;
    if (this.state === 'perched') {
      fold = 1;
    } else if (this.state === 'landing') {
      amp = 1;
      freq *= 1.3;
    } else if (this.state === 'falling') {
      // Asas moles, tremulando com o vento da queda.
      amp = 0.3;
      freq = 5;
      fold = this.limp;
    } else if (this.state === 'dead') {
      fold = this.limp;
    } else {
      const climbing = this.vel.y > 1.5 || this.state === 'fleeing';
      if (sp.flight === 'bounding') {
        // Voo ondulado: batidas curtas alternadas com asas fechadas.
        if ((this.time * 1.7 + this.phase) % 1 < 0.6) amp = 0.9;
        else fold = 0.8;
      } else if (sp.flight === 'soaring') {
        dihedral = 0.2;
        amp = Math.sin(this.time * 0.45 + this.phase) > 0.8 ? 0.55 : 0;
      } else {
        amp = this.vel.y < -1.5 ? 0 : 0.8;
      }
      if (climbing) {
        amp = Math.max(amp, 0.95);
        fold = 0;
        freq *= 1.15;
      }
    }
    const k = 1 - Math.exp(-12 * dt);
    this.flapAmp += (amp - this.flapAmp) * k;
    this.fold += (fold - this.fold) * k;
    this.dihedral = dihedral;
    this.flapPhase += freq * TAU * dt;
    this.poseWings();
  }

  private poseWings(): void {
    const ang = this.dihedral * (1 - this.fold) + this.flapAmp * Math.sin(this.flapPhase) - this.fold * 0.2;
    const sweep = this.fold * 1.35;
    this.wingR.rotation.set(0, sweep, ang);
    this.wingL.rotation.set(0, -sweep, -ang);
  }

  private applyTransform(): void {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.yaw, this.bank);
  }
}
