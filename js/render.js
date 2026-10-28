'use strict';
// ───────── 렌더러: 아이소메트릭 타일, 깊이 정렬, 동적 조명 ─────────

const R = {
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1, zoom: 1, camX: 0, camY: 0, shx: 0, shy: 0,
  light: null, lctx: null, lightScale: 0.5, sprites: null, themeName: '', labels: [], showMap: false,
};

function initRender(canvas) {
  R.canvas = canvas;
  R.ctx = canvas.getContext('2d');
  R.light = document.createElement('canvas');
  R.lctx = R.light.getContext('2d');
  resizeRender();
  window.addEventListener('resize', resizeRender);
}

function resizeRender() {
  R.dpr = Math.min(1.5, window.devicePixelRatio || 1);
  R.W = window.innerWidth;
  R.H = window.innerHeight;
  R.canvas.width = Math.round(R.W * R.dpr);
  R.canvas.height = Math.round(R.H * R.dpr);
  R.light.width = Math.ceil(R.W * R.lightScale);
  R.light.height = Math.ceil(R.H * R.lightScale);
  R.zoom = clamp(Math.min(R.W / 1280, R.H / 760) * 1.08, 0.6, 1.25);
}

function worldToScreen(x, y, z = 0) {
  return {
    x: (isoX(x, y) - R.camX) * R.zoom + R.W / 2 + R.shx,
    y: (isoY(x, y) - z - R.camY) * R.zoom + R.H / 2 + R.shy,
  };
}
function screenToWorld(sx, sy) {
  const ix = (sx - R.W / 2 - R.shx) / R.zoom + R.camX;
  const iy = (sy - R.H / 2 - R.shy) / R.zoom + R.camY;
  return fromIso(ix, iy);
}
function facesLeft(a) { return Math.cos(a) - Math.sin(a) < 0; }

// ── 테마별 타일 스프라이트 ──
// 코드로 그린 타일은 Flare 타일 그림이 아직 없을 때 대신 쓰임
function buildThemeSprites(theme) {
  const floors = [], walls = [];
  for (let v = 0; v < 8; v++) floors.push(makeFloorTile(theme, v));
  for (let v = 0; v < 4; v++) walls.push(makeWallTile(theme, v));
  R.sprites = { floors, walls };
  R.themeName = theme.name;
}

// Flare 타일셋에서 층의 칸마다 쓸 타일 번호를 정함
function tileHash(x, y) { return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(x + y, 83492791)) >>> 0; }

function prepareFloorArt(d) {
  if (!HAS_FLARE) return;
  const set = FLARE.tiles[d.theme.tiles];
  const N = d.w * d.h;
  const floor = new Int16Array(N), wall = new Int16Array(N), low = new Uint8Array(N);
  const torchAt = new Map();
  for (const tc of d.torches) torchAt.set(d.idx(tc.tx, tc.ty), tc);
  const variant = (list, h) => (h % 6 === 0 && list.length > 2) ? list[2 + (h >>> 4) % (list.length - 2)] : list[(h >>> 3) % Math.min(2, list.length)];
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const i = d.idx(x, y), t = d.tiles[i];
    if (!t) continue;
    const h = tileHash(x, y);
    floor[i] = (t === 1 && set.floorDecor.length && h % 37 === 0) ? set.floorDecor[(h >>> 5) % set.floorDecor.length] : set.floor[(h >>> 2) % set.floor.length];
    if (t !== 2) continue;
    const se = d.walkable(x + 1, y), sw = d.walkable(x, y + 1), dg = d.walkable(x + 1, y + 1);
    const tc = torchAt.get(i);
    if (se && sw) wall[i] = set.outer[h % set.outer.length];
    else if (se) wall[i] = tc && set.torchSE.length ? set.torchSE[0] : variant(set.wallSE, h);
    else if (sw) wall[i] = tc && set.torchSW.length ? set.torchSW[0] : variant(set.wallSW, h);
    else if (dg) wall[i] = set.inner[h % set.inner.length];
    else { wall[i] = set.black[h % set.black.length]; low[i] = 1; }
  }
  // 횃불: 던전은 벽걸이 횃불 타일, 동굴은 바닥에 세운 화로
  for (const tc of d.torches) {
    const i = d.idx(tc.tx, tc.ty);
    const cx = (tc.tx - tc.ty) * TILE, cy = (tc.tx + tc.ty) * TILE / 2 + TILE / 2;
    if (set.torchSE.includes(wall[i])) { tc.kind = 'sconce'; tc.fx = cx + 3; tc.fy = cy - 105; }
    else if (set.torchSW.includes(wall[i])) { tc.kind = 'sconce'; tc.fx = cx - 5; tc.fy = cy - 105; }
    else {
      tc.kind = 'brazier';
      const fx = tc.face === 'right' ? tc.tx + 1 : tc.tx, fy = tc.face === 'right' ? tc.ty : tc.ty + 1;
      tc.bx = (fx + 0.5) * TILE; tc.by = (fy + 0.5) * TILE;
      tc.lx = tc.bx; tc.ly = tc.by;
      tc.fx = isoX(tc.bx, tc.by) - 2; tc.fy = isoY(tc.bx, tc.by) - 34;
    }
  }
  d.art = { set, floor, wall, low };
}

function tileAtlas(d) {
  if (!d.art) return null;
  return Assets.tintedAtlas(d.art.set.img, d.theme.tint);
}
function propsAtlas() { return HAS_FLARE ? Assets.get(FLARE.tiles.dungeon.img) : null; }

