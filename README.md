# Birdkiller

Jogo de caça de pássaros em primeira pessoa, 3D, que roda no navegador e funciona offline. Uma floresta
procedural infinita no fim da tarde, um rifle de ferrolho com luneta inspirado na Kar98k e pássaros com
comportamento próprio. Sem menus, sem missões, sem fim: entre, explore, observe e decida se vale o tiro.

Tudo é gerado por código — geometria, texturas, sons e música. Não há nenhum arquivo de mídia.

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

Clique na tela para controlar (o navegador também libera o som nesse clique).

| Ação | Tecla |
| --- | --- |
| Mover | W A S D / setas |
| Correr (sem cansaço) | Shift |
| Agachar (alterna) | C |
| Pular | Espaço |
| Mirar com a luneta (liga/desliga) | Botão direito |
| Atirar | Botão esquerdo |
| Música de fundo (liga/desliga) | M |
| Soltar o mouse | Esc |

O carregador tem 5 tiros e recarrega sozinho quando esvazia; a munição é infinita.

## O que tem

- **Floresta infinita**: carregada em blocos ao redor do jogador, com coníferas, árvores de copa, bétulas,
  árvores secas, arbustos, samambaias, grama, pedras, troncos caídos, clareiras e matas fechadas.
- **Fim de tarde**: sol baixo e quente, sombras longas, névoa, céu em degradê, vento na vegetação.
- **Pássaros**: pardal, sabiá, pisco, gralha-azul, rolinha e gavião, cada um com cores, voo e canto próprios.
  Pousam nas copas e no chão, andam em bando, fogem quando você chega perto ou atira, e surgem sempre fora
  do seu campo de visão.
- **Caça**: tiro exato para onde a arma aponta; troncos, pedras e morros bloqueiam. Corpo ou cabeça é abate
  (o pássaro cai de verdade e fica no chão); pegar só a asa é raspão. Pontos por espécie e distância.
- **Som**: cantos vindos de onde cada pássaro está, vento, folhas, grilos, animais ao longe, passos e uma
  música de fundo generativa bem baixinha.

## Desempenho

A qualidade se ajusta sozinha: se o FPS cair, o jogo reduz a resolução interna e o mapa de sombras, e volta a
subir quando sobra folga. Para fixar um nível, use `?quality=0` (alta) até `?quality=4` (econômica) na URL.
`?debug` mostra FPS, qualidade, tempo de CPU, draw calls, chunks e pássaros.

## Para desenvolver

- `src/config.ts` reúne os números ajustáveis (velocidades, arma, pássaros, combate, volumes, distâncias).
- `docs/PROGRESS.md` descreve a arquitetura, as decisões e como rodar os testes automatizados
  (`tools/cdp.mjs` + `tools/scenarios/*.json`, usando o Chrome headless).
