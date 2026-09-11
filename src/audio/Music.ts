import { CONFIG } from '../config';
import type { AudioSystem } from './AudioSystem';

/**
 * Música de fundo generativa no estilo "RPG de exploração": cordas suaves, baixo, harpa em
 * arpejos, melodia de flauta/ocarina e sininhos. A melodia é composta por motivos (repetição,
 * sequência, resposta e cadência), não notas soltas; cada seção muda de tom e de progressão.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** Progressões clássicas (graus da escala maior, 0 = I ... 5 = vi), um acorde por compasso. */
const PROGRESSIONS = [
  [0, 4, 5, 3], // I V vi IV
  [3, 4, 2, 5], // IV V iii vi
  [0, 5, 3, 4], // I vi IV V
  [5, 3, 0, 4], // vi IV I V
  [0, 3, 5, 4], // I IV vi V
  [3, 0, 4, 5], // IV I V vi
  [1, 4, 0, 5], // ii V I vi
  [0, 2, 3, 4], // I iii IV V
];
/** Tônicas (MIDI): Ré, Dó, Fá, Sol, Lá, Mi. */
const TONICS = [62, 60, 65, 67, 57, 64];
/** Ritmos de motivo de 2 compassos em colcheias (negativo = pausa). */
const RHYTHMS = [
  [2, 2, 3, 1, 4, 4],
  [3, 1, 2, 2, 6, -2],
  [2, 1, 1, 2, 2, 4, 4],
  [4, 2, 2, 3, 1, 4],
  [1, 1, 2, 2, 2, 6, -2],
  [2, 2, 2, 2, 8],
];
/** Padrões de arpejo (índices em [fundamental, 3ª, 5ª, 8ª, 10ª]) para as 8 colcheias do compasso. */
const ARPS = [
  [0, 1, 2, 3, 4, 3, 2, 1],
  [0, 2, 3, 2, 4, 2, 3, 2],
  [0, 1, 2, 1, 3, 1, 2, 1],
  [0, 2, 1, 3, 2, 4, 3, 2],
];
/** Faixa da melodia em graus acima da tônica (uma oitava acima até a 10ª seguinte). */
const LOW = 6;
const HIGH = 16;
/** Quanto tempo à frente as notas são agendadas (s). */
const LOOKAHEAD = 1.2;
const PREF_KEY = 'birdkiller.music';

interface Note {
  /** Início e duração em colcheias desde o começo da seção. */
  start: number;
  dur: number;
  deg: number;
}

interface Section {
  tonic: number;
  eighth: number;
  prog: number[];
  arp: number[];
  bars: number;
  /** Compasso em que a melodia entra (introdução só com cordas e harpa antes). */
  melodyFrom: number;
  melody: Note[];
}

