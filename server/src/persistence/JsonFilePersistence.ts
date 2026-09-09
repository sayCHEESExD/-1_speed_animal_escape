import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { logger } from '../util/logger.js';
import type { PersistenceAdapter, StoredProfile } from './PersistenceAdapter.js';

const SCOPE = 'persistence';

/** Milliseconds a write waits for more changes before hitting the disk. */
const DEBOUNCE_MS = 1500;

/**
 * One JSON file, written debounced and ATOMICALLY.
 *
 * Atomic means: to a temp file, fsynced, then renamed over the real one. A
 * crash mid-write therefore leaves either the old file or the new one, never a
 * half-written save - which is the difference between a server restart and
 * every player losing their progression.
 */
export class JsonFilePersistence implements PersistenceAdapter {
  private readonly path: string;
  private readonly tempPath: string;
  private timer: NodeJS.Timeout | null = null;
  private pending: Map<string, StoredProfile> | null = null;

  constructor(private readonly directory: string) {
    this.path = join(directory, 'profiles.json');
    this.tempPath = join(directory, 'profiles.json.tmp');
  }

  load(): Map<string, StoredProfile> {
    const profiles = new Map<string, StoredProfile>();
    try {
      if (!existsSync(this.path)) return profiles;
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<
        string,
        Partial<StoredProfile>
      >;
      for (const [id, value] of Object.entries(raw)) {
        if (!value || typeof value !== 'object') continue;
        profiles.set(id, {
          totalSpeed: numeric(value.totalSpeed),
          wins: numeric(value.wins),
          // A profile written before animals existed owns none, which
          // `bestOwnedAnimal` resolves to the free starter rather than to
          // nothing at all.
          ownedAnimals: numeric(value.ownedAnimals),
          rebirths: numeric(value.rebirths),
          // A profile written before trails existed owns none, which is
          // exactly what a zero mask means - no migration needed.
          ownedTrails: numeric(value.ownedTrails),
          trailSlot: numeric(value.trailSlot),
          bestStage: numeric(value.bestStage),
          updatedAt: numeric(value.updatedAt),
        });
      }
      logger.info(SCOPE, `loaded ${profiles.size} profile(s) from ${this.path}`);
    } catch (error) {
      // A corrupt save must not stop the server booting: play continues with
      // empty profiles, and the next write replaces the bad file.
      logger.error(SCOPE, `failed to read ${this.path}:`, error);
    }
    return profiles;
  }

  save(profiles: Map<string, StoredProfile>): void {
    this.pending = profiles;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.write();
    }, DEBOUNCE_MS);
    // Never hold the process open for a save that can be flushed on exit.
    this.timer.unref?.();
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.write();
  }

  private write(): void {
    const profiles = this.pending;
    if (!profiles) return;
    this.pending = null;

    try {
      mkdirSync(this.directory, { recursive: true });
      const payload = JSON.stringify(Object.fromEntries(profiles), null, 0);

      // Temp file first, fsynced, then renamed. `rename` is atomic on every
      // platform we run on, so a reader only ever sees a complete file.
      const handle = openSync(this.tempPath, 'w');
      try {
        writeSync(handle, payload);
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      renameSync(this.tempPath, this.path);
    } catch (error) {
      logger.error(SCOPE, `failed to write ${this.path}:`, error);
      // Last resort: a plain non-atomic write is still better than losing
      // every player's progression to a rename that a filesystem refused.
      try {
        writeFileSync(this.path, JSON.stringify(Object.fromEntries(profiles)));
      } catch {
        /* already logged */
      }
    }
  }
}

const numeric = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
