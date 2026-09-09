import { canReboot, maxLevelForRebirth, nextRebootTier, rebootMultiplier } from '@animal/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { SpeedService } from './SpeedService.js';

/** Outcome of a reboot attempt. */
export type RebootResult =
  | { readonly ok: true; readonly reboots: number; readonly multiplier: number }
  | { readonly ok: false; readonly reason: 'not-eligible' };

/**
 * Server authority over reboots.
 *
 * Ported from the previous game's rebirth service and behaviourally identical.
 * A reboot trades the current level curve for a permanently higher ceiling and
 * a bigger Speed multiplier. What it must NOT touch is anything the player
 * earned OUTSIDE that curve: Wins, owned animals and owned trails are
 * permanent unlocks and survive untouched.
 *
 * The client sends an empty message. Eligibility is decided here from the
 * server's own level and reboot count, so there is nothing in the request that
 * could be wrong and nothing to validate.
 */
export class RebootService {
  /**
   * Refresh the cap that follows from the reboot count.
   *
   * Deliberately does NOT write `moveMultiplier`. Movement speed has exactly
   * one evaluator - `SpeedService` - because it is the only place that knows
   * every modifier feeding the shared formula. This class computing its own
   * would silently drop the equipped trail.
   */
  sync(player: PlayerState): void {
    player.maxLevel = maxLevelForRebirth(player.rebirths);
  }

  /** True once the player has reached their current max level. */
  isEligible(player: PlayerState): boolean {
    return canReboot(player.level, player.rebirths);
  }

  /** The level the next reboot needs, for the HUD's locked state. */
  requiredLevel(player: PlayerState): number {
    return nextRebootTier(player.rebirths).requiredLevel;
  }

  /**
   * Perform a reboot.
   *
   * Resets the level curve and everything derived from it, raises the cap and
   * the multiplier, and deliberately leaves Wins, animals and trails alone.
   */
  reboot(player: PlayerState, speeds: SpeedService): RebootResult {
    if (!this.isEligible(player)) return { ok: false, reason: 'not-eligible' };

    player.rebirths += 1;
    // Level FOLLOWS from lifetime Speed, so clearing the Speed total is what
    // actually returns the player to level 1. Setting the level alone would be
    // undone by the next credit.
    player.totalSpeed = 0;
    player.level = 1;

    this.sync(player);
    // Movement speed, jump velocity and the cap all re-derive through the one
    // formula rather than being written here.
    speeds.syncDerived(player);

    return {
      ok: true,
      reboots: player.rebirths,
      multiplier: rebootMultiplier(player.rebirths),
    };
  }
}
