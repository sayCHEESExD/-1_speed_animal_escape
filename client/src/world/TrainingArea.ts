import { COURSE, TRAINING, TREADMILL_BELT_Y, treadmillZ } from '@animal/shared';
import {
  Group,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
  type Texture,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { texturedBox } from './texturedBox.js';

/** How fast the belt texture scrolls, in texture repeats per second. */
const BELT_SCROLL = 0.9;

/**
 * The training area on the right of the arena.
 *
 * Three treadmills, and they are deliberately IDENTICAL - same frame, same
 * belt, same multiplier. They are somewhere to farm Speed while chatting, not
 * a ladder, so there is nothing to choose between them and no reason to queue.
 *
 * ORIENTATION is the thing to get right. A treadmill faces the way its runner
 * does, and the runner is meant to be looking back at the spawn point in the
 * middle of the arena - which from this deck against the left wall is +X. So
 * the belt runs along X with the console at its +X end, and the three machines
 * stand in a row along Z. Building the belt along Z instead is what made the
 * first version read as a row of beds.
 *
 * The belts themselves are real solids in the shared course data; everything
 * here is the machine around them. Walking on starts the farming and walking
 * off stops it, and that decision belongs entirely to the simulation.
 */
export class TrainingArea {
  readonly root = new Group();

  private readonly belts: Mesh[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshLambertMaterial[] = [];

  private time = 0;

  constructor(beltTexture: Texture) {
    const frame = this.material(PALETTE.treadmillFrame);
    const frameDark = this.material(PALETTE.treadmillFrameDark);
    const screen = this.material(PALETTE.treadmillScreen);
    // The belt carries a scrolling chevron texture, which is what makes an
    // empty machine still read as running.
    //
    // WHITE, not the belt colour: a lit material MULTIPLIES its colour by its
    // map, so tinting an already-dark texture by its own dark colour crushes
    // the chevrons to black. The colours live in the texture; the material
    // just carries it, with a little emissive so the chevrons stay legible in
    // the deck's own shadow.
    const beltMaterial = this.material(0xffffff);
    beltMaterial.map = beltTexture;
    beltMaterial.emissive.setHex(PALETTE.treadmillBelt);
    beltMaterial.emissiveIntensity = 0.55;
    beltMaterial.emissiveMap = beltTexture;

    // Shared geometry: three identical machines are three transforms of the
    // same eight boxes, not three sets of geometry.
    const L = TRAINING.beltLength;
    const W = TRAINING.beltWidth;

    const deck = this.geometry(L + 1.6, 1.1, W + 1.4);
    const belt = this.geometry(L - 1.6, 0.3, W - 2.6);
    const rail = this.geometry(L + 1.6, 0.9, 1.2);
    const cowl = this.geometry(1.6, 1.3, W + 1.4);
    const post = this.geometry(1.0, 3.8, 1.0);
    const panel = this.geometry(1.2, 2.6, W - 1.4);
    const face = this.geometry(0.4, 1.5, W - 3.4);
    const handle = this.geometry(4.0, 0.8, 0.8);

    for (let i = 1; i <= TRAINING.count; i += 1) {
      const machine = new Group();
      // No rotation: the belt geometry is authored running along X, which is
      // already the direction the runner faces.
      machine.position.set(TRAINING.centerX, TREADMILL_BELT_Y, treadmillZ(i));

      // The deck the belt sits in.
      machine.add(this.mesh(deck, frame, 0, -0.7, 0));

      // The running belt: dark, lit, and scrolling.
      const surface = this.mesh(belt, beltMaterial, 0, -0.05, 0);
      machine.add(surface);
      this.belts.push(surface);

      // Raised side edges either side of the belt.
      for (const side of [-1, 1]) {
        machine.add(this.mesh(rail, frameDark, 0, 0.25, side * (W / 2 - 0.1)));
      }

      // The roller cowl at the BACK - the end the runner steps on from.
      machine.add(this.mesh(cowl, frameDark, -(L / 2 + 0.3), 0.05, 0));

      // The console at the FRONT: two uprights, a panel, a dark screen and the
      // two handles that reach back toward the runner.
      for (const side of [-1, 1]) {
        machine.add(this.mesh(post, frame, L / 2 - 0.5, 1.7, side * (W / 2 - 1.1)));
        machine.add(this.mesh(handle, frameDark, L / 2 - 2.6, 3.2, side * (W / 2 - 1.1)));
      }
      machine.add(this.mesh(panel, frame, L / 2 + 0.2, 3.7, 0));
      machine.add(this.mesh(face, screen, L / 2 + 0.75, 3.8, 0));

      // The reward label, over the console and facing the arena.
      const sign = new CanvasSign(9, 2.6, [
        {
          text: `+${TRAINING.multiplier} Speed`,
          size: 1,
          fill: '#ffe14d',
          stroke: '#3a2a06',
        },
      ]);
      sign.mesh.position.set(L / 2 + 1, 6.4, 0);
      // Facing +X, back toward the arena the player rides in from. Signs are
      // single-sided, so one left facing +Z is invisible from the only
      // direction anybody approaches from.
      sign.mesh.rotation.y = Math.PI / 2;
      machine.add(sign.mesh);
      this.signs.push(sign);

      this.root.add(machine);
    }

    // The area's own title, on the wall behind the machines and facing the
    // open ground the players gather on.
    const title = new CanvasSign(38, 9, [
      { text: 'TRAINING', size: 1, fill: '#ffffff', stroke: '#1f7a2e', strokeWidth: 0.2 },
    ]);
    title.mesh.position.set(
      TRAINING.minX - 0.5,
      COURSE.floorY + 17,
      (TRAINING.minZ + TRAINING.maxZ) / 2,
    );
    title.mesh.rotation.y = Math.PI / 2;
    this.root.add(title.mesh);
    this.signs.push(title);
  }

  /** Scroll the belts, so a machine standing empty still looks like it runs. */
  update(delta: number): void {
    this.time += delta;
    for (const belt of this.belts) {
      const material = belt.material as MeshLambertMaterial;
      if (!material.map) continue;
      // Along U, which is the belt's own length - the surface travels BACKWARD
      // under a runner who is facing +X.
      material.map.offset.x = (this.time * BELT_SCROLL) % 1;
    }
  }

  private mesh(
    geometry: BufferGeometry,
    material: MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const node = new Mesh(geometry, material);
    node.position.set(x, y, z);
    node.castShadow = true;
    node.receiveShadow = true;
    return node;
  }

  private geometry(w: number, h: number, d: number): BufferGeometry {
    const geometry = texturedBox(w, h, d, 3);
    this.geometries.push(geometry);
    return geometry;
  }

  private material(color: number, emissive = 0): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color });
    if (emissive > 0) {
      material.emissive.setHex(color);
      material.emissiveIntensity = emissive;
    }
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.signs.length = 0;
    this.root.removeFromParent();
  }
}
