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
import { smoothstep } from './core/math';
import { Quality } from './core/Quality';
import { Input } from './core/Input';
import { PlayerController } from './player/PlayerController';
import { HUD } from './ui/HUD';
import { Journal } from './ui/Journal';
import { Markers } from './ui/Markers';
import { browserStore, resolveWorldSeed, SessionStore, shareUrl } from './ui/Session';
import { Weapon } from './weapon/Weapon';
import { Atmosphere } from './world/Atmosphere';
import type { Lake } from './world/Lakes';
import { PLACE_KINDS, type PlaceType } from './world/Places';
import { PlaceView } from './world/PlaceView';
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

// Mundo: o do link (`?seed=`), senão o seu; na primeira visita um mundo novo é sorteado.
const world = resolveWorldSeed(location.search, browserStore, import.meta.env.DEV);
const biome = new Biome(world.seed);
const terrain = new Terrain(world.seed, biome);
const vegetation = new Vegetation(terrain, biome, world.seed);
const chunks = new ChunkManager(engine.scene, terrain, vegetation);
const atmosphere = new Atmosphere(engine.scene);
const water = new Water(engine.scene, terrain.lakes);
const weather = new Weather(engine.scene);
const placeView = new PlaceView(engine.scene, terrain.places, terrain, vegetation);
const quality = new Quality(engine.renderer, atmosphere.sun);

const player = new PlayerController(engine.camera, input, terrain, chunks);
// Começa olhando de lado para o sol: a luz rasante fica visível sem ofuscar.
const spawnYaw = THREE.MathUtils.degToRad(CONFIG.atmosphere.sunAzimuth + 180 - 50);
player.spawn(0, 0, spawnYaw);
chunks.warmup(player.position);
// Evita começar colado a um tronco: procura em espiral um ponto livre por perto.
for (
  let i = 0;
  i < 60 && (!chunks.isClear(player.position.x, player.position.z, 4) || !terrain.places.clear(player.position.x, player.position.z, 4));
  i++
) {
  const a = i * 2.4;
  const r = 2 + i * 1.5;
  player.spawn(Math.cos(a) * r, Math.sin(a) * r, spawnYaw);
}
chunks.resolveCollision(player.position, CONFIG.player.radius);

// Continuar de onde parou: posição, olhar, hora e clima deste mundo (antes de povoar os bichos, para eles
// nascerem em volta de onde o jogador está). Em desenvolvimento, os atalhos de teste mandam.
const session = new SessionStore(world.seed);
const testing = import.meta.env.DEV && /[?&](hora|chuva|ir)=/.test(location.search);
const resumed = testing ? null : session.load();
if (resumed) {
  player.spawn(resumed.x, resumed.z, resumed.yaw);
  player.pitch = resumed.pitch;
  // Salvo em cima da torre ou dentro da cabana: volta para o piso, não para o chão lá embaixo.
  player.position.y = Math.max(player.position.y, resumed.y);
  chunks.warmup(player.position);
  atmosphere.setHour(resumed.hour);
  weather.restore(resumed.weather);
}

// Testes (só no modo de desenvolvimento — o build publicado não tem): `?ir=torre`, `?ir=cabana` ou
// `?ir=arvore` começa a ~30 m do lugar desse tipo mais perto do início, olhando para ele.
if (import.meta.env.DEV) goToPlace();

function goToPlace(): void {
  const GO_TO: Record<string, PlaceType> = { torre: 'tower', cabana: 'cabin', arvore: 'giantTree', árvore: 'giantTree' };
  const goTo = GO_TO[new URLSearchParams(location.search).get('ir') ?? ''];
  if (!goTo) return;
  const target = terrain.places
    .near(0, 0, 4000, [])
    .filter((p) => p.type === goTo)
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  if (target) {
    // Frente do lugar (+Z local) = (-sin yaw, cos yaw); se ali não couber, vai girando em volta.
    for (let k = 0; k < 16; k++) {
      const a = Math.atan2(Math.cos(target.yaw), -Math.sin(target.yaw)) + k * 0.4;
      const x = target.x + Math.cos(a) * 30;
      const z = target.z + Math.sin(a) * 30;
      player.spawn(x, z, Math.atan2(-(target.x - x), -(target.z - z)));
      chunks.warmup(player.position);
      if (chunks.isClear(x, z, 2) && terrain.open(x, z, 0)) break;
    }
    hud.toast(`Perto de: ${PLACE_KINDS.find((k) => k.type === goTo)!.name}`);
  }
}

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