function drawTile(ctx, img, set, id, cx, cy, k = ART_K, alpha = 1) {
  const r = set.rects[id];
  if (!r) return;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, r[0], r[1], r[2], r[3], cx - r[4] * k, cy - r[5] * k, r[2] * k, r[3] * k);
  if (alpha !== 1) ctx.globalAlpha = 1;
}
// 방 앞쪽(화면 아래쪽) 벽은 디아블로처럼 낮게 잘라서 그림 — 방 안이 가려지지 않게
function drawLowWall(ctx, img, set, id, cx, cy) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 72, cy - 300); ctx.lineTo(cx - 72, cy); ctx.lineTo(cx - 64, cy);
  ctx.lineTo(cx, cy + 32); ctx.lineTo(cx + 64, cy); ctx.lineTo(cx + 72, cy); ctx.lineTo(cx + 72, cy - 300);
  ctx.closePath();
  ctx.clip();
  drawTile(ctx, img, set, id, cx, cy + 148);
  ctx.restore();
}

function drawProp(ctx, name, cx, cy, alpha = 1) {
  const img = propsAtlas();
  if (!img) return false;
  const set = FLARE.tiles.dungeon;
  drawTile(ctx, img, set, set.props[name], cx, cy, ART_K, alpha);
  return true;
}

function diamond(x) {
  x.beginPath(); x.moveTo(64, 0); x.lineTo(128, 32); x.lineTo(64, 64); x.lineTo(0, 32); x.closePath();
}

function makeFloorTile(theme, v) {
  const c = document.createElement('canvas');
  c.width = 130; c.height = 66;
  const x = c.getContext('2d');
  x.translate(1, 1);
  diamond(x);
  x.save();
  x.clip();
  x.fillStyle = theme.floor[v % theme.floor.length];
  x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(${chance(0.5) ? '0,0,0' : '255,255,255'},${rand(0.02, 0.07)})`;
    x.fillRect(rand(0, 128), rand(0, 64), rand(1, 3), rand(1, 2));
  }
  x.strokeStyle = theme.grout;
  x.lineWidth = 1.6;
  if (v % 3 !== 0) {
    x.beginPath(); x.moveTo(32, 16); x.lineTo(96, 48); x.moveTo(96, 16); x.lineTo(32, 48); x.stroke();
    // 각 판석 윗모서리 하이라이트
    x.strokeStyle = 'rgba(255,255,255,.05)';
    x.beginPath(); x.moveTo(34, 17); x.lineTo(64, 2); x.moveTo(66, 33); x.lineTo(96, 18); x.stroke();
  }
  if (v === 5 || v === 7) {
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 1;
    x.beginPath(); let px = rand(30, 90), py = rand(20, 44); x.moveTo(px, py);
    for (let i = 0; i < 4; i++) { px += rand(-14, 14); py += rand(-6, 6); x.lineTo(px, py); }
    x.stroke();
  }
  if (theme.moss && v % 2 === 0) {
    for (let i = 0; i < 6; i++) { x.fillStyle = theme.moss + '55'; x.beginPath(); x.ellipse(rand(20, 108), rand(14, 50), rand(4, 10), rand(2, 5), 0, 0, TAU); x.fill(); }
  }
  if (theme.lava && (v === 2 || v === 6)) {
    x.shadowColor = '#ff6a1a'; x.shadowBlur = 6;
    x.strokeStyle = '#ff7a2a'; x.lineWidth = 1.4;
    x.beginPath(); let px = rand(24, 50), py = rand(24, 40); x.moveTo(px, py);
    for (let i = 0; i < 5; i++) { px += rand(6, 14); py += rand(-5, 5); x.lineTo(px, py); }
    x.stroke();
    x.shadowBlur = 0;
  }
  x.restore();
  diamond(x);
  x.strokeStyle = theme.grout;
  x.lineWidth = 2;
  x.stroke();
  return c;
}

function makeWallTile(theme, v) {
  const H = WALL_H;
  const c = document.createElement('canvas');
  c.width = 130; c.height = 66 + H;
  const x = c.getContext('2d');
  x.translate(1, 1);
  const face = (pts, color, shadeDir) => {
    x.save();
    x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath();
    x.clip();
    x.fillStyle = color; x.fillRect(0, 0, 130, 66 + H);
    for (let i = 0; i < 220; i++) {
      x.fillStyle = `rgba(${chance(0.5) ? '0,0,0' : '255,255,255'},${rand(0.02, 0.08)})`;
      x.fillRect(rand(0, 128), rand(0, 64 + H), rand(1, 4), rand(1, 2));
    }
    // 벽돌 줄눈
    x.strokeStyle = theme.brick; x.lineWidth = 1.3;
    for (let k = 0, row = 0; k < H; k += 13, row++) {
      x.beginPath();
      if (shadeDir < 0) { x.moveTo(0, 32 + k); x.lineTo(64, 64 + k); } else { x.moveTo(64, 64 + k); x.lineTo(128, 32 + k); }
      x.stroke();
      for (let j = (row % 2) * 12; j < 64; j += 24) {
        const bx = shadeDir < 0 ? j : 64 + j;
        const by = shadeDir < 0 ? 32 + j / 2 + k : 64 - j / 2 + k;
        x.beginPath(); x.moveTo(bx, by); x.lineTo(bx, by + 13); x.stroke();
      }
    }
    if (theme.moss && v % 2 === 1) {
      for (let i = 0; i < 5; i++) { x.fillStyle = theme.moss + '66'; x.beginPath(); x.ellipse(rand(4, 124), rand(40, 60 + H), rand(4, 10), rand(3, 7), 0, 0, TAU); x.fill(); }
    }
    // 바닥 쪽 그늘
    const g = x.createLinearGradient(0, 32, 0, 64 + H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    x.fillStyle = g; x.fillRect(0, 0, 130, 66 + H);
    x.restore();
  };
  face([0, 32, 64, 64, 64, 64 + H, 0, 32 + H], theme.left, -1);
  face([64, 64, 128, 32, 128, 32 + H, 64, 64 + H], theme.right, 1);
  // 윗면
  diamond(x);
  x.fillStyle = theme.top; x.fill();
  x.save(); diamond(x); x.clip();
  for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(0,0,0,${rand(0.03, 0.1)})`; x.fillRect(rand(0, 128), rand(0, 64), rand(2, 5), rand(1, 2)); }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(0, 32); x.lineTo(64, 64); x.lineTo(128, 32); x.stroke();
  x.strokeStyle = 'rgba(0,0,0,.5)';
  x.beginPath(); x.moveTo(64, 64); x.lineTo(64, 64 + H); x.stroke();
  return c;
}

