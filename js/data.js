'use strict';
// ───────── 게임 데이터: 스킬, 아이템, 몬스터, 테마 ─────────

const RARITY = [
  { name: '일반', color: '#e8e2d6' },
  { name: '마법', color: '#8a91ff' },
  { name: '레어', color: '#f4e06d' },
  { name: '유니크', color: '#d6a95c' },
];

const SLOT_NAMES = {
  weapon: '무기', helm: '투구', armor: '갑옷', gloves: '장갑',
  boots: '장화', belt: '허리띠', ring: '반지', amulet: '목걸이',
};
const EQUIP_KEYS = ['weapon', 'helm', 'amulet', 'armor', 'ring1', 'ring2', 'gloves', 'belt', 'boots'];
function slotOfKey(key) { return key.startsWith('ring') ? 'ring' : key; }

// ── 스킬 ──
// vals(L): 레벨별 수치, key(v): 카드에 보여줄 핵심 수치, desc(v): 설명
const SKILLS = {
  bash: {
    name: '강타', type: 'active', max: 5,
    vals: L => ({ mult: 1.6 + 0.3 * L, stun: 0.3 + 0.1 * L, knock: 90 + 15 * L, cost: 6, cd: 0 }),
    key: v => `피해 ${pct(v.mult)}`,
    desc: v => `대상을 힘껏 내려쳐 무기 피해의 ${pct(v.mult)}를 주고, 밀쳐내며 ${v.stun.toFixed(1)}초 기절시킵니다. 분노 ${v.cost}.`,
  },
  whirlwind: {
    name: '소용돌이', type: 'active', max: 5, channel: true,
    vals: L => ({ mult: 0.45 + 0.1 * L, radius: 90 + 6 * L, drain: Math.max(14, 24 - 2 * L), cost: 5, cd: 0 }),
    key: v => `타격당 ${pct(v.mult)}`,
    desc: v => `키를 누르고 있는 동안 회전하며 커서 쪽으로 이동합니다. 반경 ${v.radius} 안의 적에게 0.18초마다 무기 피해의 ${pct(v.mult)}. 초당 분노 ${v.drain}.`,
  },
  leap: {
    name: '도약 강타', type: 'active', max: 5,
    vals: L => ({ mult: 2.0 + 0.4 * L, radius: 105 + 10 * L, range: 300 + 25 * L, stun: 0.6 + 0.1 * L, cost: 15, cd: Math.max(3, 7 - 0.7 * L) }),
    key: v => `피해 ${pct(v.mult)}`,
    desc: v => `커서 위치로 도약해 착지 지점 반경 ${v.radius} 안의 적에게 ${pct(v.mult)} 피해를 주고 ${v.stun.toFixed(1)}초 기절시킵니다. 재사용 ${v.cd.toFixed(1)}초, 분노 ${v.cost}.`,
  },
  warcry: {
    name: '전투의 함성', type: 'active', max: 5,
    vals: L => ({ mult: 1.0 + 0.25 * L, radius: 210 + 20 * L, stun: 1.4 + 0.25 * L, cost: 20, cd: Math.max(5, 10 - 0.8 * L) }),
    key: v => `기절 ${v.stun.toFixed(1)}초`,
    desc: v => `포효로 반경 ${v.radius} 안의 모든 적에게 ${pct(v.mult)} 피해를 주고 ${v.stun.toFixed(1)}초 기절시킵니다. 재사용 ${v.cd.toFixed(1)}초, 분노 ${v.cost}.`,
  },
  slam: {
    name: '대지 분쇄', type: 'active', max: 5,
    vals: L => ({ mult: 1.8 + 0.35 * L, length: 300 + 30 * L, width: 70, cost: 14, cd: Math.max(1.4, 3.2 - 0.35 * L) }),
    key: v => `피해 ${pct(v.mult)}`,
    desc: v => `땅을 내리쳐 앞쪽 ${v.length} 거리로 뻗어가는 균열을 일으킵니다. 닿은 적에게 ${pct(v.mult)} 피해. 재사용 ${v.cd.toFixed(1)}초, 분노 ${v.cost}.`,
  },
  axes: {
    name: '투척 도끼', type: 'active', max: 5,
    vals: L => ({ mult: 0.8 + 0.15 * L, count: 1 + Math.floor(L / 2), pierce: 1 + Math.floor((L - 1) / 2), cost: 6, cd: 0.3 }),
    key: v => `도끼 ${v.count}개 · ${pct(v.mult)}`,
    desc: v => `회전하는 도끼 ${v.count}개를 던져 적을 최대 ${v.pierce}회 관통합니다. 도끼마다 ${pct(v.mult)} 피해. 분노 ${v.cost}.`,
  },
  berserk: {
    name: '광폭화', type: 'active', max: 5,
    vals: L => ({ dmg: 20 + 10 * L, ias: 15 + 3 * L, dur: 5 + L, lifeSteal: 2, move: 15, cost: 25, cd: Math.max(14, 22 - 1.5 * L) }),
    key: v => `피해 +${v.dmg}% · ${v.dur}초`,
    desc: v => `${v.dur}초 동안 광기에 빠져 피해 +${v.dmg}%, 공격 속도 +${v.ias}%, 이동 속도 +${v.move}%, 생명력 흡수 +${v.lifeSteal}%. 재사용 ${v.cd.toFixed(0)}초, 분노 ${v.cost}.`,
  },
  // 패시브
  mastery: {
    name: '무기 숙련', type: 'passive', max: 5,
    vals: L => ({ dmgPct: 12 * L, crit: 2 * L }),
    key: v => `피해 +${v.dmgPct}%`,
    desc: v => `모든 피해 +${v.dmgPct}%, 치명타 확률 +${v.crit}%.`,
  },
  hide: {
    name: '단련된 피부', type: 'passive', max: 5,
    vals: L => ({ armorPct: 20 * L, armor: 8 * L }),
    key: v => `방어력 +${v.armorPct}%`,
    desc: v => `방어력 +${v.armor}, 그리고 총 방어력 +${v.armorPct}%.`,
  },
  toughness: {
    name: '강인함', type: 'passive', max: 5,
    vals: L => ({ lifePct: 10 * L }),
    key: v => `생명력 +${v.lifePct}%`,
    desc: v => `최대 생명력 +${v.lifePct}%.`,
  },
  bloodlust: {
    name: '피의 갈증', type: 'passive', max: 5,
    vals: L => ({ lifeSteal: 1.5 * L }),
    key: v => `흡수 ${v.lifeSteal}%`,
    desc: v => `가한 피해의 ${v.lifeSteal}%를 생명력으로 흡수합니다.`,
  },
  swiftness: {
    name: '전투 질주', type: 'passive', max: 5,
    vals: L => ({ moveSpeed: 6 * L, ias: 6 * L }),
    key: v => `속도 +${v.ias}%`,
    desc: v => `이동 속도 +${v.moveSpeed}%, 공격 속도 +${v.ias}%.`,
  },
  furyheart: {
    name: '분노의 심장', type: 'passive', max: 5,
    vals: L => ({ furyMax: 10 * L, furyRegen: 1.5 * L }),
    key: v => `분노 +${v.furyMax}`,
    desc: v => `최대 분노 +${v.furyMax}, 초당 분노 회복 +${v.furyRegen}.`,
  },
  executioner: {
    name: '처형인', type: 'passive', max: 5,
    vals: L => ({ critDmg: 25 * L, crit: L }),
    key: v => `치명타 피해 +${v.critDmg}%`,
    desc: v => `치명타 피해 +${v.critDmg}%, 치명타 확률 +${v.crit}%.`,
  },
  regen: {
    name: '재생력', type: 'passive', max: 5,
    vals: L => ({ regenPct: 0.4 * L }),
    key: v => `초당 ${v.regenPct.toFixed(1)}%`,
    desc: v => `매초 최대 생명력의 ${v.regenPct.toFixed(1)}%를 회복합니다.`,
  },
  thornskin: {
    name: '가시 갑주', type: 'passive', max: 5,
    vals: L => ({ mult: L }),
    key: v => `반사 ×${v.mult}`,
    desc: v => `근접 공격한 적에게 (4 + 캐릭터 레벨×1.5)×${v.mult} 피해를 되돌려줍니다.`,
  },
  treasure: {
    name: '보물 사냥꾼', type: 'passive', max: 5,
    vals: L => ({ mf: 15 * L, gf: 25 * L }),
    key: v => `발견 +${v.mf}%`,
    desc: v => `마법 아이템 발견 확률 +${v.mf}%, 골드 획득량 +${v.gf}%. 레어·유니크가 더 자주 나옵니다.`,
  },
};

