import * as THREE from 'three';

/** Tempo compartilhado por todos os materiais com vento — incremente a cada quadro. */
export const windTime = { value: 0 };

export interface WindOptions {
  /** Deslocamento máximo (m) na altura de referência. */
  strength: number;
  /** Altura local (m) em que o deslocamento atinge `strength`; a base fica parada. */
  height: number;
  /** Encolhe a instância até sumir entre fadeStart e fadeEnd (m da câmera). 0 = desligado. */
  fadeStart?: number;
  fadeEnd?: number;
}

const WIND_HEAD = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWind;
  uniform vec2 uFade;
`;

const WIND_BODY = /* glsl */ `
  {
    vec3 wIp = vec3(0.0);
    #ifdef USE_INSTANCING
      wIp = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
    #endif
    float wH = clamp(transformed.y / uWind.y, 0.0, 1.5);
    wH *= wH;
    float wPh = uTime * 1.4 + wIp.x * 0.12 + wIp.z * 0.09;
    float wGust = 0.65 + 0.35 * sin(uTime * 0.37 + wIp.x * 0.013);
    float wAmp = uWind.x * wH * wGust;
    transformed.x += (sin(wPh) * 0.7 + sin(wPh * 2.3 + wIp.z) * 0.3) * wAmp;
    transformed.z += sin(wPh * 0.8 + 1.7) * 0.5 * wAmp;
    if (uFade.y > 0.0) {
      transformed *= 1.0 - smoothstep(uFade.x, uFade.y, distance(wIp, cameraPosition));
    }
  }
`;

/** Injeta balanço de vento (e fade opcional por distância) no vertex shader de um material do three. */
export function applyWind<T extends THREE.Material>(material: T, o: WindOptions): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.uniforms.uWind = { value: new THREE.Vector2(o.strength, o.height) };
    shader.uniforms.uFade = { value: new THREE.Vector2(o.fadeStart ?? 0, o.fadeEnd ?? 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_BODY}`);
  };
  // Mesmo código para todos: o programa é compartilhado, os uniforms continuam por material.
  material.customProgramCacheKey = () => 'wind';
  return material;
}
