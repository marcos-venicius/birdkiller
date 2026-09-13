import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { hash, merge, paint, solid, type QuadrupedGeometry } from './quadrupedModel';

/**
 * Javali low-poly procedural, em metros (escala 1 = adulto de ~1,3 m e ~0,85 m na cernelha).
 * Origem no centro do corpo; frente = +Z. Cabeça, pernas e rabo são peças separadas com pivô
 * próprio (animadas pelo Boar); o resto fica num só buffer.
 */

export interface BoarPalette {
  fur: number;
  belly: number;
  mane: number;
  legs: number;
  snout: number;
}

export const BOAR_PALETTES: BoarPalette[] = [
  { fur: 0x4a3d33, belly: 0x5d4e41, mane: 0x241d18, legs: 0x2e251f, snout: 0x7a625a },
  { fur: 0x5b4331, belly: 0x6e5540, mane: 0x2d2118, legs: 0x34281e, snout: 0x836a5e },
];

/** Altura do centro do corpo acima do chão (escala 1). */
export const BODY_Y = 0.56;
/** Pivôs em relação ao centro do corpo. */
export const NECK = new THREE.Vector3(0, 0.04, 0.5);
export const LEG_PIVOTS: [number, number, number][] = [
  [0.12, -0.12, 0.34], // dianteira direita
  [-0.12, -0.12, 0.34], // dianteira esquerda
  [0.12, -0.12, -0.36], // traseira direita
  [-0.12, -0.12, -0.36], // traseira esquerda
];
export const TAIL_PIVOT = new THREE.Vector3(0, 0.1, -0.55);
/** Metade da largura do corpo: altura do centro quando deitado de lado. */
export const LYING_Y = 0.24;

function buildBody(p: BoarPalette): THREE.BufferGeometry {
  const fur = new THREE.Color(p.fur);
  const belly = new THREE.Color(p.belly);
  const mane = new THREE.Color(p.mane);

  // Elipsoide deformado: cernelha alta e larga na frente, traseira mais estreita.
  const torso = new THREE.IcosahedronGeometry(1, 2);
  const pos = torso.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const front = smoothstep(-0.2, 0.7, z);
    const rear = smoothstep(0.1, -0.9, z);
    const sx = 0.22 * (1 - 0.18 * rear);
    const sy = 0.3 * (1 + 0.18 * front * (y > 0 ? 1 : 0.3)) * (1 - 0.12 * rear);
    const j = 1 + (hash(x, y, z) - 0.5) * 0.1;
    pos.setXYZ(i, x * sx * j, y * sy * j + (y > 0 ? 0.03 * front : 0), z * 0.55 * j);
  }
  torso.computeVertexNormals();
  const body = paint(torso, (c, _x, y) => {
    c.copy(belly).lerp(fur, smoothstep(-0.2, -0.05, y)).lerp(mane, smoothstep(0.18, 0.3, y) * 0.7);
  });

  // Crina curta sobre a cernelha (pescoço e ombros), quase embutida no dorso.
  const ridge = new THREE.BoxGeometry(0.04, 0.07, 0.38);
  ridge.rotateX(-0.12);
  ridge.translate(0, 0.35, 0.2);
  return merge([body, paint(ridge, solid(p.mane), 0.2)]);
}

function buildHead(p: BoarPalette): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Cunha: larga no pescoço, fina no focinho (+Z).
  const skull = new THREE.CylinderGeometry(0.075, 0.2, 0.5, 7);
  skull.rotateX(Math.PI / 2);
  skull.scale(0.85, 1.1, 1);
  skull.translate(0, 0, 0.22);
  parts.push(paint(skull, solid(p.fur)));

  const snout = new THREE.CylinderGeometry(0.08, 0.08, 0.035, 8);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, 0, 0.47);
  parts.push(paint(snout, solid(p.snout), 0.05));

  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.05, 0.13, 3);
    ear.rotateX(-0.3);
    ear.rotateZ(-s * 0.5);
    ear.translate(s * 0.1, 0.19, 0.02);
    parts.push(paint(ear, solid(p.mane)));

    const eye = new THREE.IcosahedronGeometry(0.022, 0);
    eye.translate(s * 0.1, 0.08, 0.2);
    parts.push(paint(eye, solid(0x080808), 0));

    const tusk = new THREE.ConeGeometry(0.013, 0.09, 4);
    tusk.rotateX(-0.6);
    tusk.rotateZ(s * 0.5);
    tusk.translate(s * 0.07, -0.06, 0.4);
    parts.push(paint(tusk, solid(0xe8e0cc), 0.05));
  }
  const head = merge(parts);
  head.rotateX(0.28); // focinho para baixo
  return head;
}

function buildLeg(p: BoarPalette): THREE.BufferGeometry {
  // Patas curtas e grossas (do pivô, 0,12 abaixo do centro do corpo, até o chão: 0,44 m).
  const upper = new THREE.CylinderGeometry(0.065, 0.04, 0.4, 5, 1, true);
  upper.translate(0, -0.2, 0);
  const hoof = new THREE.CylinderGeometry(0.04, 0.046, 0.05, 5);
  hoof.translate(0, -0.415, 0);
  return merge([paint(upper, solid(p.legs)), paint(hoof, solid(0x151210), 0.05)]);
}

function buildTail(p: BoarPalette): THREE.BufferGeometry {
  const tail = new THREE.CylinderGeometry(0.012, 0.018, 0.22, 4, 1, true);
  tail.translate(0, -0.11, 0);
  tail.rotateX(0.35);
  const tuft = new THREE.IcosahedronGeometry(0.03, 0);
  tuft.translate(0, -0.21, -0.07);
  return merge([paint(tail, solid(p.legs)), paint(tuft, solid(p.mane))]);
}

export function buildBoarGeometry(p: BoarPalette): QuadrupedGeometry {
  return {
    body: buildBody(p),
    head: buildHead(p),
    leg: buildLeg(p),
    tail: buildTail(p),
    bodyY: BODY_Y,
    lyingY: LYING_Y,
    neck: NECK,
    tailPivot: TAIL_PIVOT,
    legPivots: LEG_PIVOTS,
    radius: 0.45,
    zones: [
      ['head', 0.72, -0.07, 0.2],
      ['chest', 0.28, 0, 0.3],
      ['rear', -0.32, -0.02, 0.28],
    ],
    tufts: [p.fur, p.mane, p.belly],
  };
}
