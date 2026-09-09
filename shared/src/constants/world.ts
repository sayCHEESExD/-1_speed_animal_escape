import type { Vec3 } from '../types/math.js';

/**
 * World-space constants shared by the renderer and the authoritative server.
 *
 * Units are "world units" (1 unit ~= 1 Roblox stud in feel). The supplied
 * player.fbx is authored at 320 units tall, so it is scaled down on load.
 */

/** Multiplier applied to the loaded FBX so the character is PLAYER_HEIGHT tall. */
export const FBX_TO_WORLD_SCALE = 0.01;

/** Rider height in world units (320 * FBX_TO_WORLD_SCALE). */
export const PLAYER_HEIGHT = 3.2;

/**
 * Height of the MOUNTED pair, feet-of-animal to top-of-rider.
 *
 * The simulation moves the ANIMAL, not the person: `motion.y` is the animal's
 * hoof line and this is the whole silhouette's height, which is what a ceiling
 * test has to clear.
 */
export const MOUNT_HEIGHT = 5.2;

/**
 * Horizontal half-width of the mounted pair.
 *
 * An animal is longer than it is wide, but the collision body is a cylinder
 * because it turns: modelling the length would mean a rotating box, and a
 * rotating box against an axis-aligned course is a solver, not a radius.
 */
export const MOUNT_RADIUS = 1.15;

/** The course runs along +Z. Players travel *along* it, never across it. */
export const COURSE_FORWARD_AXIS = 'z' as const;

/**
 * Spawn transform: the middle of the starting arena.
 *
 * Deliberately clear of both feature areas - the animal line-up down the left
 * wall and the training deck on the right - so the game opens on the open
 * ground the arena exists to provide, with both features in shot.
 */
export const SPAWN_POSITION: Readonly<Vec3> = { x: 0, y: 0, z: -62 };

/** Spawn yaw in radians (facing +Z, down the course). */
export const SPAWN_ROTATION_Y = 0;

/**
 * Y below which the rider has fallen out of the world.
 *
 * Sits well ABOVE the pit floor, so a fall is a short drop into a pit the
 * player can see the bottom of rather than a long one into nothing. The world
 * having a visible bottom is what stops a miss reading as a bug.
 */
export const DEATH_PLANE_Y = -11;
