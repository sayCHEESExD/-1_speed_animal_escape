/**
 * Reboot: the prestige ladder.
 *
 * Ported from the previous game's rebirth system and kept behaviourally
 * identical - a reboot trades the current level curve for a permanently higher
 * ceiling and a bigger multiplier, and deliberately leaves everything the
 * player earned OUTSIDE that curve alone. Wins and owned animals are permanent
 * unlocks and survive a reboot untouched.
 *
 * Data-driven: `REBOOT_TIERS` is the authored head of the ladder and
 * `EXTENSION` continues the same pattern for ever after it, so adding a third
 * reboot is one row in a table rather than a new branch anywhere.
 */

/** One rung of the ladder. */
export interface RebootTier {
  /** How many reboots the player will have AFTER performing this one. */
  readonly index: number;
  /** Level that must be reached before this reboot may be performed. */
  readonly requiredLevel: number;
  /** Speed multiplier granted once it has been performed. */
  readonly multiplier: number;
}

/**
 * The authored rungs.
 *
 * Reboot 1 at level 25 and reboot 2 at level 50, as specified. Everything past
 * the table continues by `EXTENSION`, so the ladder never runs out.
 */
export const REBOOT_TIERS: readonly RebootTier[] = [
  { index: 1, requiredLevel: 25, multiplier: 2 },
  { index: 2, requiredLevel: 50, multiplier: 3 },
];

/** How the ladder continues once the authored table is exhausted. */
const EXTENSION = {
  /** Extra levels required per reboot beyond the last authored one. */
  levelsPerReboot: 25,
  /** Extra multiplier per reboot beyond the last authored one. */
  multiplierPerReboot: 1,
} as const;

/**
 * The largest level and reboot count that can be replicated.
 *
 * `PlayerState.level`, `maxLevel` and `rebirths` are all `uint32`, so a figure
 * past this WRAPS on the wire - and a wrapped level cap is worse than a cap,
 * because it silently drops a player's ceiling to nothing. Clamping saturates
 * instead.
 */
export const MAX_REPLICATED_LEVEL = 4294967295;

/** The rung a player with `count` reboots is working toward. */
export const nextRebootTier = (count: number): RebootTier => {
  const done = Math.max(0, Math.floor(count));
  const authored = REBOOT_TIERS[done];
  if (authored) return authored;

  // Past the table: continue the same pattern rather than stopping.
  const last = REBOOT_TIERS[REBOOT_TIERS.length - 1] as RebootTier;
  const beyond = done - REBOOT_TIERS.length + 1;
  return {
    index: done + 1,
    requiredLevel: last.requiredLevel + beyond * EXTENSION.levelsPerReboot,
    multiplier: last.multiplier + beyond * EXTENSION.multiplierPerReboot,
  };
};

/**
 * Highest level reachable at this reboot count.
 *
 * It is exactly the level the NEXT reboot needs, which is what makes reaching
 * the cap and unlocking the reboot the same moment - the cap is a gate, never
 * a dead end.
 */
export const maxLevelForReboot = (count: number): number =>
  Math.min(nextRebootTier(count).requiredLevel, MAX_REPLICATED_LEVEL);

/** Speed multiplier granted by `count` completed reboots. */
export const rebootMultiplier = (count: number): number => {
  const done = Math.max(0, Math.floor(count));
  if (done <= 0) return 1;
  const authored = REBOOT_TIERS[done - 1];
  if (authored) return authored.multiplier;
  const last = REBOOT_TIERS[REBOOT_TIERS.length - 1] as RebootTier;
  const beyond = done - REBOOT_TIERS.length;
  return last.multiplier + beyond * EXTENSION.multiplierPerReboot;
};

/** A player may reboot once they have reached their current max level. */
export const canReboot = (level: number, count: number): boolean =>
  Math.floor(level) >= maxLevelForReboot(count);
