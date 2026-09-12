import './style.css';
import * as THREE from 'three';
import { Ambience } from './audio/Ambience';
import * as animalSounds from './audio/animalSounds';
import { AudioSystem } from './audio/AudioSystem';
import * as birdSongs from './audio/birdSongs';
import { BirdVoices } from './audio/BirdVoices';
import { Footsteps } from './audio/Footsteps';
import { Music } from './audio/Music';
import * as weaponSounds from './audio/weaponSounds';
import { BirdManager } from './birds/BirdManager';
import { Hunting } from './combat/Hunting';
import { Particles } from './effects/Particles';
import { CONFIG } from './config';
import { Engine } from './core/Engine';
import { Quality } from './core/Quality';
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
const quality = new Quality(engine.renderer, atmosphere.sun);

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
const birds = new BirdManager(engine.scene, terrain, biome, chunks, player, engine.camera);
birds.populate();
const particles = new Particles(engine.scene, terrain);
const hunting = new Hunting(terrain, chunks, birds, particles, hud, audio);
const ambience = new Ambience(audio, biome);
const voices = new BirdVoices(audio);
const footsteps = new Footsteps(audio, biome);
const music = new Music(audio);
weapon.onFire = (origin, dir) => hunting.shoot(origin, dir);
input.onLockChange = (locked) => {
  hud.setHintVisible(!locked);
  if (!locked) weapon.cancelAim();
};

const debug = new URLSearchParams(location.search).has('debug');
let frames = 0;
let fpsTimer = 0;
let cpuUpdate = 0;
let cpuRender = 0;

/** Depuração: pausa o loop (benchmarks sem a renderização disputando a CPU). */
let paused = false;
let last = performance.now();
engine.renderer.setAnimationLoop(() => {
  if (paused) {
    last = performance.now();
    return;
  }
  const now = performance.now();
  const realDt = (now - last) / 1000;
  const dt = Math.min(realDt, CONFIG.maxDt);
  last = now;

  const t0 = performance.now();
  windTime.value += dt;
  player.update(dt);
  weapon.update(dt);
  birds.update(dt);
  particles.update(dt);
  audio.updateListener(engine.camera);
  ambience.update(dt, player, engine.camera.position);
  voices.update(dt, birds.active, engine.camera.position);
  footsteps.update(dt, player);
  music.update();
  if (input.wasPressed('KeyM')) hud.toast(music.toggle() ? 'Música ligada' : 'Música desligada');
  chunks.update(player.position);
  atmosphere.update(player.position, engine.camera);
  const t1 = performance.now();
  engine.render();
  const t2 = performance.now();
  input.endFrame();
  quality.update(realDt);

  if (debug) {
    frames++;
    fpsTimer += realDt;
    cpuUpdate += t1 - t0;
    cpuRender += t2 - t1;
    if (fpsTimer >= 0.5) {
      const fps = Math.round(frames / fpsTimer);
      const cpu = `cpu: lógica ${(cpuUpdate / frames).toFixed(1)} ms  envio p/ GPU ${(cpuRender / frames).toFixed(1)} ms`;
      frames = 0;
      fpsTimer = 0;
      cpuUpdate = 0;
      cpuRender = 0;
      const info = engine.renderer.info.render;
      const p = player.position;
      const s = chunks.stats;
      hud.setDebug(
        `${fps} fps  qualidade ${quality.name}\n${cpu}\ndraw ${info.calls}  tris ${info.triangles}\n` +
          `chunks ${s.loaded}  fila ${s.queued}  grama ${s.grass}\n` +
          `pássaros ${birds.living}  corpos ${birds.active.length - birds.living}  partículas ${particles.count}\n` +
          `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}`,
      );
    }
  }
});

if (import.meta.env.DEV) {
  Object.assign(window, {
    game: {
      engine,
      input,
      player,
      terrain,
      biome,
      vegetation,
      chunks,
      atmosphere,
      hud,
      audio,
      weapon,
      birds,
      particles,
      hunting,
      ambience,
      voices,
      footsteps,
      music,
      quality,
      setPaused: (value: boolean) => {
        paused = value;
      },
      sounds: { ...weaponSounds, ...birdSongs, ...animalSounds },
    },
  });
}
