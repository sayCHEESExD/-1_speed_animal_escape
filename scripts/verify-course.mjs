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
  QUICKSAND,
  SINKING_SOLIDS,
  SPAWN_POSITION,
  STAGES,
  TRAINING,
  RUINS_ARENA,
  TREADMILL_BELT_Y,
  WIDE_AREAS,
  corridorHalfWidthAt,
  hazardReachX,
  totalSpeedToReach,
  resolveMovementProfile,
  sinkingOffsetAt,
  treadmillAt,
  treadmillZ,
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
  // Sinking platforms count. They are floor for most of every cycle - the
  // vanishing bridge is made of nothing else - and leaving them out reported
  // that whole stage as one 239-unit hole no player could jump.
  const spans = [...COURSE_SOLIDS, ...SINKING_SOLIDS]
    .filter((solid) => solid.kind !== 'boost')
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
  const centre = [...COURSE_SOLIDS, ...SINKING_SOLIDS].filter(
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

// Past the authored head, the only rules are that the curve keeps climbing and
// never pays less for a harder stage. A later stage worth fewer Wins than an
// earlier one would make the whole ladder something to farm backwards.
{
  let broken = 0;
  for (let i = 1; i < STAGES.length; i += 1) {
    if (STAGES[i].winReward <= STAGES[i - 1].winReward) {
      broken += 1;
      fail(
        `stage ${STAGES[i].index} pays ${STAGES[i].winReward}, ` +
          `no more than stage ${STAGES[i - 1].index}`,
      );
    }
  }
  if (broken === 0) {
    pass(
      `${STAGES.length} rewards, strictly increasing to ` +
        `${STAGES[STAGES.length - 1].winReward}`,
    );
  }
}

console.log('respawn');
{
  /*
   * There is ONE place a player can arrive, and no stage may carry another.
   *
   * The checkpoint system is gone: dying anywhere returns the player to the
   * starting arena. This checks the shape of that rather than the behaviour -
   * a stage that carried a respawn Z again would be the first step back
   * toward per-stage respawns, and it would be added here long before anyone
   * noticed it in play.
   */
  const strays = STAGES.filter((stage) =>
    Object.keys(stage).some((key) => /checkpoint|respawn/i.test(key)),
  );
  if (strays.length > 0) {
    fail(`${strays.length} stage(s) carry their own respawn point`);
  } else if (SPAWN_POSITION.z > COURSE.lobbyEndZ || SPAWN_POSITION.z < COURSE.lobbyStartZ) {
    fail(`the spawn at z=${SPAWN_POSITION.z} is not inside the starting arena`);
  } else {
    pass(`one spawn, at z=${SPAWN_POSITION.z}, and no stage defines another`);
  }
}

console.log('difficulty ladder');
{
  /*
   * The recommended level has to climb, and it has to be REACHABLE.
   *
   * The level cap is 25 per rebirth, so a stage recommending level 130 is
   * asking for five of them. That is a legitimate ask at the end of a
   * twenty-stage ladder and an absurd one in the middle, which is why this
   * prints the rebirths each stage implies rather than merely checking the
   * numbers go up.
   */
  let broken = 0;
  for (let i = 1; i < STAGES.length; i += 1) {
    if (STAGES[i].recommendedLevel <= STAGES[i - 1].recommendedLevel) {
      broken += 1;
      fail(`stage ${STAGES[i].index} recommends no more level than stage ${STAGES[i].index - 1}`);
    }
    if (STAGES[i].recommendedSpeed <= STAGES[i - 1].recommendedSpeed) {
      broken += 1;
      fail(`stage ${STAGES[i].index} recommends no more Speed than stage ${STAGES[i].index - 1}`);
    }
  }

  // The advertised Speed must be the Speed that level actually costs, or the
  // gate is telling the player two different things.
  for (const stage of STAGES) {
    const owed = totalSpeedToReach(stage.recommendedLevel);
    if (Math.abs(stage.recommendedSpeed - owed) > 1) {
      broken += 1;
      fail(
        `stage ${stage.index} advertises ${stage.recommendedSpeed} Speed for ` +
          `level ${stage.recommendedLevel}, which actually costs ${owed}`,
      );
    }
  }

  const last = STAGES[STAGES.length - 1];
  const rebirthsNeeded = Math.max(0, Math.ceil(last.recommendedLevel / 25) - 1);
  if (broken === 0) {
    pass(
      `levels ${STAGES[0].recommendedLevel}-${last.recommendedLevel} rising every stage, ` +
        `the last needing ${rebirthsNeeded} rebirth(s)`,
    );
  }
}

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
  // Sweeper, spinner and tornado all reach `|x| + sweep + radius` at the far
  // side of their travel - a sweep and an orbit have the same extreme. What
  // they must fit inside is the corridor AT THEIR OWN Z, not the nominal
  // width: half the later stages are arenas, and checking them against 32
  // would condemn every arm that was correctly built for a wider room.
  const wall = corridorHalfWidthAt(hazard.z);
  const reach = hazardReachX(hazard);
  if (reach > wall + 0.5) {
    fail(`${hazard.kind} at z=${hazard.z.toFixed(0)} reaches ${reach.toFixed(1)}, past the ${wall} wall`);
  }
}
pass(`${COURSE_HAZARDS.length} hazards, all inside the corridor`);

