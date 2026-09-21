/**
 * Every sound effect is synthesised with the Web Audio API — no asset files,
 * so the whole game stays a single self-contained bundle.
 */

type Cue =
  | 'click' | 'tick' | 'drop' | 'land' | 'arm'
  | 'blast-small' | 'blast-big' | 'chain' | 'coin'
  | 'scatter' | 'crate' | 'lock' | 'jackpot' | 'win' | 'bigwin' | 'lose';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  get muted(): boolean { return !this.enabled; }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  /** Browsers require a user gesture before audio can start. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(this.ctx.destination);
  }

  private env(gain: GainNode, at: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    delay = 0,
    slideTo?: number,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const at = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + duration);
    this.env(gain, at, peak, Math.min(0.02, duration * 0.2), duration);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.06);
  }

  /** Filtered noise burst — the backbone of every explosion. */
  private noise(duration: number, peak: number, cutoff: number, delay = 0, sweepTo?: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const at = this.ctx.currentTime + delay;
    const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 1.4;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, at);
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + duration);
    const gain = this.ctx.createGain();
    this.env(gain, at, peak, 0.005, duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at);
  }

  play(cue: Cue, intensity = 1): void {
    if (!this.enabled) return;
    this.unlock();
    switch (cue) {
      case 'click': this.tone(520, 0.05, 'triangle', 0.22); break;
      case 'tick': this.tone(880, 0.03, 'square', 0.1); break;
      case 'drop': this.noise(0.08, 0.1, 1800); break;
      case 'land': this.tone(180, 0.1, 'sine', 0.2, 0, 90); this.noise(0.07, 0.12, 900); break;
      case 'arm':
        this.tone(1200, 0.05, 'square', 0.1);
        this.tone(1500, 0.05, 'square', 0.08, 0.09);
        this.noise(0.25, 0.05, 5000, 0, 1200);
        break;
      case 'blast-small':
        this.noise(0.34, 0.5 * intensity, 2400, 0, 180);
        this.tone(110, 0.28, 'sine', 0.42 * intensity, 0, 38);
        break;
      case 'blast-big':
        this.noise(0.62, 0.72 * intensity, 3200, 0, 120);
        this.tone(78, 0.5, 'sine', 0.6 * intensity, 0, 26);
        this.tone(150, 0.2, 'sawtooth', 0.22 * intensity, 0.02, 50);
        break;
      case 'chain': {
        const step = Math.min(7, Math.round(intensity));
        for (let i = 0; i < 3; i++) {
          this.tone(440 * 1.26 ** (step + i), 0.11, 'triangle', 0.24, i * 0.055);
        }
        break;
      }
      case 'coin':
        this.tone(1320, 0.06, 'triangle', 0.16);
        this.tone(1980, 0.05, 'sine', 0.1, 0.03);
        break;
      case 'scatter':
        this.noise(0.5, 0.18, 6000, 0, 800);
        this.tone(660, 0.3, 'sine', 0.2, 0, 1320);
        break;
      case 'crate':
        this.tone(220, 0.16, 'square', 0.22, 0, 160);
        this.noise(0.2, 0.2, 1400);
        break;
      case 'lock':
        this.tone(320, 0.09, 'square', 0.2, 0, 480);
        this.tone(640, 0.07, 'triangle', 0.14, 0.05);
        break;
      case 'jackpot':
        for (let i = 0; i < 8; i++) {
          this.tone(523.25 * 1.2 ** i, 0.3, 'triangle', 0.22, i * 0.075);
        }
        break;
      case 'win':
        [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.2, i * 0.07));
        break;
      case 'bigwin':
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
          this.tone(f, 0.42, 'triangle', 0.24, i * 0.09));
        this.noise(0.8, 0.14, 7000, 0, 1500);
        break;
      case 'lose': this.tone(180, 0.14, 'sine', 0.1, 0, 120); break;
    }
  }
}

export const sound = new SoundEngine();
