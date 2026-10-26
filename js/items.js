'use strict';
// ───────── 아이템 생성 · 드롭 테이블 · 툴팁 ─────────

function pickSlot() {
  const slots = Object.keys(SLOT_WEIGHTS);
  return weightedPick(slots, s => SLOT_WEIGHTS[s]);
}

// 아이템 레벨 이하의 기본형 중, 최근(높은) 기본형일수록 자주 나온다
function pickBase(slot, ilvl) {
  const list = ITEM_BASES[slot].filter(b => b.lvl <= ilvl);
  return weightedPick(list, b => 1 + Math.max(0, 7 - (ilvl - b.lvl)) * 0.6);
}

function rollAffix(aff, ilvl) {
  const tiers = aff.tiers.filter(t => t[0] <= ilvl);
  if (!tiers.length) return null;
  const idx = weightedPick(tiers.map((t, i) => i), i => 1 + i * 1.5);
  const t = tiers[idx];
  return { stat: aff.stat, value: randInt(t[1], t[2]), name: t[3], aid: aff.id, local: !!aff.local };
}

function affixPool(slot, kind, ilvl, used) {
  return AFFIXES.filter(a => a.kind === kind && a.slots.includes(slot) && a.tiers[0][0] <= ilvl && !used.has(a.id));
}

function addAffix(item, kind, used) {
  const pool = affixPool(item.slot, kind, item.ilvl, used);
  if (!pool.length) return null;
  const aff = weightedPick(pool, a => a.weight || 1);
  used.add(aff.id);
  const rolled = rollAffix(aff, item.ilvl);
  if (rolled) {
    // 무기의 추가 피해는 무기 피해 수치에 직접 반영
    if (rolled.stat === 'dmgFlat' && item.slot === 'weapon') rolled.local = true;
    item.affixes.push(rolled);
  }
  return rolled;
}

function baseItem(base, slot, ilvl, rarity) {
  const item = {
    uid: uid(), slot, baseId: base.id, baseName: base.name, icon: base.icon, look: base.look || 0,
    rarity, ilvl, affixes: [], name: base.name, req: base.lvl,
  };
  if (base.dmg) {
    // 아이템 레벨이 기본형보다 아주 높으면 기본 피해가 조금 오른다
    const bonus = 1 + Math.max(0, ilvl - 26) * 0.04;
    item.baseDmg = [Math.round(base.dmg[0] * bonus), Math.round(base.dmg[1] * bonus)];
    item.aps = base.aps;
  }
  if (base.def) {
    const bonus = 1 + Math.max(0, ilvl - 26) * 0.04;
    item.baseDef = Math.round(randInt(base.def[0], base.def[1]) * bonus);
  }
  return item;
}

// 지역 속성(무기 피해 %, 방어력 %)을 아이템 수치에 반영
function finalizeItem(item) {
  const sum = st => item.affixes.filter(a => a.stat === st).reduce((t, a) => t + a.value, 0);
  if (item.baseDmg) {
    const ed = 1 + sum('edmg') / 100;
    const flat = sum('dmgFlat');
    item.dmg = [Math.round(item.baseDmg[0] * ed + flat), Math.round(item.baseDmg[1] * ed + flat)];
    item.enhanced = ed > 1 || flat > 0;
  }
  if (item.baseDef !== undefined) {
    item.def = Math.round(item.baseDef * (1 + sum('edef') / 100));
    item.enhanced = sum('edef') > 0;
  }
  item.value = Math.round((6 + item.ilvl * 3) * [1, 2.5, 6, 15][item.rarity]);
  return item;
}

function generateUnique(ilvl, slot) {
  let pool = UNIQUES.filter(u => u.lvl <= ilvl);
  if (slot) pool = pool.filter(u => BASE_INDEX[u.base].slot === slot);
  if (!pool.length) return null;
  // 레벨이 높은 유니크일수록 조금 더 귀하다
  const u = weightedPick(pool, u => 1 + (ilvl - u.lvl) * 0.15);
  const base = BASE_INDEX[u.base];
  const item = baseItem(base, base.slot, ilvl, 3);
  item.name = u.name;
  item.uniqueId = u.id;
  item.flavor = u.flavor;
  item.req = u.lvl;
  for (const st in u.stats) {
    const [a, b] = u.stats[st];
    item.affixes.push({ stat: st, value: randInt(a, b), local: st === 'edmg' || st === 'edef' || (st === 'dmgFlat' && base.slot === 'weapon') });
  }
  return finalizeItem(item);
}

