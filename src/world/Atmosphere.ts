import * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep } from '../core/math';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uFog;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uMoon;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // Abaixo/rente ao horizonte = cor da névoa, para esconder o fim do terreno.
    vec3 col = mix(uFog, uHorizon, smoothstep(-0.02, 0.1, h));
    col = mix(col, uTop, smoothstep(0.1, 0.65, h));

    // Sol: brilho em volta e disco — somem quando ele desce abaixo do horizonte.
    float sunVis = smoothstep(-0.06, 0.02, uSunDir.y);
    float sd = max(dot(d, uSunDir), 0.0);
    float lowSky = 1.0 - 0.6 * smoothstep(0.0, 0.5, h);
    col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.7) * lowSky * sunVis;
    col += uSunColor * smoothstep(0.99970, 0.99982, sd) * 8.0 * sunVis * step(0.0, h);

    // Estrelas: pontos sorteados numa grade sobre a esfera, piscando de leve.
    if (uStars > 0.001 && h > 0.0) {
      vec3 p = d * 220.0;
      float r = hash13(floor(p));
      float star = step(0.9965, r) * smoothstep(0.42, 0.05, length(fract(p) - 0.5));
      float twinkle = 0.65 + 0.35 * sin(uTime * (2.0 + r * 5.0) + r * 60.0);
      col += vec3(0.85, 0.9, 1.0) * star * twinkle * uStars * smoothstep(0.0, 0.15, h) * 1.6;
    }

    // Lua: disco claro com manchas e halo suave.
    float md = max(dot(d, uMoonDir), 0.0);
    float moonVis = uMoon * smoothstep(-0.03, 0.03, uMoonDir.y);
    float disc = smoothstep(0.99955, 0.99968, md);
    float spots = 0.82 + 0.18 * hash13(floor(d * 900.0));
    col += vec3(0.86, 0.9, 1.0) * disc * spots * 2.2 * moonVis;
    col += (vec3(0.5, 0.6, 0.8) * pow(md, 400.0) * 0.35 + vec3(0.3, 0.38, 0.55) * pow(md, 30.0) * 0.08) * moonVis;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

/** Aparência do mundo para uma elevação do sol (graus). */
interface Look {
  elev: number;
  top: number;
  horizon: number;
  fog: number;
  /** Cor/intensidade da luz principal: sol acima do horizonte, luar abaixo dele. */
  key: number;
  keyI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  exposure: number;
  stars: number;
}

const A = CONFIG.atmosphere;
/** Do fundo da noite ao meio-dia. O ponto de 13° é exatamente o fim de tarde original. */
const LOOKS: Look[] = [
  { elev: -18, top: 0x03060e, horizon: 0x0b1224, fog: 0x0a0f1a, key: 0x9fb4e0, keyI: 0.9, hemiSky: 0x33466e, hemiGround: 0x1a1a1e, hemiI: 1.5, exposure: 1.75, stars: 1 },
  { elev: -8, top: 0x0b1232, horizon: 0x2e2e54, fog: 0x1f1f32, key: 0x9fb4e0, keyI: 0.7, hemiSky: 0x4a5a88, hemiGround: 0x2a2620, hemiI: 1.9, exposure: 1.5, stars: 0.55 },
  { elev: 0, top: 0x1d2550, horizon: 0xb85a3e, fog: 0x4e3c44, key: 0xff7a40, keyI: 1.4, hemiSky: 0x6a6c98, hemiGround: 0x3e3428, hemiI: 2.3, exposure: 1.25, stars: 0.05 },
  { elev: 5, top: 0x27305a, horizon: 0xd0703e, fog: 0x6e5552, key: 0xff8a48, keyI: 4.0, hemiSky: 0x7a84aa, hemiGround: 0x4e4230, hemiI: 2.8, exposure: 1.15, stars: 0 },
  {
    elev: A.sunElevation,
    top: A.skyTop,
    horizon: A.skyHorizon,
    fog: A.fogColor,
    key: A.sunColor,
    keyI: A.sunIntensity,
    hemiSky: A.skyLight,
    hemiGround: A.groundLight,
    hemiI: A.hemiIntensity,
    exposure: CONFIG.render.exposure,
    stars: 0,
  },
  { elev: 28, top: 0x3a66a8, horizon: 0xb4c2c8, fog: 0x94a2a8, key: 0xfff0d8, keyI: 6.5, hemiSky: 0xa8bcd8, hemiGround: 0x5e5a40, hemiI: 3.4, exposure: 1.0, stars: 0 },
  { elev: 50, top: 0x2f5fa8, horizon: 0xa8c0d8, fog: 0x98aabc, key: 0xfffaf0, keyI: 7, hemiSky: 0xb0c8e8, hemiGround: 0x62603f, hemiI: 3.5, exposure: 0.95, stars: 0 },
];
/** Mesmos pontos com as cores já convertidas (espaço linear) para interpolar sem alocar. */
const LOOK_COLORS = LOOKS.map((l) => ({
  top: new THREE.Color(l.top),
  horizon: new THREE.Color(l.horizon),
  fog: new THREE.Color(l.fog),
  key: new THREE.Color(l.key),
  hemiSky: new THREE.Color(l.hemiSky),
  hemiGround: new THREE.Color(l.hemiGround),
}));

