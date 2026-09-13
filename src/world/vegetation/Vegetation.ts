import * as THREE from 'three';
import { CONFIG } from '../../config';
import { TAU } from '../../core/math';
import { hash2, mulberry32 } from '../../core/rng';
import { ForestGrid, type Biome } from '../Biome';
import type { Chunk } from '../Chunk';
import { commitInstances } from '../Chunk';
import type { Terrain } from '../Terrain';
import * as G from './geometries';
import { applyWind } from './wind';

/** Uma camada de vegetação = um InstancedMesh por chunk. */
export interface LayerDef {
  name: string;
  lod0: THREE.BufferGeometry;
  /** Geometria simplificada para chunks distantes; null = oculta ao longe. */
  lod1: THREE.BufferGeometry | null;
  material: THREE.Material;
  depthMaterial?: THREE.Material;
  capacity: number;
  castShadow: boolean;
}

export const LAYER = {
  conifer: 0,
  broadleaf: 1,
  birch: 2,
  snag: 3,
  bush: 4,
  fern: 5,
  rock: 6,
  log: 7,
  stump: 8,
  debris: 9,
} as const;

interface Species {
  layer: number;
  /** Raio do tronco na base (colisão), em escala 1. */
  radius: number;
  /** Ponto de pouso no alto da copa (espaço da árvore, escala 1), com folga para ficar à vista. */
  perch: [number, number, number];
  /** Altura do tronco para a oclusão do tiro (escala 1), um pouco abaixo do poleiro. */
  trunkTop: number;
  minScale: number;
  maxScale: number;
}

const SPECIES: Record<'conifer' | 'broadleaf' | 'birch' | 'snag', Species> = {
  // Pontas: conífera = ponta do último cone; copa/bétula = topo da bola de folhas mais alta; seca = topo do tronco.
  conifer: { layer: LAYER.conifer, radius: 0.32, perch: [0, 13.35, 0], trunkTop: 12.3, minScale: 0.7, maxScale: 1.5 },
  broadleaf: { layer: LAYER.broadleaf, radius: 0.42, perch: [-0.2, 10.45, 0.5], trunkTop: 6.0, minScale: 0.75, maxScale: 1.35 },
  birch: { layer: LAYER.birch, radius: 0.2, perch: [-0.4, 10.3, 0.3], trunkTop: 9.6, minScale: 0.8, maxScale: 1.25 },
  snag: { layer: LAYER.snag, radius: 0.34, perch: [0, 8.02, 0], trunkTop: 7.7, minScale: 0.75, maxScale: 1.2 },
};

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _tint = new THREE.Color();

/** Tinta multiplicativa em torno do branco: brilho ± brightness/2, deslocamento quente/frio ± warmth. */
function tint(rand: () => number, brightness: number, warmth: number): THREE.Color {
  const b = 1 - brightness / 2 + rand() * brightness;
  const w = (rand() * 2 - 1) * warmth;
  return _tint.setRGB(b * (1 + w), b, b * (1 - w));
}

/** Espalha a vegetação de cada chunk de forma determinística (mesma seed → mesma floresta). */
export class Vegetation {
  readonly layers: LayerDef[];
  readonly grassGeometry: THREE.BufferGeometry;
  readonly grassMaterial: THREE.Material;
  private readonly forestGrid: ForestGrid;

