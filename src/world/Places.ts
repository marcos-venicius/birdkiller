import type * as THREE from 'three';
import { CONFIG } from '../config';
import { TAU } from '../core/math';
import { hash2, mulberry32 } from '../core/rng';
import type { Biome } from './Biome';
import type { Lakes } from './Lakes';

export type PlaceType = 'tower' | 'cabin' | 'giantTree';

/** Nome de cada tipo, no singular (aviso de descoberta) e no plural (caderno). */
export const PLACE_KINDS: { type: PlaceType; name: string; plural: string }[] = [
  { type: 'tower', name: 'Torre de caça', plural: 'Torres de caça' },
  { type: 'cabin', name: 'Cabana abandonada', plural: 'Cabanas abandonadas' },
  { type: 'giantTree', name: 'Árvore gigante', plural: 'Árvores gigantes' },
];

/** Área retangular girada, no plano: centro, meias-medidas e o giro (cos/sin do yaw do lugar). */
interface Rect {
  x: number;
  z: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
}

/** Obstáculo com altura: caixa girada (paredes, grades) ou cilindro (pernas, tronco). */
type Solid = ({ kind: 'box' } & Rect & { y0: number; y1: number }) | { kind: 'cyl'; x: number; z: number; r: number; y0: number; y1: number };

/** Piso por onde se anda (plataforma da torre, assoalho e degrau da cabana). */
type Floor = Rect & { y: number };

/** Escada: dentro do volume a gravidade some e o jogador sobe ou desce. */
export type Ladder = Rect & { y0: number; y1: number };

export interface Place {
  id: string;
  type: PlaceType;
  x: number;
  z: number;
  /** Altura do chão no centro. */
  y: number;
  yaw: number;
  /** Até onde a vegetação fica afastada. */
  radius: number;
  /** Altura do piso principal (plataforma da torre, assoalho da cabana). */
  floorY: number;
  /** Afastamento das pernas da torre, do centro (m). */
  span: number;
  /** Construída pelo jogador: não entra no caderno e não afasta a vegetação. */
  own: boolean;
  solids: Solid[];
  floors: Floor[];
  ladders: Ladder[];
}

interface TypeRule {
  /** Faixa de densidade da mata onde o lugar aparece. */
  forest: [number, number];
  /** Raio em que o relevo precisa ser plano, e o desnível máximo aceito ali. */
  flatRadius: number;
  flatness: number;
  radius: number;
}

const RULES: Record<PlaceType, TypeRule> = {
  // Torre na borda da clareira, olhando para o aberto.
  tower: { forest: [0.12, 0.65], flatRadius: 2.2, flatness: 1.6, radius: 5 },
  // Cabana no mato, em chão bem plano (precisa dar para entrar pela porta).
  cabin: { forest: [0.3, 0.9], flatRadius: 3.4, flatness: 0.6, radius: 6.5 },
  // Árvore gigante no meio da mata fechada, acima da copa das outras.
  giantTree: { forest: [0.5, 1.01], flatRadius: 2, flatness: 3, radius: 6 },
};

/** Distância máxima do centro do lugar à borda da célula (cada lugar cabe inteiro na sua). */
const CELL_MARGIN = 60;

function cellKey(i: number, j: number): number {
  return (i + 32768) * 65536 + (j + 32768);
}

function rect(p: { x: number; z: number; cos: number; sin: number }, lx: number, lz: number, hx: number, hz: number): Rect {
  return { x: p.x + lx * p.cos - lz * p.sin, z: p.z + lx * p.sin + lz * p.cos, hx, hz, cos: p.cos, sin: p.sin };
}

/** Coordenadas locais (no giro do retângulo) de um ponto do mundo. */
function local(r: Rect, x: number, z: number): [number, number] {
  const dx = x - r.x;
  const dz = z - r.z;
  return [dx * r.cos + dz * r.sin, -dx * r.sin + dz * r.cos];
}

function inRect(r: Rect, x: number, z: number, margin = 0): boolean {
  const [lx, lz] = local(r, x, z);
  return Math.abs(lx) <= r.hx + margin && Math.abs(lz) <= r.hz + margin;
}

