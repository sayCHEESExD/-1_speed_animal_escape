/**
 * The animal roster.
 *
 * An animal REPLACES the boots of the previous game: it is the movement
 * vehicle, the progression ladder and the thing the player actually looks at,
 * all in one record. Everything a system needs to know about a species lives
 * here and nowhere else, so adding an eleventh animal is a new entry in
 * `ANIMALS` and nothing more - no movement code, no renderer branch and no
 * server case statement changes.
 *
 * Deliberately framework-free: the client turns `shape` and `palette` into
 * blocky geometry, the server reads `speedPerStep`, `moveBonus`, `jumpBonus`
 * and `winsRequired`, and neither knows the other's half exists.
 */

/**
 * Blocky proportions, in world units, for the generic quadruped the client
 * builds every animal from.
 *
 * These are the numbers that decide whether a species reads as a llama or a
 * panda, so they are data rather than per-species modelling code: one builder
 * consumes the whole struct and there is no second way to make an animal.
 */
export interface AnimalShape {
  /** Barrel: width (X), height (Y), length (Z). */
  readonly bodyW: number;
  readonly bodyH: number;
  readonly bodyL: number;
  /** Neck box: width, length along its own axis, and how far it leans back. */
  readonly neckW: number;
  readonly neckLen: number;
  /** Radians the neck tilts back from vertical. 0 is straight up. */
  readonly neckTilt: number;
  /** Head box. */
  readonly headW: number;
  readonly headH: number;
  readonly headL: number;
  /** Snout box, hung off the front of the head. 0 length hides it. */
  readonly snoutW: number;
  readonly snoutH: number;
  readonly snoutL: number;
  /** Ear box, mirrored left and right. */
  readonly earW: number;
  readonly earH: number;
  readonly earL: number;
  /** Radians the ears splay outward. */
  readonly earSplay: number;
  /** Leg segment thickness and the length of the upper/lower halves. */
  readonly legW: number;
  readonly legUpper: number;
  readonly legLower: number;
  /** Half the distance between the left and right legs. */
  readonly legSpreadX: number;
  /** Half the distance between the front and back legs. */
  readonly legSpreadZ: number;
  /** Tail box. */
  readonly tailW: number;
  readonly tailLen: number;
  /** Radians the tail hangs down from horizontal. */
  readonly tailDroop: number;
}

/** Flat, saturated toy colours. Hex, as three.js takes them. */
export interface AnimalPalette {
  /** Barrel, neck, head, legs. */
  readonly body: number;
  /** Belly, muzzle, inner legs - the lighter under-colour. */
  readonly belly: number;
  /** Hooves, nose, antler tips. */
  readonly hoof: number;
  /** Mane, tail tuft, forelock. */
  readonly hair: number;
  /** Inner ear, and any species accent (spots, patches, stripes). */
  readonly accent: number;
  /** Saddle leather. */
  readonly saddle: number;
}

/** Species-specific furniture bolted onto the generic quadruped. */
export type AnimalFeature =
  /** Branching antlers on the crown. */
  | 'antlers'
  /** A single spiral horn. */
  | 'horn'
  /** A mane running down the neck. */
  | 'mane'
  /** A ruff encircling the head. */
  | 'lionMane'
  /** Scattered accent patches on the flanks. */
  | 'spots'
  /** Vertical accent bars on the flanks. */
  | 'stripes'
  /** Large accent blotches: the cow and the panda. */
  | 'patches'
  /** Black eye rings and black limb cuffs. */
  | 'pandaMarks'
  /** Flat blocky wings on the shoulders. */
  | 'wings'
  /** A tuft of hair on the end of the tail. */
  | 'tailTuft'
  /** Two short curved horns. */
  | 'cowHorns'
  /** A woolly overcoat: an oversized second barrel. */
  | 'wool';

