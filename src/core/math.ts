import type { Vector3 } from 'three';

export const TAU = Math.PI * 2;

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Menor diferença angular de `from` para `to`, em (-π, π]. */
export function angleDiff(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

/** Distância ao longo do raio (d normalizado) até a esfera, 0 se a origem está dentro, Infinity se não toca. */
export function raySphere(o: Vector3, d: Vector3, c: Vector3, r: number): number {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const q = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - q;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  if (-b - s > 0) return -b - s;
  return -b + s > 0 ? 0 : Infinity;
}
