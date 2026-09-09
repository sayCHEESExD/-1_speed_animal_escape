import { trailBySlot } from '@animal/shared';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';

/** How many segments the ribbon remembers. */
const SEGMENTS = 26;

/** How far the mount must travel before a new segment is laid. */
const STEP = 1.1;

/** Half-width of the ribbon, in world units. */
const HALF_WIDTH = 0.85;

/** Height above the hooves the ribbon is emitted at. */
const EMIT_Y = 1.4;

/**
 * The ribbon a trail leaves behind.
 *
 * Lives in WORLD space, not on the mount: a trail is where the player has
 * ALREADY been, so parenting it to a moving root would drag the whole ribbon
 * along behind them like a scarf. Whoever adds the mount to the scene adds
 * this separately.
 *
 * One geometry, rewritten in place. The vertex buffer is allocated once at
 * full length and the segment count is what varies, so laying a trail
 * allocates nothing per frame and a player with no trail costs one hidden
 * mesh.
 */
export class TrailEffect {
  readonly root = new Group();

  private readonly geometry = new BufferGeometry();
  private readonly material: MeshBasicMaterial;
  private readonly mesh: Mesh;

  /** Ring buffer of emitted points, newest last. */
  private readonly points: { x: number; y: number; z: number }[] = [];
  private readonly positions = new Float32Array(SEGMENTS * 2 * 3);
  private readonly colors = new Float32Array(SEGMENTS * 2 * 3);

  private slot = 0;
  private readonly tint = new Color(0xffffff);
  private time = 0;

  constructor() {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.geometry.setIndex(buildStripIndices());
    this.geometry.setDrawRange(0, 0);

    this.material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.root.add(this.mesh);
  }

  /** Show the trail the server says this player is wearing. Cosmetic only. */
  setSlot(slot: number): void {
    if (slot === this.slot) return;
    this.slot = slot;
    const tier = trailBySlot(slot);
    if (tier) this.tint.setHex(tier.color);
    this.mesh.visible = tier !== undefined;
    if (!tier) this.clear();
  }

  /** Drop the ribbon, e.g. on a respawn - it describes a run that has ended. */
  clear(): void {
    this.points.length = 0;
    this.geometry.setDrawRange(0, 0);
  }

  /**
   * @param speed the mount's horizontal speed; a standing player lays nothing.
   */
  update(delta: number, x: number, y: number, z: number, speed: number): void {
    if (this.slot === 0) return;
    this.time += delta;

    if (speed > 1.5) {
      const last = this.points[this.points.length - 1];
      const moved =
        !last || Math.hypot(x - last.x, y - last.y, z - last.z) >= STEP;
      if (moved) {
        this.points.push({ x, y: y + EMIT_Y, z });
        if (this.points.length > SEGMENTS) this.points.shift();
      }
    } else if (this.points.length > 0 && this.time % 0.06 < delta) {
      // Standing still: the ribbon retreats rather than hanging in the air.
      this.points.shift();
    }

    this.rebuild();
  }

  private rebuild(): void {
    const count = this.points.length;
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const tier = trailBySlot(this.slot);
    const rainbow = tier?.style === 'rainbow';

    for (let i = 0; i < count; i += 1) {
      const point = this.points[i];
      if (!point) continue;

      // The ribbon is widened across the direction of travel, so it reads as a
      // flat band laid on the ground rather than a wall.
      const previous = this.points[Math.max(0, i - 1)] as { x: number; z: number };
      const next = this.points[Math.min(count - 1, i + 1)] as { x: number; z: number };
      let dx = next.x - previous.x;
      let dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      const nx = -dz * HALF_WIDTH;
      const nz = dx * HALF_WIDTH;

      // Fade and narrow toward the tail, so the ribbon dissolves.
      const t = i / (count - 1);
      const at = i * 6;
      this.positions[at] = point.x + nx * t;
      this.positions[at + 1] = point.y;
      this.positions[at + 2] = point.z + nz * t;
      this.positions[at + 3] = point.x - nx * t;
      this.positions[at + 4] = point.y;
      this.positions[at + 5] = point.z - nz * t;

      if (rainbow) this.tint.setHSL((this.time * 0.35 + t) % 1, 0.85, 0.6);
      const r = this.tint.r * t;
      const g = this.tint.g * t;
      const b = this.tint.b * t;
      this.colors[at] = r;
      this.colors[at + 1] = g;
      this.colors[at + 2] = b;
      this.colors[at + 3] = r;
      this.colors[at + 4] = g;
      this.colors[at + 5] = b;
    }

    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    this.geometry.setDrawRange(0, (count - 1) * 6);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.root.removeFromParent();
  }
}

/** Two triangles per segment, built once for the full-length buffer. */
const buildStripIndices = (): BufferAttribute => {
  const indices = new Uint16Array((SEGMENTS - 1) * 6);
  for (let i = 0; i < SEGMENTS - 1; i += 1) {
    const a = i * 2;
    const at = i * 6;
    indices[at] = a;
    indices[at + 1] = a + 1;
    indices[at + 2] = a + 2;
    indices[at + 3] = a + 1;
    indices[at + 4] = a + 3;
    indices[at + 5] = a + 2;
  }
  return new BufferAttribute(indices, 1);
};