/** How one animal moves, looks and is unlocked. */
export interface AnimalDefinition {
  /** Stable id, used in saves and in the model cache. Never re-used. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /**
   * Slot number, 1-based and contiguous.
   *
   * The replicated `animalSlot` and the owned-animal bitmask are indexed by
   * this, so it is the wire identity and `id` is the human one.
   */
  readonly slot: number;
  /** Wins needed to claim it from its stand. Slot 1 is free. */
  readonly winsRequired: number;
  /**
   * Speed farmed per stride while riding this animal.
   *
   * The whole progression ladder: a better animal farms the currency faster,
   * which raises the level, which raises movement speed, which opens later
   * stages. Matches the "+N Speed" label above each stand.
   */
  readonly speedPerStep: number;
  /** Multiplier on base movement speed. A big animal is a faster animal. */
  readonly moveBonus: number;
  /** Multiplier on jump velocity. */
  readonly jumpBonus: number;
  /** Uniform scale applied to the built model. */
  readonly scale: number;
  /**
   * Where the rider sits, measured from the HOOVES, before `scale`.
   *
   * `y` is the height of the rider model's own origin, not of the saddle:
   * the supplied FBX puts its origin at the feet and its hip joints 1.21
   * units above that, so a seat that looks right is
   * `belly + bodyHeight + 0.2 - 1.21`. Setting it to the saddle height
   * instead is what buries the rider's legs inside the barrel.
   */
  readonly riderOffset: Readonly<{ x: number; y: number; z: number }>;
  /**
   * Stride length in world units.
   *
   * Drives the gait phase, so a short-legged animal takes visibly more steps
   * to cover the same ground.
   */
  readonly strideLength: number;
  readonly shape: AnimalShape;
  readonly palette: AnimalPalette;
  readonly features: readonly AnimalFeature[];
}

/** Proportion presets, so ten animals are ten variations of four builds. */
const BUILD = {
  /** Deer, horse, zebra, unicorn: long legs, level back, slim barrel. */
  hoofed: {
    bodyW: 1.35,
    bodyH: 1.4,
    bodyL: 2.7,
    neckW: 0.85,
    neckLen: 1.35,
    neckTilt: 0.42,
    headW: 0.95,
    headH: 1.0,
    headL: 1.05,
    snoutW: 0.7,
    snoutH: 0.6,
    snoutL: 0.6,
    earW: 0.24,
    earH: 0.62,
    earL: 0.34,
    earSplay: 0.62,
    legW: 0.44,
    legUpper: 0.95,
    legLower: 0.9,
    legSpreadX: 0.5,
    legSpreadZ: 0.95,
    tailW: 0.34,
    tailLen: 0.8,
    tailDroop: 0.9,
  },
  /** Llama, donkey: shorter legs, upright neck, boxier head. */
  stocky: {
    bodyW: 1.35,
    bodyH: 1.35,
    bodyL: 2.4,
    neckW: 0.8,
    neckLen: 1.45,
    neckTilt: 0.16,
    headW: 0.85,
    headH: 0.9,
    headL: 1.0,
    snoutW: 0.62,
    snoutH: 0.55,
    snoutL: 0.55,
    earW: 0.22,
    earH: 0.7,
    earL: 0.3,
    earSplay: 0.42,
    legW: 0.42,
    legUpper: 0.8,
    legLower: 0.78,
    legSpreadX: 0.5,
    legSpreadZ: 0.85,
    tailW: 0.3,
    tailLen: 0.6,
    tailDroop: 1.1,
  },
  /** Lion: low slung, broad chest, short neck, big head. */
  cat: {
    bodyW: 1.4,
    bodyH: 1.3,
    bodyL: 2.5,
    neckW: 0.9,
    neckLen: 0.7,
    neckTilt: 0.75,
    headW: 1.1,
    headH: 1.0,
    headL: 0.95,
    snoutW: 0.75,
    snoutH: 0.5,
    snoutL: 0.42,
    earW: 0.3,
    earH: 0.34,
    earL: 0.22,
    earSplay: 0.8,
    legW: 0.46,
    legUpper: 0.72,
    legLower: 0.68,
    legSpreadX: 0.52,
    legSpreadZ: 0.9,
    tailW: 0.24,
    tailLen: 1.0,
    tailDroop: 0.7,
  },
  /** Cow, panda: heavy barrel, thick legs, low head. */
  heavy: {
    bodyW: 1.65,
    bodyH: 1.6,
    bodyL: 2.8,
    neckW: 1.0,
    neckLen: 0.85,
    neckTilt: 0.6,
    headW: 1.05,
    headH: 1.0,
    headL: 1.05,
    snoutW: 0.85,
    snoutH: 0.6,
    snoutL: 0.5,
    earW: 0.32,
    earH: 0.34,
    earL: 0.26,
    earSplay: 0.9,
    legW: 0.55,
    legUpper: 0.88,
    legLower: 0.82,
    legSpreadX: 0.6,
    legSpreadZ: 0.95,
    tailW: 0.26,
    tailLen: 0.9,
    tailDroop: 1.2,
  },
} as const satisfies Record<string, AnimalShape>;

