/**
 * Transform-only view of a mount, used for both the local prediction and the
 * replicated remote players.
 *
 * The transform belongs to the ANIMAL. The rider is carried by it and has no
 * transform of their own on the wire.
 */
export interface PlayerTransform {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians. Pitch and roll are presentation, so they are not sent. */
  rotationY: number;
}

/**
 * Visual states the animator can be in.
 *
 * PRESENTATION only. Gameplay authority - position, progression, whether a
 * jump is allowed - never lives here.
 */
export const AnimalAnimationState = {
  Idle: 'idle',
  Walk: 'walk',
  Gallop: 'gallop',
  JumpStart: 'jumpStart',
  Airborne: 'airborne',
  Landing: 'landing',
  Dying: 'dying',
} as const;

export type AnimalAnimationState =
  (typeof AnimalAnimationState)[keyof typeof AnimalAnimationState];

/**
 * The compact per-player signals a client needs to reconstruct another
 * player's animation locally.
 *
 * Bone transforms and animal part transforms are NEVER sent over the network -
 * every remote mount runs the same procedural animator the local one does,
 * driven from these few numbers.
 */
export interface PlayerMotionState {
  /** Horizontal speed in world units per second. Drives the gait blend. */
  speed: number;
  /** Vertical velocity in world units per second. Rise versus fall. */
  verticalVelocity: number;
  /** True while standing on a surface. */
  grounded: boolean;
  /** Monotonic count of jumps started, so a remote can trigger the crouch. */
  jumpCount: number;
  /** Monotonic count of deaths, so a remote can play the fall-over. */
  deathCount: number;
  /**
   * Treadmill the player is standing on, or 0.
   *
   * Replicated so a remote mount runs on the spot exactly as the local one
   * does. Derived from position by the simulation - never sent by a client.
   */
  treadmill: number;
}

/** Server-authoritative progression snapshot. */
export interface PlayerProgression {
  level: number;
  /** Completed rebirths. Drives the level cap and the Speed multiplier. */
  rebirths: number;
  /** Stage wins collected. Awarded by the server only. */
  wins: number;
  /** Lifetime Speed farmed by riding. Awarded by the server only. */
  totalSpeed: number;
  /** Slot of the currently equipped animal - the best one owned. */
  animalSlot: number;
  /** Bitmask of animals claimed, one bit per slot. */
  ownedAnimals: number;
  /** Authoritative movement multiplier. The client moves at exactly this. */
  moveMultiplier: number;
  /** Authoritative jump velocity, resolved by the same one formula. */
  jumpVelocity: number;
  /** Highest level reachable at the current rebirth. */
  maxLevel: number;
  /** Speed granted per stride, from the equipped animal. */
  speedPerStep: number;
  /** Highest stage index (1-based) the player has ever banked. */
  bestStage: number;
  /** Bitmask of trails bought. Written by the server only. */
  ownedTrails: number;
  /** Equipped trail slot, or 0 for none. */
  trailSlot: number;
}

/** Everything the client knows about a replicated player. */
export interface PlayerSnapshot
  extends PlayerTransform,
    PlayerMotionState,
    PlayerProgression {
  sessionId: string;
  animation: AnimalAnimationState;
}
