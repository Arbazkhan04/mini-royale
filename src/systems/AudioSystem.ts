/**
 * Procedural audio.
 *
 * The game ships with no audio files, so every sound is synthesised with WebAudio at
 * runtime. `play()` is a no-op when WebAudio is unavailable or muted, which keeps the
 * game fully playable without any asset dependency. Drop-in file playback can be added
 * later behind the same `play(key, x, y)` signature.
 */
export type SoundKey =
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'sniper'
  | 'lmg'
  | 'melee'
  | 'reload'
  | 'empty'
  | 'impact'
  | 'hitmarker'
  | 'playerHit'
  | 'pickup'
  | 'heal'
  | 'zoneWarning'
  | 'zoneShrink'
  | 'death'
  | 'victory'
  | 'uiClick'
  | 'countdown';

interface ShotSpec {
  duration: number;
  lowpass: number;
  highpass?: number;
  gain: number;
  bodyFreq: number;
  bodyGain: number;
  decay: number;
}

const SHOTS: Record<string, ShotSpec> = {
  pistol: { duration: 0.16, lowpass: 3200, gain: 0.5, bodyFreq: 190, bodyGain: 0.35, decay: 0.1 },
  smg: { duration: 0.11, lowpass: 3800, gain: 0.38, bodyFreq: 230, bodyGain: 0.22, decay: 0.07 },
  rifle: { duration: 0.2, lowpass: 2800, gain: 0.55, bodyFreq: 150, bodyGain: 0.42, decay: 0.13 },
  lmg: { duration: 0.22, lowpass: 2200, gain: 0.6, bodyFreq: 120, bodyGain: 0.5, decay: 0.15 },
  shotgun: { duration: 0.34, lowpass: 1700, gain: 0.7, bodyFreq: 90, bodyGain: 0.6, decay: 0.24 },
  sniper: { duration: 0.42, lowpass: 4200, gain: 0.75, bodyFreq: 110, bodyGain: 0.55, decay: 0.3 },
};

const MAX_AUDIBLE_DISTANCE = 1500;

export class AudioSystem {
  private audio: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private listenerX = 0;
  private listenerY = 0;
  private lastPlayedAt: Record<string, number> = {};

  enabled = true;
  volume = 0.6;

  constructor() {
    this.volume = this.readStoredVolume();
  }

