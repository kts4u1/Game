'use strict';
// ───────── 절차적 캐릭터 그래픽 ─────────
// 모든 스프라이트는 발 위치(0,0)를 기준으로 오른쪽(+x)을 바라보게 그린다.
// 각도 규칙: 0 = 아래, +값 = 앞쪽으로 회전. 방향 벡터 = (sin a, cos a)

const PAL = {
  skin: '#c78c5d', skinShade: '#8e5636', skinHi: '#e3ab7c',
  hair: '#2a180d', beard: '#4e2c14', fur: '#6e4b2a', furDark: '#3f2a16',
  wood: '#5e3c1f', steel: '#b9bfc8', steelDark: '#5f6670',
};
const HAS_FILTER = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

const GEAR_COLORS = [
  { base: '#6b4428', hi: '#8f5d37', dark: '#3d2715' }, // 가죽
  { base: '#7c818a', hi: '#a9aeb7', dark: '#454950' }, // 사슬
  { base: '#9ca3ad', hi: '#dde2e9', dark: '#555c66' }, // 판금
  { base: '#3e4049', hi: '#70737f', dark: '#1d1e24' }, // 고대
];

function seg(ctx, x1, y1, x2, y2, w, c) {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function joint(x, y, a, l) { return [x + Math.sin(a) * l, y + Math.cos(a) * l]; }
function circle(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function drawShadow(ctx, x, y, rx, ry, a = 0.45) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

// 오버헤드 내려찍기 궤적
function swingAngle(k) {
  if (k < 0.38) return lerp(0.35, -2.6, easeOutCubic(k / 0.38));
  if (k < 0.58) return lerp(-2.6, -5.15, easeInQuad((k - 0.38) / 0.2));
  return lerp(-5.15 + TAU, 0.35, (k - 0.58) / 0.42);
}

// ── 무기 ── (+y 방향으로 뻗고, +x 쪽이 날)
function drawWeapon(ctx, x, y, a, item, scale = 1) {
  const type = item ? item.icon : null;
  if (!type) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-a);
  ctx.scale(scale, scale);
  const uniq = item.rarity === 3;
  const metal = uniq ? '#e2bd72' : item.rarity === 2 ? '#d3d0c0' : '#bcc2cb';
  const metalD = uniq ? '#8a6528' : '#5c636d';
  if (item.rarity >= 2) { ctx.shadowColor = RARITY[item.rarity].color; ctx.shadowBlur = 9; }
  const handle = (len, w = 3) => seg(ctx, 0, -5, 0, len, w, PAL.wood);
  switch (type) {
    case 'axe':
      handle(32);
      poly(ctx, [1, 19, 10, 15, 15, 26, 10, 37, 1, 32], metal, metalD, 1);
      poly(ctx, [-1, 22, -6, 25, -1, 29], metalD);
      break;
    case 'greataxe':
      handle(46, 3.5);
      poly(ctx, [1, 28, 13, 22, 19, 36, 13, 50, 1, 43], metal, metalD, 1);
      poly(ctx, [-1, 28, -13, 22, -19, 36, -13, 50, -1, 43], metal, metalD, 1);
      break;
    case 'sword':
      seg(ctx, 0, -5, 0, 6, 3, '#3a2414');
      seg(ctx, -6, 6, 6, 6, 3, metalD);
      poly(ctx, [-2.6, 7, 2.6, 7, 2.1, 40, 0, 47, -2.1, 40], metal, metalD, 0.8);
      seg(ctx, 0, 9, 0, 38, 0.8, metalD);
      break;
    case 'greatsword':
      seg(ctx, 0, -7, 0, 8, 3.2, '#3a2414');
      seg(ctx, -8, 8, 8, 8, 3.5, metalD);
      poly(ctx, [-3.6, 9, 3.6, 9, 3, 54, 0, 62, -3, 54], metal, metalD, 0.8);
      seg(ctx, 0, 11, 0, 52, 1, metalD);
      break;
    case 'mace':
      handle(26);
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * TAU;
        seg(ctx, 0, 30, Math.cos(an) * 9, 30 + Math.sin(an) * 9, 2.2, metalD);
      }
      circle(ctx, 0, 30, 6.5, metal);
      break;
    case 'hammer':
      handle(36, 3.5);
      poly(ctx, [-9, 32, 10, 32, 10, 46, -9, 46], metal, metalD, 1);
      seg(ctx, -9, 39, 10, 39, 1, metalD);
      break;
  }
  ctx.restore();
}