/**
 * The roster, in stand order along the lobby wall.
 *
 * The ladder of `speedPerStep` and `winsRequired` reproduces the reference
 * art's stands: +2 at one Win, +4 at three, then the curve steepens sharply so
 * that each animal is a real jump rather than the next rung.
 */
export const ANIMALS: readonly AnimalDefinition[] = [
  {
    id: 'deer',
    name: 'Deer',
    slot: 1,
    winsRequired: 0,
    speedPerStep: 1,
    moveBonus: 1,
    jumpBonus: 1,
    scale: 1,
    riderOffset: { x: 0, y: 2.24, z: -0.25 },
    strideLength: 2.6,
    shape: BUILD.hoofed,
    palette: {
      body: 0xe0812c,
      belly: 0xf7ddbd,
      hoof: 0x4a331f,
      hair: 0x8b4f1c,
      accent: 0xf2b6e8,
      saddle: 0xb06a2a,
    },
    features: ['antlers', 'spots', 'tailTuft'],
  },
  {
    id: 'llama',
    name: 'Llama',
    slot: 2,
    winsRequired: 1,
    speedPerStep: 2,
    moveBonus: 1.04,
    jumpBonus: 1,
    scale: 1.02,
    riderOffset: { x: 0, y: 1.92, z: -0.25 },
    strideLength: 2.3,
    shape: BUILD.stocky,
    palette: {
      body: 0x9d6b45,
      belly: 0xdcbb96,
      hoof: 0x4a3626,
      hair: 0x7a5133,
      accent: 0xe8c4a0,
      saddle: 0x8d5a2c,
    },
    features: ['wool', 'tailTuft'],
  },
  {
    id: 'donkey',
    name: 'Donkey',
    slot: 3,
    winsRequired: 3,
    speedPerStep: 4,
    moveBonus: 1.08,
    jumpBonus: 1.02,
    scale: 1.02,
    riderOffset: { x: 0, y: 1.92, z: -0.25 },
    strideLength: 2.35,
    shape: BUILD.stocky,
    palette: {
      body: 0x8e93a6,
      belly: 0xd8dce6,
      hoof: 0x3f4350,
      hair: 0x555a6b,
      accent: 0xb9bece,
      saddle: 0x7a5f45,
    },
    features: ['mane', 'tailTuft'],
  },
  {
    id: 'lion',
    name: 'Lion',
    slot: 4,
    winsRequired: 10,
    speedPerStep: 7,
    moveBonus: 1.14,
    jumpBonus: 1.06,
    scale: 1.04,
    riderOffset: { x: 0, y: 1.69, z: -0.25 },
    strideLength: 2.5,
    shape: BUILD.cat,
    palette: {
      body: 0xefa63d,
      belly: 0xf8dfaa,
      hoof: 0x6b4a21,
      hair: 0xb96a1c,
      accent: 0xd98a2a,
      saddle: 0x8c5222,
    },
    features: ['lionMane', 'tailTuft'],
  },
  {
    id: 'cow',
    name: 'Cow',
    slot: 5,
    winsRequired: 100,
    speedPerStep: 25,
    moveBonus: 1.2,
    jumpBonus: 1.04,
    scale: 1.06,
    riderOffset: { x: 0, y: 2.29, z: -0.25 },
    strideLength: 2.5,
    shape: BUILD.heavy,
    palette: {
      body: 0xf4f4f4,
      belly: 0xffffff,
      hoof: 0x3a3a42,
      hair: 0x2c2c33,
      accent: 0x24242b,
      saddle: 0xa5622c,
    },
    features: ['patches', 'cowHorns', 'tailTuft'],
  },
  {
    id: 'panda',
    name: 'Panda',
    slot: 6,
    winsRequired: 500,
    speedPerStep: 50,
    moveBonus: 1.28,
    jumpBonus: 1.08,
    scale: 1.08,
    riderOffset: { x: 0, y: 2.29, z: -0.25 },
    strideLength: 2.4,
    shape: BUILD.heavy,
    palette: {
      body: 0xfbfbfb,
      belly: 0xffffff,
      hoof: 0x1c1c22,
      hair: 0x1c1c22,
      accent: 0x1c1c22,
      saddle: 0x8f5a2c,
    },
    features: ['pandaMarks', 'patches'],
  },
  {
    id: 'unicorn',
    name: 'Unicorn',
    slot: 7,
    winsRequired: 2500,
    speedPerStep: 175,
    moveBonus: 1.4,
    jumpBonus: 1.14,
    scale: 1.06,
    riderOffset: { x: 0, y: 2.24, z: -0.25 },
    strideLength: 2.7,
    shape: BUILD.hoofed,
    palette: {
      body: 0xfdfbff,
      belly: 0xffffff,
      hoof: 0xd6b6ff,
      hair: 0xd07ae8,
      accent: 0xffd85e,
      saddle: 0xa26bd8,
    },
    features: ['horn', 'mane', 'tailTuft'],
  },
  {
    id: 'horse',
    name: 'Horse',
    slot: 8,
    winsRequired: 12000,
    speedPerStep: 375,
    moveBonus: 1.55,
    jumpBonus: 1.1,
    scale: 1.06,
    riderOffset: { x: 0, y: 2.24, z: -0.25 },
    strideLength: 2.8,
    shape: BUILD.hoofed,
    palette: {
      body: 0x8a5a30,
      belly: 0xc39466,
      hoof: 0x3d2b1a,
      hair: 0x3a2413,
      accent: 0xf2ede4,
      saddle: 0x5d3c1e,
    },
    features: ['mane', 'tailTuft'],
  },
  {
    id: 'zebra',
    name: 'Zebra',
    slot: 9,
    winsRequired: 60000,
    speedPerStep: 500,
    moveBonus: 1.7,
    jumpBonus: 1.12,
    scale: 1.06,
    riderOffset: { x: 0, y: 2.24, z: -0.25 },
    strideLength: 2.8,
    shape: BUILD.hoofed,
    palette: {
      body: 0xf6f6f6,
      belly: 0xffffff,
      hoof: 0x2a2a30,
      hair: 0x22222a,
      accent: 0x22222a,
      saddle: 0x6d4a24,
    },
    features: ['stripes', 'mane', 'tailTuft'],
  },
  {
    id: 'dragon',
    name: 'Dragon',
    slot: 10,
    winsRequired: 250000,
    speedPerStep: 2000,
    moveBonus: 2.1,
    jumpBonus: 1.3,
    scale: 1.1,
    riderOffset: { x: 0, y: 1.69, z: -0.25 },
    strideLength: 3,
    shape: BUILD.cat,
    palette: {
      body: 0xd8342c,
      belly: 0xf6b45a,
      hoof: 0x2f1414,
      hair: 0xffd24a,
      accent: 0xa01c1c,
      saddle: 0x5a2020,
    },
    features: ['wings', 'cowHorns', 'stripes'],
  },
];

