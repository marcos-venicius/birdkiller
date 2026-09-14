import type * as THREE from 'three';
import type { Dog, DogState } from '../animals/Dog';
import type { AudioSystem } from './AudioSystem';
import { pant, paw, sniff, whine } from './dogSounds';

const r = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Sons do cão, vindos da posição dele: fungadas seguindo o faro, o ganido baixo ao apontar, o arfar
 * depois de correr e os passos. Observa os estados (não acopla áudio ao comportamento), como o AnimalVoices.
 */
export class DogVoice {
  private prev: DogState | null = null;
  private sniffTimer = 1;
  private stepTimer = 0;
  private pantTimer = 0;
  /** Cansaço acumulado correndo (s): some aos poucos parado. */
  private tired = 0;

  constructor(private readonly audio: AudioSystem) {}

  update(dt: number, dog: Dog, listener: THREE.Vector3): void {
    const a = this.audio;
    if (!a.ready) return;
    const d = dog.pos.distanceTo(listener);
    const here = () => a.spatial(dog.group.position, 'birds', 4);
    if (dog.state !== this.prev) {
      if (dog.state === 'point' && d < 70) whine(a, here());
      this.prev = dog.state;
    }
    this.tired = dog.speed > 5 ? Math.min(this.tired + dt, 8) : Math.max(this.tired - dt * 0.4, 0);
    this.sniffTimer -= dt;
    this.stepTimer -= dt;
    this.pantTimer -= dt;
    if (dog.state === 'track' && this.sniffTimer <= 0) {
      this.sniffTimer = r(1, 2.4);
      if (d < 30) sniff(a, here());
    }
    if (dog.speed < 0.5 && this.tired > 1 && this.pantTimer <= 0) {
      this.pantTimer = 1.2;
      if (d < 20) pant(a, here());
    }
    if (dog.speed > 0.6 && this.stepTimer <= 0) {
      this.stepTimer = dog.speed > 5 ? 0.2 : dog.speed > 2.5 ? 0.28 : 0.42;
      if (d < 14) paw(a, here());
    }
  }
}
