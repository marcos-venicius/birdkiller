import * as THREE from 'three';
import { CONFIG } from '../config';
import { markWarm } from '../core/Engine';
import { angleDiff, TAU } from '../core/math';
import type { PlayerController } from '../player/PlayerController';
import type { ChunkManager } from '../world/ChunkManager';
import type { Terrain } from '../world/Terrain';
import { buildDogGeometry, type DogGeometry } from './dogModel';
import type { Quadruped } from './Quadruped';
import type { QuadrupedManager } from './QuadrupedManager';

/** O que o jogador mandou: ficar junto ou farejar uma espécie. */
export type DogMode = 'heel' | 'boar' | 'deer';
export type Quarry = 'boar' | 'deer';
/** O que ele está fazendo: junto, sentado, deitado, seguindo o faro, esperando, apontando, indo até a caça. */
export type DogState = 'heel' | 'sit' | 'lie' | 'track' | 'wait' | 'point' | 'fetch';

/** Ordem da tecla F: javali → veado → junto. */
const MODES: DogMode[] = ['boar', 'deer', 'heel'];

/**
 * O cão de caça. Junto, acompanha o jogador e senta quando ele para. Farejando, trota com o focinho no
 * chão até o bando mais perto da espécie escolhida — sem se afastar demais do jogador — e, a uma
 * distância segura, aponta. Se o bando for abatido, vai até a caça e espera do lado. Os bichos não
 * percebem o cão (só o jogador), e o tiro passa por ele: não é caça.
 */
export class Dog {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  mode: DogMode = 'heel';
  state: DogState = 'heel';
  yaw = 0;
  speed = 0;
  /** O bicho que ele segue agora (o do bando mais perto dele). */
  target: Quadruped | null = null;
  /** A caça abatida para onde ele está indo (ou do lado da qual está sentado). */
  carcass: Quadruped | null = null;
  /** Achou um bando: quantos e de quê (uma vez por bando). */
  onFound?: (count: number, kind: Quarry, wounded: boolean) => void;
  /** Não há rastro nenhum da espécie por perto. */
  onNoTrail?: (kind: Quarry) => void;
  /** Voltou a ficar junto sozinho (depois de levar o jogador até a caça). */
  onHeel?: () => void;

  private readonly geo: DogGeometry;
  private readonly head = new THREE.Group();
  private readonly tail: THREE.Mesh;
  private readonly legs: THREE.Mesh[] = [];
  private herdId = -1;
  private announced = '';
  private readonly fetched = new WeakSet<Quadruped>();
  private scanTimer = 0;
  private trailTimer = 0;
  private stateTime = 0;
  private still = 0;
  private stuck = 0;
  private stall = 0;
  private stallX = 0;
  private stallZ = 0;
  private time = 0;
  private gait = 0;
  private bob = 0;
  private bodyPitch = 0;
  private sit = 0;
  private lie = 0;
  private point = 0;
  private headPitch = 0;
  private headYaw = 0;

  constructor(
    scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly chunks: ChunkManager,
    private readonly player: PlayerController,
    private readonly managers: Record<Quarry, QuadrupedManager>,
  ) {
    this.geo = buildDogGeometry();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
    const body = new THREE.Mesh(this.geo.body, material);
    const headMesh = new THREE.Mesh(this.geo.head, material);
    this.head.position.copy(this.geo.neck);
    this.head.add(headMesh);
    this.tail = new THREE.Mesh(this.geo.tail, material);
    this.tail.position.copy(this.geo.tailPivot);
    this.group.add(body, this.head, this.tail);
    for (const [x, y, z] of this.geo.legPivots) {
      const leg = new THREE.Mesh(this.geo.leg, material);
      leg.position.set(x, y, z);
      this.legs.push(leg);
      this.group.add(leg);
    }
    for (const m of [body, headMesh, this.tail, ...this.legs]) m.castShadow = true;
    this.group.rotation.order = 'YXZ';
    // Sangue quente: aparece na luneta infravermelha.
    markWarm(this.group);
    scene.add(this.group);
    this.respawnNearPlayer();
  }

