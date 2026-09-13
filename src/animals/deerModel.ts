import * as THREE from 'three';
import { smoothstep } from '../core/math';
import { hash, merge, paint, solid, type QuadrupedGeometry } from './quadrupedModel';

/**
 * Veado low-poly procedural, em metros (escala 1 = adulto de ~1,6 m e ~1,1 m na cernelha).
 * Origem no centro do corpo; frente = +Z. O pescoço vai junto com a cabeça: girando o pivô do
 * pescoço, o focinho desce até o chão (pastando) ou sobe (alerta).
 */

export interface DeerPalette {
  coat: number;
  belly: number;
  legs: number;
  /** Mancha clara da garupa e da parte de baixo do rabo. */
  rump: number;
  face: number;
  antlers: boolean;
}

export const DEER_PALETTES: DeerPalette[] = [
  // Macho (com galhada), fêmea e um pelo mais escuro.
  { coat: 0x7d5a38, belly: 0xc9b38e, legs: 0x5f452c, rump: 0xe4d8bb, face: 0x6a4a2e, antlers: true },
  { coat: 0x8a6741, belly: 0xd2bd96, legs: 0x6a4e32, rump: 0xe8dcc2, face: 0x74522f, antlers: false },
  { coat: 0x6a4a2f, belly: 0xb8a17e, legs: 0x4f3924, rump: 0xd8cbae, face: 0x5a3f27, antlers: false },
];

/** Altura do centro do corpo acima do chão (escala 1). */
const BODY_Y = 0.92;
/** Metade da largura do corpo: altura do centro deitado de lado. */
const LYING_Y = 0.26;
const NECK = new THREE.Vector3(0, 0.18, 0.46);
const TAIL_PIVOT = new THREE.Vector3(0, 0.14, -0.52);
const LEG_PIVOTS: [number, number, number][] = [
  [0.14, -0.1, 0.34], // dianteira direita
  [-0.14, -0.1, 0.34], // dianteira esquerda
  [0.15, -0.1, -0.36], // traseira direita
  [-0.15, -0.1, -0.36], // traseira esquerda
];

function buildBody(p: DeerPalette): THREE.BufferGeometry {
  const coat = new THREE.Color(p.coat);
  const belly = new THREE.Color(p.belly);
  const rump = new THREE.Color(p.rump);

  // Tronco esguio: peito fundo na frente, barriga enxuta, garupa arredondada.
  const torso = new THREE.IcosahedronGeometry(1, 2);
  const pos = torso.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const front = smoothstep(-0.1, 0.8, z);
    const rear = smoothstep(0.0, -0.8, z);
    const sx = 0.2 * (1 - 0.1 * front);
    const sy = 0.29 * (1 + 0.12 * front * (y < 0 ? 1 : 0.2)) * (1 + 0.05 * rear);
    const j = 1 + (hash(x, y, z) - 0.5) * 0.06;
    pos.setXYZ(i, x * sx * j, y * sy * j + 0.02 * rear, z * 0.6 * j);
  }
  torso.computeVertexNormals();
  return paint(
    torso,
    (c, _x, y, z) => {
      c.copy(belly)
        .lerp(coat, smoothstep(-0.22, -0.04, y))
        // Mancha clara na garupa.
        .lerp(rump, smoothstep(-0.35, -0.5, z) * smoothstep(-0.1, 0.15, y) * 0.9);
    },
    0.08,
  );
}

/** Pescoço + cabeça numa peça só, subindo do pivô: pronta para girar como um todo. */
function buildHead(p: DeerPalette): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const neck = new THREE.CylinderGeometry(0.085, 0.14, 0.5, 7, 1, true);
  neck.rotateX(0.5);
  neck.translate(0, 0.2, 0.11);
  parts.push(paint(neck, solid(p.coat), 0.07));

  const skull = new THREE.CylinderGeometry(0.055, 0.095, 0.3, 6);
  skull.rotateX(Math.PI / 2 + 0.35);
  skull.scale(0.95, 1, 1);
  skull.translate(0, 0.42, 0.28);
  parts.push(paint(skull, solid(p.face), 0.07));

  const muzzle = new THREE.IcosahedronGeometry(0.045, 0);
  muzzle.scale(0.85, 0.85, 1.1);
  muzzle.translate(0, 0.36, 0.4);
  parts.push(paint(muzzle, solid(0x2a2220), 0.05));

  for (const s of [-1, 1]) {
    // Orelhas grandes, abertas para os lados.
    const ear = new THREE.ConeGeometry(0.055, 0.17, 4);
    ear.scale(1, 1, 0.5);
    ear.rotateX(-0.25);
    ear.rotateZ(-s * 0.85);
    ear.translate(s * 0.11, 0.52, 0.19);
    parts.push(paint(ear, solid(p.coat)));

    const eye = new THREE.IcosahedronGeometry(0.021, 0);
    eye.translate(s * 0.07, 0.45, 0.29);
    parts.push(paint(eye, solid(0x0a0806), 0));

    if (p.antlers) {
      // Galhada: haste inclinada para trás com duas pontas.
      const beam = new THREE.CylinderGeometry(0.016, 0.026, 0.34, 5);
      beam.rotateX(-0.35);
      beam.rotateZ(-s * 0.45);
      beam.translate(s * 0.11, 0.68, 0.18);
      parts.push(paint(beam, solid(0x9a866a), 0.1));
      for (const [len, up, fwd, tilt] of [
        [0.16, 0.82, 0.26, 0.9],
        [0.13, 0.9, 0.1, 0.2],
      ] as const) {
        const tine = new THREE.CylinderGeometry(0.009, 0.015, len, 4);
        tine.rotateX(-tilt);
        tine.rotateZ(-s * 0.7);
        tine.translate(s * 0.19, up, fwd);
        parts.push(paint(tine, solid(0xa89273), 0.1));
      }
    }
  }
  return merge(parts);
}

function buildLeg(p: DeerPalette): THREE.BufferGeometry {
  // Patas longas e finas (do pivô até o chão: 0,82 m).
  const upper = new THREE.CylinderGeometry(0.055, 0.028, 0.46, 5, 1, true);
  upper.translate(0, -0.23, 0);
  const lower = new THREE.CylinderGeometry(0.028, 0.022, 0.32, 4, 1, true);
  lower.translate(0, -0.62, 0);
  const hoof = new THREE.CylinderGeometry(0.024, 0.03, 0.05, 5);
  hoof.translate(0, -0.8, 0);
  return merge([paint(upper, solid(p.coat), 0.07), paint(lower, solid(p.legs), 0.07), paint(hoof, solid(0x14110f), 0.05)]);
}

function buildTail(p: DeerPalette): THREE.BufferGeometry {
  const tail = new THREE.ConeGeometry(0.05, 0.2, 5);
  tail.rotateX(Math.PI);
  tail.translate(0, -0.1, -0.01);
  const under = new THREE.ConeGeometry(0.042, 0.16, 5);
  under.rotateX(Math.PI);
  under.translate(0, -0.1, -0.035);
  return merge([paint(tail, solid(p.coat), 0.07), paint(under, solid(p.rump), 0.05)]);
}

export function buildDeerGeometry(p: DeerPalette): QuadrupedGeometry {
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
    radius: 0.42,
    // A cabeça fica no alto do pescoço e acompanha a inclinação dele (ver Quadruped.raycast).
    zones: [
      ['head', 0.74, 0.6, 0.17],
      ['chest', 0.3, 0.02, 0.29],
      ['rear', -0.34, 0.02, 0.29],
    ],
    tufts: [p.coat, p.belly, p.rump],
  };
}
