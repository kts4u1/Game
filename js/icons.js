'use strict';
// ───────── 스킬 · 아이템 아이콘 (캔버스로 그려서 이미지로 캐시) ─────────

const ICON_CACHE = {};

function makeIcon(key, size, drawFn) {
  if (ICON_CACHE[key]) return ICON_CACHE[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx, size);
  ICON_CACHE[key] = c.toDataURL();
  return ICON_CACHE[key];
}

function skillIcon(id) {
  return makeIcon('skill:' + id, 64, (ctx) => {
    const sk = SKILLS[id];
    const passive = sk ? sk.type === 'passive' : true;
    const g = ctx.createRadialGradient(32, 26, 4, 32, 32, 44);
    if (passive) { g.addColorStop(0, '#3b4a5c'); g.addColorStop(1, '#0d1118'); }
    else { g.addColorStop(0, '#6a2a18'); g.addColorStop(1, '#170806'); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = passive ? '#7d93ad' : '#c9874a';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 60, 60);
    ctx.save();
    ctx.shadowColor = passive ? '#9fd0ff' : '#ff9a3c';
    ctx.shadowBlur = 8;
    drawSkillGlyph(ctx, id, passive ? '#dfe9f5' : '#f4d6a8');
    ctx.restore();
  });
}

function drawSkillGlyph(ctx, id, ink) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const L = (x1, y1, x2, y2, w = 3) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const P = (pts, fill = true) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); fill ? ctx.fill() : ctx.stroke(); };
  const axeShape = (x, y, a, s = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    L(0, -18, 0, 18, 3.5);
    P([1, -18, 13, -22, 16, -10, 13, 0, 1, -6]);
    ctx.restore();
  };
  switch (id) {
    case 'bash':
      ctx.save(); ctx.translate(26, 36); ctx.rotate(-0.7);
      L(0, 0, 0, 22, 4);
      ctx.beginPath(); ctx.arc(0, -4, 8, 0, TAU); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 7; i++) { const a = -0.4 + i * 0.35; L(40 + Math.cos(a) * 6, 22 + Math.sin(a) * 6, 40 + Math.cos(a) * 16, 22 + Math.sin(a) * 16, 2.5); }
      break;
    case 'whirlwind':
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(32, 32, 8 + i * 7, i * 1.8, i * 1.8 + 4.2); ctx.stroke(); }
      axeShape(46, 18, 0.9, 0.55);
      break;
    case 'leap':
      ctx.lineWidth = 3; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(10, 50); ctx.quadraticCurveTo(28, 2, 48, 44); ctx.stroke();
      ctx.setLineDash([]);
      P([48, 44, 40, 38, 50, 34]);
      L(36, 54, 56, 54, 3); L(46, 54, 40, 60, 2); L(46, 54, 54, 60, 2);
      break;
    case 'warcry':
      ctx.beginPath(); ctx.arc(18, 32, 7, 0, TAU); ctx.fill();
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(18, 32, 14 + i * 9, -0.7, 0.7); ctx.stroke(); }
      break;
    case 'slam':
      L(6, 46, 58, 46, 3);
      P([14, 46, 18, 30, 22, 46]); P([26, 46, 31, 22, 36, 46]); P([40, 46, 46, 14, 52, 46]);
      L(20, 52, 44, 52, 2);
      break;
    case 'axes':
      axeShape(24, 34, -0.5, 0.9); axeShape(40, 34, 0.5, 0.9);
      break;
    case 'berserk':
      ctx.beginPath();
      ctx.moveTo(32, 6); ctx.quadraticCurveTo(48, 24, 46, 40); ctx.quadraticCurveTo(44, 56, 32, 58);
      ctx.quadraticCurveTo(18, 56, 18, 40); ctx.quadraticCurveTo(18, 30, 26, 22); ctx.quadraticCurveTo(26, 32, 32, 34);
      ctx.quadraticCurveTo(30, 18, 32, 6); ctx.fill();
      ctx.fillStyle = '#3a0f08'; ctx.fillRect(25, 40, 5, 4); ctx.fillRect(34, 40, 5, 4);
      break;
    case 'mastery':
      ctx.save(); ctx.translate(32, 32);
      for (const s of [-1, 1]) { ctx.save(); ctx.rotate(s * 0.75); L(0, -24, 0, 16, 4); L(-7, 10, 7, 10, 3); L(0, 12, 0, 22, 3); ctx.restore(); }
      ctx.restore();
      break;
    case 'hide':
      P([32, 8, 52, 16, 50, 36, 32, 56, 14, 36, 12, 16]);
      ctx.fillStyle = '#1a2230'; P([32, 16, 44, 21, 43, 34, 32, 47, 21, 34, 20, 21]);
      break;
    case 'toughness': case '_life':
      ctx.beginPath(); ctx.moveTo(32, 54);
      ctx.bezierCurveTo(4, 34, 12, 8, 32, 20); ctx.bezierCurveTo(52, 8, 60, 34, 32, 54); ctx.fill();
      break;
    case 'bloodlust':
      ctx.beginPath(); ctx.moveTo(32, 8); ctx.bezierCurveTo(44, 26, 50, 34, 46, 44); ctx.arc(32, 42, 14, 0.15, Math.PI - 0.15); ctx.bezierCurveTo(14, 34, 20, 26, 32, 8); ctx.fill();
      break;
    case 'swiftness':
      for (let i = 0; i < 3; i++) { ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(12 + i * 14, 16); ctx.lineTo(24 + i * 14, 32); ctx.lineTo(12 + i * 14, 48); ctx.stroke(); }
      break;
    case 'furyheart':
      ctx.beginPath(); ctx.arc(32, 38, 14, 0, TAU); ctx.fill();
      P([20, 32, 24, 10, 30, 26, 34, 6, 38, 24, 44, 12, 44, 32]);
      break;
    case 'executioner':
      ctx.beginPath(); ctx.arc(32, 28, 16, 0, TAU); ctx.fill();
      ctx.fillRect(24, 38, 16, 12);
      ctx.fillStyle = '#0d1118';
      ctx.beginPath(); ctx.arc(25, 28, 5, 0, TAU); ctx.arc(39, 28, 5, 0, TAU); ctx.fill();
      ctx.fillRect(27, 44, 2, 6); ctx.fillRect(31, 44, 2, 6); ctx.fillRect(35, 44, 2, 6);
      break;
    case 'regen':
      ctx.beginPath(); ctx.arc(32, 32, 22, 0, TAU); ctx.lineWidth = 3; ctx.stroke();
      ctx.fillRect(28, 16, 8, 32); ctx.fillRect(16, 28, 32, 8);
      break;
    case 'thornskin':
      ctx.beginPath(); ctx.arc(32, 32, 12, 0, TAU); ctx.fill();
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; P([32 + Math.cos(a - 0.2) * 11, 32 + Math.sin(a - 0.2) * 11, 32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 32 + Math.cos(a + 0.2) * 11, 32 + Math.sin(a + 0.2) * 11]); }
      break;
    case 'treasure': case '_gold':
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(32, 48 - i * 8, 16, 6, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#1a2230'; ctx.lineWidth = 1.5; ctx.stroke(); }
      break;
    case '_potion':
      ctx.fillRect(28, 8, 8, 10);
      ctx.beginPath(); ctx.arc(32, 38, 16, 0, TAU); ctx.fill();
      break;
  }
}

