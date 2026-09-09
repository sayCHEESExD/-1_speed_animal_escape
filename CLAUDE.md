# CLAUDE.md — +1 Animal Obby Escape

Permanent project rules and design constraints. Read this before changing anything.

## What this is

A **production** browser multiplayer obby game, and the next game in the same
series as `+1 Backflip Obby Escape`. Not a demo, not a prototype.
"Roblox-inspired" describes the **visual and gameplay style only**.

The one gameplay difference from the previous game: the player does not
backflip, they **ride an animal**. The animal replaces the boots as the
movement vehicle, the progression ladder and the thing on screen.

## Technology (fixed)

| Layer  | Stack                                   |
| ------ | --------------------------------------- |
| Client | Three.js + TypeScript + Vite            |
| Server | Colyseus + Node.js + TypeScript         |
| Shared | TypeScript, framework-free              |
| Target | Browser / WebGL, desktop **and** mobile |
| Repo   | npm workspaces monorepo                 |

**Not used, ever:** Unity. Roblox Studio or the Roblox engine. Any other game
engine. Do not add a framework or a build tool without a concrete need.

## Hard constraints

- Final browser build must stay **under 12 MB**. It is currently ~0.9 MB.
- **Progression and rewards are server-authoritative.** The client may predict
  for UI feel but never decides, computes or claims a reward.
- Desktop and mobile browsers are both first-class. No desktop-only input
  assumptions.
- **Ports are not the defaults.** The previous game in this series runs on
  2567 (Colyseus) and 5173 (Vite) on the same machine. This game uses **2568**
  and **5174** so the two can run side by side; sharing either port means
  whichever server starts first silently serves both clients.
  The dev script passes `--port 2568` explicitly, because a dev harness that
  hosts the client often exports `PORT` for its own web server and the game
  server would otherwise bind to it.

## Reboot, trails and training

- **Reboot** is the prestige ladder, ported from the previous game's rebirth
  system and behaviourally identical. `REBOOT_TIERS` is the authored head
  (level 25 -> x2, level 50 -> x3) and `EXTENSION` continues the same pattern
  for ever, so a third reboot is one row in a table.
- The level CAP is not a constant: it is whatever the next reboot requires, so
  reaching the cap and unlocking a reboot are the same moment. A cap is a gate,
  never a dead end.
- A reboot resets the level curve - which means clearing `totalSpeed`, because
  level FOLLOWS from it - and deliberately keeps Wins, animals and trails. It
  also returns the player to the arena: their speed is no longer what carried
  them to wherever they were standing.
- **Trails** multiply ACTUAL MOVEMENT SPEED, through the shared formula's
  `extraMultiplier` and never a calculation of their own. The equipped animal
  owns Speed-per-stride; the two axes never cross.
- Trail multipliers are deliberately gentle. Movement speed is already
  multiplied by level and by reboot, and a steep cosmetic ladder on top puts a
  rebooted player through the obby faster than its platforms can be read.
- **Treadmills** are three IDENTICAL belts on the training deck. Identical is
  the point: they are somewhere to farm while chatting, not a ladder, so there
  is nothing to choose between them and no reason to queue.
- A treadmill is not a pinned state and needs no button. `treadmillAt` derives
  it from POSITION every step on both sides: walking on starts it, walking off
  stops it, and there is no treadmill message for a client to forge.
- A runner earns from the BELT: distance is `beltSpeed x step` instead of a
  position delta, fed through the same per-stride formula. There is no second
  progression path.

## Core game design

**The mount**

- The player rides an animal. The ANIMAL is the movement character: the
  simulation's transform, the collision body and the physics all belong to it.
  The rider is carried and has no transform of their own on the wire.
- The rider is parented to the animal's **body node**, so it inherits the gait
  bob, pitch and roll for free. There is deliberately no per-frame "copy the
  animal's transform onto the rider" step - a copy is always a frame late and
  always slides.
- **The rider's walking animation never plays.** A rider whose legs cycle while
  seated is the single most obvious way a mounted character looks wrong, so the
  locomotion cycle does not exist on the rider's side at all. The animal does
  all the walking.
