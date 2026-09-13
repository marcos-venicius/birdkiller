import './style.css';
import * as THREE from 'three';
import { boarKind, deerKind } from './animals/kinds';
import { QuadrupedManager } from './animals/QuadrupedManager';
import { Ambience } from './audio/Ambience';
import * as animalSounds from './audio/animalSounds';
import { AudioSystem } from './audio/AudioSystem';
import * as birdSongs from './audio/birdSongs';
import { BirdVoices } from './audio/BirdVoices';
import * as boarSounds from './audio/boarSounds';
import * as deerSounds from './audio/deerSounds';
import { AnimalVoices } from './audio/AnimalVoices';
import { Footsteps } from './audio/Footsteps';
import { Music } from './audio/Music';
import * as weaponSounds from './audio/weaponSounds';
import { BirdManager } from './birds/BirdManager';
import { Ballistics } from './combat/Ballistics';
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
import type { Lake } from './world/Lakes';
import { Water } from './world/Water';
import { Weather } from './world/Weather';
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
const water = new Water(engine.scene, terrain.lakes);
const weather = new Weather(engine.scene);
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

const weapon = new Weapon(engine, input, player, hud, audio, atmosphere);
const birds = new BirdManager(engine.scene, terrain, biome, chunks, player, engine.camera);
birds.populate();
const boars = new QuadrupedManager(boarKind(), engine.scene, terrain, biome, chunks, player, engine.camera);
boars.populate();
const deer = new QuadrupedManager(deerKind(), engine.scene, terrain, biome, chunks, player, engine.camera);
deer.populate();
const particles = new Particles(engine.scene, terrain);
const ballistics = new Ballistics(engine.scene);
const hunting = new Hunting(terrain, chunks, birds, [boars, deer], particles, hud, audio, ballistics);
const ambience = new Ambience(audio, biome, terrain.lakes);
const voices = new BirdVoices(audio);
const boarVoices = new AnimalVoices(audio, boarKind().sounds);
const deerVoices = new AnimalVoices(audio, deerKind().sounds);
const footsteps = new Footsteps(audio, biome);
const music = new Music(audio);
weapon.onFire = (origin, dir) => hunting.shoot(origin, dir);
input.onLockChange = (locked) => {
  hud.setHintVisible(!locked);
  if (!locked) weapon.cancelAim();
};

// Bússola: o jogador liga/desliga com L e a escolha é lembrada.
const COMPASS_KEY = 'birdkiller.bussola';
let compassOn = true;
try {
  compassOn = localStorage.getItem(COMPASS_KEY) !== '0';
} catch {
  // Sem armazenamento (janela privada): fica ligada.
}
hud.setCompassEnabled(compassOn);
const compassMarks: { bearing: number; distance: number }[] = [];
const compassLakes: Lake[] = [];
let compassTimer = 0;
const rangeDir = new THREE.Vector3();
let rangeTimer = 0;

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
  // À noite (e na chuva) aparecem menos pássaros — e eles quase não cantam.
  birds.activity = (1 - atmosphere.night * 0.65) * (1 - weather.rain * 0.5);
  birds.update(dt);
  boars.update(dt);
  deer.update(dt);
  hunting.update(dt, engine.camera.position);
  particles.update(dt);
  audio.updateListener(engine.camera);
  ambience.update(dt, player, engine.camera.position, atmosphere.night, weather.rain);
  voices.update(dt, birds.active, engine.camera.position, atmosphere.night);
  boarVoices.update(dt, boars.active, engine.camera.position);
  deerVoices.update(dt, deer.active, engine.camera.position);
  footsteps.update(dt, player);
  music.update();
  if (input.wasPressed('KeyM')) hud.toast(music.toggle() ? 'Música ligada' : 'Música desligada');
  if (input.wasPressed('KeyL')) {
    compassOn = !compassOn;
    hud.setCompassEnabled(compassOn);
    hud.toast(compassOn ? 'Bússola ligada' : 'Bússola desligada');
    try {
      localStorage.setItem(COMPASS_KEY, compassOn ? '1' : '0');
    } catch {
      // Sem armazenamento: só não lembra a escolha.
    }
  }
  // Telêmetro da luneta: o que está na mira, 10x por segundo.
  rangeTimer -= dt;
  if (rangeTimer <= 0) {
    rangeTimer = 0.1;
    if (weapon.inScope) {
      engine.camera.getWorldDirection(rangeDir);
      const d = hunting.measure(engine.camera.position, rangeDir);
      hud.setRange(Number.isFinite(d) ? d : null);
    } else {
      hud.setRange(null);
    }
  }
  compassTimer -= dt;
  if (compassOn && compassTimer <= 0) {
    compassTimer = 0.12;
    const p = player.position;
    terrain.lakes.near(p.x, p.z, 600, compassLakes);
    compassMarks.length = 0;
    for (const lake of compassLakes) {
      const dx = lake.x - p.x;
      const dz = lake.z - p.z;
      compassMarks.push({
        bearing: (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360,
        distance: Math.max(0, Math.hypot(dx, dz) - lake.r),
      });
    }
    compassMarks.sort((a, b) => a.distance - b.distance);
    // Câmera olhando para -Z quando yaw = 0: o rumo é o oposto do yaw.
    hud.setCompass((THREE.MathUtils.radToDeg(-player.yaw) + 360) % 360, compassMarks);
  }
  chunks.update(player.position);
  weather.update(dt, engine.camera, atmosphere);
  atmosphere.update(player.position, engine.camera, dt);
  water.update(player.position, atmosphere, dt, weather.rain);
  engine.renderer.toneMappingExposure = atmosphere.exposure;
  // Antes do render: trocar a resolução limpa o canvas, e o quadro precisa ser desenhado já no novo tamanho.
  quality.update(realDt);
  const t1 = performance.now();
  engine.render();
  const t2 = performance.now();
  input.endFrame();

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
        `${fps} fps  qualidade ${quality.name}  hora ${atmosphere.clock}  chuva ${Math.round(weather.rain * 100)}%  neblina ${Math.round(weather.mist * 100)}%\n${cpu}\ndraw ${info.calls}  tris ${info.triangles}\n` +
          `chunks ${s.loaded}  fila ${s.queued}  grama ${s.grass}\n` +
          `pássaros ${birds.living}  javalis ${boars.living}  veados ${deer.living}  corpos ${birds.active.length - birds.living + boars.active.length - boars.living + deer.active.length - deer.living}  partículas ${particles.count}\n` +
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
      water,
      weather,
      hud,
      audio,
      weapon,
      birds,
      boars,
      deer,
      particles,
      hunting,
      ballistics,
      ambience,
      voices,
      boarVoices,
      deerVoices,
      footsteps,
      music,
      quality,
      setPaused: (value: boolean) => {
        paused = value;
      },
      sounds: { ...weaponSounds, ...birdSongs, ...animalSounds, ...boarSounds, ...deerSounds },
    },
  });
}