function drawLeg(ctx, x, y, a, color, boot, thick = 8) {
  const [kx, ky] = joint(x, y, a, 13);
  const shinA = a * 0.45 - 0.12;
  const [fx, fy] = joint(kx, ky, shinA, 13);
  seg(ctx, x, y, kx, ky, thick, color);
  seg(ctx, kx, ky, fx, fy, thick - 1, color);
  seg(ctx, lerp(kx, fx, 0.45), lerp(ky, fy, 0.45), fx, fy, thick - 0.5, boot);
  seg(ctx, fx - 1, fy - 1, fx + 5, fy, 5, boot);
}

function drawArm(ctx, x, y, a, bend, w, color, glove) {
  const [ex, ey] = joint(x, y, a, 11);
  const fa = a + bend;
  const [hx, hy] = joint(ex, ey, fa, 11);
  seg(ctx, x, y, ex, ey, w + 0.5, color);
  seg(ctx, ex, ey, hx, hy, w, color);
  if (glove) seg(ctx, lerp(ex, hx, 0.4), lerp(ey, hy, 0.4), hx, hy, w + 1, glove.base);
  circle(ctx, hx, hy, w * 0.55, glove ? glove.dark : color);
  return { hx, hy, fa };
}

// ── 야만용사 ──
function drawBarbarian(ctx, p, t) {
  const eq = p.equipment;
  const moving = p.moving;
  const ph = p.walkPhase;
  const sw = moving ? Math.sin(ph) : 0;
  const bob = moving ? Math.abs(Math.cos(ph)) * 2 : Math.sin(t * 2.2) * 0.6;
  let aF = 0.3 - sw * 0.5, aB = -0.1 + sw * 0.5;
  let eF = 0.45, eB = 0.35;
  let lean = moving ? 0.1 : 0;
  let legF = sw * 0.55, legB = -sw * 0.55;
  let wOff = 0.5;

  if (p.attack) {
    const k = clamp(p.attack.t / p.attack.dur, 0, 1);
    aF = swingAngle(k); eF = 0.15; wOff = 0.1;
    aB = lerp(-0.3, -0.8, k);
    lean = k < 0.38 ? -0.12 : 0.16;
    legF = 0.4; legB = -0.35;
  } else if (p.leap) {
    const k = p.leap.t / p.leap.dur;
    aF = k < 0.7 ? -2.7 : lerp(-2.7, -5.0, (k - 0.7) / 0.3);
    aB = -2.3; eF = 0.2; eB = 0.3; wOff = 0.1;
    legF = 0.75; legB = -0.1; lean = -0.1;
  } else if (p.whirl) {
    aF = 1.55; aB = -1.55; eF = 0; eB = 0; wOff = 0.05;
    legF = 0.3; legB = -0.3;
  } else if (p.pose) {
    const k = clamp(p.poseT / p.poseDur, 0, 1);
    if (p.pose === 'roar') { aF = 2.3; aB = -2.3; eF = -0.3; eB = 0.3; lean = -0.18; }
    else if (p.pose === 'throw') { aF = k < 0.4 ? lerp(0.3, -2.4, k / 0.4) : lerp(-2.4, -4.9, Math.min(1, (k - 0.4) / 0.3)); eF = 0.1; }
    else if (p.pose === 'slam') { aF = swingAngle(Math.min(1, 0.3 + k)); eF = 0.1; wOff = 0.1; lean = 0.18; }
    else if (p.pose === 'drink') { aB = 2.7; eB = 1.4; }
  }

  const sk = PAL.skin, skS = PAL.skinShade;
  const hipY = -27, shY = -49;
  const boot = eq.boots ? GEAR_COLORS[eq.boots.look].dark : '#3b2616';
  const glove = eq.gloves ? GEAR_COLORS[eq.gloves.look] : null;

  ctx.save();
  ctx.translate(0, -bob);
  const leanOn = () => { ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY); };

  // 뒤쪽 팔
  ctx.save(); leanOn();
  drawArm(ctx, -5, shY + 1, aB, eB, 6.5, skS, glove);
  ctx.restore();

  // 다리
  drawLeg(ctx, -3, hipY, legB, skS, boot);
  drawLeg(ctx, 3, hipY, legF, sk, boot);

  // 상체
  ctx.save(); leanOn();
  const g = ctx.createLinearGradient(-11, 0, 12, 0);
  g.addColorStop(0, skS); g.addColorStop(0.55, sk); g.addColorStop(1, PAL.skinHi);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-7, hipY);
  ctx.lineTo(7, hipY);
  ctx.quadraticCurveTo(13, -40, 11, shY - 2);
  ctx.lineTo(-10, shY - 3);
  ctx.quadraticCurveTo(-12, -40, -7, hipY);
  ctx.fill();
  // 근육 음영
  ctx.strokeStyle = 'rgba(70,32,16,.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-3, -44); ctx.quadraticCurveTo(3, -40.5, 9.5, -44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3.5, -39); ctx.lineTo(3.5, -30); ctx.moveTo(0, -35.5); ctx.lineTo(7, -35.5); ctx.moveTo(0, -31.5); ctx.lineTo(7, -31.5); ctx.stroke();

  if (eq.armor) drawBodyArmor(ctx, eq.armor, hipY, shY);
  else seg(ctx, -9, shY - 1, 8, hipY - 3, 3, '#4a2d17');
  ctx.restore();

  // 털 허리치마
  poly(ctx, [-9, hipY - 2, 9, hipY - 2, 11, -15, 6, -12, 2, -16, -2, -12, -6, -16, -11, -13], PAL.fur, PAL.furDark, 1);
  ctx.strokeStyle = PAL.furDark; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-5, hipY); ctx.lineTo(-6, -17); ctx.moveTo(1, hipY); ctx.lineTo(1, -17); ctx.moveTo(6, hipY); ctx.lineTo(7, -16); ctx.stroke();
  // 허리띠
  const beltC = eq.belt ? GEAR_COLORS[eq.belt.look] : { base: '#4a2d17', dark: '#2a180c' };
  ctx.fillStyle = beltC.base;
  ctx.fillRect(-9.5, hipY - 4, 19, eq.belt ? 5 : 3.5);
  if (eq.belt) { ctx.fillStyle = eq.belt.rarity === 3 ? '#e2bd72' : '#c9a24a'; ctx.fillRect(3, hipY - 4.5, 4, 6); }

  // 머리
  ctx.save(); leanOn();
  const hx = 1.5, hy = -58;
  seg(ctx, 0, shY, 1, hy + 4, 6, skS);
  poly(ctx, [hx - 2, hy - 7, hx - 12, hy - 1, hx - 11, hy + 13, hx - 4, hy + 6], PAL.hair);
  circle(ctx, hx, hy, 7.4, sk);
  // 얼굴 (앞쪽 밝은 면, 코, 눈썹, 눈)
  ctx.fillStyle = PAL.skinHi;
  ctx.beginPath(); ctx.ellipse(hx + 3.2, hy - 0.5, 3.4, 4.6, 0, 0, TAU); ctx.fill();
  poly(ctx, [hx + 6.5, hy - 2.5, hx + 9.2, hy + 1.6, hx + 6.4, hy + 1.8], PAL.skin);
  seg(ctx, hx + 2.2, hy - 3.8, hx + 7, hy - 3.2, 1.8, PAL.hair);
  ctx.fillStyle = '#f2e4cf';
  ctx.fillRect(hx + 3.6, hy - 2.4, 2.6, 1.8);
  ctx.fillStyle = '#1a0d06';
  ctx.fillRect(hx + 4.8, hy - 2.4, 1.4, 1.8);
  // 수염
  ctx.fillStyle = PAL.beard;
  ctx.beginPath(); ctx.moveTo(hx - 1, hy + 1.5); ctx.quadraticCurveTo(hx + 3, hy + 14, hx + 8.5, hy + 3.5); ctx.lineTo(hx + 7, hy + 2); ctx.quadraticCurveTo(hx + 4, hy + 4, hx + 1, hy + 1); ctx.closePath(); ctx.fill();
  if (eq.helm) drawHelm(ctx, hx, hy, eq.helm);
  else { ctx.fillStyle = PAL.hair; ctx.beginPath(); ctx.arc(hx - 1, hy - 1.5, 7.6, Math.PI * 0.92, Math.PI * 1.8); ctx.lineTo(hx + 1, hy - 3); ctx.closePath(); ctx.fill(); }

  // 앞쪽 팔 + 무기
  const shx = 5, shy = shY + 1;
  const [ex, ey] = joint(shx, shy, aF, 11);
  const fa = aF + eF;
  const [hx2, hy2] = joint(ex, ey, fa, 11);
  drawWeapon(ctx, hx2, hy2, fa + wOff, eq.weapon);
  seg(ctx, shx, shy, ex, ey, 8, sk);
  seg(ctx, ex, ey, hx2, hy2, 7.2, sk);
  if (glove) seg(ctx, lerp(ex, hx2, 0.4), lerp(ey, hy2, 0.4), hx2, hy2, 8, glove.base);
  circle(ctx, hx2, hy2, 4, glove ? glove.dark : skS);
  // 어깨 근육 / 견갑
  if (eq.armor && eq.armor.look >= 2) {
    const c = GEAR_COLORS[eq.armor.look];
    ctx.fillStyle = c.base; ctx.beginPath(); ctx.ellipse(shx, shy - 1, 6.5, 5, -0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1; ctx.stroke();
  } else circle(ctx, shx, shy, 4.6, sk);
  ctx.restore();

  ctx.restore();
}

