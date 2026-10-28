'use strict';
// ───────── 효과음 ─────────
// Flare 효과음(assets/flare/sounds.js, MP3 base64)을 쓰고,
// 아직 불러오지 못한 소리는 WebAudio로 즉석 합성한 소리로 대신한다.

// 게임 안 소리 이름 → Flare 효과음 키 목록(무작위 선택)과 음량
const SAMPLE_MAP = {
  swing: { keys: ['swing1', 'swing2', 'swing3'], vol: 0.5 },
  whirl: { keys: ['swing1', 'swing2', 'swing3'], vol: 0.45, rate: [1.1, 1.3] },
  throw: { keys: ['swing2', 'swing3'], vol: 0.45, rate: [1.2, 1.35] },
  hurt: { keys: ['male_hit'], vol: 0.55 },
  pdie: { keys: ['male_die'], vol: 0.8 },
  warcry: { keys: ['warcry'], vol: 0.85 },
  berserk: { keys: ['shield'], vol: 0.7 },
  boom: { keys: ['quake'], vol: 0.8 },
  spikes: { keys: ['spikes'], vol: 0.75 },
  fire: { keys: ['fireball'], vol: 0.45 },
  burn: { keys: ['burn'], vol: 0.6 },
  zap: { keys: ['shock', 'thunder'], vol: 0.55 },
  arrow: { keys: ['shoot'], vol: 0.4 },
  arrowWall: { keys: ['arrow_wall'], vol: 0.35 },
  freeze: { keys: ['freeze'], vol: 0.55 },
  potion: { keys: ['potion'], vol: 0.7 },
  levelup: { keys: ['level_up'], vol: 0.8 },
  nope: { keys: ['no_mana'], vol: 0.45 },
  gold: { keys: ['coins'], vol: 0.5 },
  pickup: { keys: ['inv_object'], vol: 0.6 },
  buyPotion: { keys: ['inv_potion'], vol: 0.6 },
  chest: { keys: ['wood_open'], vol: 0.7 },
  stairs: { keys: ['stairs'], vol: 0.8 },
  rare: { keys: ['flying_loot'], vol: 0.6 },
  step: { keys: ['step1', 'step2', 'step3', 'step4'], vol: 0.16, rate: [0.9, 1.05] },
  heartbeat: { keys: ['heartbeat'], vol: 0.55 },
};
// 몬스터 그림 → 효과음 이름 앞부분
const MONSTER_SOUND = {
  zombie: 'zombie', skeleton: 'skeleton', skeleton_archer: 'skeleton', skeleton_mage: 'skeleton',
  goblin: 'goblin', antlion: 'antlion', minotaur: 'minotaur', wyvern_fire: 'wyvern',
};