  constructor(
    private readonly terrain: Terrain,
    private readonly biome: Biome,
    private readonly seed: number,
  ) {
    this.forestGrid = new ForestGrid(biome);
    const solid = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
    const treeWind = { strength: 0.22, height: 12 };
    const tree = applyWind(new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true }), treeWind);
    const treeDepth = applyWind(new THREE.MeshDepthMaterial(), treeWind);
    const bush = applyWind(new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true }), { strength: 0.05, height: 1.2 });
    // Samambaia e grama já trazem as faces de trás na geometria (FrontSide, normais para cima).
    const plant = applyWind(new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true }), {
      strength: 0.07,
      height: 0.5,
      fadeStart: 45,
      fadeEnd: 62,
    });
    const rock = G.rock();
    const log = G.log();
    const trees = CONFIG.vegetation.treeCells ** 2;

    this.layers = [
      { name: 'conifer', lod0: G.conifer(0), lod1: G.conifer(1), material: tree, depthMaterial: treeDepth, capacity: trees, castShadow: true },
      { name: 'broadleaf', lod0: G.broadleaf(0), lod1: G.broadleaf(1), material: tree, depthMaterial: treeDepth, capacity: trees, castShadow: true },
      { name: 'birch', lod0: G.birch(0), lod1: G.birch(1), material: tree, depthMaterial: treeDepth, capacity: trees, castShadow: true },
      { name: 'snag', lod0: G.snag(0), lod1: G.snag(1), material: tree, depthMaterial: treeDepth, capacity: trees, castShadow: true },
      { name: 'bush', lod0: G.bush(0), lod1: G.bush(1), material: bush, capacity: 90, castShadow: true },
      { name: 'fern', lod0: G.fern(), lod1: null, material: plant, capacity: 120, castShadow: false },
      { name: 'rock', lod0: rock, lod1: rock, material: solid, capacity: 48, castShadow: true },
      { name: 'log', lod0: log, lod1: log, material: solid, capacity: 8, castShadow: true },
      { name: 'stump', lod0: G.stump(), lod1: null, material: solid, capacity: 10, castShadow: true },
      { name: 'debris', lod0: G.debris(), lod1: null, material: solid, capacity: 50, castShadow: false },
    ];

    const gd = CONFIG.world.grassDistance;
    this.grassGeometry = G.grassTuft();
    this.grassMaterial = applyWind(new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true }), {
      strength: 0.09,
      height: 0.55,
      fadeStart: gd - 16,
      fadeEnd: gd - 2,
    });
  }

  populate(chunk: Chunk): void {
    const size = CONFIG.world.chunkSize;
    const ox = chunk.cx * size;
    const oz = chunk.cz * size;
    const rand = mulberry32(hash2(chunk.cx, chunk.cz, this.seed));
    const terrain = this.terrain;
    const biome = this.biome;
    chunk.clearContent();

    // Árvores: grade com jitter (no máximo uma por célula), aceitas conforme a densidade da mata.
    const cells = CONFIG.vegetation.treeCells;
    const cell = size / cells;
    for (let gz = 0; gz < cells; gz++) {
      for (let gx = 0; gx < cells; gx++) {
        const x = ox + (gx + 0.1 + rand() * 0.8) * cell;
        const z = oz + (gz + 0.1 + rand() * 0.8) * cell;
        const forest = biome.forest(x, z);
        if (rand() > forest * 0.85) continue;
        if (!terrain.open(x, z, 1)) continue;
        const conif = biome.conifer(x, z);
        const pick = rand();
        const sp =
          pick < 0.035
            ? SPECIES.snag
            : pick < 0.035 + 0.14 * (1 - conif)
              ? SPECIES.birch
              : rand() < conif
                ? SPECIES.conifer
                : SPECIES.broadleaf;
        const s = sp.minScale + rand() * (sp.maxScale - sp.minScale);
        const sxz = s * (0.85 + rand() * 0.3);
        const y = terrain.heightAt(x, z) - 0.2;
        const autumn = sp === SPECIES.broadleaf && rand() < 0.06;
        const c = autumn ? _tint.setRGB(1.2, 1.0, 0.7).multiplyScalar(0.85 + rand() * 0.2) : tint(rand, 0.3, 0.06);
        if (!this.put(chunk, sp.layer, x, y, z, rand() * TAU, sxz, s, sxz, c, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.06)) {
          continue;
        }
        chunk.colliders.push(x, z, sp.radius * sxz + 0.05);
        chunk.trunks.push(x, z, sp.radius * sxz, y + sp.trunkTop * s);
        // Topo da copa pela mesma matriz da instância (inclui escala e inclinação).
        _p.fromArray(sp.perch).applyMatrix4(_m);
        chunk.perches.push(_p.x, _p.y, _p.z);
      }
    }

    // Arbustos: mais comuns nas bordas das clareiras.
    const bushes = 24 + Math.floor(rand() * 30);
    for (let i = 0; i < bushes; i++) {
      const x = ox + rand() * size;
      const z = oz + rand() * size;
      const f = biome.forest(x, z);
      const edge = f * (1 - f) * 4;
      if (rand() > 0.15 + 0.55 * edge + 0.25 * f) continue;
      if (!terrain.open(x, z, 0.3)) continue;
      const s = 0.6 + rand() * 1.0;
      this.put(chunk, LAYER.bush, x, terrain.heightAt(x, z) - 0.1, z, rand() * TAU, s * (0.9 + rand() * 0.3), s, s * (0.9 + rand() * 0.3), tint(rand, 0.3, 0.08));
    }

    // Samambaias: sub-bosque da mata.
    for (let i = 0; i < 100; i++) {
      const x = ox + rand() * size;
      const z = oz + rand() * size;
      if (rand() > biome.forest(x, z) * 0.8) continue;
      if (!terrain.open(x, z, 0.25)) continue;
      const s = 0.6 + rand() * 0.7;
      this.put(chunk, LAYER.fern, x, terrain.heightAt(x, z) - 0.02, z, rand() * TAU, s, s, s, tint(rand, 0.3, 0.1));
    }

    // Pedras: alguns agrupamentos (às vezes com uma pedra grande) e pedrinhas soltas.
    const clusters = rand() < 0.7 ? 1 + Math.floor(rand() * 3) : 0;
    for (let c = 0; c < clusters; c++) {
      const cx = ox + rand() * size;
      const cz = oz + rand() * size;
      const n = 1 + Math.floor(rand() * 4);
      const big = rand() < 0.3;
      for (let k = 0; k < n; k++) {
        const x = cx + (rand() - 0.5) * 6;
        const z = cz + (rand() - 0.5) * 6;
        const s = big && k === 0 ? 1.2 + rand() * 1.2 : 0.25 + rand() * rand() * 0.9;
        this.putRock(chunk, rand, x, z, s);
      }
    }
    for (let i = 0; i < 6; i++) {
      if (rand() > 0.6) continue;
      this.putRock(chunk, rand, ox + rand() * size, oz + rand() * size, 0.12 + rand() * 0.23);
    }

    // Troncos caídos, inclinados conforme o relevo.
    for (let i = 0; i < 3; i++) {
      const x = ox + rand() * size;
      const z = oz + rand() * size;
      if (rand() > biome.forest(x, z) * 0.6) continue;
      if (!terrain.open(x, z, 0.4)) continue;
      const len = 3 + rand() * 5;
      const rs = 0.7 + rand() * 0.7;
      const yaw = rand() * TAU;
      const dx = Math.cos(yaw);
      const dz = -Math.sin(yaw);
      const h1 = terrain.heightAt(x - dx * len * 0.5, z - dz * len * 0.5);
      const h2 = terrain.heightAt(x + dx * len * 0.5, z + dz * len * 0.5);
      const y = (h1 + h2) * 0.5 + 0.3 * rs * 0.6;
      this.put(chunk, LAYER.log, x, y, z, yaw, len, rs, rs, tint(rand, 0.25, 0.06), 0, Math.atan2(h2 - h1, len));
    }

    // Tocos.
    for (let i = 0; i < 3; i++) {
      const x = ox + rand() * size;
      const z = oz + rand() * size;
      if (rand() > biome.forest(x, z) * 0.5) continue;
      if (!terrain.open(x, z, 0.4)) continue;
      const s = 0.7 + rand() * 0.6;
      const y = terrain.heightAt(x, z) - 0.05;
      this.put(chunk, LAYER.stump, x, y, z, rand() * TAU, s, s, s, tint(rand, 0.25, 0.06));
      chunk.colliders.push(x, z, 0.42 * s);
      chunk.trunks.push(x, z, 0.42 * s, y + 0.6 * s);
    }

    // Galhos secos no chão.
    for (let i = 0; i < 40; i++) {
      const x = ox + rand() * size;
      const z = oz + rand() * size;
      if (rand() > biome.forest(x, z) * 0.9) continue;
      if (!terrain.open(x, z, 0.15)) continue;
      const s = 0.7 + rand() * 0.6;
      this.put(chunk, LAYER.debris, x, terrain.heightAt(x, z) + 0.01, z, rand() * TAU, s, s, s, tint(rand, 0.3, 0.05));
    }

    chunk.finishContent();
  }

  /** Preenche um InstancedMesh de grama para o chunk: densa nas clareiras, rala na mata. */
  fillGrass(mesh: THREE.InstancedMesh, chunk: Chunk): void {
    const size = CONFIG.world.chunkSize;
    const ox = chunk.cx * size;
    const oz = chunk.cz * size;
    const rand = mulberry32(hash2(chunk.cx, chunk.cz, this.seed ^ 0x5bd1e995));
    const ground = chunk.ground.geometry;
    const grid = this.forestGrid;
    grid.fill(ox, oz);
    const attempts = CONFIG.vegetation.grassPerChunk;
    const mat = mesh.instanceMatrix.array as Float32Array;
    const col = mesh.instanceColor!.array as Float32Array;
    let minY = Infinity;
    let maxY = -Infinity;
    let n = 0;
    for (let i = 0; i < attempts; i++) {
      const lx = rand() * size;
      const lz = rand() * size;
      const open = 1 - grid.at(lx, lz);
      if (rand() > 0.15 + 0.85 * open) continue;
      if (!this.terrain.open(ox + lx, oz + lz, 0.1)) continue;
      const s = (0.7 + rand() * 0.6) * (0.85 + open * 0.4);
      const yaw = rand() * TAU;
      const sy = s * (0.8 + rand() * 0.5);
      const y = this.terrain.meshHeight(ground, lx, lz) - 0.03;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      // Matriz escrita direto no buffer (coluna a coluna): translação · rotação em Y · escala.
      // Bem mais barato que compose() + setMatrixAt() para milhares de tufos.
      const cs = Math.cos(yaw) * s;
      const sn = Math.sin(yaw) * s;
      const o = n * 16;
      mat[o] = cs;
      mat[o + 1] = 0;
      mat[o + 2] = -sn;
      mat[o + 3] = 0;
      mat[o + 4] = 0;
      mat[o + 5] = sy;
      mat[o + 6] = 0;
      mat[o + 7] = 0;
      mat[o + 8] = sn;
      mat[o + 9] = 0;
      mat[o + 10] = cs;
      mat[o + 11] = 0;
      mat[o + 12] = ox + lx;
      mat[o + 13] = y;
      mat[o + 14] = oz + lz;
      mat[o + 15] = 1;
      const c = tint(rand, 0.3, 0.12);
      col[n * 3] = c.r;
      col[n * 3 + 1] = c.g;
      col[n * 3 + 2] = c.b;
      n++;
    }
    mesh.count = n;
    // Volume de culling pelo próprio chunk, sem percorrer as instâncias.
    const sphere = (mesh.boundingSphere ??= new THREE.Sphere());
    if (n > 0) {
      sphere.center.set(ox + size / 2, (minY + maxY) / 2, oz + size / 2);
      sphere.radius = Math.hypot(size * 0.71, (maxY - minY) / 2 + 1);
    } else {
      sphere.makeEmpty();
    }
    commitInstances(mesh, false);
  }

  private putRock(chunk: Chunk, rand: () => number, x: number, z: number, s: number): void {
    const sy = s * (0.55 + rand() * 0.45);
    if (!this.terrain.open(x, z, 0.1)) return;
    const y = this.terrain.heightAt(x, z) - sy * 0.3;
    this.put(chunk, LAYER.rock, x, y, z, rand() * TAU, s * (0.8 + rand() * 0.4), sy, s * (0.8 + rand() * 0.4), tint(rand, 0.25, 0.05), (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5);
    if (s > 0.6) chunk.colliders.push(x, z, s * 0.75);
    if (s > 0.35) chunk.rocks.push(x, y, z, s * 0.85);
  }

  private put(
    chunk: Chunk,
    layer: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.Color,
    tiltX = 0,
    tiltZ = 0,
  ): boolean {
    const mesh = chunk.layers[layer];
    if (mesh.count >= this.layers[layer].capacity) return false;
    _p.set(x, y, z);
    _q.setFromEuler(_e.set(tiltX, yaw, tiltZ, 'YXZ'));
    _s.set(sx, sy, sz);
    mesh.setMatrixAt(mesh.count, _m.compose(_p, _q, _s));
    mesh.setColorAt(mesh.count, color);
    mesh.count++;
    return true;
  }
}
