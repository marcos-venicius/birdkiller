import type { AudioSystem } from './AudioSystem';

const r = (a: number, b: number) => a + Math.random() * (b - a);

/** Gotas pingando na água em volta: "plink" curto subindo de tom. */
function drop(a: AudioSystem, at: number, gain: number): void {
  const f = r(1300, 2800);
  a.tone({ at, duration: 0.03, freq: f, freqEnd: f * r(1.3, 1.6), gain, attack: 0.003, bus: 'steps' });
}

/**
 * Pé na água. No raso, um "chape" com respingo fino; quanto mais funda, mais grave e cheio, e a perna
 * empurrando a água vira um "xuá" arrastado. `depth` = água sobre o pé (m).
 */
export function waterStep(a: AudioSystem, gain: number, depth: number, landing = false): void {
  // Mais alto que o passo na grama (água espirra), mas sem dominar o ambiente.
  const g = gain * 0.65 * r(0.85, 1.15);
  const deep = Math.min(Math.max(depth, 0) / 0.9, 1);
  // O pé batendo na lâmina.
  a.noiseBurst({
    duration: landing ? 0.22 : 0.08 + 0.07 * deep,
    type: 'lowpass',
    freq: r(1200, 1600) - 600 * deep,
    gain: g * (landing ? 1 : 0.6),
    attack: 0.004,
    bus: 'steps',
  });
  // Respingo: gotinhas caindo de volta (mais agudo e solto no raso).
  a.noiseBurst({
    at: 0.03,
    duration: (landing ? 0.5 : 0.16) + 0.12 * deep,
    type: 'highpass',
    freq: r(2600, 3600),
    gain: g * (landing ? 0.3 : 0.14 + 0.08 * (1 - deep)),
    attack: 0.02,
    bus: 'steps',
  });
  // "Blup" do ar preso pelo pé.
  a.tone({ at: r(0, 0.03), duration: 0.07, freq: r(380, 520), freqEnd: r(800, 1100), gain: g * 0.07, attack: 0.005, bus: 'steps' });
  // Perna atravessando a água funda.
  if (deep > 0.15) {
    a.noiseBurst({ duration: 0.3 + 0.2 * deep, type: 'bandpass', freq: 420, freqEnd: 1100, q: 1.2, gain: g * 0.55 * deep, attack: 0.08, bus: 'steps' });
  }
  const drops = landing ? 6 : 1 + Math.round(deep * 2);
  for (let i = 0; i < drops; i++) drop(a, r(0.1, landing ? 0.7 : 0.35), g * 0.04);
}

/**
 * Uma braçada: a mão entrando, o puxão da água para trás e o braço saindo, escorrendo.
 * `effort` 0 = só batendo as pernas parado, 1 = nadando, 1,5 = nadando rápido.
 */
export function swimStroke(a: AudioSystem, effort: number): void {
  const g = (0.2 + 0.25 * effort) * r(0.85, 1.15);
  a.noiseBurst({ duration: 0.08, type: 'lowpass', freq: r(1300, 1700), gain: g * 0.4, attack: 0.004, bus: 'steps' });
  a.tone({ at: 0.01, duration: 0.06, freq: r(420, 560), freqEnd: r(900, 1200), gain: g * 0.05, bus: 'steps' });
  a.noiseBurst({ at: 0.05, duration: 0.5, type: 'bandpass', freq: 380, freqEnd: 950, q: 1.1, gain: g * 0.6, attack: 0.15, bus: 'steps' });
  a.noiseBurst({ at: 0.35, duration: 0.35, type: 'highpass', freq: 2800, gain: g * 0.1 * Math.min(effort + 0.3, 1), attack: 0.05, bus: 'steps' });
  for (let i = 0; i < 2 + Math.round(effort * 2); i++) drop(a, r(0.4, 0.85), g * 0.035);
}

/** O pé deixa o fundo: o corpo afunda até o peito e sobe boiando, com bolhas. */
export function plunge(a: AudioSystem): void {
  a.noiseBurst({ duration: 0.4, type: 'lowpass', freq: 800, freqEnd: 320, gain: 0.42, attack: 0.03, bus: 'steps' });
  a.noiseBurst({ at: 0.05, duration: 0.5, type: 'highpass', freq: 2200, gain: 0.08, attack: 0.05, bus: 'steps' });
  for (let i = 0; i < 5; i++) {
    a.tone({ at: r(0.05, 0.45), duration: 0.05, freq: r(280, 480), freqEnd: r(600, 900), gain: 0.04, attack: 0.004, bus: 'steps' });
  }
}

/** Voltando a pisar no fundo: a água escorrendo da roupa e do rifle, e pingos rareando por alguns segundos. */
export function drips(a: AudioSystem, seconds = 3): void {
  a.noiseBurst({ duration: 0.9, type: 'highpass', freq: 3000, freqEnd: 4500, gain: 0.06, attack: 0.05, bus: 'steps' });
  const n = 14;
  for (let i = 0; i < n; i++) drop(a, (i / n) ** 1.6 * seconds + r(0, 0.12), 0.05 * (1 - i / (n + 2)));
}

/** Pé na lama encharcada logo fora da água: um "chup" grave e o pé soltando. `mud` 0..1. */
export function mudStep(a: AudioSystem, gain: number, mud: number): void {
  a.noiseBurst({ duration: 0.12, type: 'bandpass', freq: r(500, 700), freqEnd: r(250, 350), q: 2, gain: gain * 0.45 * mud, attack: 0.01, bus: 'steps' });
  a.noiseBurst({ at: 0.07, duration: 0.08, type: 'bandpass', freq: r(1100, 1500), freqEnd: r(1800, 2400), q: 3, gain: gain * 0.2 * mud, attack: 0.02, bus: 'steps' });
}
