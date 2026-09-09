import { logger } from '../util/logger.js';

const SCOPE = 'audio';

/** Master volumes per category. Music sits well under the gameplay sounds. */
const MUSIC_GAIN = 0.16;
const SFX_GAIN = 0.34;

/**
 * Most one-shot voices allowed to sound at once.
 *
 * A ceiling rather than a hope. Web Audio nodes are one-shot by design - a
 * source cannot be replayed, so every sound is a new node - and the thing that
 * has to be bounded is therefore how many are alive at any moment, not how
 * many are ever made. Beyond this, a request is dropped rather than queued:
 * the twenty-first simultaneous hoofbeat is inaudible anyway.
 */
const MAX_VOICES = 12;

/** Seconds a given sound refuses to retrigger, so nothing can machine-gun. */
const COOLDOWNS: Readonly<Record<SoundName, number>> = {
  jump: 0.12,
  land: 0.14,
  step: 0.05,
  death: 0.6,
  win: 0.4,
  level: 0.4,
  rebirth: 0.8,
  claim: 0.3,
};

export type SoundName =
  | 'jump'
  | 'land'
  | 'step'
  | 'death'
  | 'win'
  | 'level'
  | 'rebirth'
  | 'claim';

/** One bar of the loop: semitone offsets from the root, and their beat. */
interface Note {
  readonly beat: number;
  readonly semitone: number;
  readonly length: number;
}