// 모든 스킬이 최대일 때 나오는 보너스 카드
const BONUS_CARDS = [
  { id: '_life', name: '생명의 정수', key: '최대 생명력 +25', desc: '최대 생명력이 영구히 25 증가합니다.' },
  { id: '_gold', name: '전쟁 자금', key: '골드 +500', desc: '골드 500을 얻습니다.' },
  { id: '_potion', name: '물약 꾸러미', key: '물약 +3', desc: '생명력 물약 3개를 얻습니다.' },
];

// ── 아이템 기본형 ──
const ITEM_BASES = {
  weapon: [
    { id: 'handaxe', name: '손도끼', lvl: 1, dmg: [3, 6], aps: 1.25, icon: 'axe' },
    { id: 'longsword', name: '장검', lvl: 1, dmg: [2, 8], aps: 1.2, icon: 'sword' },
    { id: 'club', name: '철퇴', lvl: 2, dmg: [4, 9], aps: 1.1, icon: 'mace' },
    { id: 'waraxe', name: '전투 도끼', lvl: 5, dmg: [7, 14], aps: 1.2, icon: 'axe' },
    { id: 'broadsword', name: '넓은 검', lvl: 7, dmg: [8, 17], aps: 1.2, icon: 'sword' },
    { id: 'morningstar', name: '모닝스타', lvl: 9, dmg: [11, 20], aps: 1.1, icon: 'mace' },
    { id: 'doubleaxe', name: '쌍날 도끼', lvl: 11, dmg: [13, 28], aps: 1.0, icon: 'greataxe' },
    { id: 'bastard', name: '대검', lvl: 13, dmg: [15, 31], aps: 1.05, icon: 'greatsword' },
    { id: 'warhammer', name: '전쟁 망치', lvl: 15, dmg: [20, 35], aps: 0.95, icon: 'hammer' },
    { id: 'berserkeraxe', name: '광전사 도끼', lvl: 18, dmg: [22, 40], aps: 1.15, icon: 'axe' },
    { id: 'executioner', name: '처형자의 검', lvl: 21, dmg: [28, 51], aps: 1.05, icon: 'greatsword' },
    { id: 'ancientaxe', name: '고대 도끼', lvl: 24, dmg: [34, 63], aps: 1.0, icon: 'greataxe' },
  ],
  helm: [
    { id: 'cap', name: '가죽 모자', lvl: 1, def: [3, 5], icon: 'cap', look: 0 },
    { id: 'skullcap', name: '해골 투구', lvl: 4, def: [7, 10], icon: 'helm', look: 1 },
    { id: 'hornhelm', name: '뿔 투구', lvl: 8, def: [12, 16], icon: 'hornhelm', look: 2 },
    { id: 'warhelm', name: '전투 투구', lvl: 12, def: [18, 24], icon: 'helm', look: 1 },
    { id: 'greathelm', name: '대투구', lvl: 16, def: [26, 34], icon: 'greathelm', look: 3 },
    { id: 'warlordhelm', name: '전쟁군주의 투구', lvl: 21, def: [36, 46], icon: 'hornhelm', look: 2 },
    { id: 'ancienthorn', name: '고대의 뿔관', lvl: 26, def: [48, 60], icon: 'hornhelm', look: 2 },
  ],
  armor: [
    { id: 'quilted', name: '누비 갑옷', lvl: 1, def: [8, 11], icon: 'robe', look: 0 },
    { id: 'leatherarmor', name: '가죽 갑옷', lvl: 3, def: [12, 16], icon: 'robe', look: 0 },
    { id: 'scalemail', name: '미늘 갑옷', lvl: 7, def: [20, 28], icon: 'mail', look: 1 },
    { id: 'chainmail', name: '사슬 갑옷', lvl: 11, def: [30, 40], icon: 'mail', look: 1 },
    { id: 'platemail', name: '판금 갑옷', lvl: 15, def: [42, 55], icon: 'plate', look: 2 },
    { id: 'gothicplate', name: '고딕 판금', lvl: 20, def: [58, 72], icon: 'plate', look: 2 },
    { id: 'ancientarmor', name: '고대 갑옷', lvl: 25, def: [75, 95], icon: 'plate', look: 3 },
  ],
  gloves: [
    { id: 'leathergloves', name: '가죽 장갑', lvl: 1, def: [2, 3], icon: 'gloves', look: 0 },
    { id: 'chaingloves', name: '사슬 장갑', lvl: 6, def: [5, 7], icon: 'gloves', look: 1 },
    { id: 'steelgauntlets', name: '강철 건틀릿', lvl: 12, def: [9, 12], icon: 'gauntlets', look: 2 },
    { id: 'wargauntlets', name: '전쟁 건틀릿', lvl: 19, def: [14, 18], icon: 'gauntlets', look: 2 },
  ],
  boots: [
    { id: 'leatherboots', name: '가죽 장화', lvl: 1, def: [2, 3], icon: 'boots', look: 0 },
    { id: 'chainboots', name: '사슬 장화', lvl: 6, def: [5, 7], icon: 'boots', look: 1 },
    { id: 'plateboots', name: '판금 장화', lvl: 12, def: [9, 12], icon: 'boots', look: 2 },
    { id: 'warboots', name: '전쟁 장화', lvl: 19, def: [14, 18], icon: 'boots', look: 2 },
  ],
  belt: [
    { id: 'sash', name: '끈 허리띠', lvl: 1, def: [2, 3], icon: 'belt', look: 0 },
    { id: 'leatherbelt', name: '가죽 허리띠', lvl: 5, def: [4, 6], icon: 'belt', look: 0 },
    { id: 'chainbelt', name: '사슬 허리띠', lvl: 11, def: [8, 10], icon: 'belt', look: 1 },
    { id: 'warbelt', name: '전쟁 허리띠', lvl: 18, def: [12, 15], icon: 'belt', look: 2 },
  ],
  ring: [{ id: 'ring', name: '반지', lvl: 1, icon: 'ring' }],
  amulet: [{ id: 'amulet', name: '목걸이', lvl: 1, icon: 'amulet' }],
};

