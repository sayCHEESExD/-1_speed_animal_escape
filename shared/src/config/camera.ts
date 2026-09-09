/**
 * Third-person chase camera tuning.
 *
 * Lives in shared config so gameplay can reason about framing without
 * importing the renderer.
 */
export interface CameraConfig {
  /** Distance behind the mount at rest, in world units. */
  readonly distance: number;
  /** Height above the animal's hooves that the camera sits at. */
  readonly height: number;
  /** Height above the hooves that the camera looks at - the rider's chest. */
  readonly lookAtHeight: number;
  /** Positional smoothing factor per second (higher = snappier). */
  readonly followLerp: number;
  /** Vertical field of view in degrees at rest. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  /**
   * Extra distance at full speed.
   *
   * Late game runs at hundreds of units a second, and a fixed camera makes the
   * next gap arrive with no warning. Pulling back is what buys the reaction
   * time the obby needs at those speeds.
   */
  readonly speedDistance: number;
  /** Extra vertical FOV in degrees at full speed, for the sense of rush. */
  readonly speedFov: number;
  /** Speed at which the two allowances above are fully applied. */
  readonly speedReference: number;
  /** How fast the dynamic distance and FOV ease, per second. */
  readonly speedEase: number;
}

/**
 * Framed for the reference art: the animal fills the lower third, the rider
 * sits at the centre of the shot, and the corridor ahead is visible to the
 * next obstacle.
 */
export const CAMERA: CameraConfig = {
  distance: 9.6,
  height: 3.9,
  lookAtHeight: 3.15,
  followLerp: 9,
  fov: 68,
  near: 0.1,
  far: 2200,
  speedDistance: 7.5,
  speedFov: 12,
  speedReference: 140,
  speedEase: 2.2,
};
