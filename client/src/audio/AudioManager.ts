import { logger } from '../util/logger.js';

const SCOPE = 'audio';

/** Master volumes per category. Music sits well under the gameplay sounds. */
const MUSIC_GAIN = 0.55;
const SFX_GAIN = 0.34;

/**
 * The background track.
 *
 * Served from the repo-level `assets/` folder, which Vite publishes as the web
 * root - so this path is what the file is reachable at, in dev and in the
 * build alike.
 */
const MUSIC_URL = '/audio/background_music.mp3';

/**
 * One-shots that are SAMPLES rather than oscillators.
 *
 * The deliberate exceptions to "every sound effect is synthesised", for the
 * same reason the music is: a jump and a death are the two effects the player
 * hears most closely, and an oscillator sweep reads as a placeholder where a
 * recorded sound reads as the game. Everything else on the list stays
 * synthesised, because a pack of wavs is the easiest way to spend the 12 MB
 * budget - these two together are under 100 KB.
 *
 * DECODED, unlike the music, which is streamed. The trade runs the other way
 * for a short sound: these are fractions of a second, so the decoded buffer is
 * small, and a one-shot has to start on the exact frame it is asked for rather
 * than when a stream happens to be ready.
 */
const SAMPLE_URLS: Partial<Record<SoundName, string>> = {
  jump: '/audio/jump.mp3',
  death: '/audio/death.mp3',
};

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

/** Keep a slider inside 0..1 whatever the portal sent. */
const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 1;

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

