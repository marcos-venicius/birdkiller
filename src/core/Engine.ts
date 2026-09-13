import * as THREE from 'three';
import { CONFIG } from '../config';

/** Camada só dos bichos: na visão térmica eles são desenhados quentes por cima do mundo frio. */
export const THERMAL_LAYER = 1;

/** Marca um objeto (e os filhos) como fonte de calor para a luneta infravermelha. */
export function markWarm(root: THREE.Object3D): void {
  root.traverse((o) => o.layers.enable(THERMAL_LAYER));
}

const THERMAL_VERTEX = /* glsl */ `
  #include <common>
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    vNormal = normalize(transformedNormal);
    #include <begin_vertex>
    #include <project_vertex>
    vDepth = -mvPosition.z;
  }
`;

/** Mundo frio: relevo e mata em tons de azul/verde, com o contraste vindo da inclinação. */
const COLD_FRAGMENT = /* glsl */ `
  uniform float uFar;
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    float up = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
    float d = clamp(vDepth / uFar, 0.0, 1.0);
    float v = clamp(0.16 + 0.5 * up - 0.25 * d, 0.0, 1.0);
    vec3 col = mix(vec3(0.015, 0.035, 0.06), vec3(0.10, 0.42, 0.40), v);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Bicho quente: branco no meio, alaranjado nas bordas — pula aos olhos contra o fundo frio. */
const HOT_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  varying float vDepth;
  void main() {
    float face = clamp(vNormal.y * 0.35 + 0.65, 0.0, 1.0);
    vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.97, 0.86), face * face);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Renderer, cena e câmera principais + cena da arma (viewmodel). */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Cena da arma, desenhada por cima com a profundidade limpa — nunca atravessa árvores. */
  readonly viewScene = new THREE.Scene();
  readonly viewCamera: THREE.PerspectiveCamera;
  /** Visão térmica ligada (luneta infravermelha). */
  thermal = false;

  private readonly coldMaterial: THREE.ShaderMaterial;
  private readonly hotMaterial: THREE.ShaderMaterial;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.render.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Duas passadas por quadro: limpeza e contagem de estatísticas feitas manualmente em render().
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    const aspect = window.innerWidth / window.innerHeight;
    const { fov, near, far } = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera.rotation.order = 'YXZ';
    this.viewCamera = new THREE.PerspectiveCamera(CONFIG.weapon.viewFov, aspect, 0.01, 5);

    // A câmera enxerga o mundo (camada 0) e os bichos (camada 1) juntos na renderização normal.
    this.camera.layers.enable(THERMAL_LAYER);
    this.coldMaterial = new THREE.ShaderMaterial({
      vertexShader: THERMAL_VERTEX,
      fragmentShader: COLD_FRAGMENT,
      uniforms: { uFar: { value: CONFIG.camera.far * 0.35 } },
      fog: false,
    });
    this.hotMaterial = new THREE.ShaderMaterial({
      vertexShader: THERMAL_VERTEX,
      fragmentShader: HOT_FRAGMENT,
      uniforms: {},
      fog: false,
    });

    window.addEventListener('resize', this.onResize);
  }

  render(): void {
    const r = this.renderer;
    r.info.reset();
    r.clear();
    if (this.thermal) this.renderThermal();
    else r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.viewScene, this.viewCamera);
  }

  /**
   * Duas passadas: o mundo inteiro frio e, por cima (com o mesmo teste de profundidade), só os
   * bichos, quentes. A névoa é desligada — é justamente isso que faz o infravermelho valer a pena
   * na chuva e de madrugada.
   */
  private renderThermal(): void {
    const r = this.renderer;
    const fog = this.scene.fog;
    const shadows = r.shadowMap.enabled;
    this.scene.fog = null;
    r.shadowMap.enabled = false;
    this.scene.overrideMaterial = this.coldMaterial;
    this.camera.layers.set(0);
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = this.hotMaterial;
    this.camera.layers.set(THERMAL_LAYER);
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    this.camera.layers.set(0);
    this.camera.layers.enable(THERMAL_LAYER);
    this.scene.fog = fog;
    r.shadowMap.enabled = shadows;
  }

  private onResize = (): void => {
    const aspect = window.innerWidth / window.innerHeight;
    for (const cam of [this.camera, this.viewCamera]) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}
