# Birdkiller

Jogo de caça de pássaros em primeira pessoa, 3D, que roda no navegador e funciona offline. Uma floresta
procedural infinita no fim da tarde, um rifle de ferrolho com luneta inspirado na Kar98k e pássaros com
comportamento próprio. Sem menus, sem missões, sem fim: entre, explore, observe e decida se vale o tiro.

Tudo é gerado por código — geometria, texturas, sons e música. Não há nenhum arquivo de mídia.

**Jogar online:** https://marcos-venicius.github.io/birdkiller/

## Como jogar

```bash
npm install
npm run dev        # abre em http://localhost:5173
```

Offline (depois de gerar os arquivos uma vez):

```bash
npm run build      # gera dist/
npm run preview    # http://localhost:4173
# ou, sem Node: cd dist && python3 -m http.server 8000
```

Clique na tela para controlar (o navegador também libera o som nesse clique). Aperte **H** a qualquer
momento para o guia de campo, com todos os controles e o que existe para procurar; dicas curtas também
aparecem sozinhas, uma única vez, quando a situação chega (a primeira noite, o primeiro lago, a primeira torre).

| Ação | Tecla |
| --- | --- |
| Mover | W A S D / setas |
| Correr (sem cansaço) | Shift |
| Agachar (alterna) | C |
| Pular | Espaço |
| Mirar com a luneta (liga/desliga) | Botão direito |
| Atirar | Botão esquerdo |
| Recarregar (quando faltar munição) | R |
| Música de fundo (liga/desliga) | M |
| Bússola (liga/desliga) | L |
| Infravermelho da luneta | V |
| Marcador de direção (no ponto da mira) | Q |
| Caderno de campo (segurar) | Tab |
| Copiar o link do seu mundo | K |
| Guia de campo | H |
| Soltar o mouse | Esc |

O carregador tem 5 tiros e recarrega sozinho quando esvazia (pente inteiro); com R você completa antes, cartucho
a cartucho — quanto menos faltar, mais rápido. A munição é infinita.

## O que tem

- **Floresta infinita**: carregada em blocos ao redor do jogador, com coníferas, árvores de copa, bétulas,
  árvores secas, arbustos, samambaias, grama, pedras, troncos caídos, clareiras e matas fechadas.
- **Dia e noite**: começa no fim de tarde (sol baixo e quente, sombras longas, névoa, vento na vegetação) e o
  tempo passa: o sol se põe, surgem a lua e as estrelas, amanhece e o ciclo continua (~42 min por dia). À noite
  há menos pássaros, mais grilos e corujas.
- **Chuva e neblina**: o tempo fecha e abre sozinho. Nublado a luz some, o céu fica cinza e a floresta some na
  bruma; chovendo, os riscos d'água cruzam a tela, o lago fica picado e os grilos calam. De madrugada baixa uma
  neblina que o sol desfaz. Nada disso atrapalha o tiro — é só clima.
- **Pássaros**: pardal, sabiá, pisco, gralha-azul, rolinha e gavião, cada um com cores, voo e canto próprios.
  Pousam nas copas e no chão, andam em bando, fogem quando você chega perto ou atira, e surgem sempre fora
  do seu campo de visão.
- **Lagos e patos**: clareiras com água espalhadas pela floresta, com ondulação, reflexo do céu e o caminho do sol
  (ou da lua) na superfície. Patos boiam, nadam, mergulham o bico e levantam voo em bando quando você chega perto;
  o pato abatido cai e fica boiando. Dá para entrar na parte rasa, mas não para nadar.
- **Bússola**: uma fita discreta no topo com o rumo e marcas para a água num raio de 600 m, com a distância —
  é assim que você acha os lagos. Tecla L desliga, se preferir a tela limpa.
- **Veados**: a caça grande. Pastam em clareiras e beiras de mata, ouvem de longe demais para quem chega
  correndo, param para olhar antes de decidir e disparam aos saltos. Valem 120 pontos — chegue agachado.
  Veados e javalis vão beber na beira do lago de tempos em tempos: vale a pena esperar escondido por perto.
- **Lugares para descobrir**: torres de caça (suba pela escada e veja a mata de cima), cabanas abandonadas
  (dá para entrar) e árvores gigantes que aparecem acima da copa de longe. Nada no mapa aponta para eles —
  cada um que você acha entra no caderno.
