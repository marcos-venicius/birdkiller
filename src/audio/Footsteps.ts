import * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep } from '../core/math';
import type { PlayerController } from '../player/PlayerController';
import type { Biome } from '../world/Biome';
import type { Lakes } from '../world/Lakes';
import type { AudioSystem } from './AudioSystem';
import { drips, mudStep, plunge, swimStroke, waterStep } from './waterSounds';

const r = (a: number, b: number) => a + Math.random() * (b - a);
const _splash = new THREE.Vector3();

/**
 * Passos sincronizados com o balanço da câmera (player.stepPhase avança π por passo):
 * folhas secas estalando na mata, grama nas clareiras, baque grave; mais alto correndo,
 * mais baixo agachado; baque ao aterrissar de um pulo. Perto do lago: lama na beira, respingo
 * no raso, perna empurrando a água mais fundo; nadando, uma braçada por passo, o mergulho ao
 * sair do chão e os pingos ao voltar a pisar.
 */
export class Footsteps {
  /** Contador de passos tocados (testes), e por superfície. */
  steps = 0;
  readonly counts = { ground: 0, mud: 0, water: 0, stroke: 0 };
  /** Respingo visível (o main manda para as partículas): ponto na lâmina, gotas e força. */
  onSplash?: (point: THREE.Vector3, count: number, power: number) => void;
  private lastStep = 0;
  private airTime = 0;
  private wasOnGround = true;
  private wasSwimming = false;

  constructor(
    private readonly audio: AudioSystem,
    private readonly biome: Biome,
    private readonly lakes: Lakes,
  ) {}

  update(dt: number, player: PlayerController): void {
    const S = CONFIG.swim;
    const step = Math.floor(player.stepPhase / Math.PI);
    const newStep = step !== this.lastStep;
    this.lastStep = step;
    const swimming = player.swimming;
    const started = swimming && !this.wasSwimming;
    const stopped = !swimming && this.wasSwimming;
    this.wasSwimming = swimming;
    let landed = false;
    if (swimming) {
      // Boiando não é estar no ar: voltar a pisar não pode soar como aterrissagem.
      this.airTime = 0;
      this.wasOnGround = true;
    } else {
      if (!player.onGround) this.airTime += dt;
      landed = player.onGround && !this.wasOnGround && this.airTime > 0.25;
      if (player.onGround) this.airTime = 0;
      this.wasOnGround = player.onGround;
    }
    if (!this.audio.ready) return;

    const p = player.position;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    // Nadando, o olho está a um palmo da água: o respingo nasce longe da cara e sobe pouco, senão uma
    // gota passa colada na câmera como um borrão (e o jogador nada para dentro dela).
    if (started) {
      plunge(this.audio);
      this.splash(player, 0.9, 0, p.y + player.waterDepth, 8, 0.3);
    }
    if (stopped) drips(this.audio);
    if (swimming) {
      if (!newStep) return;
      const effort = Math.min(speed / S.swimSpeed, 1.5);
      this.steps++;
      this.counts.stroke++;
      swimStroke(this.audio, effort);
      // Uma braçada de cada lado.
      const side = step % 2 ? 0.35 : -0.35;
      if (effort > 0.3) this.splash(player, 1.2 + 0.3 * effort, side, p.y + player.waterDepth, 2 + Math.round(effort * 2), 0.15 + 0.05 * effort);
      return;
    }

    if (!landed && !(newStep && player.onGround && speed > 0.6)) return;
    const gain = landed ? 1.1 : player.running ? 0.6 : player.crouched ? 0.2 : 0.45;
    // Água sobre o chão aqui: positiva no lago, negativa (e subindo) na margem.
    const water = this.lakes.waterHeight(p.x, p.z);
    if (water > S.splashDepth) {
      this.steps++;
      this.counts.water++;
      waterStep(this.audio, gain, water, landed);
      // Respingo do pé (aparece olhando para baixo), maior correndo e caindo de um pulo.
      const big = landed ? 1 : player.running ? 0.6 : 0.3;
      this.splash(player, 0.35, 0, p.y + Math.max(water, 0), Math.round(2 + 8 * big), 0.25 + 0.35 * big);
      return;
    }
    const litter = this.biome.forest(p.x, p.z);
    this.play(gain, litter, landed, smoothstep(-S.mudBand, S.splashDepth, water));
  }

  /** Gotas `ahead` metros à frente e `side` à direita, na altura `y` da lâmina. */
  private splash(player: PlayerController, ahead: number, side: number, y: number, count: number, power: number): void {
    if (!this.onSplash) return;
    const p = player.position;
    // Frente = (-sen yaw, -cos yaw), direita = (cos yaw, -sen yaw).
    const s = Math.sin(player.yaw);
    const c = Math.cos(player.yaw);
    _splash.set(p.x - s * ahead + c * side, y, p.z - c * ahead - s * side);
    this.onSplash(_splash, count, power);
  }

  private play(gain: number, litter: number, landing: boolean, mud = 0): void {
    const a = this.audio;
    const g = gain * r(0.85, 1.15);
    this.steps++;
    if (mud > 0.05) this.counts.mud++;
    else this.counts.ground++;
    // Folhas secas: vários estalos curtos (mais na mata fechada; na lama da beira, quase nenhum).
    const crunches = Math.round((2 + litter * 4) * (1 - mud));
    for (let i = 0; i < crunches; i++) {
      a.noiseBurst({ at: i * 0.014 + r(0, 0.01), duration: 0.03, type: 'bandpass', freq: r(1500, 4200), q: 1.5, gain: g * (0.15 + 0.2 * litter), bus: 'steps' });
    }
    // Grama: um "swish".
    a.noiseBurst({ duration: 0.13, type: 'bandpass', freq: r(2200, 3200), q: 0.8, gain: g * 0.22 * (1 - litter) * (1 - mud) + 0.001, attack: 0.02, bus: 'steps' });
    // Baque do pé.
    a.noiseBurst({ duration: landing ? 0.14 : 0.07, type: 'lowpass', freq: landing ? 140 : 190, gain: g * (landing ? 1.2 : 0.7), bus: 'steps' });
    if (mud > 0.05) mudStep(a, g, mud);
    // Correndo na mata, às vezes quebra um graveto.
    if (!landing && gain > 0.45 && litter > 0.5 && mud < 0.5 && Math.random() < 0.08) {
      a.noiseBurst({ at: 0.03, duration: 0.03, type: 'highpass', freq: 1800, gain: 0.35, bus: 'steps' });
    }
  }
}
