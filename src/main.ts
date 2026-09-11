import './style.css';
import * as THREE from 'three';
import { AudioSystem } from './audio/AudioSystem';
import { CONFIG } from './config';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { PlayerController } from './player/PlayerController';
import { HUD } from './ui/HUD';
import { Weapon } from './weapon/Weapon';
import { Atmosphere } from './world/Atmosphere';
import { Biome } from './world/Biome';
import { ChunkManager } from './world/ChunkManager';
import { Terrain } from './world/Terrain';
import { Vegetation } from './world/vegetation/Vegetation';
import { windTime } from './world/vegetation/wind';

const engine = new Engine(document.querySelector<HTMLElement>('#app')!);
const input = new Input(engine.renderer.domElement);
const hud = new HUD(document.querySelector<HTMLElement>('#hud')!);
const audio = new AudioSystem();
// O navegador só libera o áudio depois de um gesto do usuário.
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());

const biome = new Biome(CONFIG.seed);
const terrain = new Terrain(CONFIG.seed, biome);
const vegetation = new Vegetation(terrain, biome, CONFIG.seed);
const chunks = new ChunkManager(engine.scene, terrain, vegetation);
const atmosphere = new Atmosphere(engine.scene);

const player = new PlayerController(engine.camera, input, terrain, chunks);
// Começa olhando de lado para o sol: a luz rasante fica visível sem ofuscar.
const spawnYaw = THREE.MathUtils.degToRad(CONFIG.atmosphere.sunAzimuth + 180 - 50);
player.spawn(0, 0, spawnYaw);
chunks.warmup(player.position);
// Evita começar colado a um tronco: procura em espiral um ponto livre por perto.
for (let i = 0; i < 60 && !chunks.isClear(player.position.x, player.position.z, 4); i++) {
  const a = i * 2.4;
  const r = 2 + i * 1.5;
  player.spawn(Math.cos(a) * r, Math.sin(a) * r, spawnYaw);
}
chunks.resolveCollision(player.position, CONFIG.player.radius);

const weapon = new Weapon(engine, input, player, hud, audio, atmosphere.sunDir);
input.onLockChange = (locked) => hud.setHintVisible(!locked);

const debug = new URLSearchParams(location.search).has('debug');
let frames = 0;
let fpsTimer = 0;

let last = performance.now();
engine.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const realDt = (now - last) / 1000;
  const dt = Math.min(realDt, CONFIG.maxDt);
  last = now;

  windTime.value += dt;
  player.update(dt);
  weapon.update(dt);
  chunks.update(player.position);
  atmosphere.update(player.position, engine.camera);
  engine.render();
  input.endFrame();

  if (debug) {
    frames++;
    fpsTimer += realDt;
    if (fpsTimer >= 0.5) {
      const fps = Math.round(frames / fpsTimer);
      frames = 0;
      fpsTimer = 0;
      const info = engine.renderer.info.render;
      const p = player.position;
      const s = chunks.stats;
      hud.setDebug(
        `${fps} fps\ndraw ${info.calls}  tris ${info.triangles}\n` +
          `chunks ${s.loaded}  fila ${s.queued}  grama ${s.grass}\n` +
          `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`,
      );
    }
  }
});

if (import.meta.env.DEV) {
  Object.assign(window, {
    game: { engine, input, player, terrain, biome, vegetation, chunks, atmosphere, hud, audio, weapon },
  });
}
