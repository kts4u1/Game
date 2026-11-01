'use strict';
// ───────── 던전 생성 · 충돌 · 길찾기 ─────────
// 타일: 0 = 빈 공간(어둠), 1 = 바닥, 2 = 벽

// 구조 이름 → 만드는 함수
const UNDER_LAYOUTS = { rooms: 'layoutRooms', cavern: 'layoutCavern', halls: 'layoutHalls', maze: 'layoutMaze', ring: 'layoutRing', tunnels: 'layoutTunnels' };
const OUT_LAYOUTS = { clearings: 'outClearings', valley: 'outValley', field: 'outField' };
// 가장자리가 울퉁불퉁한 타원 굴·공터
function blobRoom(cx, cy, rx, ry) {
  return { x: cx - rx, y: cy - ry, w: rx * 2 + 1, h: ry * 2 + 1, cx, cy, rx, ry, p0: Math.random() * TAU, p1: Math.random() * TAU };
}

class Dungeon {
  constructor(floor, diff) {
    this.floor = floor;
    this.theme = themeForFloor(floor, diff);
    // 시험용: DEBUG_MAP = { theme: '테마 이름', layout: '구조' }
    const dbg = typeof DEBUG_MAP !== 'undefined' && DEBUG_MAP && floor > 0 ? DEBUG_MAP : null;
    if (dbg && dbg.theme) this.theme = THEMES.find(t => t.name === dbg.theme) || this.theme;
    this.w = 70;
    this.h = 70;
    this.lights = [];
    if (floor === 0) generateTown(this);  // 마을 (town.js)
    else if (this.theme.outdoor) this.generateOutdoor(dbg && dbg.layout);  // 넓은 바깥 지역
    else this.generate(dbg && dbg.layout);
  }

  idx(x, y) { return y * this.w + x; }
  tile(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.tiles[y * this.w + x]; }
  walkable(x, y) { return this.tile(x, y) === 1; }
  // 벽이 아닌 칸 (걸을 수 있는 땅 + 소품이 놓인 칸)
  open(x, y) { const t = this.tile(x, y); return t === 1 || t === 3; }

