import type * as THREE from 'three';
import type { AnimalState, Quadruped } from '../animals/Quadruped';
import type { AudioSystem } from './AudioSystem';
import { CONFIG } from '../config';
import type { AnimalSounds } from '../animals/kinds';

interface Timers {
  grunt: number;
  root: number;
  step: number;
  groan: number;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Sons dos quadrúpedes vindos da posição de cada um: chamado e barulho de comer, alarme ao se
 * assustar e na fuga, passos, grito ao ser ferido ou morto e o baque do corpo. Observa os estados
 * (não acopla áudio ao comportamento), como o BirdVoices. Cada espécie traz o seu conjunto de sons.
 */
export class AnimalVoices {
  readonly stats = { grunts: 0, snorts: 0, squeals: 0, hooves: 0, thuds: 0, rooting: 0, drinking: 0 };
  private readonly timers = new WeakMap<Quadruped, Timers>();
  private readonly states = new WeakMap<Quadruped, AnimalState>();
  private readonly health = new WeakMap<Quadruped, number>();

  constructor(
    private readonly audio: AudioSystem,
    private readonly sounds: AnimalSounds,
  ) {}

  update(dt: number, animals: readonly Quadruped[], listener: THREE.Vector3): void {
    const a = this.audio;
    if (!a.ready) return;
    const S = this.sounds;
    const far = S.range;
    for (const animal of animals) {
      const prev = this.states.get(animal);
      const state = animal.state;
      this.states.set(animal, state);
      const prevHealth = this.health.get(animal);
      this.health.set(animal, animal.health);
      const d = animal.pos.distanceTo(listener);
      const here = () => a.spatial(animal.group.position, 'birds', 6);

      if (prev !== undefined && prev !== state) {
        if ((state === 'alert' || (state === 'flee' && prev !== 'alert')) && d < 90 * far) {
          S.alarm(a, here());
          this.stats.snorts++;
        }
        if (state === 'dying' && d < 150 * far) {
          S.hurt(a, here(), true);
          this.stats.squeals++;
        }
        if (state === 'dead' && prev === 'dying' && d < 80 * far) {
          S.thud(a, here());
          this.stats.thuds++;
        }
      }
      if (prevHealth !== undefined && animal.health < prevHealth && animal.alive && d < 200 * far) {
        S.hurt(a, here(), false);
        this.stats.squeals++;
      }
      if (!animal.alive) continue;

      const t = this.timers.get(animal) ?? { grunt: r(1, 8), root: r(0.5, 3), step: 0, groan: r(2, 6) };
      t.grunt -= dt;
      t.root -= dt;
      t.step -= dt;
      t.groan -= dt;
      if (animal.wounded && t.groan <= 0) {
        t.groan = r(CONFIG.wounded.groanEvery[0], CONFIG.wounded.groanEvery[1]);
        if (d < 60 * far) S.groan(a, here());
      }
      if ((state === 'forage' || state === 'walk' || state === 'drink') && t.grunt <= 0) {
        t.grunt = r(4, 12);
        if (d < 70 * far) {
          S.idle(a, here());
          this.stats.grunts++;
        }
      }
      if (state === 'drink' && t.root <= 0) {
        t.root = r(1.4, 2.6);
        if (d < 35 * far) {
          S.drink(a, here());
          this.stats.drinking++;
        }
      }
      if (state === 'forage' && t.root <= 0) {
        t.root = r(1.2, 3);
        if (d < 30 * far) {
          S.feed(a, here());
          this.stats.rooting++;
        }
      }
      if (t.step <= 0 && animal.speed > 0.4) {
        const galloping = animal.speed > 3;
        t.step = galloping ? 0.34 : 0.55;
        if (galloping && d < 90 * far) {
          S.gallop(a, here());
          this.stats.hooves++;
        } else if (!galloping && d < 25 * far) {
          S.walk(a, here());
        }
      }
      this.timers.set(animal, t);
    }
  }
}
