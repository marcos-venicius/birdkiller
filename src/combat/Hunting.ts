import * as THREE from 'three';
import type { HitZone, Quadruped } from '../animals/Quadruped';
import type { QuadrupedManager } from '../animals/QuadrupedManager';
import type { AudioSystem } from '../audio/AudioSystem';
import { playBirdHit, playFleshHit, playImpact, playSplash } from '../audio/weaponSounds';
import type { Bird } from '../birds/Bird';
import type { BirdManager } from '../birds/BirdManager';
import { CONFIG } from '../config';
import type { Particles } from '../effects/Particles';
import type { HUD } from '../ui/HUD';
import type { ChunkManager } from '../world/ChunkManager';
import type { Ballistics } from './Ballistics';
import type { Terrain } from '../world/Terrain';

type BlockKind = 'terrain' | 'trunk' | 'rock' | 'water' | 'none';
export type HitKind = BlockKind | 'bird' | 'animal';

/** Um abate, para quem registra (caderno de campo). */
export interface KillInfo {
  id: string;
  name: string;
  distance: number;
  /** Escala do bicho (quadrúpedes). */
  scale?: number;
  /** Espécie cujo recorde de peso o abate disputa (o galheiro conta como veado). */
  weightId?: string;
}

export interface ShotResult {
  kind: HitKind;
  /** Distância até o impacto (m); Infinity se o tiro se perdeu no céu. */
  distance: number;
  point: THREE.Vector3;
  bird: Bird | null;
  /** Javali ou veado atingido. */
  animal: Quadruped | null;
  /** Zona atingida (cabeça/peito = vital; traseira = ferimento). */
  zone: HitZone | null;
  lethal: boolean;
  points: number;
}

const _hit = new THREE.Vector3();
const DEBRIS_COLOR = { terrain: 0x5a4631, trunk: 0x6a5038, rock: 0x8a857a, water: 0x8fb0b8 } as const;

/**
 * Cada disparo vira uma bala com tempo de voo e queda (`Ballistics`), resolvida trecho a trecho a
 * cada quadro contra relevo, troncos/pedras, água, pássaros e quadrúpedes. Aplica abate, raspão ou
 * ferimento, efeitos, sons e a pontuação.
 */
export class Hunting {
  score = 0;
  kills = 0;
  lastShot: ShotResult | null = null;
  /** Chamado a cada abate (o caderno de campo escuta aqui); não mexe na pontuação. */
  onKill?: (info: KillInfo) => void;
  /** Tiro não letal (bicho ferido ou asa atingida) — para as dicas. */
  onWound?: (kind: 'animal' | 'bird') => void;
  /** Ordem das marcações do rastreio (a mais antiga cai quando passa do máximo). */
  private tagCount = 0;

  constructor(
    private readonly terrain: Terrain,
    private readonly chunks: ChunkManager,
    private readonly birds: BirdManager,
    private readonly animals: readonly QuadrupedManager[],
    private readonly particles: Particles,
    private readonly hud: HUD,
    private readonly audio: AudioSystem,
    private readonly ballistics: Ballistics,
  ) {
    hud.setScore(0, 0);
  }

  /** Retoma a pontuação da sessão (continuar de onde parou). */
  restore(score: number, kills: number): void {
    this.score = score;
    this.kills = kills;
    this.hud.setScore(score, kills);
  }

  /**
   * Puxa o gatilho: solta a bala e o estampido espanta a bicharada em volta na hora. O dardo do rifle de
   * rastreio sai pelo supressor: não espanta ninguém.
   */
  shoot(origin: THREE.Vector3, dir: THREE.Vector3, dart = false): void {
    this.lastShot = null;
    this.ballistics.fire(origin, dir, dart);
    if (dart) return;
    this.birds.scare(origin, CONFIG.birds.shotScare);
    for (const manager of this.animals) manager.scare(origin, manager.kind.cfg.shotScare);
  }

