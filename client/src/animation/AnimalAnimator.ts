import { AnimalAnimationState } from '@animal/shared';
import type { AnimalModel } from '../animal/AnimalModel.js';
import { DEATH, GAIT, JUMP } from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';

const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth 0..1 ramp between two thresholds. */
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The four-legged animator.
 *
 * The ONLY animation state machine for the animal. It consumes a read-only
 * `AnimationInput` and writes exclusively to the model's animated nodes - the
 * body, the head, the tail and the eight leg joints. It never moves `root`,
 * never touches velocity, and never decides a gameplay outcome. That is the
 * same separation the previous game's rig enforced, and it is why swapping
 * animals cannot break movement.
 *
 * Walk and gallop are ONE cycle. The gait blend raises the cadence, deepens
 * the pose and slides the four legs from a diagonal two-beat into a four-beat
 * bound, so speeding up reads as a change of gait rather than the same trot
 * played faster.
 *
 * Phase advances with DISTANCE, not wall-clock time, so hooves stay in step
 * with real movement - and the cadence is clamped, so they stay readable when
 * a late-game mount is covering four hundred units a second.
 */
export class AnimalAnimator {
  private readonly model: AnimalModel;

  private phase = 0;
  private state: AnimalAnimationState = AnimalAnimationState.Idle;

  /** Seconds into the crouch, the landing squash, or the death. */
  private crouchTime = -1;
  private landTime = -1;
  private deathTime = -1;

  /** Smoothed head turn, so steering does not snap the neck. */
  private headYaw = 0;

  /** Smoothed gait blend, so a speed spike does not pop the pose. */
  private gallop = 0;

  constructor(model: AnimalModel) {
    this.model = model;
  }

  get currentState(): AnimalAnimationState {
    return this.state;
  }

  /**
   * The gait phase, in radians.
   *
   * Handed to the rider so both halves of the mount bounce to the SAME cycle.
   * A rider running its own clock is what makes a mounted pair look like two
   * animations played at each other rather than one performance.
   */
  get gaitPhase(): number {
    return this.phase;
  }

  /** Seconds the death animation has been running, or -1. */
  get deathProgress(): number {
    return this.deathTime < 0 ? -1 : clamp(this.deathTime / DEATH.duration, 0, 1);
  }

  /** Clear every transient, e.g. after a respawn. */
  reset(): void {
    this.phase = 0;
    this.crouchTime = -1;
    this.landTime = -1;
    this.deathTime = -1;
    this.headYaw = 0;
    this.gallop = 0;
    this.state = AnimalAnimationState.Idle;
    this.model.resetPose();
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);

    if (input.dying) {
      this.deathTime = this.deathTime < 0 ? 0 : this.deathTime + dt;
      this.state = AnimalAnimationState.Dying;
      this.writeDeath();
      return;
    }
    this.deathTime = -1;

    if (input.jumpStarted) this.crouchTime = 0;
    if (input.landed) this.landTime = 0;
    if (this.crouchTime >= 0) {
      this.crouchTime += dt;
      if (this.crouchTime > JUMP.crouchDuration) this.crouchTime = -1;
    }
    if (this.landTime >= 0) {
      this.landTime += dt;
      if (this.landTime > JUMP.landDuration) this.landTime = -1;
    }

    // The gait blend is measured against the player's OWN authoritative speed
    // scale, so "galloping" means the same thing at level 1 and level 80.
    const scale = Math.max(1, input.moveMultiplier);
    const target = smoothstep(
      GAIT.walkSpeed * scale,
      GAIT.gallopSpeed * scale,
      input.horizontalSpeed,
    );
    this.gallop += (target - this.gallop) * (1 - Math.exp(-6 * dt));

    const stride = this.model.definition.strideLength;
    const frequency = clamp(
      input.horizontalSpeed / stride,
      GAIT.minFrequency,
      GAIT.maxFrequency,
    );

    const moving = input.horizontalSpeed > GAIT.idleSpeed;
    if (moving) {
      this.phase = (this.phase + frequency * TAU * dt) % TAU;
    } else {
      // Ease back toward a neutral standing phase, so setting off never begins
      // mid-stride with a leg through the floor.
      const settleTarget = this.phase > Math.PI ? TAU : 0;
      this.phase += (settleTarget - this.phase) * (1 - Math.exp(-8 * dt));
      if (this.phase >= TAU - 1e-4) this.phase = 0;
    }