/**
 * Every sound in the game, synthesised.
 *
 * There is not one audio file in the build, for the same reason there is not
 * one image file: the whole style is a handful of shapes drawn at runtime, and
 * a music track is the single easiest way to spend the entire 12 MB budget.
 * Oscillators and envelopes cost bytes measured in the hundreds.
 *
 * THREE rules hold the whole thing together:
 *
 *  - ONE context, ONE music voice. The loop is scheduled ahead on a timer and
 *    is the only thing that persists; there is no path that can start a second
 *    copy of it, which is what makes the doubled-music bug impossible rather
 *    than merely unlikely.
 *  - ONE-SHOTS ARE BOUNDED, twice: a per-sound cooldown stops the same effect
 *    retriggering every frame, and a hard voice ceiling stops the mix from
 *    ever containing more than a dozen of them.
 *  - ONLY THE LOCAL PLAYER makes noise. A busy server would otherwise put a
 *    hoofbeat, a jump and a death from every other rider into a mix the player
 *    is trying to hear their own mount in.
 *
 * Nothing here starts until the player's first gesture: browsers refuse to run
 * an AudioContext before one, and a context created earlier merely sits
 * suspended and confuses everything downstream.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  /** Live one-shot voices, so the ceiling can be enforced. */
  private voices = 0;
  /** Wall-clock of the last play, per sound. */
  private readonly lastPlayed = new Map<SoundName, number>();

  private musicTimer = 0;
  /** Context time the loop has been scheduled up to. */
  private scheduledTo = 0;
  private bar = 0;

  private muted = false;
  private started = false;

  /**
   * Bring the audio up, on a real user gesture.
   *
   * Safe to call repeatedly - it is wired to every gesture precisely because
   * no single one of them is guaranteed to be the one the browser accepts.
   */
  resume(): void {
    if (this.muted) return;
    if (!this.context) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        this.context = new Ctor();
      } catch (error) {
        logger.warn(SCOPE, `no audio context: ${String(error)}`);
        return;
      }

      this.master = this.context.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.context.destination);

      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = MUSIC_GAIN;
      this.musicBus.connect(this.master);

      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = SFX_GAIN;
      this.sfxBus.connect(this.master);
    }

    void this.context.resume().catch(() => undefined);

    if (!this.started) {
      this.started = true;
      this.scheduledTo = this.context.currentTime + 0.1;
      // A lookahead scheduler rather than a note-by-note timer: `setInterval`
      // drifts and stalls in a background tab, and the whole point of
      // scheduling into Web Audio's own clock is that the beat does not.
      this.musicTimer = window.setInterval(() => this.pumpMusic(), 120);
      logger.info(SCOPE, 'audio started');
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Silence everything, or bring it back. The music keeps its own time. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.05);
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Play a one-shot.
   *
   * Refused if the same sound played within its cooldown, or if the voice
   * ceiling is already reached. Both refusals are silent: a sound that cannot
   * be heard is not an error.
   */
  play(name: SoundName, intensity = 1): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < COOLDOWNS[name]) return;
    if (this.voices >= MAX_VOICES) return;
    this.lastPlayed.set(name, now);

    const level = Math.min(Math.max(intensity, 0), 1);
    switch (name) {
      case 'jump':
        // A rising blip: pitch going up is the most direct way to say "up".
        this.blip(now, 'square', 320, 640, 0.16, 0.5 * level);
        break;
      case 'land':
        this.thud(now, 0.35 + level * 0.3);
        break;
      case 'step':
        // The hoofbeat. Deliberately a soft, short thud rather than a click:
        // this is an animal's foot, and it plays several times a second.
        this.thud(now, 0.1 + level * 0.14, 90);
        break;
      case 'death':
        this.blip(now, 'sawtooth', 300, 70, 0.5, 0.6);
        break;
      case 'win':
        this.arpeggio(now, [0, 4, 7, 12], 0.09, 'triangle', 0.5);
        break;
      case 'level':
        this.arpeggio(now, [0, 7, 12], 0.07, 'triangle', 0.4);
        break;
      case 'rebirth':
        this.arpeggio(now, [0, 4, 7, 12, 16, 19], 0.08, 'sawtooth', 0.45);
        break;
      case 'claim':
        this.arpeggio(now, [0, 5, 9], 0.06, 'square', 0.35);
        break;
    }
  }

  dispose(): void {
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
    this.started = false;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
  }

  // -------------------------------------------------------------- the music

  /**
   * The loop: a four-bar bounce in A major.
   *
   * Bass on every beat, a bright arpeggio over it, and a chord change every
   * bar. Written as data rather than as code so the tune is one table to edit,
   * and short enough that the loop point falls on a bar line - which is the
   * whole of "loops cleanly".
   */
  private pumpMusic(): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!ctx || !bus || ctx.state !== 'running') return;

    const beat = 60 / 128;
    const barLength = beat * 4;
    // Schedule half a second ahead. Enough that a stalled timer cannot cause a
    // gap, short enough that a mute is heard almost at once.
    while (this.scheduledTo < ctx.currentTime + 0.5) {
      this.scheduleBar(this.scheduledTo, barLength, beat);
      this.scheduledTo += barLength;
      this.bar = (this.bar + 1) % 4;
    }
  }

  private scheduleBar(at: number, barLength: number, beat: number): void {
    // I - vi - IV - V, the most cheerful four bars in existence, which is
    // exactly the register this game is in.
    const roots = [0, -3, -7, -5];
    const root = roots[this.bar] as number;

    const melody: readonly Note[] = [
      { beat: 0, semitone: 12, length: 0.9 },
      { beat: 0.5, semitone: 16, length: 0.4 },
      { beat: 1, semitone: 19, length: 0.9 },
      { beat: 1.5, semitone: 16, length: 0.4 },
      { beat: 2, semitone: 21, length: 0.9 },
      { beat: 2.5, semitone: 19, length: 0.4 },
      { beat: 3, semitone: 16, length: 0.9 },
      { beat: 3.5, semitone: 12, length: 0.5 },
    ];

    for (let i = 0; i < 4; i += 1) {
      this.musicNote(at + i * beat, root - 12, beat * 0.85, 'triangle', 0.5);
    }
    for (const note of melody) {
      this.musicNote(
        at + note.beat * beat,
        root + note.semitone,
        beat * note.length,
        'square',
        0.18,
      );
    }
    void barLength;
  }

  private musicNote(
    at: number,
    semitone: number,
    length: number,
    shape: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!ctx || !bus) return;

    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.value = 220 * 2 ** (semitone / 12);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);

    osc.connect(envelope);
    envelope.connect(bus);
    osc.start(at);
    osc.stop(at + length + 0.02);
    // Music voices are scheduled, bounded by the bar, and deliberately do NOT
    // count against the one-shot ceiling - a busy moment must never be able to
    // punch a hole in the tune.
    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  }

  // --------------------------------------------------------- the one-shots

  private blip(
    at: number,
    shape: OscillatorType,
    from: number,
    to: number,
    length: number,
    gain: number,
  ): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    const osc = ctx.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);

    osc.connect(envelope);
    envelope.connect(bus);
    this.hold(osc, envelope, at, length);
  }

  /** A hoof on the ground: a short filtered noise burst with a low thump. */
  private thud(at: number, gain: number, frequency = 150): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, at + 0.09);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);

    osc.connect(envelope);
    envelope.connect(bus);
    this.hold(osc, envelope, at, 0.12);
  }

  private arpeggio(
    at: number,
    semitones: readonly number[],
    step: number,
    shape: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.context;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;

    for (let i = 0; i < semitones.length; i += 1) {
      if (this.voices >= MAX_VOICES) return;
      const osc = ctx.createOscillator();
      osc.type = shape;
      osc.frequency.value = 440 * 2 ** ((semitones[i] as number) / 12);

      const start = at + i * step;
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + step * 2.2);

      osc.connect(envelope);
      envelope.connect(bus);
      this.hold(osc, envelope, start, step * 2.2);
    }
  }

  /**
   * Start a voice, count it, and make sure it is uncounted exactly once.
   *
   * The counting is the whole reason `MAX_VOICES` means anything: a node that
   * started without being counted, or one that ended without being uncounted,
   * would leave the ceiling either useless or permanently closed.
   */
  private hold(osc: OscillatorNode, envelope: GainNode, at: number, length: number): void {
    this.voices += 1;
    osc.start(at);
    osc.stop(at + length + 0.02);
    osc.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      osc.disconnect();
      envelope.disconnect();
    };
  }
}
