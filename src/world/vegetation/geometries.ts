import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng';

/**
 * Geometrias low-poly procedurais da floresta. Todas saem não indexadas, com
 * position/normal/color, e a origem na base do objeto (y = 0 no chão).
 */

type Rand = () => number;
type LOD = 0 | 1;
type FaceTint = (c: THREE.Color, nx: number, ny: number, nz: number) => void;

const C = {
  bark: 0x5a4636,
  barkDark: 0x46372a,
  birchBark: 0xd8d2c4,
  snag: 0x7d7468,
  conifer: 0x537545,
  coniferDark: 0x3c5c36,
  leaf: 0x66843e,
  leafWarm: 0x74843c,
  birchLeaf: 0x889c46,
  bush: 0x587638,
  fern: 0x587a30,
  fernTip: 0x86a046,
  grassBase: 0x4a5a2c,
  grassTip: 0x8c9850,
  rock: 0x8a857a,
  moss: 0x5e6c38,
  wood: 0xa4845c,
};

const UP = new THREE.Vector3(0, 1, 0);
const MOSS = new THREE.Color(C.moss);
const _c = new THREE.Color();

/** Hash determinístico de uma posição — vértices duplicados na mesma posição recebem o mesmo valor. */
function hashPos(x: number, y: number, z: number): number {
  const h =
    Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) *
    43758.5453;
  return h - Math.floor(h);
}

function mix(a: number, b: number, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** Converte para não indexada, remove UVs e pinta cada face com a cor base ± variação. */
function paint(
  geo: THREE.BufferGeometry,
  color: number | THREE.Color,
  rand: Rand,
  jitter = 0.1,
  tint?: FaceTint,
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const base = typeof color === 'number' ? new THREE.Color(color) : color;
  const normal = g.getAttribute('normal');
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 3) {
    _c.copy(base);
    if (tint) {
      const nx = normal.getX(v) + normal.getX(v + 1) + normal.getX(v + 2);
      const ny = normal.getY(v) + normal.getY(v + 1) + normal.getY(v + 2);
      const nz = normal.getZ(v) + normal.getZ(v + 1) + normal.getZ(v + 2);
      const len = Math.hypot(nx, ny, nz) || 1;
      tint(_c, nx / len, ny / len, nz / len);
    }
    const k = 1 + (rand() * 2 - 1) * jitter;
    for (let j = v; j < v + 3; j++) {
      colors[j * 3] = _c.r * k;
      colors[j * 3 + 1] = _c.g * k;
      colors[j * 3 + 2] = _c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function build(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries falhou: atributos incompatíveis');
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Duplica cada triângulo com a ordem invertida, mantendo normais e cores. Substitui DoubleSide,
 * que inverteria a normal da face de trás e deixaria metade das lâminas preta.
 */
function addBackFaces(pos: number[], nrm: number[], col: number[]): void {
  const n = pos.length;
  for (let t = 0; t < n; t += 9) {
    for (const k of [0, 2, 1]) {
      for (let j = 0; j < 3; j++) {
        pos.push(pos[t + k * 3 + j]);
        nrm.push(nrm[t + k * 3 + j]);
        col.push(col[t + k * 3 + j]);
      }
    }
  }
}

/** Monta uma geometria a partir de arrays (triângulos soltos). */
function fromArrays(pos: number[], nrm: number[], col: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Aglomerado de folhas: icosaedro deformado com normais radiais (sombreamento suave). */
function blob(
  r: number,
  detail: number,
  x: number,
  y: number,
  z: number,
  squash: number,
  jitter: number,
  color: number,
  rand: Rand,
): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const off = rand() * 100;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const len = Math.hypot(px, py, pz) || 1;
    const k = 1 + (hashPos(px + off, py, pz) * 2 - 1) * jitter;
    pos.setXYZ(i, x + px * k, y + py * k * squash, z + pz * k);
    // Normal radial levemente inclinada para cima: a copa recebe mais luz do céu.
    const ny = (py / len) * 0.75 + 0.25;
    const nl = Math.hypot(px / len, ny, pz / len);
    nrm.setXYZ(i, px / len / nl, ny / nl, pz / len / nl);
  }
  return paint(g, color, rand, 0.12);
}

/** Um "andar" de conífera: cone com a borda irregular e levemente caída. */
function tier(r: number, h: number, y: number, segs: number, color: THREE.Color, rand: Rand, jitter: number) {
  const g = new THREE.ConeGeometry(r, h, segs, 1, false);
  g.rotateY(rand() * Math.PI * 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const off = rand() * 100;
  const baseY = -h / 2;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i) - baseY) > 1e-4) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (x === 0 && z === 0) continue;
    const k = 1 + (hashPos(x + off, 0, z) * 2 - 1) * jitter;
    pos.setXYZ(i, x * k, baseY - hashPos(z + off, 1, x) * h * 0.15, z * k);
  }
  g.translate(0, y + h / 2, 0);
  return paint(g, color, rand, 0.12);
}

