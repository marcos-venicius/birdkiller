import * as THREE from 'three';
import { CONFIG } from '../config';
import { angleDiff, raySphere, TAU } from '../core/math';
import { BODY_Y, LEG_PIVOTS, LYING_Y, NECK, TAIL_PIVOT, type BoarGeometry } from './boarModel';

export type BoarState = 'forage' | 'walk' | 'alert' | 'flee' | 'dying' | 'dead';
export type HitZone = 'head' | 'chest' | 'rear';

/** O que o javali consulta no mundo — implementado pelo BoarManager. */
export interface BoarWorld {
  groundAt(x: number, z: number): number;
  /** Empurra um círculo para fora de troncos, tocos e pedras. */
  resolveCollision(pos: THREE.Vector3, radius: number): void;
  /** Escolhe o próximo ponto para onde o javali vai fuçar. */
  pickForageSpot(boar: Boar, out: THREE.Vector3): void;
}

/** Esferas de acerto em relação ao centro do corpo (escala 1): [zona, z, y, raio]. */
const ZONES: [HitZone, number, number, number][] = [
  ['head', 0.72, -0.07, 0.2],
  ['chest', 0.28, 0, 0.3],
  ['rear', -0.32, -0.02, 0.28],
];
/** Tempo do desabamento ao morrer (s). */
const COLLAPSE = 0.7;
const SINK_TIME = 1.5;

const _c = new THREE.Vector3();

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Um javali: comportamento (fuçar, andar, alerta, fuga), morte desabando de lado e animação das patas. */
export class Boar {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  readonly threat = new THREE.Vector3();
  state: BoarState = 'forage';
  active = false;
  removable = false;
  scale = 1;
  /** 2 = sadio; 1 = ferido (o próximo tiro mata). */
  health = 2;
  yaw = 0;
  speed = 0;
  herdId = 0;
  leader: Boar | null = null;

