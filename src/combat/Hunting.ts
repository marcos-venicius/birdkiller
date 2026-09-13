import * as THREE from 'three';
import type { Boar, HitZone } from '../animals/Boar';
import type { BoarManager } from '../animals/BoarManager';
import type { AudioSystem } from '../audio/AudioSystem';
import { playBirdHit, playFleshHit, playImpact, playSplash } from '../audio/weaponSounds';
import type { Bird } from '../birds/Bird';
import type { BirdManager } from '../birds/BirdManager';
import { CONFIG } from '../config';
import type { Particles } from '../effects/Particles';
import type { HUD } from '../ui/HUD';
import type { ChunkManager } from '../world/ChunkManager';
import type { Terrain } from '../world/Terrain';

type BlockKind = 'terrain' | 'trunk' | 'rock' | 'water' | 'none';
export type HitKind = BlockKind | 'bird' | 'boar';

export interface ShotResult {
  kind: HitKind;
  /** Distância até o impacto (m); Infinity se o tiro se perdeu no céu. */
  distance: number;
  point: THREE.Vector3;
  bird: Bird | null;
  boar: Boar | null;
  /** Zona atingida no javali (cabeça/peito = vital; traseira = ferimento). */
  zone: HitZone | null;
  lethal: boolean;
  points: number;
}

const _hit = new THREE.Vector3();
const DEBRIS_COLOR = { terrain: 0x5a4631, trunk: 0x6a5038, rock: 0x8a857a, water: 0x8fb0b8 } as const;

/**
 * Resolve cada disparo com hitscan exato na direção do tiro: relevo, troncos/pedras, pássaros e
 * javalis. Aplica abate, raspão ou ferimento, efeitos, sons e a pontuação.
 */
export class Hunting {
  score = 0;
  kills = 0;
  lastShot: ShotResult | null = null;

  constructor(
    private readonly terrain: Terrain,
    private readonly chunks: ChunkManager,
    private readonly birds: BirdManager,
    private readonly boars: BoarManager,
    private readonly particles: Particles,
    private readonly hud: HUD,
    private readonly audio: AudioSystem,
  ) {
    hud.setScore(0, 0);
  }

  shoot(origin: THREE.Vector3, dir: THREE.Vector3): ShotResult {
    const C = CONFIG.combat;
    let blockT = this.terrain.raycast(origin, dir, C.range);
    let kind: BlockKind = Number.isFinite(blockT) ? 'terrain' : 'none';
    // O relevo dentro do lago é o fundo: se o tiro cruza a superfície antes, quem para a bala é a água.
    const waterT = this.waterSurface(origin, dir, blockT);
    if (waterT !== null) {
      blockT = waterT;
      kind = 'water';
    }
    const obstacle = this.chunks.raycastObstacles(origin, dir, Math.min(blockT, C.range));
    if (obstacle.kind && obstacle.t < blockT) {
      blockT = obstacle.t;
      kind = obstacle.kind;
    }

    // Um obstáculo só bloqueia se estiver claramente antes do animal (quem pousa em cima de um tronco, p. ex.).
    const maxT = Math.min(blockT + C.occlusionSlack, C.range);
    const birdHit = this.birds.raycast(origin, dir, maxT);
    const boarHit = this.boars.raycast(origin, dir, birdHit ? birdHit.t : maxT);
    const result: ShotResult = {
      kind,
      distance: blockT,
      point: new THREE.Vector3(),
      bird: null,
      boar: null,
      zone: null,
      lethal: false,
      points: 0,
    };

    if (boarHit) {
      result.kind = 'boar';
      result.distance = boarHit.t;
      result.boar = boarHit.boar;
      result.zone = boarHit.zone;
      result.point.copy(origin).addScaledVector(dir, boarHit.t);
      const outcome = this.boars.hit(boarHit.boar, dir, boarHit.zone !== 'rear', origin);
      result.lethal = outcome === 'killed';
      if (result.lethal) {
        result.points = CONFIG.boars.points + Math.floor(boarHit.t / 10);
        this.addKill(result.points, `Javali · ${Math.round(boarHit.t)} m`);
      } else {
        this.hud.toast('Javali ferido');
      }
      const p = boarHit.boar.geo.palette;
      this.particles.tufts(result.point, [p.fur, p.mane, p.belly], result.lethal ? 12 : 7, dir);
      playFleshHit(this.audio, boarHit.t, result.point);
    } else if (birdHit) {
      result.kind = 'bird';
      result.distance = birdHit.t;
      result.bird = birdHit.bird;
      result.lethal = birdHit.lethal;
      result.point.copy(origin).addScaledVector(dir, birdHit.t);
      const sp = birdHit.bird.species;
      if (birdHit.lethal) {
        this.birds.kill(birdHit.bird, dir);
        result.points = sp.points + Math.floor(birdHit.t / 10);
        this.addKill(result.points, `${sp.name} · ${Math.round(birdHit.t)} m`);
        this.particles.feathers(result.point, sp.colors, 16, dir);
      } else {
        // Raspão na asa: algumas penas e o pássaro foge.
        this.particles.feathers(result.point, sp.colors, 5, dir);
        birdHit.bird.scare(origin, this.birds);
      }
      playBirdHit(this.audio, birdHit.t, result.point);
    } else if (kind === 'water') {
      result.point.copy(origin).addScaledVector(dir, blockT);
      this.particles.splash(result.point, 14);
      playSplash(this.audio, blockT, result.point);
    } else if (kind !== 'none') {
      result.point.copy(origin).addScaledVector(dir, blockT);
      this.particles.debris(result.point, DEBRIS_COLOR[kind], 7);
      playImpact(this.audio, blockT, kind, result.point);
    }

    this.birds.scare(origin, CONFIG.birds.shotScare);
    this.boars.scare(origin, CONFIG.boars.shotScare);
    this.lastShot = result;
    return result;
  }

  /** Onde o tiro fura a lâmina de água, se ela vier antes do fundo. */
  private waterSurface(origin: THREE.Vector3, dir: THREE.Vector3, blockT: number): number | null {
    if (dir.y >= 0 || !Number.isFinite(blockT)) return null;
    _hit.copy(origin).addScaledVector(dir, blockT);
    const lake = this.terrain.lakes.at(_hit.x, _hit.z);
    if (!lake || _hit.y >= lake.level) return null;
    const t = (lake.level - origin.y) / dir.y;
    return t > 0 && t < blockT ? t : null;
  }

  private addKill(points: number, label: string): void {
    this.score += points;
    this.kills++;
    this.hud.setScore(this.score, this.kills);
    this.hud.toast(`+${points}  ${label}`);
  }
}
