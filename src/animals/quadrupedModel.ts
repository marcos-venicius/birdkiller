import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type HitZone = 'head' | 'chest' | 'rear';

/**
 * Medidas e peças de um quadrúpede (javali, veado...). O corpo, a cabeça, uma pata e o rabo são
 * geometrias separadas; o resto são os pivôs e as esferas de acerto, que o `Quadruped` usa para
 * montar, animar e testar tiros — assim uma espécie nova é só um modelo novo.
 * Escala 1 = adulto; origem no centro do corpo, frente = +Z.
 */
export interface QuadrupedGeometry {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  /** Altura do centro do corpo acima do chão, e a mesma medida com o bicho deitado de lado. */
  bodyY: number;
  lyingY: number;
  /** Pivôs em relação ao centro do corpo: pescoço, rabo e as quatro patas (dianteiras primeiro). */
  neck: THREE.Vector3;
  tailPivot: THREE.Vector3;
  legPivots: [number, number, number][];
  /** Raio usado na colisão com troncos e pedras. */
  radius: number;
  /** Esferas de acerto: [zona, z, y, raio] em relação ao centro do corpo. */
  zones: [HitZone, number, number, number][];
  /** Cores dos tufos de pelo que voam no impacto. */
  tufts: number[];
}

export type Paint = (c: THREE.Color, x: number, y: number, z: number) => void;

export function hash(x: number, y: number, z: number): number {
  const h = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Não indexada, sem UV, cor por face (centro da face) com variação — aspecto de pelagem eriçada. */
export function paint(geo: THREE.BufferGeometry, fn: Paint, jitter = 0.14): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let v = 0; v < pos.count; v += 3) {
    const x = (pos.getX(v) + pos.getX(v + 1) + pos.getX(v + 2)) / 3;
    const y = (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3;
    const z = (pos.getZ(v) + pos.getZ(v + 1) + pos.getZ(v + 2)) / 3;
    fn(c, x, y, z);
    const k = 1 + (hash(x, y, z) * 2 - 1) * jitter;
    for (let j = v; j < v + 3; j++) {
      colors[j * 3] = c.r * k;
      colors[j * 3 + 1] = c.g * k;
      colors[j * 3 + 2] = c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function solid(color: number): Paint {
  const base = new THREE.Color(color);
  return (c) => {
    c.copy(base);
  };
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries falhou');
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

