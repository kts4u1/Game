'use strict';
// ───────── 시각 효과: 파티클, 피해 숫자, 충격파, 바닥 흔적, 번개 ─────────

const FX = {
  particles: [], texts: [], rings: [], decals: [], bolts: [], beams: [], shake: 0,
  reset() {
    this.particles.length = 0; this.texts.length = 0; this.rings.length = 0;
    this.decals.length = 0; this.bolts.length = 0; this.beams.length = 0; this.shake = 0;
  },
};

function fxBlood(x, y, z, n, color = '#8c1014', spread = 1) {
  for (let i = 0; i < n; i++) {
    FX.particles.push({
      kind: 'blood', x, y, z, vx: rand(-90, 90) * spread, vy: rand(-90, 90) * spread, vz: rand(30, 170),
      g: 450, life: rand(0.4, 0.9), size: rand(1.4, 3.2), color,
    });
  }
}
function fxSparks(x, y, z, n, color = '#ffcf6a', speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    FX.particles.push({
      kind: 'spark', add: true, x, y, z, vx: Math.cos(a) * rand(30, speed), vy: Math.sin(a) * rand(30, speed), vz: rand(20, 160),
      g: 300, life: rand(0.2, 0.5), size: rand(1, 2.2), color,
    });
  }
}
function fxEmbers(x, y, n, color = '#ff8a2a', spread = 20) {
  for (let i = 0; i < n; i++) {
    FX.particles.push({
      kind: 'ember', add: true, x: x + rand(-spread, spread), y: y + rand(-spread, spread), z: rand(0, 20),
      vx: rand(-15, 15), vy: rand(-15, 15), vz: rand(30, 90), g: -10, life: rand(0.4, 1.0), size: rand(1.2, 3), color,
    });
  }
}
function fxDust(x, y, n, color = '150,130,105', speed = 90) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    FX.particles.push({
      kind: 'dust', x, y, z: rand(2, 10), vx: Math.cos(a) * rand(20, speed), vy: Math.sin(a) * rand(20, speed), vz: rand(5, 30),
      g: 0, life: rand(0.5, 1.0), size: rand(6, 14), color,
    });
  }
}
function fxRock(x, y, size = 1) {
  FX.particles.push({ kind: 'rock', x, y, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0.55, max: 0.55, size: rand(12, 20) * size, color: '#4a4036', rot: rand(-0.3, 0.3) });
}
function fxText(x, y, text, color, size = 16, opts = {}) {
  FX.texts.push({ x, y, z: opts.z || 46, text, color, size, life: opts.life || 0.9, max: opts.life || 0.9, vx: rand(-14, 14), crit: !!opts.crit });
}
function fxRing(x, y, r0, r1, dur, color, width = 4, add = true) {
  FX.rings.push({ x, y, r0, r1, t: 0, dur, color, width, add });
}
function fxDecal(type, x, y, size = 1, color) {
  const d = { type, x, y, size, color, rot: Math.random() * TAU, blobs: [] };
  if (type === 'blood') for (let i = 0; i < 5; i++) d.blobs.push([rand(-10, 10) * size, rand(-10, 10) * size, rand(4, 10) * size]);
  if (type === 'crack') {
    // 중심에서 갈라지는 짧은 균열
    const branches = randInt(4, 6);
    for (let b = 0; b < branches; b++) {
      let a = (b / branches) * TAU + rand(-0.4, 0.4);
      let px = 0, py = 0, len = rand(9, 15) * size;
      for (let s = 0; s < 3; s++) {
        a += rand(-0.5, 0.5);
        const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len;
        d.blobs.push([px, py, nx, ny, 2.4 - s * 0.7]);
        px = nx; py = ny; len *= 0.72;
      }
    }
  }
  FX.decals.push(d);
  if (FX.decals.length > 260) FX.decals.shift();
}
function fxBolt(points, color = '#bfe4ff') {
  FX.bolts.push({ points, life: 0.28, max: 0.28, color });
}
function fxBeam(x, y, color, life = 2.5) { FX.beams.push({ x, y, color, life, max: life }); }
function fxShake(a) { FX.shake = Math.max(FX.shake, a); }

function updateFX(dt) {
  const ps = FX.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps.splice(i, 1); continue; }
    if (p.kind === 'rock') continue;
    if (p.kind === 'dust') { p.vx *= 0.94; p.vy *= 0.94; p.size += dt * 10; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vz -= p.g * dt; p.z += p.vz * dt;
    if (p.z < 0) {
      p.z = 0;
      if (p.kind === 'blood') {
        if (chance(0.12)) fxDecal('drop', p.x, p.y, rand(0.6, 1.2), p.color);
        ps.splice(i, 1);
        continue;
      }
      p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6;
    }
  }
  if (ps.length > 900) ps.splice(0, ps.length - 900);
  for (let i = FX.texts.length - 1; i >= 0; i--) {
    const t = FX.texts[i];
    t.life -= dt; t.z += 38 * dt; t.x += t.vx * dt;
    if (t.life <= 0) FX.texts.splice(i, 1);
  }
  for (let i = FX.rings.length - 1; i >= 0; i--) {
    const r = FX.rings[i];
    r.t += dt;
    if (r.t >= r.dur) FX.rings.splice(i, 1);
  }
  for (let i = FX.bolts.length - 1; i >= 0; i--) { FX.bolts[i].life -= dt; if (FX.bolts[i].life <= 0) FX.bolts.splice(i, 1); }
  for (let i = FX.beams.length - 1; i >= 0; i--) { FX.beams[i].life -= dt; if (FX.beams[i].life <= 0) FX.beams.splice(i, 1); }
  FX.shake = Math.max(0, FX.shake - dt * 35);
}

