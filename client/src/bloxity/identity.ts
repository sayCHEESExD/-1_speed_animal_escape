import { sanitizeDisplayName, sanitizePfpUrl, type SetIdentityMessage } from '@animal/shared';
import type { LegionUser } from './legionTypes.js';

/**
 * The public identity to replicate for whoever the portal says is here.
 *
 * A GUEST counts as signed out for the NAME. The SDK gives a guest a random
 * local nickname, which is not an identity - it changes when the browser is
 * cleared - so the room's own derived handle is the steadier label. The
 * PORTRAIT is kept for a guest, though: the SDK renders it from the avatar the
 * guest is actually wearing, so it is still a true picture of that rider.
 *
 * The display name is preferred, and the username stands in when the display
 * name sanitises to nothing (an all-emoji name, say). The account id is never
 * read here, and neither is anything else on the user object.
 */
export const identityFromLegion = (user: LegionUser | null): SetIdentityMessage => {
  if (!user) return { name: '', pfp: '' };
  const pfp = sanitizePfpUrl(user.pfp);
  if (user.isGuest) return { name: '', pfp };
  const name = sanitizeDisplayName(user.displayName) || sanitizeDisplayName(user.username);
  return { name, pfp };
};
