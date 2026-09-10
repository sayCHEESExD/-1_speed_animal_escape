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

- Final browser build must stay **under 12 MB**. It is currently ~1.2 MB.
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

## Rebirth, trails and training

- The prestige ladder is called **REBIRTH**, everywhere: `REBIRTH_TIERS`,
  `RebirthService`, `RebirthPanel`, the rail tile and every string the player
  reads. It was briefly called Reboot; the replicated field was `rebirths`
  throughout even then, which is the tell that the other name was the odd one.
  Do not reintroduce it.
- `REBIRTH_TIERS` is the authored head (level 25 -> x2, level 50 -> x3) and
  `EXTENSION` continues the same pattern for ever, so a third rebirth is one
  row in a table.
- The level CAP is not a constant: it is whatever the next rebirth requires, so
  reaching the cap and unlocking a rebirth are the same moment. A cap is a
  gate, never a dead end.
- A rebirth resets the level curve - which means clearing `totalSpeed`, because
  level FOLLOWS from it - and deliberately keeps Wins, animals and trails. It
  also returns the player to the arena: their speed is no longer what carried
  them to wherever they were standing.
- **Trails** multiply ACTUAL MOVEMENT SPEED, through the shared formula's
  `extraMultiplier` and never a calculation of their own. The equipped animal
  owns Speed-per-stride; the two axes never cross.
- Trail multipliers are deliberately gentle. Movement speed is already
  multiplied by level and by rebirth, and a steep cosmetic ladder on top puts a
  reborn player through the obby faster than its platforms can be read.
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
- **THERE ARE NO CHECKPOINTS, and there must not be any.** Every placement -
  a death, a stage banked, a rebirth, a fresh join - puts the player at
  `SPAWN_POSITION` and nowhere else. `CourseRoom.placeAt` takes no position for
  exactly that reason: a parameter is a place a second destination can be
  passed, and the checkpoint system that used to live there is what made dying
  on stage 12 leave the player on stage 12.
- The loop is deliberate, not a punishment: a run ends at the arena, where the
  animals, the treadmills and the boards are. Coming back is how a player
  spends what they just earned.
- **Wins** come from crossing a stage's win pad - a small rectangle at the
  player's RIGHT at the stage end. Crossing it awards that stage's Wins and
  RETURNS the player to the arena, which is what the pad's "Return" label
  promises and also what makes a second payment impossible: the pad is hundreds
  of units behind them before another request could arrive. The cooldown is
  spam protection only, which is why it is short and checked last.
- Stage rewards are 1, 3, 8, 20, 50, 120, 200, 400 and then keep accelerating
  to 90,000 at stage 20. They live in ONE table, `STAGE_REWARDS`, and anything
  past it continues the same curve. `verify-course` enforces that the list is
  strictly increasing: a later stage worth fewer Wins than an earlier one would
  make the whole ladder something to farm backwards.
- **There are twenty stages, and every one of them is authored.** Name,
  difficulty word and recommended level live in `STAGE_TUNING`, one row per
  stage, so the ladder is tuned by editing a table.
- The recommended SPEED is DERIVED from the recommended level through
  `totalSpeedToReach` - the same curve the player actually levels on - and
  never written beside it. A hand-authored figure is free to drift into
  advertising a total that does not correspond to the level printed next to it,
  and the gate shows both.
- The ladder respects the rebirth cap of 25 levels per rebirth: stage 5 at
  level 19 is inside a first run, stage 10 at 58 wants two rebirths, stage 20
  at 120 wants four. `verify-course` prints that figure, so a stage that
  quietly starts demanding six is visible the moment it is added.

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
- **Not one image file is used for the WORLD.** Every world texture - the
  studded ground, the brick walls, the planks, the gold pads, the treadmill
  belts and the sky - is drawn on a canvas at runtime by `WorldTextures`. Do
  not add an image for something `WorldTextures` could draw.
- **Every static file lives in the repo-level `assets/`**, which Vite publishes
  as the web ROOT (`publicDir` points at it). So `assets/ui/run.png` is served
  at `/ui/run.png` and `assets/audio/background_music.mp3` at
  `/audio/background_music.mp3`. There is no `client/public/` - `publicDir` can
  only be one directory, and this is it. A file put under `client/src/` would
  be hashed into the bundle instead of served.
