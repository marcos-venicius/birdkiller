import * as THREE from 'three';
import { CONFIG } from '../config';
import type { TreeKind, TreeRef } from './Chunk';
import type { Terrain } from './Terrain';
import type { Vegetation } from './vegetation/Vegetation';
import type { FelledTree, WorldEdits } from './WorldEdits';

/** Quanto a copa segura a árvore deitada acima do chão (m, em escala 1). */
const CROWN: Record<TreeKind, number> = { conifer: 1.4, broadleaf: 2.6, birch: 1.6, snag: 0.4 };

const _r = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _t2 = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

interface Fall {
  tree: FelledTree;
  mesh: THREE.Mesh;
  start: THREE.Matrix4;
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  angle: number;
  /** Onde a copa bate no chão (som e susto). */
  tip: THREE.Vector3;
  t: number;
  landed: boolean;
}

/** `out` = `src` girada de `angle` em torno do eixo horizontal que passa por `pivot`. */
function rotateAbout(pivot: THREE.Vector3, axis: THREE.Vector3, angle: number, src: THREE.Matrix4, out: THREE.Matrix4): THREE.Matrix4 {
  _r.makeRotationAxis(axis, angle);
  _t.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  _t2.makeTranslation(pivot.x, pivot.y, pivot.z);
  return out.multiplyMatrices(_t2, _r).multiply(_t).multiply(src);
}

/** Madeira que uma árvore em pé rende. */
export function woodFor(ref: TreeRef): number {
  return Math.max(2, Math.round(CONFIG.tools.wood[ref.kind] * ref.scale));
}

/**
 * Aproximação entre o raio (o + s·d, 0 ≤ s ≤ maxS, d normalizado) e o segmento AB: [s, distância entre
 * eles]. Serve para "estou olhando para este tronco?" — mira passando rente ao tronco também conta, e
 * um tronco deitado que a mira só cruzaria além do alcance vale pelo ponto mais perto dentro dele.
 */
export function rayToSegment(
  o: THREE.Vector3,
  d: THREE.Vector3,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  maxS = Infinity,
): [number, number] {
  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;
  const wx = o.x - ax;
  const wy = o.y - ay;
  const wz = o.z - az;
  const b = d.x * vx + d.y * vy + d.z * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const dw = d.x * wx + d.y * wy + d.z * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const den = c - b * b;
  let t = den > 1e-9 ? THREE.MathUtils.clamp((e - b * dw) / den, 0, 1) : 0;
  const s = Math.min(maxS, Math.max(0, b * t - dw));
  t = c > 1e-9 ? THREE.MathUtils.clamp((s * b + e) / c, 0, 1) : 0;
  const px = o.x + d.x * s - (ax + vx * t);
  const py = o.y + d.y * s - (ay + vy * t);
  const pz = o.z + d.z * s - (az + vz * t);
  return [s, Math.hypot(px, py, pz)];
}

/**
 * Árvores derrubadas pelo machado: a queda (gira em torno da base, para o lado oposto ao jogador, até a
 * copa encostar no relevo) e depois deitadas no chão até alguém recolher a madeira. Cada uma é um Mesh
 * com a geometria e o material (com vento) da camada da vegetação — como a árvore gigante do PlaceView —
 * e só as perto do jogador ficam na cena.
 */
export class FelledTrees {
  /** A árvore bateu no chão (posição da copa). */
  onLand?: (tip: THREE.Vector3, tree: FelledTree) => void;
  private readonly meshes = new Map<FelledTree, THREE.Mesh>();
  private readonly falls: Fall[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly vegetation: Vegetation,
    private readonly edits: WorldEdits,
  ) {}