// Caderno de campo: espécies avistadas/abatidas, recordes e totais, guardados entre sessões.
// Comuns primeiro; os raros ficam no fim da lista, como "???" até aparecerem.
const journal = new Journal([
  ...birds.speciesList.filter((s) => !s.rare).map((s) => ({ id: s.id, name: s.name })),
  { id: boars.kind.id, name: boars.kind.name },
  { id: deer.kind.id, name: deer.kind.name },
  ...birds.speciesList.filter((s) => s.rare).map((s) => ({ id: s.id, name: s.name })),
  ...[boars, deer].flatMap((m) => m.kind.rares.map((r) => ({ id: r.id, name: r.name }))),
], PLACE_KINDS);
hunting.onKill = (info) => {
  const night = atmosphere.night > CONFIG.journal.nightThreshold;
  const news = journal.recordKill({ ...info, night, clock: atmosphere.clock }, hunting.score);
  if (news.length) hud.note(news.join('  ·  '));
};
window.addEventListener('pagehide', () => journal.flush());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) journal.flush();
});
const spotDir = new THREE.Vector3();
const spotNdc = new THREE.Vector3();
let spotTimer = 0;
let journalOpen = false;
let journalRefresh = 0;

/** Chegou perto de um lugar (ou subiu nele): entra no caderno. */
function discoverPlaces(): void {
  const p = terrain.places.at(player.position.x, player.position.z);
  if (!p || Math.hypot(player.position.x - p.x, player.position.z - p.z) > CONFIG.places.discoverDistance) return;
  const msg = journal.discover(p.id, p.type);
  if (msg) hud.note(msg);
}

/** Bicho de espécie ainda não avistada, na tela, perto e sem nada no caminho: entra no caderno. */
function spotAnimals(): void {
  if (journal.complete) return;
  const cam = engine.camera;
  const news: string[] = [];
  const check = (id: string, p: THREE.Vector3): void => {
    if (!journal.isUnseen(id)) return;
    const d = cam.position.distanceTo(p);
    if (d > CONFIG.journal.spotDistance || d < 0.5) return;
    spotNdc.copy(p).project(cam);
    if (spotNdc.z > 1 || Math.abs(spotNdc.x) > 1 || Math.abs(spotNdc.y) > 1) return;
    spotDir.subVectors(p, cam.position).divideScalar(d);
    const clear = d - 0.8;
    if (terrain.raycast(cam.position, spotDir, clear) < clear) return;
    if (chunks.raycastObstacles(cam.position, spotDir, clear).kind) return;
    const msg = journal.spot(id);
    if (msg) news.push(msg);
  };
  for (const b of birds.active) if (b.alive) check(b.species.id, b.pos);
  for (const m of [boars, deer]) for (const a of m.active) if (a.alive) check(a.rare?.id ?? m.kind.id, a.group.position);
  if (news.length) hud.note(news.join('  ·  '));
}
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
// Marcadores de direção (tecla Q): marcam o ponto na mira, aparecem na bússola e no mundo.
const markers = new Markers();
const compassPins: { n: number; bearing: number; distance: number }[] = [];
const worldPins: { n: number; x: number; y: number; distance: number }[] = [];
const markDir = new THREE.Vector3();
const markTarget = new THREE.Vector3();
const pinNdc = new THREE.Vector3();

// O resto da sessão salva: pontuação e marcadores.
if (resumed) {
  hunting.restore(resumed.score, resumed.kills);
  for (const m of resumed.markers) markers.list.push({ n: m.n, pos: new THREE.Vector3(m.x, m.y, m.z) });
  hud.toast('Continuando de onde você parou');
}

/** Guarda o "continuar de onde parou" deste mundo. */
function saveSession(): void {
  session.save({
    v: 1,
    savedAt: Date.now(),
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    yaw: player.yaw,
    pitch: player.pitch,
    hour: atmosphere.hour,
    weather: weather.snapshot(),
    score: hunting.score,
    kills: hunting.kills,
    markers: markers.list.map((m) => ({ n: m.n, x: m.pos.x, y: m.pos.y, z: m.pos.z })),
  });
}
let sessionTimer = 10;
window.addEventListener('pagehide', saveSession);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveSession();
});

// Compartilhar (tecla K): copia o link deste mundo; sem área de transferência, mostra o link na tela.
const worldLabel = `Mundo ${world.seed}${world.shared ? ' (de um link)' : ''} · K copia o link`;
function shareWorld(): void {
  const url = shareUrl(world.seed);
  const fail = () => hud.note(url);
  if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => hud.toast('Link do seu mundo copiado'), fail);
  else fail();
}
const rangeDir = new THREE.Vector3();
// Luneta infravermelha (tecla V): só enxerga térmico com a luneta no olho.
let infrared = false;
let rangeTimer = 0;

