import './style.css';
import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { Atmosphere } from './world/Atmosphere';
import { Terrain } from './world/Terrain';
import { PlayerController } from './player/PlayerController';
import { HUD } from './ui/HUD';

const engine = new Engine(document.querySelector<HTMLElement>('#app')!);
const input = new Input(engine.renderer.domElement);
const hud = new HUD(document.querySelector<HTMLElement>('#hud')!);
const terrain = new Terrain(CONFIG.seed);
const atmosphere = new Atmosphere(engine.scene);

// Etapa 1: grade fixa de chunks ao redor da origem (a Etapa 2 troca por streaming com ChunkManager).
const R = CONFIG.world.staticChunkRadius;
for (let cz = -R; cz < R; cz++) {
  for (let cx = -R; cx < R; cx++) engine.scene.add(terrain.createChunkMesh(cx, cz));
}

const player = new PlayerController(engine.camera, input, terrain);
// Começa olhando de lado para o sol: a luz rasante fica visível sem ofuscar.
player.spawn(0, 0, THREE.MathUtils.degToRad(CONFIG.atmosphere.sunAzimuth + 180 - 50));

hud.setAmmo(CONFIG.weapon.magazineSize);
input.onLockChange = (locked) => hud.setHintVisible(!locked);

const debug = new URLSearchParams(location.search).has('debug');
let frames = 0;
let fpsTimer = 0;
let fps = 0;

let last = performance.now();
engine.renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, CONFIG.maxDt);
  last = now;

  player.update(dt);
  atmosphere.update(player.position, engine.camera);
  engine.render();
  input.endFrame();

  if (debug) {
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fps = Math.round(frames / fpsTimer);
      frames = 0;
      fpsTimer = 0;
      const info = engine.renderer.info.render;
      const p = player.position;
      hud.setDebug(
        `${fps} fps\ndraw ${info.calls}  tris ${info.triangles}\n` +
          `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`,
      );
    }
  }
});

if (import.meta.env.DEV) {
  Object.assign(window, { game: { engine, input, player, terrain, atmosphere, hud } });
}
