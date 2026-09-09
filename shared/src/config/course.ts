import type { Aabb } from '../types/math.js';
import { totalSpeedToReach } from './speed.js';

/**
 * The world, as pure data.
 *
 * Everything the player can stand on, bump into or be killed by is defined
 * here, and both the renderer and the authoritative server read the same
 * arrays. There are no world coordinates anywhere else - a platform the client
 * draws but the server does not know about is the one bug this file exists to
 * make impossible.
 *
 * The world is LINEAR along +Z: a wide starting arena, then eight stages.
 * Stages 1-5 are authored by hand because each has its own mechanic; 6-8 are
 * generated from the pattern vocabulary so the ladder is complete and the
 * architecture is proven to extend.
 */

/** What a solid is for. Presentation reads this; the simulation does not. */
export type SolidKind =
  /** The green studded course floor. */
  | 'floor'
  /** The starting arena's floor. */
  | 'lobby'
  /** The raised wooden deck of the training area. */
  | 'training'
  /** A raised brown block to hop onto or over. */
  | 'block'
  /** A wooden platform or plank bridge. */
  | 'plank'
  /** A full-height pillar to weave around. */
  | 'pillar'
  /** Weathered stone: the ruins of stage 5. */
  | 'ruin'
  /** The small win pad at the right of a stage's end. */
  | 'winPad'
  /** A chevron speed strip. */
  | 'boost'
  /** An animal display stand. */
  | 'stand'
  /** A platform that periodically sinks. Rendered with a warning shake. */
  | 'sinking'
  /** Pale blue ice. Slippery, via the surface region laid over it. */
  | 'ice'
  /** Cold grey rock: cliffs, temple masonry, the lava stage's steppers. */
  | 'stone'
  /** A felled log, laid as a walkway. */
  | 'log'
  /** Painted machinery: crusher frames and the rails they run in. */
  | 'metal';

/** One axis-aligned solid. */
export interface CourseSolid extends Aabb {
  readonly kind: SolidKind;
  /** Stage this belongs to; -1 for the starting arena. */
  readonly stage: number;
}

/**
 * A solid that rises and sinks as a pure function of TIME.
 *
 * Both sides evaluate `sinkingOffsetAt`, so a platform is in the same place on
 * every machine with nothing replicated and nothing to forge. The cycle is
 * deliberately four-part - up, warning shake, sunk, rising - because a
 * platform that vanished without warning would be a coin flip rather than a
 * decision.
 */
export interface SinkingSolid extends CourseSolid {
  /** Seconds for one complete up-warn-down-up cycle. */
  readonly cycle: number;
  /** Offset into the cycle, so a field of platforms is never in lockstep. */
  readonly phase: number;
  /** Seconds of the cycle spent fully up and steady. */
  readonly steady: number;
  /** Seconds of visible shaking before it drops. */
  readonly warn: number;
  /** Seconds spent out of reach at the bottom. */
  readonly sunk: number;
  /** How far it drops. Far enough to be genuinely gone. */
  readonly depth: number;
}

/**
 * A pit of quicksand.
 *
 * The bottom of the world in the sinking-platform stages. `surfaceY` is where
 * the sand is drawn and `deathY` is barely below it, so falling in reads as
 * being swallowed rather than as a long drop into nothing.
 */
export interface QuicksandRegion {
  readonly stage: number;
  /**
   * What the pit is made of. PRESENTATION ONLY.
   *
   * Sand, lava and water kill identically and by the same rule; the difference
   * is what the player is looking at while it happens, which is the whole
   * reason three stages can share one mechanic without reading as one stage
   * built three times.
   */
  readonly surface: 'sand' | 'lava' | 'water';
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly surfaceY: number;
  readonly deathY: number;
}

/** How a hazard moves. */
export type HazardKind =
  /** Sweeps side to side across the corridor. */
  | 'sweeper'
  /** Rolls down the corridor toward the player, then recycles to the top. */
  | 'roller'
  /**
   * Orbits a fixed centre in the horizontal plane.
   *
   * The workhorse of the later stages: a rolling log, a spinning arm and a
   * swinging hammer are all this, at different radii and rates. Several placed
   * at one centre with stepped radii make a BAR rather than a ball, which is
   * how a hammer head and its shaft are drawn without any new physics.
   */
  | 'spinner'
  /**
   * Falls from above onto a fixed spot, rests, and rises again.
   *
   * Falling rocks and overhead crushers are the same hazard: the difference is
   * how far it falls and how long it waits. It hovers for most of its cycle so
   * the shadow underneath is a real warning rather than a formality.
   */
  | 'faller'
  /** Orbits like a spinner, drawn as a tall column of wind. */
  | 'tornado';

/**
 * A killer.
 *
 * Position is a pure function of TIME, so the server evaluates it from its own
 * clock and the client from the replicated one. There is no hazard state to
 * replicate and nothing for a client to assert.
 */
export interface CourseHazard {
  readonly kind: HazardKind;
  readonly stage: number;
  /** Centre of the sweep, or the lane a roller runs down. */
  readonly x: number;
  readonly y: number;
  /** Resting Z for a sweeper; ignored by a roller, which uses from/to. */
  readonly z: number;
  readonly radius: number;
  /**
   * Sweeper: half-amplitude in X.
   * Spinner / tornado: orbit radius about (`x`, `z`).
   * Faller: how far above `y` it hovers before it drops.
   * Roller: unused.
   */
  readonly sweep: number;
  /**
   * Sweeper / spinner / tornado: radians per second.
   * Roller: units per second down the lane.
   * Faller: seconds for one complete hover-fall-rest-rise cycle.
   */
  readonly rate: number;
  /** Offset so a row of hazards is never in lockstep. */
  readonly phase: number;
  /** Roller: the Z it starts from (the far end) and rolls toward. */
  readonly fromZ: number;
  readonly toZ: number;
}

/** Scenery the client draws and the simulation ignores. */
export type DecorationKind =
  /** A blocky tree: trunk plus stacked canopy plates. */
  | 'tree'
  /**
   * A tree canopy sitting at platform height with NO solid under it.
   *
   * The trap of stage 4: it reads as somewhere to land and is not.
   */
  | 'falseFloor'
  /** A ruined arch: two uprights and a lintel. Its solids are separate. */
  | 'arch'
  /** A blocky cloud cluster, high above the world. */
  | 'cloud'
  /** A blocky boulder. Scenery in the forest and on the cliffs. */
  | 'rock'
  /** A sheet of falling water down a cliff face. */
  | 'waterfall'
  /** A temple torch: a post with a flame on top. */
  | 'torch';

export interface Decoration {
  readonly kind: DecorationKind;
  readonly stage: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  readonly rotationY: number;
}

/**
 * A patch of ground that changes how the mount HANDLES on it.
 *
 * Two stages need this and they are the same mechanic pointed in different
 * directions: the ice run lowers `grip` so a gallop keeps its momentum through
 * a turn, and the wind tunnel adds a constant `windX` that has to be leaned
 * into. Both are read by `stepPlayer` itself, so the server's simulation and
 * the client's prediction cannot handle differently - which for a surface
 * whose whole point is the feel of the controls is the difference between a
 * stage and a rubber-banding mess.
 */
export interface SurfaceRegion {
  readonly stage: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /**
   * Multiplier on ground acceleration AND braking, 1 being normal ground.
   *
   * Below 1 is ice: slower to speed up, far slower to stop or turn. It scales
   * both, deliberately - lowering only the braking would make ice a place
   * where the mount is simply harder to stop, rather than one where it is
   * harder to steer.
   */
  readonly grip: number;
  /** Constant sideways push, world units per second squared. */
  readonly windX: number;
  /** Constant push along the course. Negative holds the player back. */
  readonly windZ: number;
}

/**
 * A stretch of world that is WIDER than the running corridor.
 *
 * The starting arena is one by definition; the ruins are the other. Movement
 * clamps to whatever this says, the floor is laid at the same width, and the
 * renderer builds its walls from the same list - so a wide area cannot end up
 * with a floor and a boundary that disagree.
 */
export interface WideArea {
  readonly minZ: number;
  readonly maxZ: number;
  readonly halfWidth: number;
}

/** One stage. */
export interface StageDefinition {
  /** 1-based, as shown on the gate. */
  readonly index: number;
  readonly name: string;
  readonly difficulty: string;
  /** Advisory only - shown on the gate, never enforced. */
  readonly recommendedLevel: number;
  /**
   * Lifetime Speed the recommended level corresponds to.
   *
   * DERIVED from `recommendedLevel` through the same curve the player actually
   * levels on, never authored beside it. A hand-written figure here would be
   * free to drift into advertising a Speed total that does not correspond to
   * the level printed next to it, and the gate shows both.
   */
  readonly recommendedSpeed: number;
  readonly startZ: number;
  readonly endZ: number;
  /** Centre of the small win pad at the right of the stage end. */
  readonly winPadX: number;
  readonly winPadZ: number;
  /** Wins awarded for reaching it. */
  readonly winReward: number;
}

/** Global world metrics. */
export const COURSE = {
  /**
   * Half-width of the running corridor.
   *
   * Every lateral position in the stages is expressed as a FRACTION of this
   * (see `lane`), so widening the world moves the obstacles with it instead of
   * leaving them clustered down the middle of a wider floor.
   */
  halfWidth: 32,
  /** Top of the course floor. Everything is measured from here. */
  floorY: 0,
  /** Thickness of a floor slab, so a slab has an underside to head-butt. */
  floorThickness: 4,
  /** Height of the pink side walls. Visual; the X clamp is what holds. */
  wallHeight: 30,

  /**
   * The bottom of the world.
   *
   * A REAL surface, drawn under the whole map. Without it a fall shows the
   * underside of the course and an infinite void, which is what makes a world
   * look unfinished; with it, falling reads as dropping into a pit that was
   * always there.
   */
  pitFloorY: -22,

  /** Starting arena footprint. Deliberately large enough for a full room. */
  lobbyHalfWidth: 58,
  lobbyStartZ: -112,
  lobbyEndZ: 0,

  /** Bridge from one stage's end to the next stage's run-up. */
  stageGap: 26,
  /** How many stages exist. */
  stageCount: 20,
} as const;

/**
 * Every stage, in one table.
 *
 * Name, difficulty word and recommended level for all twenty, so tuning the
 * ladder is editing rows here rather than hunting through builders. The
 * recommended SPEED is deliberately absent: it is derived from the level
 * through the same curve the player actually levels on (see `STAGE_TUNING`),
 * because a hand-written speed figure is free to drift into advertising a
 * total that does not correspond to the level beside it.
 */
