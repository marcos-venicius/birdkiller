import * as THREE from 'three';
import type { AudioSystem } from '../audio/AudioSystem';
import { playBirdHit, playImpact } from '../audio/weaponSounds';
import type { Bird } from '../birds/Bird';
import type { BirdManager } from '../birds/BirdManager';
import { CONFIG } from '../config';
import type { Particles } from '../effects/Particles';
import type { HUD } from '../ui/HUD';
import type { ChunkManager } from '../world/ChunkManager';
import type { Terrain } from '../world/Terrain';

type BlockKind = 'terrain' | 'trunk' | 'rock' | 'none';
export type HitKind = BlockKind | 'bird';

export interface ShotResult {
  kind: HitKind;
  /** Distância até o impacto (m); Infinity se o tiro se perdeu no céu. */
  distance: number;
  point: THREE.Vector3;
  bird: Bird | null;
  lethal: boolean;
  points: number;
}

const DEBRIS_COLOR = { terrain: 0x5a4631, trunk: 0x6a5038, rock: 0x8a857a } as const;

/**
 * Resolve cada disparo com hitscan exato na direção do tiro: relevo, troncos/pedras e pássaros.
 * Aplica abate ou raspão, efeitos, sons e a pontuação.
 */
export class Hunting {
  score = 0;
  kills = 0;
  lastShot: ShotResult | null = null;

  constructor(
    private readonly terrain: Terrain,
    private readonly chunks: ChunkManager,
    private readonly birds: BirdManager,
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
    const obstacle = this.chunks.raycastObstacles(origin, dir, Math.min(blockT, C.range));
    if (obstacle.kind && obstacle.t < blockT) {
      blockT = obstacle.t;
      kind = obstacle.kind;
    }

    // Um obstáculo só bloqueia se estiver claramente antes do pássaro (quem pousa em cima de um tronco, p. ex.).
    const hit = this.birds.raycast(origin, dir, Math.min(blockT + C.occlusionSlack, C.range));
    const result: ShotResult = { kind, distance: blockT, point: new THREE.Vector3(), bird: null, lethal: false, points: 0 };
    if (hit) {
      result.kind = 'bird';
      result.distance = hit.t;
      result.bird = hit.bird;
      result.lethal = hit.lethal;
    }
    if (Number.isFinite(result.distance)) result.point.copy(origin).addScaledVector(dir, result.distance);

    if (hit) {
      const sp = hit.bird.species;
      if (hit.lethal) {
        this.birds.kill(hit.bird, dir);
        result.points = sp.points + Math.floor(hit.t / 10);
        this.score += result.points;
        this.kills++;
        this.hud.setScore(this.score, this.kills);
        this.hud.showKill(`+${result.points}  ${sp.name} · ${Math.round(hit.t)} m`);
        this.particles.feathers(result.point, sp.colors, 16, dir);
      } else {
        // Raspão na asa: algumas penas e o pássaro foge.
        this.particles.feathers(result.point, sp.colors, 5, dir);
        hit.bird.scare(origin, this.birds);
      }
      playBirdHit(this.audio, hit.t);
    } else if (kind !== 'none') {
      this.particles.debris(result.point, DEBRIS_COLOR[kind], 7);
      playImpact(this.audio, blockT, kind);
    }

    this.birds.scare(origin, CONFIG.birds.shotScare);
    this.lastShot = result;
    return result;
  }
}