- Swapping animals rebuilds only the animal half. The FBX clone, its rig and
  its animator are expensive and completely independent of the species
  underneath, so they are re-parented rather than recreated.

**Movement**

- **The MOUSE aims the camera; the camera defines forward.** WASD moves
  relative to it and never rotates it. `ThirdPersonCamera` owns its yaw/pitch,
  `MouseLook` writes them, and `stepPlayer` rotates the stick by that yaw.
  The animal's facing then follows where it actually moves.
- The camera's RIGHT is `(-cos yaw, sin yaw)`. At yaw 0 that is world **-X**,
  so pressing D moves the mount toward -X. Getting this backwards inverts
  strafing, and a trailing camera would hide it completely.
- **The player's LEFT is +X and their RIGHT is -X.** Every "left" and "right"
  in the world layout means the PLAYER's, and both were authored backwards once
  already: the animal line-up at -44 and the win pads at +10 came out on the
  wrong sides of the screen.
- **`LANDING_TOLERANCE` and `MOVEMENT.stepHeight` are the same number, and must
  stay that way.** `surfaceYAt` reports the highest surface within a step of the
  feet and `canLandOn` decides whether the mount may settle onto it; when the
  two disagreed, every ledge between them - the training deck, the animal
  stands, every win pad - was reported as the floor and then refused as a
  landing, and the mount fell straight through the solid ground underneath and
  never recovered.
- A feature the player is meant to ride over must be UNDER `stepHeight`. Stage
  one's kerbs were 1.4 and stopped a gallop dead, which contradicted the whole
  point of the stage.
- **One render transform.** `LocalPlayer.position` is the simulation
  interpolated to the current frame PLUS the eased reconciliation offset, and
  the camera, the mount and the world triggers all read it.
- The camera smooths the POINT IT FOLLOWS, once. Smoothing the position while
  taking the look target raw makes the two disagree every frame, which reads as
  vibration however gentle the smoothing is.
- `reconcile` must not collapse the interpolation baseline onto the replayed
  state: replay re-runs inputs the client already ran, so the baseline is still
  valid, and re-basing it twenty times a second is a visible tick. Only a SNAP
  resets it.
- **There is no speed cap, and there must not be one.** `stepPlayer`
  SUBDIVIDES its own step until no substep travels further than
  `MOVEMENT.maxSubstepDistance`, so collision is exactly as reliable at 400
  units/second as at 20. That substepping is the whole reason the progression
  curve can run as far as it likes. Never "fix" a tunnelling bug by capping
  speed.
- **Velocity determines jump distance.** Faster approach = longer jump. Jump
  velocity scales far more gently than travel speed, so distance comes from
  approach speed rather than from a bigger hop.
- Horizontal collision is **axis-separated**: move X, resolve, move Z, resolve,
  then move Y. Exact for an axis-aligned course, and it cannot oscillate the
  way a combined push-out can.
- A solid only blocks when its top is more than `MOVEMENT.stepHeight` above the
  feet. The course is full of kerbs, plank lips and 0.55-unit stands that must
  be ridden straight over.

**Progression**

- **Speed** is the currency. Players farm it by riding: distance the SERVER
  observes, plus a bonus each time the animal leaves the ground.
- Level follows from lifetime Speed through `resolveLevel`, and level drives
  **actual movement speed**. Farming Speed is what physically opens the later
  stages.
- The level curve reproduces the reference art: `baseRequirement` 650 and
  `growth` 1.082 put level 52 at roughly 450K lifetime Speed with about 36K to
  the next level, which is what the reference screenshots show.
- **Animals** set Speed gained per stride and are bought with stage Wins.
  Buying is a DELIBERATE ACT: the player must ride onto the stand while holding
  enough Wins. Reaching the Wins total alone does nothing.
  Wins are SPENT - the price is deducted - and the highest tier OWNED is always
  equipped, so a purchase can never downgrade anyone.
