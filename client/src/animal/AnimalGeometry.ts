import type { AnimalDefinition, AnimalShape } from '@animal/shared';
import type { BufferGeometry } from 'three';
import { BoxSet } from './BoxSet.js';

/**
 * ONE generic quadruped builder, driven entirely by the roster's `shape`,
 * `palette` and `features`.
 *
 * There is deliberately no per-species modelling code: a llama and a panda are
 * the same twelve boxes at different sizes with different extras bolted on.
 * That is what makes an eleventh animal a data entry rather than a renderer
 * change - and it is why every animal in the game looks like it belongs in the
 * same world.
 *
 * Coordinates are ANIMAL SPACE: origin between the hooves, +Y up, +Z forward
 * (the way the animal faces). Each returned geometry is expressed in its own
 * part's local space so it can be hung off an animated node.
 */

/** Geometry and joint offsets for one species. Built once, shared by every
 *  instance of that species in the scene. */
export interface AnimalParts {
  /** Barrel, saddle and any flank markings. Origin at the body's centre. */
  readonly body: BufferGeometry;
  /** Neck, head, ears and crown features. Origin at the base of the neck. */
  readonly head: BufferGeometry;
  /** Upper leg. Origin at the hip; hangs down -Y. Shared by all four legs. */
  readonly legUpper: BufferGeometry;
  /** Lower leg and hoof. Origin at the knee; hangs down -Y. */
  readonly legLower: BufferGeometry;
  /** Tail. Origin at its root; extends along -Z. */
  readonly tail: BufferGeometry | null;

  /** Height of the belly line above the hooves. */
  readonly bellyY: number;
  /** Height of the body's centre above the hooves - the body node's origin. */
  readonly bodyCentreY: number;
  /** Neck base, in BODY-node local space. */
  readonly neckBase: readonly [number, number, number];
  /** Tail root, in BODY-node local space. */
  readonly tailBase: readonly [number, number, number];
  /** Hip joints, in BODY-node local space, in front-left..back-right order. */
  readonly hips: readonly (readonly [number, number, number])[];
  /** Knee offset below a hip. */
  readonly kneeY: number;
  /** Total height from hooves to the top of the head, for label placement. */
  readonly height: number;
}

/** Cache keyed by animal id. Ten species, built once each, shared forever. */
const CACHE = new Map<string, AnimalParts>();

/** Geometry for one species, built on first use. */
export const animalParts = (definition: AnimalDefinition): AnimalParts => {
  const cached = CACHE.get(definition.id);
  if (cached) return cached;
  const built = build(definition);
  CACHE.set(definition.id, built);
  return built;
};

/** Release every cached species. Only used when the whole game is torn down. */
export const disposeAnimalGeometry = (): void => {
  for (const parts of CACHE.values()) {
    parts.body.dispose();
    parts.head.dispose();
    parts.legUpper.dispose();
    parts.legLower.dispose();
    parts.tail?.dispose();
  }
  CACHE.clear();
};