  // ── 지하: 테마에 맞는 구조를 골라 만든 뒤 벽·시작점·계단·횃불·소품 ──
  generate(force) {
    const W = this.w, H = this.h;
    this.layout = force || pickLayout(this.theme, this.floor);
    let ok = false;
    for (let attempt = 0; attempt < 12 && !ok; attempt++) {
      // 몇 번 해도 안 되면 기본 구조로
      if (attempt === 8) this.layout = this.theme.tiles === 'cave' ? 'cavern' : 'rooms';
      this.tiles = new Uint8Array(W * H);
      this.rooms = [];
      this.startRoom = this.stairsRoom = null;
      ok = this[UNDER_LAYOUTS[this.layout] || 'layoutRooms']();
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
    this.pickEnds();
    this.placeTorches();
    this.placeDecor();
    this.props = [];
    this.placeUnderProps();
  }

  // 시작 방과 계단 방(길로 가장 먼 방). 걸어갈 수 없는 땅은 벽으로 메움
  pickEnds() {
    const W = this.w, H = this.h;
    if (!this.startRoom) this.startRoom = this.rooms[0];
    const sr = this.startRoom;
    let d = this.bfs(sr.cx, sr.cy);
    for (let i = 0; i < W * H; i++) if (this.tiles[i] === 1 && d[i] < 0) this.tiles[i] = 2;
    this.rooms = this.rooms.filter(r => r === sr || d[this.idx(r.cx, r.cy)] >= 0);
    if (!this.stairsRoom || d[this.idx(this.stairsRoom.cx, this.stairsRoom.cy)] < 0) {
      let far = this.rooms.find(r => r !== sr) || sr, fd = -1;
      for (const r of this.rooms) {
        const v = d[this.idx(r.cx, r.cy)];
        if (r !== sr && v > fd) { fd = v; far = r; }
      }
      // 보스 층: 멀리 있는 방 중에서 가장 넓은 방 (보스와 싸울 자리)
      if (isBossFloor(this.floor)) {
        const cands = this.rooms.filter(r => r !== sr && d[this.idx(r.cx, r.cy)] >= fd * 0.6);
        far = cands.reduce((m, r) => (r.w * r.h > m.w * m.h ? r : m), far);
      }
      this.stairsRoom = far;
    }
    const st = this.stairsRoom;
    this.stairs = { x: (st.cx + 0.5) * TILE, y: (st.cy + 0.5) * TILE, open: true };
    this.start = { x: (sr.cx + 0.5) * TILE, y: (sr.cy + 0.5) * TILE };
  }

  // 방들을 최소 신장 트리로 잇고, 가까운 방끼리 순환 통로 몇 개
  linkRooms(connect, loops = 3, maxLoop = 30) {
    const linked = [this.rooms[0]];
    const rest = this.rooms.slice(1);
    while (rest.length) {
      let best = null, bd = Infinity;
      for (const a of linked) for (const b of rest) {
        const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      connect(best[0], best[1]);
      linked.push(best[1]);
      rest.splice(rest.indexOf(best[1]), 1);
    }
    for (let k = 0; k < loops; k++) {
      const a = pick(this.rooms), b = pick(this.rooms);
      if (a !== b && Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) < maxLoop) connect(a, b);
    }
  }

  // 겹치지 않게 네모난 방 하나 놓기
  placeRect(rw, rh, gap, x0 = 2, y0 = 2, x1 = this.w - 3, y1 = this.h - 3) {
    for (let a = 0; a < 200; a++) {
      const rx = randInt(x0, x1 - rw), ry = randInt(y0, y1 - rh);
      if (this.rooms.some(r => rx < r.x + r.w + gap && rx + rw + gap > r.x && ry < r.y + r.h + gap && ry + rh + gap > r.y)) continue;
      const r = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
      this.rooms.push(r);
      return r;
    }
    return null;
  }

  // ① 방과 통로 (원래 구조)
  layoutRooms() {
    const W = this.w, H = this.h;
    const target = 10 + Math.min(6, Math.floor(this.floor / 2));
    for (let a = 0; a < 500 && this.rooms.length < target; a++) {
      const rw = randInt(6, 12), rh = randInt(6, 12);
      const rx = randInt(2, W - rw - 3), ry = randInt(2, H - rh - 3);
      const hit = this.rooms.some(r => rx < r.x + r.w + 3 && rx + rw + 3 > r.x && ry < r.y + r.h + 3 && ry + rh + 3 > r.y);
      if (hit) continue;
      this.rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
    }
    if (this.rooms.length < 7) return false;
    for (const r of this.rooms) this.carveRect(r.x, r.y, r.w, r.h);
    this.linkRooms((a, b) => this.corridor(a, b));
    return true;
  }

  // ② 자연 동굴: 울퉁불퉁한 굴들을 구불구불한 굴길로 잇고 가장자리를 다듬음
  layoutCavern() {
    const W = this.w, H = this.h;
    const target = 9 + Math.min(5, Math.floor(this.floor / 4));
    for (let a = 0; a < 700 && this.rooms.length < target; a++) {
      const rx = randInt(3, 7), ry = randInt(3, 7);
      const cx = randInt(rx + 4, W - rx - 5), cy = randInt(ry + 4, H - ry - 5);
      if (this.rooms.some(r => Math.abs(cx - r.cx) < rx + r.rx + 3 && Math.abs(cy - r.cy) < ry + r.ry + 3)) continue;
      this.rooms.push(blobRoom(cx, cy, rx, ry));
    }
    if (this.rooms.length < 6) return false;
    for (const r of this.rooms) this.carveBlob(r, 1, 0.2);
    this.linkRooms((a, b) => this.carvePath(a, b, rand(1.0, 1.7), 4, 5, 3), 3, 34);
    for (let it = 0; it < 2; it++) this.smoothGrow(5);
    return true;
  }

  // ③ 대전당: 기둥이 두 줄로 늘어선 큰 홀 한두 개와 곁방들
  layoutHalls() {
    const halls = randInt(1, 2);
    for (let k = 0; k < halls; k++) {
      const long = randInt(17, 23), short = randInt(9, 12);
      const r = chance(0.5) ? this.placeRect(long, short, 4) : this.placeRect(short, long, 4);
      if (r) r.hall = true;
    }
    const target = 8 + Math.min(4, Math.floor(this.floor / 5));
    for (let a = 0; a < 60 && this.rooms.length < target; a++) this.placeRect(randInt(6, 10), randInt(6, 10), 3);
    if (this.rooms.length < 6 || !this.rooms.some(r => r.hall)) return false;
    for (const r of this.rooms) this.carveRect(r.x, r.y, r.w, r.h);
    this.linkRooms((a, b) => this.corridor(a, b, 3), 2);
    for (const r of this.rooms) if (r.hall) this.colonnade(r);
    return true;
  }
  colonnade(r) {
    const horiz = r.w >= r.h, len = horiz ? r.w : r.h, side = horiz ? r.h : r.w;
    for (let k = 2; k < len - 2; k += 3) {
      for (const off of [2, side - 3]) {
        const x = horiz ? r.x + k : r.x + off, y = horiz ? r.y + off : r.y + k;
        if ((horiz ? x : y) === (horiz ? r.cx : r.cy)) continue;  // 통로가 지나는 가운데 줄은 비움
        this.tiles[this.idx(x, y)] = 2;
      }
    }
  }

  // ④ 미궁: 좁은 길이 얽힌 미로와, 군데군데 넓은 방
  layoutMaze() {
    const W = this.w, H = this.h, C = 6, cs = 3;
    const gw = Math.floor((W - 4) / C), gh = Math.floor((H - 4) / C), N = gw * gh;
    const cx = i => 2 + i * C, cy = j => 2 + j * C;
    const seen = new Uint8Array(N), edges = [], deg = new Uint8Array(N);
    const stack = [randInt(0, N - 1)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1], i = c % gw, j = (c / gw) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [i + dx, j + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < gw && y < gh && !seen[y * gw + x]);
      if (!nb.length) { stack.pop(); continue; }
      const [x, y] = pick(nb), n = y * gw + x;
      seen[n] = 1; edges.push([c, n]); stack.push(n);
    }
    for (let k = 0; k < N * 0.14; k++) {
      const c = randInt(0, N - 1), i = c % gw, j = (c / gw) | 0, [dx, dy] = pick([[1, 0], [0, 1]]);
      if (i + dx < gw && j + dy < gh) edges.push([c, (j + dy) * gw + i + dx]);
    }
    for (let c = 0; c < N; c++) this.carveRect(cx(c % gw), cy((c / gw) | 0), cs, cs);
    for (const [a, b] of edges) {
      deg[a]++; deg[b]++;
      const ai = a % gw, aj = (a / gw) | 0, bi = b % gw, bj = (b / gw) | 0;
      this.carveRect(Math.min(cx(ai), cx(bi)), Math.min(cy(aj), cy(bj)), Math.abs(cx(ai) - cx(bi)) + cs, Math.abs(cy(aj) - cy(bj)) + cs);
    }
    // 넓은 방: 2×2(가끔 3×3) 칸을 하나로
    const chambers = [];
    for (let a = 0; a < 80 && chambers.length < 5; a++) {
      const n = chambers.length === 0 && chance(0.5) ? 3 : 2;
      const i = randInt(0, gw - n), j = randInt(0, gh - n);
      if (chambers.some(r => i < r.i + r.n + 1 && i + r.n + 1 > r.i && j < r.j + r.n + 1 && j + r.n + 1 > r.j)) continue;
      chambers.push({ i, j, n });
    }
    for (const ch of chambers) {
      const x = cx(ch.i), y = cy(ch.j), w = (ch.n - 1) * C + cs;
      this.carveRect(x, y, w, w);
      this.rooms.push({ x, y, w, h: w, cx: x + (w >> 1), cy: y + (w >> 1) });
    }
    // 막다른 길 끝의 작은 방 (보물 상자 자리)
    const inCh = (i, j) => chambers.some(r => i >= r.i && i < r.i + r.n && j >= r.j && j < r.j + r.n);
    const ends = shuffle([...Array(N).keys()].filter(c => deg[c] === 1 && !inCh(c % gw, (c / gw) | 0))).slice(0, 6);
    for (const c of ends) {
      const x = cx(c % gw) - 1, y = cy((c / gw) | 0) - 1;
      this.rooms.push({ x, y, w: cs + 2, h: cs + 2, cx: x + 2, cy: y + 2, small: true });
    }
    // 시작: 모서리에 가까운 방
    this.startRoom = this.rooms.reduce((m, r) => (Math.min(r.cx, r.cy, W - r.cx, H - r.cy) < Math.min(m.cx, m.cy, W - m.cx, H - m.cy) ? r : m), this.rooms[0]);
    return this.rooms.length >= 5;
  }