const BASE_INDEX = {};
for (const slot in ITEM_BASES) for (const b of ITEM_BASES[slot]) BASE_INDEX[b.id] = Object.assign({ slot }, b);

const SLOT_WEIGHTS = { weapon: 22, helm: 12, armor: 12, gloves: 10, boots: 10, belt: 9, ring: 9, amulet: 6 };

// ── 접두사 / 접미사 ──
// tiers: [등장 레벨, 최소, 최대, 이름]
const AFFIXES = [
  { id: 'edmg', kind: 'pre', stat: 'edmg', slots: ['weapon'], local: true,
    tiers: [[1, 20, 40, '날카로운'], [6, 41, 65, '잔혹한'], [12, 66, 95, '흉포한'], [18, 96, 130, '무자비한'], [26, 131, 170, '학살하는']] },
  { id: 'dmgFlat', kind: 'pre', stat: 'dmgFlat', slots: ['weapon', 'ring', 'amulet', 'gloves'],
    tiers: [[1, 1, 3, '가시 돋친'], [6, 4, 7, '찢어발기는'], [12, 8, 12, '참혹한'], [18, 13, 18, '도륙하는'], [26, 19, 26, '파쇄하는']] },
  { id: 'edef', kind: 'pre', stat: 'edef', slots: ['helm', 'armor', 'gloves', 'boots', 'belt'], local: true,
    tiers: [[1, 20, 40, '튼튼한'], [6, 41, 65, '강화된'], [12, 66, 95, '견고한'], [18, 96, 130, '불굴의']] },
  { id: 'armor', kind: 'pre', stat: 'armor', slots: ['helm', 'armor', 'gloves', 'boots', 'belt', 'amulet'],
    tiers: [[1, 4, 10, '두꺼운'], [6, 11, 22, '단련된'], [12, 23, 40, '철벽의'], [18, 41, 65, '요새 같은']] },
  { id: 'lifeSteal', kind: 'pre', stat: 'lifeSteal', slots: ['weapon', 'ring', 'amulet', 'gloves'],
    tiers: [[3, 2, 3, '피에 굶주린'], [12, 4, 6, '흡혈하는']] },
  { id: 'mf', kind: 'pre', stat: 'mf', slots: ['helm', 'ring', 'amulet', 'boots'],
    tiers: [[1, 5, 12, '행운의'], [8, 13, 22, '운명의'], [15, 23, 35, '황금빛']] },
  { id: 'crit', kind: 'pre', stat: 'crit', slots: ['weapon', 'helm', 'ring', 'amulet'],
    tiers: [[1, 2, 3, '정밀한'], [8, 4, 6, '치명적인'], [16, 7, 9, '꿰뚫는']] },
  { id: 'furyMax', kind: 'pre', stat: 'furyMax', slots: ['helm', 'amulet', 'belt'],
    tiers: [[1, 5, 10, '분노한'], [10, 11, 20, '격노한']] },
  { id: 'allSkills', kind: 'pre', stat: 'allSkills', slots: ['amulet', 'helm'], weight: 0.35,
    tiers: [[18, 1, 1, '영웅적인']] },
  { id: 'life', kind: 'suf', stat: 'life', slots: ['helm', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'],
    tiers: [[1, 5, 10, '여우의'], [5, 11, 20, '늑대의'], [10, 21, 35, '곰의'], [16, 36, 55, '고래의'], [22, 56, 80, '거인의']] },
  { id: 'ias', kind: 'suf', stat: 'ias', slots: ['weapon', 'gloves', 'ring'],
    tiers: [[1, 5, 10, '민첩함의'], [8, 11, 15, '신속함의'], [15, 16, 22, '질풍의']] },
  { id: 'lifeRegen', kind: 'suf', stat: 'lifeRegen', slots: ['helm', 'armor', 'belt', 'ring', 'amulet'],
    tiers: [[1, 1, 2, '재생의'], [8, 3, 4, '회복의'], [16, 5, 8, '불사의']] },
  { id: 'moveSpeed', kind: 'suf', stat: 'moveSpeed', slots: ['boots'],
    tiers: [[1, 5, 10, '여행자의'], [6, 11, 20, '사냥꾼의'], [14, 21, 30, '질주의']] },
  { id: 'dmgPct', kind: 'suf', stat: 'dmgPct', slots: ['ring', 'amulet', 'gloves'],
    tiers: [[1, 5, 10, '힘의'], [8, 11, 18, '용맹의'], [16, 19, 28, '전쟁의']] },
  { id: 'thorns', kind: 'suf', stat: 'thorns', slots: ['armor', 'belt', 'helm'],
    tiers: [[1, 3, 6, '가시의'], [8, 7, 14, '쐐기의'], [15, 15, 25, '고통의']] },
  { id: 'gf', kind: 'suf', stat: 'gf', slots: ['helm', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'],
    tiers: [[1, 20, 40, '탐욕의'], [10, 41, 80, '왕의']] },
  { id: 'xp', kind: 'suf', stat: 'xp', slots: ['helm', 'ring', 'amulet'],
    tiers: [[3, 3, 5, '지혜의'], [12, 6, 10, '현자의']] },
  { id: 'critDmg', kind: 'suf', stat: 'critDmg', slots: ['weapon', 'ring', 'amulet', 'gloves'],
    tiers: [[1, 10, 20, '도살의'], [9, 21, 35, '처형의'], [17, 36, 50, '파멸의']] },
  { id: 'furyRegen', kind: 'suf', stat: 'furyRegen', slots: ['helm', 'ring', 'amulet', 'belt'],
    tiers: [[1, 1, 1, '열기의'], [8, 2, 2, '격분의'], [16, 3, 3, '광기의']] },
];

const STAT_TEXT = {
  edmg: v => `피해 +${v}% 증가`,
  dmgFlat: v => `피해 +${v}`,
  edef: v => `방어력 +${v}% 증가`,
  armor: v => `방어력 +${v}`,
  lifeSteal: v => `가한 피해의 ${v}% 생명력 흡수`,
  mf: v => `마법 아이템 발견 확률 +${v}%`,
  crit: v => `치명타 확률 +${v}%`,
  critDmg: v => `치명타 피해 +${v}%`,
  furyMax: v => `최대 분노 +${v}`,
  furyRegen: v => `초당 분노 회복 +${v}`,
  allSkills: v => `모든 스킬 레벨 +${v}`,
  life: v => `생명력 +${v}`,
  ias: v => `공격 속도 +${v}%`,
  lifeRegen: v => `초당 생명력 회복 +${v}`,
  moveSpeed: v => `이동 속도 +${v}%`,
  dmgPct: v => `모든 피해 +${v}%`,
  thorns: v => `근접 공격자에게 가시 피해 ${v}`,
  gf: v => `골드 획득량 +${v}%`,
  xp: v => `경험치 획득량 +${v}%`,
  procLightning: v => `적중 시 ${v}% 확률로 연쇄 번개`,
  procFireNova: v => `적중 시 ${v}% 확률로 화염 폭발`,
};

const RARE_PREFIX = ['파멸', '혈흔', '서리', '망자', '폭풍', '어둠', '해골', '분노', '독사', '강철', '재앙', '굶주림', '천둥', '심연', '유령', '잿빛', '핏빛', '악몽', '까마귀', '늑대'];
const RARE_SUFFIX = {
  weapon: ['송곳니', '절단자', '도살자', '파괴자', '쐐기', '이빨', '비명'],
  helm: ['왕관', '두건', '가면', '뿔', '시선'],
  armor: ['껍질', '외피', '보호막', '갑주', '수의'],
  gloves: ['손아귀', '주먹', '발톱', '손길'],
  boots: ['발걸음', '질주', '행군', '도약'],
  belt: ['허리끈', '사슬', '고리', '띠'],
  ring: ['고리', '인장', '소용돌이', '눈'],
  amulet: ['부적', '징표', '심장', '목걸이'],
};

// ── 유니크 ──
const UNIQUES = [
  { id: 'butcher', name: '도살자의 손도끼', base: 'handaxe', lvl: 3,
    stats: { edmg: [60, 80], dmgFlat: [2, 4], lifeSteal: [4, 4], ias: [15, 15] }, flavor: '피 냄새가 가시지 않는다.' },
  { id: 'hunterGrip', name: '사냥꾼의 손길', base: 'leathergloves', lvl: 3,
    stats: { edef: [40, 60], ias: [10, 10], dmgFlat: [2, 3], mf: [15, 20] }, flavor: '짐승의 가죽으로 꿰맨 장갑.' },
  { id: 'wanderer', name: '방랑자의 장화', base: 'leatherboots', lvl: 4,
    stats: { moveSpeed: [20, 20], life: [15, 20], gf: [50, 80] }, flavor: '끝없는 길이 발밑에 있다.' },
  { id: 'chieftain', name: '부족장의 목걸이', base: 'amulet', lvl: 5,
    stats: { dmgPct: [12, 18], life: [18, 25], furyRegen: [2, 2] }, flavor: '북방 부족장의 이빨로 엮었다.' },
  { id: 'bloodOath', name: '핏빛 서약', base: 'ring', lvl: 6,
    stats: { lifeSteal: [5, 5], dmgPct: [12, 15], crit: [3, 3] }, flavor: '맹세는 피로 갚는다.' },
  { id: 'bloodthirst', name: '피의 굶주림', base: 'waraxe', lvl: 7,
    stats: { edmg: [100, 130], lifeSteal: [6, 6], critDmg: [25, 35] }, flavor: '이 도끼는 결코 배부르지 않다.' },
  { id: 'windwalk', name: '바람걸음', base: 'chainboots', lvl: 8,
    stats: { edef: [60, 80], moveSpeed: [30, 30], life: [20, 25], mf: [20, 30] }, flavor: '발자국조차 남지 않는다.' },
  { id: 'ancestorHorn', name: '조상의 뿔', base: 'hornhelm', lvl: 9,
    stats: { edef: [80, 120], allSkills: [1, 1], life: [20, 30], furyMax: [15, 15] }, flavor: '선조들의 함성이 들린다.' },
  { id: 'thunderHammer', name: '천둥의 망치', base: 'morningstar', lvl: 10,
    stats: { edmg: [90, 120], procLightning: [12, 12], ias: [10, 10] }, flavor: '내려칠 때마다 하늘이 울린다.' },
  { id: 'ironHide', name: '무쇠 가죽', base: 'chainmail', lvl: 12,
    stats: { edef: [120, 160], thorns: [15, 20], life: [40, 60], lifeRegen: [4, 4] }, flavor: '천 번의 전투가 새긴 흉터.' },
  { id: 'warlordBelt', name: '군주의 허리띠', base: 'chainbelt', lvl: 12,
    stats: { edef: [100, 100], life: [50, 70], lifeRegen: [5, 5], furyRegen: [3, 3] }, flavor: '무너진 왕국의 마지막 유물.' },
  { id: 'giantGrip', name: '거인의 손아귀', base: 'steelgauntlets', lvl: 13,
    stats: { ias: [20, 20], dmgPct: [18, 22], crit: [5, 5], lifeSteal: [3, 3] }, flavor: '움켜쥔 것은 부서진다.' },
  { id: 'wolfFang', name: '늑대의 송곳니', base: 'ring', lvl: 14,
    stats: { ias: [15, 15], critDmg: [35, 45], dmgFlat: [6, 10] }, flavor: '무리는 약한 자를 먼저 문다.' },
  { id: 'deadEye', name: '망자의 눈', base: 'amulet', lvl: 16,
    stats: { allSkills: [1, 1], crit: [5, 5], mf: [30, 50], life: [30, 30] }, flavor: '죽은 자는 모든 것을 본다.' },
  { id: 'ariatFury', name: '아리앗의 분노', base: 'berserkeraxe', lvl: 18,
    stats: { edmg: [150, 190], ias: [20, 20], crit: [6, 6], allSkills: [1, 1] }, flavor: '성산의 분노가 날에 깃들었다.' },
  { id: 'immortalPlate', name: '불멸의 판금', base: 'gothicplate', lvl: 20,
    stats: { edef: [180, 220], life: [80, 100], thorns: [30, 30], lifeRegen: [8, 8] }, flavor: '착용자는 죽음을 잊는다.' },
  { id: 'kingCrown', name: '야만왕의 왕관', base: 'warlordhelm', lvl: 21,
    stats: { edef: [150, 150], allSkills: [2, 2], life: [60, 60], furyRegen: [3, 3] }, flavor: '모든 부족이 이 왕관 앞에 무릎 꿇었다.' },
  { id: 'worldbreaker', name: '세계 파괴자', base: 'ancientaxe', lvl: 24,
    stats: { edmg: [200, 260], critDmg: [50, 70], procFireNova: [10, 10], life: [40, 40] }, flavor: '대지가 이 도끼를 두려워한다.' },
];

// ── 몬스터 ──
const MONSTERS = {
  zombie:   { name: '좀비', sprite: 'zombie', h: 90, life: 16, dmg: [3, 6], speed: 55, r: 15, atkRange: 40, atkCD: 1.5, windup: 0.45, xp: 9, minFloor: 1, weight: 3 },
  skeleton: { name: '해골 창병', sprite: 'skeleton', h: 88, life: 12, dmg: [2, 5], speed: 95, r: 14, atkRange: 46, atkCD: 1.1, windup: 0.35, xp: 8, minFloor: 1, weight: 3 },
  archer:   { name: '해골 석궁병', sprite: 'skeleton_archer', h: 88, life: 10, dmg: [2, 4], speed: 80, r: 14, atkCD: 1.9, windup: 0.5, xp: 9, minFloor: 1, weight: 2,
              ranged: { range: 340, proj: 'arrow', speed: 430, keep: 170 } },
  fallen:   { name: '고블린', sprite: 'goblin', h: 52, life: 7, dmg: [1, 4], speed: 125, r: 11, atkRange: 34, atkCD: 0.9, windup: 0.25, xp: 5, minFloor: 1, weight: 3, pack: [5, 8] },
  shaman:   { name: '해골 마법사', sprite: 'skeleton_mage', h: 92, life: 14, dmg: [3, 6], speed: 70, r: 13, atkCD: 2.4, windup: 0.55, xp: 14, minFloor: 2, weight: 0,
              ranged: { range: 320, proj: 'fireball', speed: 300, keep: 200 } },
  wraith:   { name: '개미귀신', sprite: 'antlion', h: 50, life: 18, dmg: [4, 7], speed: 135, r: 17, atkRange: 42, atkCD: 1.0, windup: 0.3, xp: 14, minFloor: 4, weight: 2, lifeSteal: 0.5 },
  brute:    { name: '미노타우로스', sprite: 'minotaur', h: 130, life: 55, dmg: [8, 14], speed: 72, r: 22, atkRange: 52, atkCD: 1.8, windup: 0.6, xp: 30, minFloor: 6, weight: 1.5 },
};

const ELITE_MODS = {
  fast:   { name: '빠름' },
  strong: { name: '강함' },
  tough:  { name: '돌가죽' },
  fire:   { name: '화염 강화' },
  cold:   { name: '냉기 강화' },
  vamp:   { name: '흡혈' },
};

const UNIQUE_NAME_A = ['썩은', '피투성이', '검은', '광기의', '저주받은', '굶주린', '뒤틀린', '불타는', '잿빛', '울부짖는'];
const UNIQUE_NAME_B = ['그르막', '바쉬토', '크라즈', '무드락', '고렉', '스카르', '토르그', '라즈쿨', '드라고', '카스무'];

const BOSSES = [
  { name: '도살자 모르그', type: 'brute', sprite: 'minotaur', scale: 1.35, pal: { skin: '#7d1d14', shade: '#4a0f0a', horn: '#d9cfb8' } },
  { name: '해골 군주 바르곤', type: 'skeleton', sprite: 'skeleton', scale: 1.6, pal: { bone: '#c9c3e0', boneShade: '#7d7898', eye: '#8af' } },
  { name: '역병의 어미', type: 'zombie', sprite: 'zombie', scale: 1.6, pal: { skin: '#6b8a3a', shade: '#3e5a1e', rag: '#2e2a14' } },
  { name: '심연의 비룡 아즈라크', type: 'brute', sprite: 'wyvern_fire', scale: 1.4, pal: { skin: '#3d1650', shade: '#200a2c', horn: '#ff8c3a' } },
];

// ── 층별 테마 ──
const THEMES = [
  { name: '어둠의 묘지', tiles: 'dungeon', tint: null, floor: ['#3b3a42', '#36353d', '#302f37'], grout: '#1b1a20', top: '#55535e', left: '#2a2930', right: '#3a3942', brick: '#1d1c22', moss: null },
  { name: '망자의 동굴', tiles: 'cave', tint: null, floor: ['#4a3c2e', '#43362a', '#3c3125'], grout: '#1f1912', top: '#5f4e3b', left: '#30261b', right: '#41352a', brick: '#221a12', moss: null },
  { name: '버려진 성채', tiles: 'dungeon', tint: '#9fb39a', floor: ['#323b35', '#2d3630', '#28302b'], grout: '#151a17', top: '#4b5650', left: '#262d29', right: '#343d38', brick: '#161b18', moss: '#3d5a2a' },
  { name: '불타는 심연', tiles: 'cave', tint: '#ff8f6e', floor: ['#3b2522', '#341f1c', '#2d1a17'], grout: '#120807', top: '#4f2f2a', left: '#26130f', right: '#381c17', brick: '#140806', lava: true },
  { name: '혼돈의 성역', tiles: 'dungeon', tint: '#b9a0e0', floor: ['#2f2639', '#2a2133', '#231b2c'], grout: '#100b15', top: '#463a55', left: '#1f1828', right: '#2d243a', brick: '#120d18', lava: true },
];
function themeForFloor(f) { return THEMES[Math.min(THEMES.length - 1, Math.floor((f - 1) / 3))]; }
function monsterLevelForFloor(f) { return 1 + Math.round((f - 1) * 1.5); }
function isBossFloor(f) { return f % 5 === 0; }