function drawBodyArmor(ctx, item, hipY, shY) {
  const c = GEAR_COLORS[item.look];
  const trim = item.rarity === 3 ? '#e2bd72' : item.rarity === 2 ? '#e8d77a' : item.rarity === 1 ? '#7f88e6' : null;
  const g = ctx.createLinearGradient(-10, 0, 12, 0);
  g.addColorStop(0, c.dark); g.addColorStop(0.6, c.base); g.addColorStop(1, c.hi);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-7.5, hipY - 1);
  ctx.lineTo(7.5, hipY - 1);
  ctx.quadraticCurveTo(13, -40, 11, shY - 1);
  ctx.lineTo(4, shY - 2);
  ctx.lineTo(1, -44);
  ctx.lineTo(-3, shY - 2);
  ctx.lineTo(-10, shY - 2);
  ctx.quadraticCurveTo(-12, -40, -7.5, hipY - 1);
  ctx.fill();
  if (item.look === 0) {
    ctx.strokeStyle = c.dark; ctx.lineWidth = 0.9;
    for (let y = -42; y < hipY; y += 3.2) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(3, y + 1.6); ctx.stroke(); }
  } else if (item.look === 1) {
    ctx.fillStyle = c.dark;
    for (let y = -44; y < hipY - 1; y += 2.6) for (let x = -8; x < 10; x += 2.6) ctx.fillRect(x + ((y / 2.6) & 1) * 1.3, y, 1, 1);
  } else {
    ctx.strokeStyle = c.dark; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, -35); ctx.quadraticCurveTo(2, -31, 11, -35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.5, -43); ctx.lineTo(1.5, hipY - 1); ctx.stroke();
  }
  if (trim) {
    ctx.strokeStyle = trim; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-10, shY - 2); ctx.lineTo(-3, shY - 2); ctx.lineTo(1, -44); ctx.lineTo(4, shY - 2); ctx.lineTo(11, shY - 1); ctx.stroke();
  }
}

