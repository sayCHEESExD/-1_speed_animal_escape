import {
  CanvasTexture,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

/** One line of text on a sign. */
export interface SignLine {
  readonly text: string;
  /** Fraction of the canvas height this line's font fills. */
  readonly size: number;
  readonly fill: string;
  /** Outline colour. The chunky dark rim every label in the reference has. */
  readonly stroke: string;
  /** Outline width, as a fraction of the font size. */
  readonly strokeWidth?: number;
}

/**
 * A floating text panel, drawn on a canvas.
 *
 * All of this game's world text - the stage gates, the "+N Speed" over each
 * animal stand - is one of these. Canvas rather than an SVG or a font file
 * because the style is a heavy stroked display face that a browser can draw
 * directly, and because a font file would be the single largest asset in a
 * build that currently has none.
 *
 * Unlit on purpose: a sign that dims when it faces away from the sun is a sign
 * the player cannot read.
 */
export class CanvasSign {
  readonly mesh: Mesh;

  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly geometry: PlaneGeometry;

  /**
   * @param width  panel width in world units
   * @param height panel height in world units
   * @param lines  what to draw, top to bottom
   */
  constructor(width: number, height: number, lines: readonly SignLine[]) {
    const pixelsPerUnit = 48;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(width * pixelsPerUnit));
    canvas.height = Math.max(2, Math.round(height * pixelsPerUnit));

    const ctx = canvas.getContext('2d');
    if (ctx) drawLines(ctx, canvas.width, canvas.height, lines);

    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.geometry = new PlaneGeometry(width, height);
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      // Single-sided. A double-sided panel is legible from the front and
      // MIRRORED from behind, which is worse than not being there at all -
      // every stage gate read backwards the moment a player turned round.
      side: FrontSide,
      depthWrite: false,
    });

    this.mesh = new Mesh(this.geometry, this.material);
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.mesh.removeFromParent();
  }
}

const drawLines = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: readonly SignLine[],
): void => {
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // Lines are laid out by their own heights, so a big title and a small
  // subtitle share the panel proportionally rather than by a fixed grid.
  const total = lines.reduce((sum, line) => sum + line.size, 0) || 1;
  let cursor = 0;

  for (const line of lines) {
    const band = (line.size / total) * height;
    const fontSize = band * 0.82;
    const centreY = cursor + band / 2;
    cursor += band;

    ctx.font = `900 ${fontSize}px "Arial Black", "Segoe UI", system-ui, sans-serif`;
    ctx.lineWidth = fontSize * (line.strokeWidth ?? 0.16);
    ctx.strokeStyle = line.stroke;
    ctx.strokeText(line.text, width / 2, centreY);
    ctx.fillStyle = line.fill;
    ctx.fillText(line.text, width / 2, centreY);
  }
};
