import * as THREE from 'three';
import { CONFIG } from '../config';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uFog;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // Abaixo/rente ao horizonte = cor da névoa, para esconder o fim do terreno.
    vec3 col = mix(uFog, uHorizon, smoothstep(-0.02, 0.1, h));
    col = mix(col, uTop, smoothstep(0.1, 0.65, h));

    float sd = max(dot(d, uSunDir), 0.0);
    float lowSky = 1.0 - 0.6 * smoothstep(0.0, 0.5, h);
    col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.7) * lowSky;
    col += uSunColor * smoothstep(0.99970, 0.99982, sd) * 8.0;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Iluminação de fim de tarde: sol baixo e quente, luz de céu, névoa e cúpula celeste. */
export class Atmosphere {
  readonly sun: THREE.DirectionalLight;
  readonly sunDir = new THREE.Vector3();

  private readonly sky: THREE.Mesh;
  private readonly lightBasis = new THREE.Matrix4();
  private readonly lightBasisInv = new THREE.Matrix4();
  private readonly texelSize: number;
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const cfg = CONFIG.atmosphere;
    const elev = THREE.MathUtils.degToRad(cfg.sunElevation);
    const az = THREE.MathUtils.degToRad(cfg.sunAzimuth);
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();

    scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity);
    scene.add(new THREE.HemisphereLight(cfg.skyLight, cfg.groundLight, cfg.hemiIntensity));

    this.sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
    this.sun.castShadow = true;
    const shadow = this.sun.shadow;
    shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
    const cam = shadow.camera;
    cam.left = -cfg.shadowExtent;
    cam.right = cfg.shadowExtent;
    cam.top = cfg.shadowExtent;
    cam.bottom = -cfg.shadowExtent;
    cam.near = 1;
    cam.far = cfg.shadowDistance * 2;
    cam.updateProjectionMatrix();
    shadow.bias = -0.0003;
    shadow.normalBias = 0.3;
    scene.add(this.sun, this.sun.target);

    // Base do espaço da luz — usada para alinhar a sombra à grade de texels (sem tremulação).
    this.lightBasis.lookAt(this.sunDir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    this.lightBasisInv.copy(this.lightBasis).invert();
    this.texelSize = (cfg.shadowExtent * 2) / cfg.shadowMapSize;

    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uTop: { value: new THREE.Color(cfg.skyTop) },
        uHorizon: { value: new THREE.Color(cfg.skyHorizon) },
        uFog: { value: new THREE.Color(cfg.fogColor) },
        uSunColor: { value: new THREE.Color(cfg.sunColor) },
        uSunDir: { value: this.sunDir },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.camera.far * 0.9, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);
  }

  update(focus: THREE.Vector3, camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);

    const p = this.tmp.copy(focus).applyMatrix4(this.lightBasisInv);
    p.x = Math.round(p.x / this.texelSize) * this.texelSize;
    p.y = Math.round(p.y / this.texelSize) * this.texelSize;
    p.applyMatrix4(this.lightBasis);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, CONFIG.atmosphere.shadowDistance);
    this.sun.target.updateMatrixWorld();
  }
}
