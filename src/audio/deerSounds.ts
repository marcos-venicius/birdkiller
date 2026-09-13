import type { AudioSystem } from './AudioSystem';

type Dest = AudioNode | null;

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Balido curto e nasal, grave — o chamado ocioso. */
export function bleat(a: AudioSystem, dest: Dest): void {
  const f = r(300, 380);
  a.tone({
    duration: 0.32,
    freq: f,
    freqEnd: f * 0.78,
    type: 'sawtooth',
    gain: 0.65,
    attack: 0.03,
    dest,
    filter: { type: 'bandpass', freq: 900, q: 2.5 },
  });
  a.noiseBurst({ duration: 0.28, type: 'bandpass', freq: 1100, q: 2, gain: 0.18, attack: 0.04, dest });
}

/**
 * Latido de alarme: um "bau!" rouco e seco que o veado solta antes de disparar.
 * É o som que entrega o bicho a quem está longe.
 */
export function bark(a: AudioSystem, dest: Dest): void {
  const n = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const at = i * r(0.55, 0.8);
    a.tone({
      at,
      duration: 0.13,
      freq: r(220, 280),
      freqEnd: 130,
      type: 'sawtooth',
      gain: 0.9,
      attack: 0.006,
      dest,
      filter: { type: 'bandpass', freq: 750, q: 1.8 },
    });
    a.noiseBurst({ at, duration: 0.12, type: 'bandpass', freq: 1500, q: 1.2, gain: 0.55, attack: 0.004, dest });
  }
}

/** Berro de dor: mais agudo e aberto que o balido. */
export function deerCry(a: AudioSystem, dest: Dest, dying: boolean): void {
  const filter = { type: 'bandpass' as const, freq: 1300, q: 2 };
  a.tone({ duration: 0.3, freq: 520, freqEnd: 900, type: 'sawtooth', gain: 0.5, attack: 0.02, dest, filter });
  a.tone({ at: 0.26, duration: dying ? 0.45 : 0.7, freq: 900, freqEnd: 420, type: 'sawtooth', gain: 0.42, dest, filter });
}

/** Disparada aos saltos: dois baques secos por salto, bem espaçados. */
export function deerGallop(a: AudioSystem, dest: Dest): void {
  for (let i = 0; i < 2; i++) {
    const at = i * 0.12 + r(0, 0.02);
    a.noiseBurst({ at, duration: 0.07, type: 'lowpass', freq: 190, gain: 0.9, dest });
    a.noiseBurst({ at, duration: 0.05, type: 'bandpass', freq: r(2400, 3600), q: 1.2, gain: 0.28, dest });
  }
}

/** Passo calmo na folhagem, mais leve que o do javali. */
export function deerWalk(a: AudioSystem, dest: Dest): void {
  a.noiseBurst({ duration: 0.05, type: 'bandpass', freq: r(2200, 3200), q: 1.2, gain: 0.1, dest });
  a.noiseBurst({ duration: 0.04, type: 'lowpass', freq: 200, gain: 0.1, dest });
}

/** Pastando: arrancar tufos de capim. */
export function grazing(a: AudioSystem, dest: Dest): void {
  for (let i = 0; i < 2; i++) {
    a.noiseBurst({ at: i * 0.22 + r(0, 0.05), duration: 0.12, type: 'bandpass', freq: r(2600, 3600), q: 1, gain: 0.12, attack: 0.02, dest });
  }
}

/** Bebendo: lambidas curtas na água. */
export function lapping(a: AudioSystem, dest: Dest): void {
  for (let i = 0; i < 3; i++) {
    const at = i * 0.16 + r(0, 0.04);
    a.noiseBurst({ at, duration: 0.05, type: 'bandpass', freq: r(900, 1500), q: 1.5, gain: 0.7, dest });
    a.tone({ at, duration: 0.07, freq: r(240, 340), freqEnd: 180, type: 'sine', gain: 0.32, attack: 0.005, dest });
  }
}
