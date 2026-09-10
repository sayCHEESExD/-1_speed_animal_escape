# +1 Animal Obby Escape

A browser multiplayer obby where you ride a blocky animal through a linear
obstacle course. Running and jumping farms **Speed**, Speed raises your
**Level**, Level makes you permanently faster, and finishing a stage banks
**Wins** you spend on a better animal or a trail. Hit the level cap and
**Rebirth** for a permanent multiplier. Twenty stages, and dying on any of them
puts you straight back at the arena.

Three.js + Colyseus + TypeScript. No game engine, almost no image assets, and
a browser build of about **1.2 MB** against a 12 MB budget.

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
| **R** / **T**     | Rebirth / Trails                |
| **M**             | Mute                            |
| **Esc**           | Free the cursor; click to play on |
| Touch stick/button| The same, on a phone or tablet  |

---

## The loop

1. **Ride.** Distance travelled and every jump earn Speed. The server measures
   it from the movement it simulates; the client cannot ask for any.
2. **Train.** Three identical treadmills stand in a row along the right of the
   arena, consoles turned back toward the spawn point, and farm Speed at x3
   while you stand on them. Walk on to start, walk off to stop - no button, and
   it keeps paying while you are away from the keyboard.
3. **Level up.** Speed drives the level curve, and level drives actual movement
   speed. Getting faster is what opens the wider gaps in later stages.
4. **Finish a stage.** Cross the gold pad at the right-hand side of a stage
   end. It banks that stage's Wins and returns you to the arena.
5. **Spend.** Ride onto a stand on the left of the arena for a better animal,
   or open **Trails** for a movement-speed multiplier.
6. **Rebirth.** At level 25 (then 50, then every 25) trade your level curve for
   a permanent Speed multiplier. Wins, animals and trails are kept.

**There are no checkpoints.** Dying anywhere - stage 1 or stage 20 - returns
you to the starting arena, which is where the animals, the treadmills and the
leaderboards are. Coming back is how you spend what you just earned.

Ten animals ship: deer (free), llama, donkey, lion, cow, panda, unicorn, horse,
zebra and dragon. Ten trails, and a rebirth ladder with no end.

### Stages

| # | Stage            | Mechanic                                           | Level |    Wins |
|---|------------------|----------------------------------------------------|------:|--------:|
| 1 | Meadow Hops      | Close platforms; run them at speed                 |     1 |       1 |
| 2 | Rolling Corridor | Elevated gantry, balls rolling at you              |     4 |       3 |
| 3 | Sinking Sands    | Platforms that shake, sink and return              |     8 |       8 |
| 4 | Hidden Grove     | Real planks among tree canopies that aren't        |    13 |      20 |
| 5 | Ancient Ruins    | A wide arena of ruins, and an elephant that chases |    19 |      50 |
| 6 | Moving Logs      | Islands swept by counter-turning logs              |    26 |     120 |
| 7 | Ice Run          | Low grip; a gallop keeps its momentum through turns|    33 |     200 |
| 8 | Falling Rocks    | Boulders drop on shadowed ground                   |    41 |     400 |
| 9 | Lava Steppers    | Stones over lava, half of which sink               |    49 |     700 |
|10 | Spinning Arena   | Long arms at mismatched radii and rates            |    58 |   1,200 |
|11 | Wind Tunnel      | A high walkway in a reversing crosswind            |    66 |   2,000 |
|12 | Crusher Hall     | Walls of crushers with one lane open, and it moves |    74 |   3,200 |
|13 | Vanishing Bridge | Three lanes phased so the route is a moving diagonal| 82 |   5,000 |
|14 | Giant Hammers    | Slow arms longer than the corridor is wide         |    89 |   8,000 |
|15 | Forest Run       | A safe way round or a fast plank route with gaps   |    96 |  12,000 |
|16 | Waterfall Cliffs | Ledges at real heights over open water             |   103 |  18,000 |
|17 | Tornado Arena    | Wide, slow, predictable orbits across open ground  |   108 |  27,000 |
|18 | Ancient Temple   | Arches, crushers, and bays whose floor drops away  |   112 |  40,000 |
|19 | Chaos Run        | Every mechanic in sequence, at pace                |   116 |  60,000 |
|20 | Final Arena      | A lava crossing, then everything at once           |   120 |  90,000 |

The **Level** column is the recommended level printed on each stage gate. It is
one row per stage in `STAGE_TUNING`, and the Speed figure beside it on the gate
is derived from the same curve the player actually levels on - so a gate can
never advertise a total that does not correspond to the level next to it.

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
- **progression** — the reward, rebirth, trail and treadmill rules, including
  the paths a cheating client would want: claiming a stage from across the map,
  rebirthing under-level, buying a trail with no Wins, equipping one you do not
  own, claiming an animal from the wrong place, and farming a belt you are not
  standing on. All are refused.


---

## Deploying

