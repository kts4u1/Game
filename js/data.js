'use strict';
// ───────── 게임 데이터: 스킬, 아이템, 몬스터, 테마 ─────────

const RARITY = [
  { name: '일반', color: '#e8e2d6' },
  { name: '마법', color: '#8a91ff' },
  { name: '레어', color: '#f4e06d' },
  { name: '유니크', color: '#d6a95c' },
  { name: '세트', color: '#5fd068' },
];

const SLOT_NAMES = {
  weapon: '무기', shield: '방패', helm: '투구', armor: '갑옷', gloves: '장갑',
  boots: '장화', belt: '허리띠', ring: '반지', amulet: '목걸이',
};
const STASH_SIZE = 48;
const MAX_POTIONS = 12;
// 약초상이 파는 비약 (지속 시간: 초)
const ELIXIRS = {
  power: { name: '힘의 비약', desc: '10분 동안 모든 피해 +25%', dur: 600, price: L => 120 + L * 25, ii: 82 },
  iron: { name: '무쇠의 비약', desc: '10분 동안 방어력 +30%, 원소 저항 +15%', dur: 600, price: L => 120 + L * 25, ii: 83 },
  luck: { name: '행운의 비약', desc: '10분 동안 마법 아이템 발견 +50%, 골드 획득 +50%', dur: 600, price: L => 150 + L * 30, ii: 81 },
};
const EQUIP_KEYS = ['weapon', 'shield', 'helm', 'amulet', 'armor', 'ring1', 'ring2', 'gloves', 'belt', 'boots'];
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
// ii: 아이콘 번호(icons.webp), layer: 주인공 그림 레이어, two: 양손 무기(방패 불가), block: 방패 막기 확률(%)
const ITEM_BASES = {
  weapon: [
    { id: 'dagger', name: '단검', lvl: 1, dmg: [2, 5], aps: 1.5, icon: 'sword', layer: 'dagger', ii: 96 },
    { id: 'handaxe', name: '손도끼', lvl: 1, dmg: [3, 6], aps: 1.25, icon: 'axe', layer: 'hand_axe', ii: 117 },
    { id: 'longsword', name: '장검', lvl: 1, dmg: [2, 8], aps: 1.2, icon: 'sword', layer: 'longsword', ii: 100 },
    { id: 'club', name: '곤봉', lvl: 2, dmg: [4, 9], aps: 1.1, icon: 'mace', layer: 'club', ii: 109 },
    { id: 'shortsword', name: '소검', lvl: 3, dmg: [4, 8], aps: 1.4, icon: 'sword', layer: 'shortsword', ii: 97 },
    { id: 'maul', name: '대형 망치', lvl: 4, dmg: [8, 16], aps: 0.95, icon: 'hammer', layer: 'maul', ii: 103, two: true },
    { id: 'waraxe', name: '전투 도끼', lvl: 5, dmg: [7, 14], aps: 1.2, icon: 'axe', layer: 'hand_axe', ii: 118 },
    { id: 'broadsword', name: '넓은 검', lvl: 7, dmg: [8, 17], aps: 1.2, icon: 'sword', layer: 'longsword', ii: 98 },
    { id: 'mace', name: '철퇴', lvl: 8, dmg: [10, 18], aps: 1.15, icon: 'mace', layer: 'mace', ii: 111 },
    { id: 'morningstar', name: '모닝스타', lvl: 9, dmg: [11, 20], aps: 1.1, icon: 'mace', layer: 'reinforced_club', ii: 110 },
    { id: 'infantryaxe', name: '보병 도끼', lvl: 10, dmg: [15, 30], aps: 1.05, icon: 'greataxe', layer: 'infantry_axe', ii: 119, two: true },
    { id: 'doubleaxe', name: '쌍날 도끼', lvl: 11, dmg: [16, 33], aps: 1.0, icon: 'greataxe', layer: 'battle_axe', ii: 119, two: true },
    { id: 'bastard', name: '대검', lvl: 13, dmg: [18, 37], aps: 1.05, icon: 'greatsword', layer: 'greatsword', ii: 99, two: true },
    { id: 'warhammer', name: '전쟁 망치', lvl: 15, dmg: [24, 42], aps: 0.95, icon: 'hammer', layer: 'war_hammer', ii: 102, two: true },
    { id: 'knightsword', name: '기사의 검', lvl: 16, dmg: [17, 32], aps: 1.25, icon: 'sword', layer: 'longsword', ii: 98 },
    { id: 'berserkeraxe', name: '광전사 도끼', lvl: 18, dmg: [22, 40], aps: 1.15, icon: 'axe', layer: 'hand_axe', ii: 118 },
    { id: 'zweihander', name: '츠바이헨더', lvl: 19, dmg: [30, 55], aps: 1.0, icon: 'greatsword', layer: 'zweihander', ii: 99, two: true },
    { id: 'executioner', name: '처형자의 검', lvl: 21, dmg: [33, 60], aps: 1.05, icon: 'greatsword', layer: 'greatsword', ii: 99, two: true },
    { id: 'templarmace', name: '성기사의 철퇴', lvl: 22, dmg: [26, 44], aps: 1.15, icon: 'mace', layer: 'mace', ii: 111 },
    { id: 'ancientaxe', name: '고대 도끼', lvl: 24, dmg: [40, 74], aps: 1.0, icon: 'greataxe', layer: 'battle_axe', ii: 119, two: true },
    { id: 'runeblade', name: '룬 검', lvl: 26, dmg: [30, 52], aps: 1.25, icon: 'sword', layer: 'longsword', ii: 100 },
    { id: 'titanmaul', name: '거인의 망치', lvl: 28, dmg: [50, 90], aps: 0.9, icon: 'hammer', layer: 'maul', ii: 103, two: true },
    { id: 'demonaxe', name: '마귀 도끼', lvl: 31, dmg: [40, 66], aps: 1.2, icon: 'axe', layer: 'hand_axe', ii: 117 },
    { id: 'doomblade', name: '파멸의 대검', lvl: 34, dmg: [62, 104], aps: 1.0, icon: 'greatsword', layer: 'zweihander', ii: 99, two: true },
  ],
  shield: [
    { id: 'buckler', name: '버클러', lvl: 1, def: [3, 5], block: 12, icon: 'shield', layer: 'buckler', ii: 120 },
    { id: 'roundshield', name: '둥근 방패', lvl: 5, def: [8, 12], block: 15, icon: 'shield', layer: 'shield', ii: 121 },
    { id: 'ironbuckler', name: '철 버클러', lvl: 9, def: [13, 18], block: 18, icon: 'shield', layer: 'iron_buckler', ii: 121 },
    { id: 'kiteshield', name: '카이트 방패', lvl: 13, def: [20, 28], block: 20, icon: 'shield', layer: 'kite_shield', ii: 122 },
    { id: 'spikedshield', name: '가시 방패', lvl: 17, def: [27, 36], block: 20, icon: 'shield', layer: 'iron_buckler', ii: 123 },
    { id: 'towershield', name: '탑 방패', lvl: 22, def: [38, 50], block: 24, icon: 'shield', layer: 'kite_shield', ii: 122 },
    { id: 'ancientshield', name: '고대의 방패', lvl: 28, def: [52, 68], block: 26, icon: 'shield', layer: 'shield', ii: 121 },
    { id: 'dragonshield', name: '용의 방패', lvl: 33, def: [66, 84], block: 28, icon: 'shield', layer: 'kite_shield', ii: 122 },
  ],
  helm: [
    { id: 'cap', name: '가죽 모자', lvl: 1, def: [3, 5], icon: 'cap', look: 0, ii: 144 },
    { id: 'hood', name: '사냥꾼 두건', lvl: 2, def: [4, 6], icon: 'cap', look: 0, ii: 136 },
    { id: 'skullcap', name: '해골 투구', lvl: 4, def: [7, 10], icon: 'helm', look: 1, ii: 152 },
    { id: 'hornhelm', name: '뿔 투구', lvl: 8, def: [12, 16], icon: 'hornhelm', look: 2, ii: 160 },
    { id: 'warhelm', name: '전투 투구', lvl: 12, def: [18, 24], icon: 'helm', look: 1, ii: 152 },
    { id: 'greathelm', name: '대투구', lvl: 16, def: [26, 34], icon: 'greathelm', look: 3, ii: 160 },
    { id: 'ironmask', name: '철가면', lvl: 18, def: [30, 40], icon: 'greathelm', look: 3, ii: 152 },
    { id: 'warlordhelm', name: '전쟁군주의 투구', lvl: 21, def: [36, 46], icon: 'hornhelm', look: 2, ii: 160 },
    { id: 'ancienthorn', name: '고대의 뿔관', lvl: 26, def: [48, 60], icon: 'hornhelm', look: 2, ii: 160 },
    { id: 'demonhelm', name: '악마의 투구', lvl: 30, def: [62, 78], icon: 'greathelm', look: 3, ii: 160 },
  ],
  armor: [
    { id: 'quilted', name: '누비 갑옷', lvl: 1, def: [8, 11], icon: 'robe', look: 0, ii: 137 },
    { id: 'leatherarmor', name: '가죽 갑옷', lvl: 3, def: [12, 16], icon: 'robe', look: 0, ii: 145 },
    { id: 'ringmail', name: '고리 갑옷', lvl: 5, def: [16, 22], icon: 'mail', look: 1, ii: 153 },
    { id: 'scalemail', name: '미늘 갑옷', lvl: 7, def: [20, 28], icon: 'mail', look: 1, ii: 153 },
    { id: 'chainmail', name: '사슬 갑옷', lvl: 11, def: [30, 40], icon: 'mail', look: 1, ii: 153 },
    { id: 'breastplate', name: '흉갑', lvl: 13, def: [36, 46], icon: 'plate', look: 2, ii: 161 },
    { id: 'platemail', name: '판금 갑옷', lvl: 15, def: [42, 55], icon: 'plate', look: 2, ii: 161 },
    { id: 'gothicplate', name: '고딕 판금', lvl: 20, def: [58, 72], icon: 'plate', look: 2, ii: 161 },
    { id: 'ancientarmor', name: '고대 갑옷', lvl: 25, def: [75, 95], icon: 'plate', look: 3, ii: 161 },
    { id: 'dragonscale', name: '용비늘 갑옷', lvl: 30, def: [95, 118], icon: 'plate', look: 3, ii: 161 },
  ],
  gloves: [
    { id: 'leathergloves', name: '가죽 장갑', lvl: 1, def: [2, 3], icon: 'gloves', look: 0, ii: 146 },
    { id: 'bracers', name: '가죽 팔보호대', lvl: 3, def: [3, 4], icon: 'gloves', look: 0, ii: 138 },
    { id: 'chaingloves', name: '사슬 장갑', lvl: 6, def: [5, 7], icon: 'gloves', look: 1, ii: 154 },
    { id: 'heavygloves', name: '무거운 장갑', lvl: 9, def: [7, 9], icon: 'gloves', look: 1, ii: 154 },
    { id: 'steelgauntlets', name: '강철 건틀릿', lvl: 12, def: [9, 12], icon: 'gauntlets', look: 2, ii: 162 },
    { id: 'wargauntlets', name: '전쟁 건틀릿', lvl: 19, def: [14, 18], icon: 'gauntlets', look: 2, ii: 162 },
    { id: 'demongauntlets', name: '악마 건틀릿', lvl: 26, def: [19, 24], icon: 'gauntlets', look: 2, ii: 162 },
  ],
  boots: [
    { id: 'leatherboots', name: '가죽 장화', lvl: 1, def: [2, 3], icon: 'boots', look: 0, ii: 148 },
    { id: 'chainboots', name: '사슬 장화', lvl: 6, def: [5, 7], icon: 'boots', look: 1, ii: 156 },
    { id: 'heavyboots', name: '무거운 장화', lvl: 9, def: [7, 9], icon: 'boots', look: 0, ii: 176 },
    { id: 'plateboots', name: '판금 장화', lvl: 12, def: [9, 12], icon: 'boots', look: 2, ii: 164 },
    { id: 'warboots', name: '전쟁 장화', lvl: 19, def: [14, 18], icon: 'boots', look: 2, ii: 164 },
    { id: 'greaves', name: '강철 각반', lvl: 26, def: [19, 24], icon: 'boots', look: 2, ii: 164 },
  ],
  belt: [
    { id: 'sash', name: '끈 허리띠', lvl: 1, def: [2, 3], icon: 'belt', look: 0, ii: 208 },
    { id: 'leatherbelt', name: '가죽 허리띠', lvl: 5, def: [4, 6], icon: 'belt', look: 0, ii: 208 },
    { id: 'chainbelt', name: '사슬 허리띠', lvl: 11, def: [8, 10], icon: 'belt', look: 1, ii: 208 },
    { id: 'warbelt', name: '전쟁 허리띠', lvl: 18, def: [12, 15], icon: 'belt', look: 2, ii: 208 },
    { id: 'platebelt', name: '판금 허리띠', lvl: 24, def: [16, 20], icon: 'belt', look: 2, ii: 208 },
    { id: 'demonbelt', name: '악마 허리띠', lvl: 31, def: [20, 25], icon: 'belt', look: 2, ii: 208 },
  ],
  ring: [{ id: 'ring', name: '반지', lvl: 1, icon: 'ring' }],
  amulet: [{ id: 'amulet', name: '목걸이', lvl: 1, icon: 'amulet' }],
};