  /** Derruba a árvore em pé (matriz da instância) para longe de `from`. Já entra nas obras deitada. */
  fell(ref: TreeRef, standing: THREE.Matrix4, from: THREE.Vector3): FelledTree {
    const pivot = new THREE.Vector3().setFromMatrixPosition(standing);
    let dx = pivot.x - from.x;
    let dz = pivot.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) {
      dx = 1;
      dz = 0;
    } else {
      dx /= len;
      dz /= len;
    }
    // Girar em torno de (cima × direção) leva o topo da árvore para a direção da queda.
    const axis = new THREE.Vector3().crossVectors(_up, new THREE.Vector3(dx, 0, dz)).normalize();
    const height = ref.top * ref.scale;
    const angle = this.restAngle(pivot, dx, dz, height, CROWN[ref.kind] * ref.scale);
    const tree: FelledTree = {
      id: ref.id,
      layer: ref.layer,
      m: rotateAbout(pivot, axis, angle, standing, _m).toArray(),
      h: ref.top,
      r: ref.radius,
      wood: woodFor(ref),
    };
    this.edits.felled.push(tree);
    const mesh = this.createMesh(tree);
    mesh.matrix.copy(standing);
    const along = Math.sin(angle) * height * 0.7;
    const tip = new THREE.Vector3(pivot.x + dx * along, pivot.y + Math.cos(angle) * height * 0.7, pivot.z + dz * along);
    this.falls.push({ tree, mesh, start: standing.clone(), pivot, axis, angle, tip, t: 0, landed: false });
    return tree;
  }

  /** Recolhida: some do chão e das obras. */
  remove(tree: FelledTree): void {
    const i = this.edits.felled.indexOf(tree);
    if (i >= 0) this.edits.felled.splice(i, 1);
    const f = this.falls.findIndex((x) => x.tree === tree);
    if (f >= 0) this.falls.splice(f, 1);
    this.drop(tree);
  }

  /** Árvore deitada mais perto na mira, até `reach`. */
  nearest(eye: THREE.Vector3, dir: THREE.Vector3, reach: number): { tree: FelledTree; s: number } | null {
    let best: FelledTree | null = null;
    let bestS = Infinity;
    for (const tree of this.meshes.keys()) {
      if (this.falls.some((f) => f.tree === tree)) continue;
      const m = tree.m;
      const len = tree.h * 0.85;
      const [s, dist] = rayToSegment(eye, dir, m[12], m[13], m[14], m[12] + m[4] * len, m[13] + m[5] * len, m[14] + m[6] * len, reach + tree.r);
      if (dist > tree.r + 0.9 || s >= bestS) continue;
      best = tree;
      bestS = s;
    }
    return best ? { tree: best, s: bestS } : null;
  }

  get falling(): number {
    return this.falls.length;
  }

  update(dt: number, focus: THREE.Vector3): void {
    const T = CONFIG.tools;
    // Queda acelerando (u²) e um quique pequeno ao bater no chão.
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.t += dt;
      const u = Math.min(f.t / T.fallTime, 1);
      let a = f.angle * u * u;
      if (u >= 1) {
        if (!f.landed) {
          f.landed = true;
          this.onLand?.(f.tip, f.tree);
        }
        const v = Math.min((f.t - T.fallTime) / 0.45, 1);
        a = f.angle - 0.05 * Math.sin(Math.PI * v) * (1 - v);
        if (v >= 1) {
          this.falls.splice(i, 1);
          f.mesh.matrix.fromArray(f.tree.m);
          f.mesh.matrixWorldNeedsUpdate = true;
          continue;
        }
      }
      rotateAbout(f.pivot, f.axis, a, f.start, f.mesh.matrix);
      f.mesh.matrixWorldNeedsUpdate = true;
    }
    // Deitadas: só as perto do jogador ficam na cena.
    const max = T.felledViewDistance;
    for (const tree of this.edits.felled) {
      const near = Math.hypot(tree.m[12] - focus.x, tree.m[14] - focus.z) < max;
      const has = this.meshes.has(tree);
      if (near && !has) this.createMesh(tree);
      else if (!near && has && !this.falls.some((f) => f.tree === tree)) this.drop(tree);
    }
  }

  /** Ângulo da queda: vai deitando até o meio do tronco ou a copa encostarem no relevo. */
  private restAngle(pivot: THREE.Vector3, dx: number, dz: number, height: number, crown: number): number {
    for (let deg = 30; deg < 88; deg += 2) {
      const a = THREE.MathUtils.degToRad(deg);
      for (const [f, lift] of [
        [0.5, 0.3],
        [0.8, crown],
        [1, crown * 0.6],
      ] as const) {
        const along = Math.sin(a) * height * f;
        const y = pivot.y + Math.cos(a) * height * f;
        if (y < this.terrain.heightAt(pivot.x + dx * along, pivot.z + dz * along) + lift) return a;
      }
    }
    return THREE.MathUtils.degToRad(88);
  }

  private createMesh(tree: FelledTree): THREE.Mesh {
    const layer = this.vegetation.layers[tree.layer];
    const mesh = new THREE.Mesh(layer.lod0, layer.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.fromArray(tree.m);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (layer.depthMaterial) mesh.customDepthMaterial = layer.depthMaterial;
    this.scene.add(mesh);
    this.meshes.set(tree, mesh);
    return mesh;
  }

  private drop(tree: FelledTree): void {
    const mesh = this.meshes.get(tree);
    if (!mesh) return;
    // Geometria e material são da vegetação (compartilhados): não descarta nada.
    this.scene.remove(mesh);
    this.meshes.delete(tree);
  }
}