  private readonly head = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];
  private readonly tail: THREE.Mesh;
  private stateTime = 0;
  private stateDur = 0;
  private time = Math.random() * 100;
  private gait = 0;
  private bob = 0;
  private bodyPitch = 0;
  private bank = 0;
  private lie = 0;
  private headPitch = 0;
  private headYaw = 0;
  private stepping = 0;
  private nudge = 0;
  private stuck = 0;
  private deathSide = 1;
  private readonly slide = new THREE.Vector3();
  private sinkTime = -1;

  constructor(
    readonly geo: BoarGeometry,
    material: THREE.Material,
  ) {
    const body = new THREE.Mesh(geo.body, material);
    const headMesh = new THREE.Mesh(geo.head, material);
    this.head.position.copy(NECK);
    this.head.add(headMesh);
    this.tail = new THREE.Mesh(geo.tail, material);
    this.tail.position.copy(TAIL_PIVOT);
    this.group.add(body, this.head, this.tail);
    for (const [x, y, z] of LEG_PIVOTS) {
      const leg = new THREE.Mesh(geo.leg, material);
      leg.position.set(x, y, z);
      this.legs.push(leg);
      this.group.add(leg);
    }
    for (const m of [body, headMesh, this.tail, ...this.legs]) m.castShadow = true;
    this.group.rotation.order = 'YXZ';
  }

  /** Vivo = pode ser alvo, perceber o jogador e fugir. */
  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'dead';
  }

  /** Tempo desde que o corpo parou no chão (s). */
  get corpseAge(): number {
    return this.state === 'dead' ? this.stateTime : 0;
  }

  /** Prepara um javali (vindo do pool) fuçando em `pos`. */
  reset(pos: THREE.Vector3, yaw: number, scale: number): void {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.scale = scale;
    this.group.scale.setScalar(scale);
    this.health = 2;
    this.speed = 0;
    this.bank = 0;
    this.lie = 0;
    this.sinkTime = -1;
    this.removable = false;
    this.leader = null;
    this.forage();
  }

  /** Volta a fuçar por um tempo. */
  forage(): void {
    this.setState('forage', rand(4, 12));
    this.nudge = rand(0.5, 2);
  }

  /** Percebeu algo: para, levanta a cabeça e olha. */
  alert(threat: THREE.Vector3): void {
    if (this.state !== 'forage' && this.state !== 'walk') return;
    this.threat.copy(threat);
    this.setState('alert', rand(1.2, 2.6));
  }

  /** Foge a galope para longe de `threat`. */
  flee(threat: THREE.Vector3): void {
    if (!this.alive) return;
    this.threat.copy(threat);
    const away = Math.atan2(this.pos.x - threat.x, this.pos.z - threat.z) + rand(-0.5, 0.5);
    const d = rand(90, 130);
    this.target.set(this.pos.x + Math.sin(away) * d, 0, this.pos.z + Math.cos(away) * d);
    this.setState('flee', rand(9, 14));
  }

  wound(): void {
    this.health = 1;
  }

  /** Tiro letal: desaba de lado, escorregando com o embalo que tinha. */
  kill(dir: THREE.Vector3): void {
    if (!this.alive) return;
    this.slide.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(this.speed * 0.5);
    this.slide.x += dir.x * 0.8;
    this.slide.z += dir.z * 0.8;
    this.deathSide = Math.random() < 0.5 ? -1 : 1;
    this.leader = null;
    this.setState('dying', COLLAPSE);
  }

  /** Começa a remover o corpo (encolhe e some). */
  sink(): void {
    if (this.sinkTime < 0) this.sinkTime = 0;
  }

  /** Teste de acerto: esfera mais próxima (cabeça, peito ou traseira) atingida antes de maxT. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, hitScale: number): { t: number; zone: HitZone } | null {
    if (!this.alive) return null;
    const s = this.scale;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const base = this.group.position;
    let best: { t: number; zone: HitZone } | null = null;
    for (const [zone, z, y, r] of ZONES) {
      _c.set(base.x + fx * z * s, base.y + y * s, base.z + fz * z * s);
      const t = raySphere(o, d, _c, r * s * hitScale);
      if (t < (best ? best.t : maxT)) best = { t, zone };
    }
    return best;
  }

  /** Ponto de mira de uma zona (testes/depuração). */
  zonePoint(zone: HitZone, out: THREE.Vector3): THREE.Vector3 {
    const [, z, y] = ZONES.find(([name]) => name === zone)!;
    const b = this.group.position;
    return out.set(b.x + Math.sin(this.yaw) * z * this.scale, b.y + y * this.scale, b.z + Math.cos(this.yaw) * z * this.scale);
  }

  update(dt: number, world: BoarWorld): void {
    this.time += dt;
    this.stateTime += dt;
    const C = CONFIG.boars;
    switch (this.state) {
      case 'forage':
        this.updateForage(dt, world);
        break;
      case 'walk': {
        const dist = this.moveToward(this.target, C.walkSpeed * (0.9 + 0.2 * Math.sin(this.time * 0.3)), 1.4, dt, world);
        if (dist < 1.6 || this.stateTime > this.stateDur) this.forage();
        break;
      }
      case 'alert':
        this.speed *= Math.exp(-6 * dt);
        // Vira um pouco o corpo para a ameaça.
        this.yaw += angleDiff(this.yaw, Math.atan2(this.threat.x - this.pos.x, this.threat.z - this.pos.z)) * 0.6 * dt;
        if (this.stateTime > this.stateDur) {
          if (Math.random() < 0.35) this.flee(this.threat);
          else this.forage();
        }
        break;
      case 'flee': {
        const dist = this.moveToward(this.target, C.fleeSpeed * (this.health < 2 ? 1.15 : 1), 3.2, dt, world, Math.sin(this.time * 1.6) * 0.35);
        if (dist < 5 || this.stateTime > this.stateDur) {
          world.pickForageSpot(this, this.target);
          this.setState('walk', rand(15, 30));
        }
        break;
      }
      case 'dying':
        this.updateDying(dt, world);
        break;
      case 'dead':
        break;
    }

    if (this.state !== 'dead') this.followTerrain(dt, world);
    if (this.sinkTime >= 0) {
      this.sinkTime += dt;
      const k = Math.max(0, 1 - this.sinkTime / SINK_TIME);
      this.group.scale.setScalar(this.scale * k);
      if (k === 0) this.removable = true;
    }
    this.animate(dt);
    this.applyTransform();
  }

  /** Depuração: pose estática (fuçando, andando, galopando ou morto). */
  pose(kind: 'forage' | 'walk' | 'gallop' | 'dead', gait: number): void {
    this.state = kind === 'gallop' ? 'flee' : kind === 'walk' ? 'walk' : kind;
    this.speed = kind === 'gallop' ? CONFIG.boars.fleeSpeed : kind === 'walk' ? CONFIG.boars.walkSpeed : 0;
    this.gait = gait;
    if (kind === 'dead') {
      this.bank = 1.45;
      this.lie = 1;
    }
    this.animate(1, false);
    this.applyTransform();
  }

  private setState(state: BoarState, duration: number): void {
    this.state = state;
    this.stateTime = 0;
    this.stateDur = duration;
  }

  /** Fuça parado e às vezes dá uns passos curtos; depois de um tempo vai para outro lugar. */
  private updateForage(dt: number, world: BoarWorld): void {
    this.nudge -= dt;
    if (this.nudge <= 0) {
      this.stepping = Math.random() < 0.5 ? rand(0.6, 1.6) : 0;
      this.nudge = rand(1.5, 4);
      this.yaw += rand(-0.6, 0.6);
    }
    this.stepping -= dt;
    const v = this.stepping > 0 ? 0.35 : 0;
    this.speed += (v - this.speed) * (1 - Math.exp(-4 * dt));
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    world.resolveCollision(this.pos, 0.45 * this.scale);
    if (this.stateTime > this.stateDur) {
      world.pickForageSpot(this, this.target);
      this.setState('walk', rand(15, 30));
    }
  }

  /** Anda/corre em direção ao alvo desviando dos troncos; devolve a distância restante. */
  private moveToward(target: THREE.Vector3, maxSpeed: number, turnRate: number, dt: number, world: BoarWorld, zigzag = 0): number {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const turn = angleDiff(this.yaw, Math.atan2(dx, dz) + zigzag);
    this.yaw += THREE.MathUtils.clamp(turn, -turnRate * dt, turnRate * dt);
    const wanted = dist < 1.5 ? 0 : maxSpeed;
    this.speed += (wanted - this.speed) * (1 - Math.exp(-3 * dt));
    const bx = this.pos.x;
    const bz = this.pos.z;
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    world.resolveCollision(this.pos, 0.45 * this.scale);
    // Encalhado num tronco: quase não avançou — vira para um lado e tenta de novo.
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
    if (this.speed > 0.5 && moved < this.speed * dt * 0.3) {
      this.stuck += dt;
      if (this.stuck > 0.4) {
        this.yaw += (Math.random() < 0.5 ? -1 : 1) * 1.2;
        this.stuck = 0;
      }
    } else {
      this.stuck = 0;
    }
    return dist;
  }

  private updateDying(dt: number, world: BoarWorld): void {
    const t = Math.min(this.stateTime / COLLAPSE, 1);
    const e = t * t; // desaba acelerando
    this.bank = this.deathSide * 1.45 * e;
    this.lie = e;
    this.speed = 0;
    this.slide.multiplyScalar(Math.exp(-3 * dt));
    this.pos.x += this.slide.x * dt;
    this.pos.z += this.slide.z * dt;
    world.resolveCollision(this.pos, 0.4 * this.scale);
    if (t >= 1) {
      this.followTerrain(1, world);
      this.setState('dead', 0);
    }
  }

  /** Assenta no relevo e inclina o corpo conforme a subida/descida à frente. */
  private followTerrain(dt: number, world: BoarWorld): void {
    const half = 0.5 * this.scale;
    const fx = Math.sin(this.yaw) * half;
    const fz = Math.cos(this.yaw) * half;
    const hF = world.groundAt(this.pos.x + fx, this.pos.z + fz);
    const hB = world.groundAt(this.pos.x - fx, this.pos.z - fz);
    this.pos.y = (hF + hB) / 2;
    const pitch = -Math.atan2(hF - hB, 2 * half);
    this.bodyPitch += (pitch - this.bodyPitch) * (1 - Math.exp(-8 * dt));
  }

  private animate(dt: number, smooth = true): void {
    const s = this.scale;
    const gallop = this.speed > 3;
    const stride = (gallop ? 1.7 : 0.8) * s;
    this.gait += (this.speed / stride) * TAU * dt * (smooth ? 1 : 0);
    const p = this.gait;
    const k = smooth ? 1 - Math.exp(-6 * dt) : 1;

    if (this.alive) {
      // Passo: diagonais juntas; galope: dianteiras juntas e traseiras juntas, defasadas.
      const amp = gallop ? 0.75 : Math.min(this.speed / 1.2, 1) * 0.4;
      const phases = gallop ? [p, p + 0.35, p + 3.0, p + 3.4] : [p, p + Math.PI, p + Math.PI, p];
      for (let i = 0; i < 4; i++) this.legs[i].rotation.x = Math.sin(phases[i]) * amp;
      this.bob = gallop ? Math.sin(p * 2) * 0.05 * s : Math.abs(Math.sin(p)) * 0.02 * s * Math.min(this.speed, 1);
    } else {
      // Morto: patas duras e esticadas.
      for (let i = 0; i < 4; i++) {
        const target = i < 2 ? 0.5 : -0.5;
        this.legs[i].rotation.x += (target - this.legs[i].rotation.x) * k;
      }
      this.bob = 0;
    }

    let hp = 0.1;
    let hy = 0;
    if (this.state === 'forage') hp = 0.55 + Math.sin(this.time * 7) * 0.07; // fuçando
    else if (this.state === 'alert') {
      hp = -0.2;
      hy = THREE.MathUtils.clamp(angleDiff(this.yaw, Math.atan2(this.threat.x - this.pos.x, this.threat.z - this.pos.z)), -0.9, 0.9);
    } else if (this.state === 'flee') hp = 0.15 + Math.sin(p * 2) * 0.08;
    else if (!this.alive) hp = 0.4;
    this.headPitch += (hp - this.headPitch) * k;
    this.headYaw += (hy - this.headYaw) * k;
    this.head.rotation.set(this.headPitch, this.headYaw, 0);
    this.tail.rotation.z = this.alive ? Math.sin(this.time * 9) * (this.state === 'forage' ? 0.5 : 0.15) : 0;
  }

  private applyTransform(): void {
    const s = this.scale;
    this.group.position.set(this.pos.x, this.pos.y + (BODY_Y + (LYING_Y - BODY_Y) * this.lie) * s + this.bob, this.pos.z);
    this.group.rotation.set(this.bodyPitch * (1 - this.lie), this.yaw, this.bank);
  }
}