function generateItem(ilvl, rarity, opts = {}) {
  ilvl = Math.max(1, Math.round(ilvl));
  let slot = opts.slot || pickSlot();
  if (rarity === 3) {
    const u = generateUnique(ilvl, opts.slot);
    if (u) return u;
    rarity = 2;
  }
  if ((slot === 'ring' || slot === 'amulet') && rarity === 0) rarity = 1;
  const base = opts.baseId ? BASE_INDEX[opts.baseId] : BASE_INDEX[pickBase(slot, ilvl).id];
  slot = base.slot;
  const item = baseItem(base, slot, ilvl, rarity);
  const used = new Set();

  if (rarity === 1) {
    let pre = chance(0.6), suf = chance(0.6);
    if (!pre && !suf) chance(0.5) ? pre = true : suf = true;
    const p = pre ? addAffix(item, 'pre', used) : null;
    const s = suf ? addAffix(item, 'suf', used) : null;
    item.name = `${s ? s.name + ' ' : ''}${p ? p.name + ' ' : ''}${base.name}`;
    item.req = Math.max(base.lvl, Math.floor(ilvl * 0.6));
  } else if (rarity === 2) {
    const n = randInt(3, ilvl >= 12 ? 5 : 4);
    let pre = 0, suf = 0;
    for (let i = 0; i < n; i++) {
      const kind = pre >= 3 ? 'suf' : suf >= 3 ? 'pre' : (chance(0.5) ? 'pre' : 'suf');
      if (addAffix(item, kind, used)) kind === 'pre' ? pre++ : suf++;
    }
    item.name = `${pick(RARE_PREFIX)}의 ${pick(RARE_SUFFIX[slot])}`;
    item.req = Math.max(base.lvl, Math.floor(ilvl * 0.8));
  }
  return finalizeItem(item);
}

// ── 희귀도 굴림: 몬스터 레벨이 높을수록 레어·유니크 확률 상승 ──
// tier: 0 일반, 1 챔피언, 2 유니크 정예, 3 보스, 4 상자
function rarityChances(mlvl, tier, mf) {
  const mfM = 1 + mf / 100;
  const mfR = 1 + (mf * 0.6) / 100;
  const mfU = 1 + (mf * 0.4) / 100;
  const em = [
    { m: 1, r: 1, u: 1 },
    { m: 1.6, r: 2.5, u: 3 },
    { m: 1.8, r: 3.5, u: 5 },
    { m: 2, r: 4, u: 10 },
    { m: 1.7, r: 2.8, u: 3.5 },
  ][tier];
  const u = mlvl >= 3 ? (0.003 + 0.0015 * mlvl) * em.u * mfU : 0;
  const r = mlvl >= 2 ? (0.02 + 0.007 * mlvl) * em.r * mfR : 0;
  const m = (0.2 + 0.012 * mlvl) * em.m * mfM;
  const total = u + r + m;
  const cap = 0.97;
  const k = total > cap ? cap / total : 1;
  return { u: u * k, r: r * k, m: m * k };
}

function rollRarity(mlvl, tier, mf) {
  const c = rarityChances(mlvl, tier, mf);
  const x = Math.random();
  if (x < c.u) return 3;
  if (x < c.u + c.r) return 2;
  if (x < c.u + c.r + c.m) return 1;
  return 0;
}

// ── 툴팁 HTML ──
function itemTooltipHtml(item, opts = {}) {
  const col = RARITY[item.rarity].color;
  const lines = [];
  if (opts.header) lines.push(`<div class="tt-header">${opts.header}</div>`);
  lines.push(`<div class="tt-name" style="color:${col}">${escapeHtml(item.name)}</div>`);
  if (item.rarity >= 2) lines.push(`<div class="tt-base" style="color:${col}">${escapeHtml(item.baseName)}</div>`);
  lines.push(`<div class="tt-type">${RARITY[item.rarity].name} ${SLOT_NAMES[item.slot]} · 아이템 레벨 ${item.ilvl}</div>`);
  if (item.dmg) {
    lines.push(`<div class="tt-stat">피해: <span class="${item.enhanced ? 'tt-mod' : ''}">${item.dmg[0]} - ${item.dmg[1]}</span></div>`);
    lines.push(`<div class="tt-stat">초당 공격: ${item.aps.toFixed(2)}</div>`);
  }
  if (item.def !== undefined) {
    lines.push(`<div class="tt-stat">방어력: <span class="${item.enhanced ? 'tt-mod' : ''}">${item.def}</span></div>`);
  }
  const lvl = typeof player !== 'undefined' && player ? player.level : 99;
  lines.push(`<div class="tt-stat ${lvl < item.req ? 'tt-bad' : ''}">요구 레벨: ${item.req}</div>`);
  for (const a of item.affixes) {
    const f = STAT_TEXT[a.stat];
    if (f) lines.push(`<div class="tt-mod">${f(a.value)}</div>`);
  }
  if (item.flavor) lines.push(`<div class="tt-flavor">“${escapeHtml(item.flavor)}”</div>`);
  if (!opts.noValue) lines.push(`<div class="tt-value">판매 가격 ${item.value} 골드</div>`);
  return lines.join('');
}
