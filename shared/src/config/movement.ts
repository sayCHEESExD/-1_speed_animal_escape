import { rebirthMultiplier } from './rebirth.js';

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
 * How level, rebirths, the animal and the equipped trail combine into ONE
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
const SPEED_PER_LEVEL = 0.04;

/**
 * Levels over which the per-level gain decays to half its value.
 *
 * The level term used to be LINEAR, and that is what made the mount
 * unmanageable: every level added the same slab of speed for ever, so a
 * mid-game player at level 40 with one rebirth was already doing 150 units a
 * second and the end of the ladder was over 600 - far past the point where a
 * platform can be seen, judged and landed on.
 *
 * Now it tapers: `steps / (1 + steps / LEVEL_SOFT_CAP)` rises quickly at
 * first, so the first twenty levels still feel like getting faster, and
 * converges on `SPEED_PER_LEVEL * LEVEL_SOFT_CAP` - a level ceiling of x2
 * however long anyone grinds.
 *
 * Levelling is therefore no longer where late-game speed comes from. REBIRTH
 * is, which is what the prestige ladder is for and why it is untouched here.
 */
const LEVEL_SOFT_CAP = 25;

/**
 * Resolve the profile a player actually moves at.
 *
 * THE single evaluator. Every modifier in the game is a FACTOR fed through
 * here - the equipped animal, the equipped trail, the rebirth ladder - and none
 * of them is ever a second formula somewhere else.
 *
 * @param level        current level, 1-based
 * @param rebirths      completed rebirth count
 * @param animalMove   the equipped animal's `moveBonus`
 * @param animalJump   the equipped animal's `jumpBonus`
 * @param extra        the equipped trail's multiplier, and any future boost
 */
export const resolveMovementProfile = (
  level: number,
  rebirths: number,
  animalMove = 1,
  animalJump = 1,
  extra = 1,
): MovementProfile => {
  const steps = Math.max(0, Math.floor(level) - 1);
  const safe = (value: number): number =>
    Number.isFinite(value) && value > 0 ? value : 1;

  // Diminishing returns, so a very high level is faster than a high one
  // without being a different game.
  const levelGain = (steps / (1 + steps / LEVEL_SOFT_CAP)) * SPEED_PER_LEVEL;

  const multiplier =
    (1 + levelGain) *
    rebirthMultiplier(rebirths) *
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
