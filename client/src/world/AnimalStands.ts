import { ANIMALS, COURSE, STAND_ROW, formatSpeed, standZ } from '@animal/shared';
import { Group, Mesh, MeshLambertMaterial } from 'three';
import { AnimalModel } from '../animal/AnimalModel.js';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { texturedBox } from './texturedBox.js';

/** How fast a display animal turns on its plinth, in radians per second. */
const TURN_RATE = 0.5;

/** One stand: a plinth, the animal standing on it, and its price label. */
interface Stand {
  readonly slot: number;
  readonly model: AnimalModel;
  readonly sign: CanvasSign;
  readonly top: Mesh;
}

/**
 * The row of animal stands along the back of the lobby.
 *
 * This is the shop, and it is a PLACE rather than a menu: the player rides
 * their current mount onto a plinth and the server decides whether they can
 * afford what is standing on it. Reaching the Wins total alone does nothing,
 * which is what gives the lobby a reason to exist.
 *
 * Every animal in the roster gets a stand automatically, so adding an
 * eleventh species puts an eleventh stand here with no change to this file.
 */
export class AnimalStands {
  readonly root = new Group();

  private readonly stands: Stand[] = [];
  private readonly baseMaterial: MeshLambertMaterial;
  private readonly ownedMaterial: MeshLambertMaterial;
  private readonly lockedMaterial: MeshLambertMaterial;

  private time = 0;

  constructor() {
    this.baseMaterial = new MeshLambertMaterial({ color: PALETTE.standBase });
    this.ownedMaterial = new MeshLambertMaterial({
      color: PALETTE.standTop,
      emissive: PALETTE.standTop,
      emissiveIntensity: 0.35,
    });
    this.lockedMaterial = new MeshLambertMaterial({ color: PALETTE.standLocked });

    const plinth = texturedBox(STAND_ROW.width, STAND_ROW.height, STAND_ROW.length, 4);
    const cap = texturedBox(STAND_ROW.width * 0.86, 0.16, STAND_ROW.length * 0.86, 4);

    for (const animal of ANIMALS) {
      const group = new Group();
      // A COLUMN down the left wall: the arena is far deeper than it is wide,
      // and a row across it would have cut through the open middle the room
      // exists to provide.
      group.position.set(STAND_ROW.x, COURSE.floorY, standZ(animal.slot));

      const base = new Mesh(plinth, this.baseMaterial);
      base.position.y = STAND_ROW.height / 2;
      base.receiveShadow = true;
      group.add(base);

      // The lit cap. Gold once owned, grey while it is not - the one piece of
      // per-player state in the whole lobby, and it is only ever a colour.
      const top = new Mesh(cap, this.lockedMaterial);
      top.position.y = STAND_ROW.height + 0.08;
      group.add(top);

      const model = new AnimalModel(animal);
      model.root.position.y = STAND_ROW.height + 0.16;
      // Facing -X, out into the arena: the line-up is against the +X wall, so
      // the animals look at the room rather than along it.
      model.root.rotation.y = -Math.PI / 2;
      group.add(model.root);

      const sign = new CanvasSign(4.4, 1.8, [
        {
          text: `+${formatSpeed(animal.speedPerStep)} Speed`,
          size: 1,
          fill: '#ffffff',
          stroke: '#20303f',
        },
        {
          text:
            animal.winsRequired === 0
              ? 'FREE'
              : `${formatSpeed(animal.winsRequired)} Wins Required`,
          size: 0.62,
          fill: '#ffd54a',
          stroke: '#40320c',
        },
      ]);
      sign.mesh.position.set(0, STAND_ROW.height + model.height + 1.1, 0);
      sign.mesh.rotation.y = -Math.PI / 2;
      group.add(sign.mesh);

      this.root.add(group);
      this.stands.push({ slot: animal.slot, model, sign, top });
    }
  }

  /**
   * Light the stands the player already owns.
   *
   * Reads the REPLICATED mask and nothing else - the client never decides what
   * a player owns, it only shows what the server says.
   */
  setOwned(ownedMask: number): void {
    for (const stand of this.stands) {
      const owned = (ownedMask & (1 << (stand.slot - 1))) !== 0;
      stand.top.material = owned ? this.ownedMaterial : this.lockedMaterial;
    }
  }

  /** Turn the display animals slowly, so the line-up is not ten statues. */
  update(delta: number): void {
    this.time += delta;
    for (let i = 0; i < this.stands.length; i += 1) {
      const stand = this.stands[i];
      if (!stand) continue;
      // Each animal turns from its own offset, so the row is a line-up rather
      // than a chorus line.
      stand.model.root.rotation.y =
        -Math.PI / 2 + Math.sin(this.time * TURN_RATE + i * 0.7) * 0.5;
    }
  }

  dispose(): void {
    for (const stand of this.stands) {
      stand.model.dispose();
      stand.sign.dispose();
    }
    this.stands.length = 0;
    this.baseMaterial.dispose();
    this.ownedMaterial.dispose();
    this.lockedMaterial.dispose();
    this.root.removeFromParent();
  }
}