interface StageTuning {
  readonly name: string;
  readonly difficulty: string;
  /**
   * Level the stage is built around.
   *
   * The ramp is smooth and it respects the rebirth ladder: the level cap is
   * 25 per rebirth, so stage 5 at 19 is inside a first run, stage 10 at 58
   * wants two rebirths, and stage 20 at 120 wants four. Nothing here asks for
   * a level the ladder cannot reach.
   */
  readonly recommendedLevel: number;
}

const STAGE_TUNING: readonly StageTuning[] = [
  { name: 'Meadow Hops', difficulty: 'EASY', recommendedLevel: 1 },
  { name: 'Rolling Corridor', difficulty: 'EASY', recommendedLevel: 4 },
  { name: 'Sinking Sands', difficulty: 'EASY', recommendedLevel: 8 },
  { name: 'Hidden Grove', difficulty: 'NORMAL', recommendedLevel: 13 },
  { name: 'Ancient Ruins', difficulty: 'NORMAL', recommendedLevel: 19 },
  { name: 'Moving Logs', difficulty: 'NORMAL', recommendedLevel: 26 },
  { name: 'Ice Run', difficulty: 'NORMAL', recommendedLevel: 33 },
  { name: 'Falling Rocks', difficulty: 'HARD', recommendedLevel: 41 },
  { name: 'Lava Steppers', difficulty: 'HARD', recommendedLevel: 49 },
  { name: 'Spinning Arena', difficulty: 'HARD', recommendedLevel: 58 },
  { name: 'Wind Tunnel', difficulty: 'HARD', recommendedLevel: 66 },
  { name: 'Crusher Hall', difficulty: 'INSANE', recommendedLevel: 74 },
  { name: 'Vanishing Bridge', difficulty: 'INSANE', recommendedLevel: 82 },
  { name: 'Giant Hammers', difficulty: 'INSANE', recommendedLevel: 89 },
  { name: 'Forest Run', difficulty: 'INSANE', recommendedLevel: 96 },
  { name: 'Waterfall Cliffs', difficulty: 'INSANE', recommendedLevel: 103 },
  { name: 'Tornado Arena', difficulty: 'NIGHTMARE', recommendedLevel: 108 },
  { name: 'Ancient Temple', difficulty: 'NIGHTMARE', recommendedLevel: 112 },
  { name: 'Chaos Run', difficulty: 'NIGHTMARE', recommendedLevel: 116 },
  { name: 'Final Arena', difficulty: 'NIGHTMARE', recommendedLevel: 120 },
];

/**
 * Wins per stage, as specified.
 *
 * The ONE place a stage reward is written. Anything past the table continues
 * the same roughly-doubling curve, so stage nine needs no edit here.
 */
const STAGE_REWARDS = [
  1, 3, 8, 20, 50, 120, 200, 400,
  // Nine onward continues the same accelerating curve. Never flat, and never
  // a step down: a later stage that paid less than an earlier one would make
  // the whole ladder something to farm backwards.
  700, 1200, 2000, 3200, 5000, 8000, 12_000, 18_000, 27_000, 40_000, 60_000,
  90_000,
] as const;

export const stageReward = (index: number): number => {
  const at = Math.max(1, Math.floor(index));
  const authored = STAGE_REWARDS[at - 1];
  if (authored !== undefined) return authored;
  const last = STAGE_REWARDS[STAGE_REWARDS.length - 1] as number;
  return Math.round(last * 2 ** (at - STAGE_REWARDS.length));
};

/** The win pad: small, rectangular, and at the RIGHT of the stage end. */
export const WIN_PAD = {
  width: 11,
  length: 11,
  /** Distance in from the right-hand wall. */
  insetX: 11,
  /** How far it stands proud of the floor, so it reads as a pad. */
  height: 0.35,
} as const;

/** First stage begins exactly where the arena floor ends. */
const FIRST_STAGE_Z: number = COURSE.lobbyEndZ;

const solids: CourseSolid[] = [];
const wideAreas: WideArea[] = [];
const sinking: SinkingSolid[] = [];
const quicksand: QuicksandRegion[] = [];
const hazards: CourseHazard[] = [];
const decorations: Decoration[] = [];
const surfaces: SurfaceRegion[] = [];
const stages: StageDefinition[] = [];

/**
 * A lateral position, as a fraction of the corridor's half-width.
 *
 * Every obstacle offset in this file goes through here. That is what makes the
 * world's width one number to change: authoring `-6.5` would have left the
 * planks huddled in the middle the moment the corridor got wider.
 */
const lane = (fraction: number): number => COURSE.halfWidth * fraction;

/** Push a floor slab spanning the full corridor, or a given half-width. */
const pushFloor = (
  stage: number,
  fromZ: number,
  toZ: number,
  kind: SolidKind = 'floor',
  topY: number = COURSE.floorY,
  halfWidth: number = COURSE.halfWidth,
): void => {
  if (toZ <= fromZ) return;
  solids.push({
    minX: -halfWidth,
    maxX: halfWidth,
    minY: topY - COURSE.floorThickness,
    maxY: topY,
    minZ: fromZ,
    maxZ: toZ,
    kind,
    stage,
  });
};

/** Push an arbitrary box, given its centre and size. */
const pushBox = (
  stage: number,
  kind: SolidKind,
  centreX: number,
  baseY: number,
  centreZ: number,
  width: number,
  height: number,
  length: number,
): void => {
  solids.push({
    minX: centreX - width / 2,
    maxX: centreX + width / 2,
    minY: baseY,
    maxY: baseY + height,
    minZ: centreZ - length / 2,
    maxZ: centreZ + length / 2,
    kind,
    stage,
  });
};

/**
 * Floor for a stage that is WIDER than the corridor, and the boundary to go
 * with it.
 *
 * One call, because these two facts must never be written separately: a floor
 * laid at 54 with a clamp still at 32 is a room the player cannot walk into,
 * and a clamp at 54 with a floor at 32 is a room they fall out of.
 */
const markWide = (fromZ: number, toZ: number, halfWidth: number): void => {
  wideAreas.push({ minZ: fromZ, maxZ: toZ, halfWidth });
};

const pushWideFloor = (
  stage: number,
  fromZ: number,
  toZ: number,
  halfWidth: number,
  kind: SolidKind = 'floor',
  topY: number = COURSE.floorY,
): void => {
  pushFloor(stage, fromZ, toZ, kind, topY, halfWidth);
  markWide(fromZ, toZ, halfWidth);
};

/**
 * A rotating arm: a row of hazard balls stepped out along one radius.
 *
 * Each ball orbits the same centre at the same rate with the same phase, so
 * together they sweep as one rigid bar - which is what a log, a spinner arm
 * and a hammer all are. Built from the existing orbit rather than from a new
 * "bar" primitive, so there is still exactly one hazard shape to test against
 * and the whole thing stays a pure function of time.
 *
 * @param inner first radius to place a ball at, so a hub can be left clear
 */
const pushSpinArm = (
  stage: number,
  kind: HazardKind,
  centreX: number,
  centreZ: number,
  y: number,
  inner: number,
  outer: number,
  ballRadius: number,
  rate: number,
  phase: number,
): void => {
  // Spaced by a little under a diameter, so the arm is continuous and a mount
  // can never thread between two balls of the same bar.
  const step = ballRadius * 1.5;
  for (let r = inner; r <= outer + 0.01; r += step) {
    hazards.push({
      kind,
      stage,
      x: centreX,
      y,
      z: centreZ,
      radius: ballRadius,
      sweep: r,
      rate,
      phase,
      fromZ: 0,
      toZ: 0,
    });
  }
};

/** One thing that falls out of the sky onto a fixed spot and comes back. */
const pushFaller = (
  stage: number,
  x: number,
  z: number,
  radius: number,
  height: number,
  period: number,
  phase: number,
): void => {
  hazards.push({
    kind: 'faller',
    stage,
    x,
    // Resting height: sitting ON the floor, so the impact lands where the
    // shadow was rather than a body-length above it.
    y: COURSE.floorY + radius,
    z,
    radius,
    sweep: height,
    rate: period,
    phase,
    fromZ: 0,
    toZ: 0,
  });
};

/** A patch of ground that handles differently. Ice, or wind. */
const pushSurface = (
  stage: number,
  fromZ: number,
  toZ: number,
  halfWidth: number,
  grip: number,
  windX = 0,
  windZ = 0,
): void => {
  surfaces.push({
    stage,
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: fromZ,
    maxZ: toZ,
    grip,
    windX,
    windZ,
  });
};

// ---------------------------------------------------------------------------
// The starting arena.
//
// Left: the animal line-up. Centre: open ground. Right: the training deck.
// Back: deliberately empty, so it stays a wall rather than becoming a third
// feature area.
// ---------------------------------------------------------------------------

solids.push({
  minX: -COURSE.lobbyHalfWidth,
  maxX: COURSE.lobbyHalfWidth,
  minY: COURSE.floorY - COURSE.floorThickness,
  maxY: COURSE.floorY,
  minZ: COURSE.lobbyStartZ,
  maxZ: COURSE.lobbyEndZ,
  kind: 'lobby',
  stage: -1,
});

/**
 * The animal line-up, down the player's LEFT wall.
 *
 * That wall is at +X, not -X. The camera looks down +Z and its right is
 * `(-cos yaw, sin yaw)`, which at yaw 0 is world -X - so the player's left
 * hand points at +X. Authoring this at -44 put the whole line-up on the wrong
 * side of the room.
 *
 * A column along Z rather than a row along X: the arena is far deeper than it
 * is wide, and a row would have run straight across the middle of the space
 * the players are meant to gather in.
 */
export const STAND_ROW = {
  /** X of every stand. */
  x: 44,
  /** Z of the first stand, and the spacing down the wall. */
  firstZ: -96,
  spacingZ: 9.5,
  width: 6.5,
  length: 6.5,
  height: 0.6,
  /** How close the player must be to claim. */
  claimRadius: 3.6,
} as const;

/** Centre of the stand for a 1-based animal slot. */
export const standZ = (slot: number): number =>
  STAND_ROW.firstZ + (Math.floor(slot) - 1) * STAND_ROW.spacingZ;

/**
 * The training deck, on the RIGHT of the arena.
 *
 * Three identical treadmills. Identical is the point: they are a place to farm
 * Speed while chatting, not a ladder, so there is nothing to choose between
 * them and no reason to queue for one.
 */
