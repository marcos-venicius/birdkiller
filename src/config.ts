/** Constantes ajustáveis do jogo. Distâncias em metros, ângulos em graus, velocidades em m/s. */
export const CONFIG = {
  seed: 20260911,
  /** Passo máximo da simulação (evita saltos quando a aba volta do segundo plano). */
  maxDt: 1 / 20,

  camera: { fov: 75, near: 0.1, far: 700 },
  render: { maxPixelRatio: 2, exposure: 1.1 },

  world: {
    chunkSize: 64,
    /** Segmentos por lado da malha de um chunk. */
    chunkResolution: 32,
    /** Chunks cuja borda está a até esta distância ficam carregados (a névoa esconde o limite). */
    loadDistance: 250,
    unloadDistance: 290,
    /** Abaixo desta distância o chunk usa geometria detalhada e projeta sombras. */
    lod0Distance: 80,
    /** Grama só existe em chunks até esta distância (com fade no shader antes do limite). */
    grassDistance: 48,
    /** Tempo máximo por quadro gasto gerando chunks/grama. */
    buildBudgetMs: 4,
  },

  vegetation: {
    /** Grade de candidatos a árvore por lado do chunk (no máximo uma árvore por célula). */
    treeCells: 12,
    /** Tentativas de tufo de grama por chunk (= capacidade do buffer). */
    grassPerChunk: 3500,
  },

  atmosphere: {
    sunElevation: 13,
    sunAzimuth: 235,
    sunColor: 0xffa860,
    sunIntensity: 6.0,
    skyLight: 0x8a96b8,
    /** Luz refletida pelo chão — ilumina o lado de baixo das copas. */
    groundLight: 0x5e5038,
    hemiIntensity: 3.2,
    fogColor: 0x7e6b63,
    fogDensity: 0.0085,
    skyTop: 0x2c3a62,
    skyHorizon: 0xd08a58,
    shadowMapSize: 2048,
    /** Meia-largura (horizontal) da área do mapa de sombras. */
    shadowExtentX: 60,
    /** Meia-altura no espaço da luz; com sol baixo cobre ~±100 m no chão na direção do sol. */
    shadowExtentY: 22,
    /** Distância da luz ao jogador ao longo da direção do sol. */
    shadowDistance: 160,
  },

  player: {
    walkSpeed: 5.0,
    runSpeed: 9.0,
    crouchSpeed: 2.6,
    /** Multiplicador de velocidade enquanto mira. */
    aimSpeedFactor: 0.55,
    /** Raio do jogador para colisão com troncos e pedras. */
    radius: 0.35,
    eyeHeight: 1.7,
    crouchEyeHeight: 1.0,
    crouchLerp: 10,
    accel: 12,
    friction: 10,
    airAccel: 2,
    jumpSpeed: 4.8,
    gravity: 18,
    /** Distância máxima para "grudar" no chão ao descer ladeiras. */
    stepSnap: 0.35,
    mouseSensitivity: 0.0022,
    maxPitch: 89,
    /** Comprimento da passada = strideBase + strideFactor * velocidade (~2,3 passos/s andando, ~3 correndo). */
    strideBase: 1.2,
    strideFactor: 0.2,
    bobHeight: 0.035,
    bobSway: 0.025,
  },

  weapon: {
    magazineSize: 5,
    /** Tempo entre disparos: ciclo do ferrolho (s). */
    boltTime: 1.0,
    reloadTime: 2.6,
    /** Tempo para levar a luneta ao olho (s). */
    aimTime: 0.22,
    /** FOV com a luneta (~4x). */
    scopeFov: 18,
    /** Sensibilidade do mouse na luneta, relativa à normal. */
    scopeLookScale: 0.3,
    /** FOV da câmera que desenha a arma. */
    viewFov: 55,
    /** Dispersão do tiro (rad, raio do cone). */
    hipSpread: 0.022,
    moveSpread: 0.03,
    scopeSpread: 0.0012,
    scopeMoveSpread: 0.008,
    airSpread: 0.05,
    /** Coice da câmera (rad) e velocidade de retorno. */
    kickPitch: 0.045,
    kickYaw: 0.02,
    kickRecover: 7,
    /** Velocidade de retorno do coice visual da arma. */
    recoilRecover: 9,
    /** Oscilação da respiração na luneta (rad). */
    sway: 0.0016,
    swayCrouched: 0.0007,
    flashTime: 0.06,
    flashWorldLight: 40,
    flashViewLight: 1.2,
  },

  audio: {
    master: 0.8,
  },

  birds: {
    /** Máximo de pássaros vivos ao mesmo tempo. */
    maxActive: 20,
    /** Pássaros já presentes no início (deixa vagas para chegarem outros). */
    initialBirds: 12,
    /** Chance, a cada novo destino, de o pássaro ir embora de vez (é reciclado ao sair do alcance). */
    leaveChance: 0.1,
    /** Distâncias de spawn ao redor do jogador (m). */
    initialMin: 30,
    spawnMin: 60,
    spawnMax: 170,
    /** Além desta distância a névoa esconde o surgimento — pode nascer mesmo dentro da visão. */
    hiddenDistance: 150,
    /** Folga (graus) além da borda do campo de visão para spawns mais próximos. */
    viewMargin: 20,
    flyingSpawnChance: 0.4,
    /** Intervalo entre tentativas de spawn (s). */
    spawnInterval: [1.5, 4],
    despawnDistance: 240,
    /** Longe disto, os destinos puxam o pássaro de volta para a região do jogador. */
    homeRadius: 120,
    /** Raio de susto com o jogador (m): andando, correndo, agachado. */
    fearWalk: 14,
    fearRun: 24,
    fearCrouch: 7,
    /** Raio em que um disparo espanta os pássaros. */
    shotScare: 80,
  },
} as const;
