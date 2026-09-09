/**
 * The elephant that patrols the ruins of stage 5.
 *
 * Unlike every other hazard in the game, the elephant is NOT a pure function
 * of time: it reacts to where the players are, and that is state rather than
 * a formula. So it is simulated by the server and replicated, and the kill is
 * decided on the server tick from the server's own position for it.
 *
 * The tuning lives here so the client can draw its warning ring and the server
 * can chase with the same numbers.
 */
export interface ElephantConfig {
  /** Z range it patrols, inside stage 5's ruins. */
  readonly minZ: number;
  readonly maxZ: number;
  /** X range it may wander across. */
  readonly halfWidth: number;
  /** Height of its shoulder above the floor - it is meant to loom. */
  readonly shoulderY: number;
  /** Body radius used for the kill test and for pushing past ruins. */
  readonly radius: number;
  /** Patrol speed when nobody has been noticed. */
  readonly patrolSpeed: number;
  /** Charge speed once a player is in range. */
  readonly chargeSpeed: number;
  /** How far it can notice a player. */
  readonly aggroRange: number;
  /** How far it will chase before giving up and returning to patrol. */
  readonly leashRange: number;
  /** Turn rate, radians per second. Deliberately ponderous. */
  readonly turnSpeed: number;
  /** Seconds it keeps charging after losing sight, so it is not twitchy. */
  readonly commit: number;
}

/**
 * Stage 5's ruins run from its start runway to its finish apron. The elephant
 * patrols the middle of that, so the player meets it after they have had a
 * moment to see the place.
 */
export const ELEPHANT: ElephantConfig = {
  minZ: 830,
  maxZ: 975,
  halfWidth: 11,
  shoulderY: 0,
  radius: 5.2,
  patrolSpeed: 7,
  chargeSpeed: 26,
  aggroRange: 46,
  leashRange: 80,
  turnSpeed: 1.6,
  commit: 1.5,
};

/** True when a position is inside the elephant's territory. */
export const inElephantTerritory = (z: number): boolean =>
  z >= ELEPHANT.minZ - ELEPHANT.leashRange && z <= ELEPHANT.maxZ + ELEPHANT.leashRange;