/**
 * Lugares para descobrir: torres de caça, cabanas abandonadas e árvores gigantes, no máximo um por
 * célula da grade, em pontos que combinam com o tipo (densidade da mata, chão plano, longe da água).
 * Aqui só a descrição e as consultas — colisão, pisos, escadas e tiro; quem desenha é o `PlaceView`.
 */
export class Places {
  private readonly cells = new Map<number, Place | null>();
  /** Torres do jogador, consultadas junto com os lugares da grade (colisão, piso, escada, tiro, desenho). */
  private readonly built: Place[] = [];
  private lastKey = NaN;
  private lastPlace: Place | null = null;

  constructor(
    private readonly seed: number,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly lakes: Lakes,
    private readonly biome: Biome,
  ) {}

  /** O lugar da célula que contém o ponto (ou null). */
  at(x: number, z: number): Place | null {
    const C = CONFIG.places;
    return this.cellPlace(Math.floor(x / C.cell), Math.floor(z / C.cell));
  }

  /**
   * Torre construída pelo jogador (`add` = false: só a descrição, para o fantasma da construção).
   * O centro fica em (x, z), a escada no lado +Z local.
   */
  tower(id: string, x: number, z: number, yaw: number, height: number, span: number, add = true): Place {
    const y = this.heightAt(x, z);
    const place: Place = { id, type: 'tower', x, z, y, yaw, radius: span + 2.4, floorY: y, span, own: true, solids: [], floors: [], ladders: [] };
    this.towerParts(place, height);
    if (add) this.built.push(place);
    return place;
  }

  /** Alguma torre do jogador a menos de (raio dela + margem) do ponto? */
  builtNear(x: number, z: number, margin: number): boolean {
    for (const p of this.built) if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return true;
    return false;
  }

  /** Lugares com o centro a até `radius` do ponto (os da grade e as torres do jogador). */
  near(x: number, z: number, radius: number, out: Place[]): Place[] {
    out.length = 0;
    for (const p of this.built) if (Math.hypot(x - p.x, z - p.z) < radius) out.push(p);
    const C = CONFIG.places;
    const n = Math.ceil(radius / C.cell);
    const i0 = Math.floor(x / C.cell);
    const j0 = Math.floor(z / C.cell);
    for (let j = j0 - n; j <= j0 + n; j++) {
      for (let i = i0 - n; i <= i0 + n; i++) {
        const p = this.cellPlace(i, j);
        if (p && Math.hypot(x - p.x, z - p.z) < radius) out.push(p);
      }
    }
    return out;
  }

  /**
   * true se nenhum lugar da grade ocupa o ponto (com folga) — vegetação e spawn do jogador consultam aqui.
   * As torres do jogador ficam de fora de propósito: a vegetação pula sorteios onde o lugar está ocupado, e
   * uma torre nova embaralharia a mata do chunk inteiro (use `builtNear` para elas).
   */
  clear(x: number, z: number, margin = 0): boolean {
    const p = this.at(x, z);
    return !p || Math.hypot(x - p.x, z - p.z) > p.radius + margin;
  }

  /**
   * Empurra um círculo (jogador, bicho) para fora das paredes, pernas e troncos que ele alcança
   * na altura em que está (`height` = altura do corpo acima dos pés).
   */
  resolveCollision(pos: THREE.Vector3, radius: number, height: number): void {
    const p = this.at(pos.x, pos.z);
    if (p) this.collide(p, pos, radius, height);
    for (const b of this.built) this.collide(b, pos, radius, height);
  }

