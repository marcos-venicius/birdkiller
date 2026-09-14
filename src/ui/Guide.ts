/**
 * Conteúdo do guia de campo (tecla H): controles, o que existe para procurar, os bichos e como funciona
 * o seu mundo. Opcional e sem pausar o jogo — a spec proíbe tutorial obrigatório e menus.
 * `**tecla**` vira uma tecla desenhada.
 */
export const GUIDE: { title: string; items: string[] }[] = [
  {
    title: 'Andar',
    items: [
      '**W A S D** anda · **Shift** corre, sem cansaço · **Espaço** pula',
      '**C** agacha: você faz menos barulho e os bichos demoram a notar',
      'Correr espanta tudo por perto; agachado e parado, quase nada',
    ],
  },
  {
    title: 'Atirar',
    items: [
      '**Botão direito** liga a luneta · **Botão esquerdo** atira · **R** completa o carregador',
      'A bala leva tempo e cai: até ~150 m mire direto; mais longe, use os tracinhos da luneta',
      'Tracinhos abaixo do centro da luneta: 2, 3 e 4 = 200, 300 e 400 m. Leia a distância no telêmetro e ponha o tracinho dela no alvo',
      'Na luneta, o telêmetro mostra a distância do que está na mira',
      '**V** liga o infravermelho da luneta: ótimo de noite, na chuva e na neblina; ruim sob sol forte',
      'Cabeça ou peito abate; pássaro pego só na asa foge; javali e veado feridos na traseira fogem',
    ],
  },
  {
    title: 'O que procurar',
    items: [
      '**Lagos**: a marca ≈ na bússola aponta para eles. Patos nadam ali, e veados e javalis vêm beber',
      '**Torres de caça**: suba pela escada (W olhando reto; para descer, olhe para baixo) e veja por cima',
      '**Cabanas abandonadas**: dá para entrar pela porta',
      '**Árvores gigantes**: aparecem acima da mata, de longe',
      'Nada disso está no mapa: ande, olhe o horizonte e suba nas torres',
    ],
  },
  {
    title: 'Os bichos',
    items: [
      'Sete pássaros, patos nos lagos, javalis na mata e veados nas clareiras',
      'Veado ouve de muito longe e para para olhar antes de fugir: fique imóvel',
      '**Raros**: veado albino, veado-galheiro de galhada enorme e o tucano, só ao amanhecer',
      'Quem você ainda não viu aparece como ??? no caderno',
    ],
  },
  {
    title: 'Ferramentas',
    items: [
      '**L** bússola · **Q** marca o ponto da mira (Q de novo olhando para ele apaga)',
      '**Tab** (segurar) caderno de campo: espécies, recordes e lugares achados',
      '**−** e **=** diminuem e aumentam a sensibilidade do mouse; com a luneta no olho, ajustam a da luneta',
      '**M** música · **Esc** solta o mouse',
    ],
  },
  {
    title: 'Machado e madeira',
    items: [
      '**1** rifle · **2** machado · **3** construir',
      '**Botão esquerdo** com o machado golpeia o tronco: de 3 a 8 golpes, conforme a grossura, e a árvore cai',
      '**E** recolhe a madeira da árvore derrubada ou de um tronco caído na mata',
      'Cortar faz barulho: os bichos por perto fogem',
    ],
  },
  {
    title: 'Construir torres',
    items: [
      '**3** mostra uma torre-fantasma onde a mira aponta, com a escada virada para você',
      '**Botão direito** troca a altura: 3 m (15 de madeira), 8 m (35) ou 20 m (80), acima da copa',
      '**Botão esquerdo** constrói. Vermelho diz o que falta: madeira, árvores no caminho, chão plano, sair da água',
      'Suas torres ficam no seu mundo para sempre',
    ],
  },
  {
    title: 'Seu mundo',
    items: [
      'O dia passa (~42 min), às vezes chove e de madrugada baixa neblina',
      'O jogo guarda onde você parou: fechou, voltou, continua dali',
      '**K** copia o link do seu mundo para mandar a alguém — a mesma floresta, os mesmos lugares',
    ],
  },
];

/** HTML do guia, montado uma vez. */
export function guideHtml(): string {
  const key = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '<kbd>$1</kbd>');
  const sections = GUIDE.map((s) => `<section><h3>${s.title}</h3><ul>${s.items.map((i) => `<li>${key(i)}</li>`).join('')}</ul></section>`).join('');
  return `<h2>Guia de campo</h2><div class="cols">${sections}</div><footer><kbd>H</kbd> fecha · o jogo continua rodando por trás</footer>`;
}
