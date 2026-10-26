'use strict';
// ───────── 효과음 (WebAudio로 즉석 합성, 음원 파일 없음) ─────────

const SFX = {
  ctx: null, master: null, noise: null, muted: false, last: {}, drone: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.45;
    return this.muted;
  },

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },

  burst(dur, vol, type, f0, f1, q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.04) return;
    this.last[name] = now;
    switch (name) {
      case 'swing': this.burst(0.16, 0.25, 'bandpass', 1400, 350, 2); break;
      case 'hit': this.tone('sine', 140, 50, 0.13, 0.35); this.burst(0.08, 0.3, 'lowpass', 1600, 300); break;
      case 'crit': this.tone('sine', 160, 45, 0.18, 0.45); this.burst(0.1, 0.35, 'lowpass', 2600, 400); this.tone('triangle', 1400, 900, 0.12, 0.08); break;
      case 'hurt': this.tone('sawtooth', 170, 80, 0.16, 0.12); this.burst(0.08, 0.2, 'lowpass', 900, 200); break;
      case 'die': this.burst(0.35, 0.25, 'lowpass', 900, 120); this.tone('sawtooth', 110, 40, 0.3, 0.06); break;
      case 'bones': for (let i = 0; i < 4; i++) this.tone('square', rand(500, 900), 300, 0.05, 0.04, i * 0.05); break;
      case 'pickup': this.tone('triangle', 700, 1000, 0.08, 0.15); break;
      case 'gold': this.tone('triangle', 1500, 1500, 0.06, 0.1); this.tone('triangle', 2000, 2000, 0.08, 0.08, 0.06); break;
      case 'rare': [660, 880, 1100].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.12, i * 0.07)); break;
      case 'unique': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.35, 0.14, i * 0.08)); this.burst(0.8, 0.05, 'highpass', 4000, 6000); break;
      case 'levelup': [392, 523, 659, 784].forEach((f, i) => this.tone('square', f, f, 0.22, 0.08, i * 0.09)); this.tone('triangle', 1046, 1046, 0.6, 0.12, 0.36); break;
      case 'warcry': this.tone('sawtooth', 140, 70, 0.6, 0.18); this.tone('sawtooth', 105, 60, 0.6, 0.12); this.burst(0.5, 0.2, 'lowpass', 700, 150); break;
      case 'boom': this.tone('sine', 90, 30, 0.45, 0.5); this.burst(0.4, 0.35, 'lowpass', 600, 60); break;
      case 'whirl': this.burst(0.2, 0.18, 'bandpass', 600, 1600, 3); break;
      case 'throw': this.burst(0.12, 0.15, 'bandpass', 2000, 800, 4); break;
      case 'potion': for (let i = 0; i < 3; i++) this.tone('sine', 300 + i * 120, 600 + i * 120, 0.08, 0.12, i * 0.07); break;
      case 'fire': this.burst(0.35, 0.25, 'lowpass', 1800, 200); break;
      case 'zap': this.burst(0.18, 0.25, 'highpass', 3000, 1200); this.tone('square', 1800, 200, 0.12, 0.05); break;
      case 'arrow': this.burst(0.08, 0.1, 'highpass', 3000, 2000); break;
      case 'chest': this.tone('square', 220, 160, 0.15, 0.08); this.burst(0.2, 0.15, 'lowpass', 800, 200); break;
      case 'equip': this.burst(0.06, 0.2, 'bandpass', 2400, 1800, 6); this.tone('triangle', 900, 700, 0.06, 0.06); break;
      case 'stairs': this.tone('sine', 220, 55, 1.0, 0.25); this.burst(0.9, 0.1, 'lowpass', 500, 80); break;
      case 'nope': this.tone('square', 180, 150, 0.08, 0.05); break;
    }
  },

  // 낮게 깔리는 던전 앰비언스
  startDrone() {
    if (!this.ctx || this.drone) return;
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.035;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 55; o2.frequency.value = 55.6;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 90;
    lfo.connect(lg); lg.connect(f.frequency);
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o1.start(); o2.start(); lfo.start();
    this.drone = { o1, o2, lfo };
  },
};