  private collide(p: Place, pos: THREE.Vector3, radius: number, height: number): void {
    if (Math.hypot(pos.x - p.x, pos.z - p.z) > p.radius + 4) return;
    for (const s of p.solids) {
      if (pos.y + height <= s.y0 || pos.y >= s.y1) continue;
      if (s.kind === 'cyl') {
        const dx = pos.x - s.x;
        const dz = pos.z - s.z;
        const min = s.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (min - d);
        pos.z += (dz / d) * (min - d);
        continue;
      }
      const [lx, lz] = local(s, pos.x, pos.z);
      const cx = Math.max(-s.hx, Math.min(s.hx, lx));
      const cz = Math.max(-s.hz, Math.min(s.hz, lz));
      let ox = lx - cx;
      let oz = lz - cz;
      const d = Math.hypot(ox, oz);
      let nx: number;
      let nz: number;
      if (d > 1e-6) {
        if (d >= radius) continue;
        // Encostou por fora: afasta até o raio.
        nx = lx + (ox / d) * (radius - d);
        nz = lz + (oz / d) * (radius - d);
      } else {
        // Dentro da caixa: sai pelo lado mais perto.
        const px = s.hx - Math.abs(lx) + radius;
        const pz = s.hz - Math.abs(lz) + radius;
        ox = px < pz ? Math.sign(lx || 1) * px : 0;
        oz = px < pz ? 0 : Math.sign(lz || 1) * pz;
        nx = lx + ox;
        nz = lz + oz;
      }
      pos.x = s.x + nx * s.cos - nz * s.sin;
      pos.z = s.z + nx * s.sin + nz * s.cos;
    }
  }

  /**
   * Piso sob o ponto que o jogador alcança: abaixo dele ou até um degrau acima (`stepUp`).
   * -Infinity se não há nenhum — aí vale o chão.
   */
  floorAt(x: number, z: number, y: number, stepUp: number): number {
    const p = this.at(x, z);
    let best = -Infinity;
    for (const q of this.built) best = floorOf(q, x, z, y, stepUp, best);
    return p ? floorOf(p, x, z, y, stepUp, best) : best;
  }

  /** A escada em que o ponto está (pés dentro do volume), ou null. */
  ladderAt(pos: THREE.Vector3): Ladder | null {
    const p = this.at(pos.x, pos.z);
    const l = p ? ladderOf(p, pos) : null;
    if (l) return l;
    for (const q of this.built) {
      const b = ladderOf(q, pos);
      if (b) return b;
    }
    return null;
  }

