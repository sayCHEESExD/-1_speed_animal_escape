import { Client, Room } from '@colyseus/core';
import {
  AnimalAnimationState,
  MessageType,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  createMotion,
  type BuyTrailMessage,
  type ClaimAnimalMessage,
  type ClaimStageMessage,
  type EquipTrailMessage,
  type MoveMessage,
  type PlayerMotion,
  type RespawnMessage,
  type RespawnReason,
  type StageAwardedMessage,
} from '@animal/shared';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService } from '../movement/MovementService.js';
import { AnimalService } from '../progression/AnimalService.js';
import { profileStore } from '../progression/ProfileStore.js';
import { RebootService } from '../progression/RebootService.js';
import { SpeedService } from '../progression/SpeedService.js';
import { StageService } from '../progression/StageService.js';
import { TrailService } from '../progression/TrailService.js';
import { ElephantService } from '../world/ElephantService.js';
import { logger } from '../util/logger.js';
import { CourseState } from './state/CourseState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'CourseRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 15;

/** Options a client may pass on join. Both are cosmetic or identity only. */
interface JoinOptions {
  playerId?: string;
  name?: string;
}

/**
 * The authoritative room.
 *
 * Composition only: every rule lives in a service, and this decides the order
 * they run in. What it owns outright is the CLOCK - `state.elapsed` is what
 * the moving hazards are a pure function of, so a hazard death is decided
 * against the server's own time and never against a client's.
 *
 * The one hard rule: nothing a client sends is ever copied into state. A Move
 * is simulated, a claim is validated, and both produce a result the server
 * writes itself.
 */
export class CourseRoom extends Room<CourseState> {
  override maxClients = 24;

  private readonly movement = new MovementService();
  private readonly speeds = new SpeedService();
  private readonly stages = new StageService();
  private readonly animals = new AnimalService();
  private readonly reboots = new RebootService();
  private readonly trails = new TrailService();
  private readonly elephant = new ElephantService();

  /** Browser-stored player id per session, for persistence. */
  private readonly playerIds = new Map<string, string>();

  /** Scratch motion, so the per-tick death check allocates nothing. */
  private readonly scratch: PlayerMotion = createMotion();

  private autosaveTimer = 0;

  override onCreate(): void {
    this.state = new CourseState();
    this.setPatchRate(serverConfig.patchRateMs);

    this.onMessage(MessageType.Move, (client, message: MoveMessage) =>
      this.onMove(client, message),
    );
    this.onMessage(MessageType.ClaimStage, (client, message: ClaimStageMessage) =>
      this.onClaimStage(client, message),
    );
    this.onMessage(MessageType.ClaimAnimal, (client, message: ClaimAnimalMessage) =>
      this.onClaimAnimal(client, message),
    );
    this.onMessage(MessageType.RequestRespawn, (client) =>
      this.respawn(client, 'manual'),
    );
    this.onMessage(MessageType.Reboot, (client) => this.onReboot(client));
    this.onMessage(MessageType.BuyTrail, (client, message: BuyTrailMessage) =>
      this.onBuyTrail(client, message),
    );
    this.onMessage(MessageType.EquipTrail, (client, message: EquipTrailMessage) =>
      this.onEquipTrail(client, message),
    );

    this.elephant.reset(this.state.elephant);

    this.setSimulationInterval(
      (deltaMs) => this.tick(deltaMs / 1000),
      serverConfig.patchRateMs,
    );

    logger.info(SCOPE, `room ${this.roomId} created`);
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;

    const playerId = typeof options.playerId === 'string' ? options.playerId.slice(0, 64) : '';
    if (playerId) this.playerIds.set(client.sessionId, playerId);

    // Restore BEFORE any service initialises: level, movement speed and the
    // equipped animal are all derived from the restored figures, so restoring
    // afterwards would leave every one of them a step out of date.
    const restored = playerId ? profileStore.restore(playerId, player) : false;

    this.state.players.set(client.sessionId, player);

    this.movement.initialise(player);
    this.animals.initialise(player);
    this.trails.initialise(player);
    this.speeds.initialise(player);
    this.stages.initialise(client.sessionId);
    this.reboots.sync(player);

    // `initialise` reset the level to 1 for a fresh profile; a restored one
    // has to be re-derived from the Speed it came back with.
    if (restored) this.speeds.syncDerived(player);

    // Put the player at spawn through the SAME path a respawn takes, so there
    // is one definition of "where a player belongs" rather than two.
    this.placeAt(client, player, SPAWN_POSITION.z, 'join');

    logger.info(
      SCOPE,
      `join ${client.sessionId} (${restored ? 'restored' : 'new'}) ` +
        `level=${player.level} wins=${player.wins} animal=${player.animalSlot}`,
    );
  }