function drawHelm(ctx, hx, hy, item) {
  const look = item.look;
  const uniq = item.rarity === 3;
  const c = look === 0 ? GEAR_COLORS[0] : uniq ? { base: '#c9a14e', hi: '#f0d391', dark: '#7a5a22' } : GEAR_COLORS[2];
  if (look === 3) {
    // 대투구: 얼굴 전체
    const g = ctx.createLinearGradient(hx - 8, 0, hx + 8, 0);
    g.addColorStop(0, c.dark); g.addColorStop(1, c.hi);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(hx - 8, hy + 5); ctx.lineTo(hx - 8, hy - 4); ctx.quadraticCurveTo(hx, hy - 13, hx + 8.5, hy - 4); ctx.lineTo(hx + 8.5, hy + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0d0a08'; ctx.fillRect(hx + 1, hy - 2, 7.5, 2);
    ctx.fillRect(hx + 4, hy - 1, 1.6, 5);
    return;
  }
  ctx.fillStyle = c.base;
  ctx.beginPath(); ctx.arc(hx - 0.5, hy - 1.5, 7.8, Math.PI * 0.97, Math.PI * 2.03); ctx.fill();
  ctx.fillStyle = c.hi;
  ctx.beginPath(); ctx.arc(hx + 1, hy - 4, 3.6, Math.PI * 1.1, Math.PI * 1.7); ctx.lineTo(hx + 1, hy - 4); ctx.fill();
  seg(ctx, hx - 8, hy - 1, hx + 7.5, hy - 1, 2.2, c.dark);
  if (look >= 1) seg(ctx, hx + 6.5, hy - 1, hx + 7.2, hy + 4, 1.8, c.dark);
  if (look === 2) {
    // 뿔
    const horn = '#e9dfc9';
    ctx.fillStyle = horn;
    ctx.beginPath(); ctx.moveTo(hx + 4, hy - 5); ctx.quadraticCurveTo(hx + 15, hy - 8, hx + 13, hy - 19); ctx.quadraticCurveTo(hx + 11, hy - 10, hx + 3, hy - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b9ad94';
    ctx.beginPath(); ctx.moveTo(hx - 5, hy - 5); ctx.quadraticCurveTo(hx - 15, hy - 9, hx - 12, hy - 19); ctx.quadraticCurveTo(hx - 11, hy - 10, hx - 3, hy - 8); ctx.closePath(); ctx.fill();
  }
}

// ── 몬스터 공통 ──
function monsterArm(m, rest) {
  if (m.windup > 0) return lerp(rest, -2.4, easeOutCubic(1 - m.windup / m.windupDur));
  if (m.strikeT > 0) return lerp(-2.4, -5.0, Math.min(1, (1 - m.strikeT / 0.25) * 2.2));
  return rest;
}

function drawSkeleton(ctx, m, t, pal) {
  const bone = pal.bone || '#d8d1bd', shade = pal.boneShade || '#938a74';
  const archer = m.type === 'archer';
  const sw = m.moving ? Math.sin(m.walkPhase) : 0;
  const hipY = -25, shY = -45;
  // 뒤쪽 팔 (방패 / 활시위 손)
  let aB = -0.2 + sw * 0.4;
  if (archer && m.windup > 0) aB = 1.45;
  const back = drawArm(ctx, -3, shY + 2, aB, archer && m.windup > 0 ? -1.4 : 0.3, 2.6, shade);
  if (!archer) {
    ctx.fillStyle = '#4b331c'; ctx.beginPath(); ctx.ellipse(back.hx - 2, back.hy - 3, 5, 8, 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a1c0e'; ctx.lineWidth = 1.2; ctx.stroke();
    circle(ctx, back.hx - 2, back.hy - 3, 1.6, '#8c8c8c');
  }
  // 다리
  drawLeg(ctx, -2, hipY, -sw * 0.6, shade, shade, 3.2);
  drawLeg(ctx, 2, hipY, sw * 0.6, bone, bone, 3.2);
  // 골반 · 척추 · 갈비뼈
  ctx.fillStyle = bone; ctx.beginPath(); ctx.ellipse(0, hipY, 6, 3, 0, 0, TAU); ctx.fill();
  seg(ctx, 0, hipY, 0.5, shY, 2.6, shade);
  ctx.strokeStyle = bone; ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(1, -42 + i * 4.2, 7 - i * 0.8, 2.2, 0, Math.PI * 1.05, Math.PI * 2.95); ctx.stroke(); }
  seg(ctx, -6, shY, 7, shY, 2.4, bone);
  // 두개골
  const hx = 2, hy = -53;
  circle(ctx, hx, hy, 6.5, bone);
  ctx.fillStyle = bone; ctx.fillRect(hx - 1, hy + 3, 7, 4);
  ctx.fillStyle = '#1a1410'; ctx.fillRect(hx + 1, hy + 5, 5, 0.9);
  circle(ctx, hx + 3.2, hy - 0.5, 1.9, '#140f0c');
  circle(ctx, hx - 1, hy - 0.5, 1.6, '#140f0c');
  circle(ctx, hx + 3.2, hy - 0.5, 0.9, pal.eye || '#ff4a2a');
  // 앞쪽 팔 + 무기
  if (archer) {
    const aF = 1.5;
    const fr = drawArm(ctx, 4, shY + 2, aF, 0, 2.8, bone);
    // 활
    ctx.strokeStyle = '#6a4423'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(fr.hx - 4, fr.hy, 14, -1.1, 1.1); ctx.stroke();
    const pull = m.windup > 0 ? 1 - m.windup / m.windupDur : 0;
    ctx.strokeStyle = '#d8d2c0'; ctx.lineWidth = 0.7;
    const sx = fr.hx - 4 + Math.cos(-1.1) * 14, sy1 = fr.hy + Math.sin(-1.1) * 14, sy2 = fr.hy + Math.sin(1.1) * 14;
    ctx.beginPath(); ctx.moveTo(sx, sy1); ctx.lineTo(sx - pull * 12, fr.hy); ctx.lineTo(sx, sy2); ctx.stroke();
  } else {
    const aF = monsterArm(m, 0.4 - sw * 0.4);
    const [ex, ey] = joint(5, shY + 2, aF, 10);
    const [hx2, hy2] = joint(ex, ey, aF + 0.2, 10);
    drawWeapon(ctx, hx2, hy2, aF + 0.4, { icon: 'sword', rarity: 0 }, 0.8);
    seg(ctx, 5, shY + 2, ex, ey, 2.8, bone);
    seg(ctx, ex, ey, hx2, hy2, 2.6, bone);
    circle(ctx, hx2, hy2, 2, bone);
  }
}

function drawZombie(ctx, m, t, pal) {
  const skin = pal.skin || '#7d8b62', shade = pal.shade || '#515c3d', rag = pal.rag || '#4b3b2a';
  const sw = m.moving ? Math.sin(m.walkPhase) : 0;
  const hipY = -25;
  drawLeg(ctx, -3, hipY, -sw * 0.4, shade, '#2d2418', 7);
  drawLeg(ctx, 3, hipY, sw * 0.4, skin, '#2d2418', 7);
  ctx.save();
  ctx.translate(0, hipY); ctx.rotate(0.38); ctx.translate(0, -hipY);
  // 뒤쪽 팔
  const reach = monsterArm(m, 1.35 + Math.sin(t * 3 + m.seed) * 0.08);
  drawArm(ctx, -3, -45, reach + 0.15, -0.2, 5.5, shade);
  // 몸통
  poly(ctx, [-7, hipY, 7, hipY, 10, -45, -9, -46], skin);
  poly(ctx, [-8, -42, 10, -42, 9, hipY + 4, 5, hipY + 1, 2, hipY + 6, -2, hipY + 1, -6, hipY + 5], rag);
  ctx.strokeStyle = 'rgba(30,20,10,.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-4, -38); ctx.lineTo(5, -33); ctx.moveTo(-2, -30); ctx.lineTo(6, -28); ctx.stroke();
  // 머리
  const hx = 6, hy = -51;
  circle(ctx, hx, hy, 6.5, skin);
  ctx.fillStyle = '#20180f'; ctx.fillRect(hx + 1, hy + 2.5, 5, 2.5);
  circle(ctx, hx + 3, hy - 1.2, 1.5, '#0e0b07');
  circle(ctx, hx + 3, hy - 1.2, 0.6, pal.eye || '#d6d063');
  ctx.fillStyle = '#2b2416'; ctx.beginPath(); ctx.arc(hx - 1, hy - 2, 6.4, Math.PI, Math.PI * 1.8); ctx.fill();
  // 앞쪽 팔
  drawArm(ctx, 4, -45, reach, -0.25, 6, skin);
  ctx.restore();
}

function drawFallen(ctx, m, t, pal) {
  const shaman = m.type === 'shaman';
  const skin = pal.skin || (shaman ? '#9b3561' : '#b8392b'), shade = pal.shade || (shaman ? '#5e1c3a' : '#6e1d14');
  const sw = m.moving ? Math.sin(m.walkPhase) : 0;
  ctx.save();
  ctx.scale(0.82, 0.82);
  const hipY = -22;
  drawArm(ctx, -3, -38, -0.2 + sw * 0.5, 0.4, 4.2, shade);
  drawLeg(ctx, -2, hipY, -sw * 0.7, shade, shade, 5.5);
  drawLeg(ctx, 2, hipY, sw * 0.7, skin, skin, 5.5);
  poly(ctx, [-6, hipY, 6, hipY, 8, -38, -7, -39], skin);
  poly(ctx, [-7, hipY - 2, 7, hipY - 2, 6, hipY + 5, 0, hipY + 2, -6, hipY + 5], '#3a2512');
  // 큰 머리, 귀, 뿔
  const hx = 3, hy = -47;
  poly(ctx, [hx - 4, hy - 2, hx - 14, hy - 8, hx - 5, hy + 2], shade);
  circle(ctx, hx, hy, 8, skin);
  poly(ctx, [hx + 2, hy - 6, hx + 5, hy - 14, hx + 5, hy - 6], '#e7dcc4');
  poly(ctx, [hx - 3, hy - 7, hx - 4, hy - 15, hx - 0.5, hy - 7], '#cfc3a8');
  circle(ctx, hx + 4.5, hy - 1, 1.8, '#1a0a05');
  circle(ctx, hx + 4.8, hy - 1, 1, pal.eye || '#ffd23a');
  ctx.fillStyle = '#1a0a05'; ctx.fillRect(hx + 2, hy + 3.5, 6, 1.4);
  if (shaman) {
    // 깃털 머리장식 + 해골 지팡이
    for (let i = 0; i < 3; i++) seg(ctx, hx - 2 + i * 2, hy - 7, hx - 6 + i * 4, hy - 17 - i, 2, ['#e8c547', '#3fa5c7', '#e8c547'][i]);
    const aF = m.windup > 0 ? lerp(0.6, 2.6, 1 - m.windup / m.windupDur) : 0.6;
    const fr = drawArm(ctx, 4, -38, aF, -0.3, 4.4, skin);
    seg(ctx, fr.hx, fr.hy + 12, fr.hx + 2, fr.hy - 22, 2.4, '#5b3a1c');
    circle(ctx, fr.hx + 2, fr.hy - 24, 4, '#d8d0bb');
    circle(ctx, fr.hx + 3.2, fr.hy - 24.5, 1, '#1a0a05');
  } else {
    const aF = monsterArm(m, 1.0 - sw * 0.3);
    const [ex, ey] = joint(4, -38, aF, 9);
    const [hx2, hy2] = joint(ex, ey, aF + 0.2, 9);
    // 창
    ctx.save(); ctx.translate(hx2, hy2); ctx.rotate(-(aF + 0.5));
    seg(ctx, 0, -10, 0, 26, 2.2, '#6b4724');
    poly(ctx, [-2.5, 26, 2.5, 26, 0, 34], '#a9adb3');
    ctx.restore();
    seg(ctx, 4, -38, ex, ey, 4.6, skin);
    seg(ctx, ex, ey, hx2, hy2, 4.2, skin);
  }
  ctx.restore();
}

function drawWraith(ctx, m, t, pal) {
  const float = Math.sin(t * 3 + m.seed) * 3;
  ctx.save();
  ctx.translate(0, -8 + float);
  ctx.globalAlpha *= 0.88;
  const cloak = pal.cloak || '#1c2030';
  const g = ctx.createLinearGradient(0, -60, 0, 4);
  g.addColorStop(0, cloak); g.addColorStop(0.75, cloak); g.addColorStop(1, 'rgba(20,24,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-3, -58);
  ctx.quadraticCurveTo(12, -58, 12, -38);
  for (let i = 0; i <= 5; i++) {
    const x = 12 - i * 5, y = 2 + Math.sin(t * 6 + i + m.seed) * 3;
    ctx.lineTo(x, y);
  }
  ctx.quadraticCurveTo(-14, -40, -3, -58);
  ctx.fill();
  // 두건 안쪽
  ctx.fillStyle = '#05060b'; ctx.beginPath(); ctx.ellipse(5, -48, 5.5, 6.5, 0.2, 0, TAU); ctx.fill();
  circle(ctx, 6, -49, 1.5, pal.eye || '#6ef0ff');
  circle(ctx, 9, -48.5, 1.3, pal.eye || '#6ef0ff');
  // 발톱 손
  const aF = monsterArm(m, 1.2 + Math.sin(t * 2.5 + m.seed) * 0.15);
  const [hx, hy] = joint(6, -40, aF, 17);
  seg(ctx, 6, -40, hx, hy, 4, cloak);
  for (let i = -1; i <= 1; i++) seg(ctx, hx, hy, hx + Math.sin(aF + i * 0.4) * 7, hy + Math.cos(aF + i * 0.4) * 7, 1.2, '#cfd6e6');
  ctx.restore();
}

function drawBrute(ctx, m, t, pal) {
  const skin = pal.skin || '#6d2a20', shade = pal.shade || '#3d140f', horn = pal.horn || '#d8ccb0';
  const sw = m.moving ? Math.sin(m.walkPhase) : 0;
  const hipY = -32, shY = -64;
  const aF = monsterArm(m, 0.25 - sw * 0.35);
  drawArm(ctx, -9, shY + 4, monsterArm(m, -0.1 + sw * 0.35) - 0.2, 0.35, 10, shade);
  drawLeg(ctx, -5, hipY, -sw * 0.5, shade, '#1c0907', 11);
  drawLeg(ctx, 5, hipY, sw * 0.5, skin, '#1c0907', 11);
  const g = ctx.createLinearGradient(-16, 0, 18, 0);
  g.addColorStop(0, shade); g.addColorStop(1, skin);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-10, hipY); ctx.lineTo(10, hipY);
  ctx.quadraticCurveTo(22, -52, 17, shY - 2);
  ctx.lineTo(-16, shY - 4);
  ctx.quadraticCurveTo(-18, -50, -10, hipY);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-6, -55); ctx.quadraticCurveTo(4, -50, 14, -55); ctx.moveTo(4, -50); ctx.lineTo(4, -36); ctx.stroke();
  poly(ctx, [-11, hipY - 2, 11, hipY - 2, 13, hipY + 10, 0, hipY + 6, -13, hipY + 10], '#241410');
  // 머리 (어깨에 파묻힘)
  const hx = 7, hy = -68;
  circle(ctx, hx, hy, 8, skin);
  ctx.fillStyle = horn;
  ctx.beginPath(); ctx.moveTo(hx + 3, hy - 5); ctx.quadraticCurveTo(hx + 18, hy - 6, hx + 16, hy - 22); ctx.quadraticCurveTo(hx + 12, hy - 11, hx + 1, hy - 8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx - 4, hy - 6); ctx.quadraticCurveTo(hx - 17, hy - 8, hx - 14, hy - 22); ctx.quadraticCurveTo(hx - 11, hy - 12, hx - 1, hy - 8); ctx.closePath(); ctx.fill();
  circle(ctx, hx + 4, hy - 1, 1.8, pal.eye || '#ffcf3a');
  ctx.fillStyle = '#120403'; ctx.fillRect(hx + 1, hy + 3.5, 7, 2);
  // 앞팔 + 발톱
  const fr = drawArm(ctx, 9, shY + 4, aF, 0.3, 11, skin);
  for (let i = -1; i <= 1; i++) seg(ctx, fr.hx, fr.hy, fr.hx + Math.sin(fr.fa + i * 0.45) * 9, fr.hy + Math.cos(fr.fa + i * 0.45) * 9, 2, horn);
}

const MONSTER_DRAW = {
  zombie: drawZombie, skeleton: drawSkeleton, archer: drawSkeleton,
  fallen: drawFallen, shaman: drawFallen, wraith: drawWraith, brute: drawBrute,
};
