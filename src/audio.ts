// Web Audio synthesized sound effects.
export class SoundFX {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const len = this.ctx.sampleRate * 1.2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.enabled = false;
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filt).connect(g).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'square', slide = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  break_() { this.noise(0.16, 0.32, 900, 0.8); this.tone(180, 0.1, 0.12, 'triangle', -80); }
  place() { this.tone(320, 0.09, 0.22, 'square', -60); this.noise(0.06, 0.12, 1400, 1); }
  jump() { this.tone(300, 0.12, 0.1, 'sine', 140); }
  step() { this.noise(0.07, 0.07, 500, 0.7); }
  splash() { this.noise(0.3, 0.2, 700, 0.4, 'lowpass'); }
  explode() {
    this.noise(0.9, 0.9, 180, 0.3, 'lowpass');
    this.tone(70, 0.7, 0.5, 'sawtooth', -40);
    this.tone(45, 0.9, 0.4, 'sine', -15);
  }
  fuse() { this.noise(0.3, 0.15, 3000, 0.5, 'highpass'); }
  click() { this.tone(600, 0.05, 0.12, 'square'); }
}
