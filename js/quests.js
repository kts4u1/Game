'use strict';
// ───────── 퀘스트: 마을 사람들의 부탁(이야기 퀘스트)과 경비대장의 현상금 ─────────
// 진행 상태는 player.quests[id] = { s: 'active' | 'ready' | 'done', n: 진행 수 }
// 목표 종류: kill(조건에 맞는 몬스터 처치) · boss(그 층 보스 처치) · item(퀘스트 물건 찾기) · gems(보석 가져가기)

const QUESTS = [
  { id: 'farm', giver: 'farmer', name: '밭을 되찾아 주세요',
    intro: '밤마다 해골과 좀비가 밭을 짓밟고 다녀요. 던전의 망자 25마리만 쓰러뜨려 주세요. 그럼 다시 씨를 뿌릴 수 있을 거예요.',
    thanks: '정말 고마워요! 제가 모아 둔 돈이랑 물약이에요. 조심히 다녀오세요.',
    goal: { kind: 'kill', tag: 'undead', n: 25, text: '망자 처치' }, reward: { gold: 250, potions: 3, xp: 0.5 } },
  { id: 'ants', giver: 'hunter', minDeepest: 2, name: '개미귀신 사냥',
    intro: '땅속 개미귀신들 때문에 사냥감이 씨가 말랐어. 개미 종류 20마리를 잡아 줘. 제대로 된 장화를 하나 줄게.',
    thanks: '하하, 이제야 숨통이 트이네. 약속한 장화야. 발밑을 조심하라고.',
    goal: { kind: 'kill', tag: 'ant', n: 20, text: '개미귀신 처치' }, reward: { gold: 400, item: { rarity: 2, slot: 'boots' }, xp: 0.5 } },
  { id: 'butcher', giver: 'captain', name: '계단을 지키는 자',
    intro: '5층 계단을 지키는 놈이 있다. 그놈을 쓰러뜨려야 더 깊이 내려갈 수 있지. 해내면 내가 아는 싸움 기술 하나를 가르쳐 주마.',
    thanks: '훌륭하다. 이제 너를 진짜 전사로 인정하지. 약속한 기술이다. 그리고 앞으로는 현상금 일도 맡길 수 있겠군.',
    goal: { kind: 'boss', floor: 5, text: '5층 보스 처치' }, reward: { gold: 600, skill: 1 } },
  { id: 'ring', giver: 'widow', after: 'butcher', name: '남편의 반지',
    intro: '남편이 6층 아래로 내려간 뒤로 소식이 없어요. 이름 있는 정예 놈이 그이의 반지를 끼고 다닌다는 소문을 들었어요. 반지만이라도… 돌려받고 싶어요.',
    thanks: '이 반지… 맞아요, 그이 거예요. 고마워요, 정말로. 이건 그이가 아끼던 반지예요. 당신이 써 주세요.',
    goal: { kind: 'item', from: 'elite', minFloor: 6, base: 'quest_ring', itemName: '엘사 남편의 반지', flavor: '안쪽에 두 사람의 이름이 새겨져 있다.', text: '남편의 반지 찾기 (6층 아래 이름 있는 정예)' },
    reward: { gold: 800, item: { rarity: 2, slot: 'ring' }, xp: 0.5 } },
  { id: 'gems', giver: 'refiner', minDeepest: 6, name: '반짝이는 것',
    intro: '끼끼! 반짝이는 보석 세 개만 가져다줘. 종류는 아무거나! 쿠루가 아주 특별한 부적을 만들어 줄게, 끼끼.',
    thanks: '끼끼끼! 예쁘다, 예뻐! 약속한 부적이야. 부적 주머니에 넣어 둬.',
    goal: { kind: 'gems', n: 3, text: '보석 가져가기' }, reward: { gold: 300, item: { rarity: 2, slot: 'charm' } } },
  { id: 'hammer', giver: 'smith', after: 'butcher', minDeepest: 8, name: '잃어버린 망치',
    intro: '할아버지께 물려받은 망치를 10층 보스 놈이 빼앗아 갔다네. 되찾아 주면 자네 장비에 소켓을 두 번 공짜로 뚫어 주지.',
    thanks: '오오, 이 무게! 틀림없군. 고맙네. 약속대로 소켓 두 번은 공짜야. 언제든 가져오게.',
    goal: { kind: 'item', from: 'boss', floor: 10, base: 'quest_hammer', itemName: '브론 할아버지의 망치', flavor: '손잡이가 손때로 반질반질하다.', text: '브론의 망치 되찾기 (10층 보스)' },
    reward: { gold: 500, freeSocket: 2 } },
  { id: 'plague', giver: 'healer', after: 'hammer', name: '역병의 근원',
    intro: '독에 쓰러지는 사람이 늘고 있어요. 15층의 보스가 역병을 퍼뜨리고 있대요. 쓰러뜨려 주면 물약을 더 많이 들 수 있는 주머니를 지어 줄게요.',
    thanks: '이제 마을 사람들도 나을 거예요. 약속한 물약 주머니예요. 물약을 4개 더 들 수 있어요.',
    goal: { kind: 'boss', floor: 15, text: '15층 보스 처치' }, reward: { gold: 1000, potionCap: 4, potions: 4 } },
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
];
const QUEST_INDEX = Object.fromEntries(QUESTS.map(q => [q.id, q]));

