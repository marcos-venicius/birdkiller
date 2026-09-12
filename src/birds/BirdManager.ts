import * as THREE from 'three';
import { CONFIG } from '../config';
import { TAU } from '../core/math';
import type { PlayerController } from '../player/PlayerController';
import type { Biome } from '../world/Biome';
import type { ChunkManager } from '../world/ChunkManager';
import type { Terrain } from '../world/Terrain';
import { Bird, rand, type BirdWorld, type TargetKind } from './Bird';
import { buildBirdGeometry, type BirdGeometry } from './birdGeometry';
import { SPECIES, type Species } from './species';

const _spot = new THREE.Vector3();
const _v = new THREE.Vector3();
const _threat = new THREE.Vector3();

function perchKey(x: number, z: number): string {
  return `${Math.round(x * 10)},${Math.round(z * 10)}`;
}

/**
 * População de pássaros: spawn dinâmico fora da visão, destinos (copas, chão, passeio),
 * sustos e descarte/reuso via pool. Implementa o BirdWorld consultado por cada Bird.
 */
export class BirdManager implements BirdWorld {
  readonly active: Bird[] = [];
  readonly speciesList = SPECIES;
  /** Depuração: congela todos os pássaros (capturas de tela). */
  frozen = false;
  /** Depuração/testes: chamado a cada pássaro criado. */
  onSpawn?: (bird: Bird, initial: boolean) => void;

