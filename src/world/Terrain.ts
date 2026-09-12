import * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep } from '../core/math';
import { Simplex2 } from '../core/noise';
import { mulberry32 } from '../core/rng';
import { ForestGrid, type Biome } from './Biome';

const GRASS = new THREE.Color(0x5f6e37);
const DRY_GRASS = new THREE.Color(0x857a42);
const LITTER = new THREE.Color(0x6a5234);
const DIRT = new THREE.Color(0x755c40);

const _color = new THREE.Color();
/** Acima disto nenhum morro chega (amplitudes 18 + 4 + 0,25 m). */
const MAX_HEIGHT = 23;

/**
 * Relevo procedural contínuo e infinito: heightAt() é a fonte única de verdade,
 * usada tanto pelas malhas dos chunks quanto pela física e pela vegetação.
 */
export class Terrain {
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });

  private readonly hills: Simplex2;
  private readonly detail: Simplex2;
  private readonly fine: Simplex2;
  private readonly patches: Simplex2;
  /** Índices idênticos para todos os chunks — um único buffer compartilhado. */
  private readonly index: THREE.BufferAttribute;
  /** Alturas da grade com uma borda extra (para as normais), reaproveitadas entre chunks. */
  private readonly heights: Float32Array;
  private readonly forest: ForestGrid;

  constructor(seed: number, biome: Biome) {
    this.forest = new ForestGrid(biome);
    const rand = mulberry32(seed);
    this.hills = new Simplex2(rand);
    this.detail = new Simplex2(rand);
    this.fine = new Simplex2(rand);
    this.patches = new Simplex2(rand);

    const res = CONFIG.world.chunkResolution;
    const verts = res + 1;
    const indices = new Uint16Array(res * res * 6);
    for (let iz = 0, i = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++, i += 6) {
        const a = iz * verts + ix;
        const b = a + 1;
        const c = a + verts;
        const d = c + 1;
        indices.set([a, c, b, b, c, d], i);
      }
    }
    this.index = new THREE.BufferAttribute(indices, 1);
    this.heights = new Float32Array((res + 3) * (res + 3));
  }

  heightAt(x: number, z: number): number {
    const big = this.hills.fbm(x * 0.0025, z * 0.0025, 3);
    const mid = this.detail.fbm(x * 0.012, z * 0.012, 3);
    const small = this.fine.noise(x * 0.08, z * 0.08);
    return big * 18 + mid * 4 + small * 0.25;
  }

  /** Normal por diferenças finitas — idêntica nas bordas de chunks vizinhos (sem costuras). */
  normalAt(x: number, z: number, out: THREE.Vector3, eps = 0.5): THREE.Vector3 {
    const hL = this.heightAt(x - eps, z);
    const hR = this.heightAt(x + eps, z);
    const hD = this.heightAt(x, z - eps);
    const hU = this.heightAt(x, z + eps);
    return out.set(hL - hR, 2 * eps, hD - hU).normalize();
  }

  /** Geometria vazia de chunk (x/z locais já preenchidos); o conteúdo vem de fillChunkGeometry. */
  createChunkGeometry(): THREE.BufferGeometry {
    const res = CONFIG.world.chunkResolution;
    const step = CONFIG.world.chunkSize / res;
    const verts = res + 1;
    const positions = new Float32Array(verts * verts * 3);
    for (let iz = 0, v = 0; iz < verts; iz++) {
      for (let ix = 0; ix < verts; ix++, v += 3) {
        positions[v] = ix * step;
        positions[v + 2] = iz * step;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * verts * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * verts * 3), 3));
    geo.setIndex(this.index);
    return geo;
  }

  /** Reescreve alturas, normais e cores da geometria para o chunk (cx, cz). */
  fillChunkGeometry(geo: THREE.BufferGeometry, cx: number, cz: number): void {
    const size = CONFIG.world.chunkSize;
    const res = CONFIG.world.chunkResolution;
    const step = size / res;
    const verts = res + 1;
    const stride = res + 3;
    const ox = cx * size;
    const oz = cz * size;
    const H = this.heights;

    for (let iz = -1; iz <= verts; iz++) {
      for (let ix = -1; ix <= verts; ix++) {
        H[(iz + 1) * stride + ix + 1] = this.heightAt(ox + ix * step, oz + iz * step);
      }
    }

    this.forest.fill(ox, oz);
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const nrmAttr = geo.getAttribute('normal') as THREE.BufferAttribute;
    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const normals = nrmAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;

    for (let iz = 0, v = 0; iz < verts; iz++) {
      for (let ix = 0; ix < verts; ix++, v += 3) {
        const p = (iz + 1) * stride + ix + 1;
        positions[v + 1] = H[p];

        let nx = H[p - 1] - H[p + 1];
        let ny = 2 * step;
        let nz = H[p - stride] - H[p + stride];
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
        normals[v] = nx;
        normals[v + 1] = ny;
        normals[v + 2] = nz;

        const wx = ox + ix * step;
        const wz = oz + iz * step;
        const slope = 1 - ny;
        const forest = this.forest.at(ix * step, iz * step);
        const patch = this.patches.fbm(wx * 0.03, wz * 0.03, 2) * 0.5 + 0.5;
        const litterNoise = this.patches.noise(wx * 0.011 + 97, wz * 0.011 - 41) * 0.5 + 0.5;
        // Clareiras = grama; mata fechada = folhas caídas; encostas = terra.
        const litter = Math.min(1, smoothstep(0.35, 0.85, forest) * 0.8 + smoothstep(0.6, 0.85, litterNoise) * 0.4);
        _color
          .copy(GRASS)
          .lerp(DRY_GRASS, smoothstep(0.5, 0.85, patch))
          .lerp(LITTER, litter)
          .lerp(DIRT, smoothstep(0.06, 0.2, slope));
        const jitter = 0.92 + this.fine.noise(wx * 0.5, wz * 0.5) * 0.08;
        colors[v] = _color.r * jitter;
        colors[v + 1] = _color.g * jitter;
        colors[v + 2] = _color.b * jitter;
      }
    }

    posAttr.needsUpdate = true;
    nrmAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  /**
   * Altura exata da malha renderizada de um chunk (interpolação no triângulo), em coordenadas
   * locais — mais barata que heightAt() e garante que objetos pequenos fiquem rente ao chão visível.
   */
  meshHeight(geo: THREE.BufferGeometry, lx: number, lz: number): number {
    const res = CONFIG.world.chunkResolution;
    const step = CONFIG.world.chunkSize / res;
    const verts = res + 1;
    const y = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const fx = lx / step;
    const fz = lz / step;
    const ix = Math.min(Math.max(Math.floor(fx), 0), res - 1);
    const iz = Math.min(Math.max(Math.floor(fz), 0), res - 1);
    const tx = fx - ix;
    const tz = fz - iz;
    const a = iz * verts + ix;
    const ya = y[a * 3 + 1];
    const yb = y[(a + 1) * 3 + 1];
    const yc = y[(a + verts) * 3 + 1];
    const yd = y[(a + verts + 1) * 3 + 1];
    // Mesma diagonal (b–c) usada nos índices: triângulos (a, c, b) e (b, c, d).
    return tx + tz <= 1 ? ya + (yb - ya) * tx + (yc - ya) * tz : yd + (yc - yd) * (1 - tx) + (yb - yd) * (1 - tz);
  }

  /** Distância até o raio (d normalizado) tocar o relevo, ou Infinity. Marcha em passos + bisseção. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number, step = 1): number {
    let prev = 0;
    for (let t = step; t <= maxT; t += step) {
      const y = o.y + d.y * t;
      if (d.y >= 0 && y > MAX_HEIGHT) break;
      if (y < this.heightAt(o.x + d.x * t, o.z + d.z * t)) {
        let a = prev;
        let b = t;
        for (let i = 0; i < 10; i++) {
          const m = (a + b) * 0.5;
          if (o.y + d.y * m < this.heightAt(o.x + d.x * m, o.z + d.z * m)) b = m;
          else a = m;
        }
        return b;
      }
      prev = t;
    }
    return Infinity;
  }
}
