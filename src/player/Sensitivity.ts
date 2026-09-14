const STORAGE_KEY = 'birdkiller.sensibilidade';
const MIN = 0.2;
const MAX = 3;
const STEP = 0.1;

/**
 * Sensibilidade do mouse escolhida pelo jogador (teclas − e =), sem menu: um multiplicador para o olhar
 * normal e outro, separado, para a luneta. Fica guardada no navegador.
 */
export class Sensitivity {
  look = 1;
  scope = 1;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? (JSON.parse(raw) as Partial<Record<'look' | 'scope', unknown>>) : {};
      this.look = clampValue(data.look);
      this.scope = clampValue(data.scope);
    } catch {
      // Sem armazenamento ou dado inválido: fica no padrão.
    }
  }

  /** Um passo para cima (+1) ou para baixo (−1); na luneta, muda a da luneta. Devolve o novo valor. */
  adjust(scoped: boolean, dir: 1 | -1): number {
    const key = scoped ? 'scope' : 'look';
    this[key] = clampValue(this[key] + dir * STEP);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ look: this.look, scope: this.scope }));
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
    return this[key];
  }
}

function clampValue(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  // Arredonda para o passo: 1,1 + 0,1 não vira 1,2000000000000002.
  return Math.round(Math.min(MAX, Math.max(MIN, n)) / STEP) * STEP;
}

/** "1,2×" */
export function formatSensitivity(v: number): string {
  return `${v.toFixed(1).replace('.', ',')}×`;
}
