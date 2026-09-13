import type { AudioSystem } from './AudioSystem';

type Dest = AudioNode | null;

/** Agenda um canto (ou alarme) a partir de agora no destino dado e devolve sua duração (s). */
export type SongFn = (a: AudioSystem, dest: Dest, alarm: boolean) => number;

const r = (a: number, b: number) => a + Math.random() * (b - a);

function note(
  a: AudioSystem,
  dest: Dest,
  at: number,
  f0: number,
  f1: number,
  dur: number,
  gain: number,
  type: OscillatorType = 'sine',
  attack = 0.008,
): void {
  a.tone({ at, duration: dur, freq: f0, freqEnd: f1, type, gain, attack, dest });
}

/** Pardal: "tchip" curtos e repetidos; no alarme, um chiado rápido. */
const pardal: SongFn = (a, dest, alarm) => {
  let t = 0;
  const n = alarm ? 6 : 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    if (alarm) a.noiseBurst({ at: t, duration: 0.045, type: 'bandpass', freq: 4200, q: 4, gain: 0.35, dest });
    else note(a, dest, t, r(4000, 4600), r(3000, 3400), 0.07, 0.25);
    t += alarm ? 0.09 : r(0.13, 0.2);
  }
  return t + 0.1;
};

/** Sabiá: frase melodiosa de notas flautadas com glissandos; no alarme, "tchók" secos. */
const sabia: SongFn = (a, dest, alarm) => {
  let t = 0;
  if (alarm) {
    for (let i = 0; i < 4; i++) {
      note(a, dest, t, 1500, 1250, 0.06, 0.3, 'triangle');
      t += 0.18;
    }
    return t;
  }
  const scale = [1760, 1976, 2217, 2349, 2637, 2960, 3136];
  const n = 5 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const f = scale[Math.floor(Math.random() * scale.length)] * r(0.97, 1.03);
    const dur = r(0.12, 0.32);
    if (Math.random() < 0.3) {
      note(a, dest, t, f * 1.25, f, 0.04, 0.12);
      t += 0.05;
    }
    note(a, dest, t, f, f * (Math.random() < 0.5 ? r(0.85, 0.95) : r(1.05, 1.18)), dur, 0.22, 'sine', 0.03);
    t += dur + r(0.04, 0.14);
  }
  return t;
};

/** Pisco: trinado agudo e descendente; no alarme, "tic" espaçados. */
const pisco: SongFn = (a, dest, alarm) => {
  const n = alarm ? 5 : 8 + Math.floor(Math.random() * 7);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const f = alarm ? 6800 : 6500 - (i / n) * 1900;
    note(a, dest, t, f, f * 0.93, alarm ? 0.02 : 0.035, alarm ? 0.2 : 0.18);
    t += alarm ? 0.12 : 0.055;
  }
  return t + 0.1;
};

/** Gralha-azul: "kré-kré" rouco e forte. */
const gralha: SongFn = (a, dest, alarm) => {
  const n = alarm ? 5 : 2 + Math.floor(Math.random() * 3);
  let t = 0;
  for (let i = 0; i < n; i++) {
    a.tone({
      at: t,
      duration: 0.16,
      freq: r(1050, 1150),
      freqEnd: 780,
      type: 'sawtooth',
      gain: 0.28,
      attack: 0.01,
      dest,
      filter: { type: 'bandpass', freq: 1400, q: 1.5 },
    });
    a.noiseBurst({ at: t, duration: 0.14, type: 'bandpass', freq: 1800, q: 1.2, gain: 0.1, dest });
    t += alarm ? 0.2 : 0.3;
  }
  return t;
};

/** Rolinha: arrulho grave; não tem alarme (o susto é só o bater de asas). */
const rolinha: SongFn = (a, dest, alarm) => {
  if (alarm) return 0;
  const notes: [number, number, number][] = [
    [620, 600, 0.22],
    [560, 540, 0.16],
    [520, 470, 0.42],
  ];
  let t = 0;
  for (const [f0, f1, d] of notes) {
    note(a, dest, t, f0, f1, d, 0.25, 'sine', 0.06);
    t += d + 0.08;
  }
  return t;
};

/** Gavião: grito agudo e longo "kiiii-ér" (ouvido de longe). */
const gaviao: SongFn = (a, dest) => {
  const n = Math.random() < 0.5 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    a.tone({
      at: i * 1.2,
      duration: 0.85,
      freq: 3300,
      freqEnd: 2100,
      type: 'sawtooth',
      gain: 0.3,
      attack: 0.05,
      dest,
      filter: { type: 'bandpass', freq: 2600, q: 2 },
    });
  }
  return n * 1.2;
};

/** Pato: "quá-quá" nasal e rouco, em série; no alarme, mais rápido e mais alto. */
const pato: SongFn = (a, dest, alarm) => {
  const n = alarm ? 5 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 4);
  const gap = alarm ? 0.16 : r(0.26, 0.38);
  for (let i = 0; i < n; i++) {
    const f = r(620, 760) * (alarm ? 1.15 : 1) * (1 - i * 0.04);
    a.tone({
      at: i * gap,
      duration: 0.15,
      freq: f,
      freqEnd: f * 0.72,
      type: 'sawtooth',
      gain: alarm ? 0.4 : 0.3,
      attack: 0.012,
      dest,
      filter: { type: 'bandpass', freq: 1250, q: 2.2 },
    });
    a.noiseBurst({ at: i * gap, duration: 0.07, type: 'bandpass', freq: 1800, q: 1.5, gain: 0.12, dest });
  }
  return n * gap + 0.15;
};

export const SONGS: Record<string, SongFn> = { pardal, sabia, pisco, gralha, rolinha, gaviao, pato };

/** Pato entrando ou saindo da água: chape mais o chuvisco. */
export function waterSplash(a: AudioSystem, dest: Dest, size = 1): void {
  a.noiseBurst({ duration: 0.13 * size, type: 'lowpass', freq: 900, gain: 0.5 * size, attack: 0.006, dest });
  a.tone({ duration: 0.22, freq: 300, freqEnd: 620, type: 'sine', gain: 0.14 * size, attack: 0.01, dest });
  a.noiseBurst({ at: 0.07, duration: 0.3 * size, type: 'highpass', freq: 2400, gain: 0.16 * size, attack: 0.03, dest });
}

/** Bater de asas ao decolar, no ritmo das batidas da espécie. */
export function wingFlutter(a: AudioSystem, dest: Dest, hz: number, count = 8): number {
  for (let i = 0; i < count; i++) {
    a.noiseBurst({ at: i / hz, duration: 0.05, type: 'bandpass', freq: r(800, 1400), q: 1, gain: 0.75 * (1 - i / count), dest });
  }
  return count / hz;
}

/** Corpo caindo no chão. */
export function corpseThud(a: AudioSystem, dest: Dest): void {
  a.noiseBurst({ duration: 0.07, type: 'lowpass', freq: 260, gain: 1.0, dest });
  a.noiseBurst({ at: 0.01, duration: 0.12, type: 'bandpass', freq: 2500, q: 0.8, gain: 0.25, dest });
}