export const TRAINING = {
  /** Raised wooden deck footprint, on the player's RIGHT - which is -X. */
  minX: -56,
  maxX: -20,
  minZ: -92,
  maxZ: -26,
  /** Deck top. A shallow step, inside the simulation's landing tolerance. */
  deckY: 0.6,

  /**
   * Belt footprint.
   *
   * The belt runs along X, NOT along Z. A treadmill faces the way its runner
   * does, and the runner is meant to face the spawn point in the middle of the
   * arena - which from the deck on the left wall is +X. The three machines are
   * then spaced along Z, standing in a row against the wall.
   */
  beltLength: 17,
  beltWidth: 9,
  /** Walkable height of a belt above the deck. */
  beltHeight: 0.5,
  /** X of every belt's centre. They all face the same way. */
  centerX: -40,
  /** Z of the first belt, and the spacing down the row. */
  firstZ: -76,
  spacingZ: 17,
  /** How many belts. All identical. */
  count: 3,

  /**
   * Speed multiplier while running on a belt.
   *
   * Matches the "x3" the reference art labels its training machines with.
   */
  multiplier: 3,
  /**
   * Belt speed, in world units per second.
   *
   * A treadmill has no position delta to measure, so the BELT supplies the
   * distance and it flows through the identical per-stride formula. That is
   * why a treadmill needs no progression path of its own.
   */
  beltSpeed: 26,
} as const;

/** Centre Z of a 1-based treadmill index. They share one X. */
export const treadmillZ = (index: number): number =>
  TRAINING.firstZ + (Math.floor(index) - 1) * TRAINING.spacingZ;

/** Walkable height of every treadmill belt. */
export const TREADMILL_BELT_Y = TRAINING.deckY + TRAINING.beltHeight;

/** Nobody is on a treadmill. */
export const NO_TREADMILL = 0;

/**
 * Which treadmill a position is standing on, or 0.
 *
 * Derived from position ALONE, by both sides, every step. There is no
 * treadmill message: walking on starts it and walking off stops it, so there
 * is nothing for a client to claim and nothing to keep after stepping off.
 */
export const treadmillAt = (x: number, y: number, z: number): number => {
  if (y < TREADMILL_BELT_Y - 1.2 || y > TREADMILL_BELT_Y + 3) return NO_TREADMILL;
  // The belt runs along X and the row runs along Z, so the shared axis is X.
  if (Math.abs(x - TRAINING.centerX) > TRAINING.beltLength / 2) return NO_TREADMILL;
  for (let i = 1; i <= TRAINING.count; i += 1) {
    if (Math.abs(z - treadmillZ(i)) <= TRAINING.beltWidth / 2) return i;
  }
  return NO_TREADMILL;
};

// The training deck and its three belts are real solids, so the player rides
// onto them the same way they ride onto anything else.
solids.push({
  minX: TRAINING.minX,
  maxX: TRAINING.maxX,
  minY: COURSE.floorY - COURSE.floorThickness,
  maxY: TRAINING.deckY,
  minZ: TRAINING.minZ,
  maxZ: TRAINING.maxZ,
  kind: 'training',
  stage: -1,
});

for (let i = 1; i <= TRAINING.count; i += 1) {
  pushBox(
    -1,
    'training',
    TRAINING.centerX,
    TRAINING.deckY,
    treadmillZ(i),
    TRAINING.beltLength,
    TRAINING.beltHeight,
    TRAINING.beltWidth,
  );
}

// The animal stands.
for (let slot = 1; slot <= 10; slot += 1) {
  pushBox(
    -1,
    'stand',
    STAND_ROW.x,
    COURSE.floorY,
    standZ(slot),
    STAND_ROW.width,
    STAND_ROW.height,
    STAND_ROW.length,
  );
}

// ---------------------------------------------------------------------------
// The stages.
// ---------------------------------------------------------------------------

/** Solid floor at the start of every stage, to land and re-aim on. */
const START_RUNWAY = 22;

/** Solid floor leading to the finish. */
const FINISH_APRON = 26;

/**
 * Stage 1: platforms close together with small gaps.
 *
 * The gaps are short on purpose - short enough that a fast player simply RUNS
 * across them. A 4-unit gap at 24 units/second drops the mount two thirds of a
 * unit, which is past the landing tolerance and therefore a jump; the same gap
 * at 60 units/second drops it a tenth of a unit, which lands. Getting faster
 * is what turns this stage from a hopping section into a straight sprint, and
 * that is the whole lesson of the first stage.
 */
const buildMeadowHops = (stage: number, z: number): number => {
  const island = 11;
  const gap = 4;
  let at = z;
  for (let i = 0; i < 9; i += 1) {
    pushFloor(stage, at, at + island);
    // A low kerb every third island, so the section is not entirely flat.
    //
    // Deliberately UNDER `MOVEMENT.stepHeight`: stage one's promise is that a
    // fast player runs the whole thing, and a bump tall enough to stop a mount
    // dead would break that however small it looks.
    if (i % 3 === 2) {
      const side = i % 2 === 0 ? 1 : -1;
      pushBox(stage, 'block', side * lane(0.4), COURSE.floorY, at + island / 2, lane(0.5), 0.8, 5);
    }
    at += island + gap;
  }
  return at - gap;
};

/**
 * Stage 2: an elevated corridor with a ball rolling down it.
 *
 * The centre lane is where the ball runs; the wooden platforms zigzag along
 * the sides and are where the player waits it out. The lane is raised well
 * above the surrounding ground so the whole thing reads as a gantry rather
 * than as a stripe painted on the floor.
 */
const ROLLING = {
  deckY: 9,
  /** Half-width of the lane the balls run down. */
  laneHalfWidth: 9,
  ledgeWidth: 12,
  ledgeLength: 11,
  ledgeSpacing: 15,
  ballRadius: 5.4,
  ballSpeed: 15,
} as const;

/**
 * A flight of steps between two heights.
 *
 * Each riser is inside `MOVEMENT.stepHeight`, so the mount rides straight up
 * without jumping. A single tall box would be a WALL - the simulation steps
 * over a kerb, not over a storey - which is exactly what a nine-unit "ramp"
 * turned out to be.
 *
 * @returns the Z the flight ends at
 */
const pushSteps = (
  stage: number,
  fromZ: number,
  fromY: number,
  toY: number,
  width: number,
): number => {
  const rise = 0.72;
  const tread = 2.4;
  const count = Math.max(1, Math.ceil(Math.abs(toY - fromY) / rise));
  for (let i = 0; i < count; i += 1) {
    /*
     * Each step is a solid block up from the pit, so the flight reads as built
     * rather than as a row of floating slabs.
     *
     * ONE formula for both directions, because a flight of stairs is the same
     * object whichever way you walk it: the step nearest `fromZ` is one riser
     * from `fromY`, and the far one arrives at `toY`. The descent used to have
     * its own expression that indexed from the wrong end, which built stage
     * 2's exit staircase back to front - a nine-unit drop off the gantry, and
     * a nine-unit wall where it met the next stage.
     */
    const top = fromY + ((i + 1) / count) * (toY - fromY);
    pushBox(
      stage,
      'plank',
      0,
      COURSE.floorY - COURSE.floorThickness,
      fromZ + tread / 2 + i * tread,
      width,
      top - (COURSE.floorY - COURSE.floorThickness),
      tread,
    );
  }
  return fromZ + count * tread;
};

const buildRollingCorridor = (stage: number, z: number): number => {
  const width = ROLLING.laneHalfWidth * 2;

  // Up onto the gantry on a flight of steps.
  const top = pushSteps(stage, z, COURSE.floorY, ROLLING.deckY, width);
  z = top;

  const length = ROLLING.ledgeSpacing * 8;
  const endZ = z + length;

  solids.push({
    minX: -ROLLING.laneHalfWidth,
    maxX: ROLLING.laneHalfWidth,
    minY: ROLLING.deckY - 1.2,
    maxY: ROLLING.deckY,
    minZ: z,
    maxZ: endZ,
    kind: 'plank',
    stage,
  });

  // Side ledges, alternating. Each is a place to stand while the ball goes by.
  for (let i = 0; i < 8; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const at = z + 6 + i * ROLLING.ledgeSpacing;
    pushBox(
      stage,
      'plank',
      side * (ROLLING.laneHalfWidth + ROLLING.ledgeWidth / 2 - 0.4),
      ROLLING.deckY - 1.2,
      at,
      ROLLING.ledgeWidth,
      1.2,
      ROLLING.ledgeLength,
    );
  }

  // The ball. Two of them, half a lap apart, so the lane is never quiet for
  // long but never blocked either.
  for (let i = 0; i < 2; i += 1) {
    hazards.push({
      kind: 'roller',
      stage,
      x: 0,
      y: ROLLING.deckY + ROLLING.ballRadius,
      z: 0,
      radius: ROLLING.ballRadius,
      sweep: 0,
      rate: ROLLING.ballSpeed,
      phase: (i * length) / 2,
      fromZ: endZ,
      toZ: z - 6,
    });
  }

  // And back down at the far end.
  return pushSteps(stage, endZ, ROLLING.deckY, COURSE.floorY, width);
};

/**
 * Stage 3: a quicksand pit crossed on platforms, some of which sink.
 *
 * Every OTHER platform in a row is fixed. That is what keeps the section
 * playable however the cycles line up - there is always a route, even if it is
 * not the quick one.
 */
const SANDS = {
  surfaceY: -5,
  deathY: -3,
  platform: 8.5,
  rowSpacing: 12,
  rows: 9,
} as const;

/**
 * Five lanes rather than three.
 *
 * A wider pit with the same three lanes would just be a narrow path with a lot
 * of sand either side; the extra lanes are what turn the width into choices.
 */
const SANDS_LANES = [-0.62, -0.31, 0, 0.31, 0.62] as const;

