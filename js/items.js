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

const ACTIVE_SKILLS = Object.keys(SKILLS).filter(id => SKILLS[id].type === 'active');

function rollAffix(aff, ilvl) {
  const tiers = aff.tiers.filter(t => t[0] <= ilvl);
  if (!tiers.length) return null;
  const idx = weightedPick(tiers.map((t, i) => i), i => 1 + i * 1.5);
  const t = tiers[idx];
  const a = { stat: aff.stat, value: randInt(t[1], t[2]), name: t[3], aid: aff.id, local: !!aff.local };
  if (aff.stat === 'skill') { a.skill = pick(ACTIVE_SKILLS); a.name = `${SKILLS[a.skill].name}의`; }
  return a;
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
    rarity, ilvl, affixes: [], name: base.name, req: base.lvl, plus: 0,
  };
  // 아이템 레벨이 기본형보다 아주 높으면 기본 수치가 조금 오른다
  const bonus = 1 + Math.max(0, ilvl - 34) * 0.04;
  if (base.dmg) {
    item.baseDmg = [Math.round(base.dmg[0] * bonus), Math.round(base.dmg[1] * bonus)];
    item.aps = base.aps;
  }
  if (base.def) item.baseDef = Math.round(randInt(base.def[0], base.def[1]) * bonus);
  if (base.block) item.block = base.block;
  return item;
}

const RARITY_VALUE = [1, 2.5, 6, 15, 12];
const PLUS_STEP = 0.07;  // 강화 1단계당 피해·방어력 +7%

// 지역 속성(무기 피해 %, 방어력 %)과 강화 단계를 아이템 수치에 반영
function finalizeItem(item) {
  const sum = st => item.affixes.filter(a => a.stat === st).reduce((t, a) => t + a.value, 0);
  const plusK = 1 + (item.plus || 0) * PLUS_STEP;
  if (item.baseDmg) {
    const ed = 1 + sum('edmg') / 100;
    const flat = sum('dmgFlat');
    item.dmg = [Math.round((item.baseDmg[0] * ed + flat) * plusK), Math.round((item.baseDmg[1] * ed + flat) * plusK)];
    item.enhanced = ed > 1 || flat > 0 || item.plus > 0;
  }
  if (item.baseDef !== undefined) {
    item.def = Math.round(item.baseDef * (1 + sum('edef') / 100) * plusK);
    item.enhanced = sum('edef') > 0 || item.plus > 0;
  }
  item.value = Math.round((6 + item.ilvl * 3) * RARITY_VALUE[item.rarity] * (1 + (item.plus || 0) * 0.25));
  return item;
}

function itemName(item) { return item.plus ? `+${item.plus} ${item.name}` : item.name; }

// 유니크·세트처럼 정해진 능력치 목록으로 아이템을 만든다
function applyFixedStats(item, stats, slot) {
  for (const st in stats) {
    const [a, b] = stats[st];
    if (st.startsWith('sk:')) { item.affixes.push({ stat: 'skill', skill: st.slice(3), value: randInt(a, b) }); continue; }
    item.affixes.push({ stat: st, value: randInt(a, b), local: st === 'edmg' || st === 'edef' || (st === 'dmgFlat' && slot === 'weapon') });
  }
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
  applyFixedStats(item, u.stats, base.slot);
  return finalizeItem(item);
}

function generateSet(ilvl, slot) {
  let pool = SET_ITEMS.filter(s => s.lvl <= ilvl + 2);
  if (slot) pool = pool.filter(s => BASE_INDEX[s.base].slot === slot);
  if (!pool.length) return null;
  const s = weightedPick(pool, s => 1 + Math.max(0, 8 - Math.abs(ilvl - s.lvl)) * 0.3);
  const base = BASE_INDEX[s.base];
  const item = baseItem(base, base.slot, Math.max(ilvl, s.lvl), 4);
  item.name = s.name;
  item.setId = s.set;
  item.setItem = s.id;
  item.req = s.lvl;
  applyFixedStats(item, s.stats, base.slot);
  return finalizeItem(item);
}

// 마법·레어 아이템에 접사를 붙이고 이름을 정함
function rollAffixes(item) {
  const base = BASE_INDEX[item.baseId];
  const used = new Set();
  item.affixes = [];
  if (item.rarity === 1) {
    let pre = chance(0.6), suf = chance(0.6);
    if (!pre && !suf) chance(0.5) ? pre = true : suf = true;
    const p = pre ? addAffix(item, 'pre', used) : null;
    const s = suf ? addAffix(item, 'suf', used) : null;
    item.name = `${s ? s.name + ' ' : ''}${p ? p.name + ' ' : ''}${base.name}`;
    item.req = Math.max(base.lvl, Math.floor(item.ilvl * 0.6));
  } else if (item.rarity === 2) {
    const n = randInt(3, item.ilvl >= 12 ? 5 : 4) + (item.ilvl >= 24 && chance(0.4) ? 1 : 0);
    let pre = 0, suf = 0;
    for (let i = 0; i < n; i++) {
      const kind = pre >= 3 ? 'suf' : suf >= 3 ? 'pre' : (chance(0.5) ? 'pre' : 'suf');
      if (addAffix(item, kind, used)) kind === 'pre' ? pre++ : suf++;
    }
    item.name = `${pick(RARE_PREFIX)}의 ${pick(RARE_SUFFIX[item.slot])}`;
    item.req = Math.max(base.lvl, Math.floor(item.ilvl * 0.8));
  } else {
    item.name = base.name;
    item.req = base.lvl;
  }
}