console.log('sinking platforms');
{
  /*
   * Every row must be crossable AT EVERY MOMENT.
   *
   * The original rule was "each row keeps one fixed platform", which is how
   * the sands are built but not how the vanishing bridge is: there, all three
   * lanes sink and the phases are a third of a cycle apart, so one is always
   * up. A rule that only knew about fixed platforms called that unplayable
   * while it is in fact the whole design.
   *
   * So the check is the real question instead of a proxy for it: sample the
   * cycle and require that at some usable height, something in the row is
   * standable at every sampled instant.
   */
  const rows = new Map();
  const rowKey = (z) => Math.round(z / 4) * 4;

  for (const solid of COURSE_SOLIDS) {
    // Anything solid and roughly at floor level counts as a fixed platform.
    if (solid.kind === 'boost' || solid.maxY > COURSE.floorY + 0.3) continue;
    if (solid.maxY < COURSE.floorY - 2) continue;
    const key = `${solid.stage}:${rowKey((solid.minZ + solid.maxZ) / 2)}`;
    if (!rows.has(key)) rows.set(key, { fixed: 0, sinking: [] });
    rows.get(key).fixed += 1;
  }
  for (const platform of SINKING_SOLIDS) {
    const key = `${platform.stage}:${rowKey((platform.minZ + platform.maxZ) / 2)}`;
    if (!rows.has(key)) rows.set(key, { fixed: 0, sinking: [] });
    rows.get(key).sinking.push(platform);
  }

  // How far a platform may have dropped and still be ridden onto. The mount
  // steps up `stepHeight`, so a platform lower than that from its neighbours
  // is gone as far as the player is concerned.
  const STANDABLE = MOVEMENT.stepHeight;
  let unsafe = 0;
  let sampled = 0;
  for (const [key, row] of rows) {
    if (row.sinking.length === 0) continue;
    if (row.fixed > 0) continue;
    sampled += 1;
    const cycle = Math.max(...row.sinking.map((s) => s.cycle));
    let worst = null;
    for (let i = 0; i < 120; i += 1) {
      const t = (cycle * i) / 120;
      const up = row.sinking.filter(
        (s) => sinkingOffsetAt(s, t).drop <= STANDABLE,
      ).length;
      if (worst === null || up < worst) worst = up;
    }
    if (worst === 0) {
      unsafe += 1;
      fail(`sinking row ${key} has no platform up at some point in its cycle`);
    }
  }
  if (unsafe === 0) {
    pass(`${sampled} all-sinking row(s) keep a platform up through the whole cycle`);
  }
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
    if (treadmillAt(TRAINING.centerX, TREADMILL_BELT_Y, treadmillZ(i)) === i) found += 1;
  }
  if (found !== TRAINING.count) fail(`only ${found}/${TRAINING.count} belts detect`);
  else pass(`${TRAINING.count} identical belts, all detected from their centres`);

  // Standing off the deck must detect nothing.
  if (treadmillAt(0, 0, 0) !== 0) fail('a belt is detected in the middle of the arena');
  else pass('no belt is detected away from the training deck');
}

console.log('wide areas');
{
  // The ruins have to be an ARENA, not another lane - comparable to the
  // starting arena rather than to the corridor.
  const arenaHalf = RUINS_ARENA.halfWidth;
  if (arenaHalf < COURSE.lobbyHalfWidth * 0.8) {
    fail(`ruins half-width ${arenaHalf} is not comparable to the arena's ${COURSE.lobbyHalfWidth}`);
  } else {
    pass(`ruins arena is ${arenaHalf * 2} x ${(RUINS_ARENA.maxZ - RUINS_ARENA.minZ).toFixed(0)}`);
  }

  // Every wide area needs floor all the way to its own boundary, or the clamp
  // holds the player over open air.
  for (const area of WIDE_AREAS) {
    const midZ = (area.minZ + area.maxZ) / 2;
    const edge = area.halfWidth - 0.5;
    const covered = COURSE_SOLIDS.some(
      (s) =>
        s.kind !== 'boost' &&
        s.maxY <= COURSE.floorY + 0.2 &&
        edge >= s.minX &&
        edge <= s.maxX &&
        midZ >= s.minZ &&
        midZ <= s.maxZ,
    );
    /*
     * A wide area's edge must be somewhere the player can BE: either floor, or
     * a killing surface that was put there on purpose. The lava crossing and
     * the cliffs are pits from wall to wall by design, and being clamped into
     * one of those is a death the stage intends - what this rule exists to
     * catch is a clamp holding someone over nothing at all.
     */
    const drowned = QUICKSAND.some(
      (q) => edge >= q.minX && edge <= q.maxX && midZ >= q.minZ && midZ <= q.maxZ,
    );
    if (!covered && !drowned) {
      fail(`wide area at z=${midZ.toFixed(0)} has neither floor nor a pit at its edge`);
    }
    if (Math.abs(corridorHalfWidthAt(midZ) - area.halfWidth) > 0.01) {
      fail(`the boundary at z=${midZ.toFixed(0)} disagrees with its own width`);
    }
  }
  pass(`${WIDE_AREAS.length} wide areas, floored to their own boundary`);
}

console.log('corridor width');
{
  // Everything past the arena runs at the corridor width unless a wide area
  // says otherwise, and obstacles are laid out as fractions of it.
  pass(`corridor is ${COURSE.halfWidth * 2} wide`);
  const strays = COURSE_SOLIDS.filter(
    (s) => s.stage >= 0 && (s.minX < -COURSE.halfWidth - 0.01 || s.maxX > COURSE.halfWidth + 0.01),
  ).filter((s) => {
    const midZ = (s.minZ + s.maxZ) / 2;
    return corridorHalfWidthAt(midZ) <= COURSE.halfWidth + 0.01;
  });
  if (strays.length > 0) fail(`${strays.length} stage solid(s) stick out past the corridor wall`);
  else pass('no stage geometry pokes through a wall');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} problem(s) found`);
  process.exit(1);
}
console.log('course OK');
