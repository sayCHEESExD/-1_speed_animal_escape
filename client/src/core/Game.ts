import {
  STARTER_ANIMAL_SLOT,
  type RespawnMessage,
  type StageAwardedMessage,
} from '@animal/shared';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader, type PlayerModelReport } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { RunController } from '../progression/RunController.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { Panel, anyPanelOpen } from '../ui/Panel.js';
import { RailButton } from '../ui/RailButton.js';
import { RebootPanel } from '../ui/RebootPanel.js';
import { SpeedHud } from '../ui/SpeedHud.js';
import { TrailShop } from '../ui/TrailShop.js';
import { WinsCounter } from '../ui/WinsCounter.js';
import { ICONS, injectHudStyles } from '../ui/hudStyles.js';
import { logger } from '../util/logger.js';
import { CourseWorld } from '../world/CourseWorld.js';

const SCOPE = 'Game';

/**
 * Composition root.
 *
 * Owns every subsystem and defines the per-frame update order, and holds no
 * gameplay rules of its own. The order below is the only thing here that
 * matters, and it is deliberate: input, then prediction, then triggers, then
 * the camera, then the network, then the render.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly remotePlayers: RemotePlayerManager;
  private readonly hud: SpeedHud;
  private readonly wins: WinsCounter;
  private readonly rail: HTMLDivElement;
  private readonly rebootButton: RailButton;
  private readonly trailButton: RailButton;
  private readonly rebootPanel: RebootPanel;
  private readonly trailShop: TrailShop;
  private readonly network: NetworkClient;
  private readonly world = new CourseWorld();
  private readonly run: RunController;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;
  private modelReport: PlayerModelReport | null = null;

  /**
   * The client's estimate of the server's clock.
   *
   * Advanced by the frame delta and re-based whenever a fresher `elapsed`
   * arrives. Freezing it between patches would make the sinking platforms and
   * the rolling balls stutter at the patch rate rather than run smoothly.
   */
  private worldTime = 0;
  private lastServerTime = -1;

  /** Authoritative respawn waiting for the death animation to finish. */
  private pendingRespawn: RespawnMessage | null = null;

  /** Last replicated owned-animal mask, so the stands only relight on change. */
  private lastOwnedAnimals = -1;

  constructor(container: HTMLElement) {
    injectHudStyles();
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.hud = new SpeedHud(container);
    this.wins = new WinsCounter(container);

    // The left rail. Two tiles for now, laid out so a third can be added
    // without re-spacing the others.
    this.rail = document.createElement('div');
    this.rail.className = 'aoe-rail';
    container.appendChild(this.rail);

    this.rebootPanel = new RebootPanel(container, () => this.network.requestReboot());
    this.trailShop = new TrailShop(container, {
      buy: (slot) => this.network.buyTrail(slot),
      equip: (slot) => this.network.equipTrail(slot),
    });

    this.rebootButton = new RailButton(this.rail, {
      variant: 'reboot',
      label: 'Reboot',
      icon: ICONS.reboot,
      onClick: () => this.openOnly(this.rebootPanel),
    });
    this.trailButton = new RailButton(this.rail, {
      variant: 'trail',
      label: 'Trails',
      icon: ICONS.trail,
      onClick: () => this.openOnly(this.trailShop),
    });

    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
      },
      onPlayerAdded: (sessionId, player) => this.onPlayerAdded(sessionId, player),
      onPlayerChanged: (sessionId, player) => this.onPlayerChanged(sessionId, player),
      onPlayerRemoved: (sessionId) => this.remotePlayers.remove(sessionId),
      onRespawn: (message) => {
        // The server's authoritative respawn. HELD rather than applied at once:
        // the client is usually mid-animation, and the whole point of the death
        // transition is that nothing moves the mount until it ends.
        // `acknowledgeRespawn` lifts the reconciliation barrier here, because
        // every patch the server sends after this message is post-respawn.
        this.pendingRespawn = message;
        this.localPlayer?.acknowledgeRespawn();
        this.applyPendingRespawn();
      },
      onStageAwarded: (message) => this.onStageAwarded(message),
    });

    this.run = new RunController(this.world.collision, {
      claimStage: (index) => {
        // Flush the pending input first: the server validates the claim against
        // the last position it has SIMULATED, so the movement that carried the
        // player onto the pad must be consumed before the request arrives.
        this.flushInput();
        this.network.claimStage(index);
      },
      claimAnimal: (slot) => {
        this.flushInput();
        this.network.claimAnimal(slot);
      },
    });
  }

  /**
   * Open one panel and close the other.
   *
   * Two modals over each other is a state with no way back to the game, and
   * the rail makes it one click away.
   */
  private openOnly(panel: Panel): void {
    for (const other of [this.rebootPanel, this.trailShop]) {
      if (other !== panel) other.setOpen(false);
    }
    panel.toggle();
  }

  /** Load assets and build the world. Networking is started separately. */
  async initialise(): Promise<PlayerModelReport> {
    this.world.addTo(this.sceneManager.scene);

    this.modelReport = await playerModelLoader.load();

    this.localPlayer = new LocalPlayer(this.world.collision, STARTER_ANIMAL_SLOT);
    this.sceneManager.scene.add(this.localPlayer.mount.root);
    // The trail lives in world space, so it is added beside the mount.
    this.sceneManager.scene.add(this.localPlayer.mount.worldRoot);
    this.camera.snapTo(this.localPlayer.position);

    logger.info(SCOPE, 'world ready');
    return this.modelReport;
  }

  /** Join the Colyseus room. Rendering continues even if this fails. */
  async connect(): Promise<void> {
    await this.network.connect();
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
  }

  stop(): void {
    this.input.detach();
    void this.network.disconnect();
  }

  /** One simulation and render step. Called by GameLoop. */
  update(delta: number, _now: number): void {
    // A panel owns the input while it is up; closing it hands control straight
    // back on the next frame.
    this.input.setSuppressed(anyPanelOpen());
    const input = this.input.sample();
    const player = this.localPlayer;

    // The MOUSE aims the camera, and the camera defines forward. Nothing the
    // player presses rotates the view.
    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);

    // The world clock, advanced locally between patches. Sinking platforms and
    // rolling balls are pure functions of it on BOTH sides, so the client has
    // to keep its own estimate rather than freezing between server updates.
    this.worldTime =
      this.network.elapsed > this.lastServerTime
        ? this.network.elapsed
        : this.worldTime + delta;
    this.lastServerTime = this.network.elapsed;
    const elapsed = this.worldTime;

    const elephant = this.network.elephant;
    if (elephant) {
      this.world.elephant.apply(
        elephant.x,
        elephant.z,
        elephant.rotationY,
        elephant.charging,
      );
    }

    if (player) {
      player.setWorldTime(elapsed);
      // Camera-relative movement: forward is whichever way the camera faces.
      // The animal's own facing then follows where it actually moves, which
      // the shared simulation does identically on both sides.
      player.update(delta, input, this.input.look.yaw);

      // Triggers are sampled after the mount has moved, so a finish pad or a
      // hazard is detected at the position actually reached this frame.
      this.run.update(delta, player, elapsed);

      // The death animation has run its course; place the player, preferring
      // the server's own transform when it has already arrived.
      if (player.deathComplete) this.applyPendingRespawn();

      this.snapCameraIfPlaced();
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(
        player.position.x,
        player.position.y,
        player.position.z,
      );
      this.flushInput();
    }

    this.world.update(delta, elapsed);
    this.remotePlayers.advance(delta);
    this.camera.update(delta, player?.horizontalSpeed ?? 0);

    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  /**
   * Hand every simulated input to the network.
   *
   * Every one must be sent: the server advances only by the inputs it
   * receives, so a dropped input is authoritative movement that never happens.
   */
  private flushInput(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
  }

  /**
   * Apply the server's respawn, once the death animation has finished.
   *
   * Held until then on purpose: applying it mid-animation would teleport the
   * mount away from the fall the player is watching.
   */
  private applyPendingRespawn(): void {
    const player = this.localPlayer;
    const message = this.pendingRespawn;
    if (!player || !message) return;
    if (player.isDying && !player.deathComplete) return;

    this.pendingRespawn = null;
    player.teleport(message.x, message.y, message.z, message.rotationY);
  }

  /** Arrive rather than ease whenever the player was PLACED, not moved. */
  private snapCameraIfPlaced(): void {
    const player = this.localPlayer;
    if (!player) return;
    const placement = player.consumePlacement();
    if (placement === 'none') return;
    // Only a respawn is allowed to be seen. A network correction must arrive
    // invisibly, or ordinary packet loss would fire the dolly.
    this.camera.snapTo(player.position, placement === 'respawn');
  }

  private onPlayerAdded(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.add(sessionId, state);
  }

  private onPlayerChanged(sessionId: string, state: NetPlayerState): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    this.remotePlayers.update(sessionId, state);
  }

  /**
   * Everything the server says about the local player.
   *
   * The client reconciles its prediction against the transform, adopts the
   * authoritative movement profile, shows the animal it is told to show and
   * renders the progression it is told to render. It derives none of it.
   */
  private applyLocalState(state: NetPlayerState): void {
    const player = this.localPlayer;
    if (!player) return;

    player.setMovementProfile(state.moveMultiplier, state.jumpVelocity);
    player.setAnimalSlot(state.animalSlot);

    if (state.ready) {
      player.reconcile({
        x: state.x,
        y: state.y,
        z: state.z,
        rotationY: state.rotationY,
        velocityX: state.velocityX,
        velocityY: state.velocityY,
        velocityZ: state.velocityZ,
        grounded: state.grounded,
        jumpCount: state.jumpCount,
        lastInputSeq: state.lastInputSeq,
        jumpLatched: state.jumpLatched,
        coyote: state.coyote,
      });
    }

    player.setTrailSlot(state.trailSlot);

    this.hud.update(state.totalSpeed, state.maxLevel, state.rebirths);
    this.wins.update(state.wins);
    this.run.setInventory(state.ownedAnimals, state.wins);

    // The rail mirrors replicated state and decides nothing. A tile is "ready"
    // when the server would accept the request behind it right now.
    this.rebootPanel.setProgress(state.level, state.rebirths);
    this.rebootButton.setState(this.rebootPanel.isEligible, !this.rebootPanel.isEligible);
    this.trailShop.setInventory(state.wins, state.ownedTrails, state.trailSlot);
    this.trailButton.setState(this.trailShop.hasAffordable);

    if (state.ownedAnimals !== this.lastOwnedAnimals) {
      this.lastOwnedAnimals = state.ownedAnimals;
      this.world.stands.setOwned(state.ownedAnimals);
    }
  }

  private onStageAwarded(message: StageAwardedMessage): void {
    // The counter pops from the replicated total on the next patch anyway;
    // applying it here means the reward lands on the frame it was earned
    // rather than up to a patch later.
    this.wins.update(message.total);
    logger.info(SCOPE, `stage ${message.stageIndex} banked: +${message.wins} wins`);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.stop();
    this.hud.dispose();
    this.wins.dispose();
    this.rebootButton.dispose();
    this.trailButton.dispose();
    this.rebootPanel.dispose();
    this.trailShop.dispose();
    this.rail.remove();
    this.remotePlayers.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
