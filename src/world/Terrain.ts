import * as THREE from 'three';
import { CONFIG } from '../config';
import { Simplex2 } from '../core/noise';
import { mulberry32 } from '../core/rng';

const GRASS = new THREE.Color(0x5f6e37);
const DRY_GRASS = new THREE.Color(0x857a42);
const LITTER = new THREE.Color(0x6a5234);
const DIRT = new THREE.Color(0x755c40);

const _color = new THREE.Color();
const _normal = new THREE.Vector3();

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Relevo procedural contínuo e infinito: heightAt() é a fonte única de verdade,
 * usada tanto pelas malhas dos chunks quanto pela física do jogador.
 */
export class Terrain {
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  private readonly hills: Simplex2;
  private readonly detail: Simplex2;
  private readonly fine: Simplex2;
  private readonly patches: Simplex2;

  constructor(seed: number) {
    const rand = mulberry32(seed);
    this.hills = new Simplex2(rand);
    this.detail = new Simplex2(rand);
    this.fine = new Simplex2(rand);
    this.patches = new Simplex2(rand);
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

  /** Malha do chunk (cx, cz), em coordenadas locais; posicione o Mesh em (cx*size, 0, cz*size). */
  buildChunkGeometry(cx: number, cz: number): THREE.BufferGeometry {
    const size = CONFIG.world.chunkSize;
    const res = CONFIG.world.chunkResolution;
    const step = size / res;
    const verts = res + 1;
    const positions = new Float32Array(verts * verts * 3);
    const normals = new Float32Array(verts * verts * 3);
    const colors = new Float32Array(verts * verts * 3);
    const ox = cx * size;
    const oz = cz * size;

    for (let iz = 0, v = 0; iz < verts; iz++) {
      for (let ix = 0; ix < verts; ix++, v += 3) {
        const lx = ix * step;
        const lz = iz * step;
        const wx = ox + lx;
        const wz = oz + lz;

        positions[v] = lx;
        positions[v + 1] = this.heightAt(wx, wz);
        positions[v + 2] = lz;

        const n = this.normalAt(wx, wz, _normal, step);
        normals[v] = n.x;
        normals[v + 1] = n.y;
        normals[v + 2] = n.z;

        const slope = 1 - n.y;
        const patch = this.patches.fbm(wx * 0.03, wz * 0.03, 2) * 0.5 + 0.5;
        const litter = this.patches.noise(wx * 0.011 + 97, wz * 0.011 - 41) * 0.5 + 0.5;
        _color
          .copy(GRASS)
          .lerp(DRY_GRASS, smoothstep(0.5, 0.85, patch))
          .lerp(LITTER, smoothstep(0.55, 0.8, litter) * 0.8)
          .lerp(DIRT, smoothstep(0.06, 0.2, slope));
        const jitter = 0.92 + this.fine.noise(wx * 0.5, wz * 0.5) * 0.08;
        colors[v] = _color.r * jitter;
        colors[v + 1] = _color.g * jitter;
        colors[v + 2] = _color.b * jitter;
      }
    }

    const indices = new Uint16Array(res * res * 6);
    for (let iz = 0, i = 0; iz < res; iz++) {
      for (let ix = 0; ix < res; ix++, i += 6) {
        const a = iz * verts + ix;
        const b = a + 1;
        const c = a + verts;
        const d = c + 1;
        indices[i] = a;
        indices[i + 1] = c;
        indices[i + 2] = b;
        indices[i + 3] = b;
        indices[i + 4] = c;
        indices[i + 5] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  createChunkMesh(cx: number, cz: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.buildChunkGeometry(cx, cz), this.material);
    mesh.position.set(cx * CONFIG.world.chunkSize, 0, cz * CONFIG.world.chunkSize);
    // O relevo não projeta sombra: com o sol baixo, a borda do mapa de sombras ficaria visível nas colinas.
    // O sombreamento das encostas vem do NdotL; a vegetação (Etapa 2) é quem projeta sombras.
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}
