import { COURSE, TRAINING, TREADMILL_BELT_Y, treadmillX } from '@animal/shared';
import { Group, Mesh, MeshLambertMaterial, type BufferGeometry, type Texture } from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { texturedBox } from './texturedBox.js';

/** How fast the belt texture scrolls, in texture repeats per second. */
const BELT_SCROLL = 1.6;

/**
 * The training area on the right of the arena.
 *
 * Three treadmills, and they are deliberately IDENTICAL - same frame, same
 * belt, same multiplier. They are a place to farm Speed while chatting, not a
 * ladder, so there is nothing to choose between them and no reason to queue.
 *
 * The belts themselves are real solids in the shared course data; everything
 * here is the furniture around them - the gold frames, the scrolling belt
 * surface and the labels. Walking on starts the farming and walking off stops
 * it, and that decision belongs entirely to the simulation.
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
    // The belt carries a scrolling chevron texture, which is what makes an
    // empty machine still read as running.
    const beltMaterial = this.material(PALETTE.treadmillBelt, 0.45);
    beltMaterial.map = beltTexture;

    // Shared geometry: three identical machines are three transforms of the
    // same five boxes, not three sets of geometry.
    const post = this.geometry(0.9, 3.4, 0.9);
    const beam = this.geometry(TRAINING.beltWidth + 1.4, 0.9, 1.1);
    const rail = this.geometry(0.7, 0.8, TRAINING.beltLength);
    const belt = this.geometry(TRAINING.beltWidth - 1.2, 0.12, TRAINING.beltLength - 1);

    for (let i = 1; i <= TRAINING.count; i += 1) {
      const machine = new Group();
      machine.position.set(treadmillX(i), TREADMILL_BELT_Y, TRAINING.centerZ);

      // Four corner posts and a gantry beam at each end - the shape the
      // reference art's machines have.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new Mesh(post, frame);
          leg.position.set(
            sx * (TRAINING.beltWidth / 2 + 0.2),
            1.7,
            sz * (TRAINING.beltLength / 2 - 0.8),
          );
          leg.castShadow = true;
          machine.add(leg);
        }
      }
      for (const sz of [-1, 1]) {
        const top = new Mesh(beam, frameDark);
        top.position.set(0, 3.6, sz * (TRAINING.beltLength / 2 - 0.8));
        machine.add(top);
      }
      for (const sx of [-1, 1]) {
        const side = new Mesh(rail, frame);
        side.position.set(sx * (TRAINING.beltWidth / 2 + 0.2), 0.4, 0);
        machine.add(side);
      }

      // The lit belt. Emissive so it reads as running even in shadow.
      const surface = new Mesh(belt, beltMaterial);
      surface.position.set(0, 0.08, 0);
      machine.add(surface);
      this.belts.push(surface);

      const sign = new CanvasSign(4.8, 1.7, [
        {
          text: `x${TRAINING.multiplier} Speed`,
          size: 1,
          fill: '#ffe14d',
          stroke: '#3a2a06',
        },
      ]);
      sign.mesh.position.set(0, 5.6, 0);
      // Facing +X, back toward the arena the player rides in from. Signs are
      // single-sided, so one left facing +Z is simply invisible from the only
      // direction anybody approaches from.
      sign.mesh.rotation.y = Math.PI / 2;
      machine.add(sign.mesh);
      this.signs.push(sign);

      this.root.add(machine);
    }

    // The area's own title, facing back down the arena at the player.
    const title = new CanvasSign(26, 7, [
      { text: 'TRAINING', size: 1, fill: '#ffffff', stroke: '#1f7a2e', strokeWidth: 0.2 },
    ]);
    title.mesh.position.set(
      (TRAINING.minX + TRAINING.maxX) / 2,
      COURSE.floorY + 15,
      TRAINING.maxZ - 2,
    );
    // Rotated to face +X, back toward the middle of the arena, so it reads
    // from the open ground rather than edge-on from the spawn point.
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
      material.map.offset.y = (this.time * BELT_SCROLL) % 1;
    }
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
