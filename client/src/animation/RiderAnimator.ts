import type { Group } from 'three';
import { POSE_BLEND_RATE, RIDE } from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';
import { PoseBuffer } from './PoseBuffer.js';
import type { PlayerRig } from './rig/PlayerRig.js';

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The rider's animator.
 *
 * The player is a PASSENGER, and this file is what makes that read. There is
 * exactly one looping animation - the seated ride - plus secondary motion
 * layered on top: a bounce against the animal's gait, a forward lean into a
 * gallop, a lift of the arms over a jump and a slump as the animal goes over.
 *
 * Crucially the walking animation NEVER plays. A rider whose legs cycle while
 * they sit is the single most obvious way a mounted character looks wrong, so
 * the locomotion cycle simply does not exist on this side of the mount - the
 * animal does all the walking.
 *
 * Like the previous game's animator, it writes ONLY to bones and to the
 * supplied visual node. It cannot move the mount, change velocity or decide a
 * gameplay outcome.
 */
export class RiderAnimator {
  private readonly rig: PlayerRig;
  /** Node the vertical posting motion is written to. Never the physics root. */
  private readonly visual: Group;

  /** The pose actually on the skeleton, eased toward `target` every frame. */
  private readonly current = new PoseBuffer();
  private readonly target = new PoseBuffer();

  /** Gait phase, supplied by the animal so the two cannot drift apart. */
  private phase = 0;
  private gallop = 0;
  private time = 0;

  constructor(rig: PlayerRig, visual: Group) {
    this.rig = rig;
    this.visual = visual;
  }

  /** Clear every transient, e.g. after a respawn. */
  reset(): void {
    this.current.reset();
    this.target.reset();
    this.phase = 0;
    this.gallop = 0;
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
    this.rig.resetToBindPose();
  }

  /**
   * @param phase the ANIMAL's gait phase, so the rider bounces in time with
   *              the hooves rather than to a clock of its own. Sharing one
   *              phase is what makes the pair read as a single performance.
   */
  update(delta: number, input: AnimationInput, phase: number): void {
    const dt = Math.max(0, delta);
    this.time += dt;
    this.phase = phase;

    const scale = Math.max(1, input.moveMultiplier);
    const target = smoothstep(8 * scale, 20 * scale, input.horizontalSpeed);
    this.gallop += (target - this.gallop) * (1 - Math.exp(-6 * dt));

    this.buildTarget(input);

    // Eased rather than snapped, so a landing or a death transition arrives as
    // a movement rather than as a cut.
    const alpha = 1 - Math.exp(-POSE_BLEND_RATE * dt);
    this.current.lerpBetween(this.current, this.target, alpha);

    this.rig.applyPose(this.current);
    this.visual.position.y = this.current.bobY;
  }

  /** Compose the pose this frame should be blending toward. */
  private buildTarget(input: AnimationInput): void {
    const pose = this.target;
    pose.applyDefinition(RIDE.pose);

    if (input.dying) {
      // Thrown forward and sideways as the animal keels: the rider reacts to
      // the fall rather than riding a mount that is no longer upright.
      pose.add('Spine1', RIDE.deathSlump * 0.6, 0, RIDE.deathSlump * 0.5);
      pose.add('Spine2', RIDE.deathSlump * 0.4, 0, RIDE.deathSlump * 0.3);
      pose.add('Neck1', -RIDE.deathSlump * 0.3, 0, 0);
      pose.add('ArmL1', RIDE.jumpArmLift * 1.6, 0, -0.4);
      pose.add('ArmR1', RIDE.jumpArmLift * 1.6, 0, 0.4);
      pose.bobY = -0.12;
      return;
    }

    if (!input.grounded) {
      // Airborne: lean with the arc and lift the arms, so the rider is going
      // over the jump with the animal rather than being carried through it.
      const rise = clamp(input.verticalVelocity / 16, -1, 1);
      const lean = rise >= 0 ? RIDE.riseLean * rise : RIDE.fallLean * -rise;
      pose.add('Spine1', lean, 0, 0);
      pose.add('Spine2', lean * 0.5, 0, 0);
      pose.add('Neck1', -lean * 0.6, 0, 0);
      pose.add('ArmL1', RIDE.jumpArmLift, 0, 0);
      pose.add('ArmR1', RIDE.jumpArmLift, 0, 0);
      pose.bobY = 0.04;
      return;
    }

    // Grounded: the posting bounce, in time with the animal's own cycle.
    const bounce = lerp(RIDE.bounce.walk, RIDE.bounce.gallop, this.gallop);
    const posting = lerp(
      RIDE.postingHeight.walk,
      RIDE.postingHeight.gallop,
      this.gallop,
    );
    const moving = input.horizontalSpeed > 0.6;
    const weight = moving ? 1 : 0;

    const swing = Math.sin(this.phase * 2);
    pose.add('Spine1', RIDE.gallopLean * this.gallop + bounce * swing * weight, 0, 0);
    pose.add('Spine2', bounce * 0.5 * swing * weight, 0, 0);
    // The head counter-rotates so the gaze stays down the course however hard
    // the body is being bounced.
    pose.add('Neck1', -RIDE.gallopLean * this.gallop * 0.7 - bounce * 0.6 * swing * weight, 0, 0);
    // Hands rise and fall a little with the reins.
    pose.add('ArmL1', bounce * 0.5 * swing * weight, 0, 0);
    pose.add('ArmR1', bounce * 0.5 * swing * weight, 0, 0);
    // Thighs grip a touch harder at a gallop.
    pose.add('LegL1', 0, 0, -0.05 * this.gallop);
    pose.add('LegR1', 0, 0, 0.05 * this.gallop);

    pose.bobY = -Math.cos(this.phase * 2) * posting * weight;

    if (!moving) {
      // Standing still: breathing only. Small, slow, and enough that the
      // rider is never a mannequin.
      const breath = Math.sin(this.time * Math.PI * 2 * RIDE.breathFrequency);
      pose.add('Spine1', RIDE.breathAmount * breath, 0, 0);
      pose.add('Neck1', -RIDE.breathAmount * 0.5 * breath, 0, 0);
      pose.bobY = breath * 0.012;
    }
  }
}