  /**
   * Distância até a primeira coisa na linha da mira (relevo, água, tronco, pedra ou bicho),
   * ou Infinity se não há nada no alcance. Usada pelo telêmetro da luneta.
   */
  measure(origin: THREE.Vector3, dir: THREE.Vector3): number {
    const C = CONFIG.combat;
    let best = this.terrain.raycast(origin, dir, C.range, 2);
    const water = this.waterSurface(origin, dir, Math.min(best, C.range));
    if (water !== null && water < best) best = water;
    const obstacle = this.chunks.raycastObstacles(origin, dir, Math.min(best, C.range));
    if (obstacle.kind && obstacle.t < best) best = obstacle.t;
    best = Math.min(best, this.terrain.places.raycast(origin, dir, Math.min(best, C.range)));
    const bird = this.birds.raycast(origin, dir, Math.min(best, C.range));
    if (bird) best = bird.t;
    for (const manager of this.animals) {
      const hit = manager.raycast(origin, dir, Math.min(best, C.range));
      if (hit) best = hit.t;
    }
    return best;
  }

  /** Avança as balas no ar. */
  update(dt: number, eye?: THREE.Vector3): void {
    this.ballistics.update(dt, (from, dir, maxT, travelled, dart) => this.resolve(from, dir, maxT, travelled, dart), eye);
  }

  /** Resolve o trecho percorrido num quadro; true se a bala parou aí. */
  private resolve(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number, travelled: number, dart = false): boolean {
    const C = CONFIG.combat;
    let blockT = this.terrain.raycast(origin, dir, maxT);
    let kind: BlockKind = Number.isFinite(blockT) ? 'terrain' : 'none';
    // O relevo dentro do lago é o fundo: se a bala cruza a superfície antes, quem a para é a água.
    const waterT = this.waterSurface(origin, dir, maxT);
    if (waterT !== null && waterT < blockT) {
      blockT = waterT;
      kind = 'water';
    }
    const obstacle = this.chunks.raycastObstacles(origin, dir, Math.min(blockT, maxT));
    if (obstacle.kind && obstacle.t < blockT) {
      blockT = obstacle.t;
      kind = obstacle.kind;
    }
    // Paredes da cabana, pernas e grade da torre, tronco da árvore gigante: madeira.
    const placeT = this.terrain.places.raycast(origin, dir, Math.min(blockT, maxT));
    if (placeT < blockT) {
      blockT = placeT;
      kind = 'trunk';
    }

    // Um obstáculo só bloqueia se estiver claramente antes do animal (quem pousa em cima de um tronco, p. ex.).
    const limit = Math.min(blockT + C.occlusionSlack, maxT);
    // O dardo é para bicho grande: passa pelos pássaros.
    const birdHit = dart ? null : this.birds.raycast(origin, dir, limit);
    let animalHit: { animal: Quadruped; t: number; zone: HitZone; manager: QuadrupedManager } | null = null;
    for (const manager of this.animals) {
      const hit = manager.raycast(origin, dir, animalHit ? animalHit.t : birdHit ? birdHit.t : limit);
      if (hit) animalHit = { animal: hit.animal, t: hit.t, zone: hit.zone, manager };
    }
    if (!animalHit && !birdHit && kind === 'none') return false;
    const result: ShotResult = {
      kind,
      distance: travelled + blockT,
      point: new THREE.Vector3(),
      bird: null,
      animal: null,
      zone: null,
      lethal: false,
      points: 0,
    };

    if (animalHit) {
      const kind = animalHit.manager.kind;
      result.kind = 'animal';
      result.distance = travelled + animalHit.t;
      result.animal = animalHit.animal;
      result.zone = animalHit.zone;
      result.point.copy(origin).addScaledVector(dir, animalHit.t);
      // Raro (albino, galheiro) tem nome e pontos próprios; o peso conta no recorde da espécie.
      const rare = animalHit.animal.rare;
      const name = rare?.name ?? kind.name;
      if (dart) {
        // Dardo rastreador: não fere nem pontua — marca o bicho na bússola, e ele leva um susto.
        this.tagAnimal(animalHit.manager, animalHit.animal, origin);
        this.hud.toast(`${name} marcado`);
        this.particles.tufts(result.point, animalHit.animal.geo.tufts, 2, dir);
        playBirdHit(this.audio, result.distance, result.point);
      } else {
        const tagged = animalHit.animal.tagged;
        const outcome = animalHit.manager.hit(animalHit.animal, dir, animalHit.zone !== 'rear', origin);
        result.lethal = outcome === 'killed';
        if (result.lethal) {
          result.points = (rare?.points ?? kind.cfg.points) + Math.floor(result.distance / 10);
          this.addKill(result.points, `${name} · ${Math.round(result.distance)} m`);
          this.onKill?.({ id: rare?.id ?? kind.id, name, distance: result.distance, scale: animalHit.animal.scale, weightId: kind.id });
          if (tagged) this.hud.note(`${name} rastreado abatido`);
        } else {
          this.hud.toast(`${name} ferido`);
          this.onWound?.('animal');
        }
        this.particles.tufts(result.point, animalHit.animal.geo.tufts, result.lethal ? 12 : 7, dir);
        playFleshHit(this.audio, result.distance, result.point);
      }
    } else if (birdHit) {
      result.kind = 'bird';
      result.distance = travelled + birdHit.t;
      result.bird = birdHit.bird;
      result.lethal = birdHit.lethal;
      result.point.copy(origin).addScaledVector(dir, birdHit.t);
      const sp = birdHit.bird.species;
      if (birdHit.lethal) {
        this.birds.kill(birdHit.bird, dir);
        result.points = sp.points + Math.floor(result.distance / 10);
        this.addKill(result.points, `${sp.name} · ${Math.round(result.distance)} m`);
        this.onKill?.({ id: sp.id, name: sp.name, distance: result.distance });
        this.particles.feathers(result.point, sp.colors, 16, dir);
      } else {
        // Asa atingida: algumas penas, e o pássaro não voa mais — cai e foge pelo chão.
        this.particles.feathers(result.point, sp.colors, 6, dir);
        this.birds.wound(birdHit.bird, dir);
        this.hud.toast(`${sp.name} com a asa ferida`);
        this.onWound?.('bird');
      }
      playBirdHit(this.audio, result.distance, result.point);
    } else if (kind === 'water') {
      result.point.copy(origin).addScaledVector(dir, blockT);
      this.particles.splash(result.point, 14);
      playSplash(this.audio, result.distance, result.point);
    } else if (kind !== 'none') {
      result.point.copy(origin).addScaledVector(dir, blockT);
      this.particles.debris(result.point, DEBRIS_COLOR[kind], 7);
      playImpact(this.audio, result.distance, kind, result.point);
    }

    this.ballistics.markImpact(result.point);
    this.lastShot = result;
    return true;
  }