- **Raros**: de vez em quando o líder de um bando de veados é um **albino** ou um velho **galheiro** de galhada
  enorme — e ao amanhecer pode aparecer um **tucano** nas árvores altas. Eles entram no caderno como "???" até
  você cruzar com eles, e valem bem mais pontos.
- **Javalis**: andam em bandos pela mata, fuçando o chão. Têm faro e ouvido bons — chegue agachado e devagar.
  Tiro na cabeça ou no peito abate; na traseira ele fica ferido e foge (o próximo tiro mata). Eles não atacam.
- **Tiro com balística**: a bala leva tempo para chegar (0,2 s a 100 m, 0,8 s a 400 m) e cai no caminho — a
  luneta está zerada em 100 m, então a 300 m a bala passa quase 90 cm abaixo da mira. Um rastro sai do cano e um
  clarão marca onde ela bateu, para você corrigir o próximo tiro. Com a luneta no olho, um telêmetro mostra a
  distância do que está na mira — é o que diz quanto levantar. A tecla V troca a luneta para infravermelho:
  o mato fica frio e azulado, os bichos acendem em branco e laranja, e nem a névoa nem a noite atrapalham.
  Com o sol a pino, porém, o chão esquenta e a imagem lava — o térmico só compensa de madrugada, na chuva ou
  no tempo fechado, como no equipamento de verdade.
- **Caça**: troncos, pedras e morros bloqueiam o tiro. Corpo ou cabeça é abate
  (o pássaro cai de verdade e fica no chão); pegar só a asa é raspão. Pontos por espécie e distância.
- **Marcadores de direção**: viu um bicho e quer conferir outro lado sem perder o rumo? Aperte Q mirando nele.
  O marcador aparece na bússola e como um losango no mundo, com a distância, e se atualiza enquanto você anda.
  Q de novo olhando para ele apaga; cabem três.
- **Caderno de campo**: segure Tab para ver o que você já viveu — as espécies que avistou (as que nunca viu
  aparecem como "???"), quantas abateu, o tiro mais longo, o maior javali e o maior veado, a melhor sessão e a
  primeira caçada noturna. Fica salvo no navegador entre uma visita e outra. Não destrava nada: é só memória.
- **Seu mundo**: cada jogador ganha uma floresta própria na primeira visita, e o jogo continua de onde você parou
  — mesmo lugar, mesma hora, mesmo tempo, mesma pontuação. Aperte K para copiar o link do seu mundo e mandar
  para alguém: quem abre cai na mesma floresta, com os mesmos lagos, torres e cabanas.
- **Som**: cantos vindos de onde cada pássaro está, vento, folhas, grilos, animais ao longe, passos e uma
  música de fundo generativa bem baixinha.

## Desempenho

A qualidade se ajusta sozinha: se o FPS cair, o jogo reduz a resolução interna e o mapa de sombras, e volta a
subir quando sobra folga. Para fixar um nível, use `?quality=0` (alta) até `?quality=4` (econômica) na URL.

## Deploy (GitHub Pages)

O workflow `.github/workflows/deploy.yml` gera o build e publica no GitHub Pages a cada push na `main`
(ou manualmente pela aba **Actions**). Configuração única no repositório: **Settings → Pages → Source:
GitHub Actions**. Os caminhos do build são relativos (`base: './'` no Vite), então funciona em
`https://<usuário>.github.io/<repositório>/` sem ajustes.

## Para desenvolver

- `src/config.ts` reúne os números ajustáveis (velocidades, arma, pássaros, combate, volumes, distâncias).
- No modo de desenvolvimento (`npm run dev`) há atalhos de teste no endereço: `?hora=22` (outra hora),
  `?chuva=1` (começa chovendo), `?ir=torre`, `?ir=cabana` ou `?ir=arvore` (começa perto do lugar) e `?debug`
  (FPS, CPU, relógio, posição). Eles não existem no build publicado.
- `docs/PROGRESS.md` descreve a arquitetura, as decisões e como rodar os testes automatizados
  (`tools/cdp.mjs` + `tools/scenarios/*.json`, usando o Chrome headless).
