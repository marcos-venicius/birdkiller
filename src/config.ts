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

  lakes: {
    /** Lado da célula que pode conter um lago (m) e chance de ela ter um. */
    cell: 260,
    chance: 0.5,
    minRadius: 20,
    maxRadius: 46,
    minDepth: 2.2,
    maxDepth: 4,
    /** Desnível máximo do relevo original na borda: em encosta o lago viraria uma cratera. */
    flatness: 5.5,
    /** Quanto o terreno logo fora do lago pode estar abaixo da água (senão ela fica "pendurada"). */
    outerDrop: 2.5,
    /** Profundidade até onde o jogador entra na água; além disso a margem o segura. */
    wadeDepth: 0.5,
    /** Lagos com água desenhada até esta distância do jogador. */
    viewDistance: 320,
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

  weather: {
    /** Minutos reais de tempo bom e de chuva, e a transição entre eles (s). */
    clearMinutes: [7, 18],
    rainMinutes: [2, 5],
    transition: [40, 80],
    /** Chance de o tempo fechado virar chuva (senão fica só nublado). */
    rainChance: 0.7,
    /** Gotas desenhadas em volta da câmera, e o cilindro onde elas caem. */
    drops: 2600,
    radius: 16,
    height: 18,
    fallSpeed: 26,
    /** Quanto cada efeito engrossa a névoa (multiplicador somado a 1). */
    fogRain: 2.2,
    fogCloud: 0.5,
    fogMist: 2.6,
    /** Força máxima da neblina de madrugada. */
    mist: 1,
  },

  dayNight: {
    /** Hora inicial: 17h é o fim de tarde original (sol a ~13°). `?hora=22` na URL começa em outra hora. */
    startHour: 17,
    /** Horas do jogo por minuto real durante o dia (sol alto). */
    hoursPerMinute: 0.75,
    /** Multiplicador perto do horizonte: o entardecer e o amanhecer duram mais (~6 min até o pôr do sol). */
    twilightSpeed: 0.2,
    /** Multiplicador na noite fechada: a madrugada passa mais rápido. */
    nightSpeed: 1.6,
    /** Elevação do sol ao meio-dia (graus) e direção (azimute) dele ao meio-dia. */
    maxElevation: 50,
    noonAzimuth: 160,
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
    /** Recarga com o carregador vazio (pente inteiro, automática). */
    reloadTime: 2.6,
    /** Recarga manual (R) com balas ainda no carregador: base + por cartucho que falta (s). */
    topUpBase: 0.7,
    topUpPerRound: 0.4,
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
    /** Volume de cada grupo de sons. */
    buses: { sfx: 1, ambience: 0.8, birds: 1, steps: 1, music: 0.12 },
    /** Segundos até a música começar depois que o áudio é liberado. */
    musicDelay: 4,
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

  boars: {
    /** Máximo de javalis vivos ao mesmo tempo. */
    maxActive: 5,
    /** Bandos já presentes no início. */
    initialGroups: 1,
    /** Distâncias de spawn ao redor do jogador (m). */
    initialMin: 50,
    spawnMin: 70,
    spawnMax: 160,
    /** Além desta distância a névoa esconde o surgimento. */
    hiddenDistance: 140,
    /** Folga (graus) além da borda do campo de visão. */
    viewMargin: 20,
    /** Intervalo entre tentativas de spawn (s). */
    spawnInterval: [8, 20],
    despawnDistance: 230,
    /** Longe disto, os destinos puxam o bando de volta para a região do jogador. */
    homeRadius: 110,
    /** Distância em que percebem o jogador (m) — faro e ouvido bons. Parado, 60% disso. */
    senseWalk: 26,
    senseRun: 45,
    senseCrouch: 11,
    /** Raio em que um disparo espanta os javalis. */
    shotScare: 130,
    walkSpeed: 1.1,
    fleeSpeed: 8.5,
    /** Esferas de acerto um pouco maiores que o corpo. */
    hitboxScale: 1.1,
    /** Pontos base por abate (mais 1 a cada 10 m). */
    points: 60,
    maxCorpses: 5,
    /** Tempo parado olhando antes de decidir, e a chance de disparar em vez de voltar a comer. */
    alertTime: [1.2, 2.6],
    boltChance: 0.35,
    /** Sede: intervalo entre idas ao lago (s), tempo bebendo (s) e distância que aceita andar. */
    drinkInterval: [120, 300],
    drinkTime: [8, 16],
    drinkRange: 130,
    /** Tamanho do bando e escala do líder e dos demais. */
    herd: [1, 3],
    scaleLeader: [0.95, 1.15],
    scaleOther: [0.75, 0.95],
  },

  deer: {
    /** Máximo de veados vivos ao mesmo tempo. */
    maxActive: 4,
    initialGroups: 1,
    /** Distâncias de spawn ao redor do jogador (m). */
    initialMin: 80,
    spawnMin: 100,
    spawnMax: 190,
    /** Além desta distância a névoa esconde o surgimento. */
    hiddenDistance: 150,
    viewMargin: 20,
    spawnInterval: [16, 34],
    despawnDistance: 250,
    homeRadius: 140,
    /** Ouvido e faro muito melhores que os do javali: parado, 60% disso. */
    senseWalk: 55,
    senseRun: 95,
    senseCrouch: 24,
    /** Um disparo espanta os veados de longe. */
    shotScare: 220,
    walkSpeed: 1.4,
    fleeSpeed: 12.5,
    hitboxScale: 1.05,
    /** Pontos base por abate (mais 1 a cada 10 m) — a melhor caça do jogo. */
    points: 120,
    maxCorpses: 3,
    /** Fica mais tempo olhando antes de decidir, e quase sempre dispara. */
    alertTime: [2.5, 5],
    boltChance: 0.6,
    /** Veado bebe com mais frequência (e demora menos, sempre de orelha em pé). */
    drinkInterval: [90, 220],
    drinkTime: [6, 12],
    drinkRange: 170,
    herd: [1, 3],
    scaleLeader: [1, 1.15],
    scaleOther: [0.8, 0.95],
  },

  combat: {
    /** Alcance máximo do tiro (m). */
    range: 400,
    /** Velocidade da bala (m/s) e gravidade que a puxa — o tiro longe exige compensar a queda. */
    muzzleVelocity: 500,
    gravity: 9.8,
    /** Distância em que a luneta está zerada (a bala passa exatamente na mira). */
    zeroDistance: 100,
    /** Boca do cano em relação ao olho (m): só onde o rastro começa, não muda a trajetória. */
    muzzleRight: 0.2,
    muzzleDown: 0.16,
    muzzleForward: 0.5,
    /** Rastro da bala: cor, opacidade, comprimento (em pontos do caminho) e quanto dura depois do impacto (s). */
    tracerColor: 0xffe6b0,
    tracerOpacity: 0.85,
    /**
     * Largura do rastro na tela: quase toda proporcional à distância da câmera, para o risco ter
     * a mesma espessura em pixels perto e longe (`tracerWidth` é só um piso em metros).
     */
    tracerWidth: 0.004,
    tracerWidthPerMeter: 0.0016,
    tracerLength: 7,
    tracerFade: 0.45,
    /** Clarão do impacto: tamanho (m), quanto cresce por metro de distância, brilho e duração (s). */
    flashSize: 0.03,
    flashSizePerMeter: 0.006,
    flashOpacity: 0.9,
    flashTime: 0.3,
    /** Aumenta as esferas de acerto dos pássaros (tamanho real seria punitivo demais a distância). */
    hitboxScale: 1.35,
    /** Um obstáculo só bloqueia se estiver esta distância antes do pássaro (m). */
    occlusionSlack: 0.35,
    /** Máximo de corpos no chão; acima disso o mais antigo some. */
    maxCorpses: 15,
    /** Tempo até um corpo sumir (s). */
    corpseLifetime: 240,
  },
} as const;
