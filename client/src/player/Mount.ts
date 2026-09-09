import { animalForSlot, type AnimalAnimationState } from '@animal/shared';
import { Group, Object3D } from 'three';
import { AnimalModel } from '../animal/AnimalModel.js';
import { AnimalAnimator } from '../animation/AnimalAnimator.js';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { RiderAnimator } from '../animation/RiderAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { playerModelLoader } from './PlayerModelLoader.js';
import { TrailEffect } from './TrailEffect.js';

/**
 * One player: an animal, and the person riding it.
 *
 * The node hierarchy is what makes riding correct, and it is deliberately the
 * only mechanism - there is no per-frame "copy the animal's transform onto the
 * rider" step, because a copy is always a frame late and always slides.
 *
 *   root                    the SIMULATION's transform: position and yaw
 *     animal.root
 *       scaled              the species' scale
 *         body              bob, pitch, roll (the animator writes this)
 *           legs, head, tail
 *           riderAnchor     counter-scaled, so the person stays person-sized
 *             riderVisual   the rider's own posting bob
 *               model       the cloned player FBX
 *
 * Because the rider hangs off the animal's BODY node, it inherits every bit of
 * the gait for free: it cannot clip through the saddle, cannot float above it
 * and cannot slide during movement, whatever the animal does.
 */
export class Mount {
  /** Attach this to the scene. Its transform is the mount's transform. */
  readonly root = new Group();

  /**
   * World-space effects that must NOT follow the mount.
   *
   * A trail is where the player has ALREADY been, so it cannot be parented to
   * a moving root. Whoever adds `root` to the scene adds this too.
   */
  readonly worldRoot = new Group();

  /** The ribbon the equipped trail leaves behind. */
  readonly trail = new TrailEffect();

  animal: AnimalModel;
  animalAnimator: AnimalAnimator;
  readonly riderAnimator: RiderAnimator;
  readonly rig: PlayerRig;

  /** Carries the rider's posting bob. Never the physics transform. */
  private readonly riderVisual = new Group();
  private readonly riderModel: Object3D;

  /** Slot currently built, so a re-equip only rebuilds when it must. */
  private slot: number;

  constructor(slot: number) {
    this.slot = Math.floor(slot);
    this.animal = new AnimalModel(animalForSlot(this.slot));
    this.root.add(this.animal.root);

    this.riderModel = playerModelLoader.createInstance();
    // player.fbx already faces +Z; the offset exists so a re-authored model
    // can be corrected without touching gameplay code.
    this.riderModel.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.riderVisual.add(this.riderModel);
    this.animal.riderAnchor.add(this.riderVisual);

    // Bind against the model's own space, so the rig is independent of where
    // the mount stands or which way it faces.
    this.rig = new PlayerRig(this.riderModel, this.riderModel);
    this.animalAnimator = new AnimalAnimator(this.animal);
    this.riderAnimator = new RiderAnimator(this.rig, this.riderVisual);
    this.worldRoot.add(this.trail.root);
  }

  /** Show the trail the server says this player is wearing. Cosmetic only. */
  setTrailSlot(slot: number): void {
    this.trail.setSlot(slot);
  }

  /**
   * Advance the world-space effects.
   *
   * Separate from `update` because the trail needs the mount's world position
   * and speed, which the animation input does not carry.
   */
  updateEffects(delta: number, x: number, y: number, z: number, speed: number): void {
    this.trail.update(delta, x, y, z, speed);
  }

  /** The animal the server says this player is riding. */
  get animalSlot(): number {
    return this.slot;
  }

  /**
   * Swap the animal, keeping the same rider.
   *
   * Rebuilds only the animal half: the FBX clone, its rig and its animator are
   * expensive and completely independent of which species is underneath, so
   * they are re-parented rather than recreated. Claiming a new animal is
   * therefore instant and cannot drop the rider's pose.
   */
  setAnimalSlot(slot: number): void {
    const next = Math.floor(slot);
    if (next === this.slot) return;
    this.slot = next;

    this.riderVisual.removeFromParent();
    this.animal.dispose();

    this.animal = new AnimalModel(animalForSlot(next));
    this.root.add(this.animal.root);
    this.animal.riderAnchor.add(this.riderVisual);

    this.animalAnimator = new AnimalAnimator(this.animal);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  /**
   * Scale the whole mount, for the death squash and the arrival pop.
   *
   * Written to `animal.root` rather than to `root`, which is the physics
   * transform gameplay owns - the same rule that stops the animators moving
   * the player.
   */
  setVisualScale(x: number, y: number, z: number): void {
    this.animal.root.scale.set(x, y, z);
  }

  /**
   * Advance both animators.
   *
   * The animal runs first and hands the rider its gait phase, so the two
   * bounce to one cycle rather than to two clocks that drift apart.
   */
  update(delta: number, input: AnimationInput): void {
    this.animalAnimator.update(delta, input);
    this.riderAnimator.update(delta, input, this.animalAnimator.gaitPhase);
  }

  get animationState(): AnimalAnimationState {
    return this.animalAnimator.currentState;
  }

  /** Height from hooves to crown, for floating labels. */
  get height(): number {
    return this.animal.height;
  }

  /** Clear animation state, e.g. after a server-issued respawn. */
  resetAnimation(): void {
    this.animalAnimator.reset();
    this.riderAnimator.reset();
    this.animal.root.scale.set(1, 1, 1);
    // The ribbon describes a run that no longer exists; keeping it would draw
    // a line from wherever the player died to wherever they came back.
    this.trail.clear();
  }

  dispose(): void {
    this.animal.dispose();
    this.trail.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}