function trunk(r0: number, r1: number, h: number, segs: number, color: number, rand: Rand, jitter = 0.12) {
  const g = new THREE.CylinderGeometry(r1, r0, h, segs, 1, true);
  g.translate(0, h / 2, 0);
  return paint(g, color, rand, jitter);
}

function limb(
  from: [number, number, number],
  dir: [number, number, number],
  len: number,
  r0: number,
  r1: number,
  segs: number,
  color: number,
  rand: Rand,
) {
  const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1, true);
  g.translate(0, len / 2, 0);
  const d = new THREE.Vector3(...dir).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
  g.translate(...from);
  return paint(g, color, rand, 0.12);
}

// ---------------------------------------------------------------- árvores

/** Conífera (~13,3 m). Galhos começam a ~3 m para não bloquear a visão de quem anda na mata. */
export function conifer(lod: LOD): THREE.BufferGeometry {
  const rand = mulberry32(101 + lod);
  const parts: THREE.BufferGeometry[] = [];
  if (lod === 0) {
    parts.push(trunk(0.32, 0.08, 12.5, 6, C.bark, rand));
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      parts.push(tier(2.5 - t * 1.7, 3.6 - t * 1.1, 3.2 + i * 1.9, 9, mix(C.coniferDark, C.conifer, t), rand, 0.2));
    }
  } else {
    parts.push(trunk(0.32, 0.12, 5, 4, C.bark, rand));
    parts.push(tier(2.5, 6.5, 3.2, 6, mix(C.coniferDark, C.conifer, 0.2), rand, 0.1));
    parts.push(tier(1.6, 5.4, 7.9, 6, mix(C.coniferDark, C.conifer, 0.8), rand, 0.1));
  }
  return build(parts);
}

/** Árvore de copa larga (~10,4 m). */
export function broadleaf(lod: LOD): THREE.BufferGeometry {
  const rand = mulberry32(201 + lod);
  const parts: THREE.BufferGeometry[] = [];
  if (lod === 0) {
    parts.push(trunk(0.42, 0.2, 6.2, 7, C.bark, rand));
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + rand() * 0.5;
      parts.push(limb([0, 4.3 + k * 0.4, 0], [Math.cos(a), 0.9, Math.sin(a)], 2.6, 0.16, 0.07, 5, C.bark, rand));
    }
    const blobs: [number, number, number, number][] = [
      [0, 7.6, 0, 2.6],
      [1.7, 6.9, 0.6, 2.0],
      [-1.5, 7.1, -0.9, 2.1],
      [-0.2, 8.7, 0.5, 1.9],
    ];
    blobs.forEach(([x, y, z, r], i) => parts.push(blob(r, 1, x, y, z, 0.85, 0.22, i % 2 ? C.leaf : C.leafWarm, rand)));
  } else {
    parts.push(trunk(0.42, 0.25, 5.5, 5, C.bark, rand));
    parts.push(blob(3.1, 0, 0, 7.4, 0, 0.8, 0.15, C.leaf, rand));
    parts.push(blob(2.1, 0, 0.5, 8.6, -0.3, 0.8, 0.15, C.leafWarm, rand));
  }
  return build(parts);
}