const ORIGIN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hora inicial: `?hora=22` na URL, senão a configurada. */
function startHour(): number {
  const h = Number.parseFloat(new URLSearchParams(location.search).get('hora') ?? '');
  return Number.isFinite(h) && h >= 0 && h < 24 ? h : CONFIG.dayNight.startHour;
}

/**
 * Ciclo de dia e noite: sol e lua percorrem o céu, e céu, névoa, luzes e exposição seguem
 * a elevação do sol. A luz principal (com sombras) é o sol de dia e a lua à noite; as duas
 * passam por intensidade zero no horizonte, então a troca não aparece.
 */
export class Atmosphere {
  /** Luz principal com sombras: sol de dia, lua à noite. */
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  /** Direção da luz principal (sol ou lua). */
  readonly lightDir = new THREE.Vector3();
  readonly keyColor = new THREE.Color();
  keyIntensity = 0;
  /** Hora do dia (0–24). */
  hour: number;
  sunElevation = 0;
  /** 0 = dia, 1 = noite fechada. */
  night = 0;
  /** Exposição sugerida para o tone mapping (sobe no escuro, como o olho se adaptando). */
  exposure: number = CONFIG.render.exposure;
  /** Tempo fechado (0..1): abafa a luz principal, cinza o céu e engrossa a névoa. Definido pelo Weather. */
  cloud = 0;
  /** Multiplicador da densidade da névoa (chuva e neblina de madrugada). */
  fogFactor = 1;

  private readonly fog: THREE.FogExp2;
  private readonly sky: THREE.Mesh;
  private readonly skyUniforms: Record<string, THREE.IUniform>;
  private readonly lightBasis = new THREE.Matrix4();
  private readonly lightBasisInv = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();
  /** Cor para onde o céu e a névoa puxam com o tempo fechado. */
  private readonly overcast = new THREE.Color(0x77797d);
  private readonly grayed = new THREE.Color();
  private readonly look = {
    top: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    key: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    keyI: 0,
    hemiI: 0,
    exposure: 1,
    stars: 0,
  };

