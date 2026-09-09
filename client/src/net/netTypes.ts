import type { AnimalAnimationState, PlayerMotionState } from '@animal/shared';
import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema.
 *
 * These are types only - colyseus.js builds the concrete schema instances at
 * runtime from the handshake reflection, so there is no duplicated schema
 * class to keep in sync, only this shape.
 */
export interface NetPlayerState extends PlayerMotionState {
  sessionId: string;
  /** The ANIMAL's transform. The rider is carried and has none of its own. */
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animation: AnimalAnimationState;

  level: number;
  rebirths: number;
  wins: number;
  totalSpeed: number;
  animalSlot: number;
  ownedAnimals: number;
  speedPerStep: number;
  moveMultiplier: number;
  jumpVelocity: number;
  maxLevel: number;
  bestStage: number;

  /** Authoritative velocity, used to reconcile client prediction. */
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  /** Highest input sequence the server has simulated. */
  lastInputSeq: number;
  /** Bitmask of trails bought, and the one worn. Server-owned. */
  ownedTrails: number;
  trailSlot: number;
  /** Latched jump edge, so replay resumes from the server's own edge state. */
  jumpLatched: boolean;
  /** Coyote window left, so a replayed jump off a lip is allowed identically. */
  coyote: number;
  ready: boolean;
}

/** The replicated elephant. The one hazard that is state, not a formula. */
export interface NetElephantState {
  x: number;
  z: number;
  rotationY: number;
  charging: boolean;
}

/** One row of one leaderboard, exactly as the server ranked it. */
export interface NetLeaderEntry {
  handle: string;
  value: number;
}

/** The three boards on the spawn wall. Read-only, and entirely the server's. */
export interface NetLeaderboardState {
  wins: ArrayLike<NetLeaderEntry>;
  speed: ArrayLike<NetLeaderEntry>;
  rebirths: ArrayLike<NetLeaderEntry>;
}

export interface NetCourseState {
  players: MapSchema<NetPlayerState>;
  /** The clock the moving hazards are a pure function of. */
  elapsed: number;
  elephant: NetElephantState;
  leaderboard: NetLeaderboardState;
}

/** A leaderboard flattened into plain data, ready to draw. */
export interface LeaderboardSnapshot {
  wins: readonly NetLeaderEntry[];
  speed: readonly NetLeaderEntry[];
  rebirths: readonly NetLeaderEntry[];
}

/** Connection lifecycle, surfaced to the UI. */
export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';
