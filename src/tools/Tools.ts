import * as THREE from 'three';
import type { QuadrupedManager } from '../animals/QuadrupedManager';
import type { AudioSystem } from '../audio/AudioSystem';
import { playAxeDirt, playAxeRock, playChop, playCollect, playSwing, playTreeCreak, playTreeFall } from '../audio/toolSounds';
import type { BirdManager } from '../birds/BirdManager';
import { CONFIG } from '../config';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import { smoothstep } from '../core/math';
import type { Particles } from '../effects/Particles';
import type { PlayerController } from '../player/PlayerController';
import type { HUD } from '../ui/HUD';
import type { Weapon } from '../weapon/Weapon';
import type { Chunk, LogRef, TreeRef } from '../world/Chunk';
import type { ChunkManager } from '../world/ChunkManager';
import { rayToSegment, type FelledTrees } from '../world/Felled';
import type { Terrain } from '../world/Terrain';
import type { FelledTree, WorldEdits } from '../world/WorldEdits';
import { buildAxe } from './AxeModel';
import type { Builder } from './Builder';

export type ToolId = 'rifle' | 'axe' | 'build' | 'tracker';

/** O que o E recolhe: árvore derrubada ou tronco caído da mata. */
type Target = { kind: 'felled'; tree: FelledTree; wood: number } | { kind: 'log'; log: LogRef; wood: number };

interface Pose {
  pos: THREE.Vector3;
  rot: THREE.Vector3;
}

function pose(x: number, y: number, z: number, rx: number, ry: number, rz: number): Pose {
  return { pos: new THREE.Vector3(x, y, z), rot: new THREE.Vector3(rx, ry, rz) };
}

/** Poses do machado no espaço da câmera da arma (x direita, y cima, -z frente); origem = a mão. */
// Em repouso o fio fica de lado (virado para o centro da tela); no golpe ele vem para a frente.
const REST = pose(0.3, -0.42, -0.55, -0.25, 0.7, 0.2);
const BACK = pose(0.36, -0.2, -0.42, 0.95, 0.35, 0.45);
const STRIKE = pose(0.05, -0.36, -0.62, -1.3, -0.15, 0.05);

const CHIPS = 0xc9a77a;
const OLD_WOOD = 0x6e5438;
const DIRT = 0x4a3b2a;
const STONE = 0x85827c;

const _dir = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _top = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _rot = new THREE.Vector3();

/**
 * Ferramentas na mão: o rifle (tecla 1), o machado (tecla 2), a construção (tecla 3) e o rifle de rastreio (4). O machado golpeia
 * no botão esquerdo: cada árvore pede alguns golpes conforme a grossura e cai; o E recolhe a madeira da
 * derrubada ou de um tronco caído da mata. O barulho espanta os bichos por perto. A construção fica no Builder.
 */
export class Tools {
  current: ToolId = 'rifle';
  /** Uma árvore caiu / madeira recolhida — para as dicas. */
  onFell?: (tree: FelledTree) => void;
  onCollect?: (wood: number) => void;
  private readonly axe: THREE.Group;
  /** 0 = ferramenta ainda embaixo da tela, 1 = na mão. */
  private raise = 1;
  /** O que o HUD mostra no lugar da munição ("Machado", "Nadando") e junto dela ("Rastreio"). */
  private toolLabel: string | null = null;
  private weaponLabel: string | null = null;
  /** Aviso "nadando, sem atirar" — no máximo um a cada 4 s. */
  private swimNoteAt = 0;
  /** Tempo no golpe (-1 = parado) e se o acerto deste golpe já aconteceu. */
  private swing = -1;
  private struck = false;
  private shake = 0;
  private time = 0;
  private target: Target | null = null;
  private targetTimer = 0;
  /** Golpes já dados em cada árvore (esquecidos ao sair de perto, não precisam ser guardados). */
  private readonly progress = new Map<string, number>();
  private readonly logs: LogRef[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly input: Input,
    private readonly player: PlayerController,
    private readonly hud: HUD,
    private readonly audio: AudioSystem,
    private readonly weapon: Weapon,
    private readonly terrain: Terrain,
    private readonly chunks: ChunkManager,
    private readonly particles: Particles,
    private readonly birds: BirdManager,
    private readonly animals: readonly QuadrupedManager[],
    private readonly felled: FelledTrees,
    private readonly edits: WorldEdits,
    private readonly builder: Builder,
  ) {
    this.axe = buildAxe();
    this.axe.visible = false;
    engine.viewScene.add(this.axe);
    felled.onLand = (tip) => {
      playTreeFall(this.audio, tip);
      this.scare(tip, CONFIG.tools.fallScare);
    };
  }

  /** Golpes para derrubar uma árvore com este raio de tronco. */
  static hitsFor(radius: number): number {
    const T = CONFIG.tools;
    return THREE.MathUtils.clamp(Math.round(radius * T.hitsPerRadius), T.minHits, T.maxHits);
  }