  private readonly pools = new Map<Species, Bird[]>();
  private readonly geometries = new Map<Species, BirdGeometry>();
  private readonly bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
  private readonly wingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, dithering: true });
  /** Poleiros ocupados ou reservados (um pássaro por copa). */
  private readonly occupied = new Set<string>();
  private spawnTimer = 1;
  private flocks = 0;
  /** Corpos em ordem de abate (o mais antigo sai primeiro quando passa do limite). */
  private readonly corpses: Bird[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly biome: Biome,
    private readonly chunks: ChunkManager,
    private readonly player: PlayerController,
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  /** Povoamento inicial: pássaros já pousados em volta (inclusive à frente, mas não colados no jogador). */
  populate(): void {
    for (let i = 0; i < 40 && this.active.length < CONFIG.birds.initialBirds; i++) this.trySpawn(true);
  }

  update(dt: number): void {
    if (this.frozen) return;
    const C = CONFIG.birds;
    const P = this.player;
    const pp = P.position;
    const fear = P.running ? C.fearRun : P.crouched ? C.fearCrouch : C.fearWalk;
    _threat.set(pp.x, pp.y + 1.6, pp.z);

    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.update(dt, this);
      const hd = Math.hypot(b.pos.x - pp.x, b.pos.z - pp.z);
      if (b.removable || hd > C.despawnDistance) {
        this.release(i);
        continue;
      }
      if (!b.alive) {
        if (b.corpseAge > CONFIG.combat.corpseLifetime) b.sink();
        continue;
      }
      if ((b.state === 'perched' || b.state === 'landing') && Math.hypot(hd, b.pos.y - _threat.y) < fear * b.species.wary) {
        b.scare(_threat, this);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = rand(C.spawnInterval[0], C.spawnInterval[1]);
      if (this.living < C.maxActive) this.trySpawn(false);
    }
  }

  /** Pássaros vivos (os corpos não contam para o limite de spawn). */
  get living(): number {
    let n = 0;
    for (const b of this.active) if (b.alive) n++;
    return n;
  }

  /** Pássaro vivo mais próximo atingido pelo raio (d normalizado) antes de maxT. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { bird: Bird; t: number; lethal: boolean } | null {
    let best: { bird: Bird; t: number; lethal: boolean } | null = null;
    for (const bird of this.active) {
      const hit = bird.raycast(o, d, best ? best.t : maxT, CONFIG.combat.hitboxScale);
      if (hit) best = { bird, t: hit.t, lethal: hit.lethal };
    }
    return best;
  }

  /** Abate: o pássaro cai e vira corpo; acima do limite, o corpo mais antigo é removido. */
  kill(bird: Bird, dir: THREE.Vector3): void {
    if (!bird.alive) return;
    bird.kill(dir, this);
    this.corpses.push(bird);
    while (this.corpses.length > CONFIG.combat.maxCorpses) this.corpses.shift()!.sink();
  }

  /** Espanta os pássaros num raio (disparo). */
  scare(origin: THREE.Vector3, radius: number): void {
    for (const b of this.active) if (b.pos.distanceTo(origin) < radius * b.species.wary) b.scare(origin, this);
  }

  get stats(): Record<string, number> {
    const s: Record<string, number> = { total: this.active.length };
    for (const b of this.active) s[b.state] = (s[b.state] ?? 0) + 1;
    return s;
  }

  // ------------------------------------------------------------------ BirdWorld

  groundAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  releasePerch(bird: Bird): void {
    if (bird.perchKey) this.occupied.delete(bird.perchKey);
    bird.perchKey = null;
  }

  chooseDestination(bird: Bird): void {
    const sp = bird.species;
    const P = this.player.position;
    this.releasePerch(bird);
    bird.cruise = rand(sp.cruise[0], sp.cruise[1]);

    // Membros de bando seguem o destino do líder.
    const L = bird.leader;
    if (L && L !== bird && L.active && L.flockId === bird.flockId) {
      if (L.targetKind === 'ground' && this.findGroundSpot(L.target.x, L.target.z, 1, 6, _spot)) {
        return this.setDestination(bird, 'ground', _spot, null);
      }
      if (L.targetKind === 'perch' && this.findPerch(bird, L.target.x, L.target.z, 2, 18, _spot)) {
        return this.setDestination(bird, 'perch', _spot, perchKey(_spot.x, _spot.z));
      }
      if (L.targetKind === 'roam') {
        _spot.set(L.target.x + rand(-8, 8), 0, L.target.z + rand(-8, 8));
        return this.setDestination(bird, 'roam', _spot, null);
      }
    }

    const dist = Math.hypot(bird.pos.x - P.x, bird.pos.z - P.z);
    // Às vezes o pássaro simplesmente vai embora — é reciclado ao passar do limite de distância,
    // abrindo vaga para outros chegarem.
    if (dist < CONFIG.birds.homeRadius && Math.random() < CONFIG.birds.leaveChance) {
      const a = Math.atan2(bird.pos.z - P.z, bird.pos.x - P.x) + rand(-0.7, 0.7);
      _spot.set(P.x + Math.cos(a) * 400, 0, P.z + Math.sin(a) * 400);
      return this.setDestination(bird, 'roam', _spot, null);
    }
    // Longe do jogador, os destinos puxam o pássaro de volta para a região dele.
    const far = dist > CONFIG.birds.homeRadius;
    const cx = far ? (bird.pos.x + P.x) * 0.5 : bird.pos.x;
    const cz = far ? (bird.pos.z + P.z) * 0.5 : bird.pos.z;
    const r = Math.random();
    if (r < sp.groundChance && this.findGroundSpot(cx, cz, 15, 70, _spot)) {
      return this.setDestination(bird, 'ground', _spot, null);
    }
    if (r < sp.groundChance + sp.perchChance && this.findPerch(bird, cx, cz, 15, 90, _spot)) {
      return this.setDestination(bird, 'perch', _spot, perchKey(_spot.x, _spot.z));
    }
    const a = Math.random() * TAU;
    const d = rand(50, 110);
    _spot.set(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d);
    if (sp.flight === 'soaring') {
      bird.orbitR = rand(30, 60);
      bird.orbitSign = Math.random() < 0.5 ? -1 : 1;
      bird.idleTime = rand(25, 60);
    }
    this.setDestination(bird, 'roam', _spot, null);
  }

  // ------------------------------------------------------------------ spawn

  /** Cria um pássaro pousado em `spot` (ponto do galho/chão). */
  spawnPerched(sp: Species, spot: THREE.Vector3, onGround: boolean, key: string | null): Bird {
    const bird = this.obtain(sp);
    bird.yaw = Math.random() * TAU;
    _v.copy(spot);
    _v.y += sp.length * 0.2;
    bird.perchAt(_v, onGround, key);
    if (key) this.occupied.add(key);
    return bird;
  }

  spawnFlying(sp: Species, pos: THREE.Vector3, heading: number): Bird {
    const bird = this.obtain(sp);
    bird.flyAt(pos, heading, this);
    return bird;
  }

  private trySpawn(initial: boolean): void {
    const C = CONFIG.birds;
    const sp = this.pickSpecies();
    if (!sp) return;
    const P = this.player.position;

    let cx = 0;
    let cz = 0;
    let ok = false;
    for (let i = 0; i < 12 && !ok; i++) {
      const a = Math.random() * TAU;
      const d = rand(initial ? C.initialMin : C.spawnMin, C.spawnMax);
      cx = P.x + Math.cos(a) * d;
      cz = P.z + Math.sin(a) * d;
      ok = initial || !this.inView(cx, cz);
    }
    if (!ok) return;

    const flying = !initial && Math.random() < C.flyingSpawnChance;
    const same = this.active.filter((b) => b.alive && b.species === sp).length;
    const n = Math.min(Math.floor(rand(sp.flock[0], sp.flock[1] + 1)), sp.max - same, C.maxActive - this.living);
    const flockId = ++this.flocks;
    let leader: Bird | null = null;

    for (let k = 0; k < n; k++) {
      let bird: Bird | null = null;
      if (flying) {
        _spot.set(cx + rand(-4, 4), 0, cz + rand(-4, 4));
        _spot.y = this.terrain.heightAt(_spot.x, _spot.z) + rand(sp.cruise[0], sp.cruise[1]);
        // Entra voando em direção à região do jogador, mas não reto para ele.
        const heading = Math.atan2(P.x - _spot.x, P.z - _spot.z) + rand(-0.8, 0.8);
        bird = this.obtain(sp);
        bird.flockId = flockId;
        bird.leader = leader ?? bird;
        bird.flyAt(_spot, heading, this);
      } else if (sp.groundChance > 0 && Math.random() < sp.groundChance && this.findGroundSpot(cx, cz, 0, 12, _spot)) {
        bird = this.spawnPerched(sp, _spot, true, null);
      } else if (this.findPerch(null, cx, cz, 0, 25, _spot, sp)) {
        bird = this.spawnPerched(sp, _spot, false, perchKey(_spot.x, _spot.z));
      }
      if (!bird) continue;
      bird.flockId = flockId;
      bird.leader = leader ?? bird;
      leader ??= bird;
      this.onSpawn?.(bird, initial);
    }
  }

  /** O ponto está dentro do campo de visão (com folga) e perto o bastante para ser visto surgindo? */
  private inView(x: number, z: number): boolean {
    const C = CONFIG.birds;
    const P = this.player.position;
    const dx = x - P.x;
    const dz = z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > C.hiddenDistance) return false;
    const fx = -Math.sin(this.player.yaw);
    const fz = -Math.cos(this.player.yaw);
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.camera.fov) / 2) * this.camera.aspect);
    return (dx * fx + dz * fz) / d > Math.cos(halfFov + THREE.MathUtils.degToRad(C.viewMargin));
  }

  private pickSpecies(): Species | null {
    const counts = new Map<Species, number>();
    for (const b of this.active) if (b.alive) counts.set(b.species, (counts.get(b.species) ?? 0) + 1);
    const available = SPECIES.filter((sp) => (counts.get(sp) ?? 0) < sp.max);
    let r = Math.random() * available.reduce((sum, sp) => sum + sp.weight, 0);
    for (const sp of available) {
      r -= sp.weight;
      if (r <= 0) return sp;
    }
    return available[available.length - 1] ?? null;
  }

  private findGroundSpot(x: number, z: number, minR: number, maxR: number, out: THREE.Vector3): boolean {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      const r = rand(minR, maxR);
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      // Pássaros descem no chão em clareiras e bordas, longe de troncos e pedras.
      if (this.biome.forest(px, pz) > 0.6 || !this.chunks.isClear(px, pz, 1)) continue;
      out.set(px, this.terrain.heightAt(px, pz), pz);
      return true;
    }
    return false;
  }

  private findPerch(
    bird: Bird | null,
    x: number,
    z: number,
    minR: number,
    maxR: number,
    out: THREE.Vector3,
    species: Species | null = bird?.species ?? null,
  ): boolean {
    const tall = species?.tallPerch ?? false;
    return this.chunks.randomPerch(
      x,
      z,
      minR,
      maxR,
      out,
      (px, py, pz) => !this.occupied.has(perchKey(px, pz)) && (!tall || py - this.terrain.heightAt(px, pz) > 11),
    );
  }

  private setDestination(bird: Bird, kind: TargetKind, spot: THREE.Vector3, key: string | null): void {
    _v.copy(spot);
    if (kind !== 'roam') _v.y += bird.species.length * 0.2;
    bird.setTarget(_v, kind, key);
    if (key) this.occupied.add(key);
  }

  private obtain(sp: Species): Bird {
    let pool = this.pools.get(sp);
    if (!pool) {
      pool = [];
      this.pools.set(sp, pool);
    }
    let geo = this.geometries.get(sp);
    if (!geo) {
      geo = buildBirdGeometry(sp);
      this.geometries.set(sp, geo);
    }
    const bird = pool.pop() ?? new Bird(sp, geo, this.bodyMat, this.wingMat);
    bird.revive();
    bird.active = true;
    bird.leader = null;
    bird.flockId = 0;
    this.scene.add(bird.group);
    this.active.push(bird);
    return bird;
  }

  private release(i: number): void {
    const bird = this.active[i];
    this.releasePerch(bird);
    const corpse = this.corpses.indexOf(bird);
    if (corpse >= 0) this.corpses.splice(corpse, 1);
    bird.active = false;
    bird.leader = null;
    this.scene.remove(bird.group);
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
    this.pools.get(bird.species)!.push(bird);
  }
}