/** Slot -> definition. Built once; slots are contiguous from 1. */
const BY_SLOT: ReadonlyMap<number, AnimalDefinition> = new Map(
  ANIMALS.map((animal) => [animal.slot, animal]),
);

/** The animal every player starts on. Free, and the only one owned at join. */
export const STARTER_ANIMAL_SLOT = 1;

/**
 * The animal in a slot, or the starter when the slot is unknown.
 *
 * Never throws: a slot arriving from a save file or a stale client must
 * degrade to the starter rather than take a room down.
 */
export const animalForSlot = (slot: number): AnimalDefinition => {
  const found = BY_SLOT.get(Math.floor(slot));
  if (found) return found;
  return BY_SLOT.get(STARTER_ANIMAL_SLOT) as AnimalDefinition;
};

/** Bit for one slot in the owned-animals mask. Slot 1 is bit 0. */
export const animalBit = (slot: number): number => 1 << (Math.floor(slot) - 1);

/** True when `ownedMask` includes this slot. */
export const ownsAnimal = (ownedMask: number, slot: number): boolean =>
  (ownedMask & animalBit(slot)) !== 0;

/** The owned mask a brand new profile starts with. */
export const INITIAL_OWNED_ANIMALS = animalBit(STARTER_ANIMAL_SLOT);

/**
 * The best animal a mask owns.
 *
 * "Best" is by `speedPerStep`, which is the ladder the stands are ordered by,
 * so equipping the best owned can never be a downgrade after a purchase.
 */
export const bestOwnedAnimal = (ownedMask: number): AnimalDefinition => {
  let best = animalForSlot(STARTER_ANIMAL_SLOT);
  for (const animal of ANIMALS) {
    if (!ownsAnimal(ownedMask, animal.slot)) continue;
    if (animal.speedPerStep > best.speedPerStep) best = animal;
  }
  return best;
};