// 바닥에 붙는 효과 (조명 전, 엔티티보다 먼저)
function drawFXGround(ctx) {
  for (const d of FX.decals) {
    const sx = isoX(d.x, d.y), sy = isoY(d.x, d.y);
    if (d.type === 'blood' || d.type === 'drop') {
      ctx.fillStyle = d.color || 'rgba(70,6,8,.8)';
      if (d.type === 'drop') { ctx.beginPath(); ctx.ellipse(sx, sy, 3 * d.size, 1.6 * d.size, 0, 0, TAU); ctx.fill(); continue; }
      for (const b of d.blobs) {
        ctx.beginPath(); ctx.ellipse(sx + isoX(b[0], b[1]), sy + isoY(b[0], b[1]), b[2] * 1.4, b[2] * 0.7, 0, 0, TAU); ctx.fill();
      }
    } else if (d.type === 'crack') {
      ctx.strokeStyle = 'rgba(8,5,3,.85)';
      ctx.lineCap = 'round';
      for (const b of d.blobs) {
        ctx.lineWidth = b[4];
        ctx.beginPath(); ctx.moveTo(sx + isoX(b[0], b[1]), sy + isoY(b[0], b[1])); ctx.lineTo(sx + isoX(b[2], b[3]), sy + isoY(b[2], b[3])); ctx.stroke();
      }
    } else if (d.type === 'scorch') {
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40 * d.size);
      g.addColorStop(0, 'rgba(10,6,4,.8)'); g.addColorStop(1, 'rgba(10,6,4,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(sx, sy, 40 * d.size, 20 * d.size, 0, 0, TAU); ctx.fill();
    }
  }
  for (const r of FX.rings) {
    if (r.add) continue;
    drawRing(ctx, r);
  }
}

function drawRing(ctx, r) {
  const k = r.t / r.dur;
  const rad = lerp(r.r0, r.r1, easeOutCubic(k));
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = r.color;
  ctx.lineWidth = r.width * (1 - k * 0.5);
  ctx.beginPath();
  ctx.ellipse(isoX(r.x, r.y), isoY(r.x, r.y), rad * 1.414, rad * 0.707, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// 일반 파티클 (엔티티 위, 조명 전)
function drawFXParticles(ctx) {
  for (const p of FX.particles) {
    if (p.add) continue;
    const sx = isoX(p.x, p.y), sy = isoY(p.x, p.y) - p.z;
    if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(${p.color},${Math.min(0.35, p.life * 0.5)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, p.size, p.size * 0.6, 0, 0, TAU); ctx.fill();
    } else if (p.kind === 'rock') {
      const k = 1 - p.life / p.max;
      const h = p.size * (k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(sx - p.size * 0.5, sy);
      ctx.lineTo(sx + p.rot * 10, sy - h * 1.6);
      ctx.lineTo(sx + p.size * 0.5, sy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + p.rot * 10, sy - h * 1.6); ctx.lineTo(sx + p.size * 0.5, sy); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size);
    }
  }
}

// 빛나는 효과 (조명 위에 더하기 합성)
function drawFXAdditive(ctx, t) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of FX.particles) {
    if (!p.add) continue;
    const sx = isoX(p.x, p.y), sy = isoY(p.x, p.y) - p.z;
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(sx, sy, p.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const r of FX.rings) if (r.add) drawRing(ctx, r);
  for (const b of FX.bolts) {
    ctx.globalAlpha = b.life / b.max;
    for (const [w, c] of [[6, 'rgba(120,170,255,.35)'], [2, b.color]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath();
      b.points.forEach((pt, i) => {
        const sx = isoX(pt.x, pt.y), sy = isoY(pt.x, pt.y) - (pt.z || 30);
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  for (const b of FX.beams) {
    const sx = isoX(b.x, b.y), sy = isoY(b.x, b.y);
    const a = Math.min(1, b.life / 0.6) * (0.75 + Math.sin(t * 6) * 0.15);
    const g = ctx.createLinearGradient(0, sy - 170, 0, sy);
    g.addColorStop(0, b.color + '00'); g.addColorStop(0.7, b.color + '66'); g.addColorStop(1, b.color + 'cc');
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fillRect(sx - 7, sy - 170, 14, 170);
    ctx.fillRect(sx - 2, sy - 200, 4, 200);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