Two pieces, two hosts, and that split is deliberate: **Netlify serves static
files and cannot run a WebSocket server**, so the client and the game server do
not live in the same place.

```
Netlify  ──  client/dist          the WebGL build (static)
   │
   │  wss://
   ▼
Node host ──  @animal/server      Colyseus, one long-lived process
```

### 1. The game server

Any host that runs a Node process and keeps a WebSocket open - Fly.io, Railway,
Render, a VPS. It needs no database.

```bash
npm ci
npm run build:server     # builds shared, then the server
npm start --workspace @animal/server
```

| Variable          | Needed | Meaning                                              |
| ----------------- | ------ | ---------------------------------------------------- |
| `PORT`            | no     | Port to bind. Managed hosts set this themselves; defaults to 2568. |
| `HOST`            | no     | Interface to bind. Defaults to `0.0.0.0`, which is what a container needs. |
| `ANIMAL_DATA_DIR` | no     | Where profiles are written. Defaults to `data/` beside the server. |

`GET /health` returns `{"ok":true,...}` for the host's health check.

> **Profiles are a JSON file on disk.** On a host with an ephemeral filesystem
> - which is most of them - every redeploy wipes every player's progression.
> Point `ANIMAL_DATA_DIR` at a mounted volume, or accept that the ladder resets
> on each deploy.

### 2. The client

Netlify builds from the REPOSITORY ROOT - this is an npm workspaces monorepo
and the client imports `@animal/shared`, so building from inside `client/`
would install only that workspace. `netlify.toml` already sets this up.

Set ONE environment variable in the Netlify site (Site configuration →
Environment variables), then trigger a deploy:

```
VITE_SERVER_URL = wss://your-server-host
```

That is the only server configuration the client has. It is baked in at BUILD
time, so **changing it requires a rebuild** - Vite has no later step in which
to inject it. An `https://` URL is accepted and converted; a build with the
variable unset boots, plays offline, and says exactly that on screen rather
than failing with a socket error.

Because the page is served over https, the endpoint must be `wss://` - a
browser will not open an insecure socket from a secure page.

### Bloxity Hosting (GitHub Actions)

`.github/workflows/deploy.yml` deploys both halves on a push:

| Branch          | Channel |
| --------------- | ------- |
| `dev`           | `dev`   |
| `main`/`master` | `prod`  |

The server is built from the repo-root `Dockerfile` - the build context has to
be the root, because the server imports `@animal/shared` as a workspace
dependency - pushed to `ghcr.io/saycheesexd/animal-obby-escape-server` under an
immutable `<channel>-<sha>` tag, and rolled by that tag rather than by the
moving `<channel>` one, so a re-run cannot ship an image a later push replaced.
The client is built with `VITE_BLOXITY_GAME_ID`, gated on `typecheck`, `verify`
and the 12 MB budget, zipped, and uploaded.

Two different hosts, which is not a typo:

| Call            | Route                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| Roll the server | `POST https://legion.bloxity.io/v1/apps/{gameId}/deploy`                  |
| Publish the client | `POST https://api.bloxity.io/v1/hosting/games/{gameId}/frontend?channel=&version=` |

Both come from <https://hosting.bloxity.io/docs>. `seatCap` must equal
`MAX_PLAYERS_PER_ROOM` (15): Legion fills a pod to `seatCap` and then spawns
the next one, so a larger figure would route a sixteenth player to a room that
refuses them. `maxReplicas` 5 puts total capacity at 75.

The addresses the game answers on:

| Channel | Backend                                          | Frontend                                         |
| ------- | ------------------------------------------------ | ------------------------------------------------ |
| `dev`   | `https://animal-obby-escape.dev.host.bloxity.io` | `https://animal-obby-escape.dev.play.bloxity.io` |
| `prod`  | `https://animal-obby-escape.host.bloxity.io`     | `https://animal-obby-escape.play.bloxity.io`     |

Set these in the repository (Settings -> Secrets and variables -> Actions):

| Name                  | Kind     | Purpose                                     |
| --------------------- | -------- | ------------------------------------------- |
| `LEGION_DEPLOY_TOKEN` | secret   | Authenticates both calls. **Required.**     |
| `SERVER_URL_DEV`      | variable | Optional. Overrides the dev backend URL.    |
| `SERVER_URL_PROD`     | variable | Optional. Overrides the prod backend URL.   |
| `LEGION_API_BASE`     | variable | Optional. Overrides `legion.bloxity.io`.    |
| `HOSTING_API_BASE`    | variable | Optional. Overrides `api.bloxity.io`.       |

Only the token has to be set - the two backend URLs default to this game's own
Bloxity hosts. One thing is NOT in the repository: after the first run, make the
GHCR package public (repo -> Packages -> Package settings -> Change visibility),
or Legion cannot pull the image.

