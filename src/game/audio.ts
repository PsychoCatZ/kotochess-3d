// Процедурные звуковые эффекты через WebAudio — без внешних ассетов.
export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.6;
  private lastMeow = 0;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, slideTo?: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private meow() {
    // умеренно: не чаще одного раза в 2.5 секунды
    const now = performance.now();
    if (now - this.lastMeow < 2500) return;
    this.lastMeow = now;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t0);
    osc.frequency.linearRampToValueAtTime(760, t0 + 0.12);
    osc.frequency.linearRampToValueAtTime(340, t0 + 0.38);
    vib.frequency.value = 7;
    vibGain.gain.value = 18;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    osc.start(t0);
    vib.start(t0);
    osc.stop(t0 + 0.45);
    vib.stop(t0 + 0.45);
  }

  select() { this.tone(660, 0.08, 'triangle', 0.12, 880); }
  move() { this.tone(180, 0.12, 'sine', 0.25, 90); }
  capture() { this.tone(140, 0.18, 'square', 0.15, 70); this.meow(); }
  check() { this.tone(520, 0.12, 'triangle', 0.15, 780); this.tone(780, 0.16, 'triangle', 0.15, 1040, 0.12); }
  castle() { this.tone(220, 0.1, 'sine', 0.2, 160); this.tone(330, 0.1, 'sine', 0.18, 220, 0.09); }
  promote() { [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.14, undefined, i * 0.07)); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, undefined, i * 0.12)); this.meow(); }
  draw() { this.tone(392, 0.25, 'sine', 0.15); this.tone(330, 0.35, 'sine', 0.15, undefined, 0.2); }
}