interface Motif {
  rhythm: number[];
  steps: number[];
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function degMidi(tonic: number, deg: number): number {
  const octave = Math.floor(deg / 7);
  return tonic + 12 * octave + MAJOR[deg - 7 * octave];
}

function isChordTone(deg: number, root: number): boolean {
  const d = (((deg - root) % 7) + 7) % 7;
  return d === 0 || d === 2 || d === 4;
}

function nearestChordTone(deg: number, root: number): number {
  for (const off of [0, 1, -1, 2, -2, 3, -3]) if (isChordTone(deg + off, root)) return deg + off;
  return deg;
}

/** Motivo = ritmo + contorno (passos na escala, sobretudo graus conjuntos). */
function makeMotif(): Motif {
  const rhythm = pick(RHYTHMS);
  const steps = rhythm.map((_, i) => {
    if (i === 0) return 0;
    const x = Math.random();
    return x < 0.32 ? 1 : x < 0.64 ? -1 : x < 0.76 ? 2 : x < 0.88 ? -2 : x < 0.94 ? 3 : -3;
  });
  return { rhythm, steps };
}

/** Toca o motivo sobre dois compassos a partir do grau `start`; tempos fortes caem em notas do acorde. */
function realize(m: Motif, chords: [number, number], start: number, bar0: number, out: Note[]): number {
  let deg = start;
  let pos = 0;
  for (let i = 0; i < m.rhythm.length; i++) {
    const d = m.rhythm[i];
    if (d < 0) {
      pos -= d;
      continue;
    }
    deg += m.steps[i];
    if (deg < LOW || deg > HIGH) deg -= 2 * m.steps[i];
    deg = Math.min(Math.max(deg, LOW), HIGH);
    const chord = chords[pos < 8 ? 0 : 1];
    if (pos % 4 === 0 || d >= 4) deg = nearestChordTone(deg, chord);
    out.push({ start: bar0 * 8 + pos, dur: d, deg });
    pos += d;
  }
  return deg;
}

/** Frase de 8 compassos: A, A em sequência, B (resposta) e A com cadência numa nota longa. */
function phrase(sec: Section, b: number, out: Note[]): void {
  const ch = (bar: number) => sec.prog[bar % 4];
  const A = makeMotif();
  const B = makeMotif();
  const start = nearestChordTone(9 + Math.floor(rand(-2, 3)), ch(b));
  realize(A, [ch(b), ch(b + 1)], start, b, out);
  let last = realize(A, [ch(b + 2), ch(b + 3)], start + pick([1, 2, -1]), b + 2, out);
  last = realize(B, [ch(b + 4), ch(b + 5)], last, b + 4, out);
  realize(A, [ch(b + 6), ch(b + 7)], start, b + 6, out);
  // Cadência: a última nota vira uma nota longa do acorde final, de preferência a tônica.
  const end = out[out.length - 1];
  const root = ch(b + 7);
  const home = Math.abs(end.deg - 7) < Math.abs(end.deg - 14) ? 7 : 14;
  end.deg = isChordTone(home, root) ? home : nearestChordTone(home, root);
  end.dur = (b + 8) * 8 - end.start;
}

function makeSection(prevTonic: number, intro: boolean): Section {
  const sec: Section = {
    tonic: pick(TONICS.filter((t) => t !== prevTonic)),
    eighth: 30 / rand(70, 84),
    prog: pick(PROGRESSIONS),
    arp: pick(ARPS),
    bars: 0,
    melodyFrom: intro ? 4 : 2,
    melody: [],
  };
  // Introdução/transição + duas frases de 8 compassos + 1 compasso de respiro.
  sec.bars = sec.melodyFrom + 16 + 1;
  phrase(sec, sec.melodyFrom, sec.melody);
  const second = Math.random();
  if (second < 0.4) {
    phrase(sec, sec.melodyFrom + 8, sec.melody);
  } else if (second < 0.75) {
    // Repete a primeira frase (o "tema" volta), às vezes uma oitava acima em partes.
    const up = Math.random() < 0.4;
    for (const n of sec.melody.slice()) {
      const deg = up && n.deg + 7 <= HIGH + 4 && Math.random() < 0.5 ? n.deg + 7 : n.deg;
      sec.melody.push({ start: n.start + 64, dur: n.dur, deg });
    }
  }
  // Senão: a segunda metade fica só com harpa e cordas.
  return sec;
}

function loadPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function savePref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    // Sem armazenamento (janela privada etc.): só não lembra a escolha.
  }
}

export class Music {
  enabled = loadPref();
  private section: Section | null = null;
  private bar = 0;
  private nextTime = 0;
  private started = false;
  private prevTonic = 0;

  constructor(private readonly audio: AudioSystem) {}