> [!WARNING]
> Legion pods are ephemeral and the game scales to zero when idle, so the
> `ANIMAL_DATA_DIR` JSON file does NOT survive there - `VOLUME` in a Dockerfile
> asks Kubernetes for nothing. Legion injects `MONGODB_URI` for exactly this,
> and until a `PersistenceAdapter` reads it, progression on Bloxity resets
> whenever the last player leaves. See "Persistence" above.

### 3. Check it

```bash
ENDPOINT=wss://your-server-host npm run verify:capacity
```

Connects 18 clients and asserts that no room exceeds 15 and that the overflow
is routed to a second room.

---

## Bloxity

The game integrates the [Bloxity](https://bloxity.io) portal SDK: one account
across games, friends and invites, avatar cosmetics, settings that follow you,
and the Bux currency. It runs the same code embedded in an iframe on bloxity.io
and hosted standalone - the SDK detects which and routes accordingly.

`client/src/bloxity/Bloxity.ts` is the only file that touches the SDK. If the
script is blocked or offline the game boots and plays exactly as before and the
account chip reads "Playing offline"; nothing else changes.

**Bux never grant anything on the client.** The client asks for a SKU - never a
price - and the purchase is fulfilled server to server: Bloxity posts to
`/bloxity/bux`, the server queues the grant against the Bloxity account, and the
room hands it over through the same `wallet.add` every stage reward uses. The
webhook answers 2xx for anything it has safely recorded, including a SKU this
build does not know, because Bloxity refunds what fails and a catalogue that
moved ahead of a deploy must not cost a player their purchase.

| Variable                  | Needed | Meaning                                        |
| ------------------------- | ------ | ---------------------------------------------- |
| `BLOXITY_WEBHOOK_SECRET`  | prod   | Verifies `x-legion-webhook-secret` on the webhook. Without it the endpoint accepts anything. |

---

## Notes for the curious

**Nothing in the world is an image.** The studded green ground, the salmon
brick walls, the plank bridges, the gold finish pads, the treadmill belts,
every word of world text and the cloudy sky are all drawn on a canvas at
runtime. The only pictures in the build are the supplied rider model and four
HUD icons.

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

**Every Speed gain floats up the screen.** The "+N" popups are fed by an
accumulator over the *replicated* total rather than by raw state patches, so a
slow trickle reads as "+2" and a treadmill sprint reads as "+200" without
either being a special case. Fourteen nodes are pooled once and reused for
ever; a spawn that finds none free retires the oldest rather than growing the
document. They are placed at random inside a band that misses the Wins counter,
the left rail and the level bar at any window shape, and re-rolled if they land
on one still on screen.

**World text is sized to FIT, not to a font size.** Every sign in the world -
the stage gates, TRAINING, the treadmill labels, the animal prices - is drawn
on a canvas, and `CanvasSign` measures the string and shrinks until the glyphs
*and their outline* sit inside the panel. Sizing from the height band alone is
what clipped "60.0K Wins Required" off both ends of its own texture, and
`strokeText` paints half a line width outside the glyphs, so the outline needs
budgeting too. The panels are also authored wide enough that the shrink rarely
has to do anything: the fix is never "make the text small".

**The corridor is 64 units wide, and can be wider.** `WIDE_AREAS` names the
spans that open out - the lobby and the ruins arena - and the floor, the
boundary clamp, the walls and the treeline all read the same list, so a place
the renderer draws wide and the collision keeps narrow is structurally
impossible. Obstacle offsets are written as fractions of the corridor through
`lane()`, so widening the course moved every platform with it.

**The scoreboards are part of the room.** Three boards stand against the back
wall of the arena, ranking Wins, Speed and Rebirths. Every figure is the
server's - stored profiles merged with live player state, live winning wherever
both exist - and ranked on the server, on a slow timer, because nobody reads a
leaderboard twenty times a second. Players have no names, so a handle is
derived from their id deterministically; the id itself never leaves the server.

**Every sound effect is synthesised**, with oscillators and envelopes: one
context, a per-sound cooldown and a hard voice ceiling on the one-shots, and
only the local player making any noise at all. A pack of wavs would have been
the easiest way to spend the whole 12 MB budget.

The background music is the one supplied audio file, streamed from
`assets/audio/` through the same music bus - so the portal's music slider, the
master volume and mute all work on it without knowing it is a file rather than
a tune the game made up.

**Escape gives you your cursor, and lets you keep it.** Pointer lock hides the
cursor and every menu opens from a rail tile, so a released lock used to be
treated as an accident and reversed - which left desktop players captured, with
buttons they could neither see nor click. It is now a state the game has: the
camera stops, the HUD is clickable, and one click on the world resumes play.

**The sky is real geometry.** A gradient dome plus ninety clusters of boxes,
merged into two meshes. The world also has a real bottom — a pit floor drawn
under everything, with the death plane well above it, so falling reads as
dropping into a pit rather than into an unfinished map.
