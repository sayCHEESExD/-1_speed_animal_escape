import {
  STARTER_ANIMAL_SLOT,
  type RespawnMessage,
  type StageAwardedMessage,
} from '@animal/shared';
import { AudioManager } from '../audio/AudioManager.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { Vector3 } from 'three';
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
import { RebirthPanel } from '../ui/RebirthPanel.js';
import { SpeedHud } from '../ui/SpeedHud.js';
import { SpeedPopups } from '../ui/SpeedPopups.js';
import { TrailShop } from '../ui/TrailShop.js';
import { WinFlight } from '../ui/WinFlight.js';
import { WinsCounter } from '../ui/WinsCounter.js';
import { ICONS, injectHudStyles } from '../ui/hudStyles.js';
import { logger } from '../util/logger.js';
import { CourseWorld } from '../world/CourseWorld.js';

const SCOPE = 'Game';

/** Scratch for projecting the mount to the screen. One award allocates nothing. */
const WIN_FLIGHT_ORIGIN = new Vector3();

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
  private readonly pops: SpeedPopups;
  private readonly wins: WinsCounter;
  private readonly winFlight: WinFlight;
  private readonly rail: HTMLDivElement;
  private readonly rebirthButton: RailButton;
  private readonly trailButton: RailButton;
  private readonly audioButton: RailButton;
  private readonly audio = new AudioManager();
  private readonly playerAudio: PlayerAudio;
  private readonly hint: HTMLDivElement;
  private readonly rebirthPanel: RebirthPanel;
  private readonly trailShop: TrailShop;
  private readonly network: NetworkClient;
  private readonly world = new CourseWorld();
  private readonly run: RunController;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;

  /** Replicated figures the audio reacts to, so it reacts to CHANGES. */
  private lastLevel = -1;
  private lastRebirths = -1;
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
    this.pops = new SpeedPopups(container);
    this.wins = new WinsCounter(container);
    this.winFlight = new WinFlight(container);

    // The left rail. Two tiles for now, laid out so a third can be added
    // without re-spacing the others.
    this.rail = document.createElement('div');
    this.rail.className = 'aoe-rail';
    container.appendChild(this.rail);

    this.rebirthPanel = new RebirthPanel(container, () => this.network.requestRebirth());
    this.trailShop = new TrailShop(container, {
      buy: (slot) => this.network.buyTrail(slot),
      equip: (slot) => this.network.equipTrail(slot),
    });

    this.rebirthButton = new RailButton(this.rail, {
      variant: 'rebirth',
      label: 'Rebirth',
      icon: ICONS.rebirth,
      onClick: () => this.openOnly(this.rebirthPanel),
    });
    this.trailButton = new RailButton(this.rail, {
      variant: 'trail',
      label: 'Trails',
      icon: ICONS.trail,
      onClick: () => this.openOnly(this.trailShop),
    });
    this.audioButton = new RailButton(this.rail, {
      variant: 'audio',
      label: 'Sound',
      icon: ICONS.audio,
      onClick: () => {
        // The ONE place muting happens, whether it was a click or the M key.
        const muted = this.audio.toggleMuted();
        this.audioButton.root.classList.toggle('aoe-tile--off', muted);
      },
    });

    this.playerAudio = new PlayerAudio(this.audio);

    /*
     * The hint that makes the rail reachable on a desktop.
     *
     * Pointer lock hides the cursor, so without being told, a mouse-and-
     * keyboard player has no way to know these buttons can be clicked at all.
     * It shows while the cursor is captured and swaps to the way back as soon
     * as it is not - both driven by the class `MouseLook` sets, so the hint
     * cannot disagree with the actual input state.
     */
    this.hint = document.createElement('div');
    this.hint.className = 'aoe-hint aoe-font';
    this.hint.innerHTML =
      '<span class="aoe-hint__locked">Esc for cursor &middot; R Rebirth &middot; T Trails</span>' +
      '<span class="aoe-hint__free">Click the world to play on</span>';
    container.appendChild(this.hint);

    window.addEventListener('keydown', this.onHotkey);
    // Audio can only start on a real gesture, and no single one of them is
    // guaranteed to be the one the browser accepts - so every gesture asks,
    // and `resume` is written to be safe to call repeatedly.
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });

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
   * Keys that open the menus.
   *
   * Point 12's other half: a panel that can only be reached by clicking a
   * button the cursor cannot reach is not reachable, so there is a key for
   * each one as well. Ignored while the player is typing, and ignored with a
   * modifier held, so browser shortcuts still work.
   */
  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;

    /*
     * A key PRESSES THE BUTTON. It does not do the same thing as the button.
     *
     * `RailButton.press()` dispatches the tile's own click, so the key path and
     * the mouse path run one handler between them - and a key can never drift
     * into doing almost-but-not-quite what the tile it stands for does. The
     * mute key used to toggle the audio itself and repaint the tile by hand,
     * which is two copies of one action waiting to disagree.
     */
    switch (event.code) {
      case 'KeyR':
        this.rebirthButton.press();
        break;
      case 'KeyT':
        this.trailButton.press();
        break;
      case 'KeyM':
        this.audioButton.press();
        break;
      case 'Escape':
        // The browser releases the lock on Escape whatever the page wants, so
        // this only closes whatever was open - `MouseLook` handles the cursor.
        for (const panel of [this.rebirthPanel, this.trailShop]) panel.setOpen(false);
        this.input.look.setCursorFree(true);
        break;
      default:
        break;
    }
  };

  /** Any real gesture is permission to start audio. */
  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  /**
   * Open one panel and close the other.
   *
   * Two modals over each other is a state with no way back to the game, and
   * the rail makes it one click away.
   */
  private openOnly(panel: Panel): void {
    for (const other of [this.rebirthPanel, this.trailShop]) {
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

      // Still not placed. The prediction and the server disagreed about the
      // death, so ASK for a placement rather than sit frozen waiting for one
      // that was never coming. The server answers this the same way it answers
      // any other death - by putting the player at the spawn.
      if (player.consumeRespawnNudge()) {
        logger.warn(SCOPE, 'death was not acknowledged; requesting a respawn');
        this.network.requestRespawn();
      }

      this.snapCameraIfPlaced();
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(
        player.position.x,
        player.position.y,
        player.position.z,
      );
      this.flushInput();
    }

    if (player) this.playerAudio.update(delta, player);
    // The boards redraw only when the standings actually move, so handing them
    // the snapshot every frame costs a string compare.
    this.world.scoreboard.update(this.network.leaderboard);
    this.pops.update(delta);
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
    // Only an INCREASE in the replicated total spawns a popup, so the figure
    // simply being re-sent on every patch never does.
    this.pops.observe(state.totalSpeed);
    this.wins.update(state.wins);
    this.run.setInventory(state.ownedAnimals, state.wins);

    // The rail mirrors replicated state and decides nothing. A tile is "ready"
    // when the server would accept the request behind it right now.
    // Milestone sounds fire on the CHANGE, never on the value: a level is
    // re-sent on every patch, and playing on the level would be a fanfare
    // twenty times a second for as long as the player stayed at it.
    if (this.lastLevel >= 0 && state.level > this.lastLevel) this.audio.play('level');
    if (this.lastRebirths >= 0 && state.rebirths > this.lastRebirths) {
      this.audio.play('rebirth');
    }
    this.lastLevel = state.level;
    this.lastRebirths = state.rebirths;

    this.rebirthPanel.setProgress(state.level, state.rebirths);
    this.rebirthButton.setState(this.rebirthPanel.isEligible, !this.rebirthPanel.isEligible);
    this.trailShop.setInventory(state.wins, state.ownedTrails, state.trailSlot);
    this.trailButton.setState(this.trailShop.hasAffordable);

    if (state.ownedAnimals !== this.lastOwnedAnimals) {
      if (this.lastOwnedAnimals !== 0) this.audio.play('claim');
      this.lastOwnedAnimals = state.ownedAnimals;
      this.world.stands.setOwned(state.ownedAnimals);
    }
  }

  private onStageAwarded(message: StageAwardedMessage): void {
    // The counter pops from the replicated total on the next patch anyway;
    // applying it here means the reward lands on the frame it was earned
    // rather than up to a patch later.
    // Trophies first, then the figure. They are launched from where the mount
    // actually is on screen, projected once here rather than tracked per
    // frame - the flight is half a second and the player does not move during
    // it, because banking a stage has already returned them to the arena.
    this.launchWinFlight();
    this.wins.update(message.total);
    this.audio.play('win');
    logger.info(SCOPE, `stage ${message.stageIndex} banked: +${message.wins} wins`);
  }

  /**
   * Project the mount to the screen and send the trophies from there.
   *
   * Falls back to the middle of the screen if there is no player yet, so the
   * effect can never be the thing that throws during an award.
   */
  private launchWinFlight(): void {
    const canvas = this.renderer.renderer.domElement;
    const box = canvas.getBoundingClientRect();
    let x = box.left + box.width / 2;
    let y = box.top + box.height / 2;

    const player = this.localPlayer;
    if (player) {
      WIN_FLIGHT_ORIGIN.copy(player.position);
      WIN_FLIGHT_ORIGIN.y += 2;
      WIN_FLIGHT_ORIGIN.project(this.camera.camera);
      // Behind the camera projects to a mirrored point in front of it, which
      // would fling the trophies off the wrong edge.
      if (WIN_FLIGHT_ORIGIN.z < 1) {
        x = box.left + ((WIN_FLIGHT_ORIGIN.x + 1) / 2) * box.width;
        y = box.top + ((1 - WIN_FLIGHT_ORIGIN.y) / 2) * box.height;
      }
    }

    this.winFlight.play(x, y);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.stop();
    this.hud.dispose();
    this.pops.dispose();
    this.wins.dispose();
    this.winFlight.dispose();
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    this.audio.dispose();
    this.hint.remove();
    this.rebirthButton.dispose();
    this.trailButton.dispose();
    this.audioButton.dispose();
    this.rebirthPanel.dispose();
    this.trailShop.dispose();
    this.rail.remove();
    this.remotePlayers.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
