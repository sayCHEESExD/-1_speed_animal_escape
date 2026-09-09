/**
 * Authority tests for the server's progression rules.
 *
 * These are the rules a cheating client would most like to break: awarding
 * itself a stage, banking the same stage twice, or claiming an animal it has
 * not paid for. Each is exercised here against the real services, including
 * the REJECTION paths - a test that only checks the happy path proves nothing
 * about authority.
 *
 * Run with `npm run verify:progression` (builds the server first).
 */
import {
  ANIMALS,
  STAGES,
  STAND_ROW,
  TRAIL_TIERS,
  animalForSlot,
  nextRebirthTier,
  resolveLevel,
  resolveMovementProfile,
  standZ,
} from '../shared/dist/index.js';
import { StageService } from '../server/dist/progression/StageService.js';
import { AnimalService } from '../server/dist/progression/AnimalService.js';
import { RebirthService } from '../server/dist/progression/RebirthService.js';
import { SpeedService } from '../server/dist/progression/SpeedService.js';
import { TrailService } from '../server/dist/progression/TrailService.js';
import { PlayerState } from '../server/dist/rooms/state/PlayerState.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
const check = (label, actual, expected) => {
  const ok = Object.is(actual, expected);
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
  } else {
    console.log(`  ok    ${label}`);
  }
};

/** A fresh player, initialised exactly as the room does on join. */
const newPlayer = (speeds, animals) => {
  const player = new PlayerState();
  player.sessionId = 'test';
  animals.initialise(player);
  speeds.initialise(player);
  return player;
};

console.log('stage rewards');
{
  const speeds = new SpeedService();
  const animals = new AnimalService();
  const stages = new StageService();
  const player = newPlayer(speeds, animals);
  stages.initialise('test');

  const stage = STAGES[0];

  // Nowhere near the pad. The server checks the position IT simulated.
  player.x = 0;
  player.y = 0;
  player.z = stage.winPadZ - 400;
  check('claim from far away is refused', stages.claim('test', player, stage.index).reason, 'not-on-pad');
  check('  wins unchanged', player.wins, 0);

  // Standing on the pad. It is a small rectangle at the RIGHT of the stage
  // end, so X matters as much as Z.
  player.x = stage.winPadX;
  player.z = stage.winPadZ;
  const first = stages.claim('test', player, stage.index);
  check('claim on the pad is granted', first.granted, true);
  check('  wins credited', player.wins, stage.winReward);
  check('  best stage recorded', player.bestStage, stage.index);

  // Immediately again, from the same spot.
  const second = stages.claim('test', player, stage.index);
  check('immediate re-claim is refused', second.granted, false);

  // A stage that does not exist.
  check('unknown stage is refused', stages.claim('test', player, 999).reason, 'unknown-stage');

  // Banking a stage RETURNS the player to the arena, and running it again
  // pays again - that is how a player grinds for a better animal.
  await sleep(500);
  const third = stages.claim('test', player, stage.index);
  check('a second run of the same stage pays again', third.granted, true);
  check('  wins credited twice', player.wins, stage.winReward * 2);

  // Every configured reward, checked against the specification.
  const expected = [1, 3, 8, 20, 50, 120, 200, 400];
  let rewardsOk = true;
  for (let i = 0; i < expected.length; i += 1) {
    if (STAGES[i].winReward !== expected[i]) rewardsOk = false;
  }
  check('stage rewards are 1/3/8/20/50/120/200/400', rewardsOk, true);
}

console.log('rebirth');
{
  const speeds = new SpeedService();
  const animals = new AnimalService();
  const rebirths = new RebirthService();
  const player = newPlayer(speeds, animals);
  rebirths.sync(player);

  check('rebirth 1 needs level 25', nextRebirthTier(0).requiredLevel, 25);
  check('rebirth 2 needs level 50', nextRebirthTier(1).requiredLevel, 50);
  check('level cap is the next rebirth requirement', player.maxLevel, 25);
  check('a level-1 player may not rebirth', rebirths.isEligible(player), false);
  check('  and the request is refused', rebirths.rebirth(player, speeds).ok, false);

  // Earn the cap. Wins and animals must survive what follows.
  player.wins = 137;
  player.ownedAnimals = 0b111;
  player.totalSpeed = 1e9;
  speeds.syncDerived(player);
  check('capped at level 25', player.level, 25);
  check('now eligible', rebirths.isEligible(player), true);

  const done = rebirths.rebirth(player, speeds);
  check('rebirth is granted', done.ok, true);
  check('  level reset to 1', player.level, 1);
  check('  Speed reset to 0', player.totalSpeed, 0);
  check('  rebirth count is 1', player.rebirths, 1);
  check('  cap raised to 50', player.maxLevel, 50);
  check('  Speed multiplier is x2', player.moveMultiplier, 2);
  check('  Wins survived', player.wins, 137);
  check('  animals survived', player.ownedAnimals, 0b111);
}

console.log('trails');
{
  const speeds = new SpeedService();
  const animals = new AnimalService();
  const trails = new TrailService();
  const player = newPlayer(speeds, animals);
  trails.initialise(player);

  const first = TRAIL_TIERS[0];
  check('starts with no trail', player.trailSlot, 0);
  check('  and owns none', player.ownedTrails, 0);

  check('buying with no Wins is refused', trails.buy(player, first.slot, speeds).reason, 'too-poor');
  check('equipping an unowned trail is refused', trails.equip(player, first.slot, speeds).reason, 'not-owned');
  check('an unknown slot is refused', trails.buy(player, 999, speeds).reason, 'unknown-slot');

  player.wins = 1000;
  const bought = trails.buy(player, first.slot, speeds);
  check('buying with Wins is granted', bought.ok, true);
  check('  price deducted', player.wins, 1000 - first.cost);
  check('  equipped on purchase', player.trailSlot, first.slot);
  check('  movement multiplier rose', player.moveMultiplier > 1, true);

  await sleep(400);
  check('re-buying is refused', trails.buy(player, first.slot, speeds).reason, 'already-owned');

  check('taking it off is allowed', trails.equip(player, 0, speeds).ok, true);
  check('  multiplier back to base', player.moveMultiplier, 1);
}

