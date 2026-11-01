'use strict';
// ───────── 그래픽 품질과 화면 효과 ─────────
// 품질 0 낮음 · 1 보통 · 2 높음. '자동'은 실제 프레임 간격을 재서 렉이 생기면 한 단계 내리고,
// 오래 여유가 있으면 다시 올림. 효과는 모두 미리 그려 둔 작은 그림을 늘려 쓰는 방식이라 가벼움.

const GFX_NAMES = ['낮음', '보통', '높음'];
// dpr: 화면 해상도 상한, light: 빛 지도 해상도, shadows: 0 발밑 그림자 · 1 빛 반대로 늘어지는 그림자 · 2 실루엣 그림자,
// atmo: 떠다니는 입자 수, decals: 바닥 자국 최대 수
const GFX_LEVELS = [
  { dpr: 1, light: 0.35, shadows: 0, atmo: 0, vignette: false, bloom: false, fog: false, clouds: false, decals: 120 },
  { dpr: 1.25, light: 0.45, shadows: 1, atmo: 50, vignette: true, bloom: false, fog: false, clouds: true, decals: 200 },
  { dpr: 1.5, light: 0.5, shadows: 2, atmo: 110, vignette: true, bloom: true, fog: true, clouds: true, decals: 260 },
];

const GFX = {
  mode: 'auto', level: 2, q: GFX_LEVELS[2],
  // 자동 조절 상태
  acc: 0, n: 0, base: 16.7, bad: 0, good: 0, failAt: [-1e9, -1e9, -1e9],

  init(mode) {
    this.mode = mode === 0 || mode === 1 || mode === 2 ? mode : 'auto';
    // 자동은 휴대 기기에서 '보통', 컴퓨터에서 '높음'으로 시작
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.apply(this.mode === 'auto' ? (touch ? 1 : 2) : this.mode, true);
  },
  // 메뉴 버튼: 자동 → 높음 → 보통 → 낮음 → 자동
  cycle() {
    const order = ['auto', 2, 1, 0];
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
    this.bad = this.good = 0; this.acc = this.n = 0; this.failAt = [-1e9, -1e9, -1e9];
    this.apply(this.mode === 'auto' ? this.level : this.mode);
    return this.mode;
  },
  label() { return this.mode === 'auto' ? `자동 (${GFX_NAMES[this.level]})` : GFX_NAMES[this.mode]; },
  apply(level, quiet) {
    this.level = level;
    this.q = GFX_LEVELS[level];
    R.vignette = null;
    if (!quiet && R.canvas) resizeRender();
    if (typeof Atmo !== 'undefined') Atmo.parts.length = Math.min(Atmo.parts.length, this.q.atmo);
  },

  // 매 프레임: 실제 프레임 간격(ms). busy면 (불러오는 중, 탭 숨김) 재지 않음
  tick(ms, busy) {
    if (this.mode !== 'auto') return;
    if (busy || ms > 150) { this.acc = this.n = 0; return; }
    // 화면 주사율 추정: 가장 짧은 간격 (천천히 늘어나 주사율이 바뀌어도 따라감)
    this.base = Math.min(ms, this.base + 0.003);
    this.acc += ms; this.n++;
    if (this.acc < 2000) return;
    const avg = this.acc / this.n, now = performance.now();
    this.acc = this.n = 0;
    if (avg > Math.max(this.base * 1.3, 19)) {
      this.good = 0;
      if (++this.bad >= 2 && this.level > 0) { this.failAt[this.level] = now; this.bad = 0; this.apply(this.level - 1); UI.syncMenu(); }
    } else {
      this.bad = 0;
      this.good = avg < this.base * 1.1 + 0.6 ? this.good + 1 : 0;
      // 12초 넘게 여유가 있으면 한 단계 올림. 한 번 버거웠던 단계는 1분 반 동안 다시 시도하지 않음 (오르락내리락 방지)
      if (this.good >= 6 && this.level < 2 && now - this.failAt[this.level + 1] > 90000) {
        this.good = 0; this.apply(this.level + 1); UI.syncMenu();
      }
    }
  },
};