// ── 메인 렌더 ──
function renderFrame(t, focus) {
  const ctx = R.ctx, dpr = R.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#050407';
  ctx.fillRect(0, 0, R.canvas.width, R.canvas.height);
  if (!world) return;
  const d = world.dungeon;

  // 카메라: 초점을 부드럽게 따라감
  const fx = isoX(focus.x, focus.y), fy = isoY(focus.x, focus.y) - 30;
  R.camX = lerp(R.camX, fx, 0.18);
  R.camY = lerp(R.camY, fy, 0.18);
  if (Math.abs(R.camX - fx) > 800 || Math.abs(R.camY - fy) > 800) { R.camX = fx; R.camY = fy; }
  R.shx = (Math.random() - 0.5) * FX.shake;
  R.shy = (Math.random() - 0.5) * FX.shake;
  const z = R.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.W / 2 + R.shx - R.camX * z), dpr * (R.H / 2 + R.shy - R.camY * z));

  // 보이는 타일 범위
  const hw = R.W / 2 / z + 140, hh = R.H / 2 / z + 160;
  const corners = [[R.camX - hw, R.camY - hh], [R.camX + hw, R.camY - hh], [R.camX - hw, R.camY + hh + 230], [R.camX + hw, R.camY + hh + 230]].map(c => fromIso(c[0], c[1]));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c.x)) / TILE));
  const x1 = Math.min(d.w - 1, Math.ceil(Math.max(...corners.map(c => c.x)) / TILE));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map(c => c.y)) / TILE));
  const y1 = Math.min(d.h - 1, Math.ceil(Math.max(...corners.map(c => c.y)) / TILE));
  const onScreen = (ix, iy) => Math.abs(ix - R.camX) < hw && iy - R.camY > -hh && iy - R.camY < hh + 230;

  // 1) 바닥
  const sorted = [];
  const atlas = tileAtlas(d);
  const set = atlas ? d.art.set : null;
  const kf = ART_K * 1.02;  // 타일 사이 머리카락 같은 틈이 생기지 않게 살짝 겹침
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * d.w + tx;
      const tile = d.tiles[i];
      if (!tile || !d.explored[i]) continue;
      const ix = (tx - ty) * TILE, iy = (tx + ty) * TILE / 2;
      if (!onScreen(ix, iy + 32)) continue;
      if (atlas) drawTile(ctx, atlas, set, d.art.floor[i], ix, iy + TILE / 2, kf);
      else if (tile === 1) ctx.drawImage(R.sprites.floors[d.variant[i]], ix - 65, iy - 1);
      if (tile === 2) sorted.push({ d: (tx + ty + 1) * TILE, k: 0, tx, ty, ix, iy, i, v: d.variant[i] & 3 });
    }
  }
  const explored = (x, y) => d.explored[Math.floor(y / TILE) * d.w + Math.floor(x / TILE)];

  const props = propsAtlas();
  for (const dc of d.decor) {
    if (!explored(dc.x, dc.y)) continue;
    if (props && d.art && d.art.set.decor.length) {
      const dl = d.art.set.decor;
      drawTile(ctx, props, FLARE.tiles.dungeon, dl[tileHash(dc.x | 0, dc.y | 0) % dl.length], isoX(dc.x, dc.y), isoY(dc.x, dc.y));
    } else if (!props) drawDecor(ctx, dc);
  }
  drawFXGround(ctx);
  drawFXSprites(ctx, 'ground');
  drawStairs(ctx, d.stairs, t, explored(d.stairs.x, d.stairs.y));
  drawHazards(ctx, t);
  for (const g of world.ground) if (explored(g.x, g.y)) drawGroundObject(ctx, g, t);

  // 2) 벽 + 엔티티 깊이 정렬
  const p = player;
  const viewR = 1000;
  for (const m of world.monsters) {
    if (!p || dist(m.x, m.y, focus.x, focus.y) < viewR) sorted.push({ d: m.x + m.y - (m.dead ? 30 : 0), k: 1, m });
  }
  for (const c of world.chests) if (explored(c.x, c.y)) sorted.push({ d: c.x + c.y, k: 4, c });
  for (const pr of world.projectiles) sorted.push({ d: pr.x + pr.y, k: 3, pr });
  if (atlas) for (const tc of d.torches) if (tc.kind === 'brazier' && explored(tc.bx, tc.by)) sorted.push({ d: tc.bx + tc.by, k: 5, tc });
  if (p && Game.state !== 'title') sorted.push({ d: p.x + p.y, k: 2 });
  sorted.sort((a, b) => a.d - b.d);
  const pIsoX = p ? isoX(p.x, p.y) : 0, pIsoY = p ? isoY(p.x, p.y) : 0, pDepth = p ? p.x + p.y : 0;
  const playing = p && Game.state !== 'title';
  for (const s of sorted) {
    if (s.k === 0) {
      // 플레이어를 가리는 벽은 반투명
      const wallH = atlas ? 200 : WALL_H;
      const dy = s.iy + TILE / 2 - pIsoY;
      const fade = playing && s.d > pDepth && Math.abs(s.ix - pIsoX) < (atlas ? 150 : 120) && dy > -30 && dy < wallH + 40;
      if (atlas && d.art.low[s.i]) drawLowWall(ctx, atlas, set, d.art.wall[s.i], s.ix, s.iy + TILE / 2);
      else if (atlas) drawTile(ctx, atlas, set, d.art.wall[s.i], s.ix, s.iy + TILE / 2, ART_K, fade ? 0.3 : 1);
      else {
        if (fade) ctx.globalAlpha = 0.32;
        ctx.drawImage(R.sprites.walls[s.v], s.ix - 65, s.iy - 1 - WALL_H);
        ctx.globalAlpha = 1;
      }
    } else if (s.k === 1) drawMonster(ctx, s.m, t);
    else if (s.k === 2) drawPlayer(ctx, p, t);
    else if (s.k === 3) drawProjectile(ctx, s.pr, t);
    else if (s.k === 4) drawChest(ctx, s.c);
    else if (s.k === 5) drawProp(ctx, 'brazier', isoX(s.tc.bx, s.tc.by), isoY(s.tc.bx, s.tc.by));
  }
  if (!atlas) for (const tc of d.torches) if (explored(tc.x, tc.y)) drawTorchBracket(ctx, tc);
  drawFXParticles(ctx);
  drawFXSprites(ctx, 'top');

  // 3) 조명
  drawLighting(t, focus);

  // 4) 빛나는 효과 (어둠 위에 더함)
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.W / 2 + R.shx - R.camX * z), dpr * (R.H / 2 + R.shy - R.camY * z));
  ctx.globalCompositeOperation = 'lighter';
  for (const tc of d.torches) if (explored(tc.x, tc.y)) (atlas ? drawFlareFlame : drawTorchFlame)(ctx, tc, t);
  for (const pr of world.projectiles) if (pr.type === 'fireball') drawFireball(ctx, pr, t);
  drawFXSprites(ctx, 'glow');
  if (p && p.whirl) drawWhirlArcs(ctx, p, t);
  if (d.stairs.open && explored(d.stairs.x, d.stairs.y)) drawStairsGlow(ctx, d.stairs, t);
  ctx.globalCompositeOperation = 'source-over';
  drawFXAdditive(ctx, t);

  // 5) 화면 좌표 오버레이
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverheadBars(ctx);
  drawLabels(ctx, explored);
  drawDamageTexts(ctx);
  if (R.showMap) drawAutomap(ctx, R.W / 2, R.H / 2, 7, 0.55, true);
}

