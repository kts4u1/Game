'use strict';
// ───────── 던전 생성 · 충돌 · 길찾기 ─────────
// 타일: 0 = 빈 공간(어둠), 1 = 바닥, 2 = 벽

class Dungeon {
  constructor(floor) {
    this.floor = floor;
    this.theme = themeForFloor(floor);
    this.w = 70;
    this.h = 70;
    this.lights = [];
    if (floor === 0) generateTown(this);  // 마을 (town.js)
    else if (this.theme.outdoor) this.generateOutdoor();  // 20층부터: 넓은 바깥 지역
    else this.generate();
  }

  idx(x, y) { return y * this.w + x; }
  tile(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.tiles[y * this.w + x]; }
  walkable(x, y) { return this.tile(x, y) === 1; }

  generate() {
    const W = this.w, H = this.h;
    for (let attempt = 0; attempt < 20; attempt++) {
      this.tiles = new Uint8Array(W * H);
      this.rooms = [];
      const target = 10 + Math.min(6, Math.floor(this.floor / 2));
      for (let a = 0; a < 500 && this.rooms.length < target; a++) {
        const rw = randInt(6, 12), rh = randInt(6, 12);
        const rx = randInt(2, W - rw - 3), ry = randInt(2, H - rh - 3);
        const hit = this.rooms.some(r => rx < r.x + r.w + 3 && rx + rw + 3 > r.x && ry < r.y + r.h + 3 && ry + rh + 3 > r.y);
        if (hit) continue;
        this.rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
      }
      if (this.rooms.length >= 7) break;
    }
    for (const r of this.rooms) this.carveRect(r.x, r.y, r.w, r.h);

    // 최소 신장 트리로 방 연결
    const linked = [this.rooms[0]];
    const rest = this.rooms.slice(1);
    while (rest.length) {
      let best = null, bd = Infinity;
      for (const a of linked) for (const b of rest) {
        const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      this.corridor(best[0], best[1]);
      linked.push(best[1]);
      rest.splice(rest.indexOf(best[1]), 1);
    }
    // 순환 통로 몇 개
    for (let k = 0; k < 3; k++) {
      const a = pick(this.rooms), b = pick(this.rooms);
      if (a !== b && Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) < 30) this.corridor(a, b);
    }
    // 벽 생성
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.tiles[y * W + x] !== 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (this.tile(x + dx, y + dy) === 1) { near = true; break; }
      }
      if (near) this.tiles[y * W + x] = 2;
    }
    this.explored = new Uint8Array(W * H);
    this.variant = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) this.variant[i] = Math.floor(Math.random() * 8);

    // 시작 방과 계단(가장 먼 방)
    this.startRoom = this.rooms[0];
    const d = this.bfs(this.startRoom.cx, this.startRoom.cy);
    let far = this.rooms[1], fd = -1;
    for (const r of this.rooms) {
      const v = d[this.idx(r.cx, r.cy)];
      if (v > fd) { fd = v; far = r; }
    }
    this.stairsRoom = far;
    this.stairs = { x: (far.cx + 0.5) * TILE, y: (far.cy + 0.5) * TILE, open: true };
    this.start = { x: (this.startRoom.cx + 0.5) * TILE, y: (this.startRoom.cy + 0.5) * TILE };

    this.placeTorches();
    this.placeDecor();
  }

  // ── 바깥 지역: 숲으로 둘러싸인 넓은 공터들을 굽은 큰길로 잇고, 공터 안에 바위·나무 무더기 ──
  // 칸: 1 = 걸을 수 있는 땅, 2 = 숲·바위(그림은 render.js가 깊이에 따라 나무·덤불·바위로), 3 = 소품이 놓인 칸
  generateOutdoor() {
    const th = this.theme, final = this.floor >= FINAL_FLOOR;
    const W = this.w = final ? 76 : 92, H = this.h = W;
    this.outdoor = true;
    const blob = (c) => {
      // 공터 하나: 가장자리가 울퉁불퉁한 타원
      for (let y = Math.max(2, c.cy - c.ry - 2); y <= Math.min(H - 3, c.cy + c.ry + 2); y++) {
        for (let x = Math.max(2, c.cx - c.rx - 2); x <= Math.min(W - 3, c.cx + c.rx + 2); x++) {
          const dx = (x - c.cx) / c.rx, dy = (y - c.cy) / c.ry, a = Math.atan2(dy, dx);
          const edge = 1 + Math.sin(a * 3 + c.p0) * 0.12 + Math.sin(a * 5 + c.p1) * 0.08;
          if (dx * dx + dy * dy < edge * edge) this.tiles[y * W + x] = 1;
        }
      }
    };
    for (let attempt = 0; attempt < 20; attempt++) {
      this.tiles = new Uint8Array(W * H).fill(2);
      this.rooms = [];
      const target = final ? 6 : 9 + Math.min(3, Math.floor((this.floor - OUTDOOR_FLOOR) / 10));
      for (let a = 0; a < 800 && this.rooms.length < target; a++) {
        // 최종층의 마지막 공터는 왕좌가 있는 큰 광장
        const big = final && this.rooms.length === target - 1;
        const rx = big ? 11 : randInt(6, 9), ry = big ? 11 : randInt(6, 9);
        const cx = randInt(rx + 4, W - rx - 5), cy = randInt(ry + 4, H - ry - 5);
        const hit = this.rooms.some(r => Math.abs(cx - r.cx) < rx + r.rx + 4 && Math.abs(cy - r.cy) < ry + r.ry + 4);
        if (hit) continue;
        this.rooms.push({ x: cx - rx, y: cy - ry, w: rx * 2 + 1, h: ry * 2 + 1, cx, cy, rx, ry, p0: Math.random() * TAU, p1: Math.random() * TAU });
      }
      if (this.rooms.length >= (final ? 5 : 7)) break;
    }
    for (const r of this.rooms) blob(r);
    // 공터를 넓은 길로 연결 (최소 신장 트리 + 순환 길)
    const linked = [this.rooms[0]], rest = this.rooms.slice(1);
    while (rest.length) {
      let best = null, bd = Infinity;
      for (const a of linked) for (const b of rest) {
        const dd = Math.hypot(a.cx - b.cx, a.cy - b.cy);
        if (dd < bd) { bd = dd; best = [a, b]; }
      }
      this.trail(best[0], best[1]);
      linked.push(best[1]);
      rest.splice(rest.indexOf(best[1]), 1);
    }
    for (let k = 0; k < 3; k++) {
      const a = pick(this.rooms), b = pick(this.rooms);
      if (a !== b && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 34) this.trail(a, b);
    }
    // 시작 공터(가장자리 쪽)와 계단 공터(길로 가장 먼 곳)
    this.startRoom = this.rooms.reduce((m, r) => (Math.min(r.cx, r.cy, W - r.cx, H - r.cy) < Math.min(m.cx, m.cy, W - m.cx, H - m.cy) ? r : m), this.rooms[0]);
    const throne = final ? this.rooms[this.rooms.length - 1] : null;
    if (throne) {
      // 최종층: 왕좌 광장에서 가장 먼 공터에서 시작
      const far0 = r => Math.hypot(r.cx - throne.cx, r.cy - throne.cy);
      this.startRoom = this.rooms.filter(r => r !== throne).reduce((m, r) => (far0(r) > far0(m) ? r : m));
    }
    let dmap = this.bfs(this.startRoom.cx, this.startRoom.cy);
    let far = this.rooms.find(r => r !== this.startRoom), fd = -1;
    for (const r of this.rooms) {
      const v = dmap[this.idx(r.cx, r.cy)];
      if (r !== this.startRoom && v > fd) { fd = v; far = r; }
    }
    if (throne) far = throne;
    this.stairsRoom = far;
    // 공터 안의 장애물: 바위·나무 무더기 (공터 한가운데·시작점·계단 둘레는 비움)
    // 무더기 하나가 길을 끊으면 되돌림 → 모든 땅이 늘 이어져 있음
    const keep = (x, y) => this.rooms.some(r => Math.hypot(x - r.cx, y - r.cy) < (r === far ? (final ? 6 : 3.5) : r === this.startRoom ? 3.5 : 1.6));
    for (const r of this.rooms) {
      const n = r === this.startRoom ? 1 : randInt(1, th.dense ? 5 : 3);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, rr = rand(0.35, 0.75);
        const ox = r.cx + Math.cos(a) * r.rx * rr, oy = r.cy + Math.sin(a) * r.ry * rr, rad = rand(0.7, th.dense ? 2.1 : 1.6);
        const cells = [];
        for (let y = Math.floor(oy - rad); y <= Math.ceil(oy + rad); y++) for (let x = Math.floor(ox - rad); x <= Math.ceil(ox + rad); x++) {
          if (Math.hypot(x - ox, y - oy) > rad || keep(x, y) || this.tile(x, y) !== 1) continue;
          cells.push(y * W + x);
        }
        this.blockIfConnected(cells, 2);
      }
    }
    // 혹시 끊긴 곳은 숲으로 메움 (시작점에서 걸어갈 수 없는 땅이 없게)
    dmap = this.bfs(this.startRoom.cx, this.startRoom.cy);
    for (let i = 0; i < W * H; i++) if (this.tiles[i] === 1 && dmap[i] < 0) this.tiles[i] = 2;
    this.explored = new Uint8Array(W * H);
    this.variant = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) this.variant[i] = Math.floor(Math.random() * 8);
    this.stairs = { x: (far.cx + 0.5) * TILE, y: (far.cy + 0.5) * TILE, open: true };
    this.start = { x: (this.startRoom.cx + 0.5) * TILE, y: (this.startRoom.cy + 0.5) * TILE };
    // 시작점에서 계단까지 흙길
    this.path = new Uint8Array(W * H);
    const road = this.findPath(this.start.x, this.start.y, this.stairs.x, this.stairs.y) || [];
    for (const pt of road) {
      const tx = Math.floor(pt.x / TILE), ty = Math.floor(pt.y / TILE);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (this.walkable(tx + dx, ty + dy)) this.path[this.idx(tx + dx, ty + dy)] = 1;
    }
    this.torches = [];
    this.lights = [];
    this.props = [];
    this.decor = [];
    this.placeOutdoorProps();
    this.ambient = th.amb || [30, 28, 32];
  }

  // cells를 막아도(값 v) 걸을 수 있는 땅이 모두 이어져 있으면 막고 true, 아니면 그대로 두고 false
  blockIfConnected(cells, v) {
    if (!cells.length) return false;
    const T = this.tiles;
    let total = 0;
    for (let i = 0; i < T.length; i++) if (T[i] === 1) total++;
    for (const i of cells) T[i] = v;
    const sr = this.startRoom, dm = this.bfs(sr.cx, sr.cy);
    let reach = 0;
    for (let i = 0; i < T.length; i++) if (T[i] === 1 && dm[i] >= 0) reach++;
    if (reach === total - cells.length) return true;
    for (const i of cells) T[i] = 1;
    return false;
  }

  // 공터와 공터를 잇는 넓고 굽은 길
  trail(a, b) {
    const pts = [[a.cx, a.cy]];
    const n = 3, len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
    const nx = -(b.cy - a.cy) / len, ny = (b.cx - a.cx) / len;
    for (let i = 1; i < n; i++) {
      const t = i / n, off = rand(-4, 4);
      pts.push([lerp(a.cx, b.cx, t) + nx * off, lerp(a.cy, b.cy, t) + ny * off]);
    }
    pts.push([b.cx, b.cy]);
    const rad = rand(1.6, 2.4);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let s = 0; s <= steps; s++) {
        const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
        for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++) for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
          if (xx < 3 || yy < 3 || xx >= this.w - 3 || yy >= this.h - 3) continue;
          if (Math.hypot(xx - x, yy - y) <= rad) this.tiles[yy * this.w + xx] = 1;
        }
      }
    }
  }

  // 바깥 지역의 볼거리: 버려진 야영지(모닥불), 돌기둥 폐허, 무덤, 해골, 불타는 땅
  placeOutdoorProps() {
    const th = this.theme, W = this.w;
    const free = (x, y, r = 1) => {
      for (let j = y - r; j <= y + r; j++) for (let i = x - r; i <= x + r; i++) if (this.tile(i, j) !== 1) return false;
      return Math.hypot(x - this.startRoom.cx, y - this.startRoom.cy) > 3 && Math.hypot(x - this.stairsRoom.cx, y - this.stairsRoom.cy) > 4 && !this.path[y * W + x];
    };
    const put = (name, x, y, block = true) => {
      // 길을 끊는 자리에는 놓지 않음
      if (block && !this.blockIfConnected([y * W + x], 3)) return false;
      this.props.push({ name, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, pick: randInt(0, 3) });
      return true;
    };
    const spot = (r, margin = 2) => {
      for (let i = 0; i < 40; i++) {
        const x = randInt(r.x + margin, r.x + r.w - 1 - margin), y = randInt(r.y + margin, r.y + r.h - 1 - margin);
        if (free(x, y)) return { x, y };
      }
      return null;
    };
    const rooms = shuffle(this.rooms.filter(r => r !== this.startRoom && r !== this.stairsRoom));
    let ri = 0;
    const nextRoom = () => rooms.length ? rooms[ri++ % rooms.length] : null;
    // 버려진 야영지: 모닥불(불빛) + 천막·상자
    for (let k = 0; k < (th.camps || 0); k++) {
      const r = nextRoom(), c = r && spot(r, 3);
      if (!c) continue;
      if (!put('campfire', c.x, c.y)) continue;
      this.lights.push({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, r: 300, i: 0.75, c: [255, 160, 80], flicker: true, fire: true });
      for (const [nm, dx, dy] of [['tent', -2, -1], ['crates', 1, -2], ['wood', 2, 1]]) if (free(c.x + dx, c.y + dy, 0)) put(nm, c.x + dx, c.y + dy);
    }
    // 돌기둥 폐허: 둥글게 선 기둥
    for (let k = 0; k < (th.ruins || 0); k++) {
      const r = nextRoom(), c = r && spot(r, 4);
      if (!c) continue;
      const n = randInt(5, 7), rad = rand(2.6, 3.4), a0 = Math.random() * TAU;
      for (let i = 0; i < n; i++) {
        if (chance(0.2)) continue;
        const x = Math.round(c.x + Math.cos(a0 + i / n * TAU) * rad), y = Math.round(c.y + Math.sin(a0 + i / n * TAU) * rad);
        if (free(x, y, 0)) put(chance(0.5) ? 'pillar' : 'pillar2', x, y);
      }
      this.lights.push({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, r: 230, i: 0.45, c: [170, 150, 255] });
    }
    // 무덤
    for (let k = 0; k < (th.graves || 0); k++) {
      const r = nextRoom(), c = r && spot(r, 3);
      if (!c) continue;
      for (let i = 0; i < randInt(3, 5); i++) {
        const x = c.x + randInt(-2, 2), y = c.y + randInt(-2, 2);
        if (free(x, y, 0)) put('graves', x, y);
      }
    }
    // 바닥 장식 (뼈·해골·얼룩)
    for (const r of this.rooms) {
      for (let i = 0, n = randInt(2, 4); i < n; i++) {
        const c = spot(r, 1);
        if (c) this.decor.push({ type: pick(['bones', 'bones', 'skull', 'stain']), x: (c.x + rand(0.2, 0.8)) * TILE, y: (c.y + rand(0.2, 0.8)) * TILE, rot: Math.random() * TAU, s: rand(0.7, 1.3) });
      }
    }
    // 불타는 평원: 곳곳에 타오르는 땅 / 늪지: 고인 독웅덩이 빛
    if (th.burning || th.marsh) {
      for (const r of this.rooms) {
        if (r === this.startRoom || chance(0.35)) continue;
        const c = spot(r, 2);
        if (!c) continue;
        this.lights.push({ x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, r: 200, i: 0.5, c: th.burning ? [255, 120, 50] : [140, 220, 90], flicker: true, glow: th.burning ? 'fire' : 'marsh' });
      }
    }
    // 최종층: 왕좌 광장을 두른 기둥과 화로
    if (th.throne) {
      const r = this.stairsRoom;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU, x = Math.round(r.cx + Math.cos(a) * 8), y = Math.round(r.cy + Math.sin(a) * 8);
        if (this.tile(x, y) === 1) put(i % 2 ? 'pillar' : 'pillar2', x, y);
      }
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i / 4 * TAU, x = (r.cx + Math.cos(a) * 5.5 + 0.5) * TILE, y = (r.cy + Math.sin(a) * 5.5 + 0.5) * TILE;
        this.torches.push({ kind: 'brazier', x, y, bx: x, by: y, lx: x, ly: y, fx: isoX(x, y) - 2, fy: isoY(x, y) - 34, phase: Math.random() * 10 });
      }
    }
  }

  carveRect(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i > 0 && j > 0 && i < this.w - 1 && j < this.h - 1) this.tiles[this.idx(i, j)] = 1;
    }
  }

  corridor(a, b) {
    const w = chance(0.5) ? 2 : 3;
    let x = a.cx, y = a.cy;
    const horizFirst = chance(0.5);
    const stepX = () => { while (x !== b.cx) { this.carveRect(x, y - (w >> 1), 1, w); x += Math.sign(b.cx - x); } };
    const stepY = () => { while (y !== b.cy) { this.carveRect(x - (w >> 1), y, w, 1); y += Math.sign(b.cy - y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    this.carveRect(x - (w >> 1), y - (w >> 1), w, w);
  }

  // 벽 앞면(보이는 면)에 횃불 배치
  placeTorches() {
    this.torches = [];
    const cand = [];
    for (let y = 1; y < this.h - 1; y++) for (let x = 1; x < this.w - 1; x++) {
      if (this.tile(x, y) !== 2) continue;
      if (this.walkable(x + 1, y) && this.tile(x, y - 1) === 2 && this.tile(x, y + 1) === 2) cand.push({ tx: x, ty: y, face: 'right' });
      else if (this.walkable(x, y + 1) && this.tile(x - 1, y) === 2 && this.tile(x + 1, y) === 2) cand.push({ tx: x, ty: y, face: 'left' });
    }
    shuffle(cand);
    for (const c of cand) {
      if (this.torches.some(t => Math.abs(t.tx - c.tx) + Math.abs(t.ty - c.ty) < 7)) continue;
      if (c.face === 'right') { c.x = (c.tx + 1) * TILE + 2; c.y = (c.ty + 0.5) * TILE; }
      else { c.x = (c.tx + 0.5) * TILE; c.y = (c.ty + 1) * TILE + 2; }
      c.lx = c.face === 'right' ? c.x + 30 : c.x;
      c.ly = c.face === 'right' ? c.y : c.y + 30;
      c.phase = Math.random() * 10;
      this.torches.push(c);
      if (this.torches.length > 40) break;
    }
  }

  placeDecor() {
    this.decor = [];
    for (const r of this.rooms) {
      const n = randInt(1, 4);
      for (let i = 0; i < n; i++) {
        this.decor.push({
          type: pick(['bones', 'bones', 'skull', 'crack', 'crack', 'stain']),
          x: (r.x + rand(0.5, r.w - 0.5)) * TILE, y: (r.y + rand(0.5, r.h - 0.5)) * TILE,
          rot: Math.random() * TAU, s: rand(0.7, 1.3),
        });
      }
    }
  }

  randomPointInRoom(r, margin = 1) {
    for (let i = 0; i < 30; i++) {
      const x = (r.x + margin + Math.random() * (r.w - margin * 2)) * TILE;
      const y = (r.y + margin + Math.random() * (r.h - margin * 2)) * TILE;
      if (!this.circleBlocked(x, y, 16)) return { x, y };
    }
    return { x: (r.cx + 0.5) * TILE, y: (r.cy + 0.5) * TILE };
  }

  // ── 충돌 ──
  solidAt(x, y) { return !this.walkable(Math.floor(x / TILE), Math.floor(y / TILE)); }
  circleBlocked(x, y, r) {
    return this.solidAt(x - r, y - r) || this.solidAt(x + r, y - r) || this.solidAt(x - r, y + r) || this.solidAt(x + r, y + r);
  }
  // (x, y)에서 가장 가까운, 반지름 r 원이 들어갈 빈자리 (벽에 끼지 않게)
  freeSpot(x, y, r, maxR = 360) {
    if (!this.circleBlocked(x, y, r)) return { x, y };
    for (let rad = 8; rad <= maxR; rad += 8) {
      const n = Math.max(8, Math.round(rad / 6));
      const off = Math.random() * TAU;
      for (let k = 0; k < n; k++) {
        const a = off + k / n * TAU;
        const qx = x + Math.cos(a) * rad, qy = y + Math.sin(a) * rad;
        if (!this.circleBlocked(qx, qy, r)) return { x: qx, y: qy };
      }
    }
    return { x: this.start.x, y: this.start.y };
  }
  // 축 분리 이동으로 벽을 따라 미끄러지기
  moveCircle(e, dx, dy) {
    const r = e.r * 0.8;
    if (!this.circleBlocked(e.x + dx, e.y, r)) e.x += dx;
    if (!this.circleBlocked(e.x, e.y + dy, r)) e.y += dy;
  }
  los(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by);
    const n = Math.ceil(d / 20);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.solidAt(lerp(ax, bx, t), lerp(ay, by, t))) return false;
    }
    return true;
  }
  // 원 크기를 고려한 직선 이동 가능 여부
  clearPath(ax, ay, bx, by, r) {
    const d = dist(ax, ay, bx, by);
    const n = Math.ceil(d / 14);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (this.circleBlocked(lerp(ax, bx, t), lerp(ay, by, t), r)) return false;
    }
    return true;
  }

  bfs(sx, sy, maxSteps = 9999) {
    const d = new Int16Array(this.w * this.h).fill(-1);
    if (!this.walkable(sx, sy)) return d;
    const q = new Int32Array(this.w * this.h);
    let qh = 0, qt = 0;
    d[this.idx(sx, sy)] = 0;
    q[qt++] = this.idx(sx, sy);
    while (qh < qt) {
      const c = q[qh++];
      const cx = c % this.w, cy = (c / this.w) | 0;
      const cd = d[c];
      if (cd >= maxSteps) continue;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (!this.walkable(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (d[ni] !== -1) continue;
        d[ni] = cd + 1;
        q[qt++] = ni;
      }
    }
    return d;
  }

  // 플레이어 위치 기준 흐름장(몬스터 추적용)
  updateFlow(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (this.flowTx === tx && this.flowTy === ty) return;
    this.flowTx = tx; this.flowTy = ty;
    this.flow = this.bfs(tx, ty, 40);
  }
  flowStep(x, y) {
    if (!this.flow) return null;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const here = this.flow[this.idx(tx, ty)];
    let best = null, bv = here < 0 ? 9999 : here;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx, ny = ty + dy;
      if (!this.walkable(nx, ny)) continue;
      if (dx && dy && (!this.walkable(tx + dx, ty) || !this.walkable(tx, ty + dy))) continue;
      const v = this.flow[this.idx(nx, ny)];
      if (v >= 0 && v < bv) { bv = v; best = { x: (nx + 0.5) * TILE, y: (ny + 0.5) * TILE }; }
    }
    return best;
  }

  nearestWalkable(tx, ty) {
    if (this.walkable(tx, ty)) return { tx, ty };
    for (let r = 1; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (this.walkable(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    }
    return null;
  }

  // A* 길찾기 (8방향, 대각선은 모서리 통과 금지)
  findPath(sx, sy, gx, gy) {
    const s = { tx: Math.floor(sx / TILE), ty: Math.floor(sy / TILE) };
    let g = this.nearestWalkable(Math.floor(gx / TILE), Math.floor(gy / TILE));
    if (!g || !this.walkable(s.tx, s.ty)) return null;
    const W = this.w;
    const N = W * this.h;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => {
      heap.push([f, i]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1, r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    const h = (x, y) => {
      const dx = Math.abs(x - g.tx), dy = Math.abs(y - g.ty);
      return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
    };
    const si = s.ty * W + s.tx, gi = g.ty * W + g.tx;
    gScore[si] = 0;
    push(si, h(s.tx, s.ty));
    let iter = 0;
    while (heap.length && iter++ < 6000) {
      const [, c] = pop();
      if (c === gi) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const cx = c % W, cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!this.walkable(nx, ny)) continue;
        if (dx && dy && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        const ng = gScore[c] + (dx && dy ? 1.414 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = c;
          push(ni, ng + h(nx, ny));
        }
      }
    }
    if (came[gi] === -1 && gi !== si) return null;
    const pts = [];
    let c = gi;
    while (c !== si && c !== -1) {
      pts.push({ x: (c % W + 0.5) * TILE, y: (((c / W) | 0) + 0.5) * TILE });
      c = came[c];
    }
    pts.reverse();
    // 최종 지점은 클릭한 정확한 위치(이동 가능하면)
    if (pts.length && !this.circleBlocked(gx, gy, 12)) pts[pts.length - 1] = { x: gx, y: gy };
    return pts;
  }

  // 시야 안 타일 탐색 표시
  reveal(px, py, radiusTiles) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    const r = radiusTiles;
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = this.idx(x, y);
      if (this.explored[i] || this.tiles[i] === 0) continue;
      if ((x - tx) ** 2 + (y - ty) ** 2 > r * r) continue;
      // 바깥 지역은 탁 트여 있어 숲 너머도 보임
      if (this.outdoor) { this.explored[i] = 1; continue; }
      // 벽 너머는 보이지 않음 (벽 자체는 보임)
      const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
      const d = dist(px, py, cx, cy);
      const n = Math.ceil(d / 24);
      let ok = true;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const sx = Math.floor(lerp(px, cx, t) / TILE), sy = Math.floor(lerp(py, cy, t) / TILE);
        if ((sx !== x || sy !== y) && !this.walkable(sx, sy)) { ok = false; break; }
      }
      if (ok) this.explored[i] = 1;
    }
  }
}
