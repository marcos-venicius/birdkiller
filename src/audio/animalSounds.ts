import type { AudioSystem } from './AudioSystem';

type Dest = AudioNode | null;

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Coruja: "hu... hu-hu" grave e abafado. */
function owl(a: AudioSystem, dest: Dest): number {
  const hoo = (at: number, f: number, dur: number) =>
    a.tone({ at, duration: dur, freq: f, freqEnd: f * 0.94, gain: 0.5, attack: 0.07, dest, filter: { type: 'lowpass', freq: 900 } });
  hoo(0, 390, 0.4);
  hoo(0.95, 400, 0.22);
  hoo(1.25, 385, 0.45);
  return 1.8;
}

/** Pica-pau: duas rajadas de batidas secas no tronco. */
function woodpecker(a: AudioSystem, dest: Dest): number {
  for (let roll = 0; roll < 2; roll++) {
    const t0 = roll * 1.4;
    for (let i = 0; i < 16; i++) {
      a.noiseBurst({ at: t0 + i / 17, duration: 0.025, type: 'bandpass', freq: r(1040, 1160), q: 6, gain: 1.3 * (1 - i / 20), dest });
    }
  }
  return 2.4;
}

/** Corvo/anu distante: "craa" rouco, 2 ou 3 vezes. */
function crow(a: AudioSystem, dest: Dest): number {
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    a.tone({
      at: i * 0.45,
      duration: 0.3,
      freq: r(620, 700),
      freqEnd: 480,
      type: 'sawtooth',
      gain: 0.35,
      attack: 0.02,
      dest,
      filter: { type: 'bandpass', freq: 1100, q: 1.5 },
    });
  }
  return n * 0.45;
}

/** Galho estalando (algum bicho andando por perto). */
function crack(a: AudioSystem, dest: Dest): number {
  a.noiseBurst({ duration: 0.035, type: 'highpass', freq: 1800, gain: 0.6, dest });
  a.noiseBurst({ at: 0.09, duration: 0.05, type: 'highpass', freq: 1400, gain: 0.4, dest });
  a.noiseBurst({ at: 0.1, duration: 0.12, type: 'lowpass', freq: 300, gain: 0.3, dest });
  return 0.3;
}

/** Bugio ao longe: ronco grave e ondulado (típico do entardecer). */
function howler(a: AudioSystem, dest: Dest): number {
  for (let i = 0; i < 3; i++) {
    const at = i * 1.2;
    a.tone({ at, duration: 1.1, freq: 150, freqEnd: 210, type: 'sawtooth', gain: 0.3, attack: 0.3, dest, filter: { type: 'lowpass', freq: 500, q: 2 } });
    a.noiseBurst({ at, duration: 1.1, type: 'bandpass', freq: 420, q: 1.5, gain: 0.25, attack: 0.3, dest });
  }
  return 3.6;
}

export interface AnimalSound {
  name: string;
  weight: number;
  /** Faixa de distância do jogador (m) e distância de referência da atenuação. */
  dist: [number, number];
  ref: number;
  play: (a: AudioSystem, dest: Dest) => number;
}

export const ANIMALS: AnimalSound[] = [
  { name: 'coruja', weight: 3, dist: [50, 130], ref: 10, play: owl },
  { name: 'pica-pau', weight: 2, dist: [40, 110], ref: 10, play: woodpecker },
  { name: 'corvo', weight: 2, dist: [60, 150], ref: 12, play: crow },
  { name: 'galho', weight: 2, dist: [15, 40], ref: 4, play: crack },
  { name: 'bugio', weight: 0.8, dist: [120, 220], ref: 30, play: howler },
];

/** Um "cri-cri-cri" de grilo. */
export function cricketChirp(a: AudioSystem, dest: Dest, pitch: number, gain = 0.12): void {
  for (let i = 0; i < 3; i++) a.tone({ at: i * 0.045, duration: 0.02, freq: pitch, gain, attack: 0.003, dest });
}