  // ⑤ 원형 성소: 둥글게 늘어선 방들을 고리 통로로 잇고, 가운데 큰 성소로 들어가는 길은 한두 개
  layoutRing() {
    const W = this.w, H = this.h, mx = W >> 1, my = H >> 1;
    const R = randInt(21, 24), n = randInt(6, 8), a0 = Math.random() * TAU;
    const outer = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + k / n * TAU + rand(-0.12, 0.12);
      const x = Math.round(mx + Math.cos(a) * R), y = Math.round(my + Math.sin(a) * R);
      const r = chance(0.5) ? this.discRoom(x, y, randInt(4, 5)) : this.rectRoomAt(x, y, randInt(7, 9), randInt(7, 9));
      outer.push(r);
    }
    const center = this.discRoom(mx, my, randInt(7, 9));
    center.hall = true;
    this.rooms = outer.concat([center]);
    // 고리 (시작 방 옆 한 곳은 끊어서 한 바퀴 돌아야 하게)
    for (let k = 0; k < n - 1; k++) this.corridor(outer[k], outer[k + 1], 3);
    // 성소로 가는 길: 시작 방 반대편에서
    const far = Math.floor(n / 2);
    this.corridor(outer[far], center, 3);
    if (n >= 7 && chance(0.5)) this.corridor(outer[far + 1 < n ? far + 1 : far - 1], center, 2);
    // 곁방: 고리 바깥쪽에 작은 방 몇 개
    for (let k = 0; k < 3; k++) {
      const o = outer[randInt(1, n - 1)], a = Math.atan2(o.cy - my, o.cx - mx);
      const x = Math.round(o.cx + Math.cos(a) * 9), y = Math.round(o.cy + Math.sin(a) * 9);
      if (x < 6 || y < 6 || x > W - 7 || y > H - 7) continue;
      const r = this.rectRoomAt(x, y, randInt(5, 6), randInt(5, 6));
      this.rooms.push(r);
      this.corridor(o, r, 2);
    }
    this.startRoom = outer[0];
    this.stairsRoom = center;
    return true;
  }
  discRoom(cx, cy, rad) {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad + rad * 0.8) this.carveRect(x, y, 1, 1);
    }
    return { x: cx - rad, y: cy - rad, w: rad * 2 + 1, h: rad * 2 + 1, cx, cy };
  }
  rectRoomAt(cx, cy, w, h) {
    const x = cx - (w >> 1), y = cy - (h >> 1);
    this.carveRect(x, y, w, h);
    return { x, y, w, h, cx, cy };
  }

  // ⑥ 광산 갱도: 방에서 갱도를 파 나가 끝에 작은 굴을 만드는 일을 되풀이
  layoutTunnels() {
    const W = this.w, H = this.h;
    const first = this.placeRect(7, 7, 0, 4, 4, W - 5, H - 5);
    this.carveRect(first.x, first.y, first.w, first.h);
    const target = 12 + Math.min(5, Math.floor(this.floor / 5));
    for (let a = 0; a < 700 && this.rooms.length < target; a++) {
      const from = pick(this.rooms);
      let [dx, dy] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const pts = [[from.cx, from.cy]];
      let x = from.cx, y = from.cy;
      const legs = chance(0.6) ? 2 : 1;
      for (let l = 0; l < legs; l++) {
        const len = randInt(8, 16);
        x += dx * len; y += dy * len;
        pts.push([x, y]);
        [dx, dy] = chance(0.5) ? [dy, dx] : [-dy, -dx];
      }
      const rw = randInt(5, 8), rh = randInt(5, 8);
      const rx = x - (rw >> 1), ry = y - (rh >> 1);
      if (rx < 3 || ry < 3 || rx + rw > W - 3 || ry + rh > H - 3) continue;
      if (this.rooms.some(r => rx < r.x + r.w + 2 && rx + rw + 2 > r.x && ry < r.y + r.h + 2 && ry + rh + 2 > r.y)) continue;
      const wid = chance(0.5) ? 2 : 3;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        this.carveRect(Math.min(x0, x1) - (wid >> 1), Math.min(y0, y1) - (wid >> 1), Math.abs(x1 - x0) + wid, Math.abs(y1 - y0) + wid);
      }
      this.carveRect(rx, ry, rw, rh);
      this.rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: x, cy: y });
    }
    // 갱도 몇 개는 서로 이어 순환 길로
    for (let k = 0; k < 3; k++) {
      const a = pick(this.rooms), b = pick(this.rooms);
      if (a !== b && Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy) < 22) this.corridor(a, b, 2);
    }
    return this.rooms.length >= 7;
  }

  // 울퉁불퉁한 타원 굴 (rough: 가장자리 흔들림 정도)
  carveBlob(c, v = 1, rough = 0.12) {
    const W = this.w, H = this.h;
    for (let y = Math.max(2, c.cy - c.ry - 3); y <= Math.min(H - 3, c.cy + c.ry + 3); y++) {
      for (let x = Math.max(2, c.cx - c.rx - 3); x <= Math.min(W - 3, c.cx + c.rx + 3); x++) {
        const dx = (x - c.cx) / c.rx, dy = (y - c.cy) / c.ry, a = Math.atan2(dy, dx);
        const edge = 1 + Math.sin(a * 3 + c.p0) * rough + Math.sin(a * 5 + c.p1) * rough * 0.65 + Math.sin(a * 9 + c.p0 * 2) * rough * 0.35;
        if (dx * dx + dy * dy < edge * edge) this.tiles[y * W + x] = v;
      }
    }
  }
  // 둘레 8칸 중 n칸 이상이 땅인 빈칸을 땅으로 (동굴 벽을 둥글게, 땅을 줄이지는 않음)
  smoothGrow(n) {
    const W = this.w, H = this.h, add = [];
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
      if (this.tiles[y * W + x] === 1) continue;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.tiles[(y + dy) * W + x + dx] === 1) c++;
      if (c >= n) add.push(y * W + x);
    }
    for (const i of add) this.tiles[i] = 1;
  }
  // 구불구불한 길 (지하 굴길·바깥 큰길 공용): 중간 점을 옆으로 흔들어 원을 찍어 나감
  carvePath(a, b, rad, n = 3, wobble = 4, margin = 3) {
    const pts = [[a.cx, a.cy]];
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
    const nx = -(b.cy - a.cy) / len, ny = (b.cx - a.cx) / len;
    for (let i = 1; i < n; i++) {
      const t = i / n, off = rand(-wobble, wobble);
      pts.push([lerp(a.cx, b.cx, t) + nx * off, lerp(a.cy, b.cy, t) + ny * off]);
    }
    pts.push([b.cx, b.cy]);
    this.carveLine(pts, rad, 1, margin);
  }
  carveLine(pts, rad, v = 1, margin = 3) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let s = 0; s <= steps; s++) {
        const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
        for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++) for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
          if (xx < margin || yy < margin || xx >= this.w - margin || yy >= this.h - margin) continue;
          if (Math.hypot(xx - x, yy - y) <= rad) this.tiles[yy * this.w + xx] = v;
        }
      }
    }
  }

  // 지하 소품: 벽에 붙여 세우는 것(통·상자·책장·석상)과 방 가운데 놓는 것(석관·제단·탁자). 길을 끊는 자리에는 놓지 않음
  placeUnderProps() {
    const th = this.theme;
    const S = typeof FLARE !== 'undefined' && FLARE.tiles && FLARE.tiles[th.tiles];
    if (!S) return;
    const W = this.w, taken = [];
    const near = (x, y, r) => taken.some(([a, b]) => Math.abs(a - x) <= r && Math.abs(b - y) <= r);
    const isWall = (x, y) => this.tile(x, y) === 2;
    const floorAll = (x, y) => { for (let j = y - 1; j <= y + 1; j++) for (let i = x - 1; i <= x + 1; i++) if (this.tile(i, j) !== 1) return false; return true; };
    // 곧은 벽 바로 앞 칸 (문간·모서리는 피함)
    const hug = (x, y) => {
      if (this.tile(x, y) !== 1) return false;
      for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
        if (!isWall(x + dx, y + dy)) continue;
        const px = dy ? 1 : 0, py = dx ? 1 : 0;
        if (this.tile(x + px, y + py) === 1 && this.tile(x - px, y - py) === 1 && isWall(x + px + dx, y + py + dy) && isWall(x - px + dx, y - py + dy)
          && this.tile(x - dx, y - dy) === 1 && this.tile(x - dx + px, y - dy + py) === 1 && this.tile(x - dx - px, y - dy - py) === 1) return true;
      }
      return false;
    };
    const WALL_KEYS = ['barrels', 'crates', 'statues', 'lecterns', 'chains', 'carts', 'urns', 'plants', 'shrines', 'pedestals', 'thrones'];
    const LIGHTS = { firebowl: [255, 150, 70, 230], crystal: [120, 255, 140, 240], orbs: [140, 255, 150, 200], mushrooms: (th.glow || [190, 120, 255]).concat([210]) };
    const rooms = this.rooms.filter(r => r !== this.startRoom && r !== this.stairsRoom);
    const put = (key, x, y) => {
      if (!this.blockIfConnected([y * W + x], 3)) return false;
      taken.push([x, y]);
      const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
      this.props.push({ name: key, set: th.tiles, x: px, y: py, pick: randInt(0, 7) });
      const L = LIGHTS[key];
      if (L) this.lights.push({ x: px, y: py, r: L[3], i: key === 'mushrooms' ? 0.7 : 0.6, c: L.slice(0, 3), flicker: key === 'firebowl', fire: key === 'firebowl' });
      return true;
    };
    for (const [key, rate] of th.props || []) {
      if (!S[key]) continue;
      const wallish = WALL_KEYS.includes(key);
      for (const r of rooms) {
        let n = rate * (r.small ? 0.4 : r.w * r.h > 90 ? 1.6 : 1);
        while (n > 0) {
          if (chance(Math.min(1, n))) {
            for (let a = 0; a < 20; a++) {
              const x = randInt(r.x, r.x + r.w - 1), y = randInt(r.y, r.y + r.h - 1);
              if (Math.abs(x - r.cx) <= 1 && Math.abs(y - r.cy) <= 1) continue;  // 방 한가운데는 비움
              if (near(x, y, wallish ? 1 : 2) || !(wallish ? hug(x, y) : floorAll(x, y))) continue;
              if (put(key, x, y)) break;
            }
          }
          n -= 1;
        }
      }
    }
    // 넓은 대전당·성소는 가운데가 어두우므로 바닥에 세운 화로 몇 개 (횃불처럼 불꽃·빛이 남)
    for (const r of this.rooms) {
      if (!r.hall || r === this.startRoom) continue;
      for (let k = randInt(2, 4); k > 0; k--) {
        for (let a = 0; a < 20; a++) {
          const x = randInt(r.x + 1, r.x + r.w - 2), y = randInt(r.y + 1, r.y + r.h - 2);
          if (Math.abs(x - r.cx) <= 2 && Math.abs(y - r.cy) <= 2) continue;
          if (near(x, y, 3) || !floorAll(x, y)) continue;
          if (!this.blockIfConnected([y * W + x], 3)) continue;
          taken.push([x, y]);
          const bx = (x + 0.5) * TILE, by = (y + 0.5) * TILE;
          this.torches.push({ tx: x, ty: y, free: true, kind: 'brazier', x: bx, y: by, bx, by, lx: bx, ly: by, fx: isoX(bx, by) - 2, fy: isoY(bx, by) - 34, phase: Math.random() * 10 });
          break;
        }
      }
    }
    // 동굴·광산: 넓은 굴 안에 홀로 선 종유석·버팀목 기둥
    if (th.pillars && S[th.pillarKey || 'pillar']) {
      for (const r of rooms) {
        if (r.w * r.h < 40) continue;
        for (let k = randInt(0, r.w * r.h > 80 ? 3 : 1); k > 0; k--) {
          for (let a = 0; a < 15; a++) {
            const x = randInt(r.x + 1, r.x + r.w - 2), y = randInt(r.y + 1, r.y + r.h - 2);
            if (Math.abs(x - r.cx) <= 1 && Math.abs(y - r.cy) <= 1) continue;
            if (near(x, y, 2) || !floorAll(x, y)) continue;
            if (this.blockIfConnected([y * W + x], 2)) { taken.push([x, y]); break; }
          }
        }
      }
    }
  }

  // ── 바깥 지역: 테마에 맞는 구조(숲속 공터·협곡·벌판)를 만든 뒤 장애물·흙길·볼거리 ──
  // 칸: 1 = 걸을 수 있는 땅, 2 = 숲·바위(그림은 render.js가 깊이에 따라 나무·덤불·바위로), 3 = 소품이 놓인 칸
  generateOutdoor(force) {
    const th = this.theme, final = this.floor >= FINAL_FLOOR;
    const W = this.w = final ? 76 : this.floor >= OUTDOOR_FLOOR ? 92 : 76, H = this.h = W;
    this.outdoor = true;
    this.layout = final ? 'clearings' : force || pickLayout(th, this.floor);
    let ok = false;
    for (let attempt = 0; attempt < 12 && !ok; attempt++) {
      if (attempt === 8) this.layout = 'clearings';
      this.tiles = new Uint8Array(W * H).fill(2);
      this.rooms = [];
      this.startRoom = this.stairsRoom = this.throne = null;
      ok = this[OUT_LAYOUTS[this.layout] || 'outClearings']();
    }
    // 시작 공터(가장자리 쪽)와 계단 공터(길로 가장 먼 곳)
    const edge = r => Math.min(r.cx, r.cy, W - r.cx, H - r.cy);
    if (this.throne) {
      // 최종층: 왕좌 광장에서 가장 먼 공터에서 시작
      const far0 = r => Math.hypot(r.cx - this.throne.cx, r.cy - this.throne.cy);
      this.startRoom = this.rooms.filter(r => r !== this.throne).reduce((m, r) => (far0(r) > far0(m) ? r : m));
      this.stairsRoom = this.throne;
    }
    if (!this.startRoom) this.startRoom = this.rooms.reduce((m, r) => (edge(r) < edge(m) ? r : m), this.rooms[0]);
    let dmap = this.bfs(this.startRoom.cx, this.startRoom.cy);
    if (!this.stairsRoom) {
      let far = this.rooms.find(r => r !== this.startRoom), fd = -1;
      for (const r of this.rooms) {
        const v = dmap[this.idx(r.cx, r.cy)];
        if (r !== this.startRoom && v > fd) { fd = v; far = r; }
      }
      this.stairsRoom = far;
    }
    const far = this.stairsRoom;
    // 공터 안의 장애물: 바위·나무 무더기 (공터 한가운데·시작점·계단 둘레는 비움)
    // 무더기 하나가 길을 끊으면 되돌림 → 모든 땅이 늘 이어져 있음
    const keep = (x, y) => this.rooms.some(r => Math.hypot(x - r.cx, y - r.cy) < (r === far ? (final ? 6 : 3.5) : r === this.startRoom ? 3.5 : 1.6));
    const field = this.layout === 'field';
    for (const r of this.rooms) {
      const n = r === this.startRoom ? 1 : field ? randInt(3, th.dense ? 7 : 5) : randInt(1, th.dense ? 5 : 3);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, rr = rand(0.35, field ? 0.95 : 0.75);
        const ox = r.cx + Math.cos(a) * r.rx * rr, oy = r.cy + Math.sin(a) * r.ry * rr, rad = rand(0.7, th.dense || field ? 2.2 : 1.6);
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
    this.rooms = this.rooms.filter(r => r === this.startRoom || dmap[this.idx(r.cx, r.cy)] >= 0);
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

  // ⓐ 숲속 공터: 숲으로 둘러싸인 넓은 공터들을 굽은 큰길로 이음 (원래 구조)
  outClearings() {
    const W = this.w, H = this.h, final = this.floor >= FINAL_FLOOR;
    const target = final ? 6 : W >= 90 ? 9 + Math.min(3, Math.floor((this.floor - OUTDOOR_FLOOR) / 10)) : 8;
    for (let a = 0; a < 800 && this.rooms.length < target; a++) {
      // 최종층의 마지막 공터는 왕좌가 있는 큰 광장
      const big = final && this.rooms.length === target - 1;
      const rx = big ? 11 : randInt(6, 9), ry = big ? 11 : randInt(6, 9);
      const cx = randInt(rx + 4, W - rx - 5), cy = randInt(ry + 4, H - ry - 5);
      const hit = this.rooms.some(r => Math.abs(cx - r.cx) < rx + r.rx + 4 && Math.abs(cy - r.cy) < ry + r.ry + 4);
      if (hit) continue;
      this.rooms.push(blobRoom(cx, cy, rx, ry));
    }
    if (this.rooms.length < (final ? 5 : 6)) return false;
    for (const r of this.rooms) this.carveBlob(r);
    this.linkRooms((a, b) => this.carvePath(a, b, rand(1.6, 2.4)), 3, 34);
    if (final) this.throne = this.rooms[this.rooms.length - 1];
    return true;
  }

  // ⓑ 협곡: 맵 한쪽 끝에서 반대쪽 끝까지 굽이치는 긴 골짜기, 굽이마다 넓은 터, 옆으로 빠지는 막다른 골짜기
  outValley() {
    const W = this.w, H = this.h, horiz = chance(0.5), n = W >= 90 ? 7 : 6;
    const A = horiz ? W : H, B = horiz ? H : W, m = 9;
    const main = [];
    for (let k = 0; k <= n; k++) {
      const along = Math.round(lerp(m, A - m - 1, k / n));
      const across = Math.round(B / 2 + rand(-1, 1) * (B / 2 - 14));
      const [cx, cy] = horiz ? [along, across] : [across, along];
      main.push(blobRoom(cx, cy, randInt(5, 7), randInt(5, 7)));
    }
    for (let k = 0; k < n; k++) this.carvePath(main[k], main[k + 1], rand(2.2, 3.2), 3, 3);
    for (const r of main) this.carveBlob(r);
    this.rooms = main.slice();
    // 옆 골짜기 2~3개
    for (let k = 0, made = 0; k < 30 && made < 3; k++) {
      const o = main[randInt(1, n - 1)], s = chance(0.5) ? 1 : -1, d = randInt(14, 20);
      const cx = horiz ? o.cx + randInt(-4, 4) : o.cx + s * d, cy = horiz ? o.cy + s * d : o.cy + randInt(-4, 4);
      const rx = randInt(5, 7), ry = randInt(5, 7);
      if (cx - rx < 4 || cy - ry < 4 || cx + rx > W - 5 || cy + ry > H - 5) continue;
      if (this.rooms.some(r => Math.abs(cx - r.cx) < rx + r.rx + 3 && Math.abs(cy - r.cy) < ry + r.ry + 3)) continue;
      const r = blobRoom(cx, cy, rx, ry);
      this.carvePath(o, r, rand(1.6, 2.2), 2, 2);
      this.carveBlob(r);
      this.rooms.push(r);
      made++;
    }
    this.startRoom = main[0];
    this.stairsRoom = main[n];
    return true;
  }

  // ⓒ 벌판: 숲에 둘러싸인 아주 넓은 들판 하나. 곳곳에 나무숲·바위 무더기
  outField() {
    const W = this.w, H = this.h, mx = W / 2, my = H / 2, R = W * 0.43;
    const p0 = Math.random() * TAU, p1 = Math.random() * TAU, p2 = Math.random() * TAU;
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
      const a = Math.atan2(y - my, x - mx), rr = R * (1 + Math.sin(a * 3 + p0) * 0.1 + Math.sin(a * 5 + p1) * 0.07 + Math.sin(a * 9 + p2) * 0.04);
      if (Math.hypot(x - mx, y - my) < rr) this.tiles[y * W + x] = 1;
    }
    // 들판을 3×3으로 나눈 구역을 '방'으로 (몬스터 무리·상자·소품 자리)
    const S = Math.floor((W - 8) / 3);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const cx = 4 + i * S + (S >> 1) + randInt(-3, 3), cy = 4 + j * S + (S >> 1) + randInt(-3, 3);
      if (!this.walkable(cx, cy)) continue;
      const rad = (S >> 1) - 3;
      this.rooms.push({ x: cx - rad, y: cy - rad, w: rad * 2 + 1, h: rad * 2 + 1, cx, cy, rx: rad, ry: rad });
    }
    return this.rooms.length >= 6;
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

  corridor(a, b, width) {
    const w = width || (chance(0.5) ? 2 : 3);
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

  // 막힌 칸 둘레에서 걸을 수 있는 가장 가까운 칸. 같은 거리면 출발점(fx, fy 칸)에 가까운 쪽 (상인 뒤로 돌아가지 않게)
  nearestWalkable(tx, ty, fx, fy) {
    if (this.walkable(tx, ty)) return { tx, ty };
    for (let r = 1; r < 6; r++) {
      let best = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.walkable(tx + dx, ty + dy)) continue;
        const d = (fx == null ? 0 : (tx + dx - fx) ** 2 + (ty + dy - fy) ** 2) + (dx * dx + dy * dy) * 0.01;
        if (d < bd) { bd = d; best = { tx: tx + dx, ty: ty + dy }; }
      }
      if (best) return best;
    }
    return null;
  }

  // A* 길찾기 (8방향, 대각선은 모서리 통과 금지)
  findPath(sx, sy, gx, gy) {
    const s = { tx: Math.floor(sx / TILE), ty: Math.floor(sy / TILE) };
    let g = this.nearestWalkable(Math.floor(gx / TILE), Math.floor(gy / TILE), s.tx, s.ty);
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