const buildSinkingSands = (stage: number, z: number): number => {
  const length = SANDS.rows * SANDS.rowSpacing + 8;
  quicksand.push({
    stage,
    surface: 'sand',
    minX: -COURSE.halfWidth,
    maxX: COURSE.halfWidth,
    minZ: z,
    maxZ: z + length,
    surfaceY: SANDS.surfaceY,
    deathY: SANDS.deathY,
  });

  for (let row = 0; row < SANDS.rows; row += 1) {
    const at = z + 6 + row * SANDS.rowSpacing;
    for (let i = 0; i < SANDS_LANES.length; i += 1) {
      const at_x = lane(SANDS_LANES[i] as number);
      // Alternating by row AND lane, and never the whole row: at least two
      // platforms in every row are fixed, so a route always exists.
      const sinks = (row + i) % 2 === 0 && i !== 2;

      if (!sinks) {
        pushBox(stage, 'plank', at_x, COURSE.floorY - 0.8, at, SANDS.platform, 0.8, SANDS.platform);
        continue;
      }

      sinking.push({
        minX: at_x - SANDS.platform / 2,
        maxX: at_x + SANDS.platform / 2,
        minY: COURSE.floorY - 0.8,
        maxY: COURSE.floorY,
        minZ: at - SANDS.platform / 2,
        maxZ: at + SANDS.platform / 2,
        kind: 'sinking',
        stage,
        cycle: 7.5,
        // Spread by row AND lane, so a whole row never goes at once.
        phase: (row * 2.3 + i * 1.7) % 7.5,
        steady: 3.4,
        warn: 1.1,
        sunk: 1.8,
        depth: 7,
      });
    }
  }

  return z + length;
};

/**
 * Stage 4: real wooden platforms among tree canopies that only look like them.
 *
 * The trap is drawn by `falseFloor` decorations, which have NO solid at all.
 * The distinction is deliberately a material one - planks against leaves - so
 * it is readable if the player looks, and missable if they do not.
 */
const GROVE = {
  surfaceY: -5,
  deathY: -3,
  platform: 8,
  rowSpacing: 13,
  rows: 8,
} as const;

/** Five lanes across the wider pit, as in the sands. */
const GROVE_LANES = [-0.62, -0.31, 0, 0.31, 0.62] as const;

const buildHiddenGrove = (stage: number, z: number): number => {
  const length = GROVE.rows * GROVE.rowSpacing + 8;
  quicksand.push({
    stage,
    surface: 'sand',
    minX: -COURSE.halfWidth,
    maxX: COURSE.halfWidth,
    minZ: z,
    maxZ: z + length,
    surfaceY: GROVE.surfaceY,
    deathY: GROVE.deathY,
  });

  for (let row = 0; row < GROVE.rows; row += 1) {
    const at = z + 6 + row * GROVE.rowSpacing;
    // A deterministic "safe lane" per row - every row has at least one, so the
    // section is a reading test rather than a guessing game.
    const safe = (row * 3 + 1) % GROVE_LANES.length;

    for (let i = 0; i < GROVE_LANES.length; i += 1) {
      const at_x = lane(GROVE_LANES[i] as number);
      if (i === safe || (row + i) % 3 === 0) {
        pushBox(stage, 'plank', at_x, COURSE.floorY - 0.7, at, GROVE.platform, 0.7, GROVE.platform);
      } else {
        decorations.push({
          kind: 'falseFloor',
          stage,
          x: at_x,
          y: COURSE.floorY - 0.35,
          z: at,
          scale: GROVE.platform / 7,
          rotationY: ((row + i) % 4) * 0.4,
        });
      }
    }

    // Real trees behind the row, so the false floors have somewhere to belong.
    if (row % 2 === 0) {
      decorations.push({
        kind: 'tree',
        stage,
        x: (row % 4 === 0 ? -1 : 1) * (COURSE.halfWidth - 4),
        y: GROVE.surfaceY,
        z: at,
        scale: 1.1,
        rotationY: row * 0.7,
      });
    }
  }

  return z + length;
};

/**
 * Stage 5: open ruins with an elephant in them.
 *
 * Solid ground throughout, because the danger here is the elephant rather than
 * the floor. The arches are cover: something to break the line between the
 * player and a charging animal.
 */
const RUINS = {
  /**
   * Half-width of the ruins arena.
   *
   * Comparable to the starting arena's 58: entering stage 5 should feel like
   * walking into a room, not into another lane. The elephant needs the space
   * as much as the player does - a chase down a corridor is a corridor, and it
   * spends the whole time wedged against the geometry.
   */
  halfWidth: 54,
  /** How far the arena runs along Z. */
  length: 250,
  archRows: 5,
  pillarWidth: 5,
  pillarHeight: 13,
  archSpan: 16,
} as const;

/**
 * The ruins arena, filled in by the builder below.
 *
 * Exported so the elephant's territory is derived from the same rectangle the
 * floor is laid on, rather than authored twice and left to drift.
 */
export const RUINS_ARENA = { minZ: 0, maxZ: 0, halfWidth: RUINS.halfWidth };

/** One ruined arch: two uprights and a lintel. Three boxes, not a mesh. */
const pushArch = (stage: number, centreX: number, atZ: number): void => {
  for (const offset of [-RUINS.archSpan / 2, RUINS.archSpan / 2]) {
    pushBox(
      stage,
      'ruin',
      centreX + offset,
      COURSE.floorY,
      atZ,
      RUINS.pillarWidth,
      RUINS.pillarHeight,
      RUINS.pillarWidth,
    );
  }
  pushBox(
    stage,
    'ruin',
    centreX,
    COURSE.floorY + RUINS.pillarHeight,
    atZ,
    RUINS.archSpan + RUINS.pillarWidth,
    2.6,
    RUINS.pillarWidth,
  );
  decorations.push({
    kind: 'arch',
    stage,
    x: centreX,
    y: COURSE.floorY,
    z: atZ,
    scale: 1,
    rotationY: 0,
  });
};

const buildAncientRuins = (stage: number, z: number): number => {
  const endZ = z + RUINS.length;

  // A floor as wide as the arena, and the boundary to match it. Both come from
  // the same rectangle, so the player can never be clamped over open air.
  pushFloor(stage, z, endZ, 'floor', COURSE.floorY, RUINS.halfWidth);
  RUINS_ARENA.minZ = z;
  RUINS_ARENA.maxZ = endZ;
  markWide(z, endZ, RUINS.halfWidth);

  // Arches in staggered rows across the whole width. Cover to break the line
  // between the player and a charging animal, with wide lanes left between
  // them so neither ever gets wedged.
  const rowSpacing = RUINS.length / (RUINS.archRows + 1);
  for (let row = 0; row < RUINS.archRows; row += 1) {
    const atZ = z + rowSpacing * (row + 1);
    // Four arches per row, offset every other row so no straight corridor
    // runs the length of the arena.
    const stagger = row % 2 === 0 ? 0 : RUINS.halfWidth * 0.24;
    for (const fraction of [-0.72, -0.24, 0.24, 0.72]) {
      pushArch(stage, RUINS.halfWidth * fraction + stagger, atZ);
    }
    // Fallen blocks between the rows, for silhouette and for cover at ground
    // level where the arches are all overhead.
    for (const fraction of [-0.5, 0.1, 0.62]) {
      pushBox(
        stage,
        'ruin',
        RUINS.halfWidth * fraction - stagger,
        COURSE.floorY,
        atZ + rowSpacing * 0.45,
        7,
        2.6,
        7,
      );
    }
  }

  return endZ;
};

/**
 * Stages 6-8: the pattern vocabulary from the generated course.
 *
 * Kept because it is proven and because it is what makes "add another stage"
 * a one-line change. The authored stages above are the mechanics; these are
 * the endurance run.
 */
type PatternId = 'gap' | 'planks' | 'blocks' | 'pillars' | 'sweepers' | 'steps';

const PATTERNS: readonly PatternId[] = [
  'gap',
  'blocks',
  'planks',
  'sweepers',
  'steps',
  'pillars',
];

const buildPattern = (
  pattern: PatternId,
  stage: number,
  stageIndex: number,
  z: number,
): number => {
  const ramp = 1 + stageIndex * 0.1;

  switch (pattern) {
    case 'gap':
      return z + Math.min(11 * ramp, 20);
    case 'planks': {
      const length = 26;
      // Three bridges across the wider gap, so the crossing is a choice.
      for (const at of [-0.55, 0, 0.55]) {
        pushBox(stage, 'plank', lane(at), COURSE.floorY - 0.5, z + length / 2, 4.6, 0.5, length);
      }
      return z + length;
    }
    case 'blocks': {
      const length = 28;
      pushFloor(stage, z, z + length);
      const height = 2.2;
      const width = lane(0.42);
      pushBox(stage, 'block', -lane(0.45), COURSE.floorY, z + 6, width, height, 5);
      pushBox(stage, 'block', lane(0.45), COURSE.floorY, z + 15, width, height, 5);
      pushBox(stage, 'block', -lane(0.12), COURSE.floorY, z + 23, width, height, 5);
      return z + length;
    }
    case 'pillars': {
      const length = 32;
      pushFloor(stage, z, z + length);
      // Two staggered columns of pillars, so the wider floor is still a maze.
      for (let i = 0; i < 6; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        pushBox(stage, 'pillar', side * lane(0.22), COURSE.floorY, z + 5 + i * 5, 6, 10, 6);
        pushBox(stage, 'pillar', side * lane(0.68), COURSE.floorY, z + 8 + i * 5, 6, 10, 6);
      }
      return z + length;
    }
    case 'sweepers': {
      const length = 32;
      pushFloor(stage, z, z + length);
      for (let i = 0; i < 3; i += 1) {
        hazards.push({
          kind: 'sweeper',
          stage,
          x: 0,
          y: COURSE.floorY + 2.8,
          z: z + 8 + i * 9,
          radius: 3.4,
          sweep: COURSE.halfWidth - 4,
          rate: (0.9 + stageIndex * 0.1) * (i % 2 === 0 ? 1 : -1),
          phase: i * 1.9,
          fromZ: 0,
          toZ: 0,
        });
      }
      return z + length;
    }
    case 'steps': {
      const island = 10;
      const gap = Math.min(9 * ramp, 17);
      let at = z + gap;
      pushFloor(stage, at, at + island);
      at += island + gap;
      pushFloor(stage, at, at + island);
      return at + island;
    }
    default:
      return z;
  }
};

// ---------------------------------------------------------------------------
// Stages 6-20.
//
// Each has ONE idea, and every one of them is built from the primitives the
// first five established: a floor, a box, an orbiting hazard, a falling
// hazard, a platform that sinks, a pit that kills, a patch of ground that
// handles differently. Nothing below adds physics - that is what keeps fifteen
// stages from becoming fifteen special cases in the simulation.
// ---------------------------------------------------------------------------

/**
 * Stage 6: logs sweeping across a chain of islands.
 *
 * The first stage where something is actively trying to remove the player
 * rather than simply not being there. The islands are wide and the gaps are
 * short, so the difficulty is entirely the timing of the crossing - and a
 * faster mount crosses in fewer sweeps, which is the first time raw Speed
 * makes a stage easier rather than harder.
 */