  /** Madeira do que está na mira para recolher (null = nada). */
  get targetWood(): number | null {
    return this.target?.wood ?? null;
  }

  select(tool: ToolId): void {
    if (tool === this.current) return;
    this.current = tool;
    this.raise = 0;
    this.swing = -1;
  }

  update(dt: number): void {
    const T = CONFIG.tools;
    this.time += dt;
    if (this.input.wasPressed('Digit1')) this.select('rifle');
    if (this.input.wasPressed('Digit2')) this.select('axe');
    if (this.input.wasPressed('Digit3')) this.select('build');
    if (this.input.wasPressed('Digit4')) this.select('tracker');
    // Nadando, os braços estão ocupados: o rifle vai para as costas, sem machado nem construção; ao
    // voltar a dar pé, a ferramenta sobe de baixo da tela.
    const swimming = this.player.swimming;
    // Rifle e rastreio são a mesma arma na mão (o rastreio com supressor e dardos).
    this.weapon.holstered = swimming || (this.current !== 'rifle' && this.current !== 'tracker');
    this.weapon.variant = this.current === 'tracker' ? 'tracker' : 'rifle';
    if (swimming) {
      this.raise = 0;
      this.swing = -1;
      if (this.input.wasMousePressed(0) && this.time >= this.swimNoteAt) {
        this.swimNoteAt = this.time + 4;
        this.hud.toast('Nadando: o rifle só atira onde der pé');
      }
    } else {
      this.raise = Math.min(1, this.raise + dt / T.switchTime);
    }
    this.showLabels(
      swimming ? 'Nadando' : this.current === 'axe' ? 'Machado' : this.current === 'build' ? 'Construir' : null,
      !swimming && this.current === 'tracker' ? 'Rastreio' : null,
    );

    const axe = this.current === 'axe' && !swimming;
    this.axe.visible = axe;
    if (axe) {
      if (this.swing < 0 && this.raise >= 1 && this.input.wasMousePressed(0)) {
        this.swing = 0;
        this.struck = false;
        playSwing(this.audio, T.swingHit * 0.6);
      }
      if (this.swing >= 0) {
        this.swing += dt;
        if (!this.struck && this.swing >= T.swingHit) {
          this.struck = true;
          this.strike();
        }
        if (this.swing >= T.swingTime) this.swing = -1;
      }
      this.updatePose(dt);
    }
    this.builder.update(dt, this.current === 'build' && this.raise >= 1);
    // Tranco do golpe na câmera (a arma já escreveu o coice dela neste quadro).
    this.shake *= Math.exp(-16 * dt);
    this.player.viewOffset.x += Math.sin(this.time * 55) * this.shake * 0.01;
    this.player.viewOffset.y += Math.cos(this.time * 43) * this.shake * 0.006;

    // Recolher madeira (E), com o rifle ou o machado na mão (construindo, a linha de ação é do Builder).
    this.targetTimer -= dt;
    if (this.current === 'build') {
      this.target = null;
      this.targetTimer = 0;
    } else if (this.targetTimer <= 0) {
      this.targetTimer = 0.1;
      this.target = this.findTarget();
      this.hud.setAction(this.target ? `E recolher madeira (+${this.target.wood})` : null);
    }
    if (this.target && this.input.wasPressed('KeyE')) this.collect(this.target);
    this.hud.setWood(this.edits.wood, this.edits.wood > 0 || this.current === 'axe' || this.current === 'build');
    if (this.progress.size > 64) this.progress.clear();
  }

  private showLabels(tool: string | null, weapon: string | null): void {
    if (tool !== this.toolLabel) {
      this.toolLabel = tool;
      this.hud.setTool(tool);
    }
    if (weapon !== this.weaponLabel) {
      this.weaponLabel = weapon;
      this.hud.setWeaponLabel(weapon);
    }
  }

  /** O acerto do golpe: o que estiver no alcance do machado, na mira. */
  private strike(): void {
    const T = CONFIG.tools;
    const cam = this.engine.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(_dir);
    const eye = cam.position;
    const reach = T.axeReach;
    const obs = this.chunks.raycastObstacles(eye, _dir, reach);
    const placeT = this.terrain.places.raycast(eye, _dir, reach);
    const groundT = this.terrain.raycast(eye, _dir, reach, 0.2);
    const t = Math.min(obs.t, placeT, groundT);
    if (!(t <= reach)) return;
    _hit.copy(eye).addScaledVector(_dir, t);
    this.shake = 1;
    if (t === placeT) {
      // Madeira das torres e cabanas (e a árvore gigante): o machado bate, mas não corta.
      playChop(this.audio, _hit);
      this.particles.debris(_hit, OLD_WOOD, 4);
      return;
    }
    if (t === groundT && groundT < obs.t) {
      playAxeDirt(this.audio, _hit);
      this.particles.debris(_hit, DIRT, 5);
      return;
    }
    if (obs.kind === 'rock') {
      playAxeRock(this.audio, _hit);
      this.particles.debris(_hit, STONE, 4);
      return;
    }
    playChop(this.audio, _hit);
    this.particles.debris(_hit, CHIPS, 8);
    this.scare(_hit, T.chopScare);
    const hit = this.chunks.raycastTree(eye, _dir, reach);
    const ref = hit ? hit.chunk.treeRefs[hit.slot] : null;
    if (!hit || !ref) return; // toco: só lasca
    const n = (this.progress.get(ref.id) ?? 0) + 1;
    if (n < Tools.hitsFor(ref.radius)) {
      this.progress.set(ref.id, n);
      return;
    }
    this.progress.delete(ref.id);
    this.fell(hit.chunk, ref);
  }

