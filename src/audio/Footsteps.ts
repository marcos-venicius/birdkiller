import type { PlayerController } from '../player/PlayerController';
import type { Biome } from '../world/Biome';
import type { AudioSystem } from './AudioSystem';

const r = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Passos sincronizados com o balanço da câmera (player.stepPhase avança π por passo):
 * folhas secas estalando na mata, grama nas clareiras, baque grave; mais alto correndo,
 * mais baixo agachado; baque ao aterrissar de um pulo.
 */
export class Footsteps {
  /** Contador de passos tocados (testes). */
  steps = 0;
  private lastStep = 0;
  private airTime = 0;
  private wasOnGround = true;

  constructor(
    private readonly audio: AudioSystem,
    private readonly biome: Biome,
  ) {}

  update(dt: number, player: PlayerController): void {
    const step = Math.floor(player.stepPhase / Math.PI);
    const newStep = step !== this.lastStep;
    this.lastStep = step;
    if (!player.onGround) this.airTime += dt;
    const landed = player.onGround && !this.wasOnGround && this.airTime > 0.25;
    if (player.onGround) this.airTime = 0;
    this.wasOnGround = player.onGround;
    if (!this.audio.ready) return;

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (!landed && !(newStep && player.onGround && speed > 0.6)) return;
    const litter = this.biome.forest(player.position.x, player.position.z);
    if (landed) this.play(1.1, litter, true);
    else this.play(player.running ? 0.8 : player.crouched ? 0.2 : 0.45, litter, false);
  }

  private play(gain: number, litter: number, landing: boolean): void {
    const a = this.audio;
    const g = gain * r(0.85, 1.15);
    this.steps++;
    // Folhas secas: vários estalos curtos (mais na mata fechada).
    const crunches = 2 + Math.round(litter * 4);
    for (let i = 0; i < crunches; i++) {
      a.noiseBurst({ at: i * 0.014 + r(0, 0.01), duration: 0.03, type: 'bandpass', freq: r(1500, 4200), q: 1.5, gain: g * (0.15 + 0.2 * litter), bus: 'steps' });
    }
    // Grama: um "swish".
    a.noiseBurst({ duration: 0.13, type: 'bandpass', freq: r(2200, 3200), q: 0.8, gain: g * 0.3 * (1 - litter) + 0.001, attack: 0.02, bus: 'steps' });
    // Baque do pé.
    a.noiseBurst({ duration: landing ? 0.14 : 0.07, type: 'lowpass', freq: landing ? 140 : 190, gain: g * (landing ? 1.2 : 0.7), bus: 'steps' });
    // Correndo na mata, às vezes quebra um graveto.
    if (!landing && gain > 0.6 && litter > 0.5 && Math.random() < 0.08) {
      a.noiseBurst({ at: 0.03, duration: 0.03, type: 'highpass', freq: 1800, gain: 0.35, bus: 'steps' });
    }
  }
}