const BASE_INDEX = {};
for (const slot in ITEM_BASES) for (const b of ITEM_BASES[slot]) BASE_INDEX[b.id] = Object.assign({ slot }, b);
function isTwoHanded(item) {
  if (!item) return false;
  const b = BASE_INDEX[item.baseId];
  return b ? !!b.two : ['greataxe', 'greatsword', 'hammer'].includes(item.icon);
}

const SLOT_WEIGHTS = { weapon: 20, shield: 8, helm: 11, armor: 11, gloves: 9, boots: 9, belt: 8, ring: 8, amulet: 6 };

// ── 접두사 / 접미사 ──
// tiers: [등장 레벨, 최소, 최대, 이름]
const ARMOR_SLOTS = ['helm', 'armor', 'gloves', 'boots', 'belt', 'shield'];
const AFFIXES = [
  { id: 'edmg', kind: 'pre', stat: 'edmg', slots: ['weapon'], local: true,
    tiers: [[1, 20, 40, '날카로운'], [6, 41, 65, '잔혹한'], [12, 66, 95, '흉포한'], [18, 96, 130, '무자비한'], [26, 131, 170, '학살하는'], [33, 171, 210, '종말의']] },
  { id: 'dmgFlat', kind: 'pre', stat: 'dmgFlat', slots: ['weapon', 'ring', 'amulet', 'gloves'],
    tiers: [[1, 1, 3, '가시 돋친'], [6, 4, 7, '찢어발기는'], [12, 8, 12, '참혹한'], [18, 13, 18, '도륙하는'], [26, 19, 26, '파쇄하는']] },
  { id: 'edef', kind: 'pre', stat: 'edef', slots: ARMOR_SLOTS, local: true,
    tiers: [[1, 20, 40, '튼튼한'], [6, 41, 65, '강화된'], [12, 66, 95, '견고한'], [18, 96, 130, '불굴의'], [27, 131, 170, '신화적인']] },
  { id: 'armor', kind: 'pre', stat: 'armor', slots: ARMOR_SLOTS.concat(['amulet']),
    tiers: [[1, 4, 10, '두꺼운'], [6, 11, 22, '단련된'], [12, 23, 40, '철벽의'], [18, 41, 65, '요새 같은'], [27, 66, 95, '산맥 같은']] },
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
  { id: 'fireDmg', kind: 'pre', stat: 'fireDmg', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 0.8,
    tiers: [[2, 2, 5, '불타는'], [8, 6, 12, '작열하는'], [15, 13, 22, '지옥불의'], [23, 23, 35, '태양의']] },
  { id: 'coldDmg', kind: 'pre', stat: 'coldDmg', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 0.8,
    tiers: [[2, 2, 4, '차가운'], [8, 5, 10, '얼어붙은'], [15, 11, 18, '혹한의'], [23, 19, 30, '빙하의']] },
  { id: 'lightDmg', kind: 'pre', stat: 'lightDmg', slots: ['weapon', 'gloves', 'ring', 'amulet'], weight: 0.8,
    tiers: [[2, 6, 10, '번뜩이는'], [8, 11, 20, '전격의'], [15, 21, 34, '뇌전의'], [23, 35, 52, '폭풍의']] },
  { id: 'furyCost', kind: 'pre', stat: 'furyCost', slots: ['helm', 'amulet', 'belt'], weight: 0.6,
    tiers: [[5, 5, 8, '절제된'], [15, 9, 14, '냉철한']] },
  { id: 'blockChance', kind: 'pre', stat: 'blockChance', slots: ['shield'],
    tiers: [[1, 3, 5, '막아서는'], [10, 6, 8, '굳건한'], [20, 9, 12, '철옹성의']] },
  { id: 'life', kind: 'suf', stat: 'life', slots: ARMOR_SLOTS.concat(['ring', 'amulet']),
    tiers: [[1, 5, 10, '여우의'], [5, 11, 20, '늑대의'], [10, 21, 35, '곰의'], [16, 36, 55, '고래의'], [22, 56, 80, '거인의'], [30, 81, 110, '타이탄의']] },
  { id: 'ias', kind: 'suf', stat: 'ias', slots: ['weapon', 'gloves', 'ring'],
    tiers: [[1, 5, 10, '민첩함의'], [8, 11, 15, '신속함의'], [15, 16, 22, '질풍의']] },
  { id: 'lifeRegen', kind: 'suf', stat: 'lifeRegen', slots: ['helm', 'armor', 'belt', 'ring', 'amulet', 'shield'],
    tiers: [[1, 1, 2, '재생의'], [8, 3, 4, '회복의'], [16, 5, 8, '불사의']] },
  { id: 'moveSpeed', kind: 'suf', stat: 'moveSpeed', slots: ['boots'],
    tiers: [[1, 5, 10, '여행자의'], [6, 11, 20, '사냥꾼의'], [14, 21, 30, '질주의']] },
  { id: 'dmgPct', kind: 'suf', stat: 'dmgPct', slots: ['ring', 'amulet', 'gloves'],
    tiers: [[1, 5, 10, '힘의'], [8, 11, 18, '용맹의'], [16, 19, 28, '전쟁의']] },
  { id: 'thorns', kind: 'suf', stat: 'thorns', slots: ['armor', 'belt', 'helm', 'shield'],
    tiers: [[1, 3, 6, '가시의'], [8, 7, 14, '쐐기의'], [15, 15, 25, '고통의']] },
  { id: 'gf', kind: 'suf', stat: 'gf', slots: ['helm', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'],
    tiers: [[1, 20, 40, '탐욕의'], [10, 41, 80, '왕의']] },
  { id: 'xp', kind: 'suf', stat: 'xp', slots: ['helm', 'ring', 'amulet'],
    tiers: [[3, 3, 5, '지혜의'], [12, 6, 10, '현자의']] },
  { id: 'critDmg', kind: 'suf', stat: 'critDmg', slots: ['weapon', 'ring', 'amulet', 'gloves'],
    tiers: [[1, 10, 20, '도살의'], [9, 21, 35, '처형의'], [17, 36, 50, '파멸의']] },
  { id: 'furyRegen', kind: 'suf', stat: 'furyRegen', slots: ['helm', 'ring', 'amulet', 'belt'],
    tiers: [[1, 1, 1, '열기의'], [8, 2, 2, '격분의'], [16, 3, 3, '광기의']] },
  { id: 'dmgUndead', kind: 'suf', stat: 'dmgUndead', slots: ['weapon', 'helm', 'shield'],
    tiers: [[1, 20, 40, '퇴마의'], [10, 41, 70, '성스러움의'], [20, 71, 100, '신성의']] },
  { id: 'dmgReduce', kind: 'suf', stat: 'dmgReduce', slots: ['armor', 'shield', 'helm', 'belt'],
    tiers: [[1, 1, 2, '수호의'], [8, 3, 5, '보호의'], [16, 6, 9, '성채의'], [24, 10, 14, '난공불락의']] },
  { id: 'killLife', kind: 'suf', stat: 'killLife', slots: ['weapon', 'gloves', 'ring', 'amulet'],
    tiers: [[1, 2, 4, '사냥의'], [8, 5, 9, '포식의'], [16, 10, 16, '탐식의']] },
  { id: 'killFury', kind: 'suf', stat: 'killFury', slots: ['weapon', 'helm', 'belt', 'shield'],
    tiers: [[1, 2, 3, '투지의'], [10, 4, 6, '투쟁의']] },
  { id: 'cdr', kind: 'suf', stat: 'cdr', slots: ['helm', 'amulet', 'ring'], weight: 0.6,
    tiers: [[6, 4, 6, '시간의'], [16, 7, 10, '영원의']] },
  { id: 'potionBoost', kind: 'suf', stat: 'potionBoost', slots: ['belt', 'amulet'],
    tiers: [[1, 15, 25, '약초의'], [10, 26, 40, '연금술의']] },
  { id: 'resAll', kind: 'suf', stat: 'resAll', slots: ['helm', 'armor', 'shield', 'boots', 'belt', 'ring', 'amulet'],
    tiers: [[1, 5, 10, '저항의'], [8, 11, 20, '원소의'], [16, 21, 30, '프리즘의']] },
  // 스킬 하나의 레벨을 올림 (스킬은 굴릴 때 정함)
  { id: 'skill', kind: 'suf', stat: 'skill', slots: ['helm', 'amulet', 'weapon'], weight: 0.5,
    tiers: [[4, 1, 1, ''], [16, 1, 2, '']] },
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
  procFrostNova: v => `적중 시 ${v}% 확률로 서리 폭발`,
  fireDmg: v => `화염 피해 +${v}`,
  coldDmg: v => `냉기 피해 +${v} (적 둔화)`,
  lightDmg: v => `번개 피해 1-${v}`,
  furyCost: v => `스킬 분노 소모 -${v}%`,
  blockChance: v => `막기 확률 +${v}%`,
  dmgUndead: v => `언데드에게 주는 피해 +${v}%`,
  dmgReduce: v => `받는 피해 -${v}`,
  killLife: v => `처치할 때마다 생명력 +${v}`,
  killFury: v => `처치할 때마다 분노 +${v}`,
  cdr: v => `재사용 대기시간 -${v}%`,
  potionBoost: v => `물약 회복량 +${v}%`,
  resAll: v => `모든 원소 저항 +${v}%`,
};
function affixText(a) {
  if (a.stat === 'skill') return `${SKILLS[a.skill] ? SKILLS[a.skill].name : '?'} 스킬 레벨 +${a.value}`;
  const f = STAT_TEXT[a.stat];
  return f ? f(a.value) : '';
}

const RARE_PREFIX = ['파멸', '혈흔', '서리', '망자', '폭풍', '어둠', '해골', '분노', '독사', '강철', '재앙', '굶주림', '천둥', '심연', '유령', '잿빛', '핏빛', '악몽', '까마귀', '늑대'];
const RARE_SUFFIX = {
  weapon: ['송곳니', '절단자', '도살자', '파괴자', '쐐기', '이빨', '비명'],
  shield: ['벽', '방벽', '수호자', '성문', '등껍질'],
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
  // ── 새 유니크 ──
  { id: 'oakGuard', name: '떡갈나무 수호자', base: 'buckler', lvl: 3,
    stats: { edef: [80, 100], blockChance: [8, 8], life: [12, 16], lifeRegen: [2, 2] }, flavor: '오래된 숲의 정령이 깃든 방패.' },
  { id: 'frostFang', name: '서리 송곳니', base: 'dagger', lvl: 4,
    stats: { coldDmg: [4, 6], ias: [20, 20], crit: [4, 4] }, flavor: '칼날에 서린 냉기가 숨결을 얼린다.' },
  { id: 'graveRobber', name: '도굴꾼의 손', base: 'bracers', lvl: 5,
    stats: { edef: [50, 70], mf: [25, 35], gf: [60, 80], killLife: [3, 4] }, flavor: '죽은 자의 금은 가장 반짝인다.' },
  { id: 'skullsplitter', name: '두개골 쪼개기', base: 'maul', lvl: 6,
    stats: { edmg: [90, 120], dmgUndead: [50, 50], critDmg: [30, 30] }, flavor: '해골은 한 번에 부서진다.' },
  { id: 'shroud', name: '망자의 수의', base: 'ringmail', lvl: 7,
    stats: { edef: [80, 100], dmgUndead: [30, 30], resAll: [20, 20], life: [25, 30] }, flavor: '무덤에서 꺼낸 천은 아직 차갑다.' },
  { id: 'emberHeart', name: '불씨의 심장', base: 'amulet', lvl: 9,
    stats: { fireDmg: [6, 9], procFireNova: [6, 6], resAll: [15, 15] }, flavor: '꺼지지 않는 불씨가 뛰고 있다.' },
  { id: 'thunderStep', name: '번개 발걸음', base: 'heavyboots', lvl: 11,
    stats: { edef: [60, 80], moveSpeed: [25, 25], lightDmg: [14, 18], ias: [10, 10] }, flavor: '발이 땅에 닿기 전에 천둥이 친다.' },
  { id: 'wardenWall', name: '파수꾼의 벽', base: 'kiteshield', lvl: 14,
    stats: { edef: [120, 150], blockChance: [10, 10], dmgReduce: [5, 5], life: [40, 50] }, flavor: '이 벽 뒤에서는 아무도 쓰러지지 않았다.' },
  { id: 'timeLoop', name: '시간의 고리', base: 'ring', lvl: 15,
    stats: { cdr: [12, 15], furyCost: [15, 15], furyRegen: [2, 2] }, flavor: '같은 순간이 영원히 되풀이된다.' },
  { id: 'whirlCrown', name: '회오리의 왕관', base: 'ironmask', lvl: 18,
    stats: { edef: [100, 120], 'sk:whirlwind': [2, 3], ias: [10, 10], life: [40, 40] }, flavor: '세상이 빙글빙글 돈다.' },
  { id: 'stormcaller', name: '폭풍 부름', base: 'zweihander', lvl: 19,
    stats: { edmg: [140, 170], lightDmg: [30, 40], procLightning: [15, 15] }, flavor: '칼을 들면 구름이 모인다.' },
  { id: 'warchief', name: '전쟁 대장의 목걸이', base: 'amulet', lvl: 20,
    stats: { 'sk:warcry': [2, 3], cdr: [10, 10], life: [40, 50], resAll: [10, 10] }, flavor: '한 번의 함성에 천 명이 일어섰다.' },
  { id: 'glacier', name: '빙하의 심장', base: 'towershield', lvl: 23,
    stats: { edef: [140, 170], coldDmg: [10, 14], procFrostNova: [10, 10], blockChance: [8, 8] }, flavor: '겨울은 결코 끝나지 않는다.' },
  { id: 'berserkerBelt', name: '광전사의 허리띠', base: 'platebelt', lvl: 24,
    stats: { edef: [80, 100], killFury: [5, 5], furyMax: [25, 25], dmgPct: [20, 25], life: [50, 60] }, flavor: '피 냄새를 맡으면 조여든다.' },
  { id: 'leapBoots', name: '산양의 도약', base: 'greaves', lvl: 26,
    stats: { edef: [120, 140], 'sk:leap': [2, 3], moveSpeed: [25, 25], resAll: [15, 15] }, flavor: '절벽은 길일 뿐이다.' },
  { id: 'hellforge', name: '지옥 용광로', base: 'titanmaul', lvl: 28,
    stats: { edmg: [180, 220], fireDmg: [25, 35], procFireNova: [12, 12] }, flavor: '지옥의 대장장이가 마지막으로 두드린 쇠.' },
  { id: 'boneKing', name: '해골왕의 관', base: 'demonhelm', lvl: 30,
    stats: { edef: [150, 180], allSkills: [2, 2], dmgUndead: [60, 60], life: [70, 90] }, flavor: '죽은 왕은 아직 자리를 비우지 않았다.' },
  { id: 'dragonhide', name: '용의 숨결', base: 'dragonscale', lvl: 31,
    stats: { edef: [160, 200], resAll: [30, 30], thorns: [40, 40], life: [80, 100] }, flavor: '용은 죽었지만 비늘은 아직 뜨겁다.' },
];

// ── 세트 아이템: 같은 세트를 여러 개 입으면 추가 능력이 생긴다 ──
const SETS = {
  chieftain: { name: '부족장의 유산', bonus: { 2: { life: 30 }, 3: { dmgPct: 15, furyRegen: 2 }, 4: { allSkills: 1, lifeSteal: 3 } } },
  frostwolf: { name: '서리 늑대의 맹세', bonus: { 2: { coldDmg: 8 }, 3: { moveSpeed: 10, ias: 10 }, 4: { resAll: 20, crit: 5 } } },
  ancientKing: { name: '고대 왕의 갑주', bonus: { 2: { armor: 60 }, 3: { life: 80 }, 4: { dmgPct: 30, dmgReduce: 6 }, 5: { allSkills: 2, lifeSteal: 4 } } },
};
const SET_ITEMS = [
  { id: 'chiefAxe', set: 'chieftain', name: '부족장의 도끼', base: 'waraxe', lvl: 7, stats: { edmg: [60, 60], dmgFlat: [3, 3], killFury: [3, 3] } },
  { id: 'chiefHorn', set: 'chieftain', name: '부족장의 뿔', base: 'hornhelm', lvl: 8, stats: { edef: [50, 50], life: [20, 20], furyMax: [10, 10] } },
  { id: 'chiefMail', set: 'chieftain', name: '부족장의 미늘', base: 'scalemail', lvl: 8, stats: { edef: [60, 60], thorns: [8, 8], life: [15, 15] } },
  { id: 'chiefBelt', set: 'chieftain', name: '부족장의 허리끈', base: 'leatherbelt', lvl: 6, stats: { edef: [40, 40], gf: [40, 40], lifeRegen: [3, 3] } },
  { id: 'wolfClaw', set: 'frostwolf', name: '서리 늑대의 발톱', base: 'heavygloves', lvl: 12, stats: { edef: [40, 40], coldDmg: [5, 5], ias: [10, 10] } },
  { id: 'wolfTrack', set: 'frostwolf', name: '서리 늑대의 발자국', base: 'heavyboots', lvl: 12, stats: { edef: [40, 40], moveSpeed: [15, 15], resAll: [10, 10] } },
  { id: 'wolfEye', set: 'frostwolf', name: '서리 늑대의 눈', base: 'ring', lvl: 13, stats: { coldDmg: [4, 4], crit: [3, 3], life: [15, 15] } },
  { id: 'wolfTooth', set: 'frostwolf', name: '서리 늑대의 이빨', base: 'amulet', lvl: 14, stats: { coldDmg: [6, 6], dmgPct: [10, 10], resAll: [10, 10] } },
  { id: 'kingAxe', set: 'ancientKing', name: '고대 왕의 도끼', base: 'ancientaxe', lvl: 24, stats: { edmg: [120, 120], critDmg: [30, 30] } },
  { id: 'kingCrown2', set: 'ancientKing', name: '고대 왕의 왕관', base: 'greathelm', lvl: 22, stats: { edef: [100, 100], life: [40, 40], allSkills: [1, 1] } },
  { id: 'kingPlate', set: 'ancientKing', name: '고대 왕의 흉갑', base: 'gothicplate', lvl: 23, stats: { edef: [120, 120], dmgReduce: [5, 5], life: [50, 50] } },
  { id: 'kingHands', set: 'ancientKing', name: '고대 왕의 손', base: 'wargauntlets', lvl: 22, stats: { edef: [80, 80], ias: [15, 15], lifeSteal: [3, 3] } },
  { id: 'kingMarch', set: 'ancientKing', name: '고대 왕의 행군', base: 'warboots', lvl: 22, stats: { edef: [80, 80], moveSpeed: [20, 20], resAll: [15, 15] } },
];

// ── 몬스터 ──
// abil: 특수 행동 (monsterai.js), undead: 언데드(퇴마 피해 대상), maxFloor: 이 층까지만 등장
// ranged.proj: arrow 화살 · fireball 화염구 · icicle 얼음창(둔화) · spit 독침(중독) · plasma 마력구
const MONSTERS = {
  zombie:   { name: '좀비', sprite: 'zombie', h: 90, life: 16, dmg: [3, 6], speed: 55, r: 15, atkRange: 40, atkCD: 1.5, windup: 0.45, xp: 9, minFloor: 1, maxFloor: 9, weight: 3, undead: true },
  skeleton: { name: '해골 창병', sprite: 'skeleton', h: 88, life: 12, dmg: [2, 5], speed: 95, r: 14, atkRange: 46, atkCD: 1.1, windup: 0.35, xp: 8, minFloor: 1, maxFloor: 24, weight: 3, undead: true },
  archer:   { name: '해골 석궁병', sprite: 'skeleton_archer', h: 88, life: 10, dmg: [2, 4], speed: 80, r: 14, atkCD: 1.9, windup: 0.5, xp: 9, minFloor: 1, maxFloor: 34, weight: 2, undead: true,
              ranged: { range: 340, proj: 'arrow', speed: 430, keep: 170 } },
  fallen:   { name: '고블린', sprite: 'goblin', h: 52, life: 7, dmg: [1, 4], speed: 125, r: 11, atkRange: 34, atkCD: 0.9, windup: 0.25, xp: 5, minFloor: 1, maxFloor: 9, weight: 3, pack: [5, 8], abil: ['flee'] },
  shaman:   { name: '해골 마법사', sprite: 'skeleton_mage', h: 92, life: 14, dmg: [3, 6], speed: 70, r: 13, atkCD: 2.4, windup: 0.55, xp: 14, minFloor: 2, weight: 0, undead: true,
              ranged: { range: 320, proj: 'fireball', speed: 300, keep: 200 }, abil: ['revive'] },
  swarm:    { name: '새끼 개미귀신', sprite: 'antlion_small', h: 34, life: 5, dmg: [1, 3], speed: 150, r: 10, atkRange: 30, atkCD: 0.8, windup: 0.2, xp: 3, minFloor: 2, maxFloor: 9, weight: 1.6, pack: [6, 9], abil: ['ambush'] },
  hobgoblin: { name: '홉고블린', sprite: 'hobgoblin', h: 64, life: 20, dmg: [3, 7], speed: 100, r: 13, atkRange: 38, atkCD: 1.1, windup: 0.35, xp: 12, minFloor: 3, maxFloor: 29, weight: 2.2, pack: [3, 4], abil: ['block'], escort: 'hobArcher' },
  hobArcher: { name: '홉고블린 궁수', sprite: 'hobgoblin_archer', h: 64, life: 14, dmg: [3, 6], speed: 95, r: 13, atkCD: 1.8, windup: 0.45, xp: 12, minFloor: 3, weight: 0.8,
              ranged: { range: 360, proj: 'arrow', speed: 460, keep: 190 }, abil: ['volley'] },
  wraith:   { name: '개미귀신', sprite: 'antlion', h: 50, life: 18, dmg: [4, 7], speed: 135, r: 17, atkRange: 42, atkCD: 1.0, windup: 0.3, xp: 14, minFloor: 4, weight: 2, lifeSteal: 0.5, abil: ['burrow'] },
  darkZombie: { name: '어둠의 망자', sprite: 'zombie_dark', h: 96, life: 28, dmg: [5, 9], speed: 62, r: 15, atkRange: 42, atkCD: 1.5, windup: 0.5, xp: 16, minFloor: 4, weight: 2, undead: true, poison: true, abil: ['ambush', 'poisonDeath'] },
  thief:    { name: '고블린 약탈자', sprite: 'goblin_elite', h: 70, life: 22, dmg: [3, 6], speed: 150, r: 13, atkRange: 36, atkCD: 0.9, windup: 0.22, xp: 22, minFloor: 5, weight: 0.9, pack: [2, 3], abil: ['steal', 'flee'] },
  brute:    { name: '미노타우로스', sprite: 'minotaur', h: 130, life: 55, dmg: [8, 14], speed: 72, r: 22, atkRange: 52, atkCD: 1.8, windup: 0.6, xp: 30, minFloor: 6, weight: 1.5, abil: ['charge'] },
  fireAnt:  { name: '불개미', sprite: 'fire_ant', h: 58, life: 22, dmg: [5, 9], speed: 115, r: 17, atkRange: 40, atkCD: 1.0, windup: 0.3, xp: 16, minFloor: 7, weight: 2, pack: [3, 5], abil: ['ambush', 'explode'], fireBurn: true },
  wyvern:   { name: '독 비룡', sprite: 'wyvern', h: 110, life: 50, dmg: [7, 12], speed: 105, r: 22, atkCD: 2.2, windup: 0.6, xp: 34, minFloor: 8, weight: 1.1, pack: [1, 2],
              ranged: { range: 330, proj: 'spit', speed: 360, keep: 150 }, abil: ['dive'] },
  iceAnt:   { name: '서리 개미', sprite: 'ice_ant', h: 58, life: 24, dmg: [4, 8], speed: 100, r: 17, atkCD: 2.0, windup: 0.5, xp: 18, minFloor: 9, weight: 1.6, pack: [3, 5],
              ranged: { range: 300, proj: 'icicle', speed: 420, keep: 160 } },
  armorAnt: { name: '갑각 개미귀신', sprite: 'antlion_armored', h: 80, life: 70, dmg: [9, 16], speed: 95, r: 24, atkRange: 50, atkCD: 1.5, windup: 0.55, xp: 40, minFloor: 10, weight: 1.2, pack: [1, 2], abil: ['burrow'], armorK: 0.75 },
  iceWyvern: { name: '서리 비룡', sprite: 'wyvern_water', h: 110, life: 60, dmg: [8, 14], speed: 105, r: 22, atkCD: 2.4, windup: 0.6, xp: 40, minFloor: 11, weight: 1, pack: [1, 2],
              ranged: { range: 330, proj: 'icicle', speed: 420, keep: 150, spread: 3 }, abil: ['dive'] },
  // ── 12층 이후 새 몬스터 (color: 그림에 곱하는 색, alpha: 투명도) ──
  cartGoblin: { name: '광차 고블린', sprite: 'goblin_minecart', h: 64, life: 30, dmg: [7, 12], speed: 135, r: 18, atkRange: 34, atkCD: 1.2, windup: 0.2, xp: 22, minFloor: 12, weight: 1, pack: [2, 3], abil: ['charge'], chargeCD: [2.5, 4] },
  fireMage: { name: '화염 해골 마법사', sprite: 'skeleton_mage', color: [255, 175, 150], h: 92, life: 18, dmg: [5, 9], speed: 72, r: 13, atkCD: 2.2, windup: 0.55, xp: 18, minFloor: 13, weight: 1.4, pack: [2, 3], undead: true,
              ranged: { range: 340, proj: 'fireball', speed: 320, keep: 220 }, abil: ['meteor'] },
  frostZombie: { name: '서리 망자', sprite: 'zombie', color: [190, 210, 255], h: 90, life: 34, dmg: [6, 10], speed: 52, r: 15, atkRange: 42, atkCD: 1.6, windup: 0.5, xp: 18, minFloor: 14, weight: 2, pack: [4, 6], undead: true, coldHit: true },
  iceMage:  { name: '냉기 해골 마법사', sprite: 'skeleton_mage', color: [180, 200, 255], h: 92, life: 18, dmg: [5, 9], speed: 72, r: 13, atkCD: 2.2, windup: 0.55, xp: 18, minFloor: 15, weight: 1.4, pack: [2, 3], undead: true,
              ranged: { range: 320, proj: 'icicle', speed: 400, keep: 200 }, abil: ['nova'] },
  ghost:    { name: '원혼', sprite: 'zombie', color: [200, 255, 210], alpha: 0.7, h: 90, life: 22, dmg: [6, 10], speed: 115, r: 14, atkRange: 40, atkCD: 1.1, windup: 0.3, xp: 20, minFloor: 17, weight: 1.5, pack: [3, 5], undead: true, lifeSteal: 0.5, abil: ['blink'] },
  stormWyvern: { name: '폭풍 비룡', sprite: 'wyvern_air', h: 110, life: 62, dmg: [9, 15], speed: 110, r: 22, atkCD: 2.0, windup: 0.55, xp: 44, minFloor: 17, weight: 1, pack: [1, 3],
              ranged: { range: 340, proj: 'bolt', speed: 260, keep: 150, spread: 3 }, abil: ['dive'] },
  fossilAnt: { name: '화석 개미', sprite: 'ice_ant', color: [125, 108, 92], h: 58, life: 40, dmg: [7, 12], speed: 95, r: 17, atkCD: 2.1, windup: 0.5, xp: 24, minFloor: 20, weight: 1.4, pack: [3, 5], armorK: 0.65,
              ranged: { range: 300, proj: 'stone', speed: 480, keep: 140 }, abil: ['burrow'] },
  // 특수: 방에 놓이는 무덤과 무덤·보스가 불러내는 졸개
  grave:    { name: '저주받은 무덤', sprite: 'cursed_grave', h: 70, life: 45, dmg: [0, 0], speed: 0, r: 24, xp: 30, minFloor: 3, weight: 0, undead: true, stationary: true, abil: ['summon'], summon: 'boneling', armorK: 0.8 },
  boneling: { name: '해골 병사', sprite: 'skeleton_weak', h: 84, life: 8, dmg: [2, 4], speed: 90, r: 13, atkRange: 44, atkCD: 1.2, windup: 0.35, xp: 3, minFloor: 99, weight: 0, undead: true },
  fireGrave: { name: '불타는 무덤', sprite: 'cursed_grave', color: [255, 165, 140], h: 70, life: 55, dmg: [0, 0], speed: 0, r: 24, xp: 40, minFloor: 99, weight: 0, undead: true, stationary: true, abil: ['summon'], summon: 'fireBoneling', armorK: 0.8 },
  iceGrave: { name: '얼어붙은 무덤', sprite: 'cursed_grave', color: [175, 200, 255], h: 70, life: 55, dmg: [0, 0], speed: 0, r: 24, xp: 40, minFloor: 99, weight: 0, undead: true, stationary: true, abil: ['summon'], summon: 'iceBoneling', armorK: 0.8 },
  fireBoneling: { name: '불꽃 해골 병사', sprite: 'skeleton_weak', color: [255, 170, 140], h: 84, life: 9, dmg: [3, 5], speed: 95, r: 13, atkRange: 44, atkCD: 1.2, windup: 0.35, xp: 3, minFloor: 99, weight: 0, undead: true, abil: ['explode'] },
  iceBoneling: { name: '서리 해골 병사', sprite: 'skeleton_weak', color: [175, 200, 255], h: 84, life: 9, dmg: [3, 5], speed: 85, r: 13, atkRange: 44, atkCD: 1.3, windup: 0.35, xp: 3, minFloor: 99, weight: 0, undead: true, coldHit: true },
  // 보스 전용
  knight:   { name: '해골 기사', sprite: 'skeleton_knight_boss', h: 120, life: 60, dmg: [9, 15], speed: 85, r: 20, atkRange: 58, atkCD: 1.4, windup: 0.5, xp: 40, minFloor: 99, weight: 0, undead: true, abil: ['charge', 'block', 'summon'], summon: 'boneling', armorK: 0.85 },
  lich:     { name: '해골 대마법사', sprite: 'skeleton_mage_boss', h: 120, life: 45, dmg: [8, 13], speed: 75, r: 18, atkCD: 2.0, windup: 0.55, xp: 40, minFloor: 99, weight: 0, undead: true,
              ranged: { range: 380, proj: 'plasma', speed: 300, keep: 240 }, abil: ['teleport', 'nova', 'summon'], summon: 'boneling' },
  lichKing: { name: '해골왕', sprite: 'skeleton_mage_high_boss', h: 124, life: 50, dmg: [9, 15], speed: 75, r: 18, atkCD: 1.8, windup: 0.5, xp: 50, minFloor: 99, weight: 0, undead: true,
              ranged: { range: 400, proj: 'plasma', speed: 320, keep: 240 }, abil: ['teleport', 'nova', 'summon', 'meteor'], summon: 'boneling' },
  stormKing: { name: '폭풍의 비룡왕', sprite: 'wyvern_air_boss', h: 230, life: 60, dmg: [10, 16], speed: 95, r: 30, atkCD: 2.0, windup: 0.6, xp: 60, minFloor: 99, weight: 0,
              ranged: { range: 380, proj: 'bolt', speed: 260, keep: 170, spread: 3 }, abil: ['dive', 'storm', 'volley'] },
  deathKing: { name: '망자의 왕', sprite: 'skeleton_mage_high_boss', h: 124, life: 60, dmg: [10, 16], speed: 80, r: 18, atkCD: 1.6, windup: 0.5, xp: 80, minFloor: 99, weight: 0, undead: true,
              ranged: { range: 420, proj: 'plasma', speed: 330, keep: 240 }, abil: ['phases', 'teleport', 'nova', 'summon', 'meteor', 'storm', 'volley'], summon: 'iceBoneling' },
};
const UNDEAD = new Set(Object.keys(MONSTERS).filter(k => MONSTERS[k].undead));

const ELITE_MODS = {
  fast:   { name: '빠름' },
  strong: { name: '강함' },
  tough:  { name: '돌가죽' },
  fire:   { name: '화염 강화' },
  cold:   { name: '냉기 강화' },
  vamp:   { name: '흡혈' },
  shock:  { name: '번개 강화' },
  blink:  { name: '순간이동' },
  venom:  { name: '독 강화' },
};

const UNIQUE_NAME_A = ['썩은', '피투성이', '검은', '광기의', '저주받은', '굶주린', '뒤틀린', '불타는', '잿빛', '울부짖는', '굴을 파는', '눈먼'];
const UNIQUE_NAME_B = ['그르막', '바쉬토', '크라즈', '무드락', '고렉', '스카르', '토르그', '라즈쿨', '드라고', '카스무', '니르갈', '오쉬'];

// 5층마다 나오는 보스 (차례대로 돌아가며 등장)
const BOSSES = [
  { name: '도살자 모르그', type: 'brute', sprite: 'minotaur', scale: 1.35, pal: { skin: '#7d1d14', shade: '#4a0f0a', horn: '#d9cfb8' }, abil: ['charge', 'slam'], tint: 'hue-rotate(-20deg) saturate(1.4) brightness(0.9)' },
  { name: '해골 기사 바르곤', type: 'knight', scale: 1.05, abil: ['charge', 'block', 'summon', 'slam'] },
  { name: '역병 비룡 니드라', type: 'wyvern', scale: 1.3, abil: ['dive', 'volley', 'pools'] },
  { name: '대사제 말카르', type: 'lich', scale: 1.1, abil: ['teleport', 'nova', 'summon', 'volley'] },
  { name: '심연의 비룡 아즈라크', type: 'wyvern', sprite: 'wyvern_fire', scale: 1.25, proj: 'fireball', abil: ['dive', 'meteor', 'volley'] },
  { name: '해골 대주교 벨칸', type: 'lichKing', scale: 1.1, abil: ['teleport', 'nova', 'summon', 'meteor'] },
  { name: '피의 군주 크루그', type: 'brute', sprite: 'minotaur', scale: 1.5, abil: ['charge', 'slam', 'enrage'], tint: 'hue-rotate(-28deg) saturate(1.9) brightness(0.8)' },
  { name: '서리 여왕 실바', type: 'iceWyvern', sprite: 'wyvern_water', scale: 1.45, abil: ['dive', 'blizzard', 'nova', 'volley'], tint: 'saturate(0.6) brightness(1.25)' },
  { name: '폭풍의 비룡왕 볼타르', type: 'stormKing', scale: 0.85, abil: ['dive', 'storm', 'volley'] },
  { name: '망자의 왕 오르쿠스', type: 'deathKing', scale: 1.45, final: true, abil: ['phases', 'teleport', 'nova', 'summon', 'meteor', 'storm', 'volley'], tint: 'hue-rotate(195deg) saturate(1.4) brightness(1.05)' },
];
const FINAL_FLOOR = 50;

// ── 층별 테마 ──
const THEMES = [
  { name: '어둠의 묘지', tiles: 'dungeon', tint: null, floor: ['#3b3a42', '#36353d', '#302f37'], grout: '#1b1a20', top: '#55535e', left: '#2a2930', right: '#3a3942', brick: '#1d1c22', moss: null },
  { name: '망자의 동굴', tiles: 'cave', tint: null, floor: ['#4a3c2e', '#43362a', '#3c3125'], grout: '#1f1912', top: '#5f4e3b', left: '#30261b', right: '#41352a', brick: '#221a12', moss: null },
  { name: '버려진 성채', tiles: 'dungeon', tint: '#9fb39a', floor: ['#323b35', '#2d3630', '#28302b'], grout: '#151a17', top: '#4b5650', left: '#262d29', right: '#343d38', brick: '#161b18', moss: '#3d5a2a' },
  { name: '불타는 심연', tiles: 'cave', tint: '#ff8f6e', floor: ['#3b2522', '#341f1c', '#2d1a17'], grout: '#120807', top: '#4f2f2a', left: '#26130f', right: '#381c17', brick: '#140806', lava: true },
  { name: '혼돈의 성역', tiles: 'dungeon', tint: '#b9a0e0', floor: ['#2f2639', '#2a2133', '#231b2c'], grout: '#100b15', top: '#463a55', left: '#1f1828', right: '#2d243a', brick: '#120d18', lava: true },
  { name: '얼어붙은 지하묘지', tiles: 'dungeon', tint: '#a8c4ff', floor: ['#2c3442', '#28303d', '#232a36'], grout: '#10141b', top: '#46526a', left: '#1e2430', right: '#2b3342', brick: '#11151c', moss: null },
  // 20층부터는 탁 트인 바깥 지역 (Flare grassland 타일에 색을 입힘)
  { name: '역병의 늪지', tiles: 'grassland', outdoor: true, sound: 'cave', filter: 'sepia(0.35) hue-rotate(20deg) saturate(0.9) brightness(0.78)', tint: '#c8d890',
    amb: [30, 34, 24], sky: [215, 235, 170], flora: [5, 10, 12], marsh: true, camps: 1, graves: 1, bg: '#0a0f07',
    floor: ['#33402a', '#2e3a26', '#283322'], grout: '#121a0e', top: '#4a5c3a', left: '#222c1a', right: '#304026', brick: '#141c10', moss: '#4a6a2a' },
  { name: '핏빛 황야', tiles: 'grassland', outdoor: true, sound: 'cave', filter: 'sepia(0.6) hue-rotate(-60deg) saturate(2.6) brightness(0.62)', tint: '#d87070',
    amb: [36, 22, 20], sky: [255, 196, 170], flora: [3, 6, 12], camps: 2, graves: 2, bg: '#100605',
    floor: ['#3e2626', '#382222', '#311e1e'], grout: '#160b0b', top: '#5a3838', left: '#2a1818', right: '#3c2222', brick: '#180c0c', moss: null },
  { name: '잿빛 황무지', tiles: 'grassland', outdoor: true, sound: 'cave', filter: 'grayscale(0.85) sepia(0.2) brightness(0.82)', tint: '#b0aca4',
    amb: [30, 29, 28], sky: [235, 228, 215], flora: [2, 4, 12], ruins: 2, graves: 1, bg: '#0b0a09',
    floor: ['#38352f', '#33302b', '#2d2a26'], grout: '#141210', top: '#524e46', left: '#26231f', right: '#36322d', brick: '#161411', moss: null },
  { name: '그림자 숲', tiles: 'grassland', outdoor: true, sound: 'cave', filter: 'hue-rotate(75deg) saturate(0.75) brightness(0.62)', tint: '#8590c8',
    amb: [22, 24, 38], sky: [175, 190, 255], flora: [8, 11, 12], dense: true, ruins: 1, bg: '#05060d',
    floor: ['#26283a', '#222434', '#1d1f2d'], grout: '#0c0d14', top: '#3c3f58', left: '#191a26', right: '#252738', brick: '#0e0f16', moss: null },
  { name: '불타는 평원', tiles: 'grassland', outdoor: true, sound: 'cave', filter: 'sepia(1) hue-rotate(-12deg) saturate(2.6) brightness(0.72)', tint: '#ffb070',
    amb: [42, 22, 14], sky: [255, 170, 110], flora: [2, 5, 12], burning: true, camps: 1, lava: true, bg: '#120603',
    floor: ['#3e2018', '#381c15', '#311812'], grout: '#160806', top: '#58302a', left: '#2a120d', right: '#3c1a14', brick: '#180806' },
  { name: '얼어붙은 설원', tiles: 'grassland', outdoor: true, sound: 'cave', filter: 'grayscale(1) brightness(1.45) contrast(0.8)', tint: '#c8dcff', tintAfter: '#d6e4ff',
    amb: [30, 34, 46], sky: [215, 228, 255], flora: [4, 7, 12], ruins: 1, frozen: true, bg: '#080b12',
    floor: ['#2c3442', '#28303d', '#232a36'], grout: '#10141b', top: '#46526a', left: '#1e2430', right: '#2b3342', brick: '#11151c', moss: null },
];
// 마지막 층: 망자의 왕좌
const FINAL_THEME = { name: '망자의 왕좌', tiles: 'grassland', outdoor: true, sound: 'cave', filter: 'sepia(0.8) saturate(1.3) hue-rotate(-10deg) brightness(0.6)', tint: '#e8c27a',
  amb: [34, 28, 20], sky: [255, 222, 160], flora: [2, 5, 12], ruins: 3, graves: 2, throne: true, lava: true, bg: '#0c0904',
  floor: ['#3a3020', '#342b1c', '#2e2619'], grout: '#14100a', top: '#57492e', left: '#2a2216', right: '#3c3120', brick: '#16120b' };
// 테마가 바뀌는 층 (위 THEMES 순서대로)
const THEME_STARTS = [1, 4, 7, 10, 13, 16, 20, 25, 30, 35, 40, 45];
// 이 층부터는 바깥 지역 (넓은 들판·숲)
const OUTDOOR_FLOOR = 20;
const TOWN_THEME = { name: '국경 야영지', tiles: 'grassland', tint: null, town: true, floor: ['#3d4a2a', '#38452a', '#334026'], grout: '#1d2414', top: '#4a5a32', left: '#2a3320', right: '#36412a', brick: '#1d2414', moss: null };
function themeForFloor(f) {
  if (f === 0) return TOWN_THEME;
  if (f >= FINAL_FLOOR) return FINAL_THEME;
  let i = 0;
  while (i + 1 < THEME_STARTS.length && THEME_STARTS[i + 1] <= f) i++;
  return THEMES[i];
}
// ── 난이도 ── 일반 난이도의 망자의 왕을 쓰러뜨리면 악몽이 열림
// res: 원소 저항 감소, mf: 마법 아이템 발견 보너스, gold: 골드 배율
const DIFFICULTIES = [
  { name: '일반', color: '#e8d9a8', res: 0, mf: 0, gold: 1 },
  { name: '악몽', color: '#ff6a5a', res: -20, mf: 60, gold: 1.5 },
];
// 몬스터 레벨: 일반 1층 1 → 50층 75, 악몽 1층 48 → 50층 97
function monsterLevelForFloor(f, diff = 0) { return diff === 1 ? 48 + (f - 1) : 1 + Math.round((f - 1) * 1.5); }
function isBossFloor(f) { return f > 0 && f % 5 === 0; }
