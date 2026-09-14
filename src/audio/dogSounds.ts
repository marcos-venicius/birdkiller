import type { AudioSystem } from './AudioSystem';

type Dest = AudioNode | null;

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Fungadas curtas, focinho no chão. */
export function sniff(a: AudioSystem, dest: Dest): void {
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    a.noiseBurst({ at: i * 0.11, duration: 0.05, type: 'bandpass', freq: r(2200, 3000), q: 2, gain: 0.3, attack: 0.01, dest });
  }
}

/** Arfar depois de correr. */
export function pant(a: AudioSystem, dest: Dest): void {
  for (let i = 0; i < 4; i++) {
    a.noiseBurst({ at: i * 0.24, duration: 0.13, type: 'bandpass', freq: i % 2 ? 1100 : 1500, q: 1.2, gain: 0.14, attack: 0.03, dest });
  }
}

/** Ganido baixo, quase um gemido: achou a caça (não espanta ninguém). */
export function whine(a: AudioSystem, dest: Dest): void {
  a.tone({ duration: 0.4, freq: 820, freqEnd: 1250, type: 'triangle', gain: 0.1, attack: 0.08, dest });
  a.tone({ at: 0.38, duration: 0.5, freq: 1250, freqEnd: 900, type: 'triangle', gain: 0.08, dest });
}

/** Passo leve de pata no mato. */
export function paw(a: AudioSystem, dest: Dest): void {
  a.noiseBurst({ duration: 0.035, type: 'lowpass', freq: r(500, 800), gain: 0.07, dest });
}