  /** A árvore cede: começa a cair, vira toco no chunk e fica guardada como cortada. */
  private fell(chunk: Chunk, ref: TreeRef): void {
    chunk.layers[ref.layer].getMatrixAt(ref.index, _m);
    const tree = this.felled.fell(ref, _m, this.player.position);
    this.edits.cut.add(ref.id);
    this.edits.save();
    const x = _m.elements[12];
    const z = _m.elements[14];
    this.chunks.repopulate(x, z);
    // Quem estava pousado na copa voa na hora.
    _top.set(x, _m.elements[13] + ref.top * ref.scale, z);
    this.birds.scare(_top, 18);
    playTreeCreak(this.audio, _top);
    this.onFell?.(tree);
  }

  private findTarget(): Target | null {
    const cam = this.engine.camera;
    cam.getWorldDirection(_dir);
    const eye = cam.position;
    const reach = CONFIG.tools.collectReach;
    let best: Target | null = null;
    let bestS = Infinity;
    const f = this.felled.nearest(eye, _dir, reach);
    if (f) {
      best = { kind: 'felled', tree: f.tree, wood: f.tree.wood };
      bestS = f.s;
    }
    for (const log of this.chunks.logsNear(eye.x, eye.z, this.logs)) {
      const hx = (log.dx * log.len) / 2;
      const hz = (log.dz * log.len) / 2;
      const [s, dist] = rayToSegment(eye, _dir, log.x - hx, log.y - log.rise / 2, log.z - hz, log.x + hx, log.y + log.rise / 2, log.z + hz, reach + log.r);
      if (dist > log.r + 0.5 || s >= bestS) continue;
      best = { kind: 'log', log, wood: log.wood };
      bestS = s;
    }
    return best;
  }

  private collect(target: Target): void {
    if (target.kind === 'felled') {
      this.felled.remove(target.tree);
    } else {
      this.edits.taken.add(target.log.id);
      this.chunks.repopulate(target.log.x, target.log.z);
    }
    this.edits.wood += target.wood;
    this.edits.save();
    playCollect(this.audio);
    this.hud.toast(`+${target.wood} de madeira (total ${this.edits.wood})`);
    this.target = null;
    this.targetTimer = 0;
    this.onCollect?.(target.wood);
  }

  private scare(p: THREE.Vector3, radius: number): void {
    this.birds.scare(p, radius);
    for (const m of this.animals) m.scare(p, radius * 1.5);
  }

  private updatePose(dt: number): void {
    const T = CONFIG.tools;
    const P = this.player;
    if (this.swing < 0) {
      _pos.copy(REST.pos);
      _rot.copy(REST.rot);
    } else {
      // Levanta por cima do ombro, desce rápido até o acerto e volta ao repouso.
      const u = this.swing / T.swingTime;
      const hit = T.swingHit / T.swingTime;
      const back = hit * 0.55;
      if (u < back) blend(REST, BACK, smoothstep(0, 1, u / back));
      else if (u < hit) blend(BACK, STRIKE, ((u - back) / (hit - back)) ** 2);
      else blend(STRIKE, REST, smoothstep(0, 1, (u - hit) / (1 - hit)));
    }
    // Balanço dos passos e a ferramenta subindo depois de trocar.
    const bob = P.bobAmount * (this.swing < 0 ? 1 : 0.3);
    _pos.x += Math.sin(P.stepPhase) * 0.016 * bob;
    _pos.y += Math.sin(P.stepPhase * 2) * 0.012 * bob;
    const drawn = smoothstep(0, 1, this.raise);
    _pos.y -= (1 - drawn) * 0.4;
    _rot.x -= (1 - drawn) * 0.5;
    this.axe.position.copy(_pos);
    this.axe.rotation.set(_rot.x, _rot.y, _rot.z);
    void dt;
  }
}

function blend(a: Pose, b: Pose, t: number): void {
  _pos.copy(a.pos).lerp(b.pos, t);
  _rot.copy(a.rot).lerp(b.rot, t);
}
