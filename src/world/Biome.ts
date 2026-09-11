import { CONFIG } from '../config';
import { smoothstep } from '../core/math';
import { Simplex2 } from '../core/noise';
import { mulberry32 } from '../core/rng';

/** Campos de baixa frequência que definem o "tipo" de floresta em cada ponto do mundo. */
export class Biome {
  private readonly density: Simplex2;
  private readonly detail: Simplex2;
  private readonly species: Simplex2;

  constructor(seed: number) {
    const rand = mulberry32(seed ^ 0x0b10e5);
    this.density = new Simplex2(rand);
    this.detail = new Simplex2(rand);
    this.species = new Simplex2(rand);
  }

  /** Densidade da mata: 0 = clareira, 1 = mata fechada. */
  forest(x: number, z: number): number {
    const n = this.density.fbm(x * 0.0045, z * 0.0045, 3) + this.detail.noise(x * 0.03, z * 0.03) * 0.15;
    return smoothstep(-0.38, 0.28, n);
  }

  /** Proporção de coníferas em relação às árvores de copa (0..1). */
  conifer(x: number, z: number): number {
    return smoothstep(-0.35, 0.35, this.species.fbm(x * 0.003, z * 0.003, 2));
  }
}

const GRID = 9;

/**
 * Densidade da mata amostrada numa grade 9×9 sobre um chunk e interpolada — evita recalcular
 * o ruído para cada vértice do terreno ou tufo de grama (milhares por chunk).
 */
export class ForestGrid {
  private readonly values = new Float32Array(GRID * GRID);
  private readonly step = CONFIG.world.chunkSize / (GRID - 1);

  constructor(private readonly biome: Biome) {}

  fill(ox: number, oz: number): void {
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) this.values[j * GRID + i] = this.biome.forest(ox + i * this.step, oz + j * this.step);
    }
  }

  /** Coordenadas locais do chunk (0..chunkSize). */
  at(lx: number, lz: number): number {
    const fx = Math.min(Math.max(lx / this.step, 0), GRID - 1.0001);
    const fz = Math.min(Math.max(lz / this.step, 0), GRID - 1.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const v = this.values;
    const a = v[j * GRID + i];
    const b = v[j * GRID + i + 1];
    const c = v[(j + 1) * GRID + i];
    const d = v[(j + 1) * GRID + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
}