const SFX = {
  ctx: null, master: null, noise: null, muted: false, last: {}, drone: null,
  buffers: {}, samplesState: 'none', ambient: null, ambientKey: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.loadSamples();
    } catch (e) { this.ctx = null; }
  },

  // 효과음 묶음을 스크립트로 불러와 해독 (파일로 직접 열어도 동작)
  loadSamples() {
    if (this.samplesState !== 'none' || !this.ctx) return;
    this.samplesState = 'loading';
    const decodeAll = () => {
      const data = window.FLARE_SOUNDS || {};
      const keys = Object.keys(data);
      let left = keys.length;
      const done = () => { if (--left <= 0) { this.samplesState = 'ready'; this.refreshAmbient(); } };
      if (!left) { this.samplesState = 'failed'; return; }
      for (const k of keys) {
        try {
          const bin = atob(data[k]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const ok = buf => { this.buffers[k] = buf; done(); };
          const p = this.ctx.decodeAudioData(bytes.buffer, ok, () => done());
          if (p && p.catch) p.catch(() => {});
        } catch (e) { done(); }
      }
      window.FLARE_SOUNDS = null;  // 해독 뒤 원본 문자열은 버림
    };
    if (window.FLARE_SOUNDS) { decodeAll(); return; }
    const s = document.createElement('script');
    s.src = 'assets/flare/sounds.js';
    s.onload = decodeAll;
    s.onerror = () => { this.samplesState = 'failed'; };
    document.head.appendChild(s);
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  },

  sample(key, vol = 1, rate = 1) {
    const buf = this.buffers[key];
    if (!buf || !this.ctx) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g); g.connect(this.master);
    s.start();
    return true;
  },

  // 같은 소리가 너무 촘촘히 겹치지 않게
  gate(name, gap) {
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  },

  // vol: 거리 등에 따른 음량 배율
  play(name, vol = 1) {
    if (!this.ctx || this.muted) return;
    const m = SAMPLE_MAP[name];
    if (!this.gate(name, name === 'hurt' ? 0.25 : name === 'step' ? 0.1 : 0.04)) return;
    if (m) {
      const key = pick(m.keys);
      const rate = m.rate ? rand(m.rate[0], m.rate[1]) : rand(0.96, 1.04);
      if (this.sample(key, m.vol * vol, rate)) {
        if (name === 'levelup') this.synth('levelup', 0.4);
        return;
      }
    }
    if (name === 'step' || name === 'heartbeat') return;  // 합성음으로는 내지 않음
    this.synth(name, vol);
  },

  // 몬스터 소리: kind = hit | die | critdie | phys | ment
  monster(m, kind, vol = 1) {
    if (!this.ctx || this.muted) return;
    const base = MONSTER_SOUND[m.sprite];
    let key = base && `${base}_${kind}`;
    if (key && !this.buffers[key] && kind === 'critdie') key = `${base}_die`;
    const gap = kind === 'hit' ? 0.18 : kind === 'ment' ? 1.2 : 0.06;
    if (!this.gate('m:' + key, gap)) return;
    const pv = player ? clamp(1 - dist(m.x, m.y, player.x, player.y) / 1100, 0.15, 1) : 1;
    const big = m.tier === 3 ? 0.8 : 1;  // 보스는 낮은 목소리
    if (key && this.sample(key, (kind === 'hit' ? 0.45 : 0.6) * pv * vol, rand(0.92, 1.06) * big)) return;
    if (kind === 'die' || kind === 'critdie') this.synth(base === 'skeleton' ? 'bones' : 'die', pv);
  },

  // 장비 종류에 맞는 착용 소리
  equip(item) {
    if (!this.ctx || this.muted || !item) return;
    let key = 'inv_metal';
    if (item.slot === 'ring' || item.slot === 'amulet') key = 'inv_gem';
    else if (item.slot === 'belt') key = 'inv_leather';
    else if (item.slot !== 'weapon') key = ['inv_leather', 'inv_maille', 'inv_heavy', 'inv_heavy'][item.look || 0];
    if (!this.sample(key, 0.6)) this.synth('equip', 1);
  },

  // ── 배경음: 던전은 물방울, 동굴은 바람 ──
  setAmbient(themeTiles) {
    this.ambientKey = themeTiles === 'cave' ? 'amb_wind' : 'amb_drops';
    this.refreshAmbient();
  },
  refreshAmbient() {
    if (!this.ctx || !this.ambientKey) return;
    const buf = this.buffers[this.ambientKey];
    if (!buf) { this.startDrone(); return; }
    if (this.ambient && this.ambient.key === this.ambientKey) return;
    if (this.ambient) { try { this.ambient.src.stop(); } catch (e) { /* 무시 */ } }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.28;
    src.connect(g); g.connect(this.master);
    src.start();
    this.ambient = { src, key: this.ambientKey };
    if (this.drone) { this.drone.g.gain.value = 0.012; }
  },

  // ── 합성음 (대체용) ──
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

  synth(name, v = 1) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'swing': case 'whirl': this.burst(0.16, 0.25 * v, 'bandpass', 1400, 350, 2); break;
      case 'hit': this.tone('sine', 140, 50, 0.13, 0.3 * v); this.burst(0.08, 0.25 * v, 'lowpass', 1600, 300); break;
      case 'crit': this.tone('sine', 160, 45, 0.18, 0.4 * v); this.burst(0.1, 0.3 * v, 'lowpass', 2600, 400); this.tone('triangle', 1400, 900, 0.12, 0.08 * v); break;
      case 'hurt': this.tone('sawtooth', 170, 80, 0.16, 0.12 * v); this.burst(0.08, 0.2 * v, 'lowpass', 900, 200); break;
      case 'die': case 'pdie': this.burst(0.35, 0.25 * v, 'lowpass', 900, 120); this.tone('sawtooth', 110, 40, 0.3, 0.06 * v); break;
      case 'bones': for (let i = 0; i < 4; i++) this.tone('square', rand(500, 900), 300, 0.05, 0.04 * v, i * 0.05); break;
      case 'pickup': this.tone('triangle', 700, 1000, 0.08, 0.15); break;
      case 'gold': this.tone('triangle', 1500, 1500, 0.06, 0.1); this.tone('triangle', 2000, 2000, 0.08, 0.08, 0.06); break;
      case 'rare': [660, 880, 1100].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.12, i * 0.07)); break;
      case 'unique': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.35, 0.14, i * 0.08)); this.burst(0.8, 0.05, 'highpass', 4000, 6000); break;
      case 'levelup': [392, 523, 659, 784].forEach((f, i) => this.tone('square', f, f, 0.22, 0.08 * v, i * 0.09)); this.tone('triangle', 1046, 1046, 0.6, 0.12 * v, 0.36); break;
      case 'warcry': case 'berserk': this.tone('sawtooth', 140, 70, 0.6, 0.18); this.tone('sawtooth', 105, 60, 0.6, 0.12); this.burst(0.5, 0.2, 'lowpass', 700, 150); break;
      case 'boom': case 'spikes': this.tone('sine', 90, 30, 0.45, 0.5); this.burst(0.4, 0.35, 'lowpass', 600, 60); break;
      case 'throw': this.burst(0.12, 0.15, 'bandpass', 2000, 800, 4); break;
      case 'potion': case 'buyPotion': for (let i = 0; i < 3; i++) this.tone('sine', 300 + i * 120, 600 + i * 120, 0.08, 0.12, i * 0.07); break;
      case 'fire': case 'burn': this.burst(0.35, 0.25, 'lowpass', 1800, 200); break;
      case 'zap': this.burst(0.18, 0.25, 'highpass', 3000, 1200); this.tone('square', 1800, 200, 0.12, 0.05); break;
      case 'arrow': case 'arrowWall': this.burst(0.08, 0.1, 'highpass', 3000, 2000); break;
      case 'freeze': this.burst(0.25, 0.15, 'highpass', 4000, 2000); break;
      case 'chest': this.tone('square', 220, 160, 0.15, 0.08); this.burst(0.2, 0.15, 'lowpass', 800, 200); break;
      case 'equip': this.burst(0.06, 0.2, 'bandpass', 2400, 1800, 6); this.tone('triangle', 900, 700, 0.06, 0.06); break;
      case 'stairs': this.tone('sine', 220, 55, 1.0, 0.25); this.burst(0.9, 0.1, 'lowpass', 500, 80); break;
      case 'nope': this.tone('square', 180, 150, 0.08, 0.05); break;
    }
  },

  // 낮게 깔리는 합성 앰비언스 (효과음 묶음이 없을 때)
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
    this.drone = { o1, o2, lfo, g };
  },
};