const buildMovingLogs = (stage: number, z: number): number => {
  const half = 42;
  const island = 32;
  const gap = 9;
  const count = 5;
  const endZ = z + count * island + (count - 1) * gap;
  markWide(z, endZ, half);

  let at = z;
  for (let i = 0; i < count; i += 1) {
    pushFloor(stage, at, at + island, 'log', COURSE.floorY, half);
    const mid = at + island / 2;

    // Two logs per island, turning opposite ways, so there is no single rhythm
    // to learn - the safe line moves across the island as they pass each other.
    for (const side of [-1, 1]) {
      pushSpinArm(
        stage,
        'spinner',
        side * half * 0.44,
        mid,
        COURSE.floorY + 2.4,
        3,
        16,
        2.6,
        side * (0.8 + i * 0.07),
        i * 1.3 + (side > 0 ? 0 : 1.7),
      );
      // The stump each log turns on, so it is anchored to something.
      pushBox(stage, 'log', side * half * 0.44, COURSE.floorY, mid, 4, 1.6, 4);
    }

    for (const fraction of [-0.85, 0.85]) {
      decorations.push({
        kind: 'rock',
        stage,
        x: half * fraction,
        y: COURSE.floorY,
        z: mid + island * 0.2,
        scale: 1.2,
        rotationY: i * 0.8,
      });
    }
    at += island + gap;
  }
  return endZ;
};

/**
 * Stage 7: ice.
 *
 * The only stage that changes how the controls feel, and it does it through
 * `SurfaceRegion` rather than through anything stage-specific in the
 * simulation. Grip is low enough that a gallop carries through a turn and a
 * stop takes planning, and the rest pads are ordinary ground - somewhere to
 * gather yourself is what stops low grip being merely unfair.
 */
const buildIceRun = (stage: number, z: number): number => {
  const slab = 26;
  const gap = 7;
  const count = 6;
  let at = z;

  for (let i = 0; i < count; i += 1) {
    pushFloor(stage, at, at + slab, 'ice');

    // Rest pads FIRST: `surfaceAt` returns the first region containing a
    // point, so the specific patch has to be pushed before the sheet of ice
    // that covers it, or the ice would answer for both.
    if (i % 2 === 1) {
      const padZ = at + slab * 0.5;
      pushBox(stage, 'stone', lane(0.62), COURSE.floorY, padZ, lane(0.5), 0.7, 12);
      surfaces.push({
        stage,
        minX: lane(0.62) - lane(0.25),
        maxX: lane(0.62) + lane(0.25),
        minZ: padZ - 6,
        maxZ: padZ + 6,
        grip: 1,
        windX: 0,
        windZ: 0,
      });
    }

    // Blocks to steer around. On ice, a block is a commitment made early.
    const side = i % 2 === 0 ? -1 : 1;
    pushBox(stage, 'stone', side * lane(0.3), COURSE.floorY, at + slab * 0.35, lane(0.36), 2.4, 6);
    pushBox(stage, 'stone', -side * lane(0.66), COURSE.floorY, at + slab * 0.72, lane(0.3), 2.4, 6);

    pushSurface(stage, at, at + slab, COURSE.halfWidth, 0.3);
    at += slab + gap;
  }
  return at - gap;
};

/**
 * Stage 8: rocks falling out of the sky.
 *
 * Solid ground throughout - the danger is entirely overhead, so the stage is
 * about reading warnings while moving rather than about where to put your
 * feet. Each rock hovers for more than half its cycle before it drops, which
 * is what makes the shadow underneath a warning instead of a formality.
 */
const buildFallingRocks = (stage: number, z: number): number => {
  const half = 40;
  const length = 210;
  const endZ = z + length;
  markWide(z, endZ, half);
  pushFloor(stage, z, endZ, 'floor', COURSE.floorY, half);

  const rows = 9;
  const lanes = [-0.72, -0.36, 0, 0.36, 0.72];
  for (let row = 0; row < rows; row += 1) {
    const atZ = z + 14 + row * ((length - 24) / (rows - 1));
    for (let i = 0; i < lanes.length; i += 1) {
      // One lane per row never fires, and it walks across the stage row by
      // row - so there is always a way through and it is always somewhere
      // else. Standing still is the only thing that is reliably fatal.
      if ((row + i) % lanes.length === 0) continue;
      pushFaller(
        stage,
        half * (lanes[i] as number),
        atZ,
        3.4,
        30,
        3.4,
        (row * 1.9 + i * 0.7) % 3.4,
      );
    }
  }

  for (let i = 0; i < 6; i += 1) {
    decorations.push({
      kind: 'rock',
      stage,
      x: (i % 2 === 0 ? -1 : 1) * (half - 5),
      y: COURSE.floorY,
      z: z + 20 + i * 32,
      scale: 1.5,
      rotationY: i,
    });
  }
  return endZ;
};

/**
 * Stage 9: stepping stones over lava.
 *
 * Mechanically the sinking sands again, and deliberately so - it is the same
 * lesson at four times the speed, over something that looks nothing like sand.
 * The fixed stones are stone-coloured and the sinking ones sink; the tell is
 * the warning shake, exactly as it was in stage 3.
 */
const buildLavaSteppers = (stage: number, z: number): number => {
  const rows = 11;
  const spacing = 13;
  const platform = 8;
  const length = rows * spacing + 10;

  quicksand.push({
    stage,
    surface: 'lava',
    minX: -COURSE.halfWidth,
    maxX: COURSE.halfWidth,
    minZ: z,
    maxZ: z + length,
    surfaceY: -4,
    deathY: -2.2,
  });

  const lanes = [-0.66, -0.33, 0, 0.33, 0.66];
  for (let row = 0; row < rows; row += 1) {
    const atZ = z + 7 + row * spacing;
    for (let i = 0; i < lanes.length; i += 1) {
      const atX = lane(lanes[i] as number);
      // Two fixed stones per row minimum, as in the sands: a row that could
      // sink entirely would be a coin flip rather than a decision.
      const sinks = (row + i) % 3 !== 0;
      if (!sinks) {
        pushBox(stage, 'stone', atX, COURSE.floorY - 0.9, atZ, platform, 0.9, platform);
        continue;
      }
      sinking.push({
        minX: atX - platform / 2,
        maxX: atX + platform / 2,
        minY: COURSE.floorY - 0.9,
        maxY: COURSE.floorY,
        minZ: atZ - platform / 2,
        maxZ: atZ + platform / 2,
        kind: 'sinking',
        stage,
        cycle: 6,
        phase: (row * 1.7 + i * 2.1) % 6,
        steady: 2.6,
        warn: 0.9,
        sunk: 1.5,
        depth: 7,
      });
    }
  }
  return z + length;
};

/**
 * Stage 10: an arena of spinning arms.
 *
 * Open ground and nothing to fall into: the whole stage is the arms. They run
 * at different radii and different rates on purpose, so the gaps between them
 * drift in and out of alignment and the route through has to be re-read on
 * every crossing rather than memorised once.
 */
const buildSpinningArena = (stage: number, z: number): number => {
  const half = 48;
  const length = 230;
  const endZ = z + length;
  markWide(z, endZ, half);
  pushFloor(stage, z, endZ, 'floor', COURSE.floorY, half);

  // Hub fraction, position along the stage, arm reach, rate. Each hub sits
  // close enough to the centreline that |hub| + reach + ball stays inside the
  // arena: an arm turns a full circle, so its far side is what has to fit.
  const arms: readonly (readonly [number, number, number, number])[] = [
    [-0.3, 0.13, 20, 0.85],
    [0.3, 0.3, 24, -0.62],
    [-0.25, 0.5, 22, 0.72],
    [0.28, 0.68, 26, -0.5],
    [0, 0.86, 28, 0.95],
  ];

  for (let i = 0; i < arms.length; i += 1) {
    const [fx, fz, reach, rate] = arms[i] as readonly [number, number, number, number];
    const cx = half * fx;
    const cz = z + length * fz;
    pushSpinArm(stage, 'spinner', cx, cz, COURSE.floorY + 2.6, 5, reach, 2.8, rate, i * 1.2);
    // The arm turns about a real hub, so it is attached to the world.
    pushBox(stage, 'pillar', cx, COURSE.floorY, cz, 5, 7, 5);
  }
  return endZ;
};

/**
 * Stage 11: a high walkway in a crosswind.
 *
 * The wind is a constant sideways acceleration on the SIMULATION, not a camera
 * shake, so it has to be leaned into - and it reverses between sections, which
 * means the lean has to be re-aimed rather than held. There is no floor under
 * the walkway: wind is only frightening if it can put you somewhere there is
 * nothing.
 */
const buildWindTunnel = (stage: number, z: number): number => {
  const deckY = 11;
  const walkway = 15;
  const sections = 6;
  const sectionLength = 34;
  const gap = 7;

  let at = pushSteps(stage, z, COURSE.floorY, deckY, walkway + 6);

  for (let i = 0; i < sections; i += 1) {
    pushBox(stage, 'plank', 0, deckY - 1.2, at + sectionLength / 2, walkway, 1.2, sectionLength);

    // Alternating crosswind, and a little of it against the run so the section
    // cannot simply be sprinted through.
    surfaces.push({
      stage,
      minX: -COURSE.halfWidth,
      maxX: COURSE.halfWidth,
      minZ: at,
      maxZ: at + sectionLength,
      grip: 0.85,
      windX: (i % 2 === 0 ? 1 : -1) * (16 + i * 1.6),
      windZ: -4,
    });

    // A post at the windward end of each section: cover, and a marker for
    // which way the next one blows.
    pushBox(
      stage,
      'metal',
      (i % 2 === 0 ? -1 : 1) * (walkway / 2 + 1.6),
      deckY - 1.2,
      at + sectionLength * 0.5,
      2.2,
      6,
      2.2,
    );
    at += sectionLength + gap;
  }

  return pushSteps(stage, at - gap, deckY, COURSE.floorY, walkway + 6);
};

/**
 * Stage 12: crushers.
 *
 * The falling rocks again, arranged instead of scattered: each row is a wall
 * of them with exactly one lane left open, and the open lane moves one place
 * along per row. That turns the stage from "dodge" into "read the next row
 * while crossing this one", which is the difference between a timing stage and
 * a reaction stage.
 */
