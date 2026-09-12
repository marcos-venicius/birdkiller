import * as THREE from 'three';
import { CONFIG } from '../config';
import type { PlayerController } from '../player/PlayerController';

/**
 * O ponto (x, z) está dentro do campo de visão horizontal do jogador (com folga) e perto o bastante
 * para ele ver o animal "surgindo"? Usa o FOV base, não o da luneta — assim nada brota logo ao
 * tirar o olho da mira. Além de `hiddenDistance`, a névoa esconde o surgimento.
 */
export function inPlayerView(
  player: PlayerController,
  camera: THREE.PerspectiveCamera,
  x: number,
  z: number,
  hiddenDistance: number,
  marginDeg: number,
): boolean {
  const P = player.position;
  const dx = x - P.x;
  const dz = z - P.z;
  const d = Math.hypot(dx, dz);
  if (d > hiddenDistance) return false;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(CONFIG.camera.fov) / 2) * camera.aspect);
  return (dx * fx + dz * fz) / d > Math.cos(halfFov + THREE.MathUtils.degToRad(marginDeg));
}