function drawDecor(ctx, dc) {
  const sx = isoX(dc.x, dc.y), sy = isoY(dc.x, dc.y);
  if (dc.type === 'bones') {
    ctx.strokeStyle = '#b9b19c'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = dc.rot + i * 1.3;
      ctx.beginPath(); ctx.moveTo(sx - Math.cos(a) * 9 * dc.s, sy - Math.sin(a) * 4 * dc.s); ctx.lineTo(sx + Math.cos(a) * 9 * dc.s, sy + Math.sin(a) * 4 * dc.s); ctx.stroke();
    }
  } else if (dc.type === 'skull') {
    circle(ctx, sx, sy - 4, 5 * dc.s, '#c9c1aa');
    ctx.fillStyle = '#1a140f'; ctx.fillRect(sx - 3, sy - 5, 2, 2); ctx.fillRect(sx + 1, sy - 5, 2, 2);
  } else if (dc.type === 'crack') {
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sx - 20 * dc.s, sy); ctx.lineTo(sx - 4, sy + 3); ctx.lineTo(sx + 6, sy - 4); ctx.lineTo(sx + 22 * dc.s, sy + 2); ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(30,8,6,.45)';
    ctx.beginPath(); ctx.ellipse(sx, sy, 24 * dc.s, 11 * dc.s, 0, 0, TAU); ctx.fill();
  }
}

function drawStairs(ctx, st, t, seen) {
  if (!seen) return;
  const sx = isoX(st.x, st.y), sy = isoY(st.x, st.y);
  const props = propsAtlas();
  if (props) {
    // 바닥으로 꺼지는 계단 구덩이 (그림 중심을 계단 위치에 맞춤)
    const set = FLARE.tiles.dungeon, r = set.rects[set.props.stairs], k = ART_K * 0.75;
    ctx.drawImage(props, r[0], r[1], r[2], r[3], sx - r[2] * k / 2, sy - r[3] * k / 2, r[2] * k, r[3] * k);
    if (!st.open) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(sx, sy, 120, 60, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6c6c76'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(sx - 70, sy - 24); ctx.lineTo(sx + 70, sy + 24); ctx.moveTo(sx + 70, sy - 24); ctx.lineTo(sx - 70, sy + 24); ctx.stroke();
    }
    return;
  }
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.2;
    ctx.fillStyle = ['#1a1412', '#120d0b', '#0b0807', '#030202'][i];
    ctx.beginPath(); ctx.moveTo(sx, sy - 30 * s + i * 4); ctx.lineTo(sx + 60 * s, sy + i * 4); ctx.lineTo(sx, sy + 30 * s + i * 4); ctx.lineTo(sx - 60 * s, sy + i * 4); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = st.open ? '#7a2a1a' : '#3a3a40'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx, sy - 31); ctx.lineTo(sx + 62, sy); ctx.lineTo(sx, sy + 31); ctx.lineTo(sx - 62, sy); ctx.closePath(); ctx.stroke();
  if (!st.open) {
    ctx.strokeStyle = '#5c5c66'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx - 40, sy - 10); ctx.lineTo(sx + 40, sy + 10); ctx.moveTo(sx + 40, sy - 10); ctx.lineTo(sx - 40, sy + 10); ctx.stroke();
  }
}

function drawStairsGlow(ctx, st, t) {
  const sx = isoX(st.x, st.y), sy = isoY(st.x, st.y);
  const a = 0.35 + Math.sin(t * 3) * 0.12;
  const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70);
  g.addColorStop(0, `rgba(255,70,30,${a})`); g.addColorStop(1, 'rgba(255,70,30,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(sx, sy, 70, 35, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 6; i++) {
    const an = t * 0.8 + i * (TAU / 6);
    circle(ctx, sx + Math.cos(an) * 52, sy + Math.sin(an) * 26, 2.2, `rgba(255,140,60,${0.6 + Math.sin(t * 4 + i) * 0.3})`);
  }
}

