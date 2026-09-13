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
Em modo dev, `window.game` expõe `engine`, `input`, `player`, `terrain`, `biome`, `vegetation`, `chunks`,
`atmosphere`, `hud`, `audio`, `weapon`, `birds`, `particles`, `hunting`, `ambience`, `voices`, `footsteps` e
`sounds` (todas as funções de som), `music`, `quality`, `boars`, `boarVoices` e `setPaused(true|false)` (pausa o loop para benchmarks) para depuração
(`game.birds.frozen = true` congela os pássaros; `game.hunting.lastShot` mostra o resultado do último tiro).

### Teste automatizado (Chrome headless, sem dependências)
```bash
npm run dev   # em outro terminal
node tools/cdp.mjs "http://localhost:5173/?debug" tools/scenarios/stage1.json
```
`tools/cdp.mjs` abre o Chrome headless (WebGL via SwiftShader) pelo protocolo CDP, executa as ações do cenário
(`wait`, `shot`, `eval`, `keyDown`/`keyUp`/`press`), salva capturas em `tools/shots/` e imprime o console da página.
Cenários: `stage1.json`, `stage2.json` (capturas de sol/clareira/mata, corrida, teleporte, colisão, custo de geração),
`stage3.json` (arma: estados, mira, dispersão, recarga, poses — botões injetados em `game.input.buttons`/`buttonsPressed`),
`stage4.json` (pássaros: vitrine das espécies, simulação de 90 s, regra de spawn fora da visão, sustos, memória),
`stage4-perch.json` (pássaros nas copas vistos da clareira, com a luneta),
`stage5.json` (abate, corpo, tiro em corpo, oclusão por tronco, raspão, chão/céu, limite de corpos, mira alternada),
`stage6.json` (render offline de cada som com pico/RMS/NaN via `game.audio.debugRender`, nível ao vivo via
`game.audio.level()`, passos simulados), `stage6-events.json` (asas ao decolar, alarme, baque do corpo),
`stage6-music.json` (música offline vs. referências, nível ao vivo com/sem música, tecla M),
`stage7.json` (custo de geração, CPU por quadro, duas sessões longas comparando memória, qualidade adaptativa),
`stage8-boars.json` (vitrine dos javalis, simulação de 120 s, percepção, tiro vital/ferimento, corpos, sons),
`stage8b-reload.json` (recarga manual com R: tempos, carregador cheio, durante o ferrolho, mira, som),
`stage9-daynight.json` (início igual ao fim de tarde original, saltos de luz em 24 h, duração das fases,
capturas às 17h, pôr do sol, lua nascendo, noite, amanhecer e meio-dia),
`stage10-lake.json` (lagos gerados, perfil da bacia, jogador barrado na água funda, tiro na água,
vegetação fora d'água, custo do heightAt, capturas em 4 horas do dia),
`stage11-ducks.json` (patos boiando, 60 s de simulação sem sair do lago, abate, corpo boiando, sons novos),
`smoke.json` (build de produção: sem requisições externas). O Chrome headless roda com autoplay liberado, então
`game.audio.unlock()` funciona (não dá para ouvir, mas erros de áudio aparecem no console).

**Atenção:** com a floresta, o SwiftShader roda a ~1 fps. Não use o headless para medir desempenho nem para testar
movimento em tempo real — os cenários simulam chamando `game.player.update(1/30)` em laço, com teclas injetadas em
`game.input.down`, e `game.chunks.warmup(pos)` para carregar chunks na hora.

## Controles
- Clique no jogo: captura o mouse (pointer lock). Esc solta.
- WASD / setas: mover · Shift: correr (sem stamina) · C: agachar (alterna) · Espaço: pular.
- Botão esquerdo: atirar · Botão direito: liga/desliga a luneta (anda mais devagar, não corre).
  Shift, a recarga automática e soltar o mouse (Esc) desligam a mira.
- R: recarga manual quando falta munição (cartucho a cartucho: 0,7 s + 0,4 s por cartucho). Vazio = automática (2,6 s).
- M: liga/desliga a música de fundo (lembra a escolha).
- `?hora=22` (ou `?hora=5.5`) na URL começa em outra hora; o padrão é 17h. `?debug` mostra o relógio.
- Ctrl **não** é usado para agachar porque Ctrl+W fecha a aba no navegador.

## Etapas
- [x] **1. Base** — Vite/TS/Three, Engine, loop, atmosfera de fim de tarde (sol baixo, sombras, névoa, céu em shader), terreno com relevo, PlayerController, HUD esqueleto. Velocidades: andar 5, correr 9, agachado 2,6 m/s.
- [x] **2. Mundo infinito** — ChunkManager (streaming em etapas + pool), vegetação instanciada por chunk (4 espécies de árvore, arbustos, samambaias, grama, pedras, troncos caídos, tocos, galhos), clareiras/áreas densas via `Biome`, LOD por distância, vento no shader, colisão com troncos/pedras/tocos, spawn em ponto livre.
- [x] **3. Arma** — Kar98k procedural com luneta (~4x, "sniper"), renderizada em passada própria; poses quadril/correndo/recarregando/mirando; balanço de passos e do mouse; mira com FOV 75→18°, retículo alemão e respiração; dispersão (quadril ~1°, luneta ~0,005°); coice de câmera e arma; clarão (sprite + luz na mata); ferrolho animado (1 s); carregador de 5 e recarga automática (2,6 s) com "Recarregando..."; sons sintetizados de disparo com eco, ferrolho e recarga.
- [x] **4. Pássaros** — 6 espécies procedurais (pardal, sabiá, pisco, gralha-azul, rolinha, gavião) com cores, tamanhos e estilos de voo próprios (ondulado, contínuo, planando em térmicas); estados pousado/voando/pousando/fugindo; idle com viradas, bicadas e pulinhos no chão; destinos em copas (um pássaro por poleiro), no chão de clareiras ou passeio; bandos seguem o líder; susto com a aproximação (raio conforme andar/correr/agachar) e com disparos; spawn dinâmico (máx. 20, 60–170 m, fora do campo de visão ou oculto pela névoa, parte já pousada, parte chegando voando); às vezes vão embora e são reciclados (pool).
- [x] **5. Tiro e morte** — hitscan exato (até 400 m) contra relevo (marcha + bisseção), troncos/tocos (cilindros com altura), pedras (esferas) e pássaros (esferas de corpo e cabeça = letal; asa aberta = raspão, foge); obstáculo só bloqueia se estiver antes do pássaro; queda com gravidade, arrasto, giro e quique; corpo deitado no chão, inerte (não pontua de novo); máx. 15 corpos, somem após 4 min; pontos por espécie + 1 a cada 10 m; HUD "Pontos · Abates" + aviso "+18 Sabiá · 32 m"; penas e lascas (terra/casca/pedra) em InstancedMesh com pool; sons de impacto com atraso da distância; mira no botão direito virou alterna (liga/desliga).
- [x] **6. Áudio** — ouvinte na câmera e sons espaciais (HRTF + distância; longe = mais reverb da mata); grupos de volume (efeitos/ambiente/pássaros/passos); vento em rajadas, folhas estéreo (mais na mata fechada), farfalhar ao andar na grama, grilos em volta; animais ocasionais ao longe (coruja, pica-pau, corvo, galho estalando, bugio); canto próprio de cada espécie vindo do pássaro, alarme ao fugir, bater de asas ao decolar, baque do corpo; passos sincronizados com o balanço (folhas/grama, correndo/agachado, aterrissagem, graveto); impactos do tiro espaciais; áudio pausa com a aba em segundo plano.
- [x] **6b. Música de fundo** (pedido do usuário) — compositor generativo estilo "RPG de exploração": progressões clássicas (I–V–vi–IV, IV–V–iii–vi...), tônica e andamento (70–84 BPM) novos a cada seção; cordas (pad serra desafinado + passa-baixa), baixo, harpa em arpejos, melodia de flauta/ocarina com vibrato (motivo A, sequência, resposta B, cadência em nota longa) e sininhos; eco + reverb da mata; pausas de 15–35 s às vezes; volume bem baixo (bus `music`); tecla M liga/desliga (preferência salva no navegador).
- [x] **7. Polimento e desempenho** — qualidade adaptativa (`core/Quality.ts`: 5 níveis de resolução interna + mapa de sombras, desce com FPS < 40 em 2 janelas de 2 s, sobe com FPS > 56 sustentado; `?quality=0..4` fixa); grama gerada escrevendo as matrizes direto no buffer e com volume de culling pelo chunk; dithering no céu, terreno, vegetação, pássaros e partículas (fim do banding); vinheta sutil em CSS; overlay `?debug` com tempo de CPU da lógica e do envio para a GPU e o nível de qualidade; sessões longas sem vazamento; build offline testado; `README.md`.
- [x] **8. Javalis** (pedido do usuário) — javali low-poly procedural (2 pelagens, cabeça/pernas/rabo animados); estados fuçando/andando/alerta/fuga/morrendo/morto; bandos de 1–3 (máx. 5 vivos) surgem fora da visão, dentro da mata; percebem o jogador de longe (26 m andando, 45 correndo, 11 agachado, 60% disso parado) e o bando foge junto; tiros num raio de 130 m espantam; cabeça/peito = abate, traseira = ferido (grita, foge mais rápido, o próximo tiro mata); desaba de lado e vira corpo inerte (máx. 5); 60 pontos + 1 a cada 10 m; sons espaciais (grunhido, fuçada, bufada, galope, grito, baque). Não atacam o jogador (a spec proíbe sistema de vida).
- [x] **8b. Recarga manual** (pedido do usuário) — tecla R completa o carregador cartucho a cartucho.
- [x] **9. Ciclo dia/noite** (pedido do usuário — **substitui o "fim de tarde constante" da spec §3/§14**) — começa às
  17h com exatamente a aparência original (sol a ~13°) e o relógio anda: pôr do sol ~6,5 min, noite fechada ~9 min,
  noite ~14 min, ciclo completo ~42 min (`CONFIG.dayNight`: o tempo anda devagar perto do horizonte e mais rápido
  de madrugada). Aparência interpolada por elevação do sol (`LOOKS` em `Atmosphere.ts`: céu, névoa, luz, hemisférica,
  exposição, estrelas); a luz principal é o sol de dia e a lua à noite (lua oposta ao sol; a intensidade passa por
  zero no horizonte, sem salto); céu com estrelas cintilando e disco da lua com halo; exposição sobe à noite para a
  mata continuar legível; sombra ajusta o volume à altura da luz; luzes da arma seguem a luz do mundo. À noite:
  menos pássaros (`birds.activity`) e quase sem canto, grilos mais altos, mais corujas, sem pica-pau/corvo.

- [x] **10. Lagos e patos** (pedido do usuário) — lagos procedurais (`world/Lakes.ts`): no máximo um por célula de
  260 m, contorno irregular (três harmônicas), só onde o relevo original é plano e não fica "pendurado" acima do
  entorno; `Terrain.heightAt` escava a bacia (fundo parabólico, margem subindo, mistura com o relevo em 1,6 raio),
  então física, tiro e vegetação enxergam o lago sem saber dele. Água (`world/Water.ts`): um disco por lago com
  shader próprio (ondulação por soma de senos com gradiente analítico, reflexo do céu por Fresnel, brilho do sol/lua,
  fundo à mostra na parte rasa, névoa e dithering); as cores vêm da atmosfera, então a água acompanha o ciclo
  dia/noite e escurece à noite. Vegetação e grama não nascem na água; jogador e javalis param na parte rasa
  (`wadeDepth` 0,5 m); tiro na água vira respingo + "plop" em vez de acertar o fundo; marola no ambiente perto da margem.
  **Patos** são uma espécie de pássaro (`species.ts`, `water: true`), reaproveitando voo, susto, abate e pontuação:
  só pousam e passeiam nadando nos lagos (destinos na água, `BirdManager.findWaterSpot`), boiam com balanço e
  mergulham o bico, o corpo abatido fica boiando (`groundAt` devolve a lâmina d'água), fazem "quá-quá" e levantam
  água ao decolar e ao pousar. 45 pontos + distância; só entram no sorteio de spawn se houver lago por perto.

## Requisitos do CLAUDE.md — auditoria final
| § | Requisito | Onde |
| --- | --- | --- |
| 1 | Navegador, offline, recursos locais, sem tela de título | Vite/`dist/`, tudo procedural, só a dica "Clique para controlar" |
| 2 | Andar, correr, agachar, olhar, mirar, atirar, recarga automática; sem stamina/fome/etc. | `PlayerController`, `Weapon` |
| 3 | Floresta variada, fim de tarde, sombras | `Vegetation`, `Biome`, `Atmosphere` (começa no fim de tarde; o ciclo dia/noite foi pedido pelo usuário), `Lakes`/`Water` |
| 4 | Mundo infinito por chunks | `ChunkManager` (streaming + pool) |
| 5 | Pássaros com spawn dinâmico fora da visão, comportamentos e variações | `BirdManager`, `Bird`, `species.ts` |
| 6–7 | Caça livre, morte com queda física, corpo inerte, remoção de corpos antigos | `Hunting`, `Bird` (falling/dead), `CONFIG.combat` |
| 8 | Pontuação discreta, sem loja/níveis/progressão | HUD "Pontos · Abates" |
| 9–10 | Kar98k visível, tiro com efeito e som, luneta, carregador limitado, munição infinita, "Recarregando..." | `Kar98kModel`, `Weapon`, `weaponSounds` |
| 11 | Hit detection exato, sem pontuar duas vezes | `Hunting.shoot` (hitscan + oclusão), só pássaros vivos são alvo |
| 12 | HUD mínima | `HUD.ts` |
| 13 | Áudio ambiente, pássaros espaciais, passos, arma | `audio/*` |
| 14 | Atmosfera contemplativa | luz baixa, névoa, vento, grilos, música bem baixa |
| 15 | Sem começo/fim | não há game over nem condição de término |
| 16 | Chunking, pooling, LOD, frustum culling, instancing, descarregamento, limites | chunks/pássaros/partículas/grama em pool; LOD por distância; InstancedMesh com bounding spheres; máx. 20 pássaros e 15 corpos |

## Estrutura atual
```
src/
  main.ts                 bootstrap + loop (dt limitado a CONFIG.maxDt)
  config.ts               todas as constantes ajustáveis
  core/Engine.ts          renderer (ACES, sombras PCF), cena + câmera do mundo; viewScene + viewCamera da arma
                          (2 passadas: mundo, limpa profundidade, arma); info.reset manual
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
  world/Lakes.ts          lagos procedurais: sítios por célula, escavação da bacia (shape), consultas (at, depthAt,
                          waterHeight/dry, shoreDistance, near), block() do jogador e clampInside() dos patos
  world/Water.ts          lâmina de água: um disco por lago com shader (ondas, Fresnel, brilho, névoa), cores da atmosfera
  world/Atmosphere.ts     ciclo dia/noite (hour, setHour, clock, night 0..1, exposure); luz principal sol/lua +
                          hemisférica + FogExp2 + cúpula do céu (sol, lua, estrelas); sombra segue o jogador com snap de texel
  player/PlayerController.ts  movimento, pulo, agachar, head-bob, colisão via CollisionWorld; stepPhase (áudio);
                          aiming, viewOffset (coice/respiração), lookDelta, lookScale — controlados pela arma
  weapon/Kar98kModel.ts   modelo procedural (coronha = perfil extrudado c/ textura de madeira em canvas, cano,
                          ferrolho animável, luneta, sprite de clarão); ocular em z=0 e eixo óptico em y=0
  weapon/Weapon.ts        estados ready/cycling/reloading, mira, disparo com dispersão, poses, coice, luzes da arma;
                          onFire(origin, dir) = gancho para a detecção de acerto da Etapa 5
  audio/AudioSystem.ts    AudioContext (desbloqueado no 1º gesto), compressor, reverb de floresta por convolução,
                          noiseBurst()/tone() com envelope — base para a Etapa 6
  audio/weaponSounds.ts   disparo (estalo + corpo + ecos), ferrolho, recarga com pente
  ui/HUD.ts               setScore, setAmmo, setReloading, setHintVisible, setScoped, setCrosshairVisible, flash, setDebug
  birds/species.ts        definição das espécies (cores, tamanho, voo, destinos, bando, peso/máximo, cautela)
  birds/birdGeometry.ts   corpo (tronco, cabeça, bico, olhos, cauda, crista) + asa em leque; unidade = comprimento
  birds/Bird.ts           um pássaro: máquina de estados, voo por steering (vagueio, inclinação nas curvas,
                          térmicas), pouso, idle, susto; asas com batida/planeio/dobra; showcase() p/ depuração
  birds/BirdManager.ts    spawn fora da visão, destinos (chooseDestination), poleiros ocupados, bandos,
                          sustos (scare), despawn e pool; implementa BirdWorld
  world/ChunkManager.ts   + randomPerch(x, z, minR, maxR, out, accept) — sorteia topo de copa carregado
                          + raycastObstacles(o, d, maxT) — troncos (chunk.trunks) e pedras (chunk.rocks)
  world/Terrain.ts        + raycast(o, d, maxT) — marcha de 1 m + bisseção
  combat/Hunting.ts       shoot(origin, dir): resolve o tiro, abate/raspão, pontuação, efeitos e sons; lastShot
  audio/AudioSystem.ts    + buses, updateListener(camera), spatial(pos, bus, ref), loop(), level(), debugRender()
  audio/Ambience.ts       vento/folhas/farfalhar (loops), grilos, animais ocasionais
  audio/BirdVoices.ts     cantos por pássaro (intervalo/alcance por espécie, máx. 6 simultâneos) e sons de transição
  audio/birdSongs.ts      SONGS[espécie](a, dest, alarme), wingFlutter, corpseThud
  audio/animalSounds.ts   ANIMALS (coruja, pica-pau, corvo, galho, bugio), cricketChirp
  audio/Footsteps.ts      passos pelo stepPhase do jogador + aterrissagem
  core/Quality.ts         qualidade adaptativa (pixel ratio + mapa de sombras) e ?quality=0..4
  core/math.ts            + angleDiff, raySphere (compartilhados por pássaros e javalis)
  world/spawnRules.ts     inPlayerView(): regra "fora do campo de visão" usada por pássaros e javalis
  animals/boarModel.ts    geometria do javali (corpo+crina, cabeça c/ focinho/presas/orelhas, pata, rabo), paletas
  animals/Boar.ts         um javali: estados, andar desviando de troncos, galope em zigue-zague, morte, raycast por zona
  animals/BoarManager.ts  spawn de bandos, percepção do jogador, fuga do bando, hit() (abate/ferido), corpos, pool
  audio/boarSounds.ts     grunt, snort, squeal, hooves, trot, rooting, heavyThud
  audio/BoarVoices.ts     sons dos javalis por observação de estado (como o BirdVoices)
  audio/Music.ts          música generativa (seções, frases por motivos, instrumentos via AudioSystem.voice),
                          agendamento com lookahead de 1,2 s; toggle() da tecla M; debugSchedule() p/ testes
  effects/Particles.ts    penas e lascas (um InstancedMesh, pool de 240)
  birds/Bird.ts           + estados falling/dead, kill(), raycast() (esferas), sink() e corpseAge
  birds/BirdManager.ts    + raycast(), kill() com limite de corpos, living (vivos)
```

## Deploy (GitHub Pages)
- `.github/workflows/deploy.yml`: Node 22, `npm ci`, `npm run build`, publica `dist/` com
  `actions/upload-pages-artifact` + `actions/deploy-pages`. Dispara em push na `main` e manualmente.
- Pré-requisito único: Settings → Pages → Source = GitHub Actions (ou
  `gh api -X POST repos/<dono>/<repo>/pages -f build_type=workflow`).
- Build testado servido em subpasta (`/birdkiller/`, como no Pages): assets 200, sem requisições externas.
- URL esperada: https://marcos-venicius.github.io/birdkiller/ (Pages gratuito exige repositório público).

## Desempenho medido (Etapa 7, headless com a renderização pausada)
- Geração por etapa (uma por quadro, orçamento 4 ms): grama ~3,9 ms, terreno ~2,2 ms, vegetação ~1,3 ms.
- CPU da lógica por quadro correndo: média 0,22 ms, p95 0,4 ms, p99 4,4 ms (quadros com geração de chunk).
- Duas sessões longas seguidas (~9 km e ~160 abates cada): heap 29,4 → 29,5 MB, geometrias 79 → 79 — sem vazamento.
- O custo de GPU real não dá para medir no headless (SwiftShader): use `?debug` numa máquina de verdade.
  No headless a qualidade adaptativa cai sozinha (1 fps) — normal.

## Notas para as próximas etapas
- Tiro: `weapon.onFire` → `hunting.shoot()`. Ajustes em `CONFIG.combat` (alcance, `hitboxScale` 1,35 — as esferas
  de acerto são maiores que o corpo real —, folga de oclusão, máximo e tempo de vida dos corpos) e pontos em
  `species.ts`. Folhagem não bloqueia o tiro (só troncos, pedras e relevo). Custo ~0,4 ms por tiro.
- Áudio: sem arquivos — tudo sintetizado (ruído filtrado + osciladores com envelope). Volumes em
  `CONFIG.audio` (master e buses). Níveis de referência (render offline): disparo ~0,40 de pico, cantos a 15 m
  0,05–0,14, ambiente ao vivo com rajada forte pico ~0,029 / RMS ~0,0083 na clareira e 0,040 / 0,0105 na mata
  (era 0,054 / 0,0141 e 0,066 / 0,0175 — o usuário achou o vento alto demais: ganho do vento 0,05+0,11·rajada →
  0,035+0,055·rajada e as folhas 0,012+0,05·rajada → 0,01+0,03·rajada), passo correndo na grama ~0,027 de pico (era 0,053: o usuário achou a
  corrida na grama alta demais — baixei o ganho do passo correndo 0,8→0,6, o "swish" da grama 0,3→0,22 e o
  farfalhar contínuo da vegetação 0,085→0,042 na clareira). `BirdVoices` detecta transições de estado observando os pássaros, sem acoplar
  áudio ao comportamento. Na simulação do headless o relógio do áudio não anda (vozes ficam "ocupadas").
- Música: volume do bus `music` = 0,12 → RMS ~0,009, cerca de metade do ambiente ao vivo (RMS ~0,016), para
  ficar "bem baixo" no fundo. Com 0,35 ela ficava mais alta que o vento/folhas.
- Pássaros: custo ~0,13 ms/quadro com 20 ativos; 3 draw calls por pássaro visível (corpo + 2 asas).
  Poleiros = ponto exato do topo de cada espécie (`SPECIES[].perch` em `Vegetation.ts`, com a matriz da instância).
  Pássaros no chão ficam parcialmente escondidos pela grama alta das clareiras (proposital).
- Ajustes da arma ficam em `CONFIG.weapon` (tempos, FOV da luneta, dispersão, coice, respiração, clarão) e as poses
  no topo de `Weapon.ts` (HIP/ADS/SPRINT/RELOAD).
- Etapa 4 (pássaros): pontos de pouso já existem em `chunk.perches` (topo das copas, escalado). Árvores secas
  (`snag`) são bons poleiros. Colisores (`chunk.colliders`) servem para oclusão do tiro na Etapa 5 (cilindros verticais).
- Números da Etapa 2 (spawn): ~60 chunks, ~250 draw calls, ~0,5 M triângulos. Custo de geração medido no headless
  (CPU disputada com o SwiftShader): terreno ~5 ms, vegetação 1,5–5 ms (conforme densidade), grama ~7 ms.
  Se houver engasgos ao andar, mover a geração para um Web Worker (Etapa 7).
- Lagos: tudo sai de `CONFIG.lakes` (célula, chance, raio, profundidade, `flatness`/`outerDrop` do teste de terreno,
  `wadeDepth`, distância de render). Cada lago cabe inteiro na sua célula, então consultar a célula do ponto basta —
  `heightAt` não ficou mais caro de forma mensurável (~0,7 µs por chamada, igual ao relevo puro). A água é um disco
  por lago com material próprio (poucos em cena); o disco tem 98,5% do raio da bacia para a beira não brigar com a margem.
- Patos: espécie normal com `water: true`. `BirdManager.groundAt` devolve a lâmina d'água dentro dos lagos — é isso
  que faz pato e corpo boiarem. Susto: raio 14 m × wary 1,15, então chegar na margem levanta o bando.
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
