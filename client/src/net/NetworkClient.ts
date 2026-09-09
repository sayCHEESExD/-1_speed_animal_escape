import {
  MessageType,
  ROOM_NAME,
  type ClaimAnimalMessage,
  type ClaimStageMessage,
  type MoveMessage,
  type RespawnMessage,
  type StageAwardedMessage,
} from '@animal/shared';
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { clientConfig } from '../config/clientConfig.js';
import { logger } from '../util/logger.js';
import type { ConnectionStatus, NetCourseState, NetPlayerState } from './netTypes.js';

const SCOPE = 'NetworkClient';

/** Key under which this browser's stable player id is kept. */
const PLAYER_ID_KEY = 'animalobby.playerId';

/**
 * Backoff between join attempts, in milliseconds. One entry per RETRY.
 *
 * A free managed host suspends an idle service and takes the better part of a
 * minute to wake it, so the first visitor after a quiet spell always meets a
 * server that is not listening yet. A single attempt turns that into a session
 * that is permanently offline - it renders and it moves, so it looks healthy,
 * but nothing is server-authoritative and therefore nothing progresses. These
 * retries turn a cold start into a slow start instead.
 */
const JOIN_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * A stable id for this browser, so progression survives a reload.
 *
 * Falls back to a throwaway id when storage is unavailable (private windows,
 * blocked site data) - the session still works, it just will not be restored.
 */
const resolvePlayerId = (): string => {
  const fresh = `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    const existing = window.localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    window.localStorage.setItem(PLAYER_ID_KEY, fresh);
  } catch {
    return fresh;
  }
  return fresh;
};

/** Everything the game needs to react to. Kept deliberately small. */
export interface NetworkHandlers {
  onStatusChange?(status: ConnectionStatus, detail?: string): void;
  onSelfJoined?(sessionId: string): void;
  onPlayerAdded?(sessionId: string, player: NetPlayerState): void;
  onPlayerChanged?(sessionId: string, player: NetPlayerState): void;
  onPlayerRemoved?(sessionId: string): void;
  onRespawn?(message: RespawnMessage): void;
  onStageAwarded?(message: StageAwardedMessage): void;
}

/**
 * Thin wrapper over colyseus.js.
 *
 * The rest of the client never imports colyseus.js directly - swapping the
 * transport or the room name only touches this file and @animal/shared.
 */
export class NetworkClient {
  private readonly client: Client;
  private readonly handlers: NetworkHandlers;

  private room: Room<NetCourseState> | null = null;
  private status: ConnectionStatus = 'idle';

  constructor(handlers: NetworkHandlers = {}) {
    this.client = new Client(clientConfig.serverUrl);
    this.handlers = handlers;
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * The server's clock, in seconds.
   *
   * The moving hazards are a pure function of it, so this is what the client
   * evaluates `hazardXAt` against - which is why the sphere on screen is in
   * the same place as the one the server will kill you with.
   */
  get elapsed(): number {
    return this.room?.state?.elapsed ?? 0;
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    logger.info(SCOPE, `joining "${ROOM_NAME}" at ${clientConfig.serverUrl}`);

    const playerId = resolvePlayerId();
    const attempts = JOIN_BACKOFF_MS.length + 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        this.room = await this.client.joinOrCreate<NetCourseState>(ROOM_NAME, {
          playerId,
        });
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logger.warn(SCOPE, `join attempt ${attempt}/${attempts} failed: ${detail}`);

        if (attempt === attempts) {
          this.setStatus('error', detail);
          logger.error(SCOPE, 'join failed:', detail);
          throw error;
        }

        // Kept in 'connecting' with the attempt as the detail, so the status
        // listener sees a wake-up in progress rather than a dead connection.
        this.setStatus('connecting', `attempt ${attempt + 1}/${attempts}`);
        await sleep(JOIN_BACKOFF_MS[attempt - 1] ?? 0);
      }
    }

    if (!this.room) throw new Error('join produced no room');

    this.bindRoom(this.room);
    this.setStatus('connected');
    logger.info(
      SCOPE,
      `joined roomId=${this.room.roomId} sessionId=${this.room.sessionId}`,
    );
    this.handlers.onSelfJoined?.(this.room.sessionId);
  }

  /**
   * Report one simulated input.
   *
   * Deliberately NOT rate limited. The client simulates on a fixed 60Hz step
   * and the server advances only by the inputs it receives, so throttling here
   * would leave the authoritative position permanently behind the player. The
   * message is seven small fields.
   */
  sendInput(message: MoveMessage): void {
    this.room?.send(MessageType.Move, message);
  }

  /** Ask the server to bank a stage. The server decides; this never grants. */
  claimStage(stageIndex: number): void {
    const message: ClaimStageMessage = { stageIndex };
    this.room?.send(MessageType.ClaimStage, message);
  }

  /** Ask the server for an animal. The server takes the payment. */
  claimAnimal(slot: number): void {
    const message: ClaimAnimalMessage = { slot };
    this.room?.send(MessageType.ClaimAnimal, message);
  }

  /**
   * Ask to reboot.
   *
   * Carries nothing: the server knows the level and the reboot count and is
   * the only thing allowed to decide whether the requirement is met.
   */
  requestReboot(): void {
    this.room?.send(MessageType.Reboot, {});
  }

  /** Ask to buy a trail. The server decides and replicates the result. */
  buyTrail(slot: number): void {
    this.room?.send(MessageType.BuyTrail, { slot });
  }

  /** Ask to wear an owned trail, or 0 to take it off. */
  equipTrail(slot: number): void {
    this.room?.send(MessageType.EquipTrail, { slot });
  }

  /** The replicated elephant, or null before the first patch. */
  get elephant(): { x: number; z: number; rotationY: number; charging: boolean } | null {
    const state = this.room?.state?.elephant;
    return state
      ? { x: state.x, z: state.z, rotationY: state.rotationY, charging: state.charging }
      : null;
  }

  /**
   * Ask to be put back at the last checkpoint.
   *
   * A request with no payload. The server decides where a respawn lands and
   * replies with the authoritative `Respawn`, so this can no more move a
   * player than a stage claim can pay one.
   */
  requestRespawn(): void {
    this.room?.send(MessageType.RequestRespawn, {});
  }

  async disconnect(): Promise<void> {
    await this.room?.leave(true);
    this.room = null;
    this.setStatus('disconnected');
  }

  private bindRoom(room: Room<NetCourseState>): void {
    const $ = getStateCallbacks(room);

    $(room.state).players.onAdd((player, sessionId) => {
      this.handlers.onPlayerAdded?.(sessionId, player);
      $(player).onChange(() => {
        this.handlers.onPlayerChanged?.(sessionId, player);
      });
    });

    $(room.state).players.onRemove((_player, sessionId) => {
      this.handlers.onPlayerRemoved?.(sessionId);
    });

    room.onMessage<RespawnMessage>(MessageType.Respawn, (message) => {
      this.handlers.onRespawn?.(message);
    });

    room.onMessage<StageAwardedMessage>(MessageType.StageAwarded, (message) => {
      this.handlers.onStageAwarded?.(message);
    });

    room.onError((code, message) => {
      logger.error(SCOPE, `room error ${code}: ${message ?? ''}`);
      this.setStatus('error', message);
    });

    room.onLeave((code) => {
      logger.warn(SCOPE, `left room (code ${code})`);
      this.setStatus('disconnected', `code ${code}`);
    });
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatusChange?.(status, detail);
  }
}