function drawHazards(ctx, t) {
  for (const h of world.hazards) {
    const k = h.t / h.delay;
    const sx = isoX(h.x, h.y), sy = isoY(h.x, h.y);
    const col = h.kind === 'fire' ? '255,120,40' : '255,40,30';
    ctx.fillStyle = `rgba(${col},${0.12 + k * 0.2})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, h.r * 1.414 * k, h.r * 0.707 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(${col},${0.5 + Math.sin(t * 20) * 0.2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, h.r * 1.414, h.r * 0.707, 0, 0, TAU); ctx.stroke();
  }
}

function drawGroundObject(ctx, g, t) {
  const sx = isoX(g.x, g.y), sy = isoY(g.x, g.y);
  drawShadow(ctx, sx, sy, 10, 4, 0.35);
  if (Assets.ready('icons.webp')) {
    const idx = g.kind === 'gold' ? 88 : g.kind === 'potion' ? ICON_POTION : itemIconIndex(g.item);
    const size = g.kind === 'item' ? 30 : 22;
    if (g.kind === 'item' && g.item.rarity > 0) {
      const col = RARITY[g.item.rarity].color;
      const gr = ctx.createRadialGradient(sx, sy - g.z - 12, 2, sx, sy - g.z - 12, 22);
      gr.addColorStop(0, col + '66'); gr.addColorStop(1, col + '00');
      ctx.fillStyle = gr;
      ctx.fillRect(sx - 22, sy - g.z - 34, 44, 44);
    }
    drawIcon(ctx, idx, sx - size / 2, sy - g.z - size + 4, size);
    return;
  }
  ctx.save();
  ctx.translate(sx, sy - g.z);
  if (g.kind === 'gold') {
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#c99a2e' : '#f0c75a'; ctx.beginPath(); ctx.ellipse(-5 + i * 3, -2 - (i % 2) * 2, 4, 2, 0, 0, TAU); ctx.fill(); }
  } else if (g.kind === 'potion') {
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(-1.5, -14, 3, 4);
    circle(ctx, 0, -6, 5, '#b01d22');
    circle(ctx, -1.5, -7.5, 1.6, 'rgba(255,255,255,.5)');
  } else {
    const img = Game.iconImage(g.item);
    if (img && img.complete) ctx.drawImage(img, -14, -24, 28, 28);
  }
  ctx.restore();
}

function drawChest(ctx, c) {
  const sx = isoX(c.x, c.y), sy = isoY(c.x, c.y);
  if (drawProp(ctx, c.open ? 'chestOpen' : 'chest', sx, sy)) return;
  drawShadow(ctx, sx, sy + 2, 22, 9, 0.5);
  ctx.save();
  ctx.translate(sx, sy);
  poly(ctx, [-18, -2, 18, -2, 18, -20, -18, -20], '#5a3a1e', '#2a1a0c', 1.2);
  ctx.fillStyle = '#3c2610'; ctx.fillRect(-18, -12, 36, 3);
  ctx.fillStyle = '#8c8f96'; ctx.fillRect(-14, -20, 3, 18); ctx.fillRect(11, -20, 3, 18);
  if (c.open) {
    poly(ctx, [-18, -20, 18, -20, 15, -34, -15, -34], '#4a2f16', '#2a1a0c', 1.2);
    ctx.fillStyle = '#1a0f06'; ctx.fillRect(-16, -22, 32, 3);
  } else {
    poly(ctx, [-18, -20, 18, -20, 16, -27, -16, -27], '#6a4523', '#2a1a0c', 1.2);
    ctx.fillStyle = '#d6a94e'; ctx.fillRect(-3, -22, 6, 6);
  }
  ctx.restore();
}

function drawTorchBracket(ctx, tc) {
  const sx = isoX(tc.x, tc.y), sy = isoY(tc.x, tc.y) - 34;
  seg(ctx, sx, sy + 10, sx, sy, 3, '#2b2420');
  poly(ctx, [sx - 4, sy, sx + 4, sy, sx + 2, sy + 5, sx - 2, sy + 5], '#4a3a30');
}

function drawTorchFlame(ctx, tc, t) {
  const sx = isoX(tc.x, tc.y), sy = isoY(tc.x, tc.y) - 36;
  const f = Math.sin(t * 13 + tc.phase) * 0.15 + Math.sin(t * 7.3 + tc.phase) * 0.1;
  const g = ctx.createRadialGradient(sx, sy - 4, 0, sx, sy - 4, 26);
  g.addColorStop(0, 'rgba(255,170,70,.55)'); g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(sx - 26, sy - 30, 52, 52);
  ctx.fillStyle = '#ff9a2a';
  ctx.beginPath(); ctx.moveTo(sx - 4, sy); ctx.quadraticCurveTo(sx - 5, sy - 8, sx + f * 10, sy - 14 - f * 6); ctx.quadraticCurveTo(sx + 5, sy - 8, sx + 4, sy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe2a0';
  ctx.beginPath(); ctx.moveTo(sx - 2, sy); ctx.quadraticCurveTo(sx - 2, sy - 5, sx + f * 6, sy - 8); ctx.quadraticCurveTo(sx + 2, sy - 5, sx + 2, sy); ctx.closePath(); ctx.fill();
  if (chance(0.04)) fxEmbers(tc.x, tc.y, 1, '#ff9a3a', 2);
}

// 횃불 불꽃 (벽걸이 횃불 / 화로) — 더하기 합성 단계에서 그림
function drawFlareFlame(ctx, tc, t) {
  if (!tc.kind) return;
  const fl = Math.sin(t * 13 + tc.phase) * 0.15 + Math.sin(t * 7.3 + tc.phase) * 0.1;
  const r = tc.kind === 'brazier' ? 30 : 22;
  const g = ctx.createRadialGradient(tc.fx, tc.fy, 0, tc.fx, tc.fy, r * (1 + fl * 0.3));
  g.addColorStop(0, 'rgba(255,190,90,.55)'); g.addColorStop(0.4, 'rgba(255,120,40,.25)'); g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(tc.fx - r * 1.4, tc.fy - r * 1.4, r * 2.8, r * 2.8);
  if (tc.kind === 'sconce') {
    ctx.fillStyle = '#ffb04a';
    ctx.beginPath(); ctx.moveTo(tc.fx - 3, tc.fy); ctx.quadraticCurveTo(tc.fx - 4, tc.fy - 6, tc.fx + fl * 8, tc.fy - 12); ctx.quadraticCurveTo(tc.fx + 4, tc.fy - 6, tc.fx + 3, tc.fy); ctx.closePath(); ctx.fill();
  }
  if (chance(0.05)) {
    const w = fromIso(tc.fx, tc.fy);
    FX.particles.push({ kind: 'ember', add: true, x: w.x + rand(-3, 3), y: w.y + rand(-3, 3), z: 0, vx: rand(-10, 10), vy: rand(-10, 10), vz: rand(30, 70), g: -10, life: rand(0.4, 0.9), size: rand(1, 2), color: '#ff9a3a' });
  }
}

function drawPlayer(ctx, p, t) {
  const sx = isoX(p.x, p.y), sy = isoY(p.x, p.y);
  const shadowK = 1 - p.z / 160;
  if (p.buffs.berserk > 0) {
    const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 40);
    g.addColorStop(0, 'rgba(255,40,20,.45)'); g.addColorStop(1, 'rgba(255,40,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, 40, 20, 0, 0, TAU); ctx.fill();
  }
  if (HAS_FLARE && Assets.ready(FLARE.hero.default_chest.img)) {
    if (p.z > 0) drawShadow(ctx, sx, sy, 17 * shadowK, 7 * shadowK);
    ctx.save();
    if (HAS_FILTER) {
      if (p.hurtT > 0) ctx.filter = 'brightness(1.6) sepia(1) saturate(4) hue-rotate(-40deg)';
      else if (p.buffs.berserk > 0) ctx.filter = 'saturate(1.5) brightness(1.1) hue-rotate(-12deg)';
    }
    drawHeroFlare(ctx, p, t, sx, sy - p.z);
    ctx.restore();
    return;
  }
  drawShadow(ctx, sx, sy, 17 * shadowK, 7 * shadowK);
  ctx.save();
  ctx.translate(sx, sy - p.z);
  let fx = facesLeft(p.facing) ? -1 : 1;
  if (p.whirl) { const c = Math.cos(t * 26); fx = (c < 0 ? -1 : 1) * Math.max(0.25, Math.abs(c)); }
  if (p.dead) { ctx.rotate(1.45); ctx.globalAlpha = 0.9; }
  ctx.scale(fx * 1.08, 1.08);
  if (HAS_FILTER) {
    if (p.hurtT > 0) ctx.filter = 'brightness(1.7) sepia(1) saturate(4) hue-rotate(-40deg)';
    else if (p.buffs.berserk > 0) ctx.filter = 'saturate(1.5) brightness(1.1) hue-rotate(-12deg)';
  }
  drawBarbarian(ctx, p, t);
  ctx.restore();
}

function drawWhirlArcs(ctx, p, t) {
  const sx = isoX(p.x, p.y), sy = isoY(p.x, p.y) - 30;
  const r = p.whirl.v.radius;
  for (let i = 0; i < 3; i++) {
    const a0 = t * 16 + i * 2.1;
    ctx.strokeStyle = `rgba(230,210,170,${0.35 - i * 0.08})`;
    ctx.lineWidth = 5 - i;
    ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.1, r * 0.5, 0, a0, a0 + 1.6); ctx.stroke();
  }
}

function drawMonster(ctx, m, t) {
  if (m.dead && m.deadT > 8) return;
  const sx = isoX(m.x, m.y), sy = isoY(m.x, m.y);
  const s = m.scale;
  if (!m.dead && m.tier > 0) {
    const col = m.tier === 1 ? '70,110,255' : m.tier === 2 ? '214,169,92' : '255,70,30';
    const pulse = 0.35 + Math.sin(t * 4 + m.seed) * 0.12;
    const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 34 * s);
    g.addColorStop(0, `rgba(${col},${pulse})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, 34 * s, 16 * s, 0, 0, TAU); ctx.fill();
  }
  const fs = monsterSprite(m);
  if (fs && Assets.ready(fs.img)) {
    const [anim, idx, dir] = monsterPose(m, fs, t);
    ctx.save();
    if (m.dead && m.deadT > 6) ctx.globalAlpha = Math.max(0, 1 - (m.deadT - 6) / 2);
    if (HAS_FILTER && m.hitFlash > 0 && !m.dead) ctx.filter = 'brightness(2.4)';
    else if (HAS_FILTER && m.tier === 3 && m.pal.skin && m.sprite !== 'wyvern_fire') ctx.filter = 'hue-rotate(-20deg) saturate(1.4) brightness(0.9)';
    drawSpriteFrame(ctx, fs, anim, dir, idx, sx, sy, m.scale);
    ctx.restore();
  } else {
    drawMonsterFallback(ctx, m, t, sx, sy);
  }
  if (m.stun > 0 && !m.dead) {
    const top = monsterHeight(m);
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + i * 2.1;
      circle(ctx, sx + Math.cos(a) * 12 * s, sy - top + Math.sin(a) * 4, 2.2, '#ffe27a');
    }
  }
}

