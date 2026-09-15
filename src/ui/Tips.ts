const STORAGE_KEY = 'birdkiller.dicas';
/** Espaço mínimo entre duas dicas (s de tempo real): uma de cada vez, sem atropelar. */
const GAP = 12;
/** A primeira dica espera o jogador se situar. */
const FIRST_DELAY = 4;

/** Dicas que aparecem uma única vez, quando o momento chega. */
export const TIPS = {
  guia: 'H abre o guia de campo: todos os controles e tudo o que existe para procurar.',
  noite: 'Anoiteceu. Com a luneta no olho, V liga o infravermelho: os bichos acendem no escuro.',
  chuva: 'Na chuva e na neblina, o infravermelho da luneta (V) enxerga o que a névoa esconde.',
  agua: 'A marca ≈ na bússola aponta para água, com a distância: é para lá que os bichos vão beber.',
  lago: 'Lago à vista: patos nadam aqui, e veados e javalis vêm beber na margem. Vale esperar escondido.',
  nadar: 'Aqui não dá pé: você nada (Shift nada mais rápido). O rifle fica guardado até pisar no fundo de novo.',
  torre: 'Uma torre de caça! Dá para subir pela escada (W olhando reto) e ver a mata de cima.',
  cabana: 'Uma cabana abandonada: dá para entrar pela porta.',
  arvore: 'Uma árvore gigante: ela aparece por cima da mata e ajuda a se orientar.',
  veado: 'Veado: ouve de longe. Agache (C), chegue devagar e, se ele parar para olhar, fique imóvel.',
  javali: 'Javali: tiro na cabeça ou no peito abate; na traseira ele foge ferido e o próximo tiro mata.',
  marcador: 'Q marca na bússola o ponto da mira: não perde o bicho de vista enquanto olha para outro lado.',
  caderno: 'Segure Tab para ver o caderno de campo: espécies, recordes e os lugares que você já achou.',
  longe: 'Longe assim, a bala cai: ponha no alvo o tracinho da distância (2, 3 e 4 = 200, 300 e 400 m).',
  ferramentas: 'Tecla 2 pega o machado para cortar árvores e juntar madeira; 1 volta para o rifle.',
  machado: 'Machado: golpeie o tronco com o botão esquerdo. Árvore grossa pede mais golpes; derrubada, E recolhe a madeira.',
  tronco: 'E recolhe a madeira deste tronco. Troncos caídos na mata também servem, sem precisar cortar nada.',
  construir: 'Já dá para construir uma torre: tecla 3 mostra onde ela fica, e o botão esquerdo constrói.',
  fantasma: 'Botão direito troca a altura: 3, 8 ou 20 m. Verde pode construir; vermelho diz o que falta.',
  cao: 'Seu cão fareja para você: F manda procurar javali, de novo veado, e de novo volta a ficar junto.',
  ferido: 'Bicho ferido manca e deixa sangue no chão: siga as gotas — ou mande o cão (F) atrás dele.',
  asa: 'Ave com a asa ferida não voa mais: ela foge pulando pelo chão. Um tiro no corpo resolve.',
  rastreio: 'Rifle de rastreio: silencioso, não espanta ninguém. O dardo marca o javali ou veado na bússola (⌖) até ele morrer.',
} as const;

export type TipId = keyof typeof TIPS;

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Dicas na hora certa: o jogo oferece uma dica quando a situação aparece (primeira noite, primeiro
 * lago, primeira torre...) e ela é mostrada uma única vez na vida — o que já foi visto fica guardado no
 * navegador. Uma de cada vez, com intervalo, para não virar tutorial (a spec proíbe tutorial obrigatório).
 */
export class Tips {
  private readonly seen = load();
  private readonly queue: TipId[] = [];
  private cooldown = FIRST_DELAY;

  constructor(private readonly show: (text: string) => void) {}

  /** A situação da dica apareceu: se ela nunca foi mostrada, entra na fila. */
  offer(id: TipId): void {
    if (this.seen.has(id) || this.queue.includes(id)) return;
    this.queue.push(id);
  }

  /** O jogador já descobriu sozinho (abriu o guia, por exemplo): a dica não precisa aparecer. */
  markSeen(id: TipId): void {
    const i = this.queue.indexOf(id);
    if (i >= 0) this.queue.splice(i, 1);
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.save();
  }

  update(realDt: number): void {
    this.cooldown -= realDt;
    if (this.cooldown > 0) return;
    const id = this.queue.shift();
    if (!id) return;
    this.seen.add(id);
    this.save();
    this.show(TIPS[id]);
    this.cooldown = GAP;
  }

  /** Esquece as dicas vistas (testes). */
  reset(): void {
    this.seen.clear();
    this.queue.length = 0;
    this.cooldown = 0;
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.seen]));
    } catch {
      // Sem armazenamento: as dicas podem repetir numa próxima visita.
    }
  }
}
