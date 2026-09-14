/**
 * A player's PUBLIC identity: the name over their head and on the boards, and
 * the portrait beside it on the nameplate.
 *
 * Deliberately two strings and nothing else. The Bloxity account id, the email
 * and the auth token all exist on the client and none of them come near this
 * file: a name and a picture are what other players see in the portal anyway,
 * and they are everything a nameplate or a leaderboard row needs.
 *
 * Like the avatar, this is the client's word rather than the server's - the
 * portal owns who a player is, and the server has no verified way to ask it.
 * That is acceptable for the same reason: a name decides nothing. It chooses
 * text on a sign and it never touches a reward.
 */

/** Longest name a nameplate or a board row is asked to hold, in characters. */
export const DISPLAY_NAME_MAX = 20;

/**
 * Client -> server: "this is who I am in the portal".
 *
 * Sent with the join, and again whenever the portal reports a login, a logout
 * or a new avatar portrait. Both fields are empty for a signed-out player, and
 * the server then falls back to the handle it derives itself.
 */
export interface SetIdentityMessage {
  name: string;
  pfp: string;
}

/**
 * A display name, or the empty string.
 *
 * Letters and digits in any script, plus space, underscore, dot and hyphen -
 * which covers every username the portal hands out while refusing the things a
 * name has no business carrying: control characters, markup, bidirectional
 * overrides and zero-width joiners that let one name impersonate another.
 * Bounded in CHARACTERS, not UTF-16 units, so a name in a non-Latin script is
 * not cut in half through a surrogate pair.
 */
export const sanitizeDisplayName = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, DISPLAY_NAME_MAX).join('').trim();
};

/**
 * Where Bloxity serves portraits from.
 *
 * The SDK builds every `pfp` it hands out on this origin - a rendered avatar
 * headshot for a guest, the account's portrait for a signed-in player - so
 * anything else is not a Bloxity portrait. The trailing slash is load-bearing:
 * without it `https://static.bloxity.io.example.com` would pass the prefix test.
 */
const PFP_ORIGIN = 'https://static.bloxity.io/';

/** Longest portrait URL accepted. The SDK's signed avatar paths run long. */
const PFP_MAX_LENGTH = 512;

/**
 * A Bloxity portrait URL, or the empty string.
 *
 * This string is replicated to every client and put into an image element on
 * each of their screens, so an unrestricted one would let any player make the
 * whole room fetch an address of their choosing. Pinning the origin makes the
 * worst case "someone else's Bloxity portrait", and the character whitelist
 * keeps quotes, spaces and angle brackets out of it altogether.
 */
export const sanitizePfpUrl = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  const url = raw.trim();
  if (url.length === 0 || url.length > PFP_MAX_LENGTH) return '';
  if (!url.startsWith(PFP_ORIGIN)) return '';
  return /^[A-Za-z0-9._~:/?#@!$&*+,;=%-]+$/.test(url) ? url : '';
};