function monsterHeight(m) { return (MONSTERS[m.type].h || 70) * m.scale * (m.sprite === 'wyvern_fire' ? 0.85 : 1); }

// Flare 그림이 아직 없을 때 쓰는 코드 그림
function drawMonsterFallback(ctx, m, t, sx, sy) {
  const s = m.scale;
  if (!m.dead) drawShadow(ctx, sx, sy, m.r * 1.2, m.r * 0.5);
  ctx.save();
  ctx.translate(sx, sy);
  if (m.dead) {
    const k = Math.min(1, m.deadT * 3.5);
    ctx.globalAlpha = m.deadT > 6 ? Math.max(0, 1 - (m.deadT - 6) / 2) : 1;
    ctx.rotate(k * 1.45 * m.fallDir);
    ctx.scale(1, 1 - k * 0.15);
  }
  const fl = facesLeft(m.facing) ? -1 : 1;
  ctx.scale(fl * s, s);
  if (HAS_FILTER && m.hitFlash > 0 && !m.dead) ctx.filter = 'brightness(2.6)';
  const draw = MONSTER_DRAW[m.type];
  if (draw) draw(ctx, m, t, m.pal);
  ctx.restore();
}

const PROJ_SPRITE = { axe: 'throw_axe', arrow: 'arrows' };

