import type { Vector3 } from 'three';
import type { AudioSystem } from './AudioSystem';

/** Assobio do machado cortando o ar. */
export function playSwing(a: AudioSystem, at = 0): void {
  a.noiseBurst({ at, duration: 0.2, type: 'bandpass', freq: 600, freqEnd: 1600, q: 1.4, gain: 0.16, attack: 0.1 });
}

/** Machado entrando na madeira: estalo seco e corpo grave, vindos do ponto do golpe. */
export function playChop(a: AudioSystem, pos: Vector3): void {
  const p = 0.9 + Math.random() * 0.2;
  const dest = a.spatial(pos, 'sfx', 4);
  a.noiseBurst({ duration: 0.03, type: 'highpass', freq: 2200 * p, gain: 0.35, dest });
  a.noiseBurst({ duration: 0.09, type: 'bandpass', freq: 480 * p, q: 2.2, gain: 1.0, reverb: 0.35, dest });
  a.tone({ duration: 0.14, freq: 170 * p, freqEnd: 105, gain: 0.5, dest });
}

/** Machado batendo em pedra: tinido de aço. */
export function playAxeRock(a: AudioSystem, pos: Vector3): void {
  const dest = a.spatial(pos, 'sfx', 4);
  a.noiseBurst({ duration: 0.04, type: 'highpass', freq: 3000, gain: 0.5, dest });
  a.tone({ duration: 0.35, freq: 2900, freqEnd: 2600, type: 'triangle', gain: 0.14, dest });
  a.tone({ duration: 0.25, freq: 4300, freqEnd: 4000, type: 'triangle', gain: 0.06, dest });
}

/** Machado na terra: baque abafado. */
export function playAxeDirt(a: AudioSystem, pos: Vector3): void {
  const dest = a.spatial(pos, 'sfx', 4);
  a.noiseBurst({ duration: 0.1, type: 'lowpass', freq: 380, gain: 0.6, dest });
}

/** A árvore cedendo: fibras rompendo em estalos e o rangido grave do tronco. */
export function playTreeCreak(a: AudioSystem, pos: Vector3): void {
  const dest = a.spatial(pos, 'sfx', 10);
  a.tone({ duration: 1.4, freq: 95, freqEnd: 60, type: 'sawtooth', gain: 0.05, attack: 0.3, dest });
  for (const [at, gain] of [
    [0.05, 0.5],
    [0.35, 0.35],
    [0.7, 0.45],
    [1.0, 0.3],
    [1.3, 0.5],
  ] as const) {
    a.noiseBurst({ at: at + Math.random() * 0.08, duration: 0.05, type: 'bandpass', freq: 900 + Math.random() * 700, q: 3, gain, dest });
  }
}

/** A árvore chegando ao chão: galhos quebrando, folhas e o baque do tronco. */
export function playTreeFall(a: AudioSystem, pos: Vector3): void {
  const dest = a.spatial(pos, 'sfx', 14);
  a.noiseBurst({ duration: 1.3, type: 'highpass', freq: 1800, freqEnd: 900, gain: 0.45, attack: 0.05, dest });
  a.noiseBurst({ duration: 1.1, type: 'lowpass', freq: 900, freqEnd: 140, gain: 1.2, reverb: 0.9, dest });
  a.tone({ duration: 0.6, freq: 62, freqEnd: 30, gain: 1.0, dest });
  for (let i = 0; i < 5; i++) {
    a.noiseBurst({ at: 0.05 + Math.random() * 0.6, duration: 0.04, type: 'bandpass', freq: 1200 + Math.random() * 1500, q: 3, gain: 0.35, dest });
  }
}

/** Juntando as toras: batidas ocas de madeira. */
export function playCollect(a: AudioSystem): void {
  for (const [at, freq] of [
    [0, 620],
    [0.11, 760],
    [0.24, 540],
    [0.33, 700],
  ] as const) {
    a.noiseBurst({ at, duration: 0.06, type: 'bandpass', freq, q: 4, gain: 0.55, reverb: 0.2 });
    a.tone({ at, duration: 0.08, freq: freq * 0.5, gain: 0.18 });
  }
}

/** Marteladas da construção. */
export function playHammer(a: AudioSystem, count = 6): void {
  for (let i = 0; i < count; i++) {
    const at = i * 0.26 + Math.random() * 0.05;
    a.noiseBurst({ at, duration: 0.05, type: 'bandpass', freq: 1400 + Math.random() * 300, q: 3, gain: 0.6, reverb: 0.3 });
    a.tone({ at, duration: 0.07, freq: 320, freqEnd: 240, gain: 0.25 });
  }
}
