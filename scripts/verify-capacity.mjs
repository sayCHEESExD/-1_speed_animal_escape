/**
 * Room capacity, checked against a RUNNING server.
 *
 * The other two suites are static: they read the course data and exercise the
 * services in-process. This one cannot be, because what it is checking is the
 * matchmaker - the thing that decides which room a connecting player lands in,
 * and which only exists once a server is actually listening.
 *
 * It connects more clients than one room may hold and asserts two things:
 *
 *   - no room ever holds more than `MAX_PLAYERS_PER_ROOM`
 *   - the overflow is ROUTED to another room rather than refused
 *
 * Both matter. A limit that turned the sixteenth player away would be a limit
 * that closes the game to them; a limit that let them in anyway would not be a
 * limit at all.
 *
 * Usage: start the server, then `npm run verify:capacity`.
 *        ENDPOINT=wss://your-host npm run verify:capacity  to check a deployment.
 */
import { Client } from 'colyseus.js';
import { MAX_PLAYERS_PER_ROOM, ROOM_NAME } from '../shared/dist/index.js';

const ENDPOINT = process.env.ENDPOINT ?? 'ws://localhost:2568';
/** Enough over the line to prove routing, few enough to stay quick. */
const TOTAL = MAX_PLAYERS_PER_ROOM + 3;

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);

console.log(`room capacity (${ENDPOINT})`);

const rooms = new Map();
const joined = [];
let refused = 0;

for (let i = 0; i < TOTAL; i += 1) {
  const client = new Client(ENDPOINT);
  try {
    // The same call the game client makes. Testing a different join path would
    // prove something about a path no player ever takes.
    const room = await client.joinOrCreate(ROOM_NAME, { playerId: `capacity-probe-${i}` });
    joined.push(room);
    rooms.set(room.roomId, (rooms.get(room.roomId) ?? 0) + 1);
  } catch (error) {
    refused += 1;
    console.log(`        client ${i} refused: ${error?.message ?? error}`);
  }
}

const counts = [...rooms.values()];
const biggest = counts.length > 0 ? Math.max(...counts) : 0;

if (joined.length !== TOTAL) {
  fail(`${refused} of ${TOTAL} clients could not join at all`);
} else {
  pass(`all ${TOTAL} clients were placed`);
}

if (biggest > MAX_PLAYERS_PER_ROOM) {
  fail(`a room held ${biggest}, over the limit of ${MAX_PLAYERS_PER_ROOM}`);
} else {
  pass(`no room exceeded ${MAX_PLAYERS_PER_ROOM} (fullest held ${biggest})`);
}

if (rooms.size > 1) {
  pass(`overflow routed across ${rooms.size} rooms`);
} else {
  fail(`all ${joined.length} clients landed in one room; nothing was routed`);
}

for (const [id, count] of rooms) console.log(`        room ${id}: ${count}`);

for (const room of joined) {
  try {
    await room.leave(true);
  } catch {
    /* the room may already be gone; nothing to clean up */
  }
}

console.log('');
console.log(failures === 0 ? 'capacity OK' : `${failures} problem(s) found`);
process.exit(failures === 0 ? 0 : 1);
