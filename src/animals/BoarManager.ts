import * as THREE from 'three';
import { CONFIG } from '../config';
import { TAU } from '../core/math';
import type { PlayerController } from '../player/PlayerController';
import type { Biome } from '../world/Biome';
import type { ChunkManager } from '../world/ChunkManager';
import { inPlayerView } from '../world/spawnRules';
import type { Terrain } from '../world/Terrain';
import { Boar, type BoarWorld, type HitZone } from './Boar';
import { BOAR_PALETTES, buildBoarGeometry, type BoarGeometry } from './boarModel';

const _v = new THREE.Vector3();
const _threat = new THREE.Vector3();

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Javalis: spawn de bandos fora da visão (dentro da mata), percepção do jogador, fuga do bando,
 * tiros (abate/ferimento), limite de corpos e reuso via pool. Implementa o BoarWorld.
 */
export class BoarManager implements BoarWorld {
  readonly active: Boar[] = [];
  /** Depuração: congela os javalis (capturas de tela). */
  frozen = false;
  /** Depuração/testes: chamado a cada javali criado. */
  onSpawn?: (boar: Boar, initial: boolean) => void;

  private readonly pools = new Map<BoarGeometry, Boar[]>();
  private readonly geometries = BOAR_PALETTES.map((p) => buildBoarGeometry(p));
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
  private readonly corpses: Boar[] = [];
  private spawnTimer = rand(4, 10);
  private herds = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly biome: Biome,
    private readonly chunks: ChunkManager,
    private readonly player: PlayerController,
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  populate(): void {
    for (let i = 0; i < CONFIG.boars.initialGroups; i++) this.trySpawn(true);
  }

  get living(): number {
    let n = 0;
    for (const b of this.active) if (b.alive) n++;
    return n;
  }

  update(dt: number): void {
    if (this.frozen) return;
    const C = CONFIG.boars;
    const P = this.player;
    const pp = P.position;
    // Faro e ouvido: correr é notado de longe; agachado e parado, quase nada.
    const still = Math.hypot(P.velocity.x, P.velocity.z) < 0.3;
    const sense = (P.running ? C.senseRun : P.crouched ? C.senseCrouch : C.senseWalk) * (still ? 0.6 : 1);
    _threat.set(pp.x, pp.y, pp.z);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.update(dt, this);
      const d = Math.hypot(b.pos.x - pp.x, b.pos.z - pp.z);
      if (b.removable || d > C.despawnDistance) {
        this.release(i);
        continue;
      }
      if (!b.alive) {
        if (b.corpseAge > CONFIG.combat.corpseLifetime) b.sink();
        continue;
      }
      if (b.state === 'forage' || b.state === 'walk') {
        if (d < sense * 0.5) this.startFlee(b, _threat);
        else if (d < sense) b.alert(_threat);
      } else if (b.state === 'alert' && d < sense * 0.7) {
        this.startFlee(b, _threat);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = rand(C.spawnInterval[0], C.spawnInterval[1]);
      if (this.living < C.maxActive) this.trySpawn(false);
    }
  }

  /** Espanta os javalis num raio (disparo). */
  scare(origin: THREE.Vector3, radius: number): void {
    for (const b of this.active) if (b.alive && b.pos.distanceTo(origin) < radius) this.startFlee(b, origin);
  }

  /** Javali vivo mais próximo atingido pelo raio (d normalizado) antes de maxT. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { boar: Boar; t: number; zone: HitZone } | null {
    let best: { boar: Boar; t: number; zone: HitZone } | null = null;
    for (const boar of this.active) {
      const hit = boar.raycast(o, d, best ? best.t : maxT, CONFIG.boars.hitboxScale);
      if (hit) best = { boar, t: hit.t, zone: hit.zone };
    }
    return best;
  }

  /** Tiro: vital (cabeça/peito) ou segundo tiro mata; na traseira, fere e o bando foge. */
  hit(boar: Boar, dir: THREE.Vector3, vital: boolean, origin: THREE.Vector3): 'killed' | 'wounded' {
    if (vital || boar.health <= 1) {
      boar.kill(dir);
      this.corpses.push(boar);
      while (this.corpses.length > CONFIG.boars.maxCorpses) this.corpses.shift()!.sink();
      return 'killed';
    }
    boar.wound();
    this.startFlee(boar, origin);
    return 'wounded';
  }

