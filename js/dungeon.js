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