// kill 목표의 몬스터 조건
const QUEST_TAGS = {
  undead: m => !!MONSTERS[m.type].undead,
  ant: m => ['antlion', 'antlion_small', 'antlion_armored', 'fire_ant', 'ice_ant'].includes(MONSTERS[m.type].sprite),
  human: m => !!MONSTERS[m.type].gear,
};

const Quests = {
  st(id) { return (player.quests || (player.quests = {}))[id] || null; },
  isDone(id) { const s = this.st(id); return !!s && s.s === 'done'; },
  // 이 퀘스트를 지금 받을 수 있는지
  canOffer(q) {
    if (this.st(q.id)) return false;
    if (q.after && !this.isDone(q.after)) return false;
    if (q.minDeepest && Math.max(...Game.deepestBy()) < q.minDeepest) return false;
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
    if (g.kind === 'kill') return [Math.min(s.n, g.n), g.n];
    if (g.kind === 'gems') return [Math.min(this.gemCount(), g.n), g.n];
    return [s.s === 'ready' || s.s === 'done' ? 1 : 0, 1];
  },
  gemCount() { return player.inventory.filter(it => it && it.slot === 'gem').length; },
  progressText(q) {
    const [a, b] = this.progress(q);
    return b > 1 ? `${q.goal.text} ${a} / ${b}` : `${q.goal.text}${a ? ' ✓' : ''}`;
  },

  accept(id) {
    const q = QUEST_INDEX[id];
    if (!q || !this.canOffer(q)) return;
    player.quests[id] = { s: 'active', n: 0 };
    UI.message(`퀘스트 수락: ${q.name}`, '#ffd36a');
    SFX.play('click');
    this.check(q);
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
    UI.message(`퀘스트 완료: ${q.name} — 마을의 ${giver ? giver.name : ''}에게 돌아가세요`, '#ffd36a');
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
    if (r.item) {
      const it = generateItem(p.level + 2, r.item.rarity, r.item.slot ? { slot: r.item.slot } : {});
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
    if (r.item) t.push(r.item.rarity >= 3 ? '유니크 아이템' : `레어 ${SLOT_NAMES[r.item.slot] || '아이템'}`);
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
      else if (g.kind === 'boss' && m.tier === 3 && world.floor === g.floor) this.ready(q);
      else if (g.kind === 'item' && !this.hasQuestItem(q.id)) {
        const ok = g.from === 'boss' ? m.tier === 3 && world.floor === g.floor : m.tier === 2 && world.floor >= g.minFloor;
        if (ok) spawnGround('item', m.x, m.y, { item: this.questItem(q) });
      }
    }
    // 현상금
    const b = p.bounty;
    if (b && b.s === 'active') {
      const hit = b.kind === 'type' ? m.type === b.target && !m.summoned : b.kind === 'elite' ? m.tier === 1 || m.tier === 2 : m.tier === 3;
      if (hit) { b.have++; if (b.have >= b.n) { b.s = 'ready'; UI.message('현상금 완료 — 마을의 경비대장 에드릭에게 돌아가세요', '#ffd36a'); SFX.play('levelup', 0.5); } }
    }
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
    const kinds = ['type', 'type', 'type', 'elite', deep >= 5 ? 'boss' : 'type'];
    const kind = pick(kinds);
    let target = null, n;
    if (kind === 'type') {
      const cands = Object.keys(MONSTERS).filter(t => {
        const T = MONSTERS[t];
        return T.weight > 0 && T.minFloor <= deep && (!T.maxFloor || T.maxFloor >= deep - 6) && !T.stationary;
      });
      target = pick(cands);
      n = MONSTERS[target].pack && MONSTERS[target].pack[0] >= 5 ? randInt(30, 45) : randInt(14, 24);
    } else n = kind === 'elite' ? randInt(8, 14) : 1;
    const k = 1 + (p.bountyDone || 0) * 0.02;
    p.bounty = { kind, target, n, have: 0, s: 'active', gold: Math.round((180 + lvl * 40) * k), xp: 0.35, rarity: chance(0.25) ? 2 : 1 };
    UI.message(`현상금 수락: ${this.bountyGoal(p.bounty)}`, '#ffd36a');
    Game.save();
  },
  bountyGoal(b) {
    if (b.kind === 'type') return `${MONSTERS[b.target].name} ${b.n}마리 처치`;
    if (b.kind === 'elite') return `정예(파란·황금 이름) ${b.n}마리 처치`;
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
    if (b) out.push({ text: b.s === 'ready' ? '현상금: 완료! 마을로' : `현상금: ${this.bountyGoal(b).replace(/ \d+마리 처치$/, '')} ${Math.min(b.have, b.n)} / ${b.n}`, ready: b.s === 'ready' });
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