  constructor(scene: THREE.Scene) {
    const cfg = CONFIG.atmosphere;
    this.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(cfg.skyLight, cfg.groundLight, cfg.hemiIntensity);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
    this.sun.castShadow = true;
    const shadow = this.sun.shadow;
    shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
    const cam = shadow.camera;
    cam.left = -cfg.shadowExtentX;
    cam.right = cfg.shadowExtentX;
    cam.near = 1;
    cam.far = cfg.shadowDistance * 2;
    shadow.bias = -0.0003;
    shadow.normalBias = 0.3;
    scene.add(this.sun, this.sun.target);

    this.skyUniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir },
      uMoonDir: { value: this.moonDir },
      uMoon: { value: 0 },
      uStars: { value: 0 },
      uTime: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      // Ruído sutil no degradê do céu: elimina as faixas de 8 bits.
      dithering: true,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.hour = startHour();
    this.applyTime();
  }

  /** Cor do céu no alto (para a água refletir). */
  get skyTop(): THREE.Color {
    return this.look.top;
  }

  /** Cor do céu no horizonte. */
  get skyHorizon(): THREE.Color {
    return this.look.horizon;
  }

  /** Relógio "HH:MM". */
  get clock(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Pula para uma hora (depuração/testes). */
  setHour(hour: number): void {
    this.hour = ((hour % 24) + 24) % 24;
    this.applyTime();
  }

  update(focus: THREE.Vector3, camera: THREE.Camera, dt = 0): void {
    if (dt > 0) {
      // O relógio anda devagar perto do horizonte (entardecer e amanhecer), no ritmo normal
      // durante o dia e mais rápido de madrugada.
      const D = CONFIG.dayNight;
      const S = THREE.MathUtils.smoothstep;
      const elev = this.sunElevation;
      const speed =
        elev >= -3
          ? THREE.MathUtils.lerp(D.twilightSpeed, 1, S(elev, 10, 24))
          : THREE.MathUtils.lerp(D.twilightSpeed, D.nightSpeed, S(-elev, 3, 10));
      this.hour = (this.hour + (dt / 60) * D.hoursPerMinute * speed) % 24;
      this.applyTime();
      this.skyUniforms.uTime.value += dt;
    }
    this.sky.position.copy(camera.position);

    // A sombra acompanha o jogador, alinhada à grade de texels (sem tremulação).
    const cfg = CONFIG.atmosphere;
    const cam = this.sun.shadow.camera;
    const texelX = (cfg.shadowExtentX * 2) / this.sun.shadow.mapSize.x;
    const texelY = (cam.top * 2) / this.sun.shadow.mapSize.y;
    const p = this.tmp.copy(focus).applyMatrix4(this.lightBasisInv);
    p.x = Math.round(p.x / texelX) * texelX;
    p.y = Math.round(p.y / texelY) * texelY;
    p.applyMatrix4(this.lightBasis);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.lightDir, cfg.shadowDistance);
    this.sun.target.updateMatrixWorld();
  }

  private applyTime(): void {
    const D = CONFIG.dayNight;
    const elev = D.maxElevation * Math.sin((Math.PI * (this.hour - 6)) / 12);
    const az = THREE.MathUtils.degToRad(D.noonAzimuth + (this.hour - 12) * 15);
    const e = THREE.MathUtils.degToRad(elev);
    this.sunElevation = elev;
    this.sunDir.set(Math.cos(e) * Math.sin(az), Math.sin(e), Math.cos(e) * Math.cos(az));
    // A lua fica do lado oposto: nasce quando o sol se põe.
    this.moonDir.copy(this.sunDir).negate();

    this.sample(elev);
    const L = this.look;
    this.night = 1 - smoothstep(-10, 2, elev);
    // Sol e lua valem zero no horizonte: a troca da luz principal não dá salto.
    if (elev >= 0) {
      this.lightDir.copy(this.sunDir);
      this.keyIntensity = L.keyI * smoothstep(0, 3, elev);
    } else {
      this.lightDir.copy(this.moonDir);
      this.keyIntensity = L.keyI * smoothstep(0, -6, elev);
    }
    // Tempo fechado: o sol some atrás das nuvens, o céu perde a cor e a luz do céu compensa um pouco.
    const c = this.cloud;
    const gray = (from: THREE.Color): THREE.Color => this.grayed.copy(from).lerp(this.overcast, c * 0.88 * (0.35 + 0.65 * smoothstep(-6, 6, elev)));
    this.keyIntensity *= 1 - 0.8 * c;
    this.keyColor.copy(L.key);
    this.sun.color.copy(L.key);
    this.sun.intensity = this.keyIntensity;
    this.hemi.color.copy(gray(L.hemiSky));
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiI * (1 + 0.2 * c);
    this.fog.color.copy(gray(L.fog));
    this.fog.density = CONFIG.atmosphere.fogDensity * this.fogFactor;
    this.exposure = L.exposure * (1 + 0.1 * c);

    const U = this.skyUniforms;
    (U.uTop.value as THREE.Color).copy(gray(L.top));
    (U.uHorizon.value as THREE.Color).copy(gray(L.horizon));
    (U.uFog.value as THREE.Color).copy(gray(L.fog));
    // Com o tempo fechado o disco do sol e o brilho dele somem atrás das nuvens.
    (U.uSunColor.value as THREE.Color).copy(elev >= 0 ? L.key : LOOK_COLORS[2].key).multiplyScalar(1 - c);
    U.uMoon.value = (1 - smoothstep(0, 15, elev)) * (1 - c);
    U.uStars.value = L.stars * (1 - c);

    // Mapa de sombras: com a luz alta, a área no chão encolhe no eixo da luz — compensa.
    const cfg = CONFIG.atmosphere;
    const cam = this.sun.shadow.camera;
    const extentY = Math.max(cfg.shadowExtentY, 60 * Math.max(this.lightDir.y, 0) + 8);
    if (cam.top !== extentY) {
      cam.top = extentY;
      cam.bottom = -extentY;
      cam.updateProjectionMatrix();
    }
    this.lightBasis.lookAt(this.lightDir, ORIGIN, UP);
    this.lightBasisInv.copy(this.lightBasis).invert();
  }

  /** Interpola a aparência entre os dois pontos de LOOKS em volta da elevação dada. */
  private sample(elev: number): void {
    let i = 0;
    while (i < LOOKS.length - 2 && elev > LOOKS[i + 1].elev) i++;
    const a = LOOKS[i];
    const b = LOOKS[i + 1];
    const t = THREE.MathUtils.clamp((elev - a.elev) / (b.elev - a.elev), 0, 1);
    const ca = LOOK_COLORS[i];
    const cb = LOOK_COLORS[i + 1];
    const L = this.look;
    L.top.lerpColors(ca.top, cb.top, t);
    L.horizon.lerpColors(ca.horizon, cb.horizon, t);
    L.fog.lerpColors(ca.fog, cb.fog, t);
    L.key.lerpColors(ca.key, cb.key, t);
    L.hemiSky.lerpColors(ca.hemiSky, cb.hemiSky, t);
    L.hemiGround.lerpColors(ca.hemiGround, cb.hemiGround, t);
    L.keyI = lerp(a.keyI, b.keyI, t);
    L.hemiI = lerp(a.hemiI, b.hemiI, t);
    L.exposure = lerp(a.exposure, b.exposure, t);
    L.stars = lerp(a.stars, b.stars, t);
  }
}
