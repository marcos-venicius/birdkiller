import { browserStore, type Store } from '../ui/Session';

const PREFIX = 'birdkiller.obras.';

/** Árvore derrubada, deitada no chão, esperando alguém recolher a madeira. */
export interface FelledTree {
  /** Id da árvore em pé que ela era (`cx:cz:gx:gz`). */
  id: string;
  /** Camada da vegetação (de onde vêm a geometria e o material) e a matriz já deitada. */
  layer: number;
  m: number[];
  /** Topo da copa em escala 1: o tronco vai da base até lá ao longo do eixo Y da matriz. */
  h: number;
  /** Raio do tronco (m). */
  r: number;
  wood: number;
}

/** Torre construída pelo jogador: onde, para onde a escada olha e o tamanho (índice em `CONFIG.build.sizes`). */
export interface BuiltTower {
  x: number;
  z: number;
  yaw: number;
  size: number;
}

const finite = (...v: unknown[]): boolean => v.every((n) => typeof n === 'number' && Number.isFinite(n));
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * O que o jogador mudou em um mundo: árvores cortadas, troncos recolhidos, árvores derrubadas ainda no
 * chão, torres construídas e a madeira juntada. Um registro por mundo (abrir o link de outra pessoa não
 * mexe no seu), gravado a cada mudança — elas são raras.
 */
export class WorldEdits {
  wood = 0;
  readonly cut = new Set<string>();
  readonly taken = new Set<string>();
  readonly felled: FelledTree[] = [];
  readonly towers: BuiltTower[] = [];
  private readonly key: string;

  constructor(
    seed: number,
    private readonly store: Store = browserStore,
  ) {
    this.key = PREFIX + seed;
    this.load();
  }

  save(): void {
    this.store.set(
      this.key,
      JSON.stringify({ v: 1, wood: this.wood, cut: [...this.cut], taken: [...this.taken], felled: this.felled, towers: this.towers }),
    );
  }

  /** Desfaz tudo neste mundo (testes). */
  clear(): void {
    this.wood = 0;
    this.cut.clear();
    this.taken.clear();
    this.felled.length = 0;
    this.towers.length = 0;
    this.save();
  }

  private load(): void {
    try {
      const raw = this.store.get(this.key);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown> | null;
      if (d?.v !== 1) return;
      if (finite(d.wood)) this.wood = Math.max(0, Math.floor(d.wood as number));
      for (const id of list(d.cut)) if (typeof id === 'string') this.cut.add(id);
      for (const id of list(d.taken)) if (typeof id === 'string') this.taken.add(id);
      for (const f of list(d.felled) as Partial<FelledTree>[]) {
        if (f && typeof f.id === 'string' && finite(f.layer, f.h, f.r, f.wood) && Array.isArray(f.m) && f.m.length === 16 && finite(...f.m)) {
          this.felled.push({ id: f.id, layer: f.layer!, m: f.m, h: f.h!, r: f.r!, wood: f.wood! });
        }
      }
      for (const t of list(d.towers) as Partial<BuiltTower>[]) {
        if (t && finite(t.x, t.z, t.yaw, t.size)) this.towers.push({ x: t.x!, z: t.z!, yaw: t.yaw!, size: t.size! });
      }
    } catch {
      // Registro estragado: começa limpo (o mundo em si continua o mesmo).
    }
  }
}
