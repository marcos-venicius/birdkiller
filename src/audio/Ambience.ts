import * as THREE from 'three';
import { TAU } from '../core/math';
import type { PlayerController } from '../player/PlayerController';
import type { Biome } from '../world/Biome';
import { ANIMALS, cricketChirp } from './animalSounds';
import type { AudioSystem, NoiseLoop } from './AudioSystem';

const r = (a: number, b: number) => a + Math.random() * (b - a);
const _pos = new THREE.Vector3();

interface Cricket {
  pos: THREE.Vector3;
  placed: boolean;
  next: number;
  period: number;
  pitch: number;
}

interface Loops {
  wind: NoiseLoop;
  leavesL: NoiseLoop;
  leavesR: NoiseLoop;
  rustle: NoiseLoop;
}

function set(p: AudioParam, value: number, now: number, timeConstant: number): void {
  p.setTargetAtTime(value, now, timeConstant);
}

/**
 * Paisagem sonora contínua: vento em rajadas, folhas (mais na mata fechada), farfalhar ao andar
 * na vegetação, grilos espalhados em volta e animais ocasionais ao longe.
 */
export class Ambience {
  /** Contador de animais tocados (testes). */
  animalsPlayed = 0;
  private loops: Loops | null = null;
  private time = 0;
  /** 0 = dia, 1 = noite: mais grilos e corujas, menos pica-paus e corvos. */
  private night = 0;
  private control = 0;
  private nextAnimal = r(6, 14);
  private readonly crickets: Cricket[] = Array.from({ length: 4 }, () => ({
    pos: new THREE.Vector3(),
    placed: false,
    next: 0,
    period: r(0.7, 1.3),
    pitch: r(4200, 5200),
  }));

  constructor(
    private readonly audio: AudioSystem,
    private readonly biome: Biome,
  ) {}

  update(dt: number, player: PlayerController, listener: THREE.Vector3, night = 0): void {
    const a = this.audio;
    if (!a.ready) return;
    this.night = night;
    const loops = this.loops ?? this.start();
    if (!loops) return;
    this.time += dt;
    const t = this.time;
    const now = a.now;

    // Parâmetros contínuos atualizados 10x por segundo (com transições suaves).
    this.control -= dt;
    if (this.control <= 0) {
      this.control = 0.1;
      const gust = THREE.MathUtils.clamp(0.5 + 0.3 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.53 + 1.3) + 0.1 * Math.sin(t * 1.7), 0, 1);
      const p = player.position;
      const forest = this.biome.forest(p.x, p.z);
      set(loops.wind.gain, 0.05 + 0.11 * gust, now, 0.6);
      set(loops.wind.freq, 220 + 420 * gust, now, 0.6);
      set(loops.wind.pan, Math.sin(t * 0.11) * 0.35, now, 1);
      const leaves = (0.012 + 0.05 * gust) * (0.35 + 0.65 * forest);
      set(loops.leavesL.gain, leaves * (0.8 + 0.2 * Math.sin(t * 0.7)), now, 0.4);
      set(loops.leavesR.gain, leaves * (0.8 + 0.2 * Math.cos(t * 0.6)), now, 0.4);
      set(loops.leavesL.freq, 2600 + 1400 * gust, now, 0.5);
      set(loops.leavesR.freq, 2800 + 1300 * gust, now, 0.5);
      // Andar pela vegetação: a grama alta das clareiras farfalha mais; agachado é mais silencioso.
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      const move = player.onGround ? Math.min(speed / 9, 1) : 0;
      set(loops.rustle.gain, move * (0.012 + 0.03 * (1 - forest)) * (player.crouched ? 0.5 : 1), now, 0.08);
      set(loops.rustle.freq, 2200 + speed * 150, now, 0.1);
    }

    this.updateCrickets(now, listener);

    this.nextAnimal -= dt;
    if (this.nextAnimal <= 0) {
      this.nextAnimal = r(14, 40);
      this.playAnimal(listener);
    }
  }

  private start(): Loops | null {
    const a = this.audio;
    const wind = a.loop('lowpass', 400, 0.6, 'ambience');
    const leavesL = a.loop('bandpass', 3000, 0.8, 'ambience', -0.6);
    const leavesR = a.loop('bandpass', 3200, 0.8, 'ambience', 0.6);
    const rustle = a.loop('bandpass', 2600, 1, 'ambience');
    if (!wind || !leavesL || !leavesR || !rustle) return null;
    this.loops = { wind, leavesL, leavesR, rustle };
    return this.loops;
  }

  /** Alguns grilos fixos em volta do jogador; quem fica longe demais é reposicionado. */
  private updateCrickets(now: number, listener: THREE.Vector3): void {
    for (const c of this.crickets) {
      if (!c.placed || c.pos.distanceTo(listener) > 45) {
        const ang = Math.random() * TAU;
        const d = r(10, 35);
        c.pos.set(listener.x + Math.cos(ang) * d, listener.y - 1.5, listener.z + Math.sin(ang) * d);
        c.placed = true;
        c.next = now + r(0, c.period);
      }
      if (now >= c.next) {
        if (now - c.next < 0.3) {
          cricketChirp(this.audio, this.audio.spatial(c.pos, 'ambience', 3), c.pitch, 0.12 * (1 + this.night * 1.5));
        }
        c.next = now + c.period * r(0.85, 1.15);
      }
    }
  }

  private playAnimal(listener: THREE.Vector3): void {
    // À noite: corujas bem mais frequentes; pica-paus e corvos quase somem.
    const weight = (name: string, base: number) =>
      base * (name === 'coruja' ? 1 + this.night * 4 : name === 'pica-pau' || name === 'corvo' ? 1 - this.night * 0.85 : 1);
    let pick = Math.random() * ANIMALS.reduce((s, an) => s + weight(an.name, an.weight), 0);
    const animal = ANIMALS.find((an) => (pick -= weight(an.name, an.weight)) <= 0) ?? ANIMALS[0];
    const ang = Math.random() * TAU;
    const d = r(animal.dist[0], animal.dist[1]);
    _pos.set(listener.x + Math.cos(ang) * d, listener.y + (animal.name === 'galho' ? -1 : 5), listener.z + Math.sin(ang) * d);
    animal.play(this.audio, this.audio.spatial(_pos, 'ambience', animal.ref));
    this.animalsPlayed++;
  }
}