function drawProjectile(ctx, pr, t) {
  const sx = isoX(pr.x, pr.y), sy = isoY(pr.x, pr.y);
  const fs = PROJ_SPRITE[pr.type] && spriteSet('effects', PROJ_SPRITE[pr.type]);
  if (fs && Assets.ready(fs.img)) {
    const a = fs.anims.power;
    drawSpriteFrame(ctx, fs, 'power', flareDir(Math.atan2(pr.vy, pr.vx)), animIndex(a, (pr.t || 0) * 1000), sx, sy, pr.type === 'axe' ? 0.9 : 1);
    return;
  }
  drawShadow(ctx, sx, sy, 6, 2.5, 0.3);
  if (pr.type === 'axe') {
    ctx.save();
    ctx.translate(sx, sy - pr.z);
    ctx.rotate(pr.spin);
    drawWeapon(ctx, 0, -14, 0, { icon: 'axe', rarity: 0 }, 0.8);
    ctx.restore();
  } else if (pr.type === 'arrow') {
    const ex = isoX(pr.vx, pr.vy), ey = isoY(pr.vx, pr.vy);
    const len = Math.hypot(ex, ey) || 1;
    const ux = ex / len, uy = ey / len;
    seg(ctx, sx - ux * 16, sy - pr.z - uy * 16, sx + ux * 4, sy - pr.z + uy * 4, 1.6, '#c9b48a');
    seg(ctx, sx + ux * 2, sy - pr.z + uy * 2, sx + ux * 7, sy - pr.z + uy * 7, 2.6, '#8b8f96');
  }
}

function drawFireball(ctx, pr, t) {
  const fs = spriteSet('effects', 'fireball');
  if (fs && Assets.ready(fs.img)) {
    drawSpriteFrame(ctx, fs, 'power', flareDir(Math.atan2(pr.vy, pr.vx)), animIndex(fs.anims.power, (pr.t || 0) * 1000), isoX(pr.x, pr.y), isoY(pr.x, pr.y), 0.8);
    return;
  }
  const sx = isoX(pr.x, pr.y), sy = isoY(pr.x, pr.y) - pr.z;
  const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, 18);
  g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.35, 'rgba(255,140,40,.9)'); g.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, 18 + Math.sin(t * 30) * 2, 0, TAU); ctx.fill();
}

// ── 조명 ──
function collectLights(t, focus) {
  const lights = [];
  const p = player;
  if (p && Game.state !== 'title') lights.push({ x: p.x, y: p.y, z: p.z * 0.5, r: 470, i: 1, c: p.buffs.berserk > 0 ? [255, 150, 120] : [255, 234, 208] });
  else lights.push({ x: focus.x, y: focus.y, r: 520, i: 0.9 });
  const d = world.dungeon;
  for (const tc of d.torches) {
    if (d.art && !tc.kind) continue;
    if (dist(tc.x, tc.y, focus.x, focus.y) > 1100) continue;
    if (!d.explored[Math.floor(tc.y / TILE) * d.w + Math.floor(tc.x / TILE)]) continue;
    const fl = 0.85 + Math.sin(t * 11 + tc.phase) * 0.06 + Math.sin(t * 5.7 + tc.phase) * 0.05;
    lights.push({ x: tc.lx, y: tc.ly, r: 300 * fl, i: 0.95 * fl, c: [255, 168, 92] });
  }
  for (const pr of world.projectiles) if (pr.type === 'fireball') lights.push({ x: pr.x, y: pr.y, r: 170, i: 0.85, c: [255, 140, 60] });
  for (const f of world.flashes) lights.push({ x: f.x, y: f.y, r: f.r, i: Math.min(1, f.life * 4), c: f.color });
  for (const b of FX.beams) lights.push({ x: b.x, y: b.y, r: 160, i: 0.6, c: [255, 205, 130] });
  if (d.stairs.open) lights.push({ x: d.stairs.x, y: d.stairs.y, r: 220, i: 0.75, c: [255, 96, 56] });
  for (const c of world.chests) if (!c.open && dist(c.x, c.y, focus.x, focus.y) < 900) lights.push({ x: c.x, y: c.y, r: 90, i: 0.35 });
  return lights;
}