- The only images in the build are the supplied rider FBX and its texture, and
  the four HUD icons in `assets/ui/` (`trophy`, `rebirth`, `trail`, `run`).
  Those are SUPPLIED ART and are used as they are: never regenerate one
  procedurally, and never set both dimensions in CSS - drive one and leave the
  other automatic so the real aspect ratio survives. `run.png` is 563 x 585.

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
- The later stages add exactly THREE hazard motions, and no new physics:
  `spinner` orbits a centre, `faller` drops onto a spot and rises again, and
  `tornado` is a spinner drawn as a funnel. Every log, arm, hammer, boulder and
  crusher in stages 6-20 is one of those - a bar is several spinners at stepped
  radii sharing one phase, which is why there is still only one hazard shape to
  test against.
- `hazardZRange` and `hazardReachX` are the ONE definition of how far a hazard
  can travel. `sweep` means different things to different kinds - an amplitude,
  an orbit radius, a fall HEIGHT - and code that assumed one meaning bucketed
  crushers as if they hung through the wall.
- A hazard's Y is evaluated, not authored: `touchesHazard` takes the position
  first and tests the height against THAT. Testing against the authored `y`
  would have every faller kill from the top of its hover.
- **`SurfaceRegion` changes how the mount HANDLES**, and it is read inside
  `stepPlayer` itself. Ice lowers `grip` (acceleration AND braking together -
  lowering only braking makes a mount harder to stop rather than harder to
  steer) and the wind tunnel adds a constant `windX`. Both sides run the one
  formula; a client predicting different handling from the server would spend
  the whole stage being pulled back to a position it did not steer to.
- A quicksand pit carries a `surface` - sand, lava or water. They kill
  identically and by the same rule; only the look differs, which is what lets
  three stages share one mechanic without reading as one stage built three
  times.
- A sinking platform laid ON a floor is SCENERY: it drops, the ground under it
  does not, and nothing happens. The temple's trap bays are holes in the floor
  for that reason.
- **The elephant is the one exception, deliberately.** It CHASES, so its
  position depends on where the players are - that is state, not a formula - so
  the server simulates it, replicates x/z/yaw/charging, and decides the trample
  from its own position. There is no elephant message.
- Quicksand is a per-region death plane a couple of units under the platforms,
  not the global one. Being swallowed by sand reads far better than falling
  twenty units first.
- The corridor is **64 units wide** (`COURSE.halfWidth` 32), and every obstacle
  offset is written as a FRACTION of it through `lane()`. That is the whole
  reason the course could be doubled in width without re-authoring a single
  pattern: a literal `x: 7` would have left every platform huddled around the
  centreline of a corridor twice as wide.
- Places that open out are declared in **`WIDE_AREAS`**, and there is exactly
  one list. The floor, `clampToBounds`, `corridorHalfWidthAt`, the wall run and
  the treeline all read it, so a span the renderer draws wide and the collision
  keeps narrow cannot exist. Adding a wide area is an entry, not a change in
  five places.
- `buildWalls` walks BOUNDARY MARKS derived from that list rather than a fixed
  span, emitting a shoulder wall at each width change. A wall run that assumed
  a constant width left the ruins arena open at the sides.
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
- **Sign text is sized to FIT.** `CanvasSign` measures the string and shrinks
  until the glyphs AND their outline sit inside the panel. Sizing a line from
  its height band alone - with nothing ever measured against the panel's WIDTH
  - is what ran "60.0K Wins Required", "TRAINING" and "+3 Speed" off the ends
  of their own textures; `strokeText` also paints half a line width outside the
  glyphs, so the outline has to be budgeted for too.
- The panels are authored WIDE ENOUGH that the shrink rarely has to act. The
  fix for clipped text is never "make the text smaller" - that is the symptom
  treated as the cure.

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

The HUD is: **Wins** upper centre, **Rebirth**, **Trails** and **Sound** down
the left rail, and **Speed** and **Level** along the bottom. The Speed-gain
popups float over the middle. Nothing else yet.

- `hudStyles.ts` owns the one stylesheet and the inline SVG icons, so the rail,
  the win counter and both panels cannot drift apart visually.
- Everything shown is replicated server state. The HUD never awards, predicts or
  derives progress; a rail tile is "ready" when the server would accept the
  request behind it, read from replicated figures rather than decided locally.
- `Panel` counts open modals and the input layer polls that count to suppress
  movement. A COUNT rather than a boolean, so two panels closing out of order
  cannot leave the game permanently suppressed.
- **Speed-gain popups** (`SpeedPopups`) are driven by an ACCUMULATOR over the
  replicated total, never by raw patches. Speed climbs continuously while
  riding and the server sends twenty patches a second, so one popup per patch
  would be an unreadable stream and one node per patch would put hundreds of
  elements in the document inside a minute. The gain is banked and released on
  a fixed cadence, and only an INCREASE counts - the first reading merely takes
  a baseline, or a returning player's lifetime total would fire on join.
