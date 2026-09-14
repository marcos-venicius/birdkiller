import { CONFIG } from '../config';
import * as boarSounds from '../audio/boarSounds';
import * as deerSounds from '../audio/deerSounds';
import type { AudioSystem } from '../audio/AudioSystem';
import { BOAR_PALETTES, buildBoarGeometry } from './boarModel';
import { DEER_PALETTES, buildDeerGeometry } from './deerModel';
import type { QuadrupedGeometry } from './quadrupedModel';

type Dest = AudioNode | null;
type Sound = (a: AudioSystem, dest: Dest) => void;

/** Sons de uma espécie, todos tocados a partir da posição do bicho. */
export interface AnimalSounds {
  /** Gemido do bicho ferido. */
  groan: Sound;
  /** Chamado ocioso (grunhido, balido), o barulho de comer e o de beber água. */
  idle: Sound;
  feed: Sound;
  drink: Sound;
  /** Susto: bufada do javali, latido do veado. */
  alarm: Sound;
  /** Ferido (`dying` = tiro letal). */
  hurt: (a: AudioSystem, dest: Dest, dying: boolean) => void;
  gallop: Sound;
  walk: Sound;
  thud: Sound;
  /** Multiplica as distâncias em que cada som ainda é ouvido. */
  range: number;
}

/** Números de comportamento e spawn — mesma forma para as duas espécies (CONFIG.boars/CONFIG.deer). */
export interface AnimalConfig {
  readonly maxActive: number;
  readonly initialGroups: number;
  readonly initialMin: number;
  readonly spawnMin: number;
  readonly spawnMax: number;
  readonly hiddenDistance: number;
  readonly viewMargin: number;
  readonly spawnInterval: readonly [number, number];
  readonly despawnDistance: number;
  readonly homeRadius: number;
  readonly senseWalk: number;
  readonly senseRun: number;
  readonly senseCrouch: number;
  readonly shotScare: number;
  readonly walkSpeed: number;
  readonly fleeSpeed: number;
  readonly hitboxScale: number;
  readonly points: number;
  readonly maxCorpses: number;
  readonly alertTime: readonly [number, number];
  readonly boltChance: number;
  readonly drinkInterval: readonly [number, number];
  readonly drinkTime: readonly [number, number];
  readonly drinkRange: number;
  readonly herd: readonly [number, number];
  readonly scaleLeader: readonly [number, number];
  readonly scaleOther: readonly [number, number];
}

/** Variação rara de uma espécie: outra paleta, outro tamanho, outro nome e mais pontos. */
export interface RareVariant {
  id: string;
  name: string;
  /** Índice da geometria (paleta) em `AnimalKind.geometries`. */
  palette: number;
  /** Chance de o líder de um bando nascer assim. */
  chance: number;
  points: number;
  scale: readonly [number, number];
}

/** Uma espécie de quadrúpede: modelo, números e sons. */
export interface AnimalKind {
  id: 'boar' | 'deer';
  name: string;
  cfg: AnimalConfig;
  geometries: QuadrupedGeometry[];
  sounds: AnimalSounds;
  /** Vive na mata fechada (javali) ou em clareiras e beiras de lago (veado). */
  open: boolean;
  /** Foge aos saltos em vez de galope rasteiro. */
  bounding: boolean;
  /** Inclinação da cabeça comendo e em alerta (rad). */
  feedPitch: number;
  alertPitch: number;
  /** Paletas que nascem normalmente (as primeiras); as seguintes são dos raros. */
  commonPalettes: number;
  rares: RareVariant[];
}

let boar: AnimalKind | undefined;
let deer: AnimalKind | undefined;

/** As geometrias são construídas na primeira vez que a espécie é usada. */
export function boarKind(): AnimalKind {
  return (boar ??= {
    id: 'boar',
    name: 'Javali',
    cfg: CONFIG.boars,
    geometries: BOAR_PALETTES.map((p) => buildBoarGeometry(p)),
    sounds: {
      idle: boarSounds.grunt,
      groan: boarSounds.groan,
      feed: boarSounds.rooting,
      drink: boarSounds.lapping,
      alarm: boarSounds.snort,
      hurt: boarSounds.squeal,
      gallop: boarSounds.hooves,
      walk: boarSounds.trot,
      thud: boarSounds.heavyThud,
      range: 1,
    },
    open: false,
    bounding: false,
    feedPitch: 0.55,
    alertPitch: -0.2,
    commonPalettes: BOAR_PALETTES.length,
    rares: [],
  });
}

export function deerKind(): AnimalKind {
  return (deer ??= {
    id: 'deer',
    name: 'Veado',
    cfg: CONFIG.deer,
    geometries: DEER_PALETTES.map((p) => buildDeerGeometry(p)),
    sounds: {
      idle: deerSounds.bleat,
      groan: deerSounds.groan,
      feed: deerSounds.grazing,
      drink: deerSounds.lapping,
      alarm: deerSounds.bark,
      hurt: deerSounds.deerCry,
      gallop: deerSounds.deerGallop,
      walk: deerSounds.deerWalk,
      thud: boarSounds.heavyThud,
      // O latido de alarme se ouve de bem longe.
      range: 1.4,
    },
    open: true,
    bounding: true,
    // Pescoço comprido: pastar leva o focinho até o chão.
    feedPitch: 1.15,
    alertPitch: -0.28,
    commonPalettes: 3,
    rares: [
      { id: 'deer-albino', name: 'Veado albino', palette: 3, chance: CONFIG.rares.albino, points: 300, scale: [1, 1.12] },
      { id: 'deer-galheiro', name: 'Veado-galheiro', palette: 4, chance: CONFIG.rares.galheiro, points: 220, scale: [1.25, 1.38] },
    ],
  });
}