  /** Liga/desliga com fade; a escolha fica salva neste navegador. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    this.audio.setBusGain('music', this.enabled ? CONFIG.audio.buses.music : 0, 1.5);
    savePref(this.enabled);
    return this.enabled;
  }

  update(): void {
    const a = this.audio;
    if (!a.ready) return;
    const now = a.now;
    if (!this.started) {
      this.started = true;
      this.nextTime = now + CONFIG.audio.musicDelay;
      if (!this.enabled) a.setBusGain('music', 0, 0.01);
    }
    if (!this.enabled) {
      this.nextTime = Math.max(this.nextTime, now + 0.3);
      return;
    }
    // Voltando de uma pausa longa (aba escondida): não tenta recuperar compassos atrasados.
    if (this.nextTime < now - 0.05) this.nextTime = now + 0.05;
    while (this.nextTime < now + LOOKAHEAD) {
      if (!this.section || this.bar >= this.section.bars) {
        const first = !this.section;
        this.section = makeSection(this.prevTonic, first);
        this.prevTonic = this.section.tonic;
        this.bar = 0;
        // Às vezes a música respira: um tempo só com os sons da floresta.
        if (!first && Math.random() < 0.35) {
          this.nextTime += rand(15, 35);
          continue;
        }
      }
      this.scheduleBar(this.section, this.bar, this.nextTime);
      this.nextTime += this.section.eighth * 8;
      this.bar++;
    }
  }

  /** Testes: agenda `seconds` de música a partir de agora (no contexto atual, ex.: offline). */
  debugSchedule(seconds: number): void {
    const sec = makeSection(0, true);
    const barDur = sec.eighth * 8;
    for (let bar = 0; bar * barDur < seconds && bar < sec.bars; bar++) this.scheduleBar(sec, bar, this.audio.now + bar * barDur);
  }

  private scheduleBar(sec: Section, bar: number, t: number): void {
    const a = this.audio;
    const e = sec.eighth;
    const barDur = e * 8;
    const at = t - a.now;
    const last = bar === sec.bars - 1;
    const root = last ? 0 : sec.prog[bar % 4];
    const low = sec.tonic - 12;

    // Cordas: tríade (às vezes com nona) com ataque e release lentos.
    const pad = [root, root + 2, root + 4];
    if (Math.random() < 0.3) pad.push(root + 8);
    for (const d of pad) {
      a.voice({
        at,
        freq: hz(degMidi(low, d)),
        duration: barDur * (last ? 1.5 : 1),
        attack: 1,
        release: last ? 4 : 2,
        gain: 0.018,
        type: 'sawtooth',
        detune: 7,
        filter: { type: 'lowpass', freq: 1000, q: 0.4 },
        bus: 'music',
      });
    }
    if (last) return;

    // Baixo.
    a.voice({ at, freq: hz(degMidi(sec.tonic - 24, root)), duration: barDur * 0.85, attack: 0.04, release: 0.8, gain: 0.08, bus: 'music' });

    // Harpa: arpejo em colcheias (o primeiro compasso da música é só cordas).
    if (!(sec.melodyFrom === 4 && bar === 0)) {
      const tones = [root, root + 2, root + 4, root + 7, root + 9];
      for (let i = 0; i < 8; i++) this.pluck(at + i * e, degMidi(low, tones[sec.arp[i]]), i % 4 === 0 ? 0.06 : 0.042);
    }

    // Melodia.
    for (const n of sec.melody) {
      if (n.start < bar * 8 || n.start >= bar * 8 + 8) continue;
      this.flute(at + (n.start - bar * 8) * e, degMidi(sec.tonic, n.deg), n.dur * e);
    }

    // Sininho no fim de algumas frases.
    if (bar % 8 === 7 && Math.random() < 0.5) this.bell(at + e * 6, degMidi(sec.tonic + 12, root + 4));
  }

  private pluck(at: number, midi: number, gain: number): void {
    const a = this.audio;
    a.voice({ at, freq: hz(midi), duration: 0.03, attack: 0.004, release: 1.4, gain, type: 'triangle', bus: 'music' });
    a.voice({ at, freq: hz(midi + 12), duration: 0.02, attack: 0.003, release: 0.7, gain: gain * 0.25, bus: 'music' });
  }

  private flute(at: number, midi: number, dur: number): void {
    this.audio.voice({
      at,
      freq: hz(midi),
      duration: dur * 0.92,
      attack: 0.06,
      release: 0.35,
      gain: 0.07,
      type: 'triangle',
      sustain: 0.8,
      decay: 0.4,
      vibrato: { rate: 5.2, depth: 14 },
      filter: { type: 'lowpass', freq: 2200 },
      bus: 'music',
    });
  }

  private bell(at: number, midi: number): void {
    const a = this.audio;
    a.voice({ at, freq: hz(midi), duration: 0.02, attack: 0.003, release: 2.5, gain: 0.03, bus: 'music' });
    a.voice({ at, freq: hz(midi) * 2.76, duration: 0.02, attack: 0.003, release: 1.2, gain: 0.01, bus: 'music' });
  }
}
