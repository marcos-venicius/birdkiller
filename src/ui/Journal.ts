import { CONFIG } from '../config';

const STORAGE_KEY = 'birdkiller.caderno';
/** Agrupa gravações: mudanças em sequência (vários abates) viram uma escrita só. */
const SAVE_DELAY = 2;
/** Mesmo sem mudança, grava de tempos em tempos para o tempo em campo não se perder. */
const AUTOSAVE = 30;

/** Uma espécie que pode entrar no caderno. */
export interface JournalSpecies {
  id: string;
  name: string;
}

/** Um abate, como o Hunting reporta, com a hora do jogo acrescentada pelo main. */
export interface JournalKill {
  id: string;
  name: string;
  distance: number;
  /** Escala do bicho (só quadrúpedes) — vira peso estimado. */
  scale?: number;
  /** Espécie cujo recorde de peso conta (raros disputam o da espécie comum). */
  weightId?: string;
  night: boolean;
  clock: string;
}

/** Um tipo de lugar para descobrir (torre, cabana...), com o nome no singular e no plural. */
export interface JournalPlaceKind {
  type: string;
  name: string;
  plural: string;
}

/** O que o painel mostra, já formatado. */
export interface JournalView {
  rows: { name: string; seen: boolean; kills: number; longest: string }[];
  records: [string, string][];
  places: [string, string][];
  totals: [string, string][];
  seen: number;
  total: number;
}

interface SpeciesRecord {
  seenAt: number | null;
  kills: number;
  longest: number;
}

interface Data {
  v: 1;
  species: Record<string, SpeciesRecord>;
  longestShot: { m: number; id: string } | null;
  /** Maior peso (kg) já abatido por espécie de quadrúpede. */
  heaviest: Record<string, number>;
  bestSession: number;
  firstNight: { id: string; clock: string; date: number } | null;
  kills: number;
  seconds: number;
  /** Lugares descobertos: id do lugar → tipo. */
  places: Record<string, string>;
}

function empty(): Data {
  return { v: 1, species: {}, longestShot: null, heaviest: {}, bestSession: 0, firstNight: null, kills: 0, seconds: 0, places: {} };
}