// 절반 해상도 '빛 지도'에 색이 있는 빛을 더한 뒤, 장면에 곱하기(multiply)로 한 번에 합성
function drawLighting(t, focus) {
  const l = R.lctx, s = R.lightScale, ctx = R.ctx;
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'source-over';
  l.fillStyle = '#0b090f';
  l.fillRect(0, 0, R.light.width, R.light.height);
  l.globalCompositeOperation = 'lighter';
  for (const L of collectLights(t, focus)) {
    const sp = worldToScreen(L.x, L.y, L.z || 0);
    const r = L.r * R.zoom;
    if (sp.x < -r || sp.y < -r || sp.x > R.W + r || sp.y > R.H + r) continue;
    const c = L.c || [255, 236, 214];
    const k = L.i;
    l.save();
    l.translate(sp.x * s, sp.y * s);
    l.scale(1, 0.62);
    const rs = r * s;
    const g = l.createRadialGradient(0, 0, 0, 0, 0, rs);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${k})`);
    g.addColorStop(0.45, `rgba(${c[0]},${c[1]},${c[2]},${k * 0.62})`);
    g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    l.fillStyle = g;
    l.fillRect(-rs, -rs, rs * 2, rs * 2);
    l.restore();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(R.light, 0, 0, R.canvas.width, R.canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

// ── 화면 좌표 오버레이 ──
function drawOverheadBars(ctx) {
  const p = player;
  if (!p) return;
  for (const m of world.monsters) {
    if (m.dead || (m.life >= m.maxLife && m.tier === 0)) continue;
    if (dist(m.x, m.y, p.x, p.y) > 700) continue;
    const sp = worldToScreen(m.x, m.y, monsterHeight(m) + 8);
    const w = (m.tier ? 44 : 30) * Math.min(1.4, m.scale);
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(sp.x - w / 2 - 1, sp.y - 1, w + 2, 5);
    ctx.fillStyle = m.tier === 1 ? '#5a7cff' : m.tier >= 2 ? '#e0a94a' : '#c0242a';
    ctx.fillRect(sp.x - w / 2, sp.y, w * (m.life / m.maxLife), 3);
  }
}

function drawLabels(ctx, explored) {
  R.labels = [];
  const p = player;
  if (!p) return;
  ctx.font = '600 12px ' + Game.fontUI;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const list = world.ground.filter(g => explored(g.x, g.y) && dist(g.x, g.y, p.x, p.y) < 900);
  list.sort((a, b) => (b.kind === 'item' ? b.item.rarity : -1) - (a.kind === 'item' ? a.item.rarity : -1));
  const placed = [];
  for (const g of list) {
    const sp = worldToScreen(g.x, g.y, 30 + g.z);
    let text, color;
    if (g.kind === 'gold') { text = `${g.amount} 골드`; color = '#e8d9a8'; }
    else if (g.kind === 'potion') { text = '생명력 물약'; color = '#ff7a7a'; }
    else { text = g.item.name; color = RARITY[g.item.rarity].color; }
    const w = ctx.measureText(text).width + 12, h = 18;
    const rect = { x: sp.x - w / 2, y: sp.y - h / 2, w, h };
    for (let k = 0; k < 8; k++) {
      const hit = placed.find(r => rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y);
      if (!hit) break;
      rect.y = hit.y - h - 2;
    }
    placed.push(rect);
    const hov = Input.hover && Input.hover.kind === 'ground' && Input.hover.ref === g;
    ctx.fillStyle = hov ? 'rgba(40,30,20,.92)' : 'rgba(0,0,0,.72)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (hov || (g.kind === 'item' && g.item.rarity >= 2)) {
      ctx.strokeStyle = hov ? '#d6b47a' : color + '88';
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
    R.labels.push({ rect, g });
  }
  // 계단 표시
  const st = world.dungeon.stairs;
  if (explored(st.x, st.y) && dist(st.x, st.y, p.x, p.y) < 700) {
    const sp = worldToScreen(st.x, st.y, 40);
    ctx.font = '700 13px ' + Game.fontUI;
    ctx.fillStyle = st.open ? '#ff9a6a' : '#9a9aa6';
    ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 3;
    const label = st.open ? `▼ ${world.floor + 1}층으로 내려가기` : '봉인된 계단';
    ctx.strokeText(label, sp.x, sp.y);
    ctx.fillText(label, sp.x, sp.y);
  }
}

function drawDamageTexts(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const tx of FX.texts) {
    const sp = worldToScreen(tx.x, tx.y, tx.z);
    const k = tx.life / tx.max;
    const pop = tx.crit ? 1 + Math.max(0, (k - 0.75) * 2.4) : 1;
    ctx.globalAlpha = Math.min(1, k * 2.2);
    ctx.font = `${tx.crit ? 800 : 700} ${Math.round(tx.size * pop)}px ${Game.fontUI}`;
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.lineWidth = 3.5;
    ctx.strokeText(tx.text, sp.x, sp.y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.text, sp.x, sp.y);
  }
  ctx.globalAlpha = 1;
}

// 탐험한 지도 (작은 미니맵 / Tab 전체 지도 공용)
function drawAutomap(ctx, cx, cy, s, alpha, big) {
  const d = world.dungeon, p = player;
  if (!p) return;
  const ptx = p.x / TILE, pty = p.y / TILE;
  const ox = cx - (ptx - pty) * s, oy = cy - (ptx + pty) * s / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
    const i = ty * d.w + tx;
    if (!d.explored[i]) continue;
    const t = d.tiles[i];
    if (!t) continue;
    const mx = ox + (tx - ty) * s, my = oy + (tx + ty) * s / 2;
    if (!big && (mx < -s * 2 || my < -s || mx > cx * 2 + s * 2 || my > cy * 2 + s)) continue;
    ctx.fillStyle = t === 2 ? '#b8a684' : 'rgba(90,80,70,.55)';
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + s, my + s / 2); ctx.lineTo(mx, my + s); ctx.lineTo(mx - s, my + s / 2); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const st = d.stairs;
  if (d.explored[Math.floor(st.y / TILE) * d.w + Math.floor(st.x / TILE)]) {
    const mx = ox + (st.x - st.y) / TILE * s, my = oy + (st.x + st.y) / TILE * s / 2;
    ctx.fillStyle = st.open ? '#ff5a2a' : '#8a8a96';
    ctx.beginPath(); ctx.arc(mx, my, big ? 6 : 3.5, 0, TAU); ctx.fill();
  }
  for (const m of world.monsters) {
    if (m.dead || dist(m.x, m.y, p.x, p.y) > 520) continue;
    const mx = ox + (m.x - m.y) / TILE * s, my = oy + (m.x + m.y) / TILE * s / 2;
    ctx.fillStyle = m.tier ? '#ffb84a' : '#d8342a';
    ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
  }
  ctx.fillStyle = '#7ad0ff';
  ctx.beginPath(); ctx.arc(cx, cy, big ? 5 : 3, 0, TAU); ctx.fill();
  ctx.restore();
}