- **Wins** come from crossing a stage's win pad - a small rectangle at the
  player's RIGHT at the stage end. Crossing it awards that stage's Wins and
  RETURNS the player to the arena, which is what the pad's "Return" label
  promises and also what makes a second payment impossible: the pad is hundreds
  of units behind them before another request could arrive. The cooldown is
  spam protection only, which is why it is short and checked last.
- Stage rewards are 1, 3, 8, 20, 50, 120, 200, 400 and live in ONE table,
  `STAGE_REWARDS`. Anything past it continues the same doubling curve, so a
  ninth stage needs no edit.

**Multiplayer**

- Other players are **ghosted**, and that word means EXACTLY one thing: they do
  not collide, so they can never block another player's run. They render
  completely normally - opaque, no fade, no ghost material.
- Remote animation is DERIVED from authoritative state, never from an event
  stream. A jump is "was grounded, now is not". `deathCount` is a LIFETIME
  total, so it only means anything as a difference against a baseline the
  client took on FIRST sight - treating it as "deaths to play" would replay a
  stranger's whole session.
- **Never transmit bone transforms or animal part transforms.** Every remote
  mount runs the same procedural animators the local one does, from a handful
  of motion fields.

## Assets

- `assets/player/player.fbx` is the **canonical** player asset.
- `assets/player/base_rig.fbx` is **byte-identical** to it. Do not load both and
  do not create a second runtime player asset.
- **Never modify the supplied FBX files.**
- The FBX embeds **dead absolute texture paths** (`X:\legion\poxel\...`).
  Texture resolution is handled explicitly in `client/src/config/assets.ts` and
  `client/src/player/PlayerModelLoader.ts`: every texture request is remapped
  before it hits the network, and materials are assigned in code after load.
- The FBX contains **no animation clips** - it is a bind-pose rig with 12 bones
  (`Rig1 Spine1 Spine2 Neck1 ArmL1 ArmL2 ArmR1 ArmR2 LegR1 LegR2 LegL1 LegL2`).
  All animation is **procedural**. Do not add an animation library or a clip
  pack.
- The FBX declares **two skin deformers**, so FBXLoader creates two Bone objects
  per name: the real joint and a zero-length terminal child. `PlayerRig` binds
  the **first** bone of each name (traversal visits a parent before its child),
  which drives both meshes. Binding the terminals animates the arms only.
- The rider's hip joints sit **1.21 world units** above the model's own origin.
  Every animal's `riderOffset.y` is `belly + bodyHeight + 0.2 - 1.21`. Setting
  it to the saddle height instead buries the rider's legs inside the barrel.
- **There is not one image file in the build.** Every world texture - the
  studded ground, the brick walls, the planks, the gold pads, the chevrons and
  the sky - is drawn on a canvas at runtime by `WorldTextures`.

## Animals

- The roster is **pure data** in `shared/src/config/animals.ts`. Adding an
  eleventh animal is a new entry and nothing more: no movement code, no
  renderer branch, no server case statement. It gets a stand in the lobby
  automatically.
- There is ONE generic quadruped builder. A llama and a panda are the same
  twelve boxes at different sizes with different `features` bolted on. There is
  deliberately no per-species modelling code.
- Geometry is **merged per moving part and cached per species**, and colour
  lives in the VERTICES - so the whole roster renders with a single
  `MeshLambertMaterial` and a ten-animal lobby is about seventy meshes, not
  seven hundred.
- Markings are a fixed lattice, never a random scatter: every client must draw
  the same deer.

## Animation

Procedural, and required for the finished game - not a placeholder.

- `AnimalAnimator` and `RiderAnimator` are the only animation state machines.
  Animation logic never goes in movement, input or networking code.
- They consume a read-only `AnimationInput` and write **only** to the animal's
  animated nodes and to the rider's bones. They must never move the mount's
  physics root, change velocity, or decide a gameplay outcome.
- Rider poses are authored in **character space** (`+X` pitch swings a limb
  **backward**) and resolved onto each bone's baked local axes by `PlayerRig`.
  Every frame rebuilds `rotation * restQuaternion` from scratch, so posing
  cannot drift.
