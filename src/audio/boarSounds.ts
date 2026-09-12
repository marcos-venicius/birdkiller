import type { AudioSystem } from './AudioSystem';

type Dest = AudioNode | null;

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Grunhido grave e curto ("óinc"), 1 a 3 vezes. */
export function grunt(a: AudioSystem, dest: Dest): number {
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const at = i * 0.28;
    a.tone({ at, duration: 0.18, freq: r(95, 130), freqEnd: r(70, 90), type: 'sawtooth', gain: 0.8, attack: 0.02, dest, filter: { type: 'bandpass', freq: r(350, 480), q: 3 } });
    a.noiseBurst({ at, duration: 0.16, type: 'bandpass', freq: 300, q: 2, gain: 0.4, attack: 0.02, dest });
  }
  return n * 0.28;
}

/** Bufada de alerta: jato de ar pelo focinho. */
export function snort(a: AudioSystem, dest: Dest): void {
  a.noiseBurst({ duration: 0.25, type: 'bandpass', freq: 900, q: 1.5, gain: 0.9, attack: 0.01, dest });
  a.noiseBurst({ at: 0.3, duration: 0.15, type: 'bandpass', freq: 750, q: 1.5, gain: 0.55, attack: 0.01, dest });
}

/** Grito de dor (agudo, sobe e desce); mais curto quando é o último. */
export function squeal(a: AudioSystem, dest: Dest, dying: boolean): void {
  const filter = { type: 'bandpass' as const, freq: 1400, q: 2 };
  a.tone({ duration: 0.25, freq: 700, freqEnd: 1500, type: 'sawtooth', gain: 0.5, attack: 0.02, dest, filter });
  a.tone({ at: 0.22, duration: dying ? 0.35 : 0.55, freq: 1500, freqEnd: 800, type: 'sawtooth', gain: 0.45, dest, filter });
}

/** Galope: batidas de casco e folhas amassadas (um ciclo de passada). */
export function hooves(a: AudioSystem, dest: Dest): void {
  for (let i = 0; i < 4; i++) {
    const at = i * 0.07 + r(0, 0.02);
    a.noiseBurst({ at, duration: 0.05, type: 'lowpass', freq: 250, gain: 0.45, dest });
    a.noiseBurst({ at, duration: 0.04, type: 'bandpass', freq: r(2000, 3200), q: 1.2, gain: 0.15, dest });
  }
}

/** Passos lentos na folhagem. */
export function trot(a: AudioSystem, dest: Dest): void {
  a.noiseBurst({ duration: 0.05, type: 'bandpass', freq: r(1800, 2800), q: 1.2, gain: 0.12, dest });
  a.noiseBurst({ duration: 0.05, type: 'lowpass', freq: 220, gain: 0.15, dest });
}

/** Fuçando: estalos de terra e folhas + fungada. */
export function rooting(a: AudioSystem, dest: Dest): void {
  for (let i = 0; i < 3; i++) {
    a.noiseBurst({ at: i * 0.09 + r(0, 0.03), duration: 0.04, type: 'bandpass', freq: r(1400, 2400), q: 1.5, gain: 0.14, dest });
  }
  a.noiseBurst({ at: 0.05, duration: 0.2, type: 'bandpass', freq: 500, q: 1, gain: 0.12, attack: 0.03, dest });
}

/** Corpo pesado caindo. */
export function heavyThud(a: AudioSystem, dest: Dest): void {
  a.noiseBurst({ duration: 0.2, type: 'lowpass', freq: 150, gain: 2.2, dest });
  a.noiseBurst({ duration: 0.12, type: 'bandpass', freq: 600, q: 1, gain: 0.7, dest });
}
