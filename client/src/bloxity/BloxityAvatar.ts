import {
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Bone,
  type Object3D,
  type Texture,
} from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { logger } from '../util/logger.js';
import {
  isEquippedId,
  type LegionEquipped,
  type LegionProportions,
} from './legionTypes.js';

const SCOPE = 'bloxity/avatar';

/** Where every avatar asset lives. */
const CDN = 'https://static.bloxity.io/avatars';

/**
 * Bloxity cosmetics, applied to the LOCAL rider.
 *
 * Three things are applied, and the choice of which three is deliberate:
 *
 *  - the SKIN, as a texture swap on the rider's own material;
 *  - the HAT and the BACK item, as meshes parented to real bones;
 *  - the PROPORTIONS, as scales and offsets on those same bones.
 *
 * What is NOT applied is the body-part set - head, torso, arms, legs. Those
 * are separate GLB meshes that would REPLACE the supplied `player.fbx`, and
 * that model is this project's canonical player asset with a rig the whole
 * animation system is bound to. Swapping it out at runtime is a second player
 * asset by another name, and it is a change to make deliberately rather than
 * as a side effect of a cosmetics hook. The ids are read and logged so the
 * data is plainly arriving; nothing pretends to wear them.
 *
 * Only the local rider is dressed. Remote riders keep the shared default
 * material - their cosmetics are not ours to fetch, and a texture request per
 * remote player per join is a lot of CDN traffic for something nobody is
 * looking at while they run past.
 */
export class BloxityAvatar {
  private readonly riderVisual: Group;
  private readonly bones: ReadonlyMap<string, Bone>;

  /** The rider's own material, cloned so remote players keep the default. */
  private material: MeshStandardMaterial | null = null;
  /** The texture the model shipped with, to go back to when a skin is removed. */
  private defaultMap: Texture | null = null;

  private readonly attachments = new Map<'hat' | 'back', Object3D>();
  private readonly loadedTextures: Texture[] = [];

  /** What is currently worn, so an unchanged patch does no work. */
  private currentSkin: string | null = null;
  private currentHat: string | null = null;
  private currentBack: string | null = null;

  private readonly objLoader = new OBJLoader();
  private readonly textureLoader = new TextureLoader();

  private disposed = false;

  constructor(riderVisual: Group, riderModel: Object3D) {
    this.riderVisual = riderVisual;
    this.bones = collectBones(riderModel);
    this.material = this.cloneRiderMaterial(riderModel);
    this.defaultMap = this.material?.map ?? null;
  }

