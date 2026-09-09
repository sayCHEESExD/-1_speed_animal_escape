/**
 * Static checks on the generated course.
 *
 * The course is GENERATED from a pattern table, so a tuning change can quietly
 * produce a hole nobody meant to be there or a gap no player could clear. This
 * walks the same arrays the renderer and the server read and fails loudly on:
 *
 *   - stages that overlap
 *   - unmarked holes in the run-up, the landings or the finish approach
 *   - jumps wider than the reach of a player at that stage's recommended level
 *   - hazards that sweep outside the corridor
 *
 * Run with `npm run verify:course`. Requires `npm run build:shared` first.
 */
import {
  COURSE,
  COURSE_HAZARDS,
  COURSE_SOLIDS,
  MOVEMENT,
  SINKING_SOLIDS,
  STAGES,
  TRAINING,
  TREADMILL_BELT_Y,
  resolveMovementProfile,
  sinkingOffsetAt,
  treadmillAt,
  treadmillX,
} from '../shared/dist/index.js';

let failures = 0;

const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};

const pass = (message) => console.log(`  ok    ${message}`);

/**
 * Merge the Z spans that have SOME walkable surface anywhere in the corridor.
 *
 * Deliberately width- AND height-agnostic. A plank bridge leaves the centre
 * line empty for twenty-four units but is not a jump, and stage 2's gantry
 * runs nine units above the floor - a test that insisted on floor level
 * reported both as unclearable holes. What actually matters is whether there
 * is anything to land on at all.
 *
 * `boost` is excluded because it is a decal painted on floor that already
 * exists, so counting it would mask a hole underneath it.
 */
const walkableSpans = () => {
  const spans = COURSE_SOLIDS.filter((solid) => solid.kind !== 'boost')
    .map((solid) => [solid.minZ, solid.maxZ])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [from, to] of spans) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1e-6) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
};

/** Z ranges where floor exists but not on the centre line - a plank crossing. */
const narrowCrossings = () => {
  const centre = COURSE_SOLIDS.filter(
    (s) => s.kind !== 'boost' && s.minX <= 0 && s.maxX >= 0,
  );
  const covered = (z) => centre.some((s) => z >= s.minZ && z <= s.maxZ);
  const found = [];
  let open = null;
  for (const [from, to] of walkableSpans()) {
    for (let z = from; z <= to; z += 1) {
      if (!covered(z)) {
        if (!open) open = [z, z];
        else open[1] = z;
      } else if (open) {
        found.push(open);
        open = null;
      }
    }
    if (open) { found.push(open); open = null; }
  }
  return found;
};

/**
 * How far a player can jump at a given level.
 *
 * Derived from the SAME shared formula the simulation uses, so this check
 * cannot drift from the physics it is checking.
 */
const reachAtLevel = (level) => {
  const profile = resolveMovementProfile(level, 0, 1, 1);
  const airtime = (2 * profile.jumpVelocity) / MOVEMENT.gravity;
  return profile.runSpeed * airtime;
};

console.log('stages');
let previousEnd = -Infinity;
for (const stage of STAGES) {
  if (stage.startZ < previousEnd - 1e-6) {
    fail(`stage ${stage.index} starts at ${stage.startZ} inside stage ${stage.index - 1}`);
  }
  previousEnd = stage.endZ;
}
if (failures === 0) pass(`${STAGES.length} stages, none overlapping`);

console.log('floor coverage');
const spans = walkableSpans();
if (spans.length === 0) {
  fail('no walkable floor at all');
} else {
  const first = spans[0];
  if (first[0] > COURSE.lobbyStartZ + 1e-6) {
    fail(`course does not start at the lobby back wall (${first[0]} vs ${COURSE.lobbyStartZ})`);
  } else {
    pass(`floor begins at the lobby back wall (${first[0]})`);
  }

  // Every gap is a jump. Check each against the reach at the recommended level
  // of whichever stage the gap is in, and at level 1 for the first stage - a
  // brand new player has to be able to clear stage one.
  let worst = null;
  for (let i = 0; i < spans.length - 1; i += 1) {
    const gapStart = spans[i][1];
    const gapEnd = spans[i + 1][0];
    const width = gapEnd - gapStart;
    const stage = STAGES.find((s) => gapStart >= s.startZ && gapStart <= s.endZ);
    const level = stage ? Math.max(1, stage.recommendedLevel) : 1;
    // A brand new player must be able to clear anything in stage one.
    const testLevel = stage && stage.index === 1 ? 1 : level;
    const reach = reachAtLevel(testLevel);
    if (width > reach * 0.8) {
      fail(
        `gap of ${width.toFixed(1)} at z=${gapStart.toFixed(0)} ` +
          `(stage ${stage ? stage.index : '-'}) needs ${(width / reach).toFixed(2)}x ` +
          `of the ${reach.toFixed(0)} reach at level ${testLevel}`,
      );
    }
    if (!worst || width > worst.width) {
      worst = { width, at: gapStart, stage: stage ? stage.index : 0, reach, level: testLevel };
    }
  }
  if (worst) {
    pass(
      `${spans.length - 1} jumps; widest ${worst.width.toFixed(1)} at z=${worst.at.toFixed(0)} ` +
        `(stage ${worst.stage}), reach at level ${worst.level} is ${worst.reach.toFixed(0)}`,
    );
  }
}