/** Lê o caderno salvo; qualquer coisa estranha (outra versão, JSON quebrado) vira caderno novo. */
function load(): Data {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const d = JSON.parse(raw) as Partial<Data>;
    if (d.v !== 1) return empty();
    return { ...empty(), ...d, species: d.species ?? {}, heaviest: d.heaviest ?? {}, places: d.places ?? {} };
  } catch {
    return empty();
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * Caderno de campo: o que o jogador já viu e viveu, guardado no navegador entre sessões —
 * espécies avistadas e abatidas, recordes e totais. É registro, não progressão: nada aqui
 * destrava nada (a spec proíbe). Devolve os avisos ("Novo no caderno", "Recorde...") para o
 * HUD mostrar; não mexe em DOM.
 */
export class Journal {
  private data = load();
  private readonly unseen = new Set<string>();
  private dirty = false;
  private saveTimer = 0;
  private autosave = 0;
  /** Melhor sessão registrada quando esta começou — para avisar uma vez só ao passar dela. */
  private readonly bestAtStart: number;
  private beatBest = false;

  constructor(
    private readonly species: readonly JournalSpecies[],
    private readonly placeKinds: readonly JournalPlaceKind[] = [],
  ) {
    for (const s of species) if (!this.data.species[s.id]?.seenAt) this.unseen.add(s.id);
    this.bestAtStart = this.data.bestSession;
  }

  /** Espécie que ainda falta avistar (o main só gasta raio de visão com estas). */
  isUnseen(id: string): boolean {
    return this.unseen.has(id);
  }

  get complete(): boolean {
    return this.unseen.size === 0;
  }

  /** Primeira vez que a espécie aparece: entra no caderno. */
  spot(id: string): string | null {
    if (!this.unseen.has(id)) return null;
    this.unseen.delete(id);
    this.record(id).seenAt = Date.now();
    this.touch();
    return `Novo no caderno: ${this.nameOf(id)}`;
  }

  /** Chegou a um lugar pela primeira vez: entra no caderno. */
  discover(id: string, type: string): string | null {
    if (this.data.places[id]) return null;
    this.data.places[id] = type;
    this.touch();
    const kind = this.placeKinds.find((k) => k.type === type);
    return `Descoberto: ${kind ? kind.name : type}`;
  }

  /** Registra um abate e devolve os avisos que ele gerou. */
  recordKill(k: JournalKill, sessionScore: number): string[] {
    const out: string[] = [];
    const fresh = this.spot(k.id);
    if (fresh) out.push(fresh);
    const r = this.record(k.id);
    r.kills++;
    this.data.kills++;
    r.longest = Math.max(r.longest, k.distance);

    // O primeiro tiro da vida só estabelece a marca; recorde é passar dela.
    const ls = this.data.longestShot;
    if (!ls || k.distance > ls.m) {
      if (ls) out.push(`Recorde: tiro de ${Math.round(k.distance)} m`);
      this.data.longestShot = { m: k.distance, id: k.id };
    }

    const wid = k.weightId ?? k.id;
    const base = (CONFIG.journal.weightKg as Record<string, number | undefined>)[wid];
    if (base && k.scale) {
      const kg = base * k.scale ** 3;
      const prev = this.data.heaviest[wid] ?? 0;
      if (kg > prev) {
        if (prev > 0) out.push(`Recorde: maior ${this.nameOf(wid).toLowerCase()} — ${Math.round(kg)} kg`);
        this.data.heaviest[wid] = kg;
      }
    }

    if (k.night && !this.data.firstNight) {
      this.data.firstNight = { id: k.id, clock: k.clock, date: Date.now() };
      out.push('Primeira caçada noturna');
    }

    if (sessionScore > this.data.bestSession) {
      this.data.bestSession = sessionScore;
      if (this.bestAtStart > 0 && !this.beatBest) {
        this.beatBest = true;
        out.push('Melhor sessão até hoje');
      }
    }
    this.touch();
    return out;
  }

  /** Conta o tempo em campo e grava quando há mudança (agrupada) ou de tempos em tempos. */
  tick(dt: number): void {
    this.data.seconds += dt;
    this.autosave += dt;
    if (this.dirty) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) this.flush();
    } else if (this.autosave >= AUTOSAVE) {
      this.flush();
    }
  }

  /** Grava agora (saindo da página, aba em segundo plano). */
  flush(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Sem armazenamento (janela privada etc.): o caderno vale só para esta sessão.
    }
    this.dirty = false;
    this.autosave = 0;
  }

  /** Apaga tudo (testes/depuração). */
  clear(): void {
    this.data = empty();
    this.unseen.clear();
    for (const s of this.species) this.unseen.add(s.id);
    this.flush();
  }

  view(): JournalView {
    const d = this.data;
    const rows = this.species.map((s) => {
      const r = d.species[s.id];
      const seen = !!r?.seenAt;
      return {
        name: seen ? s.name : '???',
        seen,
        kills: r?.kills ?? 0,
        longest: r && r.longest > 0 ? `${Math.round(r.longest)} m` : '—',
      };
    });
    const ls = d.longestShot;
    const fn = d.firstNight;
    const records: [string, string][] = [['Tiro mais longo', ls ? `${Math.round(ls.m)} m · ${this.nameOf(ls.id)}` : '—']];
    for (const id of Object.keys(CONFIG.journal.weightKg)) {
      const kg = d.heaviest[id];
      records.push([`Maior ${this.nameOf(id).toLowerCase()}`, kg ? `${Math.round(kg)} kg` : '—']);
    }
    records.push(['Melhor sessão', d.bestSession > 0 ? `${d.bestSession} pontos` : '—']);
    records.push(['Primeira caçada noturna', fn ? `${this.nameOf(fn.id)} · ${fn.clock} · ${formatDate(fn.date)}` : '—']);
    const found = Object.values(d.places);
    const places: [string, string][] = this.placeKinds.map((k) => [k.plural, String(found.filter((t) => t === k.type).length)]);
    return {
      rows,
      records,
      places,
      totals: [
        ['Abates', String(d.kills)],
        ['Tempo em campo', formatTime(d.seconds)],
      ],
      seen: this.species.length - this.unseen.size,
      total: this.species.length,
    };
  }

  private record(id: string): SpeciesRecord {
    return (this.data.species[id] ??= { seenAt: null, kills: 0, longest: 0 });
  }

  private nameOf(id: string): string {
    return this.species.find((s) => s.id === id)?.name ?? id;
  }

  private touch(): void {
    if (this.dirty) return;
    this.dirty = true;
    this.saveTimer = SAVE_DELAY;
  }
}
