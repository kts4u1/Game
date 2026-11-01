'use strict';
// ───────── 퀘스트: 마을 사람들의 부탁(이야기 퀘스트)과 경비대장의 현상금 ─────────
// 진행 상태는 player.quests[id] = { s: 'active' | 'ready' | 'done', n: 진행 수 }
// 목표 종류: kill(조건에 맞는 몬스터 처치) · boss(그 층 보스 처치, diff로 난이도 조건) · item(퀘스트 물건 찾기) · gems(보석 가져가기)
//   rescue(그 층에 갇힌 사람 구출) · collect(몬스터가 떨어뜨리는 물건 모으기) · chests(보물 상자 열기) · reach(그 층까지 내려가기)
//   pay(골드 내기) · deliver(조건에 맞는 아이템 건네기)

const QUESTS = [
  { id: 'farm', giver: 'farmer', name: '밭을 되찾아 주세요',
    intro: '밤마다 해골과 좀비가 밭을 짓밟고 다녀요. 던전의 망자 25마리만 쓰러뜨려 주세요. 그럼 다시 씨를 뿌릴 수 있을 거예요.',
    thanks: '정말 고마워요! 제가 모아 둔 돈이랑 물약이에요. 조심히 다녀오세요.',
    goal: { kind: 'kill', tag: 'undead', n: 25, text: '망자 처치' }, reward: { gold: 250, potions: 3, xp: 0.5 } },
  { id: 'graves', giver: 'farmer', after: 'farm', minDeepest: 4, name: '무덤을 부숴 주세요',
    intro: '아무리 쓰러뜨려도 해골이 또 나와요. 던전의 저주받은 무덤이 놈들을 불러낸대요. 무덤 6개를 부숴 주세요.',
    thanks: '요즘은 밤에 긁는 소리가 안 들려요! 이건 할아버지가 쓰시던 허리띠예요.',
    goal: { kind: 'kill', tag: 'grave', n: 6, text: '저주받은 무덤 부수기' }, reward: { gold: 500, item: { rarity: 2, slot: 'belt' }, xp: 0.5 } },
  { id: 'seeds', giver: 'farmer', after: 'graves', name: '도둑맞은 씨앗',
    intro: '고블린 놈들이 창고의 씨앗 자루를 몽땅 훔쳐 갔어요! 고블린 종류를 잡으면 가끔 자루를 떨어뜨릴 거예요. 8자루만 되찾아 주세요.',
    thanks: '씨앗만 있으면 내년엔 굶지 않을 거예요. 고마워요, 정말로.',
    goal: { kind: 'collect', tag: 'goblin', chance: 0.35, n: 8, token: '씨앗 자루', icon: 83, text: '씨앗 자루 되찾기 (고블린 종류)' }, reward: { gold: 800, potions: 5, xp: 0.5 } },
  { id: 'ants', giver: 'hunter', minDeepest: 2, name: '개미귀신 사냥',
    intro: '땅속 개미귀신들 때문에 사냥감이 씨가 말랐어. 개미 종류 20마리를 잡아 줘. 제대로 된 장화를 하나 줄게.',
    thanks: '하하, 이제야 숨통이 트이네. 약속한 장화야. 발밑을 조심하라고.',
    goal: { kind: 'kill', tag: 'ant', n: 20, text: '개미귀신 처치' }, reward: { gold: 400, item: { rarity: 2, slot: 'boots' }, xp: 0.5 } },
  { id: 'trail', giver: 'hunter', after: 'ants', name: '깊은 사냥터',
    intro: '아래로 갈수록 사냥감이 크다던데, 12층까지 내려가 본 사람은 아직 없어. 네가 길을 열어 봐.',
    thanks: '12층이라니! 다음에 나도 데려가 줘. 이건 내 사냥 장갑이야.',
    goal: { kind: 'reach', floor: 12, text: '12층까지 내려가기' }, reward: { gold: 900, item: { rarity: 2, slot: 'gloves' }, xp: 0.5 } },
  { id: 'wyverns', giver: 'hunter', after: 'trail', name: '하늘의 사냥감',
    intro: '비룡을 잡아 봤어? 하늘로 솟구쳤다 떨어지는 놈들 말이야. 15마리를 잡으면 진짜 사냥꾼으로 인정해 주지.',
    thanks: '전설의 사냥꾼이 여기 있었네! 내가 아는 사냥 비법을 알려 줄게.',
    goal: { kind: 'kill', tag: 'wyvern', n: 15, text: '비룡 처치' }, reward: { gold: 1500, skill: 1 } },
  { id: 'butcher', giver: 'captain', name: '계단을 지키는 자',
    intro: '5층 계단을 지키는 놈이 있다. 그놈을 쓰러뜨려야 더 깊이 내려갈 수 있지. 해내면 내가 아는 싸움 기술 하나를 가르쳐 주마.',
    thanks: '훌륭하다. 이제 너를 진짜 전사로 인정하지. 약속한 기술이다. 그리고 앞으로는 현상금 일도 맡길 수 있겠군.',
    goal: { kind: 'boss', floor: 5, text: '5층 보스 처치' }, reward: { gold: 600, skill: 1 } },
  { id: 'elites', giver: 'captain', after: 'butcher', minDeepest: 6, name: '이름 있는 놈들',
    intro: '던전에는 이름까지 붙은 놈들이 있다. 황금빛 이름의 정예 다섯 놈을 처치해라. 무기고에서 좋은 걸 하나 골라 주지.',
    thanks: '다섯 놈 모두라니. 약속한 무기다.',
    goal: { kind: 'kill', tag: 'unique', n: 5, text: '이름 있는 정예 처치' }, reward: { gold: 1200, item: { rarity: 2, slot: 'weapon' }, xp: 0.5 } },
  { id: 'ring', giver: 'widow', after: 'butcher', name: '남편의 반지',
    intro: '남편이 6층 아래로 내려간 뒤로 소식이 없어요. 이름 있는 정예 놈이 그이의 반지를 끼고 다닌다는 소문을 들었어요. 반지만이라도… 돌려받고 싶어요.',
    thanks: '이 반지… 맞아요, 그이 거예요. 고마워요, 정말로. 이건 그이가 아끼던 반지예요. 당신이 써 주세요.',
    goal: { kind: 'item', from: 'elite', minFloor: 6, base: 'quest_ring', itemName: '엘사 남편의 반지', flavor: '안쪽에 두 사람의 이름이 새겨져 있다.', text: '남편의 반지 찾기 (6층 아래 이름 있는 정예)' },
    reward: { gold: 800, item: { rarity: 2, slot: 'ring' }, xp: 0.5 } },
  { id: 'rescue', giver: 'widow', after: 'ring', minDeepest: 8, name: '살아남은 사람',
    intro: '남편과 함께 내려간 토마스가 9층 어딘가에 갇혀 있다는 소식이 왔어요. 괴물들이 지키고 있대요. 제발 데려와 주세요.',
    thanks: '토마스가 살아 돌아왔어요! 그이 소식도 들었어요… 고마워요. 이건 우리 집안의 목걸이예요.',
    goal: { kind: 'rescue', floor: 9, who: '토마스', text: '9층에 갇힌 토마스 구출' }, reward: { gold: 1200, item: { rarity: 2, slot: 'amulet' }, xp: 0.7 } },
  { id: 'treasure', giver: 'gambler', minDeepest: 3, name: '보물 지도',
    intro: '후후, 던전의 보물 상자에는 내 몫도 있다네. 상자 8개를 열어 보게. 무엇이 나오든 자네 것이고, 수고비는 따로 주지.',
    thanks: '운이 좋은 친구로군. 자, 수고비와 내 행운의 반지일세.',
    goal: { kind: 'chests', n: 8, text: '보물 상자 열기' }, reward: { gold: 600, item: { rarity: 2, slot: 'ring' } } },
  { id: 'debt', giver: 'gambler', after: 'treasure', minDeepest: 10, name: '도박 빚',
    intro: '사실… 남쪽 상단에 빚이 좀 있다네. 5,000 골드만 대신 갚아 주면 앞으로 내 물건을 영원히 싸게 주지. 어떤가?',
    thanks: '자네는 내 은인이야! 약속대로 이제부터 내 물건은 25% 싸게 주겠네. 이건 덤일세.',
    goal: { kind: 'pay', n: 5000, text: '골드 내기' }, reward: { gambleDiscount: 25, item: { rarity: 2, slot: 'amulet' } } },
  { id: 'gems', giver: 'refiner', minDeepest: 6, name: '반짝이는 것',
    intro: '끼끼! 반짝이는 보석 세 개만 가져다줘. 종류는 아무거나! 쿠루가 아주 특별한 부적을 만들어 줄게, 끼끼.',
    thanks: '끼끼끼! 예쁘다, 예뻐! 약속한 부적이야. 부적 주머니에 넣어 둬.',
    goal: { kind: 'gems', n: 3, text: '보석 가져가기' }, reward: { gold: 300, item: { rarity: 2, slot: 'charm' } } },
  { id: 'collector', giver: 'refiner', after: 'gems', minDeepest: 15, name: '쿠루의 수집품',
    intro: '끼끼, 황금빛이나 초록빛 물건을 본 적 있어? 유니크든 세트든 하나만 쿠루한테 줘! 대신 부적 두 개를 만들어 줄게.',
    thanks: '끼끼끼끼! 쿠루의 보물! 약속한 부적 두 개야!',
    goal: { kind: 'deliver', rarity: 3, text: '유니크·세트 아이템 건네기' }, reward: { gold: 2000, items: [{ rarity: 2, slot: 'charm' }, { rarity: 2, slot: 'charm' }] } },
  { id: 'hammer', giver: 'smith', after: 'butcher', minDeepest: 8, name: '잃어버린 망치',
    intro: '할아버지께 물려받은 망치를 10층 보스 놈이 빼앗아 갔다네. 되찾아 주면 자네 장비에 소켓을 두 번 공짜로 뚫어 주지.',
    thanks: '오오, 이 무게! 틀림없군. 고맙네. 약속대로 소켓 두 번은 공짜야. 언제든 가져오게.',
    goal: { kind: 'item', from: 'boss', floor: 10, base: 'quest_hammer', itemName: '브론 할아버지의 망치', flavor: '손잡이가 손때로 반질반질하다.', text: '브론의 망치 되찾기 (10층 보스)' },
    reward: { gold: 500, freeSocket: 2 } },
  { id: 'ore', giver: 'smith', after: 'hammer', name: '운철 조각',
    intro: '단단한 놈들, 갑각 개미나 미노타우로스의 몸속에 운철이 박혀 있지. 8조각만 모아 오게. 자네 장비를 세 번 공짜로 강화해 주지.',
    thanks: '이 빛깔! 좋은 운철이야. 약속대로 강화 세 번은 공짜일세.',
    goal: { kind: 'collect', tag: 'stone', chance: 0.5, n: 8, token: '운철 조각', icon: 79, text: '운철 조각 모으기 (갑각 개미·미노타우로스 종류)' }, reward: { gold: 1000, freeEnhance: 3 } },
  { id: 'masterwork', giver: 'smith', after: 'ore', minDeepest: 20, name: '명검 제작',
    intro: '평생 한 번은 명검을 만들고 싶었네. 쓸 만한 레어 이상의 무기를 하나 가져오면 그걸 녹여 전설의 무기를 만들어 주지.',
    thanks: '보게, 내 평생의 역작일세. 자네가 쓰게.',
    goal: { kind: 'deliver', rarity: 2, slot: 'weapon', text: '레어 이상의 무기 건네기' }, reward: { item: { rarity: 3, slot: 'weapon' } } },
  { id: 'plague', giver: 'healer', after: 'hammer', name: '역병의 근원',
    intro: '독에 쓰러지는 사람이 늘고 있어요. 15층의 보스가 역병을 퍼뜨리고 있대요. 쓰러뜨려 주면 물약을 더 많이 들 수 있는 주머니를 지어 줄게요.',
    thanks: '이제 마을 사람들도 나을 거예요. 약속한 물약 주머니예요. 물약을 4개 더 들 수 있어요.',
    goal: { kind: 'boss', floor: 15, text: '15층 보스 처치' }, reward: { gold: 1000, potionCap: 4, potions: 4 } },
  { id: 'herbs', giver: 'healer', after: 'plague', minDeepest: 20, name: '늪지 약초',
    intro: '20층 아래 깊은 곳에만 자라는 약초가 있어요. 그곳의 괴물들 몸에 붙어 다니죠. 12묶음만 모아 주면 물약 주머니를 더 늘려 줄게요.',
    thanks: '이 향기! 좋은 물약이 나오겠어요. 물약 주머니를 조금 더 늘렸어요.',
    goal: { kind: 'collect', minFloor: 20, chance: 0.2, n: 12, token: '늪지 약초', icon: 80, text: '늪지 약초 모으기 (20층 아래)' }, reward: { gold: 1500, potionCap: 2, potions: 6 } },
  { id: 'bandits', giver: 'captain', after: 'plague', minDeepest: 16, name: '숲의 도적단',
    intro: '숲길에 도적과 광신도, 타락한 기사들이 들끓고 있다. 사람형 적 40명을 처치해라. 길을 다시 열어야 한다.',
    thanks: '이제 상인들도 안심하고 다니겠군. 또 하나 가르쳐 주마.',
    goal: { kind: 'kill', tag: 'human', n: 40, text: '사람형 적 처치' }, reward: { gold: 2000, skill: 1, xp: 0.5 } },
  { id: 'abyss', giver: 'captain', after: 'bandits', name: '심연의 문지기',
    intro: '30층을 지키는 놈이 깨어났다는 보고다. 그 아래로는 아무도 살아 돌아오지 못했지. 네가 첫 번째가 돼라.',
    thanks: '살아 돌아왔군! 이건 왕실 창고에서 꺼내 온 물건이다. 그리고 기술 하나 더.',
    goal: { kind: 'boss', floor: 30, text: '30층 보스 처치' }, reward: { gold: 4000, skill: 1, item: { rarity: 3 } } },
  { id: 'king', giver: 'captain', after: 'abyss', name: '망자의 왕',
    intro: '모든 저주의 근원, 망자의 왕이 50층 왕좌에서 기다린다. 이 싸움을 끝내라, 야만용사.',
    thanks: '해냈구나… 북방의 모든 부족이 너를 기억할 것이다. 받아라. 이건 전설의 목걸이다.',
    goal: { kind: 'boss', floor: 50, text: '망자의 왕 처치' }, reward: { gold: 10000, skill: 2, item: { rarity: 3, slot: 'amulet' } } },
  // 엔딩 뒤 (악몽·지옥)
  { id: 'nightmare', giver: 'captain', after: 'king', diff: 1, name: '되살아난 악몽',
    intro: '왕관의 조각이 악몽 속에서 다시 맞붙고 있다. 악몽 난이도 25층의 보스를 쓰러뜨려 놈들이 모이는 걸 막아라.',
    thanks: '악몽 속에서도 살아 돌아왔군. 왕실 창고의 보물과 기술을 하나 더 주마.',
    goal: { kind: 'boss', floor: 25, diff: 1, text: '악몽 25층 보스 처치' }, reward: { gold: 20000, skill: 1, item: { rarity: 3 } } },
  { id: 'hellfire', giver: 'captain', after: 'nightmare', diff: 2, name: '지옥의 불길',
    intro: '마지막이다. 지옥 난이도 50층의 망자의 왕을 쓰러뜨리면 이 땅의 저주는 영원히 끝난다.',
    thanks: '전설이 아니라 신화가 되었구나. 이 이상 줄 것이 없다. 전부 가져가라.',
    goal: { kind: 'boss', floor: 50, diff: 2, text: '지옥 50층 망자의 왕 처치' }, reward: { gold: 100000, skill: 2, items: [{ rarity: 3 }, { rarity: 3 }] } },
];
const QUEST_INDEX = Object.fromEntries(QUESTS.map(q => [q.id, q]));