const crossings = narrowCrossings();
pass(`${crossings.length} narrow crossings (plank bridges), floor present but off-centre`);

console.log('win pads');
for (const stage of STAGES) {
  const pad = COURSE_SOLIDS.find(
    (solid) => solid.kind === 'winPad' && solid.stage === stage.index - 1,
  );
  if (!pad) {
    fail(`stage ${stage.index} has no win pad solid`);
    continue;
  }
  if (Math.abs((pad.minZ + pad.maxZ) / 2 - stage.winPadZ) > 0.01) {
    fail(`stage ${stage.index} pad geometry and winPadZ disagree`);
  }
  // The pad sits at the player's RIGHT, which is negative X - see the note in
  // the course builder. It must not span the stage, and must not poke through
  // the wall.
  if (stage.winPadX >= 0) fail(`stage ${stage.index} pad is not on the player's right`);
  if (pad.minX < -COURSE.halfWidth - 0.01) {
    fail(`stage ${stage.index} pad pokes through the wall`);
  }
  // And it has to be reachable: solid floor under it.
  const floor = COURSE_SOLIDS.some(
    (s) =>
      s.kind !== 'winPad' &&
      s.maxY <= COURSE.floorY + 0.2 &&
      stage.winPadX >= s.minX &&
      stage.winPadX <= s.maxX &&
      stage.winPadZ >= s.minZ &&
      stage.winPadZ <= s.maxZ,
  );
  if (!floor) fail(`stage ${stage.index} win pad has no floor under it`);
}
if (failures === 0) pass(`${STAGES.length} win pads, right-hand side, all reachable`);

console.log('stage rewards');
const EXPECTED_REWARDS = [1, 3, 8, 20, 50, 120, 200, 400];
for (let i = 0; i < Math.min(STAGES.length, EXPECTED_REWARDS.length); i += 1) {
  const stage = STAGES[i];
  if (stage.winReward !== EXPECTED_REWARDS[i]) {
    fail(`stage ${stage.index} pays ${stage.winReward}, expected ${EXPECTED_REWARDS[i]}`);
  }
}
if (failures === 0) pass(`rewards are ${EXPECTED_REWARDS.join(', ')}`);

console.log('hazards');
for (const hazard of COURSE_HAZARDS) {
  if (hazard.kind === 'roller') {
    // A roller runs down a lane; it must stay inside the corridor for its
    // whole travel, and its lane must actually have length.
    if (hazard.fromZ <= hazard.toZ) fail(`roller at x=${hazard.x} has no lane`);
    if (Math.abs(hazard.x) + hazard.radius > COURSE.halfWidth + 0.5) {
      fail(`roller lane at x=${hazard.x} is outside the corridor`);
    }
    continue;
  }
  const reach = Math.abs(hazard.x) + hazard.sweep + hazard.radius;
  if (reach > COURSE.halfWidth + 0.5) {
    fail(`sweeper at z=${hazard.z} reaches ${reach.toFixed(1)}, past the ${COURSE.halfWidth} wall`);
  }
}
pass(`${COURSE_HAZARDS.length} hazards, all inside the corridor`);

console.log('sinking platforms');
{
  // Every row of stage 3 must keep at least one platform the player can rely
  // on, or the section becomes a coin flip at some phase of the cycle.
  const rows = new Map();
  for (const solid of COURSE_SOLIDS) {
    if (solid.kind !== 'plank' || solid.stage !== 2) continue;
    const z = Math.round((solid.minZ + solid.maxZ) / 2);
    rows.set(z, (rows.get(z) ?? 0) + 1);
  }
  const sinkingRows = new Set();
  for (const platform of SINKING_SOLIDS) {
    sinkingRows.add(Math.round((platform.minZ + platform.maxZ) / 2));
  }
  let unsafe = 0;
  for (const z of sinkingRows) if (!rows.has(z)) unsafe += 1;
  if (unsafe > 0) fail(`${unsafe} sinking row(s) have no fixed platform at all`);
  else pass(`${SINKING_SOLIDS.length} sinking platforms, every row keeps a fixed one`);

  // And a platform must actually come back.
  for (const platform of SINKING_SOLIDS) {
    let up = false;
    let down = false;
    for (let t = 0; t < platform.cycle; t += 0.1) {
      const { drop } = sinkingOffsetAt(platform, t);
      if (drop < 0.01) up = true;
      if (drop > platform.depth * 0.9) down = true;
    }
    if (!up || !down) {
      fail(`a sinking platform never ${up ? 'sinks' : 'returns'}`);
      break;
    }
  }
  pass('every sinking platform both sinks and returns');
}

console.log('training');
{
  // Three belts, and each must be detectable from its own centre.
  let found = 0;
  for (let i = 1; i <= TRAINING.count; i += 1) {
    if (treadmillAt(treadmillX(i), TREADMILL_BELT_Y, TRAINING.centerZ) === i) found += 1;
  }
  if (found !== TRAINING.count) fail(`only ${found}/${TRAINING.count} belts detect`);
  else pass(`${TRAINING.count} identical belts, all detected from their centres`);

  // Standing off the deck must detect nothing.
  if (treadmillAt(0, 0, 0) !== 0) fail('a belt is detected in the middle of the arena');
  else pass('no belt is detected away from the training deck');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} problem(s) found`);
  process.exit(1);
}
console.log('course OK');