  /** Distância até a primeira parede, perna ou tronco no raio (d normalizado), ou Infinity. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): number {
    const C = CONFIG.places;
    const ex = o.x + d.x * maxT;
    const ez = o.z + d.z * maxT;
    const i0 = Math.floor(Math.min(o.x, ex) / C.cell);
    const i1 = Math.floor(Math.max(o.x, ex) / C.cell);
    const j0 = Math.floor(Math.min(o.z, ez) / C.cell);
    const j1 = Math.floor(Math.max(o.z, ez) / C.cell);
    let best = Infinity;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const p = this.cellPlace(i, j);
        if (p) best = rayPlace(p, o, d, maxT, best);
      }
    }
    for (const p of this.built) best = rayPlace(p, o, d, maxT, best);
    return best;
  }

  private towerParts(place: Place, height: number): void {
    towerPartsOf(place, height);
  }

  private cellPlace(i: number, j: number): Place | null {
    const k = cellKey(i, j);
    if (k === this.lastKey) return this.lastPlace;
    let p = this.cells.get(k);
    if (p === undefined) {
      p = this.build(i, j);
      if (this.cells.size > 2048) this.cells.clear();
      this.cells.set(k, p);
    }
    this.lastKey = k;
    this.lastPlace = p;
    return p;
  }

  private build(i: number, j: number): Place | null {
    const C = CONFIG.places;
    const rand = mulberry32(hash2(i, j, this.seed ^ 0x9d1ace));
    if (rand() > C.chance) return null;
    const w = C.weights;
    let pick = rand() * (w.tower + w.cabin + w.giantTree);
    const type: PlaceType = (pick -= w.tower) < 0 ? 'tower' : (pick -= w.cabin) < 0 ? 'cabin' : 'giantTree';
    const rule = RULES[type];
    const span = C.cell - 2 * CELL_MARGIN;
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = (i + 0.5) * C.cell + (rand() - 0.5) * span;
      const z = (j + 0.5) * C.cell + (rand() - 0.5) * span;
      const yaw = rand() * TAU;
      const f = this.biome.forest(x, z);
      if (f < rule.forest[0] || f > rule.forest[1]) continue;
      if (!this.lakes.dry(x, z, 2) || Math.abs(this.lakes.shoreDistance(x, z)) < rule.radius + 10) continue;
      let min = Infinity;
      let max = -Infinity;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * TAU;
        const h = this.heightAt(x + Math.cos(ang) * rule.flatRadius, z + Math.sin(ang) * rule.flatRadius);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
      if (max - min > rule.flatness) continue;
      // O id leva a semente: a torre (3, 5) de um mundo não é a mesma do mundo de outra pessoa.
      return this.describe(`${this.seed}:${type}:${i}:${j}`, type, x, z, yaw, rule, max);
    }
    return null;
  }

  /** Colisores, pisos e escadas de cada tipo, no giro do lugar. */
  private describe(id: string, type: PlaceType, x: number, z: number, yaw: number, rule: TypeRule, highest: number): Place {
    const y = this.heightAt(x, z);
    const g = { x, z, cos: Math.cos(yaw), sin: Math.sin(yaw) };
    const place: Place = { id, type, x, z, y, yaw, radius: rule.radius, floorY: y, span: 1.4, own: false, solids: [], floors: [], ladders: [] };
    const box = (lx: number, lz: number, hx: number, hz: number, y0: number, y1: number) =>
      place.solids.push({ kind: 'box', ...rect(g, lx, lz, hx, hz), y0, y1 });

    if (type === 'tower') {
      this.towerParts(place, CONFIG.places.towerHeight);
    } else if (type === 'cabin') {
      // Assoalho logo acima do canto mais alto (a base de pedra esconde o vão por baixo).
      const floor = highest + 0.2;
      place.floorY = floor;
      const y0 = floor - 1.6;
      const y1 = floor + 2.4;
      box(0, -2.0, 2.62, 0.12, y0, y1);
      box(-2.5, 0, 0.12, 2.1, y0, y1);
      box(2.5, 0, 0.12, 2.1, y0, y1);
      box(-1.56, 2.0, 1.06, 0.12, y0, y1);
      box(1.56, 2.0, 1.06, 0.12, y0, y1);
      place.floors.push({ ...rect(g, 0, 0, 2.4, 1.9), y: floor });
      // Degrau na porta: sobe em dois passos de até ~0,4 m.
      place.floors.push({ ...rect(g, 0, 2.45, 0.6, 0.35), y: floor - 0.3 });
    } else {
      const s = CONFIG.places.giantTreeScale;
      place.solids.push({ kind: 'cyl', x, z, r: 0.42 * s * 0.95, y0: y - 1, y1: y + 6 * s });
    }
    return place;
  }
}

/**
 * Pernas, plataforma, grade (aberta no lado +Z, onde chega a escada) e a escada de uma torre de caça com a
 * plataforma a `height` m do chão e as pernas a `place.span` m do centro.
 */
function towerPartsOf(place: Place, height: number): void {
  const g = { x: place.x, z: place.z, cos: Math.cos(place.yaw), sin: Math.sin(place.yaw) };
  const h = place.span;
  const e = h + 0.3;
  const top = place.y + height;
  place.floorY = top;
  const legR = height > 10 ? 0.2 : 0.14;
  for (const [lx, lz] of [
    [-h, -h],
    [h, -h],
    [-h, h],
    [h, h],
  ]) {
    const r = rect(g, lx, lz, 0, 0);
    place.solids.push({ kind: 'cyl', x: r.x, z: r.z, r: legR, y0: place.y - 2, y1: top + 2.3 });
  }
  place.floors.push({ ...rect(g, 0, 0, e, e), y: top });
  const box = (lx: number, lz: number, hx: number, hz: number) =>
    place.solids.push({ kind: 'box', ...rect(g, lx, lz, hx, hz), y0: top, y1: top + 1.05 });
  const rail = e - 0.04;
  const gap = 0.5;
  const half = (e - gap) / 2;
  box(0, -rail, e, 0.06);
  box(-rail, 0, 0.06, e);
  box(rail, 0, 0.06, e);
  box(-(gap + half), rail, half, 0.06);
  box(gap + half, rail, half, 0.06);
  place.ladders.push({ ...rect(g, 0, h + 0.75, 0.48, 0.55), y0: place.y - 1, y1: top + 0.35 });
  // Atrás da escada (entre ela e as pernas): quem sobe apertando W não escorrega para baixo da plataforma.
  // Termina pouco abaixo do topo, onde o passo à frente leva à plataforma.
  place.solids.push({ kind: 'box', ...rect(g, 0, h + 0.35, 0.5, 0.05), y0: place.y - 1, y1: top - 0.6 });
}

