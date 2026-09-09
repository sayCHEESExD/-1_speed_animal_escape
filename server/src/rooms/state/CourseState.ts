import { MapSchema, Schema, type } from '@colyseus/schema';
import { PlayerState } from './PlayerState.js';

/**
 * The elephant of stage 5.
 *
 * The one hazard that is replicated rather than derived, because it CHASES -
 * its position depends on where the players are, which is state and not a
 * formula. The server owns every field here; the client draws them and does
 * nothing else with them.
 */
export class ElephantState extends Schema {
  @type('float32') x = 0;
  @type('float32') z = 0;
  @type('float32') rotationY = 0;
  /** True while it has noticed someone. Drives the run cycle and the trumpet. */
  @type('boolean') charging = false;
}

/** Root replicated state for a single world instance. */
export class CourseState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /**
   * Server uptime in seconds.
   *
   * Not a diagnostic: it is the CLOCK that the rolling balls, the sweepers and
   * the sinking platforms are pure functions of. The server evaluates them
   * against this to decide a death, and the client evaluates the identical
   * functions against the replicated value to draw them - so there is no
   * hazard state on the wire at all.
   */
  @type('float64') elapsed = 0;

  @type(ElephantState) elephant = new ElephantState();
}