const buildCrusherHall = (stage: number, z: number): number => {
  const rows = 10;
  const spacing = 20;
  const length = rows * spacing + 20;
  const endZ = z + length;
  pushFloor(stage, z, endZ);

  const lanes = [-0.75, -0.375, 0, 0.375, 0.75];
  for (let row = 0; row < rows; row += 1) {
    const atZ = z + 16 + row * spacing;
    const open = row % lanes.length;
    for (let i = 0; i < lanes.length; i += 1) {
      if (i === open) continue;
      pushFaller(stage, lane(lanes[i] as number), atZ, 4.2, 20, 3, (row * 0.8) % 3);
    }
    // The frame the row runs in, either side of the corridor.
    for (const side of [-1, 1]) {
      pushBox(stage, 'metal', side * (COURSE.halfWidth - 2), COURSE.floorY, atZ, 4, 16, 6);
    }
  }
  return endZ;
};

/**
 * Stage 13: a bridge that is not always there.
 *
 * Three lanes of short sections, phased a third of a cycle apart, so at every
 * moment at least one lane ahead is solid and the route is a diagonal the
 * player has to keep re-choosing. Nothing under it but the pit.
 */
const buildVanishingBridge = (stage: number, z: number): number => {
  const sections = 22;
  const sectionLength = 9;
  const step = 10.5;
  const length = sections * step + 8;
  const lanes = [-0.42, 0, 0.42];

  for (let i = 0; i < sections; i += 1) {
    const atZ = z + 6 + i * step;
    for (let l = 0; l < lanes.length; l += 1) {
      const atX = lane(lanes[l] as number);
      sinking.push({
        minX: atX - 7,
        maxX: atX + 7,
        minY: COURSE.floorY - 0.7,
        maxY: COURSE.floorY,
        minZ: atZ - sectionLength / 2,
        maxZ: atZ + sectionLength / 2,
        kind: 'sinking',
        stage,
        cycle: 4.5,
        // A third of a cycle between lanes, and a nudge per section, so the
        // solid route is always a moving diagonal rather than a moving stripe.
        phase: (l * 1.5 + i * 0.55) % 4.5,
        steady: 2.2,
        warn: 0.7,
        sunk: 1,
        depth: 12,
      });
    }
  }
  return z + length;
};

/**
 * Stage 14: hammers.
 *
 * Long arms, slow, and far enough apart that each is a separate decision. The
 * arms are longer than the corridor is wide on purpose: there is no standing
 * at the edge and waiting, and the gap has to be taken as it comes round.
 */
const buildGiantHammers = (stage: number, z: number): number => {
  const half = 48;
  const count = 6;
  const spacing = 40;
  const length = count * spacing + 24;
  const endZ = z + length;
  markWide(z, endZ, half);
  pushFloor(stage, z, endZ, 'floor', COURSE.floorY, half);

  for (let i = 0; i < count; i += 1) {
    const atZ = z + 22 + i * spacing;
    const side = i % 2 === 0 ? -1 : 1;
    // Barely off the centreline: a hammer hub against the wall would put the
    // head straight through it on the far half of every turn.
    const cx = side * half * 0.19;
    const rate = side * (0.5 + i * 0.05);
    // The shaft, then a fatter head at the end of it.
    pushSpinArm(stage, 'spinner', cx, atZ, COURSE.floorY + 3.4, 6, 26, 3, rate, i * 1.4);
    pushSpinArm(stage, 'spinner', cx, atZ, COURSE.floorY + 3.4, 28, 32, 4.4, rate, i * 1.4);
    pushBox(stage, 'metal', cx, COURSE.floorY, atZ, 6, 9, 6);
  }
  return endZ;
};

/**
 * Stage 15: two ways through a wood.
 *
 * A wide, safe ground route around the outside and a raised plank route
 * straight up the middle that is much shorter and has gaps in it. The first
 * stage that is a ROUTE choice rather than an obstacle - and the fast route
 * only pays off for a mount quick enough to make the jumps, which is the
 * clearest the speed curve ever gets to be about level design.
 */
const buildForestRun = (stage: number, z: number): number => {
  const half = 44;
  const length = 220;
  const endZ = z + length;
  markWide(z, endZ, half);
  pushFloor(stage, z, endZ, 'floor', COURSE.floorY, half);

  // The fast route: a raised plank run with real gaps in it.
  const plankY = 6.5;
  let at = pushSteps(stage, z + 6, COURSE.floorY, plankY, 14);
  for (let i = 0; i < 7; i += 1) {
    pushBox(stage, 'plank', 0, plankY - 1, at + 11, 13, 1, 22);
    at += 22 + 9;
  }
  pushSteps(stage, at - 9, plankY, COURSE.floorY, 14);

  // The slow route: open ground either side, with logs turning across it.
  for (let i = 0; i < 5; i += 1) {
    const atZ = z + 24 + i * 42;
    const side = i % 2 === 0 ? -1 : 1;
    pushSpinArm(
      stage,
      'spinner',
      side * half * 0.52,
      atZ,
      COURSE.floorY + 2.2,
      4,
      15,
      2.6,
      side * 0.7,
      i * 1.1,
    );
    pushBox(stage, 'log', side * half * 0.52, COURSE.floorY, atZ, 4, 1.4, 4);
  }

  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    decorations.push({
      kind: 'tree',
      stage,
      x: side * half * (0.78 + (i % 3) * 0.07),
      y: COURSE.floorY,
      z: z + 12 + i * 15,
      scale: 1 + (i % 3) * 0.2,
      rotationY: i * 0.6,
    });
    if (i % 3 === 0) {
      decorations.push({
        kind: 'rock',
        stage,
        x: side * half * 0.42,
        y: COURSE.floorY,
        z: z + 20 + i * 15,
        scale: 1,
        rotationY: i,
      });
    }
  }
  return endZ;
};

/**
 * Stage 16: cliffs over water.
 *
 * Blocks at genuinely different heights, so for the first time the route is
 * vertical as well as forward. The height steps are kept small enough to jump
 * and large enough that they cannot be ridden over, which is the whole band a
 * platforming stage lives in.
 */
const buildWaterfallCliffs = (stage: number, z: number): number => {
  const half = 46;
  const rows = 12;
  const spacing = 17;
  const length = rows * spacing + 14;
  const endZ = z + length;
  markWide(z, endZ, half);

  quicksand.push({
    stage,
    surface: 'water',
    minX: -half,
    maxX: half,
    minZ: z,
    maxZ: endZ,
    surfaceY: -6,
    deathY: -3.5,
  });

  const lanes = [-0.62, -0.2, 0.2, 0.62];
  for (let row = 0; row < rows; row += 1) {
    const atZ = z + 9 + row * spacing;
    for (let i = 0; i < lanes.length; i += 1) {
      // A deterministic pair of ledges per row, at two different heights, so
      // there is always a route and it is always a choice of two.
      if ((row + i) % 4 === 2) continue;
      const height = 1.4 + ((row + i) % 3) * 1.6;
      pushBox(
        stage,
        'stone',
        half * (lanes[i] as number),
        COURSE.floorY - 4,
        atZ,
        13,
        height + 4,
        12,
      );
    }
    if (row % 3 === 0) {
      decorations.push({
        kind: 'waterfall',
        stage,
        x: (row % 6 === 0 ? -1 : 1) * (half - 2),
        y: COURSE.floorY + 12,
        z: atZ,
        scale: 1.4,
        rotationY: row % 6 === 0 ? Math.PI / 2 : -Math.PI / 2,
      });
    }
  }
  return endZ;
};

/**
 * Stage 17: tornadoes.
 *
 * Big slow circles across open ground. They are deliberately the most
 * PREDICTABLE hazard in the game - a wide orbit at a steady rate, visible from
 * the far end of the arena - because at this point in the ladder the mount is
 * fast enough that anything sudden would be unreadable rather than hard.
 */
const buildTornadoArena = (stage: number, z: number): number => {
  const half = 50;
  const length = 250;
  const endZ = z + length;
  markWide(z, endZ, half);
  pushFloor(stage, z, endZ, 'floor', COURSE.floorY, half);

  // Orbit centre, position along the stage, orbit radius, rate. As with every
  // arm in the game, |centre| + radius + the funnel's own radius has to fit
  // inside the arena, because an orbit comes all the way round.
  const paths: readonly (readonly [number, number, number, number])[] = [
    [-0.22, 0.16, 20, 0.42],
    [0.2, 0.36, 24, -0.34],
    [-0.15, 0.56, 22, 0.3],
    [0.22, 0.74, 20, -0.44],
    [0, 0.9, 26, 0.38],
  ];

  for (let i = 0; i < paths.length; i += 1) {
    const [fx, fz, reach, rate] = paths[i] as readonly [number, number, number, number];
    hazards.push({
      kind: 'tornado',
      stage,
      x: half * fx,
      y: COURSE.floorY + 7,
      z: z + length * fz,
      radius: 6.5,
      sweep: reach,
      rate,
      phase: i * 1.25,
      fromZ: 0,
      toZ: 0,
    });
  }

  // Blocks to shelter behind, which is what makes the orbits worth reading.
  for (let i = 0; i < 8; i += 1) {
    pushBox(
      stage,
      'stone',
      half * (i % 2 === 0 ? -0.7 : 0.7),
      COURSE.floorY,
      z + 18 + i * 28,
      12,
      4.5,
      10,
    );
  }
  return endZ;
};

/**
 * Stage 18: the temple.
 *
 * The ruins' masonry with traps in it: arches for cover, floor sections that
 * drop away, and a crusher in the doorway of every second bay. Deliberately
 * the same visual language as stage 5 - the ladder should arrive somewhere
 * familiar before its last two stages.
 */