  /** Cria um javali fuçando em `pos` (y é recalculado pelo relevo). */
  spawn(pos: THREE.Vector3, yaw: number, scale: number, palette: number): Boar {
    const geo = this.geometries[palette % this.geometries.length];
    let pool = this.pools.get(geo);
    if (!pool) {
      pool = [];
      this.pools.set(geo, pool);
    }
    const boar = pool.pop() ?? new Boar(geo, this.material);
    boar.reset(pos, yaw, scale);
    boar.active = true;
    boar.herdId = 0;
    this.scene.add(boar.group);
    this.active.push(boar);
    boar.update(0, this);
    return boar;
  }

  // ------------------------------------------------------------------ BoarWorld

  groundAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  resolveCollision(pos: THREE.Vector3, radius: number): void {
    this.chunks.resolveCollision(pos, radius);
    // Javalis também param na beira do lago (só os patos entram na água).
    this.terrain.lakes.block(pos, radius);
  }

  pickForageSpot(boar: Boar, out: THREE.Vector3): void {
    const P = this.player.position;
    const L = boar.leader;
    let cx = boar.pos.x;
    let cz = boar.pos.z;
    let minR = 10;
    let maxR = 35;
    if (L && L !== boar && L.active && L.alive && L.herdId === boar.herdId) {
      // Membros do bando fuçam perto de onde o líder vai.
      cx = L.target.x;
      cz = L.target.z;
      minR = 1;
      maxR = 5;
    } else if (Math.hypot(boar.pos.x - P.x, boar.pos.z - P.z) > CONFIG.boars.homeRadius) {
      cx = (boar.pos.x + P.x) / 2;
      cz = (boar.pos.z + P.z) / 2;
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      const r = rand(minR, maxR);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      // Preferem a mata; nas últimas tentativas aceitam clareira.
      if (i < 6 && this.biome.forest(x, z) < 0.3) continue;
      if (!this.chunks.isClear(x, z, 1.2) || !this.terrain.lakes.dry(x, z, 0.1)) continue;
      out.set(x, 0, z);
      return;
    }
    out.set(cx, 0, cz);
  }

  // ------------------------------------------------------------------ spawn

  private startFlee(boar: Boar, from: THREE.Vector3): void {
    boar.flee(from);
    // O bando foge junto.
    for (const other of this.active) {
      if (other !== boar && other.alive && other.herdId === boar.herdId && other.state !== 'flee' && other.pos.distanceTo(boar.pos) < 40) {
        other.flee(from);
      }
    }
  }

  private trySpawn(initial: boolean): void {
    const C = CONFIG.boars;
    const P = this.player.position;
    for (let attempt = 0; attempt < 14; attempt++) {
      const a = Math.random() * TAU;
      const d = rand(initial ? C.initialMin : C.spawnMin, C.spawnMax);
      const x = P.x + Math.cos(a) * d;
      const z = P.z + Math.sin(a) * d;
      if (!initial && inPlayerView(this.player, this.camera, x, z, C.hiddenDistance, C.viewMargin)) continue;
      if (this.biome.forest(x, z) < 0.3 || !this.chunks.isClear(x, z, 1.5)) continue;
      if (!this.terrain.lakes.dry(x, z, 0.2)) continue;

      const r = Math.random();
      const n = Math.min(r < 0.4 ? 1 : r < 0.75 ? 2 : 3, C.maxActive - this.living);
      if (n <= 0) return;
      const herdId = ++this.herds;
      const palette = Math.floor(Math.random() * BOAR_PALETTES.length);
      let leader: Boar | null = null;
      for (let k = 0; k < n; k++) {
        const px = x + (k === 0 ? 0 : rand(-5, 5));
        const pz = z + (k === 0 ? 0 : rand(-5, 5));
        if (k > 0 && !this.chunks.isClear(px, pz, 1)) continue;
        // O primeiro é o maior (macho adulto); os outros, menores.
        const boar = this.spawn(_v.set(px, 0, pz), Math.random() * TAU, k === 0 ? rand(0.95, 1.15) : rand(0.75, 0.95), palette);
        boar.herdId = herdId;
        boar.leader = leader ?? boar;
        leader ??= boar;
        this.onSpawn?.(boar, initial);
      }
      return;
    }
  }

  private release(i: number): void {
    const boar = this.active[i];
    const corpse = this.corpses.indexOf(boar);
    if (corpse >= 0) this.corpses.splice(corpse, 1);
    boar.active = false;
    boar.leader = null;
    this.scene.remove(boar.group);
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
    this.pools.get(boar.geo)!.push(boar);
  }
}
