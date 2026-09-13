import * as THREE from 'three';
import { merge, paint, solid } from '../animals/quadrupedModel';
import { CONFIG } from '../config';
import type { Place, Places } from './Places';
import type { Terrain } from './Terrain';
import { LAYER, type Vegetation } from './vegetation/Vegetation';

const WOOD = 0x6e5438;
const WOOD_DARK = 0x4d3a27;
const WOOD_GRAY = 0x6a6258;
const ROOF = 0x3b3833;
const STONE = 0x6f6b64;

/** Caixa pintada, já girada (em graus de liberdade simples) e posicionada no espaço local. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return paint(g, solid(color), 0.12);
}

/**
 * Desenho dos lugares para descobrir (torre de caça, cabana, árvore gigante): uma malha por lugar
 * perto do jogador, feita na hora e descartada ao se afastar. A árvore gigante reaproveita a copa
 * da vegetação comum, só que três vezes maior — com o mesmo vento.
 */
export class PlaceView {
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });
  private readonly active = new Map<Place, THREE.Object3D>();
  private readonly found: Place[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly places: Places,
    private readonly terrain: Terrain,
    private readonly vegetation: Vegetation,
  ) {}

  /**
   * Confere a cada quadro quais lugares estão no alcance (barato: poucas células em cache) — assim nem
   * um teleporte deixa o lugar sem desenho; só a construção da malha, que é cara, acontece sob demanda.
   */
  update(focus: THREE.Vector3): void {
    this.places.near(focus.x, focus.z, CONFIG.places.viewDistance, this.found);
    for (const [place, obj] of this.active) {
      if (this.found.includes(place)) continue;
      this.scene.remove(obj);
      obj.traverse((o) => {
        // A árvore usa a geometria compartilhada da vegetação: essa não pode ser descartada.
        if (o instanceof THREE.Mesh && o.userData.own) o.geometry.dispose();
      });
      this.active.delete(place);
    }
    for (const place of this.found) if (!this.active.has(place)) this.add(place);
  }

  private add(place: Place): void {
    const group = new THREE.Group();
    group.position.set(place.x, place.type === 'cabin' ? place.floorY : place.y, place.z);
    // O giro do Place (cos/sin) corresponde a girar -yaw em torno de Y no Three.
    group.rotation.y = -place.yaw;
    if (place.type === 'giantTree') {
      const layer = this.vegetation.layers[LAYER.broadleaf];
      const s = CONFIG.places.giantTreeScale;
      const tree = new THREE.Mesh(layer.lod0, layer.material);
      tree.scale.setScalar(s);
      tree.position.y = -0.6;
      tree.castShadow = true;
      tree.receiveShadow = true;
      if (layer.depthMaterial) tree.customDepthMaterial = layer.depthMaterial;
      group.add(tree);
    } else {
      const geo = place.type === 'tower' ? this.tower(place) : this.cabin();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.own = true;
      group.add(mesh);
    }
    group.updateMatrixWorld(true);
    this.scene.add(group);
    this.active.set(place, group);
  }

  /** Chão sob um ponto local do lugar, relativo à base (as pernas da torre descem até ele). */
  private groundLocal(place: Place, lx: number, lz: number): number {
    const c = Math.cos(place.yaw);
    const s = Math.sin(place.yaw);
    return this.terrain.heightAt(place.x + lx * c - lz * s, place.z + lx * s + lz * c) - place.y;
  }

  private tower(place: Place): THREE.BufferGeometry {
    const H = place.floorY - place.y;
    const parts: THREE.BufferGeometry[] = [];
    // Pernas até o chão de cada uma, e o travamento em X nos quatro lados.
    for (const [lx, lz] of [
      [-1.4, -1.4],
      [1.4, -1.4],
      [-1.4, 1.4],
      [1.4, 1.4],
    ]) {
      const g = this.groundLocal(place, lx, lz) - 0.3;
      const len = H - g;
      parts.push(box(0.2, len, 0.2, lx, g + len / 2, lz, WOOD_DARK));
    }
    const braceH = H * 0.62;
    const braceLen = Math.hypot(2.8, braceH);
    const braceAng = Math.atan2(2.8, braceH);
    for (const side of [-1, 1]) {
      for (const dir of [-1, 1]) {
        parts.push(box(0.1, braceLen, 0.1, 0, H * 0.18 + braceH / 2, side * 1.42, WOOD_GRAY, 0, 0, dir * braceAng));
        parts.push(box(0.1, braceLen, 0.1, side * 1.42, H * 0.18 + braceH / 2, 0, WOOD_GRAY, dir * braceAng, 0, 0));
      }
    }
    // Plataforma, grade (aberta no lado da escada, +Z) e telhado de quatro águas.
    parts.push(box(3.5, 0.16, 3.5, 0, H, 0, WOOD));
    for (const yRail of [H + 0.5, H + 1.0]) {
      parts.push(box(3.4, 0.08, 0.08, 0, yRail, -1.66, WOOD));
      parts.push(box(0.08, 0.08, 3.4, -1.66, yRail, 0, WOOD));
      parts.push(box(0.08, 0.08, 3.4, 1.66, yRail, 0, WOOD));
      parts.push(box(1.2, 0.08, 0.08, -1.1, yRail, 1.66, WOOD));
      parts.push(box(1.2, 0.08, 0.08, 1.1, yRail, 1.66, WOOD));
    }
    for (const [lx, lz] of [
      [-1.66, -1.66],
      [1.66, -1.66],
      [-1.66, 1.66],
      [1.66, 1.66],
    ]) {
      parts.push(box(0.12, 2.35, 0.12, lx, H + 1.18, lz, WOOD_DARK));
    }
    const roof = new THREE.ConeGeometry(2.7, 1.2, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, H + 2.35 + 0.6, 0);
    parts.push(paint(roof, solid(ROOF), 0.1));
    // Escada inclinada: do chão (z = 2,55) até a abertura da plataforma (z = 1,72).
    const g0 = this.groundLocal(place, 0, 2.55) - 0.1;
    const dy = H + 0.9 - g0;
    const dz = -0.83;
    const railLen = Math.hypot(dy, dz);
    const tilt = Math.atan2(dz, dy);
    for (const sx of [-0.4, 0.4]) parts.push(box(0.08, railLen, 0.08, sx, g0 + dy / 2, 2.55 + dz / 2, WOOD_DARK, tilt));
    for (let t = 0.3; t < dy - 0.2; t += 0.34) {
      parts.push(box(0.8, 0.05, 0.06, 0, g0 + t, 2.55 + (dz * t) / dy, WOOD));
    }
    return merge(parts);
  }

  /** Cabana de toras, 5 × 4 m, com porta no lado +Z, janelas nas laterais, telhado de duas águas e chaminé. */
  private cabin(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    // Base de pedra (desce bem, para esconder o desnível do terreno) e assoalho.
    parts.push(box(5.4, 1.7, 4.4, 0, -0.84, 0, STONE));
    parts.push(box(5.0, 0.06, 4.0, 0, 0.03, 0, WOOD_GRAY));
    parts.push(box(1.2, 0.3, 0.6, 0, -0.15, 2.45, STONE));
    // Paredes de toras (0,3 m cada), alternando o tom.
    for (let k = 0; k < 8; k++) {
      const y = 0.15 + k * 0.3;
      const c = k % 2 === 0 ? WOOD : WOOD_DARK;
      parts.push(box(5.2, 0.28, 0.24, 0, y, -2.0, c));
      const window = y > 0.8 && y < 1.6;
      for (const sx of [-2.5, 2.5]) {
        if (window) {
          parts.push(box(0.24, 0.28, 1.5, sx, y, -1.3, c));
          parts.push(box(0.24, 0.28, 1.5, sx, y, 1.3, c));
        } else {
          parts.push(box(0.24, 0.28, 4.2, sx, y, 0, c));
        }
      }
      if (y < 2.0) {
        parts.push(box(2.1, 0.28, 0.24, -1.55, y, 2.0, c));
        parts.push(box(2.1, 0.28, 0.24, 1.55, y, 2.0, c));
      } else {
        parts.push(box(5.2, 0.28, 0.24, 0, y, 2.0, c));
      }
    }
    // Oitões (triângulos nas laterais) e as duas águas do telhado.
    const gable = new THREE.BufferGeometry();
    const tri: number[] = [];
    for (const sx of [-2.5, 2.5]) tri.push(sx, 2.4, -2.1, sx, 3.6, 0, sx, 2.4, 2.1, sx, 2.4, 2.1, sx, 3.6, 0, sx, 2.4, -2.1);
    gable.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    gable.computeVertexNormals();
    parts.push(paint(gable, solid(WOOD_DARK), 0.1));
    const slope = Math.atan2(1.2, 2.2);
    const roofW = Math.hypot(2.4, 1.3);
    for (const side of [-1, 1]) {
      parts.push(box(5.8, 0.12, roofW, 0, 3.0, side * 1.12, ROOF, side * slope));
    }
    parts.push(box(0.55, 1.7, 0.55, 1.7, 3.2, -1.0, STONE));
    return merge(parts);
  }
}
