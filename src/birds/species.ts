export interface BirdColors {
  back: number;
  belly: number;
  breast: number;
  head: number;
  cap: number;
  beak: number;
  wing: number;
  primaries: number;
  tail: number;
}

/** bounding = bate e fecha as asas (ondulado); flapping = batidas contínuas; soaring = plana em círculos. */
export type FlightStyle = 'bounding' | 'flapping' | 'soaring';

export interface Species {
  id: string;
  name: string;
  /** Comprimento do corpo (m) — escala da geometria. */
  length: number;
  /** Meia-envergadura e largura da asa, relativas ao comprimento. */
  span: number;
  chord: number;
  /** Largura da cauda e tamanho do bico (relativos). */
  tail: number;
  beak: number;
  crest: boolean;
  colors: BirdColors;
  speed: number;
  /** Rapidez com que ajusta a velocidade/direção (1/s). */
  agility: number;
  flapHz: number;
  flight: FlightStyle;
  /** Altura de voo acima do chão (m). */
  cruise: [number, number];
  /** Tempo pousado (s). */
  perchTime: [number, number];
  /** Chance de escolher o chão / uma copa como próximo destino (o resto é passeio). */
  groundChance: number;
  perchChance: number;
  flock: [number, number];
  /** Peso no sorteio de spawn e máximo simultâneo. */
  weight: number;
  max: number;
  /** Multiplica os raios de susto. */
  wary: number;
  /** Só pousa em árvores altas. */
  tallPerch: boolean;
}

export const SPECIES: Species[] = [
  {
    id: 'pardal',
    name: 'Pardal',
    length: 0.2,
    span: 0.75,
    chord: 1,
    tail: 1,
    beak: 0.9,
    crest: false,
    colors: {
      back: 0x7a5a3a,
      belly: 0xcbb89a,
      breast: 0xb8a282,
      head: 0x8a6a4a,
      cap: 0x6a4a30,
      beak: 0x3a3028,
      wing: 0x6e4e30,
      primaries: 0x3e2e22,
      tail: 0x5a4430,
    },
    speed: 8,
    agility: 3.2,
    flapHz: 13,
    flight: 'bounding',
    cruise: [6, 14],
    perchTime: [6, 20],
    groundChance: 0.5,
    perchChance: 0.4,
    flock: [2, 4],
    weight: 3,
    max: 6,
    wary: 1,
    tallPerch: false,
  },
  {
    id: 'sabia',
    name: 'Sabiá',
    length: 0.3,
    span: 0.8,
    chord: 1,
    tail: 1.1,
    beak: 1.1,
    crest: false,
    colors: {
      back: 0x6e5a44,
      belly: 0xc8743a,
      breast: 0xc0703a,
      head: 0x6e5a44,
      cap: 0x5e4a38,
      beak: 0xc9a040,
      wing: 0x5e4a36,
      primaries: 0x3a2e24,
      tail: 0x5a4632,
    },
    speed: 8.5,
    agility: 2.5,
    flapHz: 9,
    flight: 'flapping',
    cruise: [5, 12],
    perchTime: [8, 25],
    groundChance: 0.45,
    perchChance: 0.45,
    flock: [1, 1],
    weight: 2.2,
    max: 4,
    wary: 1.1,
    tallPerch: false,
  },
  {
    id: 'pisco',
    name: 'Pisco',
    length: 0.21,
    span: 0.75,
    chord: 1,
    tail: 1,
    beak: 0.8,
    crest: false,
    colors: {
      back: 0x6a6258,
      belly: 0xe2dacb,
      breast: 0xd4622c,
      head: 0x6a6258,
      cap: 0x5a5248,
      beak: 0x2a2420,
      wing: 0x5e564c,
      primaries: 0x2e2a26,
      tail: 0x564e44,
    },
    speed: 7.5,
    agility: 3,
    flapHz: 12,
    flight: 'bounding',
    cruise: [4, 10],
    perchTime: [5, 18],
    groundChance: 0.4,
    perchChance: 0.5,
    flock: [1, 2],
    weight: 2,
    max: 4,
    wary: 0.9,
    tallPerch: false,
  },
  {
    id: 'gralha',
    name: 'Gralha-azul',
    length: 0.38,
    span: 0.85,
    chord: 1.1,
    tail: 1.2,
    beak: 1.1,
    crest: true,
    colors: {
      back: 0x2f62b0,
      belly: 0x3a6cb8,
      breast: 0x3a6cb8,
      head: 0x15171d,
      cap: 0x15171d,
      beak: 0x111111,
      wing: 0x3470c8,
      primaries: 0x14181f,
      tail: 0x2a58a0,
    },
    speed: 7,
    agility: 2.2,
    flapHz: 7,
    flight: 'flapping',
    cruise: [8, 18],
    perchTime: [10, 30],
    groundChance: 0.15,
    perchChance: 0.75,
    flock: [1, 3],
    weight: 1.4,
    max: 4,
    wary: 1.3,
    tallPerch: false,
  },
  {
    id: 'rolinha',
    name: 'Rolinha',
    length: 0.34,
    span: 0.95,
    chord: 1,
    tail: 1.1,
    beak: 0.8,
    crest: false,
    colors: {
      back: 0x9a8a7c,
      belly: 0xc0aa98,
      breast: 0xb89a8c,
      head: 0x8e8a88,
      cap: 0x8a8684,
      beak: 0x3a3030,
      wing: 0x8a7a6c,
      primaries: 0x4a4440,
      tail: 0x7a6e64,
    },
    speed: 10,
    agility: 2,
    flapHz: 7.5,
    flight: 'flapping',
    cruise: [8, 16],
    perchTime: [10, 30],
    groundChance: 0.5,
    perchChance: 0.45,
    flock: [2, 3],
    weight: 2,
    max: 4,
    wary: 1.2,
    tallPerch: false,
  },
  {
    id: 'gaviao',
    name: 'Gavião',
    length: 0.62,
    span: 1.3,
    chord: 1.35,
    tail: 1.6,
    beak: 1,
    crest: false,
    colors: {
      back: 0x5e4432,
      belly: 0xd8c6a4,
      breast: 0xcbb08a,
      head: 0x6a4e3a,
      cap: 0x5a3e2c,
      beak: 0x2a2a2a,
      wing: 0x6a4c36,
      primaries: 0x2c2219,
      tail: 0x80603f,
    },
    speed: 9,
    agility: 1.2,
    flapHz: 3.2,
    flight: 'soaring',
    cruise: [35, 60],
    perchTime: [15, 40],
    groundChance: 0,
    perchChance: 0.35,
    flock: [1, 1],
    weight: 0.35,
    max: 1,
    wary: 1.6,
    tallPerch: true,
  },
];
