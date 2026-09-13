import * as THREE from 'three';
import { markWarm } from '../core/Engine';
import { angleDiff, raySphere, TAU } from '../core/math';
import type { AnimalKind } from './kinds';
import type { HitZone, QuadrupedGeometry } from './quadrupedModel';

export type AnimalState = 'forage' | 'walk' | 'drink' | 'alert' | 'flee' | 'dying' | 'dead';
export type { HitZone };

/** O que o javali consulta no mundo — implementado pelo QuadrupedManager. */
export interface AnimalWorld {
  groundAt(x: number, z: number): number;
  /** Empurra um círculo para fora de troncos, tocos e pedras. */
  resolveCollision(pos: THREE.Vector3, radius: number): void;
  /** Escolhe o próximo ponto para onde o bicho vai comer. */
  pickForageSpot(animal: Quadruped, out: THREE.Vector3): void;
  /**
   * Ponto de bebida na margem do lago mais próximo. Devolve o centro da água (para o bicho
   * ficar virado para ela) ou null se não houver lago por perto.
   */
  pickDrinkSpot(animal: Quadruped, out: THREE.Vector3): { x: number; z: number } | null;
}

/** Tempo do desabamento ao morrer (s). */
const COLLAPSE = 0.7;
const SINK_TIME = 1.5;