    this.headYaw +=
      (clamp(input.turn, -1, 1) * GAIT.headTurn - this.headYaw) *
      (1 - Math.exp(-GAIT.headTurnRate * dt));

    this.state = resolveState(input, moving, this.gallop);

    if (input.grounded) this.writeGrounded(input, moving);
    else this.writeAirborne(input);
  }

  /** Walk, gallop and stand. */
  private writeGrounded(input: AnimationInput, moving: boolean): void {
    const model = this.model;
    const parts = model.parts;
    const blend = this.gallop;

    const hipSwing = lerp(GAIT.hipSwing.walk, GAIT.hipSwing.gallop, blend);
    const kneeBend = lerp(GAIT.kneeBend.walk, GAIT.kneeBend.gallop, blend);
    const bobAmount = lerp(GAIT.bob.walk, GAIT.bob.gallop, blend);
    const pitchAmount = lerp(GAIT.pitch.walk, GAIT.pitch.gallop, blend);
    const rollAmount = lerp(GAIT.roll.walk, GAIT.roll.gallop, blend);
    const nodAmount = lerp(GAIT.headNod.walk, GAIT.headNod.gallop, blend);

    // Idle still breathes: the amplitude falls to a tenth rather than to zero,
    // so a stopped animal is alive rather than a statue.
    const weight = moving ? 1 : 0.1;

    for (let i = 0; i < model.hips.length; i += 1) {
      const offset = lerp(
        GAIT.trotPhase[i] as number,
        GAIT.gallopPhase[i] as number,
        blend,
      );
      const legPhase = this.phase + offset;
      const swing = Math.sin(legPhase);

      const hip = model.hips[i];
      const knee = model.knees[i];
      if (!hip || !knee) continue;
      hip.rotation.x = hipSwing * swing * weight;
      hip.rotation.z = 0;
      // Knees bend only during the swing-through. A knee that bends both ways
      // reads as a broken leg, so the curve is squared and clipped at zero.
      knee.rotation.x = kneeBend * kneeCurve(legPhase) * weight;
    }

    // The body rises twice per cycle - once per pair of footfalls.
    const bob = -Math.cos(this.phase * 2) * bobAmount * weight;
    const idleBreath = moving ? 0 : Math.sin(performance.now() * 0.0016) * 0.012;
    model.body.position.set(0, parts.bodyCentreY + bob + idleBreath, 0);
    model.body.rotation.set(
      Math.sin(this.phase * 2) * pitchAmount * weight,
      0,
      Math.sin(this.phase) * rollAmount * weight,
    );
    model.body.scale.set(1, 1, 1);

    // The head counter-nods against the body, which is what stops the whole
    // animal looking like one rigid block being bounced.
    model.head.rotation.set(
      Math.cos(this.phase * 2) * nodAmount * weight,
      this.headYaw,
      0,
    );

    const droop = this.model.definition.shape.tailDroop;
    model.tail.rotation.set(
      -droop + GAIT.tailLift * blend,
      Math.sin(this.phase) * GAIT.tailSway * weight,
      0,
    );

    this.applyCrouchAndLand();
  }

  /** Leaving the ground, sailing, and coming down. */
  private writeAirborne(input: AnimationInput): void {
    const model = this.model;
    const parts = model.parts;

    // Front legs tuck up and back legs trail - the shape of a horse over a
    // fence, and the reason a jump reads as a jump rather than a hop with the
    // gait still cycling underneath it.
    for (let i = 0; i < model.hips.length; i += 1) {
      const isFront = i < 2;
      const hip = model.hips[i];
      const knee = model.knees[i];
      if (!hip || !knee) continue;
      hip.rotation.x = isFront ? JUMP.frontTuck : JUMP.backTrail;
      hip.rotation.z = 0;
      knee.rotation.x = isFront ? JUMP.frontKnee : JUMP.backKnee;
    }

    // Pitch follows vertical velocity: nose up on the way out, nose down on
    // the way in.
    const rise = clamp(input.verticalVelocity / JUMP.velocityReference, -1, 1);
    const pitch = rise >= 0 ? JUMP.risePitch * rise : JUMP.fallPitch * -rise;

    model.body.position.set(0, parts.bodyCentreY, 0);
    model.body.rotation.set(pitch, 0, 0);
    model.body.scale.set(1, 1, 1);
    model.head.rotation.set(-pitch * 0.5, this.headYaw, 0);
    model.tail.rotation.set(
      -this.model.definition.shape.tailDroop + GAIT.tailLift,
      0,
      0,
    );
  }

  /**
   * The crouch before a jump and the squash after a landing.
   *
   * Written to the body node only. It is a SCALE and a drop, never a change to
   * the mount's position - the simulation owns where the animal is, and an
   * animation that could move it would be a second physics system.
   */
  private applyCrouchAndLand(): void {
    const model = this.model;
    const parts = model.parts;

    if (this.crouchTime >= 0) {
      const t = clamp(this.crouchTime / JUMP.crouchDuration, 0, 1);
      // Deepest at the start and recovering, so the crouch reads as a coil
      // releasing rather than as a sink.
      const amount = 1 - t;
      model.body.position.y = parts.bodyCentreY - JUMP.crouchDrop * amount;
      model.body.scale.set(1 + 0.09 * amount, 1 - 0.16 * amount, 1 + 0.09 * amount);
      return;
    }

    if (this.landTime >= 0) {
      const t = clamp(this.landTime / JUMP.landDuration, 0, 1);
      const amount = 1 - t;
      model.body.position.y = parts.bodyCentreY - JUMP.landDrop * amount;
      model.body.scale.set(1 + 0.12 * amount, 1 - 0.2 * amount, 1 + 0.12 * amount);
      // The legs splay to absorb it.
      for (let i = 0; i < model.knees.length; i += 1) {
        const knee = model.knees[i];
        if (knee) knee.rotation.x += 0.5 * amount;
      }
    }
  }

  /**
   * The fall-over.
   *
   * Keels onto one side, pitches nose-down and sinks, with the legs stiffening
   * out. Simple and readable, exactly like the rest of the visual language -
   * this is a toy animal tipping over, not a ragdoll.
   */
  private writeDeath(): void {
    const model = this.model;
    const parts = model.parts;
    const t = clamp(this.deathTime / DEATH.duration, 0, 1);
    // Ease-out, so it goes over quickly and settles rather than rotating at a
    // constant rate like a turning turntable.
    const eased = 1 - (1 - t) * (1 - t);

    model.body.position.set(0, parts.bodyCentreY - DEATH.drop * eased, 0);
    model.body.rotation.set(DEATH.pitch * eased, 0, DEATH.roll * eased);
    model.body.scale.set(1, 1, 1);
    model.head.rotation.set(DEATH.pitch * 0.8 * eased, this.headYaw * 0.3, 0);
    model.tail.rotation.set(-this.model.definition.shape.tailDroop, 0, 0);

    for (let i = 0; i < model.hips.length; i += 1) {
      const hip = model.hips[i];
      const knee = model.knees[i];
      if (!hip || !knee) continue;
      hip.rotation.x = (i < 2 ? -DEATH.legSplay : DEATH.legSplay) * eased;
      hip.rotation.z = 0;
      knee.rotation.x = 0.2 * eased;
    }
  }
}

/**
 * Knee flexion over one cycle: zero while the leg is planted and extending,
 * rising to a peak as the hoof lifts and passes under the body.
 */
const kneeCurve = (phase: number): number => {
  const raw = Math.sin(phase - Math.PI / 2.6);
  return raw > 0 ? raw * raw : 0;
};

const resolveState = (
  input: AnimationInput,
  moving: boolean,
  gallop: number,
): AnimalAnimationState => {
  if (!input.grounded) {
    return input.verticalVelocity > 2
      ? AnimalAnimationState.JumpStart
      : AnimalAnimationState.Airborne;
  }
  if (!moving) return AnimalAnimationState.Idle;
  return gallop > 0.5 ? AnimalAnimationState.Gallop : AnimalAnimationState.Walk;
};
