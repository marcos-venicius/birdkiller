import type * as THREE from 'three';
import { CONFIG } from '../config';
import { smoothstep, TAU } from '../core/math';
import { hash2, mulberry32 } from '../core/rng';

export interface Lake {
  x: number;
  z: number;
  /** Raio médio da lâmina de água (m). */
  r: number;
  /** Altura da superfície. */
  level: number;
  /** Profundidade no centro (m). */
  depth: number;
  /** Deformação do contorno: amplitude e fase de três ondas (nada de lagos circulares). */
  wobble: [number, number, number, number, number, number];
}

/** Raio do lago na direção `ang` (rad). */
export function lakeRadius(lake: Lake, ang: number): number {
  const w = lake.wobble;
  return lake.r * (1 + w[0] * Math.sin(2 * ang + w[1]) + w[2] * Math.sin(3 * ang + w[3]) + w[4] * Math.sin(5 * ang + w[5]));
}

/** Até onde o lago deforma o relevo, em raios: 1 = beira da água, 1,6 = relevo original. */
const BLEND = 1.6;
/** Inclinação da margem fora da água (m de subida por metro de raio). */
const BANK = 0.12;

const _spots: Lake[] = [];

function cellKey(i: number, j: number): number {
  return (i + 32768) * 65536 + (j + 32768);
}

/**
 * Lagos procedurais: no máximo um por célula da grade, sempre inteiro dentro dela, e só onde o
 * relevo original é plano o bastante. O terreno é escavado numa bacia suave que encosta na água
 * exatamente na borda do lago, sobe formando a margem e volta ao relevo original.
 * `Terrain.heightAt` já devolve o relevo com os lagos — quem consulta altura não precisa saber deles.
 */
export class Lakes {
  private readonly cells = new Map<number, Lake | null>();
  private lastKey = NaN;
  private lastLake: Lake | null = null;

  constructor(
    private readonly seed: number,
    /** Relevo sem lagos — só o ruído. */
    private readonly baseHeight: (x: number, z: number) => number,
  ) {}

  /** Relevo com a bacia do lago escavada. */
  shape(x: number, z: number, base: number): number {
    const lake = this.cellAt(x, z);
    if (!lake) return base;
    const d = this.normalized(lake, x, z);
    if (d >= BLEND) return base;
    const profile = d <= 1 ? lake.level - lake.depth * (1 - d * d) : lake.level + (d - 1) * lake.r * BANK;
    return base + (profile - base) * (1 - smoothstep(1, BLEND, d));
  }

  /** O lago que cobre este ponto (dentro da água), ou null. */
  at(x: number, z: number): Lake | null {
    const lake = this.cellAt(x, z);
    if (!lake) return null;
    return this.normalized(lake, x, z) < 1 ? lake : null;
  }

  /** Profundidade da água no ponto (0 fora do lago). */
  depthAt(x: number, z: number): number {
    const lake = this.cellAt(x, z);
    if (!lake) return 0;
    const d = this.normalized(lake, x, z);
    return d < 1 ? lake.depth * (1 - d * d) : 0;
  }

  /**
   * Altura da água acima do terreno no ponto (m): positiva dentro do lago, negativa na margem,
   * -Infinity longe de qualquer lago. Serve para manter vegetação fora da água.
   */
  waterHeight(x: number, z: number): number {
    const lake = this.cellAt(x, z);
    if (!lake) return -Infinity;
    const d = this.normalized(lake, x, z);
    if (d >= BLEND) return -Infinity;
    return d <= 1 ? lake.depth * (1 - d * d) : -(d - 1) * lake.r * BANK;
  }

  /** true se o ponto está pelo menos `margin` acima da linha d'água. */
  dry(x: number, z: number, margin = 0): boolean {
    return this.waterHeight(x, z) < -margin;
  }

