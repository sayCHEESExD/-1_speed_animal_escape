import type { Aabb } from '../types/math.js';

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
  | 'sinking';

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
  | 'roller';

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
  /** Sweeper: half-amplitude in X. Roller: unused. */
  readonly sweep: number;
  /** Sweeper: radians per second. Roller: units per second down the lane. */
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
  | 'cloud';

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
  readonly startZ: number;
  readonly endZ: number;
  /** Centre of the small win pad at the right of the stage end. */
  readonly winPadX: number;
  readonly winPadZ: number;
  /** Wins awarded for reaching it. */
  readonly winReward: number;
  /** Where a player who died in this stage is put back. */
  readonly checkpointZ: number;
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
  stageCount: 8,
} as const;

/** Names and difficulty ramp. */
const STAGE_NAMES = [
  'Meadow Hops',
  'Rolling Corridor',
  'Sinking Sands',
  'Hidden Grove',
  'Ancient Ruins',
  'Cliff Run',
  'Pillar Maze',
  'Final Gallop',
] as const;

const DIFFICULTIES = [
  'EASY',
  'EASY',
  'NORMAL',
  'NORMAL',
  'HARD',
  'HARD',
  'INSANE',
  'INSANE',
] as const;

/**
 * Wins per stage, as specified.
 *
 * The ONE place a stage reward is written. Anything past the table continues
 * the same roughly-doubling curve, so stage nine needs no edit here.
 */
const STAGE_REWARDS = [1, 3, 8, 20, 50, 120, 200, 400] as const;

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
const sinking: SinkingSolid[] = [];
const quicksand: QuicksandRegion[] = [];
const hazards: CourseHazard[] = [];
const decorations: Decoration[] = [];
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
  minX: -54,
  maxX: -22,
  minZ: -86,
  maxZ: -30,
  /** Deck top. A shallow step, inside the simulation's landing tolerance. */
  deckY: 0.6,

  /** Belt footprint. */
  beltWidth: 7,
  beltLength: 13,
  /** Walkable height of a belt above the deck. */
  beltHeight: 0.5,
  /** X of the first belt, and the spacing between them. */
  firstX: -48,
  spacingX: 10,
  /** Z of the belt centres. */
  centerZ: -58,
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

/** Centre X of a 1-based treadmill index. */
export const treadmillX = (index: number): number =>
  TRAINING.firstX + (Math.floor(index) - 1) * TRAINING.spacingX;

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
  if (Math.abs(z - TRAINING.centerZ) > TRAINING.beltLength / 2) return NO_TREADMILL;
  for (let i = 1; i <= TRAINING.count; i += 1) {
    if (Math.abs(x - treadmillX(i)) <= TRAINING.beltWidth / 2) return i;
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
    treadmillX(i),
    TRAINING.deckY,
    TRAINING.centerZ,
    TRAINING.beltWidth,
    TRAINING.beltHeight,
    TRAINING.beltLength,
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
  ascending: boolean,
): number => {
  const rise = 0.72;
  const tread = 2.4;
  const count = Math.max(1, Math.ceil(Math.abs(toY - fromY) / rise));
  for (let i = 0; i < count; i += 1) {
    // Each step is a solid block up from the pit, so the flight reads as built
    // rather than as a row of floating slabs.
    const top = ascending
      ? fromY + ((i + 1) / count) * (toY - fromY)
      : fromY + (1 - i / count) * (toY - fromY);
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
  const top = pushSteps(stage, z, COURSE.floorY, ROLLING.deckY, width, true);
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
  return pushSteps(stage, endZ, ROLLING.deckY, COURSE.floorY, width, false);
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
  archSpacing: 26,
  count: 6,
  pillarWidth: 4,
  pillarHeight: 11,
  archSpan: 13,
} as const;

const buildAncientRuins = (stage: number, z: number): number => {
  const length = RUINS.count * RUINS.archSpacing + 20;
  pushFloor(stage, z, z + length);

  for (let i = 0; i < RUINS.count; i += 1) {
    const at = z + 14 + i * RUINS.archSpacing;
    const side = i % 2 === 0 ? -1 : 1;
    const centreX = side * 6.5;

    // Two uprights and a lintel: a Roblox ruin is three boxes, not a mesh.
    for (const offset of [-RUINS.archSpan / 2, RUINS.archSpan / 2]) {
      pushBox(
        stage,
        'ruin',
        centreX + offset,
        COURSE.floorY,
        at,
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
      at,
      RUINS.archSpan + RUINS.pillarWidth,
      2.4,
      RUINS.pillarWidth,
    );

    decorations.push({ kind: 'arch', stage, x: centreX, y: COURSE.floorY, z: at, scale: 1, rotationY: 0 });

    // A fallen block or two, for silhouette.
    pushBox(stage, 'ruin', -side * 9, COURSE.floorY, at + 9, 5, 2.2, 5);
  }

  return z + length;
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

/** Running build cursor. Each stage begins exactly where the last one ended. */
let cursorZ: number = FIRST_STAGE_Z;

for (let stageIndex = 0; stageIndex < COURSE.stageCount; stageIndex += 1) {
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
    default: {
      for (let segment = 0; segment < 5; segment += 1) {
        const pattern = PATTERNS[(stageIndex * 2 + segment) % PATTERNS.length] as PatternId;
        z = buildPattern(pattern, stageIndex, stageIndex, z);
        pushFloor(stageIndex, z, z + 16);
        z += 16;
      }
      break;
    }
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
    name: STAGE_NAMES[stageIndex % STAGE_NAMES.length] as string,
    difficulty: DIFFICULTIES[Math.min(stageIndex, DIFFICULTIES.length - 1)] as string,
    recommendedLevel: 3 + stageIndex * 7,
    startZ,
    endZ,
    winPadX,
    winPadZ,
    winReward: stageReward(stageIndex + 1),
    // Dying puts the player back at the start of the stage they were in.
    checkpointZ: startZ + 8,
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
  out: { x: number; z: number },
): void => {
  if (hazard.kind === 'roller') {
    // Rolls from the far end toward the player, then recycles to the top.
    const span = Math.max(1, hazard.fromZ - hazard.toZ);
    let travelled = (time * hazard.rate + hazard.phase) % span;
    if (travelled < 0) travelled += span;
    out.x = hazard.x;
    out.z = hazard.fromZ - travelled;
    return;
  }
  out.x = hazard.x + hazard.sweep * Math.sin(time * hazard.rate + hazard.phase);
  out.z = hazard.z;
};

/**
 * Half-width of the playable corridor at a given Z.
 *
 * The arena is far wider than the run it feeds into, so the clamp has to know
 * where the player is standing.
 */
export const corridorHalfWidthAt = (z: number): number =>
  z <= COURSE.lobbyEndZ ? COURSE.lobbyHalfWidth : COURSE.halfWidth;

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

/** The quicksand pit a position is inside, or null. */
export const quicksandAt = (x: number, z: number): QuicksandRegion | null => {
  for (const pit of quicksand) {
    if (x < pit.minX || x > pit.maxX) continue;
    if (z < pit.minZ || z > pit.maxZ) continue;
    return pit;
  }
  return null;
};