- The popup pool is a HARD CEILING, allocated once. A spawn that finds nothing
  free retires the oldest rather than growing.
- Popups sit BELOW the HUD in the stacking order and are placed at random
  inside a band that already misses the Wins counter, the rail and the level
  bar - so even a mis-tuned band cannot cover a figure the player must read.
  A placement that lands on one still on screen is re-rolled.
- `run.png` is used at its real aspect ratio: the CSS drives the icon's HEIGHT
  and leaves the width automatic. Setting both is how an icon gets squashed.
- **Every menu must be reachable with a mouse.** Pointer lock hides the cursor,
  every panel opens from a rail tile, and a button you can neither see nor
  click is not a menu - so `MouseLook.cursorFree` is a real state: Escape hands
  the cursor back and KEEPS it back, and one click on the world resumes play.
  Losing the lock used to be treated as an accident and reversed on the next
  keystroke, which trapped desktop players outside their own shops.
- `setSuppressed(false)` is called EVERY FRAME that no panel is open, so
  anything unconditional in it runs sixty times a second. Taking the lock back
  there is what put the cursor away one frame after Escape handed it over; it
  now acts only on a real close.
- There are keys as well as tiles - R for Rebirth, T for Trails, M for mute,
  Escape to close and free the cursor - and an on-screen hint that says so,
  driven by the same class `MouseLook` sets so it cannot contradict the input
  state.

## The scoreboard

Three world-space boards on the BACK WALL of the arena, which is what that wall
was deliberately left empty for. It stays the only thing there.

- World-space, not HUD, and that is the whole character of it: a thing you walk
  up to and read, and that another player can be seen reading. A panel pinned
  to the corner of the screen would be a different feature wearing the same
  numbers.
- Every figure is the SERVER's. `LeaderboardService` ranks stored profiles
  merged with live `PlayerState`, live winning wherever both exist because
  Speed accrues continuously and is only written out every few seconds. No
  client is asked for its totals and none could usefully claim any.
- Rebuilt on a slow timer, not per tick. Sorting every profile twenty times a
  second to feed a sign on a wall would be the most expensive thing in the
  room, and nobody reads a leaderboard that fast.
- The replicated arrays are FIXED-LENGTH and written in place. Clearing and
  refilling nine rows every rebuild would send the whole board to every client
  whether or not a place had moved.
- Players have no names: a handle is DERIVED from the player's id by
  `handleFor`, deterministically, so the same player is the same name on every
  board with nothing stored and nothing for a client to assert. The id itself
  never leaves the server.
- Panel text is fitted the same way world signs are. A long handle shrinks; the
  figure beside it never gets pushed off the board.

## Audio

In `client/src/audio/`. Every SOUND EFFECT is synthesised - oscillators cost
bytes measured in hundreds, and a pack of wavs is the easiest way to spend the
12 MB budget.

The BACKGROUND MUSIC is the one deliberate exception: a supplied track at
`assets/audio/background_music.mp3`, because a tune is the one thing an
oscillator cannot fake convincingly. It is STREAMED through an `<audio>`
element rather than decoded into a buffer - `decodeAudioData` would hold a
three-minute stereo file as tens of megabytes of uncompressed samples for
something only ever played end to end - and routed through `musicBus`, which is
what keeps the portal's `music_volume`, the master volume and mute all working
on it untouched. Muting PAUSES the element rather than merely silencing it: a
muted stream still decodes, and on a phone that is battery spent on nothing.
Check `npm run size:client` after changing the track.

- **ONE context, ONE music voice.** The loop is scheduled ahead into Web Audio's
  own clock on a lookahead timer, and `resume()` is idempotent - there is no
  path that can start a second copy of the tune, which makes doubled music
  impossible rather than merely unlikely.
- **One-shots are bounded twice**: a per-sound cooldown stops an effect
  retriggering every frame, and a hard voice ceiling stops the mix ever holding
  more than a dozen. A refused sound is dropped, never queued.
- **Only the LOCAL player makes noise.** Remote riders are drawn and animated
  and silent. Eight of them galloping past would bury the one mount whose
  hoofbeats tell the player anything.
- Hoofbeat cadence is CLAMPED, exactly as the gait animation's is. A level-80
  mount covers hundreds of units a second and a beat per stride at that speed
  is a buzz, not a gallop.
- Nothing starts before a real user gesture. Browsers refuse to run an
  AudioContext without one, so every gesture calls `resume()`.