- A thigh already swung forward points along the character's own Z, so rolling
  it about Z just spins it about its own length. **Splaying the legs to
  straddle the barrel has to be a YAW**, not a roll.
- Walk and gallop are ONE cycle. The gait blend raises the cadence, deepens the
  pose and slides the four legs from a diagonal two-beat into a four-beat
  bound, so speeding up reads as a change of gait rather than the same trot
  played faster.
- Gait phase advances with **distance**, not wall-clock time - but the cadence
  is CLAMPED (`GAIT.maxFrequency`). A level-80 mount covers four hundred units
  a second, and an unclamped cycle would strobe. The sense of pace comes from
  the world going past.
- The gait blend is measured against the player's own `moveMultiplier`, so
  "galloping" means the same thing at level 1 and level 80.
- The animal runs first and hands the rider its **gait phase**, so both halves
  bounce to one cycle rather than to two clocks that drift apart.

## World

- The course is **generated, not authored**, from a six-pattern table in
  `shared/src/config/course.ts`. `COURSE_SOLIDS` and `COURSE_HAZARDS` are read
  by BOTH the renderer and the collision model, so a platform the client draws
  but the server does not know about is structurally impossible.
- A stage's LENGTH is not a constant: it is whatever the patterns it drew came
  to. Stages are positioned from the **build cursor**, never from a nominal
  length - doing the latter made them overlap.
- The first stage begins exactly at `lobbyEndZ`. Any gap there is an unmarked
  hole across the full width of the course that every player falls into on
  their first gallop.
- Hazards are a **pure function of time** (`hazardPositionAt`), as are the
  sinking platforms (`sinkingOffsetAt`). The server evaluates them against its
  own clock to decide a death and the client against its estimate of the same
  clock to draw them. There is no hazard state on the wire.
- The client ADVANCES its own copy of that clock between patches and re-bases it
  whenever a fresher `elapsed` arrives. Freezing it between patches makes every
  moving thing stutter at the patch rate.
- **The elephant is the one exception, deliberately.** It CHASES, so its
  position depends on where the players are - that is state, not a formula - so
  the server simulates it, replicates x/z/yaw/charging, and decides the trample
  from its own position. There is no elephant message.
- Quicksand is a per-region death plane a couple of units under the platforms,
  not the global one. Being swallowed by sand reads far better than falling
  twenty units first.
- The pink walls are **scenery**. What holds the player in is
  `WorldCollision.clampToBounds`, applied after the substep has already
  integrated, so no speed can tunnel it - a wall collider could be.
- Solids are bucketed by Z. At late-game speeds one frame is dozens of
  substeps, and a linear scan per substep would be the whole frame budget.
- `texturedBox` scales UVs to WORLD size, so one texture tiles across every
  solid at the same physical scale. Without it a 190-unit runway and a 9-unit
  island each stretch one copy of the texture over themselves.
- World signs are **single-sided**. A double-sided panel is legible from the
  front and MIRRORED from behind, which is worse than not being there.

## Architecture rules

- **No god files.** Logic belongs in its module: `net`, `player`, `input`,
  `rendering`, `camera`, `animation`, `animal`, `world`, `progression`, `config`.
- Gameplay tuning is **data-driven** and lives in `shared/src/config/*`. Numbers
  the client and server must agree on go in `shared/`, never duplicated.
- `shared/` must not import `three`, `colyseus`, or anything DOM.
- The client touches `colyseus.js` only inside `client/src/net/`.
- **Movement speed has exactly one EVALUATOR**: `resolveMovementProfile` in
  `shared/src/config/movement.ts`. The server evaluates it and replicates the
  multiplier; the client multiplies its base speeds by that and never derives
  its own. A new modifier is a factor fed through it, never a second formula.
- **Wins move in exactly one place**: `Wallet`. Two things want to move
  them - finishing a stage and claiming an animal - and they must not become
  two ways to take payment.
