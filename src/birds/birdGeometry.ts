import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from '../core/math';
import type { Species } from './species';

/**
 * Geometria low-poly de um pássaro em unidades do seu comprimento (o grupo é escalado por
 * species.length). Frente = +Z, cima = +Y, origem no centro do corpo (barriga em y = -0,2).
 */
export interface BirdGeometry {
  body: THREE.BufferGeometry;
  /** Asa direita (se estende em +X a partir do ombro); a esquerda é a mesma espelhada. */
  wing: THREE.BufferGeometry;
  shoulder: THREE.Vector3;
}

type Paint = (x: number, y: number, z: number, out: THREE.Color) => void;

/** Converte para não indexada, remove UVs e define a cor de cada vértice. */
function paint(geo: THREE.BufferGeometry, fn: Paint): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function solid(color: THREE.Color): Paint {
  return (_x, _y, _z, out) => {
    out.copy(color);
  };
}

function buildBody(sp: Species): THREE.BufferGeometry {
  const col = (k: keyof Species['colors']) => new THREE.Color(sp.colors[k]);
  const back = col('back');
  const belly = col('belly');
  const breast = col('breast');
  const head = col('head');
  const cap = col('cap');
  const parts: THREE.BufferGeometry[] = [];

  const torso = new THREE.IcosahedronGeometry(0.5, 1);
  torso.scale(0.42, 0.4, 1);
  parts.push(
    paint(torso, (_x, y, z, c) => {
      c.copy(belly).lerp(back, smoothstep(-0.06, 0.08, y));
      c.lerp(breast, smoothstep(0.05, 0.32, z) * (1 - smoothstep(-0.02, 0.1, y)));
    }),
  );

  const skull = new THREE.IcosahedronGeometry(0.17, 1);
  skull.translate(0, 0.12, 0.42);
  parts.push(
    paint(skull, (_x, y, z, c) => {
      c.copy(head).lerp(cap, smoothstep(0.17, 0.25, y));
      if (y < 0.08 && z > 0.44) c.lerp(breast, 0.6);
    }),
  );

  const beak = new THREE.ConeGeometry(0.045, 0.16 * sp.beak, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.1, 0.56 + 0.08 * sp.beak);
  parts.push(paint(beak, solid(col('beak'))));

  for (const s of [-1, 1]) {
    const eye = new THREE.IcosahedronGeometry(0.032, 0);
    eye.translate(s * 0.125, 0.16, 0.5);
    parts.push(paint(eye, solid(new THREE.Color(0x0a0a0a))));
  }

  const tail = new THREE.BoxGeometry(0.2 * sp.tail, 0.025, 0.4);
  tail.translate(0, 0, -0.2);
  tail.rotateX(0.1);
  tail.translate(0, 0.03, -0.4);
  const tailColor = col('tail');
  const tailTip = tailColor.clone().multiplyScalar(0.6);
  parts.push(
    paint(tail, (_x, _y, z, c) => {
      c.copy(tailColor).lerp(tailTip, smoothstep(-0.6, -0.8, z));
    }),
  );

  if (sp.crest) {
    const crest = new THREE.ConeGeometry(0.06, 0.2, 5);
    crest.rotateX(-0.7);
    crest.translate(0, 0.3, 0.36);
    parts.push(paint(crest, solid(cap)));
  }

  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries falhou (corpo do pássaro)');
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** Asa como leque plano: coberteiras na cor da asa, ponta e bordo de fuga nas primárias. */
function buildWing(sp: Species): THREE.BufferGeometry {
  const S = sp.span;
  const K = sp.chord;
  const wing = new THREE.Color(sp.colors.wing);
  const prim = new THREE.Color(sp.colors.primaries);
  // [x, y, z, t] — t = mistura em direção à cor das primárias.
  const ring: [number, number, number, number][] = [
    [0, 0, 0.12 * K, 0],
    [0.35 * S, 0.015, 0.14 * K, 0],
    [0.7 * S, 0.01, 0.07 * K, 0.4],
    [S, 0, -0.12 * K, 1],
    [0.85 * S, 0, -0.26 * K, 1],
    [0.58 * S, 0, -0.3 * K, 0.8],
    [0.28 * S, 0, -0.27 * K, 0.25],
    [0, 0, -0.2 * K, 0],
  ];
  const center: [number, number, number, number] = [0.3 * S, 0.02, -0.06 * K, 0.1];
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const push = (p: [number, number, number, number]) => {
    pos.push(p[0], p[1], p[2]);
    nrm.push(0, 1, 0);
    c.copy(wing).lerp(prim, p[3]);
    col.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < ring.length; i++) {
    push(center);
    push(ring[(i + 1) % ring.length]);
    push(ring[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export function buildBirdGeometry(sp: Species): BirdGeometry {
  return { body: buildBody(sp), wing: buildWing(sp), shoulder: new THREE.Vector3(0.12, 0.08, 0.1) };
}