- `PlayerAudio` decides WHEN a sound is wanted; `AudioManager` knows HOW to
  make one. No renderer or simulation code has an opinion about audio.
- Death, level and rebirth sounds fire on the EDGE, never the level: `isDying`
  stays true for a whole fall-over and a level is re-sent on every patch.

## Deployment

- **Two hosts, and the split is not negotiable.** Netlify serves static files
  and cannot run a WebSocket server, so the client is deployed there and the
  Colyseus server runs as a long-lived Node process somewhere else.
- **`VITE_SERVER_URL` is the ONLY client-side server configuration**, and it is
  baked in at build time, so changing it means rebuilding. An `http(s)://` URL
  is converted to `ws(s)://` rather than rejected, because that is the form
  every host's dashboard hands out.
- The URL fallback guesses ONLY on localhost. A deployed origin with nothing
  configured gets an empty endpoint and says so - `wss://the-site/:2568` is an
  address that can never answer, and pointing a client at one turns a
  five-second configuration mistake into a network mystery.
- `NetworkClient` builds its Colyseus `Client` on CONNECT, not in its
  constructor. Colyseus parses the endpoint eagerly, so building it early made
  an unconfigured build die with "Invalid URL" while the `Game` was still being
  assembled, long before anything could report the real cause.
- **A room holds `MAX_PLAYERS_PER_ROOM` (15).** The matchmaker locks a full
  room and `joinOrCreate` opens another, so the sixteenth player is ROUTED
  rather than refused. `onAuth` re-checks capacity at the door, because
  `maxClients` is enforced at seat RESERVATION and a late-consumed reservation
  or a direct `joinById` does not go through it.
- Profiles are a JSON file. On an ephemeral filesystem a redeploy wipes every
  player's progression unless `ANIMAL_DATA_DIR` points at a mounted volume.

## Bloxity

The cross-game portal: login, avatars, friends, synced settings and the Bux
currency. It exposes itself as `window.Legion.SDK` and is loaded from a CDN
script in `index.html`, BEFORE the module bundle.

- **`client/src/bloxity/Bloxity.ts` is the only file in the game that touches
  `window.Legion`.** The renderer, the audio and the input layer are handed
  plain values through `BloxityHost` and never learn a portal exists - which is
  what makes the integration removable and what keeps the game working when the
  script is blocked.
- **Every call is guarded.** The SDK is a third-party script: it can be
  offline, blocked, or an older build without a namespace. A missing SDK
  degrades to "no portal", never to a broken game. `BloxityPanel` says
  "Playing offline" rather than offering a login that cannot work.
- **ONE `onUserChanged`**, owned by `Bloxity`, fanned out to everything else
  through `Bloxity.onUserChanged`. It fires immediately with the current state,
  exactly as the SDK's own does, so a subscriber cannot tell the difference.
- **The user object is never cached.** `getUser()` is asked each time, so a
  login in another tab cannot leave a stale name on screen.
- Registering a settings listener is what makes the control APPEAR in the
  portal menu, so `SETTING_KEYS` is a promise: every key there is wired to
  something real, and the two that this game has nothing to apply
  (`enable_chat`, `background_transparency`) are declared because the portal
  draws those itself.
- **Bux are server-authoritative, like every other reward.** The client passes
  a SKU and NEVER a price - the price lives in the portal's catalogue, keyed by
  the game slug. Nothing is granted locally: Bloxity calls the webhook, the
  room credits the profile through `wallet.add`, and the client sees it arrive
  as replicated state.
- The webhook is `POST /bloxity/bux`, verified against
  `BLOXITY_WEBHOOK_SECRET` when one is set. **Answering 2xx is the contract** -
  Bloxity refunds anything that fails - so an unrecognised SKU still returns
  200 and is logged, because a catalogue that moved ahead of a deploy must not
  cost a player their purchase. Transaction ids are remembered, so a retry pays
  out once.
- Fulfilment QUEUES rather than writes. The webhook arrives on the HTTP thread
  while the player may be live with their Wins in replicated state that the
  next autosave writes over the profile - so `BuxGrants` records, and the room
  applies what is waiting on join and on its tick.
- A purchase is made by the ACCOUNT, not the browser. The client sends its
  Bloxity id as a join option alongside the browser-stored `playerId`; they are
  different identities and the grant is addressed to the account.
- **Cosmetics are applied to the LOCAL rider only** - skin texture, hat, back
  item and proportions. Remote riders keep the shared default material.