/** Mantém quem está subindo dentro da largura da escada (numa torre alta, andar torto tiraria o jogador dela). */
export function holdOnLadder(l: Ladder, pos: THREE.Vector3): void {
  const [lx, lz] = local(l, pos.x, pos.z);
  const m = l.hx - 0.05;
  if (Math.abs(lx) <= m) return;
  const cx = Math.max(-m, Math.min(m, lx));
  pos.x = l.x + cx * l.cos - lz * l.sin;
  pos.z = l.z + cx * l.sin + lz * l.cos;
}

function floorOf(p: Place, x: number, z: number, y: number, stepUp: number, best: number): number {
  for (const f of p.floors) if (f.y <= y + stepUp && f.y > best && inRect(f, x, z)) best = f.y;
  return best;
}

function ladderOf(p: Place, pos: THREE.Vector3): Ladder | null {
  for (const l of p.ladders) if (pos.y >= l.y0 && pos.y <= l.y1 && inRect(l, pos.x, pos.z)) return l;
  return null;
}

/** Primeira parede, perna ou tronco do lugar no raio, se vier antes de `best`. */
function rayPlace(p: Place, o: THREE.Vector3, d: THREE.Vector3, maxT: number, best: number): number {
  // Descarte rápido: o raio nem passa perto do lugar.
  const tx = (p.x - o.x) * d.x + (p.z - o.z) * d.z;
  const cx = o.x + d.x * tx - p.x;
  const cz = o.z + d.z * tx - p.z;
  if (cx * cx + cz * cz > (p.radius + 3) ** 2) return best;
  for (const s of p.solids) {
    const t = s.kind === 'cyl' ? rayCyl(o, d, s) : rayBox(o, d, s);
    if (t > 0 && t < best && t <= maxT) best = t;
  }
  return best;
}

/** Raio contra cilindro vertical com altura; 0 ou negativo = não bate (ou começou dentro). */
function rayCyl(o: THREE.Vector3, d: THREE.Vector3, s: { x: number; z: number; r: number; y0: number; y1: number }): number {
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return -1;
  const ox = o.x - s.x;
  const oz = o.z - s.z;
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - s.r * s.r;
  if (c <= 0) return -1;
  const disc = b * b - a * c;
  if (disc <= 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  const yy = o.y + d.y * t;
  return yy >= s.y0 && yy <= s.y1 ? t : -1;
}

/** Raio contra caixa girada com altura (lajes no espaço local da caixa). */
function rayBox(o: THREE.Vector3, d: THREE.Vector3, s: Rect & { y0: number; y1: number }): number {
  const [lx, lz] = local(s, o.x, o.z);
  const dx = d.x * s.cos + d.z * s.sin;
  const dz = -d.x * s.sin + d.z * s.cos;
  let t0 = -Infinity;
  let t1 = Infinity;
  const slab = (p: number, v: number, lo: number, hi: number): boolean => {
    if (Math.abs(v) < 1e-9) return p >= lo && p <= hi;
    let ta = (lo - p) / v;
    let tb = (hi - p) / v;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!slab(lx, dx, -s.hx, s.hx) || !slab(lz, dz, -s.hz, s.hz) || !slab(o.y, d.y, s.y0, s.y1)) return -1;
  return t0 > 0 ? t0 : -1;
}