const buildAncientTemple = (stage: number, z: number): number => {
  const half = 44;
  const bays = 7;
  const spacing = 34;
  const length = bays * spacing + 20;
  const endZ = z + length;
  markWide(z, endZ, half);

  // The trap bays are HOLES in the floor, not slabs laid on top of it.
  //
  // A sinking platform over solid ground is scenery: it drops, the floor
  // underneath does not, and the player stands there wondering what the fuss
  // was. So the floor is laid in bands between the traps, the trap bays keep
  // only their outer ledges, and the middle is genuinely open.
  const trapHalfZ = 11;
  const ledgeInner = 24;
  let laid = z;

  for (let bay = 0; bay < bays; bay += 1) {
    const atZ = z + 18 + bay * spacing;

    for (const fraction of [-0.62, 0, 0.62]) {
      pushArch(stage, half * fraction, atZ);
    }

    if (bay % 2 === 0) {
      // A crusher in the middle doorway.
      pushFaller(stage, 0, atZ, 5, 16, 2.8, bay * 0.9);
    } else {
      pushFloor(stage, laid, atZ - trapHalfZ, 'floor', COURSE.floorY, half);
      laid = atZ + trapHalfZ;

      // The long way round: a ledge down each side of the hole.
      for (const side of [-1, 1]) {
        pushBox(
          stage,
          'stone',
          side * ((ledgeInner + half) / 2),
          COURSE.floorY - 0.6,
          atZ,
          half - ledgeInner,
          0.6,
          trapHalfZ * 2,
        );
      }

      // The short way: two slabs that will not wait. Half a cycle apart, so
      // one of them is always up.
      for (let i = 0; i < 2; i += 1) {
        const atX = (i === 0 ? -1 : 1) * 11;
        sinking.push({
          minX: atX - 9,
          maxX: atX + 9,
          minY: COURSE.floorY - 0.6,
          maxY: COURSE.floorY,
          minZ: atZ - 9,
          maxZ: atZ + 9,
          kind: 'sinking',
          stage,
          cycle: 6,
          phase: (bay * 1.3 + i * 3) % 6,
          steady: 2.4,
          warn: 0.9,
          sunk: 1.2,
          depth: 9,
        });
      }
    }

    for (const side of [-1, 1]) {
      decorations.push({
        kind: 'torch',
        stage,
        x: side * (half - 4),
        y: COURSE.floorY,
        z: atZ,
        scale: 1,
        rotationY: 0,
      });
    }
  }
  pushFloor(stage, laid, endZ, 'floor', COURSE.floorY, half);
  return endZ;
};

/**
 * Stage 19: everything, in sequence.
 *
 * One stretch of each of the game's mechanics, back to back and at full pace.
 * It introduces nothing - that is the point of it. The reused `buildPattern`
 * segment at the end is the original generated vocabulary, which is exactly
 * the sort of thing this stage is meant to be made of.
 */
const buildChaosRun = (stage: number, z: number): number => {
  let at = z;

  // Ice into a spinner.
  pushFloor(stage, at, at + 40, 'ice');
  pushSurface(stage, at, at + 40, COURSE.halfWidth, 0.35);
  pushSpinArm(stage, 'spinner', 0, at + 22, COURSE.floorY + 2.6, 5, 24, 2.8, 0.9, 0);
  pushBox(stage, 'pillar', 0, COURSE.floorY, at + 22, 5, 7, 5);
  at += 40 + 8;

  // A vanishing section.
  for (let i = 0; i < 8; i += 1) {
    const atZ = at + 6 + i * 11;
    for (const fraction of [-0.42, 0, 0.42]) {
      const atX = lane(fraction);
      sinking.push({
        minX: atX - 7,
        maxX: atX + 7,
        minY: COURSE.floorY - 0.7,
        maxY: COURSE.floorY,
        minZ: atZ - 4.5,
        maxZ: atZ + 4.5,
        kind: 'sinking',
        stage,
        cycle: 4.2,
        phase: (fraction * 3 + i * 0.6 + 4.2) % 4.2,
        steady: 2,
        warn: 0.7,
        sunk: 0.9,
        depth: 12,
      });
    }
  }
  at += 8 * 11 + 10;

  // A rolling lane, at ground level this time.
  pushFloor(stage, at, at + 70);
  for (let i = 0; i < 2; i += 1) {
    hazards.push({
      kind: 'roller',
      stage,
      x: 0,
      y: COURSE.floorY + 5.4,
      z: 0,
      radius: 5.4,
      sweep: 0,
      rate: 26,
      phase: i * 35,
      fromZ: at + 70,
      toZ: at - 4,
    });
  }
  at += 70 + 8;

  at = buildPattern('pillars', stage, 12, at);
  pushFloor(stage, at, at + 12);
  at += 12;
  return buildPattern('sweepers', stage, 12, at);
};

/**
 * Stage 20: the final arena.
 *
 * Substantially bigger than anything before it and built in three movements: a
 * lava crossing on vanishing stones, an open arena carrying every hazard the
 * game has, and a last narrow run to the pad. No boss - this game's animal is
 * the elephant and it already has a stage; a second one here would be a
 * different game's ending.
 */
const buildFinalArena = (stage: number, z: number): number => {
  const half = 56;
  let at = z;

  // Movement one: across the lava on stones that will not wait.
  const crossing = 120;
  markWide(at, at + crossing, half);
  quicksand.push({
    stage,
    surface: 'lava',
    minX: -half,
    maxX: half,
    minZ: at,
    maxZ: at + crossing,
    surfaceY: -4,
    deathY: -2.2,
  });
  for (let row = 0; row < 9; row += 1) {
    const atZ = at + 8 + row * 13;
    for (const fraction of [-0.5, -0.17, 0.17, 0.5]) {
      const atX = half * fraction;
      if ((row + Math.round(fraction * 10) + 12) % 4 === 0) {
        pushBox(stage, 'stone', atX, COURSE.floorY - 0.9, atZ, 10, 0.9, 10);
        continue;
      }
      sinking.push({
        minX: atX - 5,
        maxX: atX + 5,
        minY: COURSE.floorY - 0.9,
        maxY: COURSE.floorY,
        minZ: atZ - 5,
        maxZ: atZ + 5,
        kind: 'sinking',
        stage,
        cycle: 5,
        phase: (row * 1.4 + fraction * 4 + 5) % 5,
        steady: 2.3,
        warn: 0.8,
        sunk: 1.1,
        depth: 8,
      });
    }
  }
  at += crossing;

  // Movement two: the arena itself.
  const arena = 260;
  markWide(at, at + arena, half);
  pushFloor(stage, at, at + arena, 'stone', COURSE.floorY, half);

  for (let i = 0; i < 4; i += 1) {
    const atZ = at + 34 + i * 62;
    const side = i % 2 === 0 ? -1 : 1;
    const rate = side * 0.62;
    const cx = side * half * 0.16;
    pushSpinArm(stage, 'spinner', cx, atZ, COURSE.floorY + 3.4, 6, 30, 3, rate, i * 1.4);
    pushSpinArm(stage, 'spinner', cx, atZ, COURSE.floorY + 3.4, 32, 38, 4.2, rate, i * 1.4);
    pushBox(stage, 'metal', cx, COURSE.floorY, atZ, 6, 9, 6);
  }

  for (let i = 0; i < 3; i += 1) {
    hazards.push({
      kind: 'tornado',
      stage,
      x: half * (i % 2 === 0 ? 0.2 : -0.2),
      y: COURSE.floorY + 7,
      z: at + 60 + i * 70,
      radius: 6.5,
      sweep: 26,
      rate: i % 2 === 0 ? 0.4 : -0.36,
      phase: i * 1.6,
      fromZ: 0,
      toZ: 0,
    });
  }

  for (let row = 0; row < 6; row += 1) {
    const atZ = at + 24 + row * 40;
    for (const fraction of [-0.75, -0.25, 0.25, 0.75]) {
      if ((row + Math.round(fraction * 4) + 8) % 4 === 0) continue;
      pushFaller(stage, half * fraction, atZ, 3.6, 26, 3.2, (row * 1.1 + fraction * 2 + 6) % 3.2);
    }
  }

  for (let i = 0; i < 10; i += 1) {
    decorations.push({
      kind: 'torch',
      stage,
      x: (i % 2 === 0 ? -1 : 1) * (half - 4),
      y: COURSE.floorY,
      z: at + 16 + i * 24,
      scale: 1.3,
      rotationY: 0,
    });
  }
  at += arena;

  // Movement three: the last run in, narrow again after all that room.
  const runIn = 70;
  pushFloor(stage, at, at + runIn);
  pushSpinArm(stage, 'spinner', 0, at + 24, COURSE.floorY + 2.8, 5, 26, 3, 1.05, 0);
  pushBox(stage, 'pillar', 0, COURSE.floorY, at + 24, 5, 7, 5);
  pushSpinArm(stage, 'spinner', 0, at + 52, COURSE.floorY + 2.8, 5, 26, 3, -1.05, 1.6);
  pushBox(stage, 'pillar', 0, COURSE.floorY, at + 52, 5, 7, 5);
  return at + runIn;
};

/** Running build cursor. Each stage begins exactly where the last one ended. */
let cursorZ: number = FIRST_STAGE_Z;

for (let stageIndex = 0; stageIndex < COURSE.stageCount; stageIndex += 1) {
  const tuning = STAGE_TUNING[
    Math.min(stageIndex, STAGE_TUNING.length - 1)
  ] as StageTuning;
  const startZ = cursorZ;
  let z = startZ;

  pushFloor(stageIndex, z, z + START_RUNWAY);
  // A chevron strip on the run-up: presentation for "this is where you go".
  pushBox(stageIndex, 'boost', 0, COURSE.floorY, startZ + 11, lane(0.62), 0.06, 16);
  z += START_RUNWAY;

  switch (stageIndex) {
    case 0:
      z = buildMeadowHops(stageIndex, z);
      break;
    case 1:
      z = buildRollingCorridor(stageIndex, z);
      break;
    case 2:
      z = buildSinkingSands(stageIndex, z);
      break;
    case 3:
      z = buildHiddenGrove(stageIndex, z);
      break;
    case 4:
      z = buildAncientRuins(stageIndex, z);
      break;
    case 5:
      z = buildMovingLogs(stageIndex, z);
      break;
    case 6:
      z = buildIceRun(stageIndex, z);
      break;
    case 7:
      z = buildFallingRocks(stageIndex, z);
      break;
    case 8:
      z = buildLavaSteppers(stageIndex, z);
      break;
    case 9:
      z = buildSpinningArena(stageIndex, z);
      break;
    case 10:
      z = buildWindTunnel(stageIndex, z);
      break;
    case 11:
      z = buildCrusherHall(stageIndex, z);
      break;
    case 12:
      z = buildVanishingBridge(stageIndex, z);
      break;
    case 13:
      z = buildGiantHammers(stageIndex, z);
      break;
    case 14:
      z = buildForestRun(stageIndex, z);
      break;
    case 15:
      z = buildWaterfallCliffs(stageIndex, z);
      break;
    case 16:
      z = buildTornadoArena(stageIndex, z);
      break;
    case 17:
      z = buildAncientTemple(stageIndex, z);
      break;
    case 18:
      z = buildChaosRun(stageIndex, z);
      break;
    default:
      z = buildFinalArena(stageIndex, z);
      break;
  }

  // The finish apron, and the small win pad at the player's RIGHT.
  //
  // That is NEGATIVE X. The camera looks down +Z and its right is
  // `(-cos yaw, sin yaw)`, which at yaw 0 is world -X - so a pad authored at
  // +10 sits on the player's left, however "right-hand" the number reads.
  pushFloor(stageIndex, z, z + FINISH_APRON);
  const winPadX = -(COURSE.halfWidth - WIN_PAD.insetX);
  const winPadZ = z + FINISH_APRON / 2;
  pushBox(
    stageIndex,
    'winPad',
    winPadX,
    COURSE.floorY,
    winPadZ,
    WIN_PAD.width,
    WIN_PAD.height,
    WIN_PAD.length,
  );
  z += FINISH_APRON;

  // The bridge across to the next stage's run-up.
  pushFloor(stageIndex, z, z + COURSE.stageGap);
  const endZ = z + COURSE.stageGap;
  cursorZ = endZ;

  stages.push({
    index: stageIndex + 1,
    name: tuning.name,
    difficulty: tuning.difficulty,
    recommendedLevel: tuning.recommendedLevel,
    recommendedSpeed: totalSpeedToReach(tuning.recommendedLevel),
    startZ,
    endZ,
    winPadX,
    winPadZ,
    winReward: stageReward(stageIndex + 1),
  });
}