/** Bétula: tronco claro e fino, copa pequena e alongada (~10 m). */
export function birch(lod: LOD): THREE.BufferGeometry {
  const rand = mulberry32(301 + lod);
  const parts: THREE.BufferGeometry[] = [];
  if (lod === 0) {
    parts.push(trunk(0.2, 0.09, 10, 6, C.birchBark, rand, 0.35));
    parts.push(limb([0, 5.2, 0], [0.8, 1, 0.2], 1.4, 0.07, 0.03, 4, C.birchBark, rand));
    parts.push(limb([0, 6.3, 0], [-0.6, 1, -0.5], 1.2, 0.06, 0.03, 4, C.birchBark, rand));
    const blobs: [number, number, number, number, number][] = [
      [0.3, 7.3, 0, 1.3, 1.5],
      [-0.4, 8.7, 0.3, 1.05, 1.4],
      [0.2, 5.9, -0.4, 1.15, 1.3],
      [0.6, 6.6, 0.6, 0.9, 1.3],
    ];
    for (const [x, y, z, r, sq] of blobs) parts.push(blob(r, 1, x, y, z, sq, 0.25, C.birchLeaf, rand));
  } else {
    parts.push(trunk(0.2, 0.1, 9, 4, C.birchBark, rand, 0.3));
    parts.push(blob(1.8, 0, 0, 7.3, 0, 1.6, 0.15, C.birchLeaf, rand));
  }
  return build(parts);
}

/** Árvore seca, sem folhas (~8 m) — bom poleiro para pássaros. */
export function snag(lod: LOD): THREE.BufferGeometry {
  const rand = mulberry32(401 + lod);
  const parts: THREE.BufferGeometry[] = [];
  if (lod === 0) {
    parts.push(trunk(0.34, 0.12, 8, 6, C.snag, rand, 0.2));
    const limbs: [number, number, number][] = [
      [3.6, 2.2, 0.8],
      [4.8, 1.8, 0.6],
      [6.0, 1.5, 1.1],
      [7.1, 1.0, 0.5],
    ];
    limbs.forEach(([y, len, up], i) => {
      const a = i * 2.4 + rand() * 0.6;
      parts.push(limb([0, y, 0], [Math.cos(a), up, Math.sin(a)], len, 0.1, 0.03, 4, C.snag, rand));
    });
  } else {
    parts.push(trunk(0.34, 0.14, 8, 4, C.snag, rand, 0.2));
    parts.push(limb([0, 4.8, 0], [1, 0.7, 0], 1.8, 0.1, 0.04, 3, C.snag, rand));
  }
  return build(parts);
}

// ---------------------------------------------------------------- vegetação baixa

export function bush(lod: LOD): THREE.BufferGeometry {
  const rand = mulberry32(501 + lod);
  if (lod === 1) return build([blob(1.0, 0, 0, 0.6, 0, 0.75, 0.2, C.bush, rand)]);
  const blobs: [number, number, number, number][] = [
    [0, 0.55, 0, 0.8],
    [0.6, 0.45, 0.25, 0.62],
    [-0.5, 0.5, -0.3, 0.65],
    [0.15, 0.9, -0.2, 0.58],
    [-0.3, 0.4, 0.55, 0.55],
  ];
  return build(blobs.map(([x, y, z, r], i) => blob(r, 0, x, y, z, 0.8, 0.3, i % 2 ? C.bush : C.leaf, rand)));
}

/** Samambaia: folhas arqueadas em leque. */
export function fern(): THREE.BufferGeometry {
  const rand = mulberry32(601);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color(C.fern);
  const tip = new THREE.Color(C.fernTip);
  const fronds = 8;
  const segs = 3;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const len = 0.65 + rand() * 0.35;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const pts: { x: number; y: number; z: number; w: number; t: number }[] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      pts.push({
        x: dx * len * t,
        y: 0.03 + len * (0.9 * t - 0.75 * t * t),
        z: dz * len * t,
        w: 0.13 * Math.sin(Math.PI * Math.min(t * 1.1, 1)) + 0.01,
        t,
      });
    }
    const vert = (p: (typeof pts)[number], side: number) => {
      pos.push(p.x - dz * p.w * side, p.y, p.z + dx * p.w * side);
      nrm.push(0, 1, 0);
      _c.copy(base).lerp(tip, p.t);
      col.push(_c.r, _c.g, _c.b);
    };
    for (let s = 0; s < segs; s++) {
      const p0 = pts[s];
      const p1 = pts[s + 1];
      vert(p0, -1); vert(p0, 1); vert(p1, 1);
      vert(p0, -1); vert(p1, 1); vert(p1, -1);
    }
  }
  addBackFaces(pos, nrm, col);
  return build([fromArrays(pos, nrm, col)]);
}

