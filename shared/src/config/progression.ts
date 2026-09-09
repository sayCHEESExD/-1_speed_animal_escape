import { maxLevelForReboot, nextRebootTier, rebootMultiplier } from './reboot.js';

/**
 * Progression tuning. Level, Speed, Wins, reboots, trails and the owned-animal
 * set are all SERVER-AUTHORITATIVE; the client may predict for UI feel but
 * never decides any of them.
 *
 * The level cap is NOT a constant here - it is whatever the next reboot
 * requires, so reaching the cap and unlocking a reboot are the same moment.
 * See `config/reboot.ts`.
 */

/**
 * The largest Wins total that can be replicated.
 *
 * `PlayerState.wins` is a `uint32`, so anything past this WRAPS - a player
 * would bank a huge reward and find their wallet had reset. Every path that
 * adds Wins clamps to it instead, which saturates rather than corrupts.
 */
export const MAX_WINS = 4294967295;

/** Level cap before any reboot. Derived, so the two can never disagree. */
export const BASE_LEVEL_CAP = nextRebootTier(0).requiredLevel;

/**
 * Re-exported under the names the rest of the codebase already uses.
 *
 * The reboot module owns the ladder; these exist so a caller needs one import
 * for "what is this player's cap" rather than knowing which file the ladder
 * happens to live in.
 */
export { maxLevelForReboot as maxLevelForRebirth, rebootMultiplier };