  /** Distância até a beira da água mais próxima (negativa dentro do lago); Infinity se não há lago perto. */
  shoreDistance(x: number, z: number): number {
    let best = Infinity;
    const C = CONFIG.lakes;
    const i0 = Math.floor(x / C.cell);
    const j0 = Math.floor(z / C.cell);
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        const lake = this.cellLake(i, j);
        if (!lake) continue;
        const d = Math.hypot(x - lake.x, z - lake.z) - lakeRadius(lake, Math.atan2(z - lake.z, x - lake.x));
        if (Math.abs(d) < Math.abs(best)) best = d;
      }
    }
    return best;
  }

  /**
   * Um ponto de bebida na margem do lago mais próximo (logo fora da água, virado para ela).
   * Devolve o lago, ou null se não há nenhum a até `maxR`.
   */
  drinkSpot(x: number, z: number, maxR: number, out: THREE.Vector3): Lake | null {
    const lakes = this.near(x, z, maxR, _spots);
    let best: Lake | null = null;
    let bestD = Infinity;
    for (const lake of lakes) {
      const d = Math.hypot(x - lake.x, z - lake.z);
      if (d < bestD) {
        bestD = d;
        best = lake;
      }
    }
    if (!best) return null;
    // Chega pelo lado em que já está, com uma folga aleatória.
    const ang = Math.atan2(z - best.z, x - best.x) + (Math.random() - 0.5) * 1.2;
    // Alvo um pouco dentro da água: o bicho para antes de chegar nele e fica com o focinho na beira
    // (a parte funda continua barrada pelo block()).
    const r = lakeRadius(best, ang) * 0.94;
    out.set(best.x + Math.cos(ang) * r, 0, best.z + Math.sin(ang) * r);
    return best;
  }

  /** Lagos com o centro a até `radius` do ponto. */
  near(x: number, z: number, radius: number, out: Lake[]): Lake[] {
    out.length = 0;
    const C = CONFIG.lakes;
    const n = Math.ceil(radius / C.cell);
    const i0 = Math.floor(x / C.cell);
    const j0 = Math.floor(z / C.cell);
    for (let j = j0 - n; j <= j0 + n; j++) {
      for (let i = i0 - n; i <= i0 + n; i++) {
        const lake = this.cellLake(i, j);
        if (lake && Math.hypot(x - lake.x, z - lake.z) < radius + lake.r) out.push(lake);
      }
    }
    return out;
  }

  /**
   * Mantém um ponto dentro do lago da célula (fração do raio) e devolve o nível da água,
   * ou null se ali não há lago — usado pelos patos que nadam.
   */
  clampInside(pos: THREE.Vector3, frac: number): number | null {
    const lake = this.cellAt(pos.x, pos.z);
    if (!lake) return null;
    const dx = pos.x - lake.x;
    const dz = pos.z - lake.z;
    const d = Math.hypot(dx, dz);
    const limit = lakeRadius(lake, Math.atan2(dz, dx)) * frac;
    if (d > limit && d > 1e-4) {
      pos.x = lake.x + (dx / d) * limit;
      pos.z = lake.z + (dz / d) * limit;
    }
    return lake.level;
  }

  /** Segura o jogador na parte rasa: além de `wadeDepth` a margem não deixa passar. */
  block(pos: THREE.Vector3, radius: number): void {
    const lake = this.cellAt(pos.x, pos.z);
    if (!lake) return;
    const dx = pos.x - lake.x;
    const dz = pos.z - lake.z;
    const d = Math.hypot(dx, dz);
    // Profundidade = depth·(1 − d²); o limite é onde ela chega a wadeDepth.
    const limit = lakeRadius(lake, Math.atan2(dz, dx)) * Math.sqrt(Math.max(0, 1 - CONFIG.lakes.wadeDepth / lake.depth)) - radius;
    if (d >= limit) return;
    if (d < 1e-4) {
      pos.x = lake.x + limit;
      return;
    }
    pos.x = lake.x + (dx / d) * limit;
    pos.z = lake.z + (dz / d) * limit;
  }

  /** Distância do ponto ao centro em raios (1 = beira da água), já com o contorno irregular. */
  private normalized(lake: Lake, x: number, z: number): number {
    const dx = x - lake.x;
    const dz = z - lake.z;
    return Math.hypot(dx, dz) / lakeRadius(lake, Math.atan2(dz, dx));
  }

  /** O lago da célula que contém o ponto (cada lago cabe inteiro na sua célula). */
  private cellAt(x: number, z: number): Lake | null {
    const C = CONFIG.lakes;
    return this.cellLake(Math.floor(x / C.cell), Math.floor(z / C.cell));
  }

  private cellLake(i: number, j: number): Lake | null {
    const k = cellKey(i, j);
    if (k === this.lastKey) return this.lastLake;
    let lake = this.cells.get(k);
    if (lake === undefined) {
      lake = this.build(i, j);
      // Cache simples: o jogador anda por poucas células: descartar tudo de vez é suficiente.
      if (this.cells.size > 4096) this.cells.clear();
      this.cells.set(k, lake);
    }
    this.lastKey = k;
    this.lastLake = lake;
    return lake;
  }

  private build(i: number, j: number): Lake | null {
    const C = CONFIG.lakes;
    const rand = mulberry32(hash2(i, j, this.seed ^ 0x1a6e05));
    if (rand() > C.chance) return null;
    const r = C.minRadius + rand() * (C.maxRadius - C.minRadius);
    const wobble: Lake['wobble'] = [
      0.08 + rand() * 0.12,
      rand() * TAU,
      0.05 + rand() * 0.09,
      rand() * TAU,
      0.02 + rand() * 0.05,
      rand() * TAU,
    ];
    const maxR = r * (1 + wobble[0] + wobble[2] + wobble[4]);
    // O lago (com a margem) cabe inteiro na célula: consultar só a célula do ponto basta.
    const margin = maxR * BLEND + 4;
    const span = Math.max(0, C.cell - 2 * margin);
    const x = (i + 0.5) * C.cell + (rand() - 0.5) * span;
    const z = (j + 0.5) * C.cell + (rand() - 0.5) * span;

    // Numa encosta a bacia viraria uma cratera, e num morro a água ficaria pendurada acima do
    // terreno em volta: o lago só nasce onde a margem e o entorno são planos o bastante.
    const probe = { x, z, r, level: 0, depth: 0, wobble } as Lake;
    let min = this.baseHeight(x, z);
    let max = min;
    let outer = Infinity;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * TAU;
      const rim = lakeRadius(probe, ang);
      const h = this.baseHeight(x + Math.cos(ang) * rim, z + Math.sin(ang) * rim);
      min = Math.min(min, h);
      max = Math.max(max, h);
      outer = Math.min(outer, this.baseHeight(x + Math.cos(ang) * rim * BLEND, z + Math.sin(ang) * rim * BLEND));
    }
    if (max - min > C.flatness) return null;
    const level = min - 0.35;
    // Num morro a água ficaria pendurada acima do terreno em volta.
    if (outer < level - C.outerDrop) return null;

    return { x, z, r, level, depth: C.minDepth + rand() * (C.maxDepth - C.minDepth), wobble };
  }
}
