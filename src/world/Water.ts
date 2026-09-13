import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Atmosphere } from './Atmosphere';
import { lakeRadius, type Lake, type Lakes } from './Lakes';
import { TAU } from '../core/math';

const WATER_VERTEX = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aR;
  varying vec3 vWorld;
  /** 0 no centro do lago, 1 na beira. */
  varying float vR;
  void main() {
    vR = aR;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  #include <dithering_pars_fragment>
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uLightColor;
  uniform vec3 uLightDir;
  uniform float uLight;
  uniform float uDepth;
  uniform float uTime;
  varying vec3 vWorld;
  varying float vR;

  /** Onda senoidal com a derivada junto: o normal sai da soma dos gradientes. */
  vec3 wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
    float phase = dot(p, dir) * freq + uTime * speed;
    return vec3(sin(phase) * amp, cos(phase) * amp * freq * dir);
  }

  void main() {
    vec2 p = vWorld.xz;
    vec3 w = wave(p, vec2(0.94, 0.34), 0.55, 1.1, 0.030)
           + wave(p, vec2(-0.5, 0.87), 0.9, 1.55, 0.018)
           + wave(p, vec2(0.2, -0.98), 1.9, 2.3, 0.008)
           + wave(p, vec2(-0.87, -0.5), 3.7, 3.1, 0.0035);
    vec3 n = normalize(vec3(-w.y, 1.0, -w.z));

    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);

    // Fundo à mostra na parte rasa (a profundidade cai com o quadrado do raio).
    float depth = uDepth * (1.0 - vR * vR);
    vec3 body = mix(uShallow, uDeep, smoothstep(0.1, 1.4, depth));

    // Reflexo do céu: quase nulo olhando de cima, forte (mas nunca total) rente à superfície.
    vec3 sky = mix(uHorizon, uTop, 0.3 + 0.3 * fres) * 0.8;
    vec3 col = mix(body * uLight, sky, clamp(fres * 0.7 + 0.05, 0.0, 0.78));

    // Brilho do sol (ou da lua) na água picada.
    vec3 h = normalize(uLightDir + v);
    col += uLightColor * pow(max(dot(n, h), 0.0), 90.0) * 1.6 * uLight;
    col += uLightColor * pow(max(dot(n, h), 0.0), 12.0) * 0.05 * uLight;

    // Beira um pouco mais clara, onde a água lambe a margem.
    col = mix(col, mix(col, (uShallow * 0.5 + vec3(0.05)) * uLight, 0.3), smoothstep(0.96, 1.0, vR));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <dithering_fragment>
  }
`;

/**
 * Lâmina de água dos lagos próximos: um disco por lago, com ondulação, reflexo do céu e brilho
 * da luz principal. Cada disco tem seu material (poucos em cena) para carregar a própria
 * profundidade; as cores vêm da atmosfera, então a água acompanha o ciclo de dia e noite.
 */
export class Water {
  private readonly prototype: THREE.ShaderMaterial;
  private readonly active = new Map<Lake, THREE.Mesh>();
  private readonly found: Lake[] = [];
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly lakes: Lakes,
  ) {
    this.prototype = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      fog: true,
      dithering: true,
      // Plano deitado: o lado depende do sentido do leque de triângulos — desenhar os dois evita surpresa.
      side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uDeep: { value: new THREE.Color(0x16332f) },
          uShallow: { value: new THREE.Color(0x4b5a3a) },
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uLightColor: { value: new THREE.Color() },
          uLightDir: { value: new THREE.Vector3() },
          uLight: { value: 1 },
          uDepth: { value: 3 },
          uTime: { value: 0 },
        },
      ]),
    });
  }

  /** Mantém um disco por lago a até `viewDistance` e atualiza a ondulação e as cores. */
  update(focus: THREE.Vector3, atmosphere: Atmosphere, dt: number): void {
    this.time += dt;
    this.lakes.near(focus.x, focus.z, CONFIG.lakes.viewDistance, this.found);

    for (const [lake, mesh] of this.active) {
      if (!this.found.includes(lake)) {
        this.scene.remove(mesh);
        this.active.delete(lake);
        mesh.geometry.dispose();
        (mesh.material as THREE.ShaderMaterial).dispose();
      }
    }
    for (const lake of this.found) if (!this.active.has(lake)) this.add(lake);

    // À noite a água tem que ficar escura como o resto: só o caminho da lua se destaca.
    const light = (0.25 + 0.75 * Math.min(atmosphere.keyIntensity / 6, 1)) * (1 - 0.75 * atmosphere.night);
    for (const mesh of this.active.values()) {
      const u = (mesh.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = this.time;
      (u.uTop.value as THREE.Color).copy(atmosphere.skyTop);
      (u.uHorizon.value as THREE.Color).copy(atmosphere.skyHorizon);
      (u.uLightColor.value as THREE.Color).copy(atmosphere.keyColor);
      (u.uLightDir.value as THREE.Vector3).copy(atmosphere.lightDir);
      u.uLight.value = light;
    }
  }

  private add(lake: Lake): void {
    const mesh = new THREE.Mesh(this.shape(lake), this.prototype.clone());
    mesh.position.set(lake.x, lake.level, lake.z);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    (mesh.material as THREE.ShaderMaterial).uniforms.uDepth.value = lake.depth;
    this.scene.add(mesh);
    this.active.set(lake, mesh);
  }

  /** Leque de triângulos seguindo o contorno irregular do lago (raio em metros, centro na origem). */
  private shape(lake: Lake): THREE.BufferGeometry {
    const n = 96;
    const pos = new Float32Array((n + 1) * 3);
    const radial = new Float32Array(n + 1);
    const index = new Uint16Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU;
      // Um pouco menor que a bacia: a beira fica logo abaixo da margem, sem disputa de profundidade.
      const r = lakeRadius(lake, ang) * 0.985;
      pos[(i + 1) * 3] = Math.cos(ang) * r;
      pos[(i + 1) * 3 + 2] = Math.sin(ang) * r;
      radial[i + 1] = 1;
      index[i * 3 + 1] = i + 1;
      index[i * 3 + 2] = (i % n) + 2 > n ? 1 : i + 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aR', new THREE.BufferAttribute(radial, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}