  /** Tecla F: javali → veado → junto. Devolve o modo novo. */
  cycle(): DogMode {
    this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]);
    return this.mode;
  }

  setMode(mode: DogMode): void {
    this.mode = mode;
    this.herdId = -1;
    this.announced = '';
    this.target = null;
    this.carcass = null;
    this.scanTimer = 0;
    this.trailTimer = 0;
  }

  /** Coloca o cão atrás do jogador (fora da vista), num lugar livre. */
  respawnNearPlayer(): void {
    const pl = this.player;
    const P = pl.position;
    // Frente do jogador = (-sen yaw, -cos yaw); "atrás" no esquema (sen a, cos a) do cão é a = yaw.
    for (let k = 0; k < 14; k++) {
      const a = pl.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35;
      const r = 3.5 + k * 0.25;
      const x = P.x + Math.sin(a) * r;
      const z = P.z + Math.cos(a) * r;
      if (!this.chunks.isClear(x, z, 0.6) || !this.terrain.lakes.dry(x, z, 0.3)) continue;
      this.place(x, z, Math.atan2(P.x - x, P.z - z));
      return;
    }
    this.place(P.x, P.z, pl.yaw);
  }

  update(dt: number): void {
    const D = CONFIG.dog;
    this.time += dt;
    this.stateTime += dt;
    const P = this.player.position;
    const dp = Math.hypot(this.pos.x - P.x, this.pos.z - P.z);
    if (dp > D.respawn) this.respawnNearPlayer();
    const moving = Math.hypot(this.player.velocity.x, this.player.velocity.z) > 0.3;
    this.still = moving ? 0 : this.still + dt;

    if (this.mode === 'heel') this.updateHeel(dt, false);
    else this.updateTrack(dt, this.mode, dp);

    this.checkStall(dt);
    this.followTerrain(dt);
    this.animate(dt);
    this.applyTransform();
  }

  // ------------------------------------------------------------------ comportamento

  /** Junto: atrás e ao lado do jogador; parado junto, senta, e depois de um tempo deita. */
  private updateHeel(dt: number, sniffing: boolean): void {
    const D = CONFIG.dog;
    const pl = this.player;
    const P = pl.position;
    // Com o jogador lá em cima (torre), espera embaixo, perto da escada.
    const up = P.y - this.terrain.heightAt(P.x, P.z) > 1.5;
    const fx = -Math.sin(pl.yaw);
    const fz = -Math.cos(pl.yaw);
    const tx = up ? P.x : P.x - fx * D.heelBack - fz * D.heelSide;
    const tz = up ? P.z : P.z - fz * D.heelBack + fx * D.heelSide;
    const stop = up ? 3.5 : 0.8;
    const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
    const resting = this.state === 'sit' || this.state === 'lie';
    if (d > stop + (resting ? 1.5 : 0)) {
      this.setState(sniffing ? 'track' : 'heel');
      this.moveToward(tx, tz, THREE.MathUtils.clamp(d * 1.5, D.walkSpeed, D.runSpeed), 5, dt, sniffing ? Math.sin(this.time * 1.7) * 0.5 : 0);
      return;
    }
    this.brake(dt);
    this.faceToward(P.x, P.z, dt, 2);
    if (this.still > 1 || up) this.setState(this.still > 15 ? 'lie' : 'sit');
  }

  /** Farejando: segue o bando da espécie, espera o jogador, aponta ao chegar perto; abatido, vai até a caça. */
  private updateTrack(dt: number, kind: Quarry, dp: number): void {
    const D = CONFIG.dog;
    const P = this.player.position;
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.5;
      this.scan(kind);
    }

    const c = this.carcass;
    if (c) {
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d > 1.6) {
        this.setState('fetch');
        this.moveToward(c.pos.x, c.pos.z, D.runSpeed, 6, dt);
      } else {
        this.brake(dt);
        this.faceToward(c.pos.x, c.pos.z, dt, 3);
        this.setState('sit');
        // O jogador chegou até a caça: acabou a caçada, volta a ficar junto.
        if (Math.hypot(P.x - this.pos.x, P.z - this.pos.z) < 6) {
          this.setMode('heel');
          this.onHeel?.();
        }
      }
      if (!c.active) this.carcass = null;
      return;
    }

    const t = this.target;
    if (!t || !t.active) {
      // Sem rastro ainda: fareja em volta do jogador.
      this.updateHeel(dt, true);
      return;
    }
    const dt2 = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    // Fugiu (tiro, jogador perto demais): espera o bando parar de correr.
    if (t.state === 'flee') {
      this.brake(dt);
      this.faceToward(t.pos.x, t.pos.z, dt, 2);
      this.setState('wait');
      return;
    }
    const pointAt = D.point[kind];
    if (this.state === 'point' ? dt2 < pointAt + 10 : dt2 <= pointAt) {
      this.brake(dt);
      this.faceToward(t.pos.x, t.pos.z, dt, 3);
      this.setState('point');
      const key = `${this.herdId}:${t.wounded}`;
      if (this.announced !== key) {
        this.announced = key;
        this.onFound?.(this.herdCount(kind), kind, t.wounded);
      }
      return;
    }
    // Coleira: longe demais do jogador, para e espera ele chegar.
    if (this.state === 'wait' ? dp > D.resume : dp > D.leash) {
      this.brake(dt);
      this.faceToward(P.x, P.z, dt, 2);
      this.setState('wait');
      return;
    }
    this.setState('track');
    this.moveToward(t.pos.x, t.pos.z, D.trotSpeed, 3, dt, Math.sin(this.time * 1.3) * 0.35);
  }

  /** Escolhe o alvo: caça fresca do bando (vai buscar), o membro do bando mais perto, ou o bando mais perto. */
  private scan(kind: Quarry): void {
    const D = CONFIG.dog;
    const m = this.managers[kind];
    const P = this.player.position;
    for (const a of m.active) {
      if (a.herdId === this.herdId && !a.alive && a.corpseAge < 8 && !this.fetched.has(a)) {
        this.fetched.add(a);
        this.carcass = a;
        this.target = null;
        return;
      }
    }
    // Um ferido da espécie por perto: o faro vai direto nele (o sangue ajuda) e não troca pelo bando sadio.
    if (this.target?.active && this.target.wounded) return;
    let hurt: Quadruped | null = null;
    let hurtD = D.search * 1.5;
    for (const a of m.active) {
      if (!a.wounded) continue;
      const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z);
      if (d < hurtD) {
        hurt = a;
        hurtD = d;
      }
    }
    if (hurt) {
      this.target = hurt;
      this.herdId = hurt.herdId;
      return;
    }
    let best: Quadruped | null = null;
    let bestD = Infinity;
    for (const a of m.active) {
      if (!a.alive || a.herdId !== this.herdId) continue;
      const d = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z);
      if (d < bestD) {
        best = a;
        bestD = d;
      }
    }
    if (!best) {
      for (const a of m.active) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - P.x, a.pos.z - P.z);
        if (d < D.search && d < bestD) {
          best = a;
          bestD = d;
        }
      }
      if (best) this.herdId = best.herdId;
    }
    if (!best) {
      // Nenhum por perto: o faro pega um rastro mais longe (um bando que surge fora da vista).
      this.trailTimer -= 0.5;
      if (this.trailTimer <= 0) {
        this.trailTimer = 20;
        const leader = m.spawnTrail(D.trail[0], D.trail[1]);
        if (leader) {
          best = leader;
          this.herdId = leader.herdId;
        } else {
          this.onNoTrail?.(kind);
        }
      }
    }
    this.target = best;
  }

  private herdCount(kind: Quarry): number {
    let n = 0;
    for (const a of this.managers[kind].active) if (a.alive && a.herdId === this.herdId) n++;
    return n;
  }

  // ------------------------------------------------------------------ movimento

  private place(x: number, z: number, yaw: number): void {
    this.pos.set(x, this.terrain.heightAt(x, z), z);
    this.yaw = yaw;
    this.speed = 0;
    this.stall = 0;
    this.stallX = x;
    this.stallZ = z;
    this.followTerrain(1);
    this.applyTransform();
  }

  private setState(state: DogState): void {
    if (state === this.state) return;
    this.state = state;
    this.stateTime = 0;
  }

  /** Anda/corre até (tx, tz) desviando dos troncos (como o `Quadruped.moveToward`). */
  private moveToward(tx: number, tz: number, maxSpeed: number, turnRate: number, dt: number, zigzag = 0): void {
    const turn = angleDiff(this.yaw, Math.atan2(tx - this.pos.x, tz - this.pos.z) + zigzag);
    this.yaw += THREE.MathUtils.clamp(turn, -turnRate * dt, turnRate * dt);
    // Virando muito, desacelera em vez de sair de lado.
    const wanted = maxSpeed * (Math.abs(turn) > 1.2 ? 0.4 : 1);
    this.speed += (wanted - this.speed) * (1 - Math.exp(-4 * dt));
    const bx = this.pos.x;
    const bz = this.pos.z;
    this.step(dt);
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
  }

  private brake(dt: number): void {
    this.speed *= Math.exp(-8 * dt);
    this.step(dt);
  }

  private faceToward(x: number, z: number, dt: number, rate: number): void {
    const turn = angleDiff(this.yaw, Math.atan2(x - this.pos.x, z - this.pos.z));
    this.yaw += THREE.MathUtils.clamp(turn, -rate * dt, rate * dt);
  }

  private step(dt: number): void {
    const r = this.geo.radius;
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    this.chunks.resolveCollision(this.pos, r);
    this.terrain.lakes.block(this.pos, r);
    this.terrain.places.resolveCollision(this.pos, r, 0.8);
    // Não fica embaixo dos pés do jogador.
    const P = this.player.position;
    const dx = this.pos.x - P.x;
    const dz = this.pos.z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4 && d < 0.75) {
      this.pos.x = P.x + (dx / d) * 0.75;
      this.pos.z = P.z + (dz / d) * 0.75;
    }
  }

  /** Querendo andar e sem sair do lugar por muito tempo (preso atrás de um lago, entre troncos): reaparece. */
  private checkStall(dt: number): void {
    const going = this.state === 'heel' || this.state === 'track' || this.state === 'fetch';
    if (!going) {
      this.stall = 0;
      this.stallX = this.pos.x;
      this.stallZ = this.pos.z;
      return;
    }
    this.stall += dt;
    if (this.stall < 6) return;
    if (Math.hypot(this.pos.x - this.stallX, this.pos.z - this.stallZ) < 1.5) this.respawnNearPlayer();
    this.stall = 0;
    this.stallX = this.pos.x;
    this.stallZ = this.pos.z;
  }

  private followTerrain(dt: number): void {
    const half = 0.3;
    const fx = Math.sin(this.yaw) * half;
    const fz = Math.cos(this.yaw) * half;
    const hF = this.terrain.heightAt(this.pos.x + fx, this.pos.z + fz);
    const hB = this.terrain.heightAt(this.pos.x - fx, this.pos.z - fz);
    this.pos.y = (hF + hB) / 2;
    const pitch = -Math.atan2(hF - hB, 2 * half);
    this.bodyPitch += (pitch - this.bodyPitch) * (1 - Math.exp(-8 * dt));
  }

  // ------------------------------------------------------------------ animação

  private animate(dt: number): void {
    const k = 1 - Math.exp(-6 * dt);
    const s = this.state;
    const sitting = s === 'sit' || s === 'wait';
    this.sit += ((sitting ? 1 : 0) - this.sit) * k;
    this.lie += ((s === 'lie' ? 1 : 0) - this.lie) * k;
    this.point += ((s === 'point' ? 1 : 0) - this.point) * k;
    const rest = Math.max(this.sit, this.lie, this.point);

    // Passo (diagonais juntas), trote (idem, mais rápido) e galope (dianteiras juntas, traseiras juntas).
    const gallop = this.speed > 5.2;
    const trot = this.speed > 2.5;
    const stride = gallop ? 1.5 : trot ? 0.9 : 0.55;
    this.gait += (this.speed / stride) * TAU * dt;
    const p = this.gait;
    const amp = (gallop ? 0.8 : trot ? 0.55 : Math.min(this.speed / 1.2, 1) * 0.4) * (1 - rest);
    const phases = gallop ? [p, p + 0.3, p + 3.0, p + 3.3] : [p, p + Math.PI, p + Math.PI, p];
    for (let i = 0; i < 4; i++) {
      let a = Math.sin(phases[i]) * amp;
      const front = i < 2;
      // Sentado: o corpo inclina para cima, as dianteiras compensam e as traseiras dobram para a frente.
      a += front ? 0.5 * this.sit : -1.35 * this.sit;
      // Deitado: as quatro esticadas para a frente.
      a += (front ? -1.35 : -1.25) * this.lie;
      // Apontando: a dianteira esquerda levantada.
      if (i === 1) a -= 1.1 * this.point;
      this.legs[i].rotation.x = a;
    }
    this.bob = gallop ? Math.sin(p * 2) * 0.04 : Math.abs(Math.sin(p)) * 0.015 * Math.min(this.speed, 1);

    let hp = 0.15;
    let hy = 0;
    const P = this.player.position;
    if (s === 'track') hp = 0.6 + Math.sin(this.time * 9) * 0.08; // focinho no chão, fungando
    else if (s === 'point') hp = -0.05;
    else if (s === 'lie') hp = 0.35;
    else if (sitting || s === 'heel') {
      hp = sitting ? -0.25 : 0.15;
      // Olha para o jogador.
      hy = THREE.MathUtils.clamp(angleDiff(this.yaw, Math.atan2(P.x - this.pos.x, P.z - this.pos.z)), -0.8, 0.8);
    }
    this.headPitch += (hp - this.headPitch) * k;
    this.headYaw += (hy - this.headYaw) * k;
    this.head.rotation.set(this.headPitch, this.headYaw, 0);

    // Rabo: esticado para trás apontando; abanando junto de você.
    const tailUp = s === 'point' ? 0.08 : s === 'track' ? 0.35 : 0.7;
    const wag = s === 'point' ? 0 : s === 'track' ? Math.sin(this.time * 8) * 0.3 : Math.sin(this.time * 13) * (s === 'lie' ? 0.15 : 0.55);
    this.tail.rotation.set(tailUp - 0.6 * this.sit, wag, 0);
  }

  private applyTransform(): void {
    const G = this.geo;
    const y = G.bodyY * (1 - 0.28 * this.sit) + (G.lyingY - G.bodyY) * this.lie + this.bob;
    this.group.position.set(this.pos.x, this.pos.y + y, this.pos.z);
    this.group.rotation.set(this.bodyPitch * (1 - this.sit) - 0.5 * this.sit, this.yaw, 0);
  }
}
