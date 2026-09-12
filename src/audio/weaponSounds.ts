import type { Vector3 } from 'three';
import type { AudioSystem } from './AudioSystem';

/** Estampido do rifle: estalo agudo + corpo grave + ecos devolvidos pelo relevo. */
export function playGunshot(a: AudioSystem): void {
  const p = 0.94 + Math.random() * 0.12;
  a.noiseBurst({ duration: 0.08, type: 'highpass', freq: 1500 * p, gain: 0.9, reverb: 0.3 });
  a.noiseBurst({ duration: 0.5, type: 'lowpass', freq: 1400 * p, freqEnd: 180, gain: 1.4, reverb: 0.9 });
  a.tone({ duration: 0.32, freq: 95 * p, freqEnd: 36, gain: 0.8 });
  a.noiseBurst({ at: 0.38, duration: 0.7, type: 'lowpass', freq: 600, freqEnd: 150, gain: 0.22, attack: 0.03, reverb: 1 });
  a.noiseBurst({ at: 0.95, duration: 0.9, type: 'lowpass', freq: 420, freqEnd: 120, gain: 0.1, attack: 0.05, reverb: 1 });
}

/** Clique metálico curto (peças de aço batendo). */
function click(a: AudioSystem, at: number, freq: number, gain: number): void {
  a.noiseBurst({ at, duration: 0.025, type: 'bandpass', freq, q: 6, gain, reverb: 0.1 });
  a.tone({ at, duration: 0.05, freq: freq * 0.9, type: 'triangle', gain: gain * 0.25 });
}

/** Atrito de aço deslizando (ferrolho, cartuchos). */
function slide(a: AudioSystem, at: number, duration: number, from: number, to: number, gain: number): void {
  a.noiseBurst({ at, duration, type: 'bandpass', freq: from, freqEnd: to, q: 2.5, gain, attack: 0.01, reverb: 0.05 });
}

/** Levanta e puxa o ferrolho. */
export function playBoltOpen(a: AudioSystem, at = 0): void {
  click(a, at, 2600, 0.5);
  slide(a, at + 0.07, 0.12, 1800, 3200, 0.25);
  click(a, at + 0.19, 2200, 0.35);
}

/** Empurra e baixa o ferrolho. */
export function playBoltClose(a: AudioSystem, at = 0): void {
  slide(a, at, 0.11, 3000, 1700, 0.25);
  click(a, at + 0.11, 2000, 0.45);
  click(a, at + 0.2, 2800, 0.4);
}

/** Impacto no pássaro: baque abafado + penas, vindo do ponto do acerto com o atraso do som (343 m/s). */
export function playBirdHit(a: AudioSystem, distance: number, pos: Vector3): void {
  const at = distance / 343;
  const dest = a.spatial(pos, 'sfx', 6);
  a.noiseBurst({ at, duration: 0.07, type: 'lowpass', freq: 700, gain: 0.6, dest });
  a.noiseBurst({ at: at + 0.02, duration: 0.25, type: 'bandpass', freq: 3500, q: 1.2, gain: 0.3, attack: 0.01, dest });
}

/** Bala acertando um animal grande (javali): baque surdo e seco. */
export function playFleshHit(a: AudioSystem, distance: number, pos: Vector3): void {
  const at = distance / 343;
  const dest = a.spatial(pos, 'sfx', 8);
  a.noiseBurst({ at, duration: 0.1, type: 'lowpass', freq: 400, gain: 0.8, dest });
  a.noiseBurst({ at, duration: 0.06, type: 'bandpass', freq: 900, q: 1.5, gain: 0.3, dest });
}

/** Bala acertando madeira, pedra ou terra, vindo do ponto do impacto. */
export function playImpact(a: AudioSystem, distance: number, kind: 'trunk' | 'rock' | 'terrain', pos: Vector3): void {
  const at = distance / 343;
  const dest = a.spatial(pos, 'sfx', 6);
  if (kind === 'trunk') {
    a.noiseBurst({ at, duration: 0.09, type: 'bandpass', freq: 900, q: 3, gain: 0.5, dest });
  } else if (kind === 'rock') {
    a.noiseBurst({ at, duration: 0.05, type: 'highpass', freq: 2500, gain: 0.5, dest });
    a.tone({ at, duration: 0.25, freq: 2400, freqEnd: 1900, type: 'triangle', gain: 0.15, dest });
  } else {
    a.noiseBurst({ at, duration: 0.12, type: 'lowpass', freq: 350, gain: 0.5, dest });
  }
}

/** Recarga parcial: abre o ferrolho, empurra os cartuchos que faltam um a um e fecha no fim. */
export function playTopUp(a: AudioSystem, rounds: number, duration: number): void {
  playBoltOpen(a, 0.15);
  const step = (duration - 1.0) / Math.max(rounds, 1);
  for (let i = 0; i < rounds; i++) {
    const t = 0.45 + i * step;
    slide(a, t, 0.09, 1300, 2300, 0.2);
    click(a, t + 0.08, 2300 + Math.random() * 300, 0.25);
  }
  playBoltClose(a, duration - 0.5);
}

/** Recarga com pente: abre o ferrolho, encaixa o pente, empurra os 5 cartuchos e fecha no fim. */
export function playReload(a: AudioSystem, duration: number): void {
  playBoltOpen(a, 0.15);
  click(a, 0.6, 1600, 0.45);
  for (let i = 0; i < 5; i++) {
    const t = 0.85 + i * 0.13;
    slide(a, t, 0.08, 1300, 2200, 0.18);
    click(a, t + 0.07, 2400 + Math.random() * 300, 0.22);
  }
  a.tone({ at: 1.65, duration: 0.25, freq: 3200, freqEnd: 2900, type: 'triangle', gain: 0.06 });
  playBoltClose(a, duration - 0.5);
}