const build = (definition: AnimalDefinition): AnimalParts => {
  const s = definition.shape;
  const p = definition.palette;
  const features = new Set(definition.features);

  const bellyY = s.legUpper + s.legLower;
  const bodyCentreY = bellyY + s.bodyH / 2;

  // ---- Body -------------------------------------------------------------
  const body = new BoxSet();

  body.add([s.bodyW, s.bodyH, s.bodyL], [0, 0, 0], p.body);
  // The lighter under-colour. Slightly inset so it reads as a belly rather
  // than as a second box floating under the barrel.
  body.add(
    [s.bodyW * 1.005, s.bodyH * 0.38, s.bodyL * 0.9],
    [0, -s.bodyH * 0.32, 0],
    p.belly,
  );
  // Chest plate: the pale bib every animal in the reference art has.
  body.add(
    [s.bodyW * 0.8, s.bodyH * 0.62, 0.34],
    [0, -s.bodyH * 0.1, s.bodyL / 2 + 0.1],
    p.belly,
  );

  addBodyMarkings(body, s, p, features);

  // The saddle. Its own furniture rather than part of the rider, because the
  // rider is a separate FBX that must sit ON something.
  const saddleTop = s.bodyH / 2;
  body.add(
    [s.bodyW * 1.06, 0.14, s.bodyL * 0.5],
    [0, saddleTop + 0.02, -0.05],
    p.saddle,
  );
  body.add(
    [s.bodyW * 0.7, 0.3, s.bodyL * 0.34],
    [0, saddleTop + 0.2, -0.05],
    p.belly,
  );
  // The girth strap round the barrel, and its buckle - the detail that makes
  // the saddle read as strapped on rather than balanced there.
  body.add([s.bodyW * 1.04, s.bodyH * 1.02, 0.18], [0, 0, 0.35], p.hoof);
  body.add([0.26, 0.26, 0.1], [0, -s.bodyH * 0.36, 0.46], p.accent);

  if (features.has('wings')) addWings(body, s, p);

  // ---- Head -------------------------------------------------------------
  // Built in its own space with the neck base at the origin, so the whole head
  // can be nodded and turned as one node.
  const head = new BoxSet();
  const tilt = s.neckTilt;
  const neckDirY = Math.cos(tilt);
  const neckDirZ = Math.sin(tilt);

  head.add(
    [s.neckW, s.neckLen, s.neckW * 0.95],
    [0, (neckDirY * s.neckLen) / 2, (neckDirZ * s.neckLen) / 2],
    p.body,
    [tilt, 0, 0],
  );

  const headY = neckDirY * s.neckLen + s.headH * 0.2;
  const headZ = neckDirZ * s.neckLen + s.headL * 0.3;
  head.add([s.headW, s.headH, s.headL], [0, headY, headZ], p.body);

  if (features.has('lionMane')) addLionMane(head, s, p, headY, headZ);
  if (features.has('mane')) addMane(head, s, p, tilt);

  // Muzzle and nose.
  const snoutZ = headZ + s.headL / 2 + s.snoutL / 2;
  head.add(
    [s.snoutW, s.snoutH, s.snoutL],
    [0, headY - s.headH * 0.16, snoutZ],
    p.belly,
  );
  head.add(
    [s.snoutW * 0.42, s.snoutH * 0.3, 0.12],
    [0, headY - s.headH * 0.08, snoutZ + s.snoutL / 2],
    p.hoof,
  );

  // The eyes. Big flat squares with an offset pupil - the single detail that
  // makes a box of the right colour read as a face in this style.
  const eyeX = s.headW * 0.27;
  const eyeY = headY + s.headH * 0.2;
  const eyeZ = headZ + s.headL / 2;
  if (features.has('pandaMarks')) {
    head.addMirrored([0.48, 0.5, 0.06], [eyeX, eyeY, eyeZ + 0.01], p.accent);
  }
  head.addMirrored([0.34, 0.36, 0.06], [eyeX, eyeY, eyeZ + 0.04], 0xffffff);
  head.addMirrored([0.15, 0.16, 0.05], [eyeX + 0.04, eyeY + 0.02, eyeZ + 0.08], 0x1b1b22);

  // Ears, splayed outward.
  const earX = s.headW * 0.4;
  const earY = headY + s.headH * 0.5;
  head.addMirrored(
    [s.earW, s.earH, s.earL],
    [earX, earY + s.earH * 0.35, headZ - s.headL * 0.1],
    p.body,
    [0, 0, -s.earSplay],
  );
  head.addMirrored(
    [s.earW * 0.55, s.earH * 0.62, s.earL * 0.5],
    [earX + 0.05, earY + s.earH * 0.35, headZ - s.headL * 0.1 + 0.06],
    p.accent,
    [0, 0, -s.earSplay],
  );

  if (features.has('antlers')) addAntlers(head, s, p, headY, headZ);
  if (features.has('horn')) addHorn(head, s, p, headY, headZ);
  if (features.has('cowHorns')) addCowHorns(head, s, p, headY, headZ);

  const crownY = headY + s.headH / 2;

  // ---- Legs -------------------------------------------------------------
  // One geometry pair, instanced four times. A front and a back leg differ
  // only in where they are hung, which is a node position, not geometry.
  const upper = new BoxSet();
  upper.add([s.legW, s.legUpper, s.legW], [0, -s.legUpper / 2, 0], p.body);
  if (features.has('pandaMarks')) {
    upper.add(
      [s.legW * 1.02, s.legUpper * 0.55, s.legW * 1.02],
      [0, -s.legUpper * 0.72, 0],
      p.accent,
    );
  }

  const lower = new BoxSet();
  lower.add([s.legW * 0.9, s.legLower, s.legW * 0.9], [0, -s.legLower / 2, 0], p.body);
  lower.add(
    [s.legW * 1.1, 0.26, s.legW * 1.16],
    [0, -s.legLower + 0.13, 0.02],
    p.hoof,
  );

  // ---- Tail -------------------------------------------------------------
  const tail = new BoxSet();
  tail.add([s.tailW, s.tailW, s.tailLen], [0, 0, -s.tailLen / 2], p.body);
  if (features.has('tailTuft')) {
    tail.add(
      [s.tailW * 1.6, s.tailW * 1.6, s.tailW * 1.6],
      [0, 0, -s.tailLen - s.tailW * 0.5],
      p.hair,
    );
  }

  const hipY = -s.bodyH / 2;
  return {
    body: body.build() as BufferGeometry,
    head: head.build() as BufferGeometry,
    legUpper: upper.build() as BufferGeometry,
    legLower: lower.build() as BufferGeometry,
    tail: tail.build(),
    bellyY,
    bodyCentreY,
    neckBase: [0, s.bodyH * 0.3, s.bodyL / 2 - 0.15],
    tailBase: [0, s.bodyH * 0.3, -s.bodyL / 2],
    hips: [
      [s.legSpreadX, hipY, s.legSpreadZ],
      [-s.legSpreadX, hipY, s.legSpreadZ],
      [s.legSpreadX, hipY, -s.legSpreadZ],
      [-s.legSpreadX, hipY, -s.legSpreadZ],
    ],
    kneeY: -s.legUpper,
    height: bodyCentreY + s.bodyH * 0.3 + crownY,
  };
};