  /** Marca o bicho; passando do máximo de marcados, o mais antigo perde a marca. */
  private tagAnimal(manager: QuadrupedManager, animal: Quadruped, origin: THREE.Vector3): void {
    manager.tag(animal, origin, ++this.tagCount);
    const tagged = this.animals.flatMap((m) => m.active.filter((a) => a.tagged && a.alive));
    const extra = tagged.length - CONFIG.tracker.maxTagged;
    if (extra > 0) for (const a of tagged.sort((x, y) => x.tagOrder - y.tagOrder).slice(0, extra)) a.tagged = false;
  }

  /** Onde a bala fura a lâmina de água dentro deste trecho, se furar. */
  private waterSurface(origin: THREE.Vector3, dir: THREE.Vector3, maxT: number): number | null {
    if (dir.y >= 0) return null;
    _hit.copy(origin).addScaledVector(dir, maxT);
    const lake = this.terrain.lakes.at(_hit.x, _hit.z);
    if (!lake || _hit.y >= lake.level) return null;
    const t = (lake.level - origin.y) / dir.y;
    return t >= 0 && t <= maxT ? t : null;
  }

  private addKill(points: number, label: string): void {
    this.score += points;
    this.kills++;
    this.hud.setScore(this.score, this.kills);
    this.hud.toast(`+${points}  ${label}`);
  }
}
