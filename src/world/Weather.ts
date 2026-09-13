import * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep, TAU } from '../core/math';
import type { Atmosphere } from './Atmosphere';

const RAIN_VERTEX = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uTime;
  uniform float uRadius;
  uniform float uHeight;
  uniform float uSpeed;
  uniform float uAmount;
  /** x,z = posição no cilindro; y = fase da gota; w = comprimento do risco. */
  attribute vec4 aDrop;
  /** 0 na cabeça do risco, 1 na cauda. */
  attribute float aTail;
  varying float vFade;

  void main() {
    // Fora da fatia sorteada, a gota é jogada para fora do alcance (chuva fraca = menos gotas).
    float on = step(fract(aDrop.y * 7.13), uAmount);
    float fall = fract(aDrop.y - uTime * uSpeed / uHeight);
    vec3 p = vec3(uCenter.x + aDrop.x, uCenter.y + uHeight * 0.62 - fall * uHeight, uCenter.z + aDrop.z);
    p.y += aTail * aDrop.w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Some ao longe e bem perto da câmera, e a cauda é mais fraca que a cabeça.
    float d = length(mv.xyz);
    vFade = on * (1.0 - aTail * 0.65) * smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(uRadius * 0.55, uRadius, d));
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uColor, vFade * uOpacity);
  }
`;

/** Chuva passageira e neblina de madrugada: só atmosfera, nunca atrapalha o jogador. */
export class Weather {
  /** Intensidade da chuva (0..1). */
  rain = 0;
  /** Tempo fechado (0..1): nubla antes e depois da chuva. */
  cloud = 0;
  /** Neblina de madrugada (0..1). */
  mist = 0;

  private readonly mesh: THREE.LineSegments;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private state: 'clear' | 'closing' | 'rain' | 'opening' = 'clear';
  private timer: number;
  private target = 0;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const W = CONFIG.weather;
    const drops = W.drops;
    const pos = new Float32Array(drops * 2 * 3);
    const drop = new Float32Array(drops * 2 * 4);
    const tail = new Float32Array(drops * 2);
    for (let i = 0; i < drops; i++) {
      // Distribuição uniforme no disco, para não adensar no centro.
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * W.radius;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const phase = Math.random();
      const len = 0.5 + Math.random() * 0.9;
      for (let v = 0; v < 2; v++) {
        const o = (i * 2 + v) * 4;
        drop[o] = x;
        drop[o + 1] = phase;
        drop[o + 2] = z;
        drop[o + 3] = len;
        tail[i * 2 + v] = v;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDrop', new THREE.BufferAttribute(drop, 4));
    geo.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uCenter: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uRadius: { value: W.radius },
      uHeight: { value: W.height },
      uSpeed: { value: W.fallSpeed },
      uAmount: { value: 0 },
      uColor: { value: new THREE.Color(0xb8c6d0) },
      uOpacity: { value: 0 },
    };
    this.mesh = new THREE.LineSegments(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERTEX,
        fragmentShader: RAIN_FRAGMENT,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);

    this.timer = rand(W.clearMinutes[0], W.clearMinutes[1]) * 60;
    // `?chuva=1` já começa chovendo (testes e capturas).
    if (new URLSearchParams(location.search).get('chuva') === '1') {
      this.state = 'rain';
      this.rain = 1;
      this.cloud = 1;
      this.target = 1;
      this.timer = 600;
    }
  }

  /** Avança o tempo e aplica o resultado na atmosfera (luz, céu e névoa). */
  update(dt: number, camera: THREE.Camera, atmosphere: Atmosphere): void {
    this.time += dt;
    this.timer -= dt;
    const W = CONFIG.weather;
    if (this.timer <= 0) {
      switch (this.state) {
        case 'clear':
          // Fecha o tempo; às vezes fica só nublado, sem chover.
          this.state = 'closing';
          this.target = Math.random() < W.rainChance ? 1 : 0;
          this.timer = rand(W.transition[0], W.transition[1]);
          break;
        case 'closing':
          this.state = 'rain';
          this.timer = rand(W.rainMinutes[0], W.rainMinutes[1]) * 60;
          break;
        case 'rain':
          this.state = 'opening';
          this.target = 0;
          this.timer = rand(W.transition[0], W.transition[1]);
          break;
        case 'opening':
          this.state = 'clear';
          this.timer = rand(W.clearMinutes[0], W.clearMinutes[1]) * 60;
          break;
      }
    }

    // Nuvem entra e sai devagar; a chuva acompanha, com um atraso.
    const cloudTarget = this.state === 'clear' ? 0 : this.state === 'opening' ? 0 : Math.max(this.target, 0.75);
    const rainTarget = this.state === 'rain' ? this.target : this.state === 'closing' ? this.target * 0.35 : 0;
    this.cloud += (cloudTarget - this.cloud) * (1 - Math.exp(-dt / 12));
    this.rain += (rainTarget - this.rain) * (1 - Math.exp(-dt / 8));

    // Neblina baixa antes do nascer do sol, que some quando o sol sobe.
    const elev = atmosphere.sunElevation;
    this.mist = (1 - smoothstep(-2, 10, elev)) * smoothstep(-16, -8, elev) * W.mist;

    atmosphere.cloud = this.cloud;
    atmosphere.fogFactor = 1 + W.fogRain * this.rain + W.fogCloud * this.cloud + W.fogMist * this.mist;

    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uAmount.value = this.rain;
    u.uOpacity.value = Math.min(this.rain * 1.6, 1) * 0.5;
    (u.uCenter.value as THREE.Vector3).copy(camera.position);
    this.mesh.visible = this.rain > 0.02;
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