// `?debug` (FPS, CPU, relógio, posição) é ferramenta de desenvolvimento: não existe no build publicado.
const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
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
  birds.dawn = atmosphere.hour >= CONFIG.rares.dawn[0] && atmosphere.hour <= CONFIG.rares.dawn[1];
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
  // Caderno de campo: tempo em campo, avistamentos e o painel com Tab segurado.
  journal.tick(Math.min(realDt, 1));
  sessionTimer -= realDt;
  if (sessionTimer <= 0) {
    sessionTimer = 10;
    saveSession();
  }
  spotTimer -= dt;
  if (spotTimer <= 0) {
    spotTimer = CONFIG.journal.spotInterval;
    spotAnimals();
    discoverPlaces();
  }
  if (input.isDown('Tab')) {
    journalRefresh -= dt;
    if (!journalOpen || journalRefresh <= 0) {
      hud.showJournal(journal.view(), worldLabel);
      journalOpen = true;
      journalRefresh = 0.5;
    }
  } else if (journalOpen) {
    hud.hideJournal();
    journalOpen = false;
  }
  if (input.wasPressed('KeyQ')) {
    // Marca o que está na mira (mesmo raio do telêmetro); mirando o céu, um ponto longe na mesma linha.
    const cam = engine.camera;
    cam.getWorldDirection(markDir);
    const d = hunting.measure(cam.position, markDir);
    markTarget.copy(cam.position).addScaledVector(markDir, Number.isFinite(d) ? d : CONFIG.markers.skyDistance);
    const r = markers.toggle(cam.position, markDir, markTarget);
    hud.toast(r.action === 'added' ? `Marcador ${r.n}` : `Marcador ${r.n} removido`);
    compassTimer = 0;
  }
  if (input.wasPressed('KeyK')) shareWorld();
  if (input.wasPressed('KeyV')) {
    infrared = !infrared;
    hud.toast(infrared ? 'Infravermelho ligado' : 'Infravermelho desligado');
  }
  engine.thermal = infrared && weapon.inScope;
  if (engine.thermal) {
    // Sol alto aquece o chão e mata o contraste; chuva, nuvem e neblina esfriam tudo de novo.
    const sun = smoothstep(0, 35, atmosphere.sunElevation);
    const heat = sun * (1 - 0.85 * weather.rain) * (1 - 0.55 * weather.cloud) * (1 - 0.5 * weather.mist);
    engine.setThermalHeat(THREE.MathUtils.clamp(heat, 0, 1), atmosphere.sunDir);
  }
  hud.setInfrared(engine.thermal);
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
    compassPins.length = 0;
    for (const m of markers.list) {
      const dx = m.pos.x - p.x;
      const dz = m.pos.z - p.z;
      compassPins.push({ n: m.n, bearing: (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360, distance: Math.hypot(dx, dz) });
    }
    hud.setCompass((THREE.MathUtils.radToDeg(-player.yaw) + 360) % 360, compassMarks, compassPins);
  }
  // Marcadores no mundo: projetados na tela a cada quadro (poucos, só transform de DOM).
  worldPins.length = 0;
  if (markers.list.length > 0) {
    const cam = engine.camera;
    cam.updateMatrixWorld();
    for (const m of markers.list) {
      pinNdc.copy(m.pos).project(cam);
      if (pinNdc.z > 1 || Math.abs(pinNdc.x) > 1.02 || Math.abs(pinNdc.y) > 1.02) continue;
      worldPins.push({
        n: m.n,
        x: (pinNdc.x * 0.5 + 0.5) * window.innerWidth,
        y: (-pinNdc.y * 0.5 + 0.5) * window.innerHeight,
        distance: Math.hypot(m.pos.x - player.position.x, m.pos.z - player.position.z),
      });
    }
  }
  hud.setWorldPins(worldPins);
  chunks.update(player.position);
  weather.update(dt, engine.camera, atmosphere);
  atmosphere.update(player.position, engine.camera, dt);
  water.update(player.position, atmosphere, dt, weather.rain);
  placeView.update(player.position);
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
      journal,
      spotAnimals,
      markers,
      placeView,
      discoverPlaces,
      world,
      session,
      saveSession,
      shareUrl,
      resolveWorldSeed,
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
