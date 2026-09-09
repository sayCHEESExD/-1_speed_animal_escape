import { rebootMultiplier } from './reboot.js';

/**
 * Movement tuning for a RIDDEN ANIMAL.
 *
 * The client predicts with these numbers and the server simulates with them,
 * so they must not diverge - which is why there is one copy, here.
 *
 * The animal is the movement character: it accelerates harder and turns slower
 * than a person, and it is what the collision body belongs to. The rider is
 * carried and has no physics of their own.
 */
export interface MovementConfig {
  /** Ground speed in world units per second, before every multiplier. */
  readonly walkSpeed: number;
  /** Gallop speed in world units per second, before every multiplier. */
  readonly runSpeed: number;
  /** Ground acceleration, world units per second squared. */
  readonly acceleration: number;
  /** Ground deceleration when the stick is released. */
  readonly deceleration: number;
  /** Fraction of ground acceleration retained while airborne (0..1). */
  readonly airControl: number;
  /** Downward acceleration, world units per second squared. */
  readonly gravity: number;
  /** Upward velocity applied on jump, world units per second. */
  readonly jumpVelocity: number;
  /**
   * Turn rate toward the movement direction, radians per second.
   *
   * Slower than a person on foot on purpose: an animal leans into a turn, and
   * an instant snap is what makes a mount read as a floating camera.
   */
  readonly turnSpeed: number;
  /**
   * Largest distance the simulation will integrate in one substep.
   *
   * THE reason this game has no speed cap. Late-game movement runs at
   * hundreds of units a second, and a single 1/60s step at that speed would
   * step clean over a plank, a pillar and the gap beyond it. `stepPlayer`
   * subdivides its own step until every substep moves less than this, so
   * collision is exactly as reliable at 400 u/s as at 20.
   */
  readonly maxSubstepDistance: number;
  /** Most substeps one step may take, so a pathological speed cannot hang. */
  readonly maxSubsteps: number;
  /**
   * Height the mount steps up without jumping.
   *
   * A block edge, a plank lip and the 0.55 animal stands are all below this,
   * so the course never needs a hop for something that reads as a kerb.
   */
  readonly stepHeight: number;
}

export const MOVEMENT: MovementConfig = {
  walkSpeed: 14,
  runSpeed: 24,
  acceleration: 85,
  deceleration: 60,
  airControl: 0.42,
  gravity: 62,
  jumpVelocity: 25,
  turnSpeed: 7.5,
  maxSubstepDistance: 0.8,
  maxSubsteps: 48,
  stepHeight: 0.9,
};

/**
 * How level, reboots, the animal and the equipped trail combine into ONE
 * movement profile.
 *
 * This is the single evaluator: nothing else may compute a movement speed.
 * The server resolves it and replicates the multiplier; the client multiplies
 * the base speeds above by exactly that and never derives its own.
 */
export interface MovementProfile {
  /** Multiplier on `walkSpeed` and `runSpeed`. */
  readonly multiplier: number;
  /** Resolved walk speed in world units per second. */
  readonly walkSpeed: number;
  /** Resolved gallop speed in world units per second. */
  readonly runSpeed: number;
  /** Resolved jump velocity. */
  readonly jumpVelocity: number;
}

/** Speed added per level, as a fraction of the base. */
const SPEED_PER_LEVEL = 0.055;

/**
 * Resolve the profile a player actually moves at.
 *
 * THE single evaluator. Every modifier in the game is a FACTOR fed through
 * here - the equipped animal, the equipped trail, the reboot ladder - and none
 * of them is ever a second formula somewhere else.
 *
 * @param level        current level, 1-based
 * @param reboots      completed reboot count
 * @param animalMove   the equipped animal's `moveBonus`
 * @param animalJump   the equipped animal's `jumpBonus`
 * @param extra        the equipped trail's multiplier, and any future boost
 */
export const resolveMovementProfile = (
  level: number,
  reboots: number,
  animalMove = 1,
  animalJump = 1,
  extra = 1,
): MovementProfile => {
  const steps = Math.max(0, Math.floor(level) - 1);
  const safe = (value: number): number =>
    Number.isFinite(value) && value > 0 ? value : 1;

  const multiplier =
    (1 + steps * SPEED_PER_LEVEL) *
    rebootMultiplier(reboots) *
    safe(animalMove) *
    safe(extra);

  return {
    multiplier,
    walkSpeed: MOVEMENT.walkSpeed * multiplier,
    runSpeed: MOVEMENT.runSpeed * multiplier,
    // Jump velocity scales far more gently than travel speed. A jump that grew
    // with the multiplier would put a level-50 player above the pink walls;
    // distance is meant to come from APPROACH SPEED, which it already does.
    jumpVelocity:
      MOVEMENT.jumpVelocity * safe(animalJump) * (1 + Math.min(multiplier - 1, 6) * 0.08),
  };
};