// ── 미리 그려 두는 작은 그림들 ──
const GfxTex = {
  cache: new Map(),
  get(key, w, h, draw) {
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    this.cache.set(key, c);
    return c;
  },
  // 빛: 가운데가 밝고 가장자리로 사라짐 (globalAlpha로 세기 조절)
  light(c, flat) {
    return this.get(`light${c}${flat ? 'f' : ''}`, 128, 128, (x, w) => {
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      const col = a => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      g.addColorStop(0, col(1));
      if (flat) { g.addColorStop(0.6, col(1)); g.addColorStop(0.82, col(0.4)); } else g.addColorStop(0.45, col(0.62));
      g.addColorStop(1, col(0));
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
  },
  // 부드러운 검은 원 (그림자)
  blob() {
    return this.get('blob', 64, 64, (x, w) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
  },
  // 빛나는 점 (입자)
  dot(c) {
    return this.get(`dot${c}`, 16, 16, (x, w) => {
      const g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},1)`); g.addColorStop(0.35, `rgba(${c[0]},${c[1]},${c[2]},.7)`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
  },
  // 정예 몬스터 발밑의 빛
  glow(col) {
    return this.get(`glow${col}`, 64, 32, (x, w, h) => {
      x.scale(1, 0.5);
      const g = x.createRadialGradient(32, 32, 1, 32, 32, 32);
      g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
  },
  // 구름 그림자 (빛 지도에 곱함: 가운데 어둡고 가장자리는 흰색 = 변화 없음)
  cloud() {
    return this.get('cloud', 128, 128, (x, w) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, w);
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgb(150,150,165)'); g.addColorStop(0.6, 'rgb(200,200,210)'); g.addColorStop(1, 'rgb(255,255,255)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
    });
  },
  // 안개: 이어 붙여도 이음새가 없는 흐릿한 덩어리 무늬
  fog(c) {
    return this.get(`fog${c}`, 256, 256, (x, w) => {
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) {
        const cx = rnd() * w, cy = rnd() * w, r = 30 + rnd() * 60, a = 0.25 + rnd() * 0.35;
        for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) {
          const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
          g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
          x.fillStyle = g; x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
        }
      }
    });
  },
  // 바닥 자국: 핏자국(색별 변형 6개), 균열(4개), 그을음
  splat(color, v) {
    return this.get(`splat${color}${v}`, 96, 48, (x) => {
      let seed = 11 + v * 97;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      x.translate(48, 24); x.scale(1, 0.5);
      x.fillStyle = color;
      for (let i = 0; i < 7; i++) {
        const a = rnd() * TAU, d = rnd() * 16, r = 5 + rnd() * 10;
        x.beginPath(); x.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU); x.fill();
      }
      // 튄 방울
      for (let i = 0; i < 9; i++) {
        const a = rnd() * TAU, d = 22 + rnd() * 18, r = 1 + rnd() * 2.6;
        x.beginPath(); x.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU); x.fill();
      }
    });
  },
  crack(v) {
    return this.get(`crack${v}`, 96, 48, (x) => {
      let seed = 5 + v * 131;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      x.translate(48, 24); x.scale(1, 0.5);
      x.strokeStyle = 'rgba(8,5,3,.85)'; x.lineCap = 'round';
      const branches = 4 + Math.floor(rnd() * 3);
      for (let b = 0; b < branches; b++) {
        let a = (b / branches) * TAU + (rnd() - 0.5) * 0.8, px = 0, py = 0, len = 12 + rnd() * 8;
        for (let s = 0; s < 3; s++) {
          a += (rnd() - 0.5);
          const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len;
          x.lineWidth = 3.2 - s * 0.9;
          x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
          px = nx; py = ny; len *= 0.72;
        }
      }
    });
  },
  scorch() {
    return this.get('scorch', 96, 48, (x) => {
      const g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
      g.addColorStop(0, 'rgba(10,6,4,.85)'); g.addColorStop(0.6, 'rgba(10,6,4,.45)'); g.addColorStop(1, 'rgba(10,6,4,0)');
      x.scale(1, 0.5); x.fillStyle = g; x.fillRect(0, 0, 96, 96);
    });
  },
};

// ── 실루엣 그림자: 그림을 절반 크기의 검은 실루엣으로 한 번 만들어 둠 (반 해상도라 가장자리가 부드러움) ──
const ShadowAtlas = {
  map: new WeakMap(), queue: [], scratch: null,
  get(img) {
    if (!img) return null;
    const c = this.map.get(img);
    if (c) return c;
    if (!this.queue.includes(img)) this.queue.push(img);
    return null;
  },
  make(img) {
    if (this.map.has(img)) return this.map.get(img);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w / 2); c.height = Math.ceil(h / 2);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    warmCanvas(c);
    this.map.set(img, c);
    return c;
  },
  // 한 프레임에 하나씩 만들기 (한꺼번에 만들어 멈칫하지 않게)
  step() { const img = this.queue.shift(); if (img) this.make(img); },
};
// 새로 만든 캔버스를 한 번 그려서 그래픽 메모리에 올려 둠 (처음 화면에 그릴 때 멈칫하지 않게)
function warmCanvas(c) {
  const w = warmCanvas.c || (warmCanvas.c = document.createElement('canvas'));
  w.width = w.height = 2;
  try { w.getContext('2d').drawImage(c, 0, 0, 2, 2); } catch (e) { /* 무시 */ }
}

// 그림자가 늘어질 방향: 바깥은 하늘빛 방향, 지하는 주인공이 든 빛의 반대쪽
const SUN_CAST = { dx: 0.8, dy: 0.6, len: 0.55, a: 0.34 };
function shadowCast(x, y, isPlayer) {
  const d = world.dungeon;
  if (d.outdoor) return SUN_CAST;
  const f = R.focus || player;
  let lx = f.x, ly = f.y, range = 650;
  if (isPlayer) {
    // 주인공: 가까운 횃불·모닥불이 있으면 그 반대쪽으로
    let best = null, bd = 380;
    for (const tc of d.torches) { if (!tc.kind) continue; const dd = dist(tc.lx, tc.ly, x, y); if (dd < bd) { bd = dd; best = tc; } }
    for (const L of d.lights) { const dd = dist(L.x, L.y, x, y); if (dd < bd) { bd = dd; best = { lx: L.x, ly: L.y }; } }
    if (!best) return null;
    lx = best.lx; ly = best.ly; range = 380;
  }
  const sx = isoX(x, y) - isoX(lx, ly), sy = isoY(x, y) - isoY(lx, ly);
  const dd = Math.hypot(sx, sy);
  if (dd < 18 || dd > range) return null;
  let dx = sx / dd, dy = sy / dd;
  // 옆으로 눕는 그림자는 납작해지므로 위아래 성분을 조금 남김
  if (Math.abs(dy) < 0.4) { dy = (dy < 0 ? -1 : 1) * 0.4; const n = Math.hypot(dx, dy); dx /= n; dy /= n; }
  return { dx, dy, len: clamp(0.3 + dd / 520, 0.3, 1), a: 0.42 * (1 - dd / range) };
}

// 발밑 그림자 (+ 보통 품질부터는 빛 반대쪽으로 늘어진 그림자)
function drawBlobShadow(ctx, sx, sy, r, cast, alpha = 1) {
  const img = GfxTex.blob();
  ctx.globalAlpha = 0.42 * alpha;
  ctx.drawImage(img, sx - r * 1.25, sy - r * 0.55, r * 2.5, r * 1.1);
  if (cast && GFX.q.shadows === 1) {
    const L = r * (1.6 + cast.len * 2.4);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(cast.dy, cast.dx));
    ctx.globalAlpha = cast.a * 0.9 * alpha;
    ctx.drawImage(img, -r * 0.3, -r * 0.55, L, r * 1.1);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// 실루엣 그림자: 같은 그림의 검은 실루엣을 바닥에 눕혀서 그림
function castMatrix(ctx, sx, sy, cast) {
  ctx.translate(sx, sy);
  ctx.transform(1, 0, -cast.dx * cast.len, -cast.dy * cast.len, 0, 0);
}
function drawSpriteShadow(ctx, set, animName, dir, idx, sx, sy, scale, cast, alpha = 1) {
  const anim = set.anims[animName] || set.anims.stance;
  if (!anim) return;
  const row = anim.f[dir] && anim.f[dir][0] ? anim.f[dir] : anim.f[0];
  const fr = row && row[idx];
  const simg = fr && ShadowAtlas.get(Assets.get(set.img));
  if (!simg) return;
  const k = (2 / 3) / (set.scale || FLARE.scale) * scale;
  ctx.save();
  castMatrix(ctx, sx, sy, cast);
  ctx.globalAlpha = cast.a * alpha;
  ctx.drawImage(simg, fr[0] / 2, fr[1] / 2, fr[2] / 2, fr[3] / 2, -fr[4] * k, -fr[5] * k, fr[2] * k, fr[3] * k);
  ctx.restore();
}
// 주인공은 장비 그림이 여러 겹이라, 작은 캔버스에 실루엣을 겹쳐 그린 뒤 한 번에 눕힘 (겹친 곳만 진해지지 않게)
function drawHeroShadow(ctx, p, t, sx, sy, cast) {
  const S = ShadowAtlas.scratch || (ShadowAtlas.scratch = document.createElement('canvas'));
  if (S.width !== 320) { S.width = 320; S.height = 320; }
  const x = S.getContext('2d');
  x.clearRect(0, 0, 320, 320);
  const layers = heroLayers(p), [anim, idx, dir] = heroPose(p, t);
  let any = false;
  for (const slot of HERO_LAYER_ORDER[dir]) {
    let name = layers[slot];
    if (name && !Assets.ready(FLARE.hero[name].img)) name = HERO_FALLBACK[slot];
    if (!name) continue;
    const set = FLARE.hero[name], A = set.anims[anim] || set.anims.stance;
    const row = A && (A.f[dir] && A.f[dir][0] ? A.f[dir] : A.f[0]), fr = row && row[idx];
    const simg = fr && ShadowAtlas.get(Assets.get(set.img));
    if (!simg) continue;
    const k = (2 / 3) / (set.scale || FLARE.scale);
    x.drawImage(simg, fr[0] / 2, fr[1] / 2, fr[2] / 2, fr[3] / 2, 160 - fr[4] * k, 260 - fr[5] * k, fr[2] * k, fr[3] * k);
    any = true;
  }
  if (!any) return;
  ctx.save();
  castMatrix(ctx, sx, sy, cast);
  ctx.globalAlpha = cast.a;
  ctx.drawImage(S, -160, -260);
  ctx.restore();
}

// ── 떠다니는 입자 (테마별 먼지 · 불씨 · 눈 · 포자 · 재 · 반딧불이) ──
// fall: 아래로 떨어짐(눈·재), rise: 위로 오름(불씨), add: 빛나는 입자(어둠 위에 더함)
const ATMO_KINDS = {
  dust: { c: [255, 228, 190], size: [0.8, 1.8], a: 0.55, vz: [-3, 3], drift: 7, z: [10, 140], k: 1 },
  embers: { c: [255, 140, 50], size: [0.8, 2], a: 0.9, vz: [18, 45], drift: 16, z: [0, 220], add: true, rise: true, k: 0.8 },
  snow: { c: [240, 245, 255], size: [1.2, 2.6], a: 0.95, vz: [-38, -22], drift: 22, z: [0, 300], fall: true, k: 1.3 },
  frost: { c: [180, 215, 255], size: [0.8, 1.8], a: 0.8, vz: [-6, 6], drift: 9, z: [10, 160], add: true, k: 0.8 },
  spores: { c: [190, 235, 100], size: [1, 2.2], a: 0.75, vz: [-5, 8], drift: 10, z: [10, 170], add: true, k: 0.6 },
  ash: { c: [160, 155, 150], size: [1, 2.2], a: 0.8, vz: [-20, -10], drift: 18, z: [0, 280], fall: true, k: 1 },
  bloodash: { c: [150, 45, 35], size: [1, 2.2], a: 0.8, vz: [-18, -9], drift: 18, z: [0, 280], fall: true, k: 1 },
  fireflies: { c: [215, 255, 120], size: [1.2, 2.2], a: 1, vz: [-8, 8], drift: 22, z: [15, 120], add: true, blink: true, k: 0.35 },
  wisps: { c: [150, 175, 255], size: [1.2, 2.4], a: 1, vz: [-8, 8], drift: 20, z: [15, 140], add: true, blink: true, k: 0.4 },
  spirit: { c: [200, 150, 255], size: [0.8, 2], a: 0.85, vz: [4, 16], drift: 10, z: [0, 200], add: true, rise: true, k: 0.7 },
  gold: { c: [255, 205, 120], size: [0.8, 2], a: 0.9, vz: [10, 26], drift: 10, z: [0, 220], add: true, rise: true, k: 0.8 },
};
const THEME_ATMO = {
  '국경 야영지': 'fireflies', '어둠의 묘지': 'dust', '망자의 동굴': 'dust', '버려진 성채': 'dust', '불타는 심연': 'embers', '혼돈의 성역': 'spirit',
  '얼어붙은 지하묘지': 'frost', '역병의 늪지': 'spores', '핏빛 황야': 'bloodash', '잿빛 황무지': 'ash', '그림자 숲': 'wisps', '불타는 평원': 'embers',
  '얼어붙은 설원': 'snow', '망자의 왕좌': 'gold',
};
// 안개 [r, g, b, 진하기]
const THEME_FOG = {
  '망자의 동굴': [190, 170, 150, 0.1], '얼어붙은 지하묘지': [190, 215, 255, 0.11], '역병의 늪지': [175, 215, 125, 0.17],
  '그림자 숲': [140, 160, 235, 0.15], '얼어붙은 설원': [235, 242, 255, 0.15], '국경 야영지': [225, 232, 215, 0.07], '망자의 왕좌': [255, 215, 150, 0.08],
};

const Atmo = {
  parts: [], kind: null, lastT: 0,
  update(t, focus) {
    const theme = world.dungeon.theme;
    const kind = ATMO_KINDS[THEME_ATMO[theme.name]] || null;
    if (kind !== this.kind) { this.kind = kind; this.parts.length = 0; }
    const dt = clamp(t - this.lastT, 0, 0.05);
    this.lastT = t;
    if (!kind) return;
    const want = Math.round(GFX.q.atmo * kind.k), P = this.parts;
    const R0 = 820;
    while (P.length < want) P.push(this.spawn(kind, focus, R0, true));
    if (P.length > want) P.length = want;
    for (const q of P) {
      q.ph += dt;
      q.x += (q.vx + Math.sin(q.ph * 0.9 + q.seed) * kind.drift) * dt;
      q.y += (q.vy + Math.cos(q.ph * 0.7 + q.seed) * kind.drift) * dt;
      q.z += q.vz * dt;
      const fx = q.x - focus.x, fy = q.y - focus.y;
      // 화면 밖으로 나가면 반대쪽에서 다시 (늘 화면을 고르게 채움)
      if (fx > R0) q.x -= R0 * 2; else if (fx < -R0) q.x += R0 * 2;
      if (fy > R0) q.y -= R0 * 2; else if (fy < -R0) q.y += R0 * 2;
      if (q.z < kind.z[0] || q.z > kind.z[1]) Object.assign(q, this.spawn(kind, focus, R0, false));
    }
  },
  spawn(kind, focus, R0, anyZ) {
    const z = anyZ ? rand(kind.z[0], kind.z[1]) : kind.fall ? kind.z[1] : kind.rise ? kind.z[0] : rand(kind.z[0], kind.z[1]);
    return { x: focus.x + rand(-R0, R0), y: focus.y + rand(-R0, R0), z, vx: rand(-6, 6), vy: rand(-6, 6), vz: rand(kind.vz[0], kind.vz[1]), s: rand(kind.size[0], kind.size[1]), ph: Math.random() * 10, seed: Math.random() * 10 };
  },
  // add: 빛나는 입자 단계에서 호출 (어둠 위에 더함), 아니면 조명 전에 호출 (빛 받은 곳만 보임)
  draw(ctx, add) {
    const kind = this.kind;
    if (!kind || !!kind.add !== add || !this.parts.length) return;
    const img = GfxTex.dot(kind.c);
    const hw = R.W / 2 / R.zoom + 20, hh = R.H / 2 / R.zoom + 20;
    for (const q of this.parts) {
      const sx = isoX(q.x, q.y), sy = isoY(q.x, q.y) - q.z;
      if (Math.abs(sx - R.camX) > hw || Math.abs(sy - R.camY) > hh) continue;
      let a = kind.a;
      if (kind.blink) a *= 0.35 + 0.65 * Math.max(0, Math.sin(q.ph * 2.2 + q.seed * 3));
      // 땅에 닿기 직전·막 생겨났을 때는 흐리게
      a *= Math.min(1, (q.z - kind.z[0]) / 30 + 0.2, (kind.z[1] - q.z) / 30 + 0.2);
      if (a <= 0.02) continue;
      const s = q.s * (add ? 3.2 : 2.4);
      ctx.globalAlpha = a;
      ctx.drawImage(img, sx - s, sy - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  },
};

// ── 안개 (높음): 흐릿한 무늬 두 겹이 다른 속도로 흘러감. 조명 전에 그려서 빛 받은 곳의 안개만 보임 ──
// 원래 흐릿한 효과라 1/4 해상도 버퍼에 그린 뒤 한 번만 늘려 붙임 (화면 전체를 여러 번 칠하지 않게)
function drawFog(ctx, t) {
  if (!GFX.q.fog) return;
  const f = THEME_FOG[world.dungeon.theme.name];
  if (!f) return;
  const cw = R.canvas.width, ch = R.canvas.height, bw = Math.ceil(cw / 4), bh = Math.ceil(ch / 4);
  const buf = R.fogBuf || (R.fogBuf = document.createElement('canvas'));
  if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
  const b = buf.getContext('2d'), k = R.dpr * R.zoom / 4;
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, bw, bh);
  b.setTransform(k, 0, 0, k, R.dpr * (R.W / 2 - R.camX * R.zoom) / 4, R.dpr * (R.H / 2 - R.camY * R.zoom) / 4);
  const tex = GfxTex.fog(f);
  const hw = R.W / 2 / R.zoom + 40, hh = R.H / 2 / R.zoom + 40;
  for (let layer = 0; layer < 2; layer++) {
    const pat = b.createPattern(tex, 'repeat');
    if (!pat || !pat.setTransform) return;
    const sc = layer ? 3.4 : 2.2, sp = layer ? 9 : 16;
    pat.setTransform(new DOMMatrix().translateSelf(t * sp + layer * 300, t * sp * 0.35, 0).scaleSelf(sc, sc * 0.55, 1));
    b.globalAlpha = f[3] * (layer ? 0.8 : 1);
    b.fillStyle = pat;
    b.fillRect(R.camX - hw, R.camY - hh, hw * 2, hh * 2);
  }
  b.globalAlpha = 1;
  const T = R.curT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(buf, 0, 0, cw, ch);
  ctx.setTransform(T[0], 0, 0, T[1], T[2], T[3]);
}

// ── 구름 그림자 (바깥 지역, 보통부터): 빛 지도에 어두운 덩어리를 곱해 천천히 흘려보냄 ──
function drawCloudShadows(l, s, t, focus) {
  if (!GFX.q.clouds || !world.dungeon.outdoor) return;
  const img = GfxTex.cloud();
  const box = 2600;
  l.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 5; i++) {
    // 바람 따라 이동, 플레이어 둘레 상자 안에서 되풀이
    const bx = (i * 977 + t * 22) % box, by = (i * 613 + t * 9) % box;
    const wx = focus.x - box / 2 + ((bx - (focus.x % box) + box * 2) % box);
    const wy = focus.y - box / 2 + ((by - (focus.y % box) + box * 2) % box);
    const sp = worldToScreen(wx, wy);
    const r = (520 + (i % 3) * 160) * R.zoom * s;
    l.drawImage(img, sp.x * s - r, sp.y * s - r * 0.6, r * 2, r * 1.2);
  }
  l.globalCompositeOperation = 'lighter';
}

// ── 빛 번짐 (높음): 화면을 작게 줄여 밝은 곳만 남기고(제곱을 두 번) 흐릿하게 다시 더함 ──
function drawBloom(ctx) {
  if (!GFX.q.bloom) return;
  const cw = R.canvas.width, ch = R.canvas.height;
  const w1 = Math.max(8, Math.ceil(cw / 4)), h1 = Math.max(8, Math.ceil(ch / 4));
  const A = R.bloomA || (R.bloomA = document.createElement('canvas'));
  const B = R.bloomB || (R.bloomB = document.createElement('canvas'));
  if (A.width !== w1 || A.height !== h1) { A.width = w1; A.height = h1; B.width = Math.ceil(w1 / 2); B.height = Math.ceil(h1 / 2); }
  const a = A.getContext('2d'), b = B.getContext('2d');
  a.globalCompositeOperation = 'copy';
  a.drawImage(R.canvas, 0, 0, w1, h1);
  a.globalCompositeOperation = 'multiply';
  a.drawImage(A, 0, 0);
  a.drawImage(A, 0, 0);
  // 더 작게 줄였다가 다시 늘려 더하면 넓게 번진 빛이 됨 (작은 캔버스에서 처리하고 화면에는 한 번만 그림)
  b.globalCompositeOperation = 'copy';
  b.drawImage(A, 0, 0, B.width, B.height);
  a.globalCompositeOperation = 'lighter';
  a.drawImage(B, 0, 0, w1, h1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.38;
  ctx.drawImage(A, 0, 0, cw, ch);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ── 화면 가장자리를 어둡게 (보통부터) ──
// 따로 화면 전체를 칠하지 않고, 어차피 장면에 곱하는 빛 지도에 함께 곱함 (추가 비용 거의 없음)
function drawVignetteToLight(l, lw, lh) {
  if (!GFX.q.vignette) return;
  const w = 160, h = Math.max(40, Math.round(160 * lh / lw));
  let v = R.vignette;
  if (!v || v.height !== h) {
    v = R.vignette = document.createElement('canvas');
    v.width = w; v.height = h;
    const x = v.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    g.addColorStop(0, 'rgb(255,255,255)'); g.addColorStop(0.65, 'rgb(205,205,205)'); g.addColorStop(1, 'rgb(105,105,105)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  l.globalCompositeOperation = 'multiply';
  l.drawImage(v, 0, 0, lw, lh);
  l.globalCompositeOperation = 'lighter';
}
