# +1 Animal Obby Escape

A browser multiplayer obby where you ride a blocky animal through a linear
obstacle course. Running and jumping farms **Speed**, Speed raises your
**Level**, Level makes you permanently faster, and finishing a stage banks
**Wins** you spend on a better animal or a trail. Hit the level cap and
**Reboot** for a permanent multiplier.

Three.js + Colyseus + TypeScript. No game engine, no image assets, and a
browser build of about **0.9 MB** against a 12 MB budget.

---

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:5174>.

`npm run dev` starts both halves: the authoritative Colyseus server on **2568**
and the Vite client on **5174**.

> These are deliberately not the default ports. The previous game in this
> series (`+1 Backflip Obby Escape`) uses 2567 and 5173, so both projects can
> run side by side on one machine.

### Controls

| Input             | Action                          |
| ----------------- | ------------------------------- |
| **W A S D**       | Move, relative to the camera    |
| **Shift**         | Gallop                          |
| **Space**         | Jump                            |
| **Mouse**         | Aim the camera                  |
| Touch stick/button| The same, on a phone or tablet  |

---

## The loop

1. **Ride.** Distance travelled and every jump earn Speed. The server measures
   it from the movement it simulates; the client cannot ask for any.
2. **Train.** Three identical treadmills on the right of the arena farm Speed
   at x3 while you stand on them. Walk on to start, walk off to stop - no
   button, and it keeps paying while you are away from the keyboard.
3. **Level up.** Speed drives the level curve, and level drives actual movement
   speed. Getting faster is what opens the wider gaps in later stages.
4. **Finish a stage.** Cross the gold pad at the right-hand side of a stage
   end. It banks that stage's Wins and returns you to the arena.
5. **Spend.** Ride onto a stand on the left of the arena for a better animal,
   or open **Trails** for a movement-speed multiplier.
6. **Reboot.** At level 25 (then 50, then every 25) trade your level curve for
   a permanent Speed multiplier. Wins, animals and trails are kept.

Ten animals ship: deer (free), llama, donkey, lion, cow, panda, unicorn, horse,
zebra and dragon. Ten trails, and a reboot ladder with no end.

### Stages

| # | Stage            | Mechanic                                        | Wins |
|---|------------------|-------------------------------------------------|-----:|
| 1 | Meadow Hops      | Close platforms; run them at speed              |    1 |
| 2 | Rolling Corridor | Elevated gantry, balls rolling at you           |    3 |
| 3 | Sinking Sands    | Platforms that shake, sink and return           |    8 |
| 4 | Hidden Grove     | Real planks among tree canopies that aren't     |   20 |
| 5 | Ancient Ruins    | Blocky ruins, and an elephant that chases       |   50 |
| 6 | Cliff Run        | Endurance                                       |  120 |
| 7 | Pillar Maze      | Endurance                                       |  200 |
| 8 | Final Gallop     | Endurance                                       |  400 |

---

## Layout

```
assets/player/       the supplied rider FBX and its texture (never modified)
shared/              everything the client and server must agree on exactly
  config/animals.ts    the animal roster - shape, palette, price, tuning
  config/course.ts     the generated obby: every solid and every hazard
  config/movement.ts   the ONE movement-speed formula
  config/speed.ts      Speed farming and the level curve
  sim/PlayerSim.ts     the authoritative physics step, run by BOTH sides
  sim/WorldCollision.ts the gameplay shape of the course
server/              Colyseus room and the services that own every reward
client/              Three.js renderer, prediction, animation and the HUD
scripts/             static verification of the course and the server rules
```

The rule that holds it together: **the server owns every number that matters**.
The client predicts movement by running the identical `stepPlayer` from
`shared/`, keeps its unacknowledged inputs, and replays them whenever the
server corrects it. It never asserts a position, and it never grants itself a
Win, a level or an animal.

---

## Verifying it

```bash
npm run typecheck   # shared, server and client
npm run verify      # course layout + server reward/purchase authority
npm run build       # production build of all three workspaces
```

`npm run verify` is two static suites:

- **course** — no overlapping stages, no unmarked holes, every gap clearable at
  the level it appears at (computed from the same movement formula the physics
  uses), win pads on the player's right and reachable, the reward table intact,
  hazards inside the corridor, every sinking row keeping a fixed platform, and
  all three treadmills detectable.
- **progression** — the reward, reboot, trail and treadmill rules, including
  the paths a cheating client would want: claiming a stage from across the map,
  rebooting under-level, buying a trail with no Wins, equipping one you do not
  own, claiming an animal from the wrong place, and farming a belt you are not
  standing on. All are refused.

---

## Notes for the curious

**There is not one image file in the build.** The studded green ground, the
salmon brick walls, the plank bridges, the gold finish pads, the chevron strips
and the cloudy sky are all drawn on a canvas at runtime.

**The animals are built from boxes at load time.** One generic quadruped
builder consumes each species' proportions, palette and feature list, merges
the result into one vertex-coloured geometry per moving part, and caches it. A
llama and a panda are the same twelve boxes at different sizes. Adding an
eleventh animal is one entry in `shared/src/config/animals.ts` — it gets a
lobby stand, a price label and a working mount with no other change.

**There is no speed cap.** Late game runs at hundreds of units per second, and
a single 1/60s step at that speed would pass straight through a plank. Instead
the physics step subdivides itself until no substep travels more than a fixed
distance, so collision is as reliable at 400 u/s as at 20.

**The rider hangs off the animal's body node**, not off a per-frame transform
copy. It inherits the gait's bob, pitch and roll for free and cannot slide,
clip or float however the animal moves. The rider's walk cycle never plays —
the animal does all the walking.

**Almost every moving thing is a pure function of the clock.** The rolling
balls, the sweepers and the sinking platforms take a time and return a
position, so the server evaluates them to decide a death and the client
evaluates the identical function to draw them — nothing about them is on the
wire. The elephant is the deliberate exception: it chases, so it depends on
where the players are, and the server simulates and replicates it.

**The sky is real geometry.** A gradient dome plus ninety clusters of boxes,
merged into two meshes. The world also has a real bottom — a pit floor drawn
under everything, with the death plane well above it, so falling reads as
dropping into a pit rather than into an unfinished map.
