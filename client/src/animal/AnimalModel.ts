import { animalForSlot, type AnimalDefinition } from '@animal/shared';
import { Group, Mesh, MeshLambertMaterial } from 'three';
import { animalParts, type AnimalParts } from './AnimalGeometry.js';

/**
 * ONE material for every animal in the scene.
 *
 * Colour lives in the vertices, so a lion and a panda are the same draw
 * state - which is what lets the lobby show ten different species without ten
 * material uploads. Lambert rather than Standard: the art direction is flat
 * and unlit-looking, and a PBR shader would spend its whole cost on
 * roughness the style deliberately does not have.
 */
let sharedMaterial: MeshLambertMaterial | null = null;

const material = (): MeshLambertMaterial => {
  sharedMaterial ??= new MeshLambertMaterial({ vertexColors: true });
  return sharedMaterial;
};

/**
 * A built, animatable animal.
 *
 * The node tree is the animation contract: `AnimalAnimator` writes to these
 * nodes and to nothing else, and the simulation writes only to `root`. That
 * separation is why an animation can never move the player - the same rule the
 * previous game's rig followed, applied to a quadruped.
 *
 *   root         placed by gameplay: world position and facing
 *     scaled     the species' uniform scale
 *       body     bob, pitch and roll. Everything else hangs off this.
 *         head   nod and turn
 *         tail   sway
 *         hip x4 -> knee x4   the gait
 *         rider  where the player model is parented, counter-scaled
 */
export class AnimalModel {
  /** Attach this to the scene, or to a mount. Gameplay owns its transform. */
  readonly root = new Group();

  /** Carries the body's bob, pitch and roll. */
  readonly body = new Group();
  readonly head = new Group();
  readonly tail = new Group();

  /** Shoulder/hip joints, in front-left, front-right, back-left, back-right. */
  readonly hips: Group[] = [];
  /** Knee joints, one per hip and parented to it. */
  readonly knees: Group[] = [];

  /**
   * Where the rider is parented.
   *
   * A child of `body`, so the rider inherits the bob, the pitch and the roll
   * for free and can never drift off the saddle. Counter-scaled by the
   * species' own scale, so a bigger animal does not also produce a bigger
   * person.
   */
  readonly riderAnchor = new Group();

  readonly definition: AnimalDefinition;
  readonly parts: AnimalParts;

  private readonly scaled = new Group();

  constructor(definition: AnimalDefinition) {
    this.definition = definition;
    this.parts = animalParts(definition);

    this.root.add(this.scaled);
    this.scaled.scale.setScalar(definition.scale);
    this.scaled.add(this.body);

    this.body.position.set(0, this.parts.bodyCentreY, 0);
    this.body.add(mesh(this.parts.body));

    this.head.position.set(...this.parts.neckBase);
    this.head.add(mesh(this.parts.head));
    this.body.add(this.head);

    if (this.parts.tail) {
      this.tail.position.set(...this.parts.tailBase);
      this.tail.rotation.x = -definition.shape.tailDroop;
      this.tail.add(mesh(this.parts.tail));
      this.body.add(this.tail);
    }

    for (const hipAt of this.parts.hips) {
      const hip = new Group();
      hip.position.set(...hipAt);
      hip.add(mesh(this.parts.legUpper));

      const knee = new Group();
      knee.position.set(0, this.parts.kneeY, 0);
      knee.add(mesh(this.parts.legLower));
      hip.add(knee);

      this.body.add(hip);
      this.hips.push(hip);
      this.knees.push(knee);
    }

    // The seat, expressed from the hooves in the roster and converted into the
    // body node's own space here - so `riderOffset` stays a number an author
    // can measure against the animal rather than against an internal pivot.
    const offset = definition.riderOffset;
    this.riderAnchor.position.set(
      offset.x,
      offset.y - this.parts.bodyCentreY,
      offset.z,
    );
    this.riderAnchor.scale.setScalar(1 / definition.scale);
    this.body.add(this.riderAnchor);
  }

  /** Height from hooves to crown, in world units, for floating labels. */
  get height(): number {
    return this.parts.height * this.definition.scale;
  }

  /** Reset every animated node to its rest pose. */
  resetPose(): void {
    this.body.position.set(0, this.parts.bodyCentreY, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.head.rotation.set(0, 0, 0);
    this.tail.rotation.set(-this.definition.shape.tailDroop, 0, 0);
    for (const hip of this.hips) hip.rotation.set(0, 0, 0);
    for (const knee of this.knees) knee.rotation.set(0, 0, 0);
  }

  /**
   * Meshes are cheap and geometry is shared, so disposal only unhooks the
   * scene graph. The cached per-species geometry outlives every instance and
   * is released by `disposeAnimalGeometry`.
   */
  dispose(): void {
    this.root.removeFromParent();
  }
}

/** A fresh animal for a replicated slot. Never throws on an unknown slot. */
export const animalModelForSlot = (slot: number): AnimalModel =>
  new AnimalModel(animalForSlot(slot));

const mesh = (geometry: AnimalParts['body']): Mesh => {
  const node = new Mesh(geometry, material());
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
};