function generateItem(ilvl, rarity, opts = {}) {
  ilvl = Math.max(1, Math.round(ilvl));
  let slot = opts.slot || pickSlot();
  if (rarity === 4) {
    const s = generateSet(ilvl, opts.slot);
    if (s) return s;
    rarity = 3;
  }
  if (rarity === 3) {
    const u = generateUnique(ilvl, opts.slot);
    if (u) return u;
    rarity = 2;
  }
  if ((slot === 'ring' || slot === 'amulet') && rarity === 0) rarity = 1;
  const base = opts.baseId ? BASE_INDEX[opts.baseId] : BASE_INDEX[pickBase(slot, ilvl).id];
  slot = base.slot;
  const item = baseItem(base, slot, ilvl, rarity);
  rollAffixes(item);
  return finalizeItem(item);
}

// 재련: 같은 희귀도로 접사를 다시 굴림
function rerollItem(item) {
  rollAffixes(item);
  return finalizeItem(item);
}
// 승급: 일반 → 마법 → 레어
function upgradeRarity(item) {
  item.rarity = Math.min(2, item.rarity + 1);
  rollAffixes(item);
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
  const u = mlvl >= 3 ? (0.004 + 0.0015 * mlvl) * em.u * mfU : 0;
  const r = mlvl >= 2 ? (0.03 + 0.008 * mlvl) * em.r * mfR : 0;
  const m = (0.28 + 0.012 * mlvl) * em.m * mfM;
  const total = u + r + m;
  const cap = 0.97;
  const k = total > cap ? cap / total : 1;
  return { u: u * k, r: r * k, m: m * k };
}

// 유니크 굴림의 35%는 세트 아이템이 된다
function rollRarity(mlvl, tier, mf) {
  const c = rarityChances(mlvl, tier, mf);
  const x = Math.random();
  if (x < c.u) return chance(0.35) ? 4 : 3;
  if (x < c.u + c.r) return 2;
  if (x < c.u + c.r + c.m) return 1;
  return 0;
}

// 착용 중인 세트 조각 수
function setCounts(equipment) {
  const n = {};
  for (const k of EQUIP_KEYS) {
    const it = equipment[k];
    if (it && it.setId) n[it.setId] = (n[it.setId] || 0) + 1;
  }
  return n;
}

function statLine(stat, value) {
  const f = STAT_TEXT[stat];
  return f ? f(value) : '';
}

// ── 툴팁 HTML ──
function itemTooltipHtml(item, opts = {}) {
  const col = RARITY[item.rarity].color;
  const lines = [];
  if (opts.header) lines.push(`<div class="tt-header">${opts.header}</div>`);
  lines.push(`<div class="tt-name" style="color:${col}">${escapeHtml(itemName(item))}</div>`);
  if (item.rarity >= 2) lines.push(`<div class="tt-base" style="color:${col}">${escapeHtml(item.baseName)}</div>`);
  const two = item.slot === 'weapon' && isTwoHanded(item) ? ' · 양손' : '';
  lines.push(`<div class="tt-type">${RARITY[item.rarity].name} ${SLOT_NAMES[item.slot]}${two} · 아이템 레벨 ${item.ilvl}</div>`);
  if (item.dmg) {
    lines.push(`<div class="tt-stat">피해: <span class="${item.enhanced ? 'tt-mod' : ''}">${item.dmg[0]} - ${item.dmg[1]}</span></div>`);
    lines.push(`<div class="tt-stat">초당 공격: ${item.aps.toFixed(2)}</div>`);
  }
  if (item.def !== undefined) {
    lines.push(`<div class="tt-stat">방어력: <span class="${item.enhanced ? 'tt-mod' : ''}">${item.def}</span></div>`);
  }
  if (item.block) lines.push(`<div class="tt-stat">막기 확률: ${item.block}%</div>`);
  if (item.plus) lines.push(`<div class="tt-stat tt-plus">강화 +${item.plus} (기본 수치 +${Math.round(item.plus * PLUS_STEP * 100)}%)</div>`);
  const lvl = typeof player !== 'undefined' && player ? player.level : 99;
  lines.push(`<div class="tt-stat ${lvl < item.req ? 'tt-bad' : ''}">요구 레벨: ${item.req}</div>`);
  for (const a of item.affixes) {
    const t = affixText(a);
    if (t) lines.push(`<div class="tt-mod${item.rarity === 4 ? ' tt-set' : ''}">${t}</div>`);
  }
  if (item.setId && SETS[item.setId]) {
    const S = SETS[item.setId];
    const have = typeof player !== 'undefined' && player ? setCounts(player.equipment)[item.setId] || 0 : 0;
    const pieces = SET_ITEMS.filter(s => s.set === item.setId);
    const worn = new Set(typeof player !== 'undefined' && player ? EQUIP_KEYS.map(k => player.equipment[k] && player.equipment[k].setItem).filter(Boolean) : []);
    lines.push(`<div class="tt-setname">${S.name} (${have}/${pieces.length})</div>`);
    for (const pc of pieces) lines.push(`<div class="tt-setpiece${worn.has(pc.id) ? ' on' : ''}">${pc.name}</div>`);
    for (const n of Object.keys(S.bonus)) {
      const txt = Object.entries(S.bonus[n]).map(([st, v]) => statLine(st, v)).join(', ');
      lines.push(`<div class="tt-setbonus${have >= +n ? ' on' : ''}">${n}세트: ${txt}</div>`);
    }
  }
  if (item.flavor) lines.push(`<div class="tt-flavor">“${escapeHtml(item.flavor)}”</div>`);
  if (!opts.noValue) lines.push(`<div class="tt-value">${opts.price ? `가격 ${opts.price.toLocaleString()} 골드` : `판매 가격 ${item.value} 골드`}</div>`);
  return lines.join('');
}