/**
 * Flank markings.
 *
 * Deterministic by construction - a fixed lattice rather than a random
 * scatter - so every client draws the same deer and a species is recognisable
 * rather than differently freckled on each machine.
 */
const addBodyMarkings = (
  set: BoxSet,
  s: AnimalShape,
  p: AnimalDefinition['palette'],
  features: ReadonlySet<string>,
): void => {
  const side = s.bodyW / 2;

  if (features.has('spots')) {
    const rows = [0.16, -0.06, 0.24, -0.02];
    for (let i = 0; i < rows.length; i += 1) {
      const z = (i / (rows.length - 1) - 0.5) * s.bodyL * 0.62;
      set.addMirrored(
        [0.06, 0.26, 0.26],
        [side, (rows[i] as number) * s.bodyH, z],
        p.belly,
      );
      set.addMirrored(
        [0.06, 0.18, 0.18],
        [side, (rows[i] as number) * s.bodyH - 0.34, z + 0.3],
        p.belly,
      );
    }
  }

  if (features.has('stripes')) {
    for (let i = 0; i < 5; i += 1) {
      const z = (i / 4 - 0.5) * s.bodyL * 0.74;
      set.addMirrored([0.06, s.bodyH * 0.86, 0.2], [side, 0, z], p.accent);
    }
    // A stripe over the spine, so the pattern wraps instead of stopping at the
    // shoulder line.
    for (let i = 0; i < 5; i += 1) {
      const z = (i / 4 - 0.5) * s.bodyL * 0.74;
      set.add([s.bodyW * 0.9, 0.06, 0.2], [0, s.bodyH / 2, z], p.accent);
    }
  }

  if (features.has('patches')) {
    set.addMirrored([0.06, 0.62, 0.8], [side, s.bodyH * 0.1, s.bodyL * 0.22], p.accent);
    set.addMirrored([0.06, 0.5, 0.6], [side, -s.bodyH * 0.16, -s.bodyL * 0.24], p.accent);
    set.add([s.bodyW * 0.62, 0.06, 0.9], [0, s.bodyH / 2, -s.bodyL * 0.1], p.accent);
  }

  if (features.has('pandaMarks')) {
    // The shoulder band: the marking that makes a white barrel read as a panda
    // at a glance rather than as a pale cow.
    set.add([s.bodyW * 1.02, s.bodyH * 1.02, s.bodyL * 0.3], [0, 0, s.bodyL * 0.22], p.accent);
  }

  if (features.has('wool')) {
    // A fleece: one oversized second barrel, so a llama is unmistakably woolly
    // without a single extra vertex of detail.
    set.add(
      [s.bodyW * 1.14, s.bodyH * 1.1, s.bodyL * 0.92],
      [0, s.bodyH * 0.08, -s.bodyL * 0.04],
      p.belly,
    );
  }
};

