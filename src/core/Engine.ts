import * as THREE from 'three';
import { CONFIG } from '../config';

/** Renderer, cena e câmera principais + cena da arma (viewmodel). */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Cena da arma, desenhada por cima com a profundidade limpa — nunca atravessa árvores. */
  readonly viewScene = new THREE.Scene();
  readonly viewCamera: THREE.PerspectiveCamera;

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

    window.addEventListener('resize', this.onResize);
  }

  render(): void {
    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.viewScene, this.viewCamera);
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