/**
 * Every sound in the game, synthesised.
 *
 * Every SOUND EFFECT is synthesised - oscillators and envelopes cost bytes
 * measured in the hundreds, and a pack of wavs is the easiest way to spend the
 * 12 MB budget. The background music is the one deliberate exception: a
 * supplied track, streamed from `assets/audio/`, because a tune is the one
 * thing an oscillator cannot fake convincingly.
 *
 * THREE rules hold the whole thing together:
 *
 *  - ONE context, ONE music voice. The track is an `<audio>` element created
 *    once behind the `started` flag and routed through `musicBus`, so there is
 *    no path that can start a second copy of it - which is what makes the
 *    doubled-music bug impossible rather than merely unlikely.
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

  /**
   * The music, as a streaming element rather than a decoded buffer.
   *
   * `decodeAudioData` would hold the whole track in memory uncompressed - a
   * three-minute stereo file is over thirty megabytes once decoded, for
   * something that is only ever played start to finish. An element streams it,
   * loops it natively, and still routes through Web Audio, which is what keeps
   * the portal's music slider and the mute working.
   */
  private musicElement: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;

  /**
   * Decoded one-shot samples, by name.
   *
   * A sound is only in here once it has actually decoded, which is what makes
   * the fallback in `play` a simple lookup: until then - and for ever, if the
   * file is missing or the fetch is blocked - the synthesised voice is used
   * instead, so a blocked asset is a different sound rather than silence.
   */
  private readonly samples = new Map<SoundName, AudioBuffer>();
  /** Set once the fetches have been kicked off, so they happen exactly once. */
  private samplesRequested = false;

  /**
   * The sampled sound currently playing, per name. At most ONE each.
   *
   * The cooldowns were tuned against the synthesised voices, every one of which
   * was SHORTER than its own cooldown - the death lasted 0.5s behind a 0.6s
   * cooldown - so a one-shot could never catch its own tail. The recorded files
   * are far longer (both about 1.8s), which quietly breaks that: two deaths
   * 0.7s apart would clear the cooldown and sound on top of each other, and
   * jumps would stack until they hit the voice ceiling.
   *
   * So a sampled sound REPLACES itself rather than layering. The trigger and
   * the gain are untouched - every jump still plays the jump - it simply
   * restarts instead of doubling, which is what keeps "no overlapping deaths"
   * true now that the sound outlasts its cooldown.
   */
  private readonly activeSamples = new Map<SoundName, AudioBufferSourceNode>();

  private muted = false;
  private started = false;

  /** The portal's master and music sliders, 0..1. Both default to full. */
  private masterLevel = 1;
  private musicLevel = 1;

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
      // Built at the level the portal has ALREADY set: settings arrive before
      // the first user gesture, so a context created at full volume would be
      // loud for exactly as long as it took the next slider change to arrive.
      this.master.gain.value = this.muted ? 0 : this.masterLevel;
      this.master.connect(this.context.destination);

      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = MUSIC_GAIN * this.musicLevel;
      this.musicBus.connect(this.master);

      this.sfxBus = this.context.createGain();
      this.sfxBus.gain.value = SFX_GAIN;
      this.sfxBus.connect(this.master);
    }

    void this.context.resume().catch(() => undefined);

    if (!this.started) {
      this.started = true;
      this.startMusic();
      this.loadSamples();
      logger.info(SCOPE, 'audio started');
    }

    // A tab that was backgrounded pauses the element; resuming has to restart
    // it, and `play()` on an already-playing element is a no-op.
    if (this.musicElement && !this.muted) {
      void this.musicElement.play().catch(() => undefined);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Silence everything, or bring it back. The music keeps its own time. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
  }

  /**
   * The portal's master volume, 0..1.
   *
   * Kept SEPARATE from mute rather than folded into it: they are two different
   * statements - "I set this to 30%" and "silence, now" - and a mute that
   * overwrote the level would hand back the wrong one when it lifted. The
   * master gain is the product of the two, so unmuting restores whatever the
   * slider said.
   */
  setMasterVolume(level: number): void {
    this.masterLevel = clamp01(level);
    this.applyMaster();
  }

  /** The portal's music volume, 0..1, against the game's own tuned mix. */
  setMusicVolume(level: number): void {
    this.musicLevel = clamp01(level);
    if (this.musicBus && this.context) {
      this.musicBus.gain.setTargetAtTime(
        MUSIC_GAIN * this.musicLevel,
        this.context.currentTime,
        0.05,
      );
    }
  }

  private applyMaster(): void {
    if (this.master && this.context) {
      const target = this.muted ? 0 : this.masterLevel;
      this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.05);
    }

    // A muted stream is PAUSED, not merely silenced. Leaving it running would
    // keep decoding a file nobody can hear, and on a phone that is battery
    // spent on nothing.
    const element = this.musicElement;
    if (!element) return;
    if (this.muted) element.pause();
    else void element.play().catch(() => undefined);
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
        // The recorded jump, falling back to the rising blip it replaced -
        // pitch going up being the most direct way to say "up". Same gain
        // either way, so the sample cannot be louder than what it replaced.
        if (this.playSample('jump', now, 0.5 * level)) break;
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
        // The recorded death, falling back to the descending sawtooth.
        if (this.playSample('death', now, 0.6)) break;
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
    if (this.musicElement) {
      this.musicElement.pause();
      // Dropping the src releases the network request and the decoder; an
      // element left holding a stream keeps both alive after the game is gone.
      this.musicElement.removeAttribute('src');
      this.musicElement.load();
    }
    this.musicSource?.disconnect();
    this.musicSource = null;
    this.musicElement = null;
    this.samples.clear();
    this.activeSamples.clear();
    this.samplesRequested = false;
    this.started = false;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
  }

  // -------------------------------------------------------------- the music

  /**
   * Start the background track.
   *
   * Called ONCE, from the first `resume()`, which is the first real user
   * gesture - browsers refuse to play audio before one. The `started` flag is
   * what makes a second copy of the track impossible rather than merely
   * unlikely, and it is the same flag the synthesised loop used to rely on.
   *
   * The element is routed through `musicBus`, not straight to the speakers, so
   * everything already built on top of that bus keeps working untouched: the
   * portal's `music_volume` slider, the master volume, and mute.
   */
  private startMusic(): void {
    const ctx = this.context;
    const bus = this.musicBus;
    if (!ctx || !bus || this.musicElement) return;

    try {
      const element = new Audio();
      // Loop BEFORE the source is set, so the very first pass round is
      // seamless rather than the one gap the player hears.
      element.loop = true;
      element.preload = 'auto';
      // The element's own volume stays at 1: the mix belongs to `musicBus`,
      // and two independent volume controls on one sound is one too many.
      element.volume = 1;
      element.crossOrigin = 'anonymous';
      element.src = MUSIC_URL;

      const source = ctx.createMediaElementSource(element);
      source.connect(bus);

      this.musicElement = element;
      this.musicSource = source;

      if (!this.muted) void element.play().catch(() => undefined);

      element.addEventListener('error', () => {
        logger.warn(SCOPE, `background music failed to load from ${MUSIC_URL}`);
      });
    } catch (error) {
      // No music is a worse game, not a broken one.
      logger.warn(SCOPE, `could not start background music: ${String(error)}`);
    }
  }

  // --------------------------------------------------------- the one-shots

  /**
   * Fetch and decode the sampled one-shots.
   *
   * Called from the first `resume()`, for the same reason the music is: there
   * is no context to decode against until a user gesture has made one. Each
   * file is independent - one failing leaves the other in place - and a failure
   * is a warning rather than an error, because the synthesised voice is still
   * there to fall back to.
   */
  private loadSamples(): void {
    if (this.samplesRequested) return;
    this.samplesRequested = true;

    for (const [name, url] of Object.entries(SAMPLE_URLS)) {
      void (async (): Promise<void> => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          // Decoded against the live context, so the buffer is already at the
          // right sample rate when it is first asked for.
          const ctx = this.context;
          if (!ctx) return;
          const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
          this.samples.set(name as SoundName, decoded);
        } catch (error) {
          logger.warn(SCOPE, `could not load ${url}: ${String(error)} - using the synthesised voice`);
        }
      })();
    }
  }

  /**
   * Play a decoded sample, if it is ready.
   *
   * Returns FALSE when there is nothing to play, which is what lets each case
   * in `play` read as "the sample, or the oscillator that came before it". The
   * gain passed in is the same figure the synthesised voice used, and it is
   * applied on a node feeding `sfxBus` - so the cooldown, the voice ceiling,
   * the master volume and mute all treat this exactly like any other one-shot.
   */
  private playSample(name: SoundName, at: number, gain: number): boolean {
    const ctx = this.context;
    const bus = this.sfxBus;
    const buffer = this.samples.get(name);
    if (!ctx || !bus || !buffer) return false;

    // Cut the previous copy of THIS sound first. Stopping it fires its own
    // `onended`, which is what uncounts the voice and disconnects the nodes, so
    // the ceiling stays honest rather than leaking a voice per retrigger.
    const previous = this.activeSamples.get(name);
    if (previous) {
      try {
        previous.stop();
      } catch {
        // Already finished. Nothing to cut.
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const envelope = ctx.createGain();
    envelope.gain.value = gain;

    source.connect(envelope);
    envelope.connect(bus);
    this.activeSamples.set(name, source);
    this.hold(source, envelope, at, buffer.duration, () => {
      // Only clear the slot if a newer copy has not already claimed it.
      if (this.activeSamples.get(name) === source) this.activeSamples.delete(name);
    });
    return true;
  }

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
  private hold(
    osc: AudioScheduledSourceNode,
    envelope: GainNode,
    at: number,
    length: number,
    onDone?: () => void,
  ): void {
    this.voices += 1;
    osc.start(at);
    osc.stop(at + length + 0.02);
    osc.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      osc.disconnect();
      envelope.disconnect();
      onDone?.();
    };
  }
}
