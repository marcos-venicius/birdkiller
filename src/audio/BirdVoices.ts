import type * as THREE from 'three';
import type { Bird, BirdState } from '../birds/Bird';
import type { AudioSystem } from './AudioSystem';
import { corpseThud, SONGS, wingFlutter } from './birdSongs';

interface Voice {
  /** Intervalo entre cantos quando pousado (s); voando, canta menos. */
  gap: [number, number];
  /** Além disto o canto nem é tocado (inaudível na prática). */
  range: number;
  /** Distância de referência da atenuação (m) — maior = mais alto. */
  ref: number;
}

const VOICES: Record<string, Voice> = {
  pardal: { gap: [3, 9], range: 90, ref: 4 },
  sabia: { gap: [6, 16], range: 140, ref: 8 },
  pisco: { gap: [4, 12], range: 100, ref: 5 },
  gralha: { gap: [8, 20], range: 160, ref: 10 },
  rolinha: { gap: [7, 18], range: 110, ref: 6 },
  gaviao: { gap: [15, 35], range: 300, ref: 20 },
};

/** Máximo de cantos soando ao mesmo tempo. */
const MAX_VOICES = 6;

const r = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Sons dos pássaros vindos da posição de cada um: cantos periódicos, alarme ao fugir,
 * bater de asas ao decolar perto do jogador e baque do corpo no chão.
 * Detecta as mudanças de estado observando os pássaros (sem acoplar áudio ao comportamento).
 */
export class BirdVoices {
  readonly stats = { songs: 0, alarms: 0, flutters: 0, thuds: 0 };
  private readonly timers = new WeakMap<Bird, number>();
  private readonly states = new WeakMap<Bird, BirdState>();
  private busyUntil: number[] = [];

  constructor(private readonly audio: AudioSystem) {}

  /** `night` (0..1): à noite os pássaros quase não cantam. */
  update(dt: number, birds: readonly Bird[], listener: THREE.Vector3, night = 0): void {
    const a = this.audio;
    if (!a.ready) return;
    const now = a.now;
    this.busyUntil = this.busyUntil.filter((t) => t > now);

    for (const bird of birds) {
      const v = VOICES[bird.species.id];
      const prev = this.states.get(bird);
      const state = bird.state;
      this.states.set(bird, state);
      const d = bird.pos.distanceTo(listener);
      if (prev !== undefined && prev !== state) this.onTransition(bird, prev, state, d, v);
      if (!bird.alive || state === 'fleeing') continue;

      let t = this.timers.get(bird) ?? r(0.5, v.gap[1]);
      t -= dt;
      if (t <= 0) {
        t = r(v.gap[0], v.gap[1]) * (state === 'perched' ? 1 : 2.5);
        if (d < v.range && this.busyUntil.length < MAX_VOICES && Math.random() >= night * 0.85) this.sing(bird, v, false);
      }
      this.timers.set(bird, t);
    }
  }

  private onTransition(bird: Bird, prev: BirdState, state: BirdState, d: number, v: Voice): void {
    const a = this.audio;
    const wasSitting = prev === 'perched' || prev === 'landing';
    if (wasSitting && (state === 'flying' || state === 'fleeing') && d < 35) {
      wingFlutter(a, a.spatial(bird.pos, 'birds', 2), bird.species.flapHz);
      this.stats.flutters++;
    }
    if (state === 'fleeing' && d < v.range * 0.7 && Math.random() < 0.7 && this.busyUntil.length < MAX_VOICES) {
      this.sing(bird, v, true);
    }
    if (prev === 'falling' && state === 'dead' && d < 60) {
      corpseThud(a, a.spatial(bird.pos, 'birds', 3));
      this.stats.thuds++;
    }
  }

  private sing(bird: Bird, v: Voice, alarm: boolean): void {
    const a = this.audio;
    const duration = SONGS[bird.species.id](a, a.spatial(bird.pos, 'birds', v.ref), alarm);
    if (duration <= 0) return;
    this.busyUntil.push(a.now + duration);
    if (alarm) this.stats.alarms++;
    else this.stats.songs++;
  }
}
