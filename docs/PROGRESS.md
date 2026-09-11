# Progresso — Birdkiller

Arquivo de acompanhamento para retomar a implementação entre sessões. Especificação completa em `CLAUDE.md`.

## Decisões de stack
- **Vite + TypeScript + Three.js** (npm, empacotado localmente — sem CDN).
- **Assets 100% procedurais**: geometria gerada em código, áudio sintetizado com WebAudio. Nenhum arquivo externo.
- **Offline**: `npm run build` gera `dist/`; servir com `npm run preview` ou `cd dist && python3 -m http.server`.
- Ruído simplex 2D e PRNG próprios (`src/core/noise.ts`, `src/core/rng.ts`) — mundo determinístico pela seed em `src/config.ts`.

## Como rodar
```bash
npm install
npm run dev          # http://localhost:5173  (adicione ?debug para FPS/draw calls/posição)
npm run build        # checagem de tipos + build em dist/
npm run preview      # serve dist/ em http://localhost:4173
```
Em modo dev, `window.game` expõe `engine`, `input`, `player`, `terrain`, `atmosphere`, `hud` para depuração.

### Teste automatizado (Chrome headless, sem dependências)
```bash
npm run dev   # em outro terminal
node tools/cdp.mjs "http://localhost:5173/?debug" tools/scenarios/stage1.json
```
`tools/cdp.mjs` abre o Chrome headless (WebGL via SwiftShader) pelo protocolo CDP, executa as ações do cenário
(`wait`, `shot`, `eval`, `keyDown`/`keyUp`/`press`), salva capturas em `tools/shots/` e imprime o console da página.
Cenários: `stage1.json`, `stage2.json` (capturas de sol/clareira/mata, corrida, teleporte, colisão, custo de geração),
`smoke.json` (build de produção: sem requisições externas).

**Atenção:** com a floresta, o SwiftShader roda a ~1 fps. Não use o headless para medir desempenho nem para testar
movimento em tempo real — os cenários simulam chamando `game.player.update(1/30)` em laço, com teclas injetadas em
`game.input.down`, e `game.chunks.warmup(pos)` para carregar chunks na hora.

## Controles
- Clique no jogo: captura o mouse (pointer lock). Esc solta.
- WASD / setas: mover · Shift: correr (sem stamina) · C: agachar (alterna) · Espaço: pular.
- (Etapa 3) Botão esquerdo: atirar · Botão direito: mirar.
- Ctrl **não** é usado para agachar porque Ctrl+W fecha a aba no navegador.

## Etapas
- [x] **1. Base** — Vite/TS/Three, Engine, loop, atmosfera de fim de tarde (sol baixo, sombras, névoa, céu em shader), terreno com relevo, PlayerController, HUD esqueleto. Velocidades: andar 5, correr 9, agachado 2,6 m/s.
- [x] **2. Mundo infinito** — ChunkManager (streaming em etapas + pool), vegetação instanciada por chunk (4 espécies de árvore, arbustos, samambaias, grama, pedras, troncos caídos, tocos, galhos), clareiras/áreas densas via `Biome`, LOD por distância, vento no shader, colisão com troncos/pedras/tocos, spawn em ponto livre.
- [ ] **3. Arma** — viewmodel Kar98k procedural, sway/bob, ADS (FOV + posição + precisão), tiro com flash/recuo, ferrolho, carregador de 5, recarga automática com "Recarregando...".
- [ ] **4. Pássaros** — malhas low-poly com variações, animação de asas, estados (voar/pousar/parado/fugir), spawn dinâmico fora da visão, pool.
- [ ] **5. Tiro e morte** — raycast ray-sphere com oclusão, morte com física de queda, pontuação única, limite/tempo de vida dos corpos.
- [ ] **6. Áudio** — vento, folhas, cantos espaciais, animais distantes, passos, farfalhar, sons da arma.
- [ ] **7. Polimento e desempenho** — iluminação, perfil de FPS/memória, sessão longa, build offline final.

## Estrutura atual
```
src/
  main.ts                 bootstrap + loop (dt limitado a CONFIG.maxDt)
  config.ts               todas as constantes ajustáveis
  core/Engine.ts          renderer (ACES, sombras PCF soft), cena, câmera, resize
  core/Input.ts           teclado, mouse, pointer lock (wasPressed limpo em endFrame)
  core/noise.ts, rng.ts   simplex 2D + fbm, mulberry32, hash2 (seed por chunk)
  core/math.ts            TAU, smoothstep
  world/Terrain.ts        heightAt(x,z) = fonte única do relevo; createChunkGeometry/fillChunkGeometry (índice
                          compartilhado, buffers reaproveitados); meshHeight() = altura exata da malha renderizada
  world/Biome.ts          forest(x,z) 0=clareira..1=mata fechada; conifer(x,z); ForestGrid (grade 9×9 interpolada)
  world/Chunk.ts          terreno + 1 InstancedMesh por camada; colliders (x,z,r); perches (x,y,z) p/ pássaros
  world/ChunkManager.ts   streaming (loadDistance 250 m / unload 290 m), fila terreno→vegetação→grama com
                          orçamento buildBudgetMs, LOD por distância, pool de chunks e de grama,
                          resolveCollision(), isClear()
  world/vegetation/geometries.ts  geometrias low-poly procedurais (LOD0/LOD1) com cores por vértice
  world/vegetation/Vegetation.ts  definição das camadas + populate(chunk) + fillGrass(mesh, chunk)
  world/vegetation/wind.ts        applyWind(material): balanço no vertex shader + fade por distância; windTime
  world/Atmosphere.ts     sol direcional + hemisférica + FogExp2 + cúpula do céu; sombra segue o jogador com snap de texel
  player/PlayerController.ts  movimento, pulo, agachar, head-bob, colisão via CollisionWorld; stepPhase (áudio)
  ui/HUD.ts               setScore, setAmmo, setReloading, setHintVisible, setDebug
```

## Notas para as próximas etapas
- Etapa 4 (pássaros): pontos de pouso já existem em `chunk.perches` (topo das copas, escalado). Árvores secas
  (`snag`) são bons poleiros. Colisores (`chunk.colliders`) servem para oclusão do tiro na Etapa 5 (cilindros verticais).
- Números da Etapa 2 (spawn): ~60 chunks, ~250 draw calls, ~0,5 M triângulos. Custo de geração medido no headless
  (CPU disputada com o SwiftShader): terreno ~5 ms, vegetação 1,5–5 ms (conforme densidade), grama ~7 ms.
  Se houver engasgos ao andar, mover a geração para um Web Worker (Etapa 7).
- Grama e samambaia usam faces de trás duplicadas na geometria (não `DoubleSide`, que inverte a normal e escurece).
- Coníferas têm os galhos a partir de ~3 m para não bloquear a visão na altura dos olhos.
- A cor da névoa (`fogColor`) é igual à base do céu abaixo do horizonte — manter alinhadas ao ajustar a atmosfera.
- O terreno só recebe sombra (não projeta): a borda do mapa de sombras (±60 m) aparecia nas colinas. Se as sombras
  da vegetação terminarem de forma visível, avaliar cascata (CSM) ou fade na Etapa 7.
- Gradientes escuros do chão mostram leve banding de 8 bits (linhas de contorno sutis) — considerar dithering
  no pós-processamento na Etapa 7.
- Iluminação calibrada para Lambert com luzes físicas (three r186): o albedo da grama precisa ser razoavelmente
  claro (~0x5f6e37), senão o chão fica preto na sombra.
- `player.lookScale` existe para reduzir a sensibilidade durante a mira (Etapa 3).
