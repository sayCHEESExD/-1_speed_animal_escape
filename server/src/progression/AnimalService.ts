import {
  COURSE,
  STAND_ROW,
  animalBit,
  animalForSlot,
  bestOwnedAnimal,
  ownsAnimal,
  standZ,
  type AnimalDefinition,
} from '@animal/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { SpeedService } from './SpeedService.js';
import { wallet } from './Wallet.js';

/** How a claim was resolved. */
export interface AnimalClaim {
  readonly granted: boolean;
  readonly animal: AnimalDefinition | null;
  readonly reason?: 'unknown-slot' | 'not-at-stand' | 'already-owned' | 'too-poor' | 'cooldown';
}

/**
 * Milliseconds between two accepted claims from one player.
 *
 * Spam protection ONLY, which is why it is short and why it is checked last.
 * An animal already owned or a player not at the stand is refused on its own
 * merits, and neither should ever be reported as a cooldown.
 */
const CLAIM_COOLDOWN_MS = 250;

/**
 * Server authority over which animals a player owns and which one they ride.
 *
 * Claiming is a DELIBERATE ACT: the player has to walk their current mount
 * onto the stand while holding enough Wins. Reaching the Wins total alone does
 * nothing, which is what makes the lobby a place rather than a menu.
 *
 * Wins are SPENT - the price is deducted here - and the best animal OWNED is
 * always equipped, so a purchase can never downgrade anyone and spending can
 * never remove an animal already claimed. Taking payment, granting the animal
 * and equipping it happen together in one method, so the wallet and the
 * inventory cannot disagree.
 */
export class AnimalService {
  private readonly lastClaimAt = new Map<string, number>();

  initialise(player: PlayerState): void {
    this.lastClaimAt.set(player.sessionId, 0);
    this.equipBest(player);
  }

  forget(sessionId: string): void {
    this.lastClaimAt.delete(sessionId);
  }

  /**
   * Slot of the stand the player is standing on, or null.
   *
   * A pure position test against the authoritative transform - this is what
   * turns "near an animal" into "may claim it".
   */
  standAt(x: number, y: number, z: number): number | null {
    // The line-up is a COLUMN down the arena's left wall, so the fixed axis is
    // X and the per-slot axis is Z. A row across the middle of a room this big
    // would have cut straight through the space it exists to provide.
    if (Math.abs(x - STAND_ROW.x) > STAND_ROW.claimRadius) return null;
    if (y < COURSE.floorY - 1 || y > COURSE.floorY + 4) return null;

    for (let slot = 1; slot <= 32; slot += 1) {
      const animal = animalForSlot(slot);
      if (animal.slot !== slot) break;
      if (Math.abs(z - standZ(slot)) <= STAND_ROW.claimRadius) return slot;
    }
    return null;
  }

  /** Resolve a claim. The server decides; the client only asked. */
  claim(player: PlayerState, slot: number, speeds: SpeedService): AnimalClaim {
    const requested = Math.floor(slot);
    const animal = animalForSlot(requested);
    if (animal.slot !== requested) {
      return { granted: false, animal: null, reason: 'unknown-slot' };
    }

    // THE position check, against the transform the server itself simulated.
    if (this.standAt(player.x, player.y, player.z) !== animal.slot) {
      return { granted: false, animal, reason: 'not-at-stand' };
    }

    if (ownsAnimal(player.ownedAnimals, animal.slot)) {
      return { granted: false, animal, reason: 'already-owned' };
    }

    if (!wallet.canAfford(player, animal.winsRequired)) {
      return { granted: false, animal, reason: 'too-poor' };
    }

    // Checked LAST, so the deterministic reasons above are always the ones
    // reported and a burst of requests cannot mask a real refusal.
    const now = Date.now();
    if (now - (this.lastClaimAt.get(player.sessionId) ?? 0) < CLAIM_COOLDOWN_MS) {
      return { granted: false, animal, reason: 'cooldown' };
    }

    // Payment, grant and equip together. Nothing between them can fail.
    if (!wallet.spend(player, animal.winsRequired)) {
      return { granted: false, animal, reason: 'too-poor' };
    }
    player.ownedAnimals |= animalBit(animal.slot);
    this.lastClaimAt.set(player.sessionId, now);
    this.equipBest(player);
    // Movement speed, jump velocity and Speed-per-stride all follow from the
    // animal, so they are re-derived through the one formula rather than
    // written here.
    speeds.syncDerived(player);

    return { granted: true, animal };
  }

  /**
   * Equip the best animal owned.
   *
   * "Best" is by Speed per stride, which is the order the stands are in, so
   * this can never be a downgrade after a purchase.
   */
  equipBest(player: PlayerState): void {
    const best = bestOwnedAnimal(player.ownedAnimals);
    player.animalSlot = best.slot;
    player.speedPerStep = best.speedPerStep;
  }
}