- **The body-part slots are deliberately NOT worn.** Head, torso, arms and legs
  are separate GLB meshes that would replace `player.fbx`, which is this
  project's canonical player asset with the rig the whole animation system is
  bound to. Swapping it at runtime is a second player asset by another name.
  The ids are read and logged so the data is visibly arriving.
- Proportions are written as SCALE and POSITION on bones, never rotation:
  `PlayerRig` rebuilds every bone's quaternion from its rest pose every frame,
  so a rotation written there would be gone before it was drawn.

## Verification

Do not claim something works without running it.

- `npm run typecheck` must pass.
- `npm run verify` must pass - it checks the generated course for holes,
  overlapping stages and unjumpable gaps, and exercises the server's reward and
  purchase authority INCLUDING the rejection paths.
- `npm run verify:capacity` needs a RUNNING server, which is why it is not part
  of `verify`. It connects more clients than one room may hold and asserts both
  halves of the limit: no room over 15, and the overflow routed rather than
  turned away.
- Browser behaviour must be checked in a real browser.

When driving the game from the browser console for a test, note that the window
`blur` fired when the pane loses focus correctly clears every held key - a test
harness has to re-assert them each frame.

## World layout

- A large starting arena (116 x 112): the animal line-up down the player's LEFT
  wall, open ground through the middle, the training deck on the RIGHT, and a
  deliberately EMPTY back wall. The back stays clean; it is not a third feature
  area.
- The three treadmills are IDENTICAL and stand in a row along Z on the training
  deck, with their belts running along X and their consoles at the +X end - so
  a runner on one faces back into the arena. Building the belt along Z instead
  is what made the first version read as a row of beds. Each machine is a deck,
  a belt, two raised side rails, a roller cowl at the back, and a console of two
  uprights, a panel, a screen and two handles reaching back toward the runner.
  The belt is DARK with bright travelling chevrons; a belt the same green as the
  floor reads as a hole in the frame.
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
  5. **Ancient Ruins** - a wide ARENA (108 x 250, comparable to the lobby),
     staggered rows of blocky arches for cover, fallen blocks between them, and
     the elephant. The elephant charges and leashes, and a corridor it can plug
     end to end is not a chase, it is a wall. `ELEPHANT`'s territory is DERIVED
     from `RUINS_ARENA` rather than written out, so the two cannot disagree
     about where the beast may go.
- Then fifteen more, each with ONE idea, and each built from the primitives the
  first five established - a floor, a box, an orbiting hazard, a falling
  hazard, a platform that sinks, a pit that kills, ground that handles
  differently:
  6 Moving Logs, 7 Ice Run, 8 Falling Rocks, 9 Lava Steppers,
  10 Spinning Arena, 11 Wind Tunnel, 12 Crusher Hall, 13 Vanishing Bridge,
  14 Giant Hammers, 15 Forest Run, 16 Waterfall Cliffs, 17 Tornado Arena,
  18 Ancient Temple, 19 Chaos Run, 20 Final Arena.
- An orbiting hazard reaches `|centre| + radius + ball` on the FAR side of its
  circle, and that total has to fit the arena it turns in. Half the arms in
  stages 10-20 were first authored with their hubs against the wall, which put
  the head through it for half of every turn; `verify-course` checks this
  against the corridor width at the hazard's own Z.
- Lethal moving things are LAVENDER, all of them. A colour is a promise in this
  game, and stage 6 was first built with log-brown arms turning over a log-brown
  floor - invisible until they had already hit.
- The world has a REAL bottom: a pit floor under everything, with the death
  plane well above it. A fall into a pit whose bottom is visible reads as a pit;
  an infinite void reads as an unfinished map. Do not "fix" a void by hiding it
  behind a flat object.
- The sky is a gradient dome plus a field of BLOCKY box clouds - real geometry
  merged into two meshes. Painted cumulus is the fastest way to stop this world
  looking like the game it is copying.

## Current milestone

Milestone 5 is complete: the Bloxity SDK is integrated - login, friends and
invites, portal settings driving the real audio/renderer/input, cosmetics on
the rider, the game lifecycle and room reported to the portal, and Bux
purchases fulfilled server-side through a webhook.

Milestone 4 was: checkpoints are gone and every death returns to the
one spawn, the prestige ladder is called Rebirth throughout, the obby runs to
TWENTY authored stages on a data-driven difficulty ladder, there is a
synthesised audio system, every menu is reachable with a mouse, and three
server-authoritative leaderboards stand on the arena's back wall.

**Not built yet, and out of scope until the milestone advances:** powers, the
free-reward chest, the Robux/Bux purchase path, the buy-Speed buttons and the
"2x Wins" gamepass.
