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
    /** Etapa 1: grade fixa de (2R)x(2R) chunks ao redor da origem. */
    staticChunkRadius: 3,
  },

  atmosphere: {
    sunElevation: 13,
    sunAzimuth: 235,
    sunColor: 0xffa860,
    sunIntensity: 6.0,
    skyLight: 0x8a96b8,
    groundLight: 0x4a3f2c,
    hemiIntensity: 3.2,
    fogColor: 0x7e6b63,
    fogDensity: 0.0085,
    skyTop: 0x2c3a62,
    skyHorizon: 0xd08a58,
    shadowMapSize: 2048,
    /** Meia-largura da área coberta pelo mapa de sombras. */
    shadowExtent: 60,
    /** Distância da luz ao jogador ao longo da direção do sol. */
    shadowDistance: 160,
  },

  player: {
    walkSpeed: 5.0,
    runSpeed: 9.0,
    crouchSpeed: 2.6,
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
  },
} as const;