const addWings = (set: BoxSet, s: AnimalShape, p: AnimalDefinition['palette']): void => {
  // Flat plates, angled up and back. Blocky on purpose: a membrane would be
  // the one non-brick thing in the whole game.
  set.addMirrored(
    [1.9, 0.16, 1.3],
    [s.bodyW / 2 + 0.9, s.bodyH * 0.42, s.bodyL * 0.06],
    p.accent,
    [0, 0, -0.55],
  );
  set.addMirrored(
    [1.2, 0.14, 0.9],
    [s.bodyW / 2 + 1.9, s.bodyH * 0.9, -s.bodyL * 0.1],
    p.hair,
    [0, 0, -0.75],
  );
};

const addAntlers = (
  set: BoxSet,
  s: AnimalShape,
  p: AnimalDefinition['palette'],
  headY: number,
  headZ: number,
): void => {
  const baseY = headY + s.headH * 0.52;
  const x = s.headW * 0.26;
  // Main beam, leaning out and back.
  set.addMirrored([0.14, 0.95, 0.14], [x, baseY + 0.45, headZ - 0.1], p.hoof, [0, 0, -0.3]);
  // Tines. Three per side, climbing the beam.
  set.addMirrored([0.5, 0.12, 0.12], [x + 0.35, baseY + 0.55, headZ - 0.1], p.hoof, [0, 0, 0.5]);
  set.addMirrored([0.44, 0.12, 0.12], [x + 0.52, baseY + 0.95, headZ - 0.25], p.hoof, [0, 0, 0.7]);
  set.addMirrored([0.12, 0.42, 0.12], [x + 0.42, baseY + 1.05, headZ - 0.02], p.hoof, [0.35, 0, 0]);
};

const addHorn = (
  set: BoxSet,
  s: AnimalShape,
  p: AnimalDefinition['palette'],
  headY: number,
  headZ: number,
): void => {
  // A tapering stack, twisted a little at each level so it reads as spiral.
  const baseY = headY + s.headH * 0.5;
  const z = headZ + s.headL * 0.2;
  set.add([0.3, 0.34, 0.3], [0, baseY + 0.17, z], p.accent, [0.16, 0.0, 0]);
  set.add([0.24, 0.34, 0.24], [0, baseY + 0.5, z + 0.06], p.accent, [0.16, 0.4, 0]);
  set.add([0.17, 0.32, 0.17], [0, baseY + 0.81, z + 0.11], p.accent, [0.16, 0.8, 0]);
  set.add([0.09, 0.28, 0.09], [0, baseY + 1.08, z + 0.16], p.accent, [0.16, 1.2, 0]);
};

const addCowHorns = (
  set: BoxSet,
  s: AnimalShape,
  p: AnimalDefinition['palette'],
  headY: number,
  headZ: number,
): void => {
  const baseY = headY + s.headH * 0.45;
  set.addMirrored([0.42, 0.14, 0.14], [s.headW * 0.42, baseY, headZ], p.hoof, [0, 0, 0.35]);
  set.addMirrored([0.14, 0.3, 0.14], [s.headW * 0.62, baseY + 0.2, headZ], p.hoof, [0, 0, 0.35]);
};

const addMane = (
  set: BoxSet,
  s: AnimalShape,
  p: AnimalDefinition['palette'],
  tilt: number,
): void => {
  // A crest along the back edge of the neck. Stepped rather than swept, which
  // is how a Roblox mane is built.
  const steps = 5;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const along = t * s.neckLen;
    set.add(
      [s.neckW * 0.36, 0.34, 0.3],
      [0, Math.cos(tilt) * along, Math.sin(tilt) * along - s.neckW * 0.5],
      p.hair,
      [tilt, 0, 0],
    );
  }
};

const addLionMane = (
  set: BoxSet,
  s: AnimalShape,
  p: AnimalDefinition['palette'],
  headY: number,
  headZ: number,
): void => {
  // A ring of blocks around the head. Built from a loop rather than listed out
  // so the ruff scales with the head instead of being tuned twice.
  const count = 10;
  const radius = s.headW * 0.78;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    set.add(
      [0.44, 0.44, 0.42],
      [Math.cos(angle) * radius, headY + Math.sin(angle) * radius, headZ - s.headL * 0.3],
      p.hair,
      [0, 0, angle],
    );
  }
};
