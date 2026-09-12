import type * as THREE from 'three';

export interface QualityLevel {
  name: string;
  /** Resolução interna máxima (multiplicador de pixels da tela). */
  pixelRatio: number;
  shadowMap: number;
}

/** Do mais bonito (0) ao mais leve. */
export const QUALITY_LEVELS: QualityLevel[] = [
  { name: 'alta', pixelRatio: 2, shadowMap: 2048 },
  { name: 'média', pixelRatio: 1.25, shadowMap: 2048 },
  { name: 'baixa', pixelRatio: 1, shadowMap: 1024 },
  { name: 'mínima', pixelRatio: 0.75, shadowMap: 1024 },
  { name: 'econômica', pixelRatio: 0.6, shadowMap: 512 },
];

/** Janela de medição do FPS (s). */
const WINDOW = 2;
const LOW_FPS = 40;
const GOOD_FPS = 56;

/**
 * Qualidade adaptativa: mede o FPS real em janelas de 2 s. Duas janelas ruins seguidas baixam
 * um nível (resolução interna e mapa de sombras); um bom tempo sustentado sobe de volta — mais
 * devagar se aquele nível já falhou antes, para não ficar oscilando.
 * `?quality=0..4` na URL fixa o nível e desliga o ajuste automático.
 */
export class Quality {
  level = 0;
  auto = true;
  private frames = 0;
  private time = 0;
  private cooldown = 5;
  private badWindows = 0;
  private goodTime = 0;
  private readonly failed = new Set<number>();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly sun: THREE.DirectionalLight,
  ) {
    const fixed = Number.parseInt(new URLSearchParams(location.search).get('quality') ?? '', 10);
    if (QUALITY_LEVELS[fixed]) {
      this.auto = false;
      this.apply(fixed);
    } else {
      this.apply(0);
    }
  }

  get name(): string {
    return QUALITY_LEVELS[this.level].name + (this.auto ? '' : ' (fixa)');
  }

  update(realDt: number): void {
    if (!this.auto) return;
    this.cooldown -= realDt;
    this.frames++;
    this.time += realDt;
    if (this.time < WINDOW) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (this.cooldown > 0) return;

    if (fps < LOW_FPS) {
      this.goodTime = 0;
      if (++this.badWindows >= 2 && this.level < QUALITY_LEVELS.length - 1) {
        this.failed.add(this.level);
        this.apply(this.level + 1);
      }
      return;
    }
    this.badWindows = 0;
    if (fps > GOOD_FPS && this.level > 0) {
      this.goodTime += WINDOW;
      if (this.goodTime >= (this.failed.has(this.level - 1) ? 60 : 12)) this.apply(this.level - 1);
    } else {
      this.goodTime = 0;
    }
  }

  apply(level: number): void {
    this.level = level;
    this.cooldown = 4;
    this.goodTime = 0;
    this.badWindows = 0;
    const L = QUALITY_LEVELS[level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, L.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x !== L.shadowMap) {
      shadow.mapSize.set(L.shadowMap, L.shadowMap);
      shadow.map?.dispose();
      shadow.map = null;
    }
  }
}