// ── 아이템 아이콘 ──
function itemIcon(item) {
  const key = `item:${item.icon}:${item.rarity}:${item.look || 0}`;
  return makeIcon(key, 48, (ctx) => drawItemIcon(ctx, item.icon, item.rarity, item.look || 0, 48));
}

function drawItemIcon(ctx, icon, rarity, look, S) {
  const col = RARITY[rarity].color;
  if (rarity > 0) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * 0.6);
    g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  ctx.save();
  ctx.scale(S / 48, S / 48);
  const uniq = rarity === 3;
  const metal = uniq ? '#e3c07a' : '#c3c9d1';
  const metalD = uniq ? '#8a6528' : '#5b626c';
  const wood = '#6d4522';
  const leather = '#7a4e2b', leatherD = '#4a2e16';
  const gear = GEAR_COLORS[look] || GEAR_COLORS[0];
  const L = (x1, y1, x2, y2, w, c) => seg(ctx, x1, y1, x2, y2, w, c);
  const P = (pts, f, s) => poly(ctx, pts, f, s, 1.2);
  switch (icon) {
    case 'axe':
      L(12, 40, 34, 10, 4, wood);
      P([28, 6, 40, 4, 44, 16, 38, 24, 30, 14], metal, metalD);
      break;
    case 'greataxe':
      L(10, 42, 36, 8, 4, wood);
      P([30, 6, 42, 2, 46, 14, 40, 20, 33, 12], metal, metalD);
      P([28, 10, 20, 4, 18, 16, 26, 20], metal, metalD);
      break;
    case 'sword':
      L(10, 40, 16, 34, 4, '#3a2414');
      L(11, 30, 20, 39, 3.5, metalD);
      P([15, 33, 19, 37, 42, 10, 43, 5, 38, 6], metal, metalD);
      break;
    case 'greatsword':
      L(6, 44, 13, 37, 4.5, '#3a2414');
      L(8, 31, 19, 42, 4, metalD);
      P([12, 35, 17, 40, 44, 10, 45, 3, 38, 4], metal, metalD);
      break;
    case 'mace':
      L(12, 42, 30, 18, 4, wood);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; L(32, 15, 32 + Math.cos(a) * 12, 15 + Math.sin(a) * 12, 3, metalD); }
      circle(ctx, 32, 15, 8, metal);
      break;
    case 'hammer':
      L(12, 42, 30, 16, 4.5, wood);
      ctx.save(); ctx.translate(31, 14); ctx.rotate(0.6);
      P([-12, -7, 12, -7, 12, 7, -12, 7], metal, metalD);
      ctx.restore();
      break;
    case 'cap':
      P([10, 30, 12, 18, 24, 10, 36, 18, 38, 30], leather, leatherD);
      L(9, 30, 39, 30, 4, leatherD);
      break;
    case 'helm': case 'greathelm':
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(24, 28, 15, Math.PI, 0); ctx.lineTo(39, 36); ctx.lineTo(9, 36); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = metalD; ctx.lineWidth = 1.5; ctx.stroke();
      if (icon === 'greathelm') { ctx.fillStyle = '#111'; ctx.fillRect(12, 25, 24, 3); ctx.fillRect(22, 25, 4, 9); }
      else L(24, 28, 24, 40, 3, metalD);
      break;
    case 'hornhelm':
      ctx.fillStyle = '#e9dfc9';
      ctx.beginPath(); ctx.moveTo(12, 26); ctx.quadraticCurveTo(0, 20, 4, 4); ctx.quadraticCurveTo(8, 18, 16, 20); ctx.fill();
      ctx.beginPath(); ctx.moveTo(36, 26); ctx.quadraticCurveTo(48, 20, 44, 4); ctx.quadraticCurveTo(40, 18, 32, 20); ctx.fill();
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(24, 30, 14, Math.PI, 0); ctx.lineTo(38, 38); ctx.lineTo(10, 38); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = metalD; ctx.lineWidth = 1.5; ctx.stroke();
      break;
    case 'robe': case 'mail': case 'plate': {
      const c = uniq ? { base: '#b8914a', hi: '#e3c07a', dark: '#6a4a1c' } : gear;
      P([10, 8, 18, 6, 24, 12, 30, 6, 38, 8, 42, 18, 36, 20, 36, 42, 12, 42, 12, 20, 6, 18], c.base, c.dark);
      if (icon === 'mail') { ctx.fillStyle = c.dark; for (let y = 14; y < 40; y += 3) for (let x = 14; x < 35; x += 3) ctx.fillRect(x + ((y / 3) & 1), y, 1.2, 1.2); }
      if (icon === 'plate') { L(24, 14, 24, 40, 1.5, c.dark); L(13, 26, 35, 26, 1.5, c.dark); circle(ctx, 9, 13, 5, c.hi); circle(ctx, 39, 13, 5, c.hi); }
      if (icon === 'robe') { L(24, 12, 24, 40, 1.5, c.dark); L(13, 32, 35, 32, 3, c.dark); }
      break;
    }
    case 'gloves': case 'gauntlets': {
      const c = icon === 'gauntlets' ? { base: metal, dark: metalD } : { base: leather, dark: leatherD };
      P([14, 42, 14, 22, 12, 12, 16, 10, 19, 20, 20, 8, 24, 8, 25, 20, 27, 9, 31, 10, 30, 22, 33, 14, 37, 16, 34, 30, 34, 42], c.base, c.dark);
      L(13, 38, 35, 38, 3, c.dark);
      break;
    }
    case 'boots': {
      const c = look >= 1 ? { base: metal, dark: metalD } : { base: leather, dark: leatherD };
      P([14, 6, 28, 6, 28, 32, 42, 36, 42, 42, 12, 42, 14, 32], c.base, c.dark);
      L(14, 14, 28, 14, 2, c.dark);
      break;
    }
    case 'belt':
      P([4, 20, 44, 20, 44, 30, 4, 30], look >= 1 ? '#6c7179' : leather, leatherD);
      ctx.strokeStyle = uniq ? '#f0d391' : '#c9a24a'; ctx.lineWidth = 2.5; ctx.strokeRect(19, 18, 10, 14);
      break;
    case 'ring':
      ctx.strokeStyle = uniq ? '#e3c07a' : '#c9a24a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(24, 28, 11, 0, TAU); ctx.stroke();
      circle(ctx, 24, 16, 5, rarity === 2 ? '#f4e06d' : rarity === 3 ? '#e2553b' : '#6f7dff');
      break;
    case 'amulet':
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(24, 14, 13, 0.2, Math.PI - 0.2); ctx.stroke();
      P([24, 26, 31, 34, 24, 44, 17, 34], rarity === 2 ? '#f4e06d' : rarity === 3 ? '#e2553b' : '#6f7dff', '#c9a24a');
      break;
  }
  ctx.restore();
}