- **Speed is granted in exactly one place**: `SpeedService`, derived from
  movement the server observes and capped at a plausible step so a teleport
  pays nothing. The cap is derived from the player's OWN authoritative run
  speed, so validation and movement cannot disagree.
- **Deaths are decided on the server tick**, from the position it simulated and
  the clock it owns. There is deliberately no hazard message. The client
  predicts a death only to start drawing the fall-over on the right frame.
- Persistence sits behind `PersistenceAdapter`. Nothing above that boundary
  knows where profiles are stored, and `createPersistence` is the ONLY place
  naming a concrete adapter.
- Only the DERIVING facts are persisted (Speed, Wins, owned animals, rebirths,
  best stage). Level, movement speed and the equipped animal are recomputed on
  load through the same formulas a live session uses, so a tuning change
  reaches returning players.

## UI

The HUD is: **Wins** upper centre, **Reboot** and **Trails** on the left rail,
and **Speed** and **Level** along the bottom. Nothing else yet.

- `hudStyles.ts` owns the one stylesheet and the inline SVG icons, so the rail,
  the win counter and both panels cannot drift apart visually.
- Everything shown is replicated server state. The HUD never awards, predicts or
  derives progress; a rail tile is "ready" when the server would accept the
  request behind it, read from replicated figures rather than decided locally.
- `Panel` counts open modals and the input layer polls that count to suppress
  movement. A COUNT rather than a boolean, so two panels closing out of order
  cannot leave the game permanently suppressed.

## Verification

Do not claim something works without running it.

- `npm run typecheck` must pass.
- `npm run verify` must pass - it checks the generated course for holes,
  overlapping stages and unjumpable gaps, and exercises the server's reward and
  purchase authority INCLUDING the rejection paths.
- Browser behaviour must be checked in a real browser.

When driving the game from the browser console for a test, note that the window
`blur` fired when the pane loses focus correctly clears every held key - a test
harness has to re-assert them each frame.

## World layout

- A large starting arena (116 x 112): the animal line-up down the player's LEFT
  wall, open ground through the middle, the training deck on the RIGHT, and a
  deliberately EMPTY back wall. The back stays clean; it is not a third feature
  area.
- Then eight stages. 1-5 are authored by hand because each has its own
  mechanic; 6-8 are generated from the pattern vocabulary, which is what proves
  the architecture extends.
  1. **Meadow Hops** - platforms close together with small gaps, short enough
     that a fast player simply RUNS across them. A 4-unit gap at 24 u/s drops
     the mount past the landing tolerance and is a jump; the same gap at 60 u/s
     lands. Getting faster is what turns the stage into a sprint.
  2. **Rolling Corridor** - an elevated gantry with balls rolling down it and
     zigzag ledges to wait on. Reached by STAIRS: one tall box is a wall,
     because the simulation steps over a kerb and not over a storey.
  3. **Sinking Sands** - a quicksand pit crossed on platforms that shake, sink
     and return. Every row keeps at least one FIXED platform, which guarantees
     a route however the cycles line up.
  4. **Hidden Grove** - real planks among tree canopies that only look like
     them. The tell is a material one, so it is readable if the player looks.
  5. **Ancient Ruins** - open ground, blocky arches for cover, and the elephant.
- The world has a REAL bottom: a pit floor under everything, with the death
  plane well above it. A fall into a pit whose bottom is visible reads as a pit;
  an infinite void reads as an unfinished map. Do not "fix" a void by hiding it
  behind a flat object.
- The sky is a gradient dome plus a field of BLOCKY box clouds - real geometry
  merged into two meshes. Painted cumulus is the fastest way to stop this world
  looking like the game it is copying.

## Current milestone

Milestone 2 is complete: the reboot ladder, trails, the training area and its
three treadmills, the new HUD (Wins, Reboot, Trails), right-hand win pads that
award and return, the revamped arena, five authored stages plus three generated
ones, the elephant, the pit floor and the blocky sky.

**Not built yet, and out of scope until the milestone advances:** powers, the
free-reward chest, audio, the Robux/Bux purchase path, leaderboards, the
buy-Speed buttons and the "2x Wins" gamepass.