/** Every static solid, arena included. */
export const COURSE_SOLIDS: readonly CourseSolid[] = solids;

/** Every platform that sinks. */
export const SINKING_SOLIDS: readonly SinkingSolid[] = sinking;

/** Every quicksand pit. */
export const QUICKSAND: readonly QuicksandRegion[] = quicksand;

/** Every hazard. */
export const COURSE_HAZARDS: readonly CourseHazard[] = hazards;

/** Every piece of scenery the simulation ignores. */
export const DECORATIONS: readonly Decoration[] = decorations;

/** Every stage, in order. */
export const STAGES: readonly StageDefinition[] = stages;

/** Z past which there is no more world. Movement is clamped to it. */
export const COURSE_END_Z: number =
  (stages[stages.length - 1]?.endZ ?? COURSE.lobbyEndZ) - 2;

/**
 * How far a sinking platform has dropped at a given time.
 *
 * The ONE definition, evaluated by the server to decide what the player is
 * standing on and by the client to draw it. Returns the drop in world units
 * and whether it is currently shaking its warning.
 */
export const sinkingOffsetAt = (
  platform: SinkingSolid,
  time: number,
): { drop: number; warning: boolean } => {
  const cycle = Math.max(0.1, platform.cycle);
  let t = (time + platform.phase) % cycle;
  if (t < 0) t += cycle;

  const steadyEnd = platform.steady;
  const warnEnd = steadyEnd + platform.warn;
  const sinkEnd = warnEnd + 0.45;
  const sunkEnd = sinkEnd + platform.sunk;

  if (t < steadyEnd) return { drop: 0, warning: false };
  // Still up, but shaking - the warning the player is meant to read.
  if (t < warnEnd) return { drop: 0, warning: true };
  if (t < sinkEnd) {
    const k = (t - warnEnd) / 0.45;
    return { drop: platform.depth * k * k, warning: false };
  }
  if (t < sunkEnd) return { drop: platform.depth, warning: false };

  // Rising back into place.
  const rise = Math.max(0.2, cycle - sunkEnd);
  const k = Math.min((t - sunkEnd) / rise, 1);
  return { drop: platform.depth * (1 - k), warning: false };
};

/**
 * Where a hazard is at a given time.
 *
 * The ONE definition of a hazard's position. The server evaluates it against
 * its own elapsed clock to decide a death; the client evaluates it against the
 * replicated clock to draw the ball. Neither can drift from the other because
 * there is nothing to drift - it is the same pure function.
 *
 * Writes into `out` so a per-substep hazard test allocates nothing.
 */
export const hazardPositionAt = (
  hazard: CourseHazard,
  time: number,
  out: { x: number; y: number; z: number },
): void => {
  out.x = hazard.x;
  out.y = hazard.y;
  out.z = hazard.z;

  switch (hazard.kind) {
    case 'roller': {
      // Rolls from the far end toward the player, then recycles to the top.
      const span = Math.max(1, hazard.fromZ - hazard.toZ);
      let travelled = (time * hazard.rate + hazard.phase) % span;
      if (travelled < 0) travelled += span;
      out.z = hazard.fromZ - travelled;
      return;
    }
    case 'spinner':
    case 'tornado': {
      // A circle about (x, z). Several of these at stepped radii and one
      // phase make a rigid bar, which is how every log, arm and hammer in
      // the game is drawn without a second kind of collision test.
      const angle = time * hazard.rate + hazard.phase;
      out.x = hazard.x + hazard.sweep * Math.cos(angle);
      out.z = hazard.z + hazard.sweep * Math.sin(angle);
      return;
    }
    case 'faller': {
      out.y = fallerHeightAt(hazard, time);
      return;
    }
    default:
      // Sweeper: side to side across the corridor.
      out.x = hazard.x + hazard.sweep * Math.sin(time * hazard.rate + hazard.phase);
  }
};

/**
 * Height of a faller at a given time.
 *
 * Split out because the client needs it on its own, to size the warning shadow
 * on the ground from the SAME number the kill is decided by. A shadow drawn
 * from a second estimate of the drop is a warning that lies.
 *
 * More than half the cycle is spent hovering at the top. That is the whole
 * design of this hazard: the shadow has to be readable for long enough to be
 * a warning rather than a formality, and the drop itself has to be quick
 * enough that it cannot be outrun once it starts.
 */
export const fallerHeightAt = (hazard: CourseHazard, time: number): number => {
  const period = Math.max(0.6, hazard.rate);
  let t = (time + hazard.phase) % period;
  if (t < 0) t += period;

  const hoverEnd = period * 0.52;
  const fallEnd = hoverEnd + period * 0.1;
  const restEnd = fallEnd + period * 0.14;

  if (t < hoverEnd) return hazard.y + hazard.sweep;
  if (t < fallEnd) {
    // Accelerating, so it reads as falling rather than as descending.
    const k = (t - hoverEnd) / (fallEnd - hoverEnd);
    return hazard.y + hazard.sweep * (1 - k * k);
  }
  if (t < restEnd) return hazard.y;

  // Winched back up, decelerating into the hover.
  const k = (t - restEnd) / Math.max(0.1, period - restEnd);
  return hazard.y + hazard.sweep * k * (2 - k);
};

/**
 * How far from the centreline a hazard can ever get.
 *
 * Kind-aware, because `sweep` does not mean the same thing to all of them: it
 * is a horizontal amplitude to a sweeper and an orbit radius to a spinner, but
 * a FALL HEIGHT to a faller, which never moves sideways at all. Treating them
 * alike reported every crusher in the game as hanging through the wall.
 */
export const hazardReachX = (hazard: CourseHazard): number => {
  switch (hazard.kind) {
    case 'sweeper':
    case 'spinner':
    case 'tornado':
      return Math.abs(hazard.x) + hazard.sweep + hazard.radius;
    default:
      // Rollers and fallers hold their lane.
      return Math.abs(hazard.x) + hazard.radius;
  }
};

/**
 * The Z range a hazard can ever reach, for the collision index's buckets.
 *
 * One definition, because a hazard bucketed too narrowly is simply not there:
 * it is drawn, it kills on the server, and the client's prediction never sees
 * it. Every kind that moves along Z has to be represented here.
 */
export const hazardZRange = (hazard: CourseHazard): { minZ: number; maxZ: number } => {
  switch (hazard.kind) {
    case 'roller':
      return { minZ: hazard.toZ - hazard.radius, maxZ: hazard.fromZ + hazard.radius };
    case 'spinner':
    case 'tornado':
      return {
        minZ: hazard.z - hazard.sweep - hazard.radius,
        maxZ: hazard.z + hazard.sweep + hazard.radius,
      };
    default:
      return { minZ: hazard.z - hazard.radius, maxZ: hazard.z + hazard.radius };
  }
};

/**
 * Half-width of the playable corridor at a given Z.
 *
 * The arena is far wider than the run it feeds into, so the clamp has to know
 * where the player is standing.
 */
export const corridorHalfWidthAt = (z: number): number => {
  if (z <= COURSE.lobbyEndZ) return COURSE.lobbyHalfWidth;
  for (const area of wideAreas) {
    if (z >= area.minZ && z <= area.maxZ) return area.halfWidth;
  }
  return COURSE.halfWidth;
};

/**
 * Every stretch wider than the corridor, the starting arena included.
 *
 * The renderer walks this to build its walls, so a wall and a boundary cannot
 * end up in different places.
 */
export const WIDE_AREAS: readonly WideArea[] = [
  { minZ: COURSE.lobbyStartZ, maxZ: COURSE.lobbyEndZ, halfWidth: COURSE.lobbyHalfWidth },
  ...wideAreas,
];

/** The stage containing this Z, or null. */
export const stageAt = (z: number): StageDefinition | null => {
  for (const stage of stages) {
    if (z >= stage.startZ && z <= stage.endZ) return stage;
  }
  return null;
};

/**
 * The stage whose win pad the player is standing on, or null.
 *
 * A POSITION test rather than a message: a client says only that it thinks it
 * finished, and this is what the server checks that claim with.
 */
export const winPadAt = (x: number, y: number, z: number): StageDefinition | null => {
  if (y < COURSE.floorY - 1.5 || y > COURSE.floorY + 7) return null;
  for (const stage of stages) {
    if (Math.abs(z - stage.winPadZ) > WIN_PAD.length / 2) continue;
    if (Math.abs(x - stage.winPadX) > WIN_PAD.width / 2) continue;
    return stage;
  }
  return null;
};

/**
 * Every patch of ground that handles differently.
 *
 * Read by `stepPlayer` on both sides, so ice is exactly as slippery in the
 * client's prediction as in the server's simulation.
 */
export const SURFACE_REGIONS: readonly SurfaceRegion[] = surfaces;

/**
 * The surface a position is standing on, or null for ordinary ground.
 *
 * Returns the FIRST match, so a small patch pushed before the sheet it sits on
 * wins - which is how the ice run's rest pads stay grippy inside a region that
 * covers them.
 */
export const surfaceAt = (x: number, z: number): SurfaceRegion | null => {
  for (const region of surfaces) {
    if (x < region.minX || x > region.maxX) continue;
    if (z < region.minZ || z > region.maxZ) continue;
    return region;
  }
  return null;
};

/** The quicksand pit a position is inside, or null. */
export const quicksandAt = (x: number, z: number): QuicksandRegion | null => {
  for (const pit of quicksand) {
    if (x < pit.minX || x > pit.maxX) continue;
    if (z < pit.minZ || z > pit.maxZ) continue;
    return pit;
  }
  return null;
};
