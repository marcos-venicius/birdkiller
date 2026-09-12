import type * as THREE from 'three';
import type { Boar, BoarState } from '../animals/Boar';
import type { AudioSystem } from './AudioSystem';
import { grunt, heavyThud, hooves, rooting, snort, squeal, trot } from './boarSounds';

interface Timers {
  grunt: number;
  root: number;
  step: number;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Sons dos javalis vindos da posição de cada um: grunhidos e fuçadas enquanto comem, bufada no
 * alerta e na fuga, galope, grito ao ser ferido ou morto e o baque do corpo. Observa os estados
 * (não acopla áudio ao comportamento), como o BirdVoices.
 */
export class BoarVoices {
  readonly stats = { grunts: 0, snorts: 0, squeals: 0, hooves: 0, thuds: 0, rooting: 0 };
  private readonly timers = new WeakMap<Boar, Timers>();
  private readonly states = new WeakMap<Boar, BoarState>();
  private readonly health = new WeakMap<Boar, number>();

  constructor(private readonly audio: AudioSystem) {}

  update(dt: number, boars: readonly Boar[], listener: THREE.Vector3): void {
    const a = this.audio;
    if (!a.ready) return;
    for (const boar of boars) {
      const prev = this.states.get(boar);
      const state = boar.state;
      this.states.set(boar, state);
      const prevHealth = this.health.get(boar);
      this.health.set(boar, boar.health);
      const d = boar.pos.distanceTo(listener);
      const here = () => a.spatial(boar.group.position, 'birds', 6);

      if (prev !== undefined && prev !== state) {
        if ((state === 'alert' || (state === 'flee' && prev !== 'alert')) && d < 90) {
          snort(a, here());
          this.stats.snorts++;
        }
        if (state === 'dying' && d < 150) {
          squeal(a, here(), true);
          this.stats.squeals++;
        }
        if (state === 'dead' && prev === 'dying' && d < 80) {
          heavyThud(a, here());
          this.stats.thuds++;
        }
      }
      if (prevHealth !== undefined && boar.health < prevHealth && boar.alive && d < 200) {
        squeal(a, here(), false);
        this.stats.squeals++;
      }
      if (!boar.alive) continue;

      const t = this.timers.get(boar) ?? { grunt: r(1, 8), root: r(0.5, 3), step: 0 };
      t.grunt -= dt;
      t.root -= dt;
      t.step -= dt;
      if ((state === 'forage' || state === 'walk') && t.grunt <= 0) {
        t.grunt = r(4, 12);
        if (d < 70) {
          grunt(a, here());
          this.stats.grunts++;
        }
      }
      if (state === 'forage' && t.root <= 0) {
        t.root = r(1.2, 3);
        if (d < 30) {
          rooting(a, here());
          this.stats.rooting++;
        }
      }
      if (t.step <= 0 && boar.speed > 0.4) {
        const galloping = boar.speed > 3;
        t.step = galloping ? 0.34 : 0.55;
        if (galloping && d < 90) {
          hooves(a, here());
          this.stats.hooves++;
        } else if (!galloping && d < 25) {
          trot(a, here());
        }
      }
      this.timers.set(boar, t);
    }
  }
}