  private readStoredVolume(): number {
    try {
      const raw = window.localStorage.getItem('last-signal-volume');
      if (raw === null) return 0.6;
      const v = Number.parseFloat(raw);
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6;
    } catch {
      return 0.6;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this.volume;
    try {
      window.localStorage.setItem('last-signal-volume', String(this.volume));
    } catch {
      /* storage unavailable - volume simply is not persisted */
    }
  }

  /** Must be called from a user gesture on most browsers. Safe to call repeatedly. */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.audio) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.enabled = false;
        return;
      }
      try {
        this.audio = new Ctor();
        this.master = this.audio.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.audio.destination);
        this.noise = this.createNoiseBuffer(this.audio);
      } catch {
        this.enabled = false;
        return;
      }
    }
    if (this.audio.state === 'suspended') void this.audio.resume();
  }

  private createNoiseBuffer(audio: AudioContext): AudioBuffer {
    const length = Math.floor(audio.sampleRate * 0.5);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  private spatialGain(x?: number, y?: number): number {
    if (x === undefined || y === undefined) return 1;
    const d = Math.hypot(x - this.listenerX, y - this.listenerY);
    if (d >= MAX_AUDIBLE_DISTANCE) return 0;
    const t = 1 - d / MAX_AUDIBLE_DISTANCE;
    return t * t;
  }

  private pan(x?: number): number {
    if (x === undefined) return 0;
    return Math.max(-0.85, Math.min(0.85, (x - this.listenerX) / 900));
  }

  /** Rate-limits identical sounds so a firefight cannot stack 40 copies of one blast. */
  private throttled(key: string, minGapMs: number): boolean {
    const now = performance.now();
    const last = this.lastPlayedAt[key] ?? -9999;
    if (now - last < minGapMs) return true;
    this.lastPlayedAt[key] = now;
    return false;
  }

  play(key: string, x?: number, y?: number, volumeScale = 1): void {
    if (!this.enabled || !this.audio || !this.master) return;
    const spatial = this.spatialGain(x, y);
    if (spatial <= 0.01) return;
    const gain = spatial * volumeScale;
    if (this.throttled(key, key === 'impact' || key === 'hitmarker' ? 40 : 22)) return;

    switch (key) {
      case 'pistol':
      case 'smg':
      case 'rifle':
      case 'lmg':
      case 'shotgun':
      case 'sniper':
        this.gunshot(SHOTS[key] as ShotSpec, gain, this.pan(x));
        break;
      case 'melee':
        this.swish(gain, this.pan(x));
        break;
      case 'reload':
        this.click(0.05, 900, gain * 0.5, this.pan(x));
        this.click(0.05, 600, gain * 0.5, this.pan(x), 0.12);
        break;
      case 'empty':
        this.click(0.035, 1500, gain * 0.4, this.pan(x));
        break;
      case 'impact':
        this.tick(gain * 0.5, this.pan(x));
        break;
      case 'hitmarker':
        this.tone(1200, 0.06, gain * 0.28, 'square', 0);
        break;
      case 'playerHit':
        this.tone(150, 0.22, gain * 0.5, 'sawtooth', 0, 70);
        break;
      case 'pickup':
        this.tone(660, 0.09, gain * 0.3, 'triangle', 0, 980);
        break;
      case 'heal':
        this.tone(520, 0.28, gain * 0.28, 'sine', 0, 780);
        break;
      case 'zoneWarning':
        this.tone(220, 0.55, gain * 0.35, 'sawtooth', 0, 180);
        break;
      case 'zoneShrink':
        this.tone(130, 0.9, gain * 0.32, 'sawtooth', 0, 96);
        break;
      case 'death':
        this.tone(240, 0.5, gain * 0.4, 'sawtooth', 0, 70);
        break;
      case 'victory':
        this.tone(523, 0.28, gain * 0.35, 'triangle');
        this.tone(659, 0.3, gain * 0.32, 'triangle', 0.14);
        this.tone(784, 0.5, gain * 0.34, 'triangle', 0.28);
        break;
      case 'countdown':
        this.tone(880, 0.12, gain * 0.32, 'square');
        break;
      case 'signal':
        this.tone(392, 0.3, gain * 0.32, 'sine', 0, 784);
        this.tone(587, 0.4, gain * 0.26, 'triangle', 0.16);
        break;
      case 'signalTake':
        this.tone(523, 0.16, gain * 0.34, 'triangle', 0, 1046);
        this.tone(784, 0.22, gain * 0.28, 'sine', 0.1);
        break;
      case 'ping':
        this.tone(1320, 0.14, gain * 0.26, 'sine', 0, 990);
        this.tone(1320, 0.14, gain * 0.22, 'sine', 0.2, 990);
        break;
      case 'ability':
        this.tone(660, 0.22, gain * 0.3, 'sawtooth', 0, 1320);
        break;
      case 'wood':
        this.click(0.09, 420, gain * 0.5, this.pan(x));
        break;
      case 'break':
        this.click(0.16, 260, gain * 0.7, this.pan(x));
        this.tone(180, 0.24, gain * 0.3, 'sawtooth', 0.02, 70);
        break;
      case 'supply':
        this.tone(260, 0.7, gain * 0.3, 'sawtooth', 0, 140);
        break;
      case 'uiClick':
        this.tone(440, 0.06, gain * 0.28, 'square');
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ synths

  private now(): number {
    return (this.audio as AudioContext).currentTime;
  }

  private makePan(pan: number): StereoPannerNode | GainNode {
    const audio = this.audio as AudioContext;
    if (typeof audio.createStereoPanner === 'function') {
      const node = audio.createStereoPanner();
      node.pan.value = pan;
      return node;
    }
    return audio.createGain();
  }

  private gunshot(spec: ShotSpec, gain: number, pan: number): void {
    const audio = this.audio as AudioContext;
    const t0 = this.now();
    const panner = this.makePan(pan);
    panner.connect(this.master as GainNode);

    const src = audio.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(spec.lowpass, t0);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, spec.lowpass * 0.25), t0 + spec.duration);

    const env = audio.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, spec.gain * gain), t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration);

    src.connect(lp);
    lp.connect(env);
    env.connect(panner);
    src.start(t0);
    src.stop(t0 + spec.duration + 0.02);

    // Low-frequency body gives each weapon its weight.
    const osc = audio.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.bodyFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(spec.bodyFreq * 0.45, t0 + spec.decay);
    const oscEnv = audio.createGain();
    oscEnv.gain.setValueAtTime(0.0001, t0);
    oscEnv.gain.exponentialRampToValueAtTime(Math.max(0.0002, spec.bodyGain * gain), t0 + 0.006);
    oscEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.decay);
    osc.connect(oscEnv);
    oscEnv.connect(panner);
    osc.start(t0);
    osc.stop(t0 + spec.decay + 0.02);
  }

  private swish(gain: number, pan: number): void {
    const audio = this.audio as AudioContext;
    const t0 = this.now();
    const panner = this.makePan(pan);
    panner.connect(this.master as GainNode);
    const src = audio.createBufferSource();
    src.buffer = this.noise;
    const bp = audio.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, t0);
    bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.16);
    bp.Q.value = 2.5;
    const env = audio.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.35 * gain), t0 + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    src.connect(bp);
    bp.connect(env);
    env.connect(panner);
    src.start(t0);
    src.stop(t0 + 0.22);
  }

  private click(duration: number, freq: number, gain: number, pan: number, delay = 0): void {
    const audio = this.audio as AudioContext;
    const t0 = this.now() + delay;
    const panner = this.makePan(pan);
    panner.connect(this.master as GainNode);
    const src = audio.createBufferSource();
    src.buffer = this.noise;
    const hp = audio.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = freq;
    hp.Q.value = 4;
    const env = audio.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(hp);
    hp.connect(env);
    env.connect(panner);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  private tick(gain: number, pan: number): void {
    this.click(0.045, 2400, gain, pan);
  }

  private tone(
    freq: number,
    duration: number,
    gain: number,
    type: OscillatorType = 'sine',
    delay = 0,
    endFreq?: number,
  ): void {
    const audio = this.audio as AudioContext;
    const t0 = this.now() + delay;
    const osc = audio.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    }
    const env = audio.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(this.master as GainNode);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}