// kill 목표의 몬스터 조건
const QUEST_TAGS = {
  undead: m => !!MONSTERS[m.type].undead,
  ant: m => ['antlion', 'antlion_small', 'antlion_armored', 'fire_ant', 'ice_ant'].includes(MONSTERS[m.type].sprite),
  human: m => !!MONSTERS[m.type].gear,
  grave: m => ['grave', 'fireGrave', 'iceGrave'].includes(m.type),
  unique: m => m.tier === 2,
  wyvern: m => (m.sprite || MONSTERS[m.type].sprite || '').startsWith('wyvern'),
  goblin: m => ['goblin', 'goblin_elite', 'hobgoblin', 'hobgoblin_archer', 'goblin_minecart'].includes(MONSTERS[m.type].sprite),
  stone: m => ['antlion_armored', 'minotaur'].includes(MONSTERS[m.type].sprite) || m.type === 'fossilAnt',
};

const Quests = {
  st(id) { return (player.quests || (player.quests = {}))[id] || null; },
  isDone(id) { const s = this.st(id); return !!s && s.s === 'done'; },
  // 이 퀘스트를 지금 받을 수 있는지
  canOffer(q) {
    if (this.st(q.id)) return false;
    if (q.after && !this.isDone(q.after)) return false;
    if (q.minDeepest && Math.max(...Game.deepestBy()) < q.minDeepest) return false;
    if (q.diff && !diffUnlocked(player, q.diff)) return false;
    return true;
  },
  // 이 마을 사람에게서 받을 수 있는 / 완료해서 보고할 / 진행 중인 퀘스트
  forNpc(n) {
    const out = { offer: null, ready: null, active: null };
    for (const q of QUESTS) {
      if (q.giver !== n.id) continue;
      const s = this.st(q.id);
      if (s && s.s === 'ready' && !out.ready) out.ready = q;
      else if (s && s.s === 'active' && !out.active) out.active = q;
      else if (!s && !out.offer && this.canOffer(q)) out.offer = q;
    }
    return out;
  },
  bountyOpen() { return this.isDone('butcher'); },
  // 머리 위 표시: ? 보고할 것 있음, ! 새 퀘스트
  mark(n) {
    const f = this.forNpc(n), b = player.bounty;
    if (f.ready || (n.id === 'captain' && b && b.s === 'ready')) return '?';
    if (f.offer || (n.id === 'captain' && this.bountyOpen() && !b)) return '!';
    return null;
  },
  hasContent(n) { const f = this.forNpc(n); return !!(f.offer || f.ready || f.active || (n.id === 'captain' && this.bountyOpen())); },

  progress(q) {
    const s = this.st(q.id) || { n: 0 }, g = q.goal;
    if (g.kind === 'kill' || g.kind === 'collect' || g.kind === 'chests') return [Math.min(s.n, g.n), g.n];
    if (g.kind === 'gems') return [Math.min(this.gemCount(), g.n), g.n];
    if (g.kind === 'pay') return [Math.min(player.gold, g.n), g.n];
    if (g.kind === 'deliver') return [this.deliverable(g) >= 0 ? 1 : 0, 1];
    if (g.kind === 'reach') return [s.s === 'ready' || s.s === 'done' || this.deepNow() >= g.floor ? 1 : 0, 1];
    return [s.s === 'ready' || s.s === 'done' ? 1 : 0, 1];
  },
  gemCount() { return player.inventory.filter(it => it && it.slot === 'gem').length; },
  deepNow() { return player.deepest || 1; },
  // 건넬 수 있는 가방 속 아이템 (가장 싼 것부터)
  deliverable(g) {
    let best = -1, bv = Infinity;
    player.inventory.forEach((it, i) => {
      if (!it || it.slot === 'quest' || it.slot === 'gem' || it.slot === 'charm' || it.rarity < g.rarity || (g.slot && it.slot !== g.slot)) return;
      if (it.value < bv) { bv = it.value; best = i; }
    });
    return best;
  },
  progressText(q) {
    const [a, b] = this.progress(q);
    if (q.goal.kind === 'pay') return `${q.goal.text} ${a.toLocaleString()} / ${b.toLocaleString()}`;
    return b > 1 ? `${q.goal.text} ${a} / ${b}` : `${q.goal.text}${a ? ' ✓' : ''}`;
  },

  accept(id) {
    const q = QUEST_INDEX[id];
    if (!q || !this.canOffer(q)) return;
    player.quests[id] = { s: 'active', n: 0 };
    UI.message(`퀘스트 수락: ${q.name}`, '#ffd36a');
    SFX.play('click');
    this.check(q);
    // 귀환 차원문 너머에 남겨 둔 층이 구출할 층이면 그곳에도 배치
    const dw = Game.dungeonWorld;
    if (q.goal.kind === 'rescue' && dw && !dw.town && dw.floor === q.goal.floor) { const cur = world; world = dw; this.placeCaptive(q); world = cur; }
    Game.save();
  },
  // 보석 퀘스트처럼 가진 것으로 바로 끝나는지 확인
  check(q) {
    const s = this.st(q.id);
    if (!s || s.s !== 'active') return;
    const [a, b] = this.progress(q);
    if (a >= b) this.ready(q);
  },
  ready(q) {
    const s = this.st(q.id);
    if (!s || s.s !== 'active') return;
    s.s = 'ready';
    const giver = TOWN_NPCS.find(n => n.id === q.giver);
    if (world.town) UI.message(`퀘스트 목표 달성: ${q.name} — ${giver ? giver.name : ''}에게 보상을 받으세요`, '#ffd36a');
    else UI.message(`퀘스트 완료: ${q.name} — 마을의 ${giver ? giver.name : ''}에게 돌아가세요`, '#ffd36a');
    SFX.play('levelup', 0.5);
    Game.dirty = true;
  },
  turnIn(id) {
    const q = QUEST_INDEX[id], s = this.st(id);
    if (!q || !s || s.s !== 'ready') return;
    const p = player;
    if (q.goal.kind === 'gems') {
      if (this.gemCount() < q.goal.n) { s.s = 'active'; UI.message('보석이 모자랍니다', '#ff7a6a'); return; }
      let left = q.goal.n;
      // 등급이 낮은 보석부터 냄
      const idx = p.inventory.map((it, i) => [it, i]).filter(([it]) => it && it.slot === 'gem').sort((a, b) => a[0].grade - b[0].grade);
      for (const [, i] of idx) { if (left-- <= 0) break; p.inventory[i] = null; }
    }
    if (q.goal.kind === 'item') p.inventory.forEach((it, i) => { if (it && it.questId === id) p.inventory[i] = null; });
    if (q.goal.kind === 'pay') {
      if (p.gold < q.goal.n) { s.s = 'active'; UI.message('골드가 모자랍니다', '#ff7a6a'); SFX.play('nope'); return; }
      p.gold -= q.goal.n;
    }
    if (q.goal.kind === 'deliver') {
      const i = this.deliverable(q.goal);
      if (i < 0) { s.s = 'active'; UI.message('건넬 아이템이 가방에 없습니다', '#ff7a6a'); SFX.play('nope'); return; }
      UI.message(`${itemName(p.inventory[i])}을(를) 건넸습니다`, '#c9c1b3');
      p.inventory[i] = null;
    }
    s.s = 'done';
    this.giveRewards(q.reward, q.name);
    Game.save();
  },

  giveRewards(r, title) {
    const p = player, got = [];
    if (r.gold) { p.gold += r.gold; got.push(`${r.gold.toLocaleString()} 골드`); SFX.play('gold'); }
    if (r.xp) { const x = Math.round(xpToNext(p.level) * r.xp); gainXp(x); got.push(`경험치 ${x.toLocaleString()}`); }
    if (r.potionCap) { p.potionCap = (p.potionCap || 0) + r.potionCap; got.push(`물약 최대 +${r.potionCap}`); }
    if (r.potions) { p.potions = Math.min(maxPotions(), p.potions + r.potions); got.push(`물약 ${r.potions}개`); }
    if (r.freeSocket) { p.freeSockets = (p.freeSockets || 0) + r.freeSocket; got.push(`무료 소켓 ${r.freeSocket}회`); }
    if (r.freeEnhance) { p.freeEnhance = (p.freeEnhance || 0) + r.freeEnhance; got.push(`무료 강화 ${r.freeEnhance}회`); }
    if (r.gambleDiscount) { p.gambleDiscount = Math.min(40, (p.gambleDiscount || 0) + r.gambleDiscount); got.push(`도박 가격 -${r.gambleDiscount}%`); }
    for (const spec of (r.items || []).concat(r.item ? [r.item] : [])) {
      const it = generateItem(p.level + 2, spec.rarity, spec.slot ? { slot: spec.slot } : {});
      const free = p.inventory.indexOf(null);
      if (free >= 0) p.inventory[free] = it; else spawnGround('item', p.x, p.y, { item: it });
      got.push(itemName(it));
      if (it.rarity >= 2) SFX.synth(it.rarity >= 3 ? 'unique' : 'rare');
    }
    if (r.skill) { Game.bonusCards = (Game.bonusCards || 0) + r.skill; Game.levelUpDelay = Math.min(Game.levelUpDelay || 0.6, 0.6); got.push(`기술 카드 ${r.skill}장`); }
    fxSprite('sparkle', p.x, p.y, { life: 1.4, fade: 0.5, scale: 1.2 });
    UI.message(`${title} 보상: ${got.join(', ')}`, '#ffd36a');
    recalcStats(p);
  },
  rewardText(r) {
    const t = [];
    if (r.gold) t.push(`${r.gold.toLocaleString()} 골드`);
    if (r.xp) t.push('경험치');
    for (const spec of (r.items || []).concat(r.item ? [r.item] : [])) t.push(spec.rarity >= 3 ? `유니크 ${spec.slot ? SLOT_NAMES[spec.slot] : '아이템'}` : `레어 ${SLOT_NAMES[spec.slot] || '아이템'}`);
    if (r.freeEnhance) t.push(`무료 강화 ${r.freeEnhance}회`);
    if (r.gambleDiscount) t.push(`떠돌이 상인 물건 영원히 ${r.gambleDiscount}% 할인`);
    if (r.skill) t.push(`기술 카드 ${r.skill}장`);
    if (r.freeSocket) t.push(`무료 소켓 ${r.freeSocket}회`);
    if (r.potionCap) t.push(`물약 최대 개수 +${r.potionCap}`);
    if (r.potions) t.push(`물약 ${r.potions}개`);
    return t.join(' · ');
  },

  // ── 진행 연결 ──
  onKill(m) {
    const p = player;
    if (!p.quests) p.quests = {};
    for (const q of QUESTS) {
      const s = p.quests[q.id];
      if (!s || s.s !== 'active') continue;
      const g = q.goal;
      if (g.kind === 'kill' && QUEST_TAGS[g.tag](m) && !m.summoned) { s.n++; if (s.n >= g.n) this.ready(q); }
      else if (g.kind === 'boss' && m.tier === 3 && world.floor === g.floor && (world.diff || 0) >= (g.diff || 0)) this.ready(q);
      else if (g.kind === 'collect' && s.n < g.n && !m.summoned && (!g.tag || QUEST_TAGS[g.tag](m)) && (!g.minFloor || world.floor >= g.minFloor) && chance(g.chance)) {
        spawnGround('qtoken', m.x, m.y, { questId: q.id, icon: g.icon, label: g.token });
      }
      else if (g.kind === 'item' && !this.hasQuestItem(q.id)) {
        const ok = g.from === 'boss' ? m.tier === 3 && world.floor === g.floor : m.tier === 2 && world.floor >= g.minFloor;
        if (ok) spawnGround('item', m.x, m.y, { item: this.questItem(q) });
      }
    }
    // 현상금
    const b = p.bounty;
    if (b && b.s === 'active') {
      const hit = b.kind === 'type' ? m.type === b.target && !m.summoned : b.kind === 'elite' ? m.tier === 1 || m.tier === 2
        : b.kind === 'unique' ? m.tier === 2 : b.kind === 'graves' ? QUEST_TAGS.grave(m) : b.kind === 'boss' ? m.tier === 3 : false;
      if (hit) this.bountyStep();
    }
  },
  bountyStep() {
    const b = player.bounty;
    b.have++;
    if (b.have >= b.n) { b.s = 'ready'; UI.message('현상금 완료 — 마을의 경비대장 에드릭에게 돌아가세요', '#ffd36a'); SFX.play('levelup', 0.5); }
  },
  // 보물 상자를 열었을 때
  onChest() {
    const p = player;
    for (const q of QUESTS) {
      const s = p.quests[q.id];
      if (s && s.s === 'active' && q.goal.kind === 'chests') { s.n++; if (s.n >= q.goal.n) this.ready(q); }
    }
    if (p.bounty && p.bounty.s === 'active' && p.bounty.kind === 'chests') this.bountyStep();
  },
  // 모을 물건을 주웠을 때 (금화처럼 다가가면 자동으로 주움)
  onToken(g) {
    const q = QUEST_INDEX[g.questId], s = q && this.st(q.id);
    if (!s || s.s !== 'active') return;
    s.n++;
    fxText(g.x, g.y, `${q.goal.token} ${Math.min(s.n, q.goal.n)} / ${q.goal.n}`, '#ffd36a', 13, { z: 24 });
    SFX.play('pickup');
    if (s.n >= q.goal.n) this.ready(q);
  },
  // 새 층에 들어섰을 때: 층 도달 퀘스트, 구출할 사람 배치
  onFloor(n) {
    const p = player;
    for (const q of QUESTS) {
      const s = p.quests[q.id];
      if (!s || s.s !== 'active') continue;
      if (q.goal.kind === 'reach' && this.deepNow() >= q.goal.floor) this.ready(q);
      if (q.goal.kind === 'rescue' && n === q.goal.floor) this.placeCaptive(q);
    }
  },
  // 계단에서 먼 방에 갇힌 사람과 그를 지키는 정예 무리
  placeCaptive(q) {
    const d = world.dungeon;
    if (world.chests.some(c => c.captive === q.id)) return;
    const rooms = d.rooms.filter(r => r !== d.startRoom).sort((a, b) => dist(b.cx, b.cy, d.startRoom.cx, d.startRoom.cy) - dist(a.cx, a.cy, d.startRoom.cx, d.startRoom.cy));
    const r = rooms[Math.min(rooms.length - 1, randInt(0, 2))] || d.startRoom;
    const c = d.randomPointInRoom(r, 2);
    world.chests.push({ x: c.x, y: c.y, open: false, t: 0, captive: q.id, who: q.goal.who });
    const types = (world.roster || ['skeleton']).filter(t => !MONSTERS[t].stationary);
    spawnPack(r, pick(types.length ? types : ['skeleton']), 1, 9000, c);
  },
  freeCaptive(c) {
    const q = QUEST_INDEX[c.captive];
    c.open = true;
    fxSprite('runes_blue', c.x, c.y, { layer: 'ground', life: 1.2, scale: 1 });
    fxSprite('sparkle', c.x, c.y, { life: 1.4, fade: 0.5 });
    SFX.play('teleporter');
    UI.message(`${c.who}을(를) 구했습니다! 마을로 먼저 돌아갔습니다`, '#8fd0ff');
    if (q) this.ready(q);
  },
  hasQuestItem(id) {
    const p = player, has = l => l.some(it => it && it.questId === id);
    return has(p.inventory) || has(p.stash) || world.ground.some(g => g.kind === 'item' && g.item.questId === id);
  },
  questItem(q) {
    return { uid: uid(), slot: 'quest', baseId: q.goal.base, baseName: q.goal.itemName, name: q.goal.itemName, rarity: 3, ilvl: 1, req: 1, affixes: [], plus: 0, questId: q.id, value: 0, flavor: q.goal.flavor };
  },
  onPickup(item) {
    if (!item.questId) return;
    const q = QUEST_INDEX[item.questId];
    if (q) this.ready(q);
  },

  // ── 현상금 (경비대장, 되풀이) ──
  newBounty() {
    const p = player, deep = Math.max(1, p.deepest || 1), lvl = p.level;
    const kinds = ['type', 'type', 'type', 'elite', deep >= 5 ? 'boss' : 'type', 'chests', deep >= 3 ? 'graves' : 'type', deep >= 4 ? 'unique' : 'elite'];
    const kind = pick(kinds);
    let target = null, n;
    if (kind === 'type') {
      const cands = Object.keys(MONSTERS).filter(t => {
        const T = MONSTERS[t];
        return T.weight > 0 && T.minFloor <= deep && (!T.maxFloor || T.maxFloor >= deep - 6) && !T.stationary;
      });
      target = pick(cands);
      n = MONSTERS[target].pack && MONSTERS[target].pack[0] >= 5 ? randInt(30, 45) : randInt(14, 24);
    } else n = kind === 'elite' ? randInt(8, 14) : kind === 'chests' ? randInt(4, 6) : kind === 'graves' ? randInt(3, 5) : kind === 'unique' ? randInt(2, 3) : 1;
    const k = 1 + (p.bountyDone || 0) * 0.02;
    p.bounty = { kind, target, n, have: 0, s: 'active', gold: Math.round((180 + lvl * 40) * k), xp: 0.35, rarity: chance(0.25) ? 2 : 1 };
    UI.message(`현상금 수락: ${this.bountyGoal(p.bounty)}`, '#ffd36a');
    Game.save();
  },
  bountyGoal(b) {
    if (b.kind === 'type') return `${MONSTERS[b.target].name} ${b.n}마리 처치`;
    if (b.kind === 'elite') return `정예(파란·황금 이름) ${b.n}마리 처치`;
    if (b.kind === 'unique') return `이름 있는 정예(황금 이름) ${b.n}마리 처치`;
    if (b.kind === 'chests') return `보물 상자 ${b.n}개 열기`;
    if (b.kind === 'graves') return `저주받은 무덤 ${b.n}개 부수기`;
    return '아무 층의 보스 1마리 처치';
  },
  bountyTurnIn() {
    const p = player, b = p.bounty;
    if (!b || b.s !== 'ready') return;
    p.bounty = null;
    p.bountyDone = (p.bountyDone || 0) + 1;
    this.giveRewards({ gold: b.gold, xp: b.xp, item: { rarity: b.rarity }, skill: p.bountyDone % 10 === 0 ? 1 : 0 }, '현상금');
    Game.save();
  },
  bountyDrop() { player.bounty = null; UI.message('현상금을 포기했습니다', '#c9c1b3'); Game.save(); },

  // ── 화면 ──
  // 마을 사람 창의 퀘스트 탭
  panelHtml(n) {
    // 골드·아이템 건네기, 층 도달은 창을 열 때 확인
    for (const q of QUESTS) {
      if (q.giver !== n.id || !['pay', 'deliver', 'reach', 'gems'].includes(q.goal.kind)) continue;
      // 골드를 써 버렸거나 건넬 물건을 팔았으면 다시 진행 중으로
      const s = this.st(q.id);
      if (s && s.s === 'ready' && q.goal.kind !== 'reach') { const [a, b] = this.progress(q); if (a < b) s.s = 'active'; }
      this.check(q);
    }
    const f = this.forNpc(n), hint = t => `<p class="shop-hint">${t}</p>`;
    let body = '', foot = '';
    const box = (q, label, text, btn) => `<div class="quest-box"><div class="quest-label">${label}</div><div class="quest-name">${q.name}</div><p class="quest-text">${text}</p>`
      + `<div class="quest-goal">목표: ${this.progressText(q)}</div><div class="quest-reward">보상: ${this.rewardText(q.reward)}</div>${btn || ''}</div>`;
    if (f.ready) body += box(f.ready, '완료', f.ready.thanks, `<button class="btn-main" data-qact="turnin:${f.ready.id}">보상 받기</button>`);
    else if (f.offer) body += box(f.offer, '새 퀘스트', f.offer.intro, `<button class="btn-main" data-qact="accept:${f.offer.id}">수락</button>`);
    else if (f.active) body += box(f.active, '진행 중', f.active.intro);
    if (n.id === 'captain' && this.bountyOpen()) {
      const b = player.bounty;
      body += `<div class="quest-box bounty"><div class="quest-label">현상금 (되풀이)</div>`;
      if (!b) body += `<p class="quest-text">현상금 일을 맡겠나? 해치울 때마다 골드와 장비를 주지. 열 번째마다 기술도 하나 가르쳐 주마.</p><button class="btn-main" data-qact="bounty:new">현상금 받기</button>`;
      else {
        body += `<div class="quest-name">${this.bountyGoal(b)}</div><div class="quest-goal">진행: ${Math.min(b.have, b.n)} / ${b.n}</div>`
          + `<div class="quest-reward">보상: ${b.gold.toLocaleString()} 골드 · 경험치 · ${b.rarity === 2 ? '레어' : '마법'} 아이템${(player.bountyDone || 0) % 10 === 9 ? ' · 기술 카드' : ''}</div>`;
        body += b.s === 'ready' ? `<button class="btn-main" data-qact="bounty:turnin">보상 받기</button>` : `<button data-qact="bounty:drop">포기하기</button>`;
      }
      body += `<div class="quest-sub">완료한 현상금 ${player.bountyDone || 0}건</div></div>`;
    }
    if (!body) body = hint('지금은 부탁할 일이 없습니다.');
    return { body, foot };
  },
  onClick(act) {
    const [a, id] = act.split(':');
    if (a === 'accept') this.accept(id);
    else if (a === 'turnin') this.turnIn(id);
    else if (a === 'bounty') { if (id === 'new') this.newBounty(); else if (id === 'turnin') this.bountyTurnIn(); else this.bountyDrop(); }
  },
  // HUD에 띄울 진행 중 퀘스트 (최대 3줄)
  trackerLines() {
    const p = player, out = [];
    if (!p || !p.quests) return out;
    for (const q of QUESTS) {
      const s = p.quests[q.id];
      if (!s || s.s === 'done') continue;
      out.push({ text: s.s === 'ready' ? `${q.name}: 완료! 마을로` : this.progressText(q), ready: s.s === 'ready' });
    }
    const b = p.bounty;
    if (b) out.push({ text: b.s === 'ready' ? '현상금: 완료! 마을로' : `현상금: ${this.bountyGoal(b).replace(/ \d+(마리|개) (처치|열기|부수기)$/, '')} ${Math.min(b.have, b.n)} / ${b.n}`, ready: b.s === 'ready' });
    return out.slice(0, 4);
  },
  // 캐릭터 창 목록
  logHtml() {
    const p = player, rows = [];
    for (const q of QUESTS) {
      const s = p.quests && p.quests[q.id];
      if (!s) continue;
      const giver = TOWN_NPCS.find(n => n.id === q.giver);
      rows.push(`<li class="quest-row ${s.s}"><b>${q.name}</b> <small>${giver ? giver.name : ''}</small><span>${s.s === 'done' ? '완료' : s.s === 'ready' ? '보고하기' : this.progressText(q)}</span></li>`);
    }
    if (p.bounty) rows.push(`<li class="quest-row ${p.bounty.s}"><b>현상금</b> <small>경비대장 에드릭</small><span>${this.bountyGoal(p.bounty)} ${Math.min(p.bounty.have, p.bounty.n)} / ${p.bounty.n}</span></li>`);
    return rows.length ? rows.join('') : '<li class="detail-empty">아직 받은 퀘스트가 없습니다. 마을 사람 머리 위의 <b>!</b> 표시를 찾아보세요.</li>';
  },
};

// 물약 최대 개수 (퀘스트 보상으로 늘어남)
function maxPotions() { return MAX_POTIONS + ((player && player.potionCap) || 0); }