const _c = new THREE.Vector3();

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Um javali: comportamento (fuçar, andar, alerta, fuga), morte desabando de lado e animação das patas. */
export class Quadruped {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  readonly threat = new THREE.Vector3();
  state: AnimalState = 'forage';
  active = false;
  removable = false;
  scale = 1;
  /** 2 = sadio; 1 = ferido (o próximo tiro mata). */
  health = 2;
  yaw = 0;
  speed = 0;
  herdId = 0;
  leader: Quadruped | null = null;
  /** Tempo até sentir sede de novo (s). */
  thirst = rand(20, 120);
  /** O destino atual é a margem do lago. */
  private drinking = false;
  private readonly water = new THREE.Vector3();

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
    readonly geo: QuadrupedGeometry,
    material: THREE.Material,
    readonly kind: AnimalKind,
  ) {
    const body = new THREE.Mesh(geo.body, material);
    const headMesh = new THREE.Mesh(geo.head, material);
    this.head.position.copy(geo.neck);
    this.head.add(headMesh);
    this.tail = new THREE.Mesh(geo.tail, material);
    this.tail.position.copy(geo.tailPivot);
    this.group.add(body, this.head, this.tail);
    for (const [x, y, z] of geo.legPivots) {
      const leg = new THREE.Mesh(geo.leg, material);
      leg.position.set(x, y, z);
      this.legs.push(leg);
      this.group.add(leg);
    }
    for (const m of [body, headMesh, this.tail, ...this.legs]) m.castShadow = true;
    this.group.rotation.order = 'YXZ';
    // Sangue quente: aparece na luneta infravermelha.
    markWarm(this.group);
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
    this.drinking = false;
    this.thirst = rand(20, 120);
    this.forage();
  }

  /** Volta a fuçar por um tempo. */
  forage(): void {
    this.setState('forage', rand(4, 12));
    this.nudge = rand(0.5, 2);
  }

  /** Percebeu algo: para, levanta a cabeça e olha. */
  alert(threat: THREE.Vector3): void {
    if (this.state !== 'forage' && this.state !== 'walk' && this.state !== 'drink') return;
    this.threat.copy(threat);
    const [lo, hi] = this.kind.cfg.alertTime;
    this.setState('alert', rand(lo, hi));
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
    const neck = this.geo.neck;
    const cos = Math.cos(this.headPitch);
    const sin = Math.sin(this.headPitch);
    let best: { t: number; zone: HitZone } | null = null;
    for (const [zone, z0, y0, r] of this.geo.zones) {
      let y = y0;
      let z = z0;
      if (zone === 'head') {
        // A cabeça gira junto com o pescoço: pastando, ela está lá embaixo.
        const dy = y0 - neck.y;
        const dz = z0 - neck.z;
        y = neck.y + dy * cos - dz * sin;
        z = neck.z + dy * sin + dz * cos;
      }
      _c.set(base.x + fx * z * s, base.y + y * s, base.z + fz * z * s);
      const t = raySphere(o, d, _c, r * s * hitScale);
      if (t < (best ? best.t : maxT)) best = { t, zone };
    }
    return best;
  }

  /** Ponto de mira de uma zona (testes/depuração). */
  zonePoint(zone: HitZone, out: THREE.Vector3): THREE.Vector3 {
    const [, z, y] = this.geo.zones.find(([name]) => name === zone)!;
    const b = this.group.position;
    return out.set(b.x + Math.sin(this.yaw) * z * this.scale, b.y + y * this.scale, b.z + Math.cos(this.yaw) * z * this.scale);
  }

  update(dt: number, world: AnimalWorld): void {
    this.time += dt;
    this.stateTime += dt;
    if (this.alive) this.thirst -= dt;
    const C = this.kind.cfg;
    switch (this.state) {
      case 'forage':
        this.updateForage(dt, world);
        break;
      case 'walk': {
        const dist = this.moveToward(this.target, C.walkSpeed * (0.9 + 0.2 * Math.sin(this.time * 0.3)), 1.4, dt, world);
        if (dist < 1.6 && this.drinking) {
          this.drinking = false;
          this.setState('drink', rand(C.drinkTime[0], C.drinkTime[1]));
        } else if (dist < 1.6 || this.stateTime > this.stateDur) {
          this.forage();
        }
        break;
      }
      case 'drink':
        this.speed *= Math.exp(-6 * dt);
        // Fica de frente para a água enquanto bebe.
        this.yaw += angleDiff(this.yaw, Math.atan2(this.water.x - this.pos.x, this.water.z - this.pos.z)) * 2 * dt;
        if (this.stateTime > this.stateDur) {
          this.thirst = rand(C.drinkInterval[0], C.drinkInterval[1]);
          this.forage();
        }
        break;
      case 'alert':
        this.speed *= Math.exp(-6 * dt);
        // Vira um pouco o corpo para a ameaça.
        this.yaw += angleDiff(this.yaw, Math.atan2(this.threat.x - this.pos.x, this.threat.z - this.pos.z)) * 0.6 * dt;
        if (this.stateTime > this.stateDur) {
          if (Math.random() < C.boltChance) this.flee(this.threat);
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
    this.speed = kind === 'gallop' ? this.kind.cfg.fleeSpeed : kind === 'walk' ? this.kind.cfg.walkSpeed : 0;
    this.gait = gait;
    if (kind === 'dead') {
      this.bank = 1.45;
      this.lie = 1;
    }
    this.animate(1, false);
    this.applyTransform();
  }

  private setState(state: AnimalState, duration: number): void {
    this.state = state;
    this.stateTime = 0;
    this.stateDur = duration;
  }

  /** Fuça parado e às vezes dá uns passos curtos; depois de um tempo vai para outro lugar. */
  /** Sede: de tempos em tempos o bicho larga o que está fazendo e vai à margem do lago. */
  private tryDrink(world: AnimalWorld): boolean {
    const lake = world.pickDrinkSpot(this, this.target);
    if (!lake) {
      // Sem lago por perto: tenta de novo daqui a pouco.
      this.thirst = rand(20, 40);
      return false;
    }
    this.water.set(lake.x, 0, lake.z);
    this.drinking = true;
    this.setState('walk', rand(25, 50));
    return true;
  }

  private updateForage(dt: number, world: AnimalWorld): void {
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
    world.resolveCollision(this.pos, this.geo.radius * this.scale);
    if (this.stateTime > this.stateDur) {
      if (this.thirst <= 0 && this.tryDrink(world)) return;
      world.pickForageSpot(this, this.target);
      this.setState('walk', rand(15, 30));
    }
  }

  /** Anda/corre em direção ao alvo desviando dos troncos; devolve a distância restante. */
  private moveToward(target: THREE.Vector3, maxSpeed: number, turnRate: number, dt: number, world: AnimalWorld, zigzag = 0): number {
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
    world.resolveCollision(this.pos, this.geo.radius * this.scale);
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

  private updateDying(dt: number, world: AnimalWorld): void {
    const t = Math.min(this.stateTime / COLLAPSE, 1);
    const e = t * t; // desaba acelerando
    this.bank = this.deathSide * 1.45 * e;
    this.lie = e;
    this.speed = 0;
    this.slide.multiplyScalar(Math.exp(-3 * dt));
    this.pos.x += this.slide.x * dt;
    this.pos.z += this.slide.z * dt;
    world.resolveCollision(this.pos, this.geo.radius * 0.9 * this.scale);
    if (t >= 1) {
      this.followTerrain(1, world);
      this.setState('dead', 0);
    }
  }

  /** Assenta no relevo e inclina o corpo conforme a subida/descida à frente. */
  private followTerrain(dt: number, world: AnimalWorld): void {
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
    const bounding = gallop && this.kind.bounding;
    const stride = (gallop ? (bounding ? 2.6 : 1.7) : 0.8) * s;
    this.gait += (this.speed / stride) * TAU * dt * (smooth ? 1 : 0);
    const p = this.gait;
    const k = smooth ? 1 - Math.exp(-6 * dt) : 1;

    if (this.alive) {
      // Passo: diagonais juntas; galope: dianteiras juntas e traseiras juntas, defasadas.
      const amp = gallop ? (bounding ? 0.95 : 0.75) : Math.min(this.speed / 1.2, 1) * 0.4;
      // Aos saltos as quatro patas se juntam quase ao mesmo tempo (veado); no galope rasteiro
      // as dianteiras vão na frente das traseiras (javali).
      const phases = bounding
        ? [p, p + 0.15, p + 2.6, p + 2.75]
        : gallop
          ? [p, p + 0.35, p + 3.0, p + 3.4]
          : [p, p + Math.PI, p + Math.PI, p];
      for (let i = 0; i < 4; i++) this.legs[i].rotation.x = Math.sin(phases[i]) * amp;
      this.bob = gallop
        ? (bounding ? Math.max(0, Math.sin(p)) * 0.22 : Math.sin(p * 2) * 0.05) * s
        : Math.abs(Math.sin(p)) * 0.02 * s * Math.min(this.speed, 1);
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
    if (this.state === 'forage') hp = this.kind.feedPitch + Math.sin(this.time * 7) * 0.07; // comendo
    else if (this.state === 'drink') hp = this.kind.feedPitch + 0.12 + Math.sin(this.time * 3) * 0.04; // bebendo
    else if (this.state === 'alert') {
      hp = this.kind.alertPitch;
      hy = THREE.MathUtils.clamp(angleDiff(this.yaw, Math.atan2(this.threat.x - this.pos.x, this.threat.z - this.pos.z)), -0.9, 0.9);
    } else if (this.state === 'flee') hp = 0.15 + Math.sin(p * 2) * 0.08;
    else if (!this.alive) hp = 0.4;
    else if (this.state === 'walk') hp = this.kind.feedPitch * 0.35;
    this.headPitch += (hp - this.headPitch) * k;
    this.headYaw += (hy - this.headYaw) * k;
    this.head.rotation.set(this.headPitch, this.headYaw, 0);
    this.tail.rotation.z = this.alive ? Math.sin(this.time * 9) * (this.state === 'forage' ? 0.5 : 0.15) : 0;
  }

  private applyTransform(): void {
    const s = this.scale;
    const { bodyY, lyingY } = this.geo;
    this.group.position.set(this.pos.x, this.pos.y + (bodyY + (lyingY - bodyY) * this.lie) * s + this.bob, this.pos.z);
    this.group.rotation.set(this.bodyPitch * (1 - this.lie), this.yaw, this.bank);
  }
}
