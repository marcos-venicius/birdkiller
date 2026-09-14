import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { hash, merge, paint, solid } from './quadrupedModel';

/**
 * Cão de caça low-poly procedural (perdigueiro: fígado com manchas brancas, orelhas caídas, coleira
 * vermelha), em metros: ~0,6 m na cernelha. Origem no centro do corpo; frente = +Z. As peças seguem o
 * esquema dos quadrúpedes (corpo, cabeça no pivô do pescoço, uma pata, rabo), mas o cão não é caça:
 * não tem esferas de acerto.
 */

const LIVER = 0x6a3d22;
const LIVER_DARK = 0x4e2b17;
const WHITE = 0xe6ded0;
const NOSE = 0x1c1512;
const COLLAR = 0x8c2a1c;

export interface DogGeometry {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  /** Altura do centro do corpo em pé e deitado. */
  bodyY: number;
  lyingY: number;
  neck: THREE.Vector3;
  tailPivot: THREE.Vector3;
  /** Dianteiras primeiro (direita, esquerda), depois as traseiras. */
  legPivots: [number, number, number][];
  radius: number;
}

const BODY_Y = 0.5;
const LYING_Y = 0.2;
const NECK = new THREE.Vector3(0, 0.1, 0.3);
const TAIL_PIVOT = new THREE.Vector3(0, 0.08, -0.4);
const LEG_PIVOTS: [number, number, number][] = [
  [0.085, -0.07, 0.25],
  [-0.085, -0.07, 0.25],
  [0.09, -0.07, -0.27],
  [-0.09, -0.07, -0.27],
];

/** Manchas brancas grandes e irregulares sobre o fígado: ruído por célula de ~12 cm. */
function spotted(c: THREE.Color, x: number, y: number, z: number): void {
  c.set(hash(Math.floor(x * 8), Math.floor(y * 8), Math.floor(z * 8)) > 0.55 ? WHITE : LIVER);
}

function buildBody(): THREE.BufferGeometry {
  const torso = new THREE.IcosahedronGeometry(1, 2);
  const pos = torso.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Peito fundo na frente, barriga recolhida atrás dele.
    const front = smoothstep(-0.1, 0.8, z);
    const sx = 0.15 * (1 + 0.15 * front);
    let sy = 0.17 * (1 + 0.22 * front * (y < 0 ? 1 : 0.3));
    if (y < 0 && z < 0.2) sy *= 0.82;
    pos.setXYZ(i, x * sx, y * sy, z * 0.42);
  }
  torso.computeVertexNormals();
  return paint(torso, (c, x, y, z) => (y < -0.08 ? c.set(WHITE) : spotted(c, x, y, z)), 0.08);
}

/** Pescoço, coleira e cabeça numa peça só, subindo do pivô do pescoço. */
function buildHead(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const neck = new THREE.CylinderGeometry(0.06, 0.085, 0.22, 7, 1, true);
  neck.rotateX(0.75);
  neck.translate(0, 0.07, 0.06);
  parts.push(paint(neck, solid(LIVER), 0.07));

  const collar = new THREE.TorusGeometry(0.078, 0.013, 5, 12);
  collar.rotateX(-(Math.PI / 2 - 0.75));
  collar.translate(0, 0.03, 0.02);
  parts.push(paint(collar, solid(COLLAR), 0.05));

  const skull = new THREE.IcosahedronGeometry(0.085, 1);
  skull.scale(0.9, 0.85, 1.1);
  skull.translate(0, 0.17, 0.13);
  // Listra branca no alto da cabeça.
  parts.push(paint(skull, (c, x, y) => c.set(Math.abs(x) < 0.022 && y > 0.18 ? WHITE : LIVER), 0.07));

  const muzzle = new THREE.CylinderGeometry(0.032, 0.05, 0.15, 6);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, 0.14, 0.25);
  parts.push(paint(muzzle, solid(LIVER), 0.07));

  const nose = new THREE.IcosahedronGeometry(0.024, 0);
  nose.translate(0, 0.155, 0.33);
  parts.push(paint(nose, solid(NOSE), 0.03));

  for (const s of [-1, 1]) {
    // Orelhas compridas caídas dos lados da cabeça.
    const ear = new THREE.BoxGeometry(0.02, 0.13, 0.075);
    ear.rotateZ(s * 0.18);
    ear.translate(s * 0.085, 0.12, 0.11);
    parts.push(paint(ear, solid(LIVER_DARK), 0.06));

    const eye = new THREE.IcosahedronGeometry(0.013, 0);
    eye.translate(s * 0.045, 0.2, 0.2);
    parts.push(paint(eye, solid(0x0a0806), 0));
  }
  return merge(parts);
}

function buildLeg(): THREE.BufferGeometry {
  // Do pivô até o chão: 0,43 m, com "meia" branca embaixo.
  const upper = new THREE.CylinderGeometry(0.04, 0.03, 0.24, 5, 1, true);
  upper.translate(0, -0.12, 0);
  const lower = new THREE.CylinderGeometry(0.028, 0.024, 0.18, 5, 1, true);
  lower.translate(0, -0.33, 0);
  const paw = new THREE.IcosahedronGeometry(0.035, 0);
  paw.scale(1, 0.6, 1.3);
  paw.translate(0, -0.42, 0.012);
  return merge([paint(upper, solid(LIVER), 0.07), paint(lower, solid(WHITE), 0.06), paint(paw, solid(WHITE), 0.05)]);
}

function buildTail(): THREE.BufferGeometry {
  // Sai do pivô para trás (-Z), afinando, com a ponta branca.
  const tail = new THREE.CylinderGeometry(0.012, 0.028, 0.32, 5);
  tail.translate(0, 0.16, 0);
  tail.rotateX(-Math.PI / 2);
  return paint(tail, (c, _x, _y, z) => c.set(z < -0.22 ? WHITE : LIVER), 0.06);
}

export function buildDogGeometry(): DogGeometry {
  return {
    body: buildBody(),
    head: buildHead(),
    leg: buildLeg(),
    tail: buildTail(),
    bodyY: BODY_Y,
    lyingY: LYING_Y,
    neck: NECK,
    tailPivot: TAIL_PIVOT,
    legPivots: LEG_PIVOTS,
    radius: 0.3,
  };
}
