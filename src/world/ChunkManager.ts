import * as THREE from 'three';
import { CONFIG } from '../config';
import { Chunk } from './Chunk';
import type { Terrain } from './Terrain';
import type { Vegetation } from './vegetation/Vegetation';

/** Chave numérica única por coordenada de chunk (válida para ±32768 chunks ≈ ±2000 km). */
function key(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** Distância horizontal do ponto (x, z) até a borda mais próxima do chunk. */
function chunkDistance(x: number, z: number, cx: number, cz: number): number {
  const s = CONFIG.world.chunkSize;
  const dx = Math.max(cx * s - x, 0, x - (cx + 1) * s);
  const dz = Math.max(cz * s - z, 0, z - (cz + 1) * s);
  return Math.hypot(dx, dz);
}

/**
 * Streaming do mundo infinito: mantém carregados os chunks até loadDistance do jogador,
 * descarrega os que passam de unloadDistance e reaproveita tudo via pool.
 * A geração é dividida em etapas (terreno → vegetação → grama) e respeita um orçamento
 * de tempo por quadro para não causar travadas.
 */
export class ChunkManager {
  private readonly loaded = new Map<number, Chunk>();
  private readonly pool: Chunk[] = [];
  private readonly grassPool: THREE.InstancedMesh[] = [];
  private readonly queue: { cx: number; cz: number; d: number }[] = [];
  /** Chunks com terreno pronto aguardando a vegetação (ainda fora da cena). */
  private readonly populateQueue: Chunk[] = [];
  private readonly grassQueue = new Set<Chunk>();
  private pcx = NaN;
  private pcz = NaN;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly vegetation: Vegetation,
  ) {}

  get stats(): { loaded: number; queued: number; pooled: number; grass: number } {
    let grass = 0;
    for (const c of this.loaded.values()) if (c.grass) grass++;
    const queued = this.queue.length + this.populateQueue.length + this.grassQueue.size;
    return { loaded: this.loaded.size, queued, pooled: this.pool.length, grass };
  }

  /** Gera tudo ao redor de uma vez — usado antes do primeiro quadro. */
  warmup(pos: THREE.Vector3): void {
    this.update(pos, Infinity);
    this.update(pos, Infinity);
  }

  update(pos: THREE.Vector3, budgetMs: number = CONFIG.world.buildBudgetMs): void {
    const W = CONFIG.world;
    const pcx = Math.floor(pos.x / W.chunkSize);
    const pcz = Math.floor(pos.z / W.chunkSize);
    if (pcx !== this.pcx || pcz !== this.pcz) {
      this.pcx = pcx;
      this.pcz = pcz;
      this.refresh(pos);
    }

    for (const chunk of this.loaded.values()) {
      const d = chunkDistance(pos.x, pos.z, chunk.cx, chunk.cz);
      chunk.setLod(d < W.lod0Distance ? 0 : 1);
      if (d < W.grassDistance) {
        if (!chunk.grass) this.grassQueue.add(chunk);
      } else if (chunk.grass && d > W.grassDistance + 8) {
        this.releaseGrass(chunk);
      }
    }

    // Uma etapa por iteração; a primeira sempre roda, as seguintes só se sobrar orçamento.
    const start = performance.now();
    while (performance.now() - start < budgetMs) {
      const pending = this.populateQueue.shift();
      if (pending) {
        this.finishLoad(pending, pos);
        continue;
      }
      const grass = this.grassQueue.values().next();
      if (!grass.done) {
        this.grassQueue.delete(grass.value);
        if (!grass.value.grass) this.assignGrass(grass.value);
        continue;
      }
      const next = this.queue.shift();
      if (!next) break;
      if (!this.loaded.has(key(next.cx, next.cz))) this.startLoad(next.cx, next.cz);
    }
  }

  /** Empurra um círculo (jogador) para fora dos troncos/pedras dos chunks vizinhos. */
  resolveCollision(pos: THREE.Vector3, radius: number): void {
    const s = CONFIG.world.chunkSize;
    const pcx = Math.floor(pos.x / s);
    const pcz = Math.floor(pos.z / s);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.loaded.get(key(pcx + dx, pcz + dz));
        if (!chunk) continue;
        const c = chunk.colliders;
        for (let i = 0; i < c.length; i += 3) {
          const ox = pos.x - c[i];
          const oz = pos.z - c[i + 1];
          const min = c[i + 2] + radius;
          const d2 = ox * ox + oz * oz;
          if (d2 >= min * min || d2 < 1e-10) continue;
          const d = Math.sqrt(d2);
          const push = (min - d) / d;
          pos.x += ox * push;
          pos.z += oz * push;
        }
      }
    }
  }

  /** true se nenhum obstáculo está a menos de `radius` de (x, z). */
  isClear(x: number, z: number, radius: number): boolean {
    const s = CONFIG.world.chunkSize;
    const pcx = Math.floor(x / s);
    const pcz = Math.floor(z / s);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.loaded.get(key(pcx + dx, pcz + dz))?.colliders;
        if (!c) continue;
        for (let i = 0; i < c.length; i += 3) {
          if (Math.hypot(x - c[i], z - c[i + 1]) < radius + c[i + 2]) return false;
        }
      }
    }
    return true;
  }

  private refresh(pos: THREE.Vector3): void {
    const W = CONFIG.world;
    for (const [k, chunk] of this.loaded) {
      if (chunkDistance(pos.x, pos.z, chunk.cx, chunk.cz) > W.unloadDistance) this.release(k, chunk);
    }
    this.queue.length = 0;
    const R = Math.ceil(W.loadDistance / W.chunkSize);
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = this.pcx + dx;
        const cz = this.pcz + dz;
        if (this.loaded.has(key(cx, cz))) continue;
        const d = chunkDistance(pos.x, pos.z, cx, cz);
        if (d <= W.loadDistance) this.queue.push({ cx, cz, d });
      }
    }
    this.queue.sort((a, b) => a.d - b.d);
  }

  /** Etapa 1: terreno. O chunk já conta como carregado, mas só entra na cena após a vegetação. */
  private startLoad(cx: number, cz: number): void {
    const chunk = this.pool.pop() ?? new Chunk(this.terrain, this.vegetation.layers);
    chunk.place(cx, cz);
    chunk.clearContent();
    this.terrain.fillChunkGeometry(chunk.ground.geometry, cx, cz);
    this.loaded.set(key(cx, cz), chunk);
    this.populateQueue.push(chunk);
  }

  /** Etapa 2: vegetação, e o chunk aparece. */
  private finishLoad(chunk: Chunk, pos: THREE.Vector3): void {
    chunk.lod = chunkDistance(pos.x, pos.z, chunk.cx, chunk.cz) < CONFIG.world.lod0Distance ? 0 : 1;
    this.vegetation.populate(chunk);
    this.scene.add(chunk.group);
  }

  private release(k: number, chunk: Chunk): void {
    this.releaseGrass(chunk);
    this.grassQueue.delete(chunk);
    const pending = this.populateQueue.indexOf(chunk);
    if (pending >= 0) this.populateQueue.splice(pending, 1);
    this.scene.remove(chunk.group);
    this.loaded.delete(k);
    this.pool.push(chunk);
  }

  private assignGrass(chunk: Chunk): void {
    const mesh =
      this.grassPool.pop() ?? Chunk.createGrassMesh(this.vegetation.grassGeometry, this.vegetation.grassMaterial);
    this.vegetation.fillGrass(mesh, chunk);
    chunk.group.add(mesh);
    chunk.grass = mesh;
  }

  private releaseGrass(chunk: Chunk): void {
    if (!chunk.grass) return;
    chunk.group.remove(chunk.grass);
    this.grassPool.push(chunk.grass);
    chunk.grass = null;
  }
}
