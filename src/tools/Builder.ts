import * as THREE from 'three';
import type { AudioSystem } from '../audio/AudioSystem';
import { playHammer } from '../audio/toolSounds';
import { CONFIG } from '../config';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import { TAU } from '../core/math';
import type { PlayerController } from '../player/PlayerController';
import type { HUD } from '../ui/HUD';
import type { ChunkManager } from '../world/ChunkManager';
import type { Place } from '../world/Places';
import type { PlaceView } from '../world/PlaceView';
import type { Terrain } from '../world/Terrain';
import type { BuiltTower, WorldEdits } from '../world/WorldEdits';

type Size = (typeof CONFIG.build.sizes)[number];

const _dir = new THREE.Vector3();

/** Coloca nas consultas do mundo (colisão, piso, escada, tiro, desenho) uma torre guardada nas obras. */
export function addBuiltTower(terrain: Terrain, t: BuiltTower): Place | null {
  const size = CONFIG.build.sizes[t.size];
  if (!size) return null;
  return terrain.places.tower(`own:${t.x.toFixed(2)}:${t.z.toFixed(2)}`, t.x, t.z, t.yaw, size.height, size.legs);
}

/**
 * Construir (tecla 3): uma torre-fantasma aparece no chão onde a mira aponta, com a escada virada para o
 * jogador. Botão direito troca a altura, botão esquerdo constrói — verde pode, vermelho diz o que falta.
 */
export class Builder {
  /** Índice em `CONFIG.build.sizes`. */
  size = 0;
  onBuild?: (t: BuiltTower) => void;
  private readonly ghost: THREE.Mesh;
  private readonly okMat = new THREE.MeshBasicMaterial({ color: 0x9fe08a, transparent: true, opacity: 0.35, depthWrite: false });
  private readonly badMat = new THREE.MeshBasicMaterial({ color: 0xe07a6a, transparent: true, opacity: 0.35, depthWrite: false });
  private spot: { x: number; z: number; yaw: number } | null = null;
  private reason: string | null = null;
  private key = '';
  private timer = 0;

  constructor(
    private readonly engine: Engine,
    private readonly input: Input,
    private readonly player: PlayerController,
    private readonly hud: HUD,
    private readonly audio: AudioSystem,
    private readonly terrain: Terrain,
    private readonly chunks: ChunkManager,
    private readonly placeView: PlaceView,
    private readonly edits: WorldEdits,
  ) {
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.okMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 5;
    engine.scene.add(this.ghost);
  }

  /** O que impede de construir onde a mira aponta (null = pode, ou não há lugar na mira). */
  get blocked(): string | null {
    return this.reason;
  }

  update(dt: number, active: boolean): void {
    if (!active) {
      this.ghost.visible = false;
      this.spot = null;
      return;
    }
    if (this.input.wasMousePressed(2)) {
      this.size = (this.size + 1) % CONFIG.build.sizes.length;
      this.timer = 0;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.1;
      this.aim();
    }
    if (this.spot && !this.reason && this.input.wasMousePressed(0)) this.build();
  }

  /** Onde a torre ficaria agora, se pode, e o fantasma no lugar. */
  private aim(): void {
    const B = CONFIG.build;
    const size = B.sizes[this.size];
    const cam = this.engine.camera;
    cam.getWorldDirection(_dir);
    const t = this.terrain.raycast(cam.position, _dir, B.maxDistance, 0.5);
    if (!(t <= B.maxDistance)) {
      this.spot = null;
      this.reason = null;
      this.ghost.visible = false;
      this.hud.setAction(`${size.name}: aponte para o chão, até ${B.maxDistance} m`);
      return;
    }
    let x = cam.position.x + _dir.x * t;
    let z = cam.position.z + _dir.z * t;
    // Nunca em cima do jogador: a torre inteira fica à frente dele.
    const p = this.player.position;
    let dx = x - p.x;
    let dz = z - p.z;
    let d = Math.hypot(dx, dz);
    const min = size.legs + 1.9;
    if (d < min) {
      if (d < 1e-3) {
        dx = -Math.sin(this.player.yaw);
        dz = -Math.cos(this.player.yaw);
        d = 1;
      }
      x = p.x + (dx / d) * min;
      z = p.z + (dz / d) * min;
      d = min;
    }
    // Escada virada para o jogador: o +Z local da torre, (-sen yaw, cos yaw), aponta para ele.
    const yaw = Math.atan2(dx / d, -dz / d);
    this.spot = { x, z, yaw };
    this.reason = this.check(x, z, size);
    const key = `${this.size}:${x.toFixed(1)}:${z.toFixed(1)}:${yaw.toFixed(2)}`;
    if (key !== this.key) {
      this.key = key;
      const place = this.terrain.places.tower('fantasma', x, z, yaw, size.height, size.legs, false);
      this.ghost.geometry.dispose();
      this.ghost.geometry = this.placeView.towerGeometry(place);
      this.ghost.position.set(x, place.y, z);
      this.ghost.rotation.y = -yaw;
    }
    this.ghost.material = this.reason ? this.badMat : this.okMat;
    this.ghost.visible = true;
    this.hud.setAction(
      this.reason
        ? `${size.name} · ${this.reason} · botão direito troca a altura`
        : `${size.name} · ${size.height} m · ${size.cost} de madeira — clique constrói · botão direito troca a altura`,
    );
  }

  /** O que impede a torre deste tamanho em (x, z); null = pode. O lugar vem antes da madeira. */
  private check(x: number, z: number, size: Size): string | null {
    const B = CONFIG.build;
    const r = size.legs + 1.2;
    if (!this.terrain.lakes.dry(x, z, r)) return 'na água';
    let min = Infinity;
    let max = -Infinity;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * TAU;
      const h = this.terrain.heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    if (max - min > B.flatness) return 'chão inclinado demais';
    if (!this.terrain.places.clear(x, z, r + 1) || this.terrain.places.builtNear(x, z, r + 1)) return 'perto de outro lugar';
    if (this.chunks.standingTreeNear(x, z, size.legs * Math.SQRT2 + B.treeClearance)) return 'árvores no caminho (corte com o machado)';
    if (this.edits.wood < size.cost) return `faltam ${size.cost - this.edits.wood} de madeira`;
    return null;
  }

  private build(): void {
    const s = this.spot!;
    const size = CONFIG.build.sizes[this.size];
    const t: BuiltTower = { x: s.x, z: s.z, yaw: s.yaw, size: this.size };
    this.edits.wood -= size.cost;
    this.edits.towers.push(t);
    this.edits.save();
    addBuiltTower(this.terrain, t);
    playHammer(this.audio, 7);
    this.hud.toast(`${size.name} construída · sobraram ${this.edits.wood} de madeira`);
    this.key = '';
    this.timer = 0;
    this.onBuild?.(t);
  }
}
