import { CONFIG } from '../config';

const WORLD_KEY = 'birdkiller.mundo';
const JOURNAL_KEY = 'birdkiller.caderno';
const SESSION_PREFIX = 'birdkiller.sessao.';
/** Sementes de até 6 dígitos: fáceis de ler e de mandar para alguém. */
const MAX_SEED = 999_999;

/** Onde as coisas ficam guardadas (o navegador no jogo, um objeto qualquer nos testes). */
export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage que não derruba o jogo quando o navegador bloqueia (janela privada etc.). */
export const browserStore: Store = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Sem armazenamento: o mundo e a sessão valem só enquanto a aba estiver aberta.
    }
  },
};

export interface WorldChoice {
  seed: number;
  /** Veio de um link (`?seed=`): é o mundo de outra pessoa, não o seu. */
  shared: boolean;
}

function parseSeed(raw: string | null): number | null {
  if (!raw || !/^\d{1,9}$/.test(raw.trim())) return null;
  const n = Number.parseInt(raw, 10);
  return n > 0 ? n : null;
}

/**
 * Qual mundo abrir: o do link (`?seed=`), senão o seu, guardado no navegador. Na primeira visita
 * sorteia um mundo novo — menos para quem já jogava antes dos mundos por jogador (tem caderno), que
 * segue no mundo de sempre, e no modo de desenvolvimento, onde os testes precisam do mesmo mundo.
 * Abrir o link de alguém não troca o seu mundo: sem o `?seed=`, você volta para o seu.
 */
export function resolveWorldSeed(search: string, store: Store, dev: boolean, random: () => number = Math.random): WorldChoice {
  const fromLink = parseSeed(new URLSearchParams(search).get('seed'));
  if (fromLink !== null) return { seed: fromLink, shared: true };
  const saved = parseSeed(store.get(WORLD_KEY));
  if (saved !== null) return { seed: saved, shared: false };
  const seed = dev || store.get(JOURNAL_KEY) ? CONFIG.seed : 1 + Math.floor(random() * MAX_SEED);
  store.set(WORLD_KEY, String(seed));
  return { seed, shared: false };
}

/** Link que abre este mundo em outro navegador. */
export function shareUrl(seed: number, loc: { origin: string; pathname: string } = location): string {
  return `${loc.origin}${loc.pathname}?seed=${seed}`;
}

/** Estado do tempo (Weather) que vale guardar. */
export interface WeatherSnapshot {
  state: string;
  timer: number;
  target: number;
  rain: number;
  cloud: number;
}

/** O "continuar de onde parou" de um mundo. */
export interface SavedSession {
  v: 1;
  savedAt: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hour: number;
  weather: WeatherSnapshot;
  score: number;
  kills: number;
  markers: { n: number; x: number; y: number; z: number }[];
}

/**
 * Sessão salva de um mundo: onde o jogador estava (e para onde olhava), a hora, o clima, a pontuação
 * e os marcadores. Uma por mundo, então abrir o link de outra pessoa não mexe na sua.
 */
export class SessionStore {
  private readonly key: string;

  constructor(
    seed: number,
    private readonly store: Store = browserStore,
  ) {
    this.key = SESSION_PREFIX + seed;
  }

  load(): SavedSession | null {
    try {
      const raw = this.store.get(this.key);
      if (!raw) return null;
      const s = JSON.parse(raw) as SavedSession;
      const ok = s?.v === 1 && [s.x, s.y, s.z, s.yaw, s.pitch, s.hour, s.score, s.kills].every(Number.isFinite);
      return ok ? { ...s, markers: Array.isArray(s.markers) ? s.markers : [] } : null;
    } catch {
      return null;
    }
  }

  save(s: SavedSession): void {
    this.store.set(this.key, JSON.stringify(s));
  }

  /** Esquece a sessão deste mundo (testes). */
  clear(): void {
    this.store.set(this.key, '');
  }
}
