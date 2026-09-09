import type { PoseDefinition } from '../animation/PoseBuffer.js';

const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Procedural animation tuning.
 *
 * Data-driven on purpose: every number both animators use lives here, so the
 * mount can be re-tuned without touching a line of logic. All rider rotations
 * are in CHARACTER space (see `PlayerRig`); all animal rotations are in the
 * animal's own node space.
 */

/** The four-legged gait. */
export const GAIT = {
  /**
   * Cycle frequency clamp, in cycles per second.
   *
   * The upper bound is the single most important number in this file. Phase
   * advances with DISTANCE, so a level-80 mount at four hundred units a second
   * would otherwise cycle its legs 150 times a second - a strobe, not a
   * gallop. Clamping the cadence means the legs stay readable at any speed and
   * the sense of pace comes from the world going past, which is where it
   * belongs.
   */
  minFrequency: 0.9,
  maxFrequency: 4.2,

  /** Below this speed the animal is standing still. */
  idleSpeed: 0.6,
  /** Speed at which the walk is fully in effect, before the move multiplier. */
  walkSpeed: 8,
  /** Speed at which the gallop is fully in effect, before the multiplier. */
  gallopSpeed: 20,

  /** Peak hip swing, walk -> gallop. */
  hipSwing: { walk: deg(20), gallop: deg(34) },
  /** Peak knee flexion. Knees only ever bend one way. */
  kneeBend: { walk: deg(22), gallop: deg(52) },

  /**
   * Leg phase offsets, in radians.
   *
   * A walk is a diagonal two-beat - front-left with back-right - and a gallop
   * is a four-beat with the front pair landing together and the back pair
   * following. Blending BETWEEN the two offset sets is what makes speeding up
   * read as a change of gait rather than the same trot played faster.
   *
   * Order is front-left, front-right, back-left, back-right, matching
   * `AnimalParts.hips`.
   */
  trotPhase: [0, Math.PI, Math.PI, 0],
  gallopPhase: [0, 0.4, 2.6, 3.0],

  /** Vertical body bob, walk -> gallop, in world units. */
  bob: { walk: 0.07, gallop: 0.2 },
  /** Body pitch as the gallop rocks fore and aft. */
  pitch: { walk: deg(2), gallop: deg(7) },
  /** Body roll, side to side. */
  roll: { walk: deg(1.5), gallop: deg(3.5) },
  /** How far the head nods against the body's bob. */
  headNod: { walk: deg(5), gallop: deg(11) },
  /** Tail sway amplitude and how much it lifts at speed. */
  tailSway: deg(11),
  tailLift: deg(28),
  /** How quickly the head turns to follow a steer, and how far. */
  headTurn: deg(18),
  headTurnRate: 5,
} as const;

/** Crouch, launch, airborne and land. */
export const JUMP = {
  /** Seconds of crouch before the animal leaves the ground. */
  crouchDuration: 0.09,
  /** How far the body drops during the crouch, in world units. */
  crouchDrop: 0.34,
  /** Seconds of squash on touchdown. */
  landDuration: 0.18,
  /** How far the body drops on landing. */
  landDrop: 0.4,

  /** Front legs tuck up, back legs trail: the shape of a horse over a fence. */
  frontTuck: deg(-62),
  frontKnee: deg(84),
  backTrail: deg(46),
  backKnee: deg(26),

  /** Body pitch at full rise and at full fall. */
  risePitch: deg(-17),
  fallPitch: deg(13),
  /** Vertical velocity at which those pitches are fully applied. */
  velocityReference: 16,
} as const;

/** The fall-over. Readable, brief, and deliberately not gruesome. */
export const DEATH = {
  /** Seconds the whole animation runs before the respawn is applied. */
  duration: 0.55,
  /** How far the animal keels over, in radians. */
  roll: deg(96),
  /** How far it pitches nose-down as it goes. */
  pitch: deg(24),
  /** How far the body sinks. */
  drop: 0.6,
  /** How far the legs stiffen out. */
  legSplay: deg(38),
} as const;

/**
 * The rider.
 *
 * A single held pose plus secondary motion - which is the whole brief: the
 * player should look naturally seated rather than frozen, and the animal is
 * what carries the performance.
 */
export const RIDE = {
  /** The seated pose, held while riding. */
  pose: {
    // Thighs forward and YAWED OUTWARD, so the legs straddle the barrel. The
    // outward part has to be a yaw, not a roll: a thigh already swung forward
    // is pointing along the character's own Z, and rolling about Z just spins
    // it about its own length - which is why a roll left the knees inside the
    // animal however far it was pushed.
    LegL1: { x: deg(-62), y: deg(30) },
    LegR1: { x: deg(-62), y: deg(-30) },
    // Shins fold back and OUT, so the feet hang past the animal's flanks
    // rather than tucking under its belly. The thigh alone cannot clear a
    // barrel wider than it is long - the hips are only 0.6 apart - so the
    // outward reach has to come from the shin.
    LegL2: { x: deg(58), y: deg(20) },
    LegR2: { x: deg(58), y: deg(-20) },
    // Arms forward and yawed IN, as though holding reins over the withers.
    // The shoulders are a full unit apart, so without the inward yaw the hands
    // sit wider than the animal's neck.
    ArmL1: { x: deg(-48), y: deg(-22) },
    ArmR1: { x: deg(-48), y: deg(22) },
    ArmL2: { x: deg(45) },
    ArmR2: { x: deg(45) },
    // A slight forward set through the spine, head level.
    Spine1: { x: deg(5) },
    Spine2: { x: deg(2) },
    Neck1: { x: deg(-5) },
  } satisfies PoseDefinition,

  /** Amplitude of the rider's own bounce against the animal's gait. */
  bounce: { walk: deg(4), gallop: deg(9) },
  /** Vertical rise and fall in the saddle, in world units. */
  postingHeight: { walk: 0.03, gallop: 0.075 },
  /** Extra forward lean at a gallop - the jockey crouch. */
  gallopLean: deg(15),
  /** Idle breathing, so a stopped rider is never completely still. */
  breathFrequency: 0.4,
  breathAmount: deg(2),

  /** Lean applied while airborne, blended by vertical velocity. */
  riseLean: deg(-11),
  fallLean: deg(9),
  /** Arms rise as the animal leaves the ground. */
  jumpArmLift: deg(-26),

  /** How far the rider slumps as the animal goes over. */
  deathSlump: deg(52),
} as const;

/** Seconds a pose change takes to blend in. One number, used everywhere. */
export const POSE_BLEND_RATE = 12;
