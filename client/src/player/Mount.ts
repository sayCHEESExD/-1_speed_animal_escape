import { animalForSlot, type AnimalAnimationState } from '@animal/shared';
import { Group, Mesh, Object3D } from 'three';
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
  /**
   * Rebuilt when the RIDER is swapped, which is why neither is readonly.
   *
   * A Bloxity avatar is a different model with a different skeleton object, and
   * `PlayerRig` binds to the bones it was handed at construction - so a swap
   * has to rebuild both rather than repoint them.
   */
  riderAnimator: RiderAnimator;
  rig: PlayerRig;

  /** Carries the rider's posting bob. Never the physics transform. */
  private readonly riderVisual = new Group();
  private riderModel: Object3D;

  /**
   * The rider's own nodes, for the Bloxity cosmetics layer.
   *
   * Read-only handles rather than a `dressWith(...)` method: this class owns
   * the mount, not the player's account, and a cosmetics system that had to be
   * taught about here would be one more thing to keep in step. The avatar
   * module hangs items off the BONES inside the model and scales the visual
   * group; nothing it does changes what this class believes.
   */
  get rider(): { visual: Group; model: Object3D } {
    return { visual: this.riderVisual, model: this.riderModel };
  }

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

  /**
   * Swap the rider, keeping the same mount.
   *
   * The mirror of `setAnimalSlot`, and for the same reason: the two halves are
   * independent, so dressing a player as their Bloxity avatar must not disturb
   * the animal they are sitting on, its gait, or where it is standing.
   *
   * Passing null restores the bundled default character, which is what a sign
   * out and every failed asset load resolve to.
   *
   * The rig and the rider animator are REBUILT rather than repointed: both are
   * bound to specific `Bone` objects, and the incoming model has its own. The
   * bind is by NAME and the rest pose is read off whichever model arrives, so
   * the Bloxity skeleton and `player.fbx` are equally valid inputs.
   */
  setRider(model: Object3D | null): void {
    const next = model ?? playerModelLoader.createInstance();
    if (next === this.riderModel) return;

    const previous = this.riderModel;
    previous.removeFromParent();
    releaseRider(previous);

    this.riderModel = next;
    next.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.riderVisual.add(next);

    this.rig = new PlayerRig(next, next);
    this.riderAnimator = new RiderAnimator(this.rig, this.riderVisual);
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

/**
 * Let go of a rider that has been swapped out.
 *
 * ONLY its material, and only when the rider was one this game built for a
 * Bloxity avatar. Geometry is deliberately left alone: part meshes are cached
 * and shared between every player wearing the same item, so disposing one
 * here would empty the arms of everybody else in the room. A default rider
 * shares even its material with every other default rider, which is why the
 * flag is checked rather than assumed.
 */
const releaseRider = (model: Object3D): void => {
  if (model.userData['bloxityRider'] !== true) return;
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
};