/** Tufo de grama: lâminas triangulares, base escura e ponta clara. Normais para cima (luz igual ao chão). */
export function grassTuft(): THREE.BufferGeometry {
  const rand = mulberry32(701);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color(C.grassBase);
  const tip = new THREE.Color(C.grassTip);
  for (let b = 0; b < 9; b++) {
    const a = rand() * Math.PI * 2;
    const rr = rand() * 0.13;
    const bx = Math.cos(a) * rr;
    const bz = Math.sin(a) * rr;
    const yaw = rand() * Math.PI * 2;
    const px = Math.cos(yaw);
    const pz = Math.sin(yaw);
    const la = rand() * Math.PI * 2;
    const lean = 0.1 + rand() * 0.3;
    const h = 0.25 + rand() * 0.3;
    const w = 0.022 + rand() * 0.016;
    pos.push(bx - px * w, 0, bz - pz * w, bx + px * w, 0, bz + pz * w, bx + Math.cos(la) * lean * h, h, bz + Math.sin(la) * lean * h);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    const kb = 0.85 + rand() * 0.25;
    const kt = 0.8 + rand() * 0.35;
    col.push(base.r * kb, base.g * kb, base.b * kb, base.r * kb, base.g * kb, base.b * kb, tip.r * kt, tip.g * kt, tip.b * kt);
  }
  addBackFaces(pos, nrm, col);
  return build([fromArrays(pos, nrm, col)]);
}

// ---------------------------------------------------------------- chão

/** Pedra facetada (raio ~1, centro em y = 0) com musgo nas faces de cima. */
export function rock(): THREE.BufferGeometry {
  const rand = mulberry32(801);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + (hashPos(x, y, z) * 2 - 1) * 0.32;
    pos.setXYZ(i, x * k, y * k * 0.7, z * k);
  }
  g.computeVertexNormals();
  return build([
    paint(g, C.rock, rand, 0.12, (c, _nx, ny) => {
      if (ny > 0.55) c.lerp(MOSS, ((ny - 0.55) / 0.45) * 0.8);
    }),
  ]);
}

/** Tronco caído: cilindro de raio 0,3 e comprimento 1 ao longo do eixo X (escala X = comprimento). */
export function log(): THREE.BufferGeometry {
  const rand = mulberry32(901);
  const g = new THREE.CylinderGeometry(0.3, 0.3, 1, 8, 2, false);
  g.rotateZ(Math.PI / 2);
  return build([
    paint(g, C.bark, rand, 0.18, (c, nx, ny) => {
      if (Math.abs(nx) > 0.9) c.set(C.wood);
      else if (ny > 0.6) c.lerp(MOSS, 0.45);
    }),
  ]);
}

export function stump(): THREE.BufferGeometry {
  const rand = mulberry32(1001);
  const g = new THREE.CylinderGeometry(0.32, 0.42, 0.8, 7, 1, false);
  g.translate(0, 0.25, 0);
  return build([
    paint(g, C.bark, rand, 0.15, (c, _nx, ny) => {
      if (ny > 0.9) c.set(C.wood);
    }),
  ]);
}

/** Galhos secos espalhados no chão. */
export function debris(): THREE.BufferGeometry {
  const rand = mulberry32(1101);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const len = 0.9 + rand() * 0.7;
    const yaw = rand() * Math.PI;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const fx = -dx * len * 0.5 + (rand() - 0.5) * 0.4;
    const fz = -dz * len * 0.5 + (rand() - 0.5) * 0.4;
    parts.push(limb([fx, 0.04, fz], [dx, 0.06, dz], len, 0.045, 0.025, 4, C.barkDark, rand));
    parts.push(limb([fx + dx * len * 0.5, 0.06, fz + dz * len * 0.5], [dz, 0.5, -dx], 0.35, 0.02, 0.01, 3, C.barkDark, rand));
  }
  return build(parts);
}