  /**
   * Wear what the account has equipped.
   *
   * Safe to call on every avatar event: each slot is compared against what is
   * already worn, so the common case - a proportions change - touches no
   * network at all.
   */
  apply(equipped: LegionEquipped, proportions: LegionProportions): void {
    if (this.disposed) return;

    this.applySkin(equipped.skinId ?? null);
    void this.applyItem('hat', equipped.hatId ?? null);
    void this.applyItem('back', equipped.backId ?? null);
    this.applyProportions(proportions);

    const parts = [
      equipped.headId,
      equipped.torsoId,
      equipped.armLId,
      equipped.armRId,
      equipped.legLId,
      equipped.legRId,
    ].filter(isEquippedId);
    if (parts.length > 0) {
      logger.info(
        SCOPE,
        `body parts equipped but not worn (the rider is player.fbx): ${parts.join(', ')}`,
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const [, node] of this.attachments) node.removeFromParent();
    this.attachments.clear();
    for (const texture of this.loadedTextures) texture.dispose();
    this.loadedTextures.length = 0;
    this.material?.dispose();
    this.material = null;
  }

  // ------------------------------------------------------------------ skin

  private applySkin(id: string | null): void {
    const wanted = isEquippedId(id) ? id : null;
    if (wanted === this.currentSkin) return;
    this.currentSkin = wanted;

    const material = this.material;
    if (!material) return;

    if (!wanted) {
      material.map = this.defaultMap;
      material.needsUpdate = true;
      return;
    }

    this.textureLoader.load(
      `${CDN}/skins/${wanted}.png`,
      (texture) => {
        // A skin arriving after the player switched away from it must not be
        // applied over the newer one.
        if (this.disposed || this.currentSkin !== wanted) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false;
        this.loadedTextures.push(texture);
        material.map = texture;
        material.needsUpdate = true;
        logger.info(SCOPE, `wearing skin ${wanted}`);
      },
      undefined,
      () => logger.warn(SCOPE, `skin ${wanted} failed to load`),
    );
  }

  // ------------------------------------------------------------------ items

  /**
   * Parent a hat or a back item to a real bone.
   *
   * To a BONE, not to the rider group: an item hung off the group would keep
   * its own idea of where the head is while the head moved, which is the same
   * class of mistake as copying a transform a frame late.
   */
  private async applyItem(slot: 'hat' | 'back', id: string | null): Promise<void> {
    const wanted = isEquippedId(id) ? id : null;
    const current = slot === 'hat' ? this.currentHat : this.currentBack;
    if (wanted === current) return;
    if (slot === 'hat') this.currentHat = wanted;
    else this.currentBack = wanted;

    const existing = this.attachments.get(slot);
    if (existing) {
      existing.removeFromParent();
      this.attachments.delete(slot);
    }
    if (!wanted) return;

    const anchor = this.bones.get(slot === 'hat' ? 'Neck1' : 'Spine2');
    if (!anchor) {
      logger.warn(SCOPE, `no bone to hang a ${slot} on`);
      return;
    }

    const folder = slot === 'hat' ? 'hats' : 'back';
    try {
      const object = await this.objLoader.loadAsync(`${CDN}/items/${folder}/${wanted}.obj`);
      if (this.disposed) return;
      // Still wanted? The player may have changed it while this was in flight.
      const stillWanted = slot === 'hat' ? this.currentHat : this.currentBack;
      if (stillWanted !== wanted) return;

      const texture = await this.textureLoader.loadAsync(
        `${CDN}/textures/${folder}/${wanted}.png`,
      );
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      this.loadedTextures.push(texture);

      const material = new MeshStandardMaterial({ map: texture, roughness: 0.85 });
      object.traverse((child) => {
        if (child instanceof Mesh) {
          child.material = material;
          child.castShadow = true;
        }
      });

      // The FBX is authored in centimetres and scaled down on load, so a bone's
      // world scale is tiny; the item is sized against the bone it hangs on
      // rather than against the world.
      object.scale.setScalar(ITEM_SCALE);
      if (slot === 'hat') object.position.set(0, HAT_LIFT, 0);
      else object.position.set(0, 0, BACK_OFFSET);

      anchor.add(object);
      this.attachments.set(slot, object);
      logger.info(SCOPE, `wearing ${slot} ${wanted}`);
    } catch {
      logger.warn(SCOPE, `${slot} ${wanted} failed to load`);
    }
  }

  // ----------------------------------------------------------- proportions

  /**
   * Apply the account's proportions.
   *
   * Scale and POSITION only - never rotation. `PlayerRig` rebuilds every
   * bone's quaternion from its rest pose on every single frame, so a rotation
   * written here would be gone before it was drawn; scale and position are
   * untouched by it and therefore survive.
   */
  private applyProportions(p: LegionProportions): void {
    const num = (value: number, fallback = 1): number =>
      Number.isFinite(value) && value > 0 ? value : fallback;

    // Height scales the whole rider. The mount's saddle is a fixed point, so
    // this grows the rider upward from where they sit rather than through the
    // animal's back.
    this.riderVisual.scale.setScalar(num(p.height));

    const spine1 = this.bones.get('Spine1');
    if (spine1) spine1.scale.x = num(p.torsoScaleX);

    const spine2 = this.bones.get('Spine2');
    if (spine2) spine2.scale.x = num(p.shoulderWidth);

    const neck = this.bones.get('Neck1');
    if (neck) neck.scale.setScalar(num(p.headScale));

    for (const name of ['ArmL1', 'ArmR1'] as const) {
      const bone = this.bones.get(name);
      if (bone) bone.scale.y = num(p.armLength);
    }

    // `legOffsetX` is a straddle, so it moves the legs apart rather than
    // scaling them: the rider is sitting on a barrel, and that is the one
    // proportion this game's pose actually cares about.
    const straddle = Number.isFinite(p.legOffsetX) ? p.legOffsetX : 1;
    for (const [name, side] of [['LegL1', 1], ['LegR1', -1]] as const) {
      const bone = this.bones.get(name);
      if (!bone) continue;
      bone.position.x = bone.userData['restX'] as number ?? bone.position.x;
      if (bone.userData['restX'] === undefined) bone.userData['restX'] = bone.position.x;
      bone.position.x = (bone.userData['restX'] as number) + side * (straddle - 1) * LEG_SPREAD;
    }
  }

  /**
   * Give the local rider its own material.
   *
   * Every instance shares ONE material by design, which is exactly right until
   * one of them needs a different skin - at which point writing to it would
   * re-skin every remote player too.
   */
  private cloneRiderMaterial(model: Object3D): MeshStandardMaterial | null {
    let cloned: MeshStandardMaterial | null = null;
    model.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const material = child.material;
      if (!(material instanceof MeshStandardMaterial)) return;
      cloned ??= material.clone();
      child.material = cloned;
    });
    return cloned;
  }
}

/** How big a CDN item is, in the bone space it hangs in. */
const ITEM_SCALE = 0.9;
/** A hat sits above the head bone's origin. */
const HAT_LIFT = 0.55;
/** A back item sits behind the chest. */
const BACK_OFFSET = -0.35;
/** World units the legs move apart per unit of `legOffsetX`. */
const LEG_SPREAD = 0.12;

/** The rig's bones, by name. Same first-bone rule `PlayerRig` uses. */
const collectBones = (model: Object3D): Map<string, Bone> => {
  const found = new Map<string, Bone>();
  model.traverse((child) => {
    const bone = child as Bone;
    if (bone.isBone && !found.has(bone.name)) found.set(bone.name, bone);
  });
  return found;
};