console.log('treadmills');
{
  const speeds = new SpeedService();
  const animals = new AnimalService();
  const player = newPlayer(speeds, animals);
  speeds.reset('test', player);

  // Standing perfectly still ON a belt still farms: the belt supplies the
  // distance, which is the whole point of an AFK trainer.
  player.treadmill = 1;
  const before = player.totalSpeed;
  for (let i = 0; i < 60; i += 1) speeds.credit('test', player, 1 / 60);
  check('a still player on a belt farms Speed', player.totalSpeed > before, true);

  // Stepping off stops it dead.
  player.treadmill = 0;
  const parked = player.totalSpeed;
  for (let i = 0; i < 60; i += 1) speeds.credit('test', player, 1 / 60);
  check('a still player off a belt farms nothing', player.totalSpeed, parked);
}

console.log('animal claiming');
{
  const speeds = new SpeedService();
  const animals = new AnimalService();
  const player = newPlayer(speeds, animals);

  const llama = ANIMALS.find((a) => a.slot === 2);

  check('starts on the free starter', player.animalSlot, 1);
  check('  owns only the starter', player.ownedAnimals, 1);

  // At the stand, but broke. The line-up is a COLUMN down the left wall, so
  // the fixed axis is X and the per-slot axis is Z.
  player.x = STAND_ROW.x;
  player.y = 0;
  player.z = standZ(llama.slot);
  check('claim with no Wins is refused', animals.claim(player, llama.slot, speeds).reason, 'too-poor');
  check('  still on the starter', player.animalSlot, 1);

  // Rich, but standing somewhere else entirely.
  player.wins = 500;
  player.x = 0;
  player.z = 0;
  check('claim away from the stand is refused', animals.claim(player, llama.slot, speeds).reason, 'not-at-stand');
  check('  Wins not deducted', player.wins, 500);

  // Rich and in the right place.
  player.x = STAND_ROW.x;
  player.z = standZ(llama.slot);
  const bought = animals.claim(player, llama.slot, speeds);
  check('claim at the stand with Wins is granted', bought.granted, true);
  check('  price deducted', player.wins, 500 - llama.winsRequired);
  check('  now equipped', player.animalSlot, llama.slot);
  check('  Speed per stride follows the animal', player.speedPerStep, llama.speedPerStep);

  // Buying it again must not charge twice.
  await sleep(300);
  const again = animals.claim(player, llama.slot, speeds);
  check('re-claiming an owned animal is refused', again.reason, 'already-owned');

  // A cheaper animal must never downgrade the equipped one.
  const winsBefore = player.wins;
  await sleep(300);
  player.z = standZ(1);
  animals.claim(player, 1, speeds);
  check('claiming the starter again does not downgrade', player.animalSlot, llama.slot);
  check('  and costs nothing', player.wins, winsBefore);
}

console.log('speed and levels');
{
  const speeds = new SpeedService();
  const animals = new AnimalService();
  const player = newPlayer(speeds, animals);

  check('starts at level 1', player.level, 1);

  // Credit honest movement: sixty 1/60-second steps at a plausible gallop.
  // The per-step distance has to be one the server would actually observe -
  // anything larger is a teleport by definition and pays nothing.
  speeds.reset('test', player);
  const perStep = 24 / 60;
  let z = 0;
  for (let i = 0; i < 60; i += 1) {
    z += perStep;
    player.z = z;
    speeds.credit('test', player, 1 / 60);
  }
  check('honest movement pays', player.totalSpeed > 0, true);

  // A teleport must pay nothing at all.
  const beforeTeleport = player.totalSpeed;
  player.z = z + 5000;
  speeds.credit('test', player, 1 / 60);
  check('a teleport pays nothing', player.totalSpeed, beforeTeleport);

  // The level curve reproduces the reference art's figures.
  const at52 = resolveLevel(453600, 100);
  check('453.6K Speed resolves to level 52', at52.level, 52);

  // Movement speed rises with level through the one shared formula. The cap
  // before any rebirth is level 25, so that is where a huge Speed total lands -
  // getting past it is what the rebirth ladder is FOR.
  player.totalSpeed = 453600;
  speeds.syncDerived(player);
  check('a huge Speed total caps at the pre-rebirth level', player.level, 25);
  // The INVARIANT, not a number. The magic 2 that used to be here was a fact
  // about the linear curve and failed the moment that curve was given the
  // diminishing returns which keep a late-game mount landable. What actually
  // has to be true is that levelling makes you faster and keeps making you
  // faster - which is checkable without hard-coding how much.
  const atLevel1 = resolveMovementProfile(1, 0, 1, 1).multiplier;
  const atCap = resolveMovementProfile(25, 0, 1, 1).multiplier;
  const higher = resolveMovementProfile(60, 0, 1, 1).multiplier;
  check('level drives the replicated multiplier', player.moveMultiplier > atLevel1, true);
  check('  and it is the level cap that is driving it', player.moveMultiplier, atCap);
  check('  and a higher level is still faster', higher > atCap, true);
  check('  and the animal is still the starter', player.animalSlot, 1);
  check('  speedPerStep matches the equipped animal', player.speedPerStep, animalForSlot(1).speedPerStep);
}

console.log('');
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('progression OK');
