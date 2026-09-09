/**
 * The palette, taken from the reference art.
 *
 * COLOUR ONLY. Every world coordinate lives in `@animal/shared`'s course
 * config, so this file can be re-themed without moving a single collider.
 *
 * The look is toy-brick: flat saturated colour, a stud pattern on the ground,
 * salmon-pink brick walls capped with green hedge, and clean silhouettes. No
 * PBR, no roughness maps, no image files - every texture is drawn on a canvas
 * at runtime, so the whole style costs nothing against the 12 MB budget.
 */
export const PALETTE = {
  /** The green studded course floor - the single most-seen colour. */
  grass: '#3fc424',
  grassStud: '#4ddc31',
  /** The lobby floor: the same green, a shade deeper so the run reads apart. */
  lobbyGrass: '#39b41f',
  lobbyGrassStud: '#47cc2b',

  /** Salmon-pink brick walls that box the whole course in. */
  wall: '#ef8380',
  wallDark: '#e2726f',
  wallSpeck: 'rgba(150,60,60,0.16)',

  /** Green hedge capping every wall, with drips down the face. */
  hedge: 0x3fae27,
  hedgeDark: 0x2f8d1c,

  /** Raised brown blocks and the wooden plank bridges. */
  wood: '#7d4c36',
  woodDark: '#6a3f2c',
  woodSpeck: 'rgba(40,20,12,0.35)',

  /** Full-height pillars: the same brick as the walls, a shade darker. */
  pillar: 0xd9706c,
  pillarTop: 0x3fae27,

  /** The lavender rolling hazards. */
  hazard: 0xb3a4e6,
  hazardRim: 0x8f7ecb,

  /** Gold chequered finish pad. */
  winPad: '#ff9d1f',
  winPadAlt: '#ffc247',

  /** White chevrons on a green strip - the "go this way" marker. */
  chevron: 0xffffff,
  boostStrip: 0x4fd634,

  /** Animal display stands in the lobby. */
  standBase: 0xc7c3e2,
  standTop: 0xffd54a,
  standLocked: 0x8e8aa8,

  /** Blocky trees: a brown-pink trunk under flat canopy plates. */
  trunk: 0xa9605a,
  canopyA: 0x45c22b,
  canopyB: 0x33a81d,

  /** Weathered stone: the ruins of stage 5, and the elephant's own grey. */
  ruin: 0xb9b4cf,
  ruinDark: 0x9a95b4,

  /** Quicksand: the bottom of the sinking stages. */
  quicksand: '#c9a24a',
  quicksandDark: '#a8802f',

  /** The pit floor under the whole world, so a fall has a bottom. */
  pitFloor: 0x5c4a3a,

  /** The training deck, its belts and its frames. */
  deck: '#7a4a33',
  deckDark: '#633b28',
  treadmillFrame: 0xf6c343,
  treadmillFrameDark: 0xc9971f,
  /*
   * The belt is DARK, and deliberately so. A belt the same green as the lobby
   * floor reads as a hole in the frame from the front, which is half of why
   * the first machines looked like platforms. Dark rubber under a gold frame,
   * with bright chevrons travelling over it, is what makes it a treadmill.
   */
  treadmillBelt: 0x2b3a33,
  /** The console screen: dark, so the gold frame reads as machinery. */
  treadmillScreen: 0x27323d,

  /** A platform about to sink flashes toward this. */
  sinkingWarn: 0xff6b4a,

  /* ---- The later stages -------------------------------------------------
   * Each stage past the ruins gets its own material rather than a recolour of
   * the corridor, because a twenty-stage run through one green tunnel would
   * read as one very long stage. They are all the same toy-brick treatment:
   * flat colour, a drawn texture, no PBR anywhere.
   */

  /** Ice: pale blue with a brighter frost. Stage 7. */
  ice: '#a9dcf2',
  iceStud: '#d5f1fb',

  /** Cold grey rock: cliffs, temple masonry, the stones over the lava. */
  stone: '#9aa4ad',
  stoneDark: '#7d868f',

  /** Felled logs, a warmer brown than the plank bridges. */
  log: '#8a5a34',
  logDark: '#6f4726',

  /** Painted machinery: crusher frames, hammer hubs, wind-tunnel posts. */
  metal: 0xc2c9d2,
  metalDark: 0x8b939d,

  /** Lava. Bright, and the one thing in the world that emits light. */
  lava: '#ff6a1e',
  lavaDark: '#c02f08',
  /** Water, at the bottom of the cliffs. */
  water: '#3f9fe0',
  waterDark: '#2b78b4',

  /** Boulders, and the rocks that fall out of the sky. */
  rock: 0x8d8577,
  rockDark: 0x6f6a5f,

  /** A torch flame, and the tornado funnels. */
  flame: 0xffb32e,
  tornado: 0xcfd8e4,

  /** The warning patch under something that is about to land on you. */
  impactWarn: 0x2a2f36,

  /* ---- The scoreboards on the spawn wall --------------------------------
   * Lavender masonry around a pale panel, as in the reference art. The board
   * is meant to read as part of the room rather than as a screen hung in it,
   * so the frame is the same family of stone the ruins are built from.
   */
  boardFrame: 0xb0a8d4,
  boardFrameDark: 0x8e86b4,
  boardPanel: '#cfd0ea',
  boardPanelEdge: '#a9a8ce',
  boardStripe: 'rgba(255, 255, 255, 0.28)',
  /** Dark ink for the header and every outline on the board. */
  boardInk: '#2b2740',
  boardHeading: '#3a3457',
  boardName: '#ffffff',
  boardValue: '#ffd53d',

  /** Sky, and the fog matched to its bright band just above the horizon. */
  sky: 0x63bff5,
  fog: 0x9fdcff,
  /** Blocky clouds. Two tones, so a cluster has a lit top and a shaded base. */
  cloud: 0xffffff,
  cloudShade: 0xd8e8f7,
} as const;

/** Fog band. Far enough back that a fast player never rides into the wall. */
export const WORLD_FOG = {
  near: 260,
  far: 900,
} as const;

/** How far apart the decorative trees stand along the corridor. */
export const SCENERY = {
  /** Distance between tree clusters along Z. */
  treeSpacingZ: 34,
  /** How far outside the corridor the trees sit. */
  treeOffsetX: 19,
  /** Trunk height range. */
  trunkMin: 7,
  trunkMax: 12,
} as const;

/**
 * Yaw correction for the supplied player FBX.
 *
 * player.fbx already faces +Z; the offset exists so a re-authored model can be
 * corrected without touching gameplay code.
 */
export const PLAYER_MODEL_YAW_OFFSET = 0;
