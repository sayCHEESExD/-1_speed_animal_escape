import { COURSE_HAZARDS, hazardPositionAt } from '@animal/shared';
import { Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
import { PALETTE } from '../config/worldVisuals.js';

/**
 * The lavender spheres that sweep across the course.
 *
 * Their positions are a PURE FUNCTION of the server's clock, so there is no
 * hazard state on the wire at all: the server evaluates `hazardXAt` against
 * its own elapsed time to decide a death, and this evaluates the identical
 * function against the replicated value to draw the ball. The two cannot
 * disagree, because there is nothing to disagree about.
 *
 * One geometry and one material shared by every sphere - a low-segment ball,
 * because a smooth one would be the only round thing in a world of bricks.
 */
export class Hazards {
  readonly root = new Group();

  private readonly meshes: Mesh[] = [];
  private readonly geometry: SphereGeometry;
  private readonly material: MeshLambertMaterial;

  /** Scratch for a hazard position, so a frame allocates nothing. */
  private readonly at = { x: 0, z: 0 };

  constructor() {
    // 16x12 segments: chunky enough to read as a toy ball, cheap enough that a
    // dozen of them cost nothing.
    this.geometry = new SphereGeometry(1, 16, 12);
    this.material = new MeshLambertMaterial({ color: PALETTE.hazard });

    for (const hazard of COURSE_HAZARDS) {
      const mesh = new Mesh(this.geometry, this.material);
      mesh.scale.setScalar(hazard.radius);
      mesh.position.set(hazard.x, hazard.y, hazard.z);
      mesh.castShadow = true;
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
  }

  /** @param elapsed the server's clock, in seconds. */
  update(elapsed: number): void {
    for (let i = 0; i < this.meshes.length; i += 1) {
      const hazard = COURSE_HAZARDS[i];
      const mesh = this.meshes[i];
      if (!hazard || !mesh) continue;

      hazardPositionAt(hazard, elapsed, this.at);
      mesh.position.x = this.at.x;
      mesh.position.z = this.at.z;

      // Rolling, and rolling the RIGHT way: the spin is derived from the same
      // travel the position is, so a ball never slides while appearing to roll
      // backwards. A sweeper rolls about Z, a roller about X.
      if (hazard.kind === 'roller') {
        mesh.rotation.x = -this.at.z / hazard.radius;
      } else {
        mesh.rotation.z = -this.at.x / hazard.radius;
      }
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