  override onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const playerId = this.playerIds.get(client.sessionId);
    if (player && playerId) profileStore.save(playerId, player);

    this.state.players.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.speeds.forget(client.sessionId);
    this.stages.forget(client.sessionId);
    this.animals.forget(client.sessionId);
    this.trails.forget(client.sessionId);
    this.playerIds.delete(client.sessionId);

    logger.info(SCOPE, `leave ${client.sessionId}`);
  }

  override onDispose(): void {
    // Every remaining player's progression, made durable before the room dies.
    for (const [sessionId, player] of this.state.players) {
      const playerId = this.playerIds.get(sessionId);
      if (playerId) profileStore.save(playerId, player);
    }
    logger.info(SCOPE, `room ${this.roomId} disposed`);
  }

  /**
   * One input: simulate it, then pay for the movement it actually produced.
   *
   * The ORDER is the whole point. `applyInput` writes the authoritative
   * transform, and only then does `credit` measure the distance between the
   * previous authoritative position and this one. Crediting from the message
   * would be paying a client for a number it chose.
   */
  private onMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (
      !this.movement.applyInput(client.sessionId, player, message, this.state.elapsed)
    ) {
      return;
    }

    this.speeds.credit(client.sessionId, player, this.movement.lastStep);
    player.animation = resolveAnimation(player);
  }

  /** A stage claim. The server validates it against its own transform. */
  private onClaimStage(client: Client, message: ClaimStageMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const index = Number(message?.stageIndex);
    if (!Number.isFinite(index)) return;

    const award = this.stages.claim(client.sessionId, player, index);
    if (!award.granted || !award.stage) return;

    const payload: StageAwardedMessage = {
      stageIndex: award.stage.index,
      wins: award.wins,
      total: player.wins,
    };
    client.send(MessageType.StageAwarded, payload);

    // Banking a stage RETURNS the player to the starting arena. That is the
    // loop the win pad's "Return" label promises, and it is also what makes a
    // second payment impossible: the pad is hundreds of units behind them
    // before another request could arrive.
    this.placeAt(client, player, SPAWN_POSITION.z, 'stage');

    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `stage ${award.stage.index} banked by ${client.sessionId} (+${award.wins} wins, total ${player.wins})`,
    );
  }

  /** An animal claim. The server takes the payment and grants the animal. */
  private onClaimAnimal(client: Client, message: ClaimAnimalMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const slot = Number(message?.slot);
    if (!Number.isFinite(slot)) return;

    const claim = this.animals.claim(player, slot, this.speeds);
    if (!claim.granted || !claim.animal) return;

    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} claimed ${claim.animal.name} (wins left ${player.wins})`,
    );
  }

  /** A reboot request. The server alone decides whether it is allowed. */
  private onReboot(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.reboots.reboot(player, this.speeds);
    if (!result.ok) return;

    // A reboot resets the RUN as well as the curve: the player's level - and
    // therefore their speed - is no longer what carried them to wherever they
    // were standing, so they start again from the arena.
    this.placeAt(client, player, SPAWN_POSITION.z, 'reboot');
    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} rebooted to ${result.reboots} (x${result.multiplier})`,
    );
  }

  /** A trail purchase. The server takes the payment and grants the trail. */
  private onBuyTrail(client: Client, message: BuyTrailMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.trails.buy(player, message?.slot, this.speeds);
    if (!result.ok) return;

    this.persist(client.sessionId, player);
    logger.info(
      SCOPE,
      `${client.sessionId} bought ${result.tier.name} (wins left ${result.winsAfter})`,
    );
  }

  /** Equip an owned trail, or 0 to take it off. */
  private onEquipTrail(client: Client, message: EquipTrailMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.trails.equip(player, message?.slot, this.speeds).ok) return;
    this.persist(client.sessionId, player);
  }

  /**
   * The per-tick pass the client cannot influence.
   *
   * Deaths are decided HERE, from the position the server simulated and the
   * clock the server owns, rather than from a client saying it was hit. There
   * is no hazard message in this game for exactly that reason.
   */
  private tick(delta: number): void {
    this.state.elapsed += delta;
    const time = this.state.elapsed;

    // The elephant CHASES, so it cannot be a pure function of time. The server
    // moves it from the authoritative positions it already has, and the kill
    // below is decided against that same position.
    this.elephant.update(this.state.elephant, delta, this.state.players.values());

    for (const [sessionId, player] of this.state.players) {
      if (!player.ready) continue;

      const triggers = this.movement.collision.sampleTriggers(
        player.x,
        player.y,
        player.z,
        time,
      );
      const trampled = this.elephant.hits(this.state.elephant, player);

      if (triggers.fell || triggers.hazard || trampled) {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        if (client) this.respawn(client, triggers.fell ? 'fell' : 'hazard');
      }
    }

    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      // Speed accrues continuously between the discrete events that otherwise
      // trigger a save, so a crash without this would cost a whole session.
      for (const [sessionId, player] of this.state.players) {
        this.persist(sessionId, player);
      }
    }
  }

  /** Put a player back at their checkpoint and tell them where that is. */
  private respawn(client: Client, reason: RespawnReason): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.placeAt(client, player, this.stages.respawnZFor(player.z), reason);
  }

  /**
   * THE one way a player is placed.
   *
   * Teleports the simulation, drops the Speed baseline (or the teleport itself
   * would be credited as distance travelled), and sends the authoritative
   * transform.
   */
  private placeAt(
    client: Client,
    player: PlayerState,
    z: number,
    reason: RespawnReason,
  ): void {
    this.movement.teleport(
      client.sessionId,
      player,
      SPAWN_POSITION.x,
      SPAWN_POSITION.y,
      z,
      SPAWN_ROTATION_Y,
    );
    this.speeds.reset(client.sessionId, player);
    player.animation = AnimalAnimationState.Idle;
    // A death plays the fall-over. Arriving, banking a stage and rebooting are
    // all PLACEMENTS rather than deaths, so none of them bumps the counter.
    if (reason === 'fell' || reason === 'hazard') player.deathCount += 1;

    const message: RespawnMessage = {
      x: SPAWN_POSITION.x,
      y: SPAWN_POSITION.y,
      z,
      rotationY: SPAWN_ROTATION_Y,
      reason,
    };
    client.send(MessageType.Respawn, message);

    // Every placement is logged with its cause. A player who finds themselves
    // back at the arena and cannot say why is the hardest bug in this game to
    // diagnose from the outside, and one line here answers it.
    if (reason !== 'join') {
      logger.info(SCOPE, `place ${client.sessionId} -> z=${z.toFixed(0)} (${reason})`);
    }
  }

  private persist(sessionId: string, player: PlayerState): void {
    const playerId = this.playerIds.get(sessionId);
    if (playerId) profileStore.save(playerId, player);
  }
}

/**
 * The animation state a replicated player is in.
 *
 * Derived from motion the server already owns rather than reported by the
 * client, so a remote character can never be made to play an animation its
 * actual movement does not justify. Presentation, but presentation the server
 * is the source of.
 */
const resolveAnimation = (player: PlayerState): AnimalAnimationState => {
  // A player on a belt is travelling nowhere but is very much running, so the
  // replicated state has to say so - reporting `idle` would be the one field
  // on the wire that disagrees with what everybody can see.
  if (player.treadmill > 0) return AnimalAnimationState.Gallop;
  if (!player.grounded) {
    return player.verticalVelocity > 2
      ? AnimalAnimationState.JumpStart
      : AnimalAnimationState.Airborne;
  }
  const walkThreshold = 0.6;
  if (player.speed < walkThreshold) return AnimalAnimationState.Idle;
  // The gallop threshold scales with the player's own authoritative speed, so
  // a level-80 mount is not permanently "walking" at eighty units a second.
  return player.speed > player.moveMultiplier * 16
    ? AnimalAnimationState.Gallop
    : AnimalAnimationState.Walk;
};
