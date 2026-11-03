'use strict';
// ───────── 용병 ─────────
// 마을의 경비대장 에드릭에게서 골드를 내고 고용. 주인을 따라다니며 싸우고, 주인이 얻는 경험치만큼 함께 레벨이 오름(주인 레벨까지).
// 장비 칸: 무기·갑옷·투구(검사·전투 사제는 방패도). 쓰러지면 마을에서 골드를 내고 되살림.
// 저장되는 값: type, name, level, xp, life, dead, equipment. 나머지(위치, 목표, 쿨타임 …)는 그때그때 만듦

// life·dmg: 1레벨 값과 레벨마다 늘어나는 비율(몬스터처럼 레벨이 높을수록 가파르게). armor: [1레벨, 레벨당]
const MERC_TYPES = {
  sword: {
    name: '검사', icon: 122, life: 100, dmg: [4, 7], armor: [18, 6], aps: 1.1, range: 52, ranged: false,
    desc: '방패를 든 근접 전사. 생명력과 방어력이 높아 앞에서 버텨 주고, 몇 초마다 방패로 쳐서 적을 기절시킵니다.',
    skill: '방패 강타: 6초마다 다음 공격이 피해 150%, 1.2초 기절',
    slots: ['weapon', 'shield', 'armor', 'helm'], tint: [150, 182, 255],
    gear: { head: 'chain_coif', chest: 'chain_cuirass', legs: 'chain_greaves', hands: 'chain_gloves', feet: 'chain_boots', main: 'longsword', off: 'kite_shield' },
  },
  thrower: {
    name: '투척수', icon: 96, life: 65, dmg: [3, 6], armor: [8, 3], aps: 1.05, range: 330, ranged: true,
    desc: '멀리서 단검을 던지는 사냥꾼. 몸은 약하지만 뒤에서 꾸준히 피해를 주고, 몇 초마다 단검 세 자루를 한꺼번에 던집니다.',
    skill: '부채 던지기: 5초마다 단검 3자루를 부채꼴로',
    slots: ['weapon', 'armor', 'helm'], tint: [178, 240, 158],
    gear: { head: 'leather_hood', chest: 'leather_chest', legs: 'leather_pants', hands: 'leather_gloves', feet: 'leather_boots', main: 'dagger' },
  },
  priest: {
    name: '전투 사제', icon: 111, life: 80, dmg: [3, 6], armor: [12, 4.5], aps: 1.0, range: 52, ranged: false,
    desc: '철퇴를 든 사제. 곁에 있으면 주인과 자신의 생명력이 계속 회복되고, 주인이 위험하면 치유 기도를 올립니다.',
    skill: '회복의 기운: 주인과 사제의 초당 생명력 회복 / 치유 기도: 14초마다 위급할 때 생명력 25% 회복',
    slots: ['weapon', 'shield', 'armor', 'helm'], tint: [255, 222, 150],
    gear: { head: 'plate_helm', chest: 'plate_cuirass', legs: 'plate_greaves', hands: 'plate_gauntlets', feet: 'plate_boots', main: 'mace', off: 'buckler' },
  },
};
const MERC_SCALE = 0.95;  // 주인보다 조금 작게
const MERC_NAMES = ['로드릭', '가레스', '브란', '울릭', '하콘', '토르빈', '에이릭', '스벤', '라그나', '비고르', '알도', '케일', '군나르', '시그문드', '레아', '이델'];
const MERC_SLOT_NAMES = { weapon: '무기', shield: '방패', armor: '갑옷', helm: '투구' };

const Merc = {
  // 지금 이 층에서 싸울 수 있는 용병 (없거나 쓰러졌으면 null)
  active() {
    const m = player && player.merc;
    return m && !m.dead && m.x != null ? m : null;
  },
  hireCost(L) { return Math.round(150 + 25 * Math.pow(L, 1.5)); },
  reviveCost(m) { return Math.min(50000, Math.round(this.hireCost(m.level) * 0.4)); },
  // 레벨에 따른 성장 배율 (몬스터 생명력·피해가 오르는 모양과 비슷하게)
  growth(L, a, b) { const k = L - 1; return 1 + a * k + b * k * k; },

  hire(type) {
    const p = player, T = MERC_TYPES[type];
    if (!T) return;
    const L = p.level, cost = this.hireCost(L);
    if (p.merc && !p.merc.dead) { UI.message('이미 용병이 있습니다', '#ff7a6a'); return; }
    if (p.gold < cost) { UI.message('골드가 부족합니다', '#ff7a6a'); SFX.play('nope'); return; }
    // 쓰러진 용병의 장비는 가방(가득 차면 바닥)으로 돌려받음
    if (p.merc) this.returnGear(p.merc);
    p.gold -= cost;
    p.merc = { type, name: pick(MERC_NAMES), level: L, xp: 0, life: 0, dead: false, equipment: {} };
    this.recalc();
    p.merc.life = p.merc.stats.maxLife;
    this.place();
    SFX.play('levelup', 0.6);
    UI.message(`${T.name} ${p.merc.name}을(를) 고용했습니다`, '#9fe39a');
    Game.save();
  },
  fire() {
    const p = player, m = p.merc;
    if (!m) return;
    this.returnGear(m);
    UI.message(`${m.name}이(가) 떠났습니다`, '#c9c1b3');
    p.merc = null;
    Game.save();
  },
  revive() {
    const p = player, m = p.merc;
    if (!m || !m.dead) return;
    const cost = this.reviveCost(m);
    if (p.gold < cost) { UI.message('골드가 부족합니다', '#ff7a6a'); SFX.play('nope'); return; }
    p.gold -= cost;
    m.dead = false;
    this.recalc();
    m.life = m.stats.maxLife;
    this.place();
    fxSprite('heal', m.x, m.y, { follow: m, scale: 0.9 });
    SFX.play('potion');
    UI.message(`${m.name}이(가) 다시 일어났습니다`, '#9fe39a');
    Game.save();
  },
  returnGear(m) {
    for (const k in m.equipment) {
      const it = m.equipment[k];
      if (!it) continue;
      const i = player.inventory.indexOf(null);
      if (i >= 0) player.inventory[i] = it; else spawnGround('item', player.x, player.y, { item: it });
    }
    m.equipment = {};
  },

  // ── 능력치: 기본값(종류·레벨) + 장비 ──
  recalc() {
    const m = player.merc;
    if (!m) return;
    const T = MERC_TYPES[m.type], L = m.level;
    const s = { life: 0, lifePct: 0, armor: 0, armorPct: 0, dmgPct: 0, dmgFlat: 0, ias: 0, crit: 5, critDmg: 50, lifeSteal: 0, lifeRegen: 0, resAll: 0, block: 0, moveSpeed: 0, edef: 0 };
    let wmin = 0, wmax = 0;
    for (const k in m.equipment) {
      const it = m.equipment[k];
      if (!it) continue;
      if (it.dmg) { wmin = it.dmg[0]; wmax = it.dmg[1]; }
      if (it.def) s.armor += it.def;
      if (it.block) s.block += it.block;
      for (const a of it.affixes || []) if (a.stat !== 'skill' && !a.local) s[a.stat] = (s[a.stat] || 0) + a.value;
      if (it.gems) for (const g of it.gems) { const [st, v] = gemStat(g, it.slot); s[st] = (s[st] || 0) + v; }
    }
    const gl = this.growth(L, 0.1, 0.004), gd = this.growth(L, 0.2, 0.006);
    s.maxLife = Math.round((T.life * gl + s.life) * (1 + s.lifePct / 100));
    const dm = 1 + s.dmgPct / 100;
    s.minDmg = Math.round((T.dmg[0] * gd + wmin * 0.8 + s.dmgFlat) * dm);
    s.maxDmg = Math.max(s.minDmg + 1, Math.round((T.dmg[1] * gd + wmax * 0.8 + s.dmgFlat) * dm));
    s.armorTotal = Math.round((T.armor[0] + T.armor[1] * L + s.armor) * (1 + s.armorPct / 100));
    s.aps = T.aps * (1 + Math.min(60, s.ias) / 100);
    s.speed = 195 * (1 + Math.min(40, s.moveSpeed) / 100);
    s.lifeSteal = Math.min(15, s.lifeSteal);
    s.crit = Math.min(50, s.crit);
    s.res = Math.min(75, s.resAll) + (DIFFICULTIES[player.difficulty || 0].res || 0);
    s.block = m.equipment.shield ? Math.min(40, s.block) : 0;
    // 전투 사제의 회복 기운 (주인과 자신)
    s.aura = m.type === 'priest' ? Math.round(2 + L * 0.6 + L * L * 0.012) : 0;
    s.lifeRegenTotal = s.lifeRegen + s.aura;
    m.stats = s;
    m.life = Math.min(m.life || 0, s.maxLife);
    m.r = 14;
  },
  xpNeed(L) { return xpToNext(L); },
  // 주인이 얻은 경험치만큼 (주인 레벨을 넘지는 않음)
  gainXp(n) {
    const m = player.merc;
    if (!m || m.dead) return;
    if (m.level >= player.level) { m.xp = 0; return; }
    m.xp += n;
    let up = false;
    while (m.level < player.level && m.xp >= this.xpNeed(m.level)) { m.xp -= this.xpNeed(m.level); m.level++; up = true; }
    if (m.level >= player.level) m.xp = 0;
    if (up) {
      this.recalc();
      m.life = m.stats.maxLife;
      if (m.x != null) { fxSprite('sparkle', m.x, m.y, { follow: m, life: 1.2, fade: 0.5 }); fxText(m.x, m.y, `용병 레벨 ${m.level}`, '#9fe39a', 14, { z: 80 }); }
    }
  },

  // ── 장비 ──
  canWear(it, slot) {
    const m = player.merc, T = m && MERC_TYPES[m.type];
    if (!T || !it) return false;
    const s = slot || it.slot;
    if (!T.slots.includes(s) || it.slot !== s) return false;
    if (s === 'shield' && m.equipment.weapon && isTwoHanded(m.equipment.weapon)) return false;
    return (it.req || 1) <= m.level;
  },
  equipFromInv(i) {
    const it = player.inventory[i];
    if (it) this.move({ c: 'inv', i }, { c: 'merc', k: it.slot });
  },
  // 소지품 창의 용병 장비 칸과 가방·보관함·내 장비 칸 사이에서 물건을 옮김 (끌어다 놓기, 옮기기 버튼, 맡기기 버튼 공용)
  move(from, to) {
    const p = player, m = p.merc;
    if (!m) return false;
    const a = itemAt(from), b = itemAt(to);
    if (!a) return false;
    const T = MERC_TYPES[m.type];
    const nope = msg => { if (msg) UI.message(msg, '#ff7a6a'); SFX.play('nope'); return false; };
    const freeInv = () => p.inventory.indexOf(null);
    if (to.c === 'merc') {
      if (from.c === 'merc') return nope();
      if (m.dead) return nope('쓰러진 용병에게는 장비를 맡길 수 없습니다. 마을의 경비대장에게서 되살리세요');
      if (a.slot !== to.k || !T.slots.includes(to.k)) return nope(`용병의 ${MERC_SLOT_NAMES[to.k] || ''} 칸에는 ${MERC_SLOT_NAMES[to.k] || '맞는 물건'}만 넣을 수 있습니다`);
      if ((a.req || 1) > m.level) return nope(`용병 레벨 ${a.req}부터 쓸 수 있습니다 (지금 ${m.level})`);
      if (to.k === 'shield' && m.equipment.weapon && isTwoHanded(m.equipment.weapon)) return nope('양손 무기를 든 용병은 방패를 쓸 수 없습니다');
      const bump = to.k === 'weapon' && isTwoHanded(a) && m.equipment.shield ? m.equipment.shield : null;
      // 용병이 쓰던 물건이 돌아갈 자리: 원래 자리(내 장비 칸이면 착용할 수 있을 때만), 아니면 가방 빈칸
      const backHere = !b || from.c !== 'eq' || (fitsKey(b, from.k) && canEquip(b));
      const need = (bump ? 1 : 0) + (backHere ? 0 : 1);
      if (need && p.inventory.filter(x => !x).length + (from.c === 'inv' && !backHere ? 1 : 0) < need) return nope('가방이 가득 찼습니다');
      putAt(from, backHere ? b : null);
      m.equipment[to.k] = a;
      if (!backHere) p.inventory[freeInv()] = b;
      if (bump) { m.equipment.shield = null; p.inventory[freeInv()] = bump; UI.message('양손 무기를 들어서 방패는 가방으로 옮겼습니다', '#c9c1b3'); }
      if (from.c === 'eq') afterEquipChange(b); else SFX.equip(a);
      this.recalc();
      Game.dirty = true;
      return true;
    }
    if (from.c === 'merc') {
      if (to.c === 'charm') return nope('부적 주머니에는 부적만 넣을 수 있습니다');
      if (to.c === 'eq') {
        // 용병의 물건을 바로 내가 착용 (빈 칸일 때)
        if (!fitsKey(a, to.k)) return nope(`${SLOT_NAMES[a.slot]}은(는) 그 칸에 착용할 수 없습니다`);
        if (!canEquip(a)) { cantEquipMsg(a); return false; }
        if (b) return nope('먼저 착용 중인 물건을 벗거나, 용병의 물건을 가방으로 옮긴 뒤 착용하세요');
        if ((to.k === 'weapon' && isTwoHanded(a) && p.equipment.shield) || (to.k === 'shield' && p.equipment.weapon && isTwoHanded(p.equipment.weapon))) return nope('양손 무기와 방패는 함께 들 수 없습니다');
        putAt(to, a); putAt(from, null);
        afterEquipChange(a);
        this.recalc();
        return true;
      }
      // 가방·보관함으로: 그 칸의 물건을 용병이 쓸 수 있으면 맞바꾸고, 아니면 같은 곳의 빈칸으로
      const swap = b && !m.dead && b.slot === from.k && (b.req || 1) <= m.level && !(from.k === 'shield' && m.equipment.weapon && isTwoHanded(m.equipment.weapon))
        && !(from.k === 'weapon' && isTwoHanded(b) && m.equipment.shield);
      if (!b || swap) { putAt(to, a); putAt(from, swap ? b : null); }
      else {
        const list = listOf(to.c), free = list.indexOf(null);
        if (free < 0) return nope(to.c === 'inv' ? '가방이 가득 찼습니다' : '보관함이 가득 찼습니다');
        list[free] = a; putAt(from, null);
      }
      SFX.equip(a);
      this.recalc();
      Game.dirty = true;
      return true;
    }
    return false;
  },
  unequip(slot) {
    const p = player, m = p.merc;
    if (!m || !m.equipment[slot]) return false;
    const k = p.inventory.indexOf(null);
    if (k < 0) { UI.message('가방이 가득 찼습니다', '#ff7a6a'); SFX.play('nope'); return false; }
    p.inventory[k] = m.equipment[slot];
    m.equipment[slot] = null;
    SFX.equip(p.inventory[k]);
    this.recalc();
    Game.dirty = true;
    return true;
  },
  // 가방의 물건을 용병이 쓸 수 있는 칸 (없으면 null)
  slotFor(it) {
    const m = player.merc;
    return m && it && MERC_TYPES[m.type].slots.includes(it.slot) ? it.slot : null;
  },

  // ── 층에 들어갈 때 주인 옆에 세움 ──
  place() {
    const m = player.merc;
    if (!m || m.dead || !world) { if (m) m.x = null; return; }
    this.recalc();
    const d = world.dungeon, p = player;
    const spot = d.freeSpot(p.x - 46, p.y + 34, 14) || { x: p.x, y: p.y };
    Object.assign(m, { x: spot.x, y: spot.y, facing: p.facing || 0, moving: false, walkPhase: 0, path: null, target: null, atk: null, atkCD: 0.5, cd: m.cd || {},
      hurtT: 0, calmT: 0, pose: null, poseT: 0, slowT: 0, stuck: 0, think: 0 });
    if (!m.cd.skill) m.cd.skill = 3;
    if (!m.cd.prayer) m.cd.prayer = 4;
    this.warm(m);
  },

  // ── 매 프레임 ──
  update(dt) {
    const m = this.active(), p = player;
    if (!m) return;
    const s = m.stats, d = world.dungeon;
    m.atkCD -= dt; m.hurtT = Math.max(0, m.hurtT - dt); m.calmT += dt; m.think -= dt;
    for (const k in m.cd) m.cd[k] -= dt;
    if (m.poseT > 0) { m.poseT -= dt; if (m.poseT <= 0) m.pose = null; }
    // 회복: 싸우지 않을 때는 빠르게
    const regen = (m.calmT > 4 ? s.maxLife * 0.02 : s.maxLife * 0.004) + s.lifeRegenTotal;
    m.life = Math.min(s.maxLife, m.life + regen * dt);
    // 전투 사제: 곁에 있는 주인에게도 회복 기운, 위급하면 치유 기도
    if (m.type === 'priest' && !p.dead && dist(m.x, m.y, p.x, p.y) < 450) {
      if (!world.town) healPlayer(s.aura * dt);
      if (m.cd.prayer <= 0 && (p.life < p.stats.maxLife * 0.55 || m.life < s.maxLife * 0.4) && !world.town) {
        m.cd.prayer = 14;
        healPlayer(p.stats.maxLife * 0.25);
        m.life = Math.min(s.maxLife, m.life + s.maxLife * 0.25);
        fxSprite('heal', p.x, p.y, { follow: p, scale: 1 });
        fxSprite('heal', m.x, m.y, { follow: m, scale: 0.8 });
        fxRing(m.x, m.y, 10, 150, 0.7, '#9fe39a', 4);
        SFX.play('potion', 0.7);
        m.pose = 'cast'; m.poseT = 0.5;
        fxText(m.x, m.y, '치유 기도', '#9fe39a', 14, { z: 80 });
      }
    }
    // 휘두르는 중
    if (m.atk) { this.updateSwing(m, dt); return; }
    const dp = dist(m.x, m.y, p.x, p.y);
    // 너무 멀어지면(계단 아래·벽 너머) 주인 곁으로 순간이동
    if (dp > 1300 || (world.town && dp > 900)) { this.place(); return; }
    if (world.town || p.dead) { this.follow(m, dp, dt); return; }
    // 목표 고르기 (0.25초마다)
    if (m.think <= 0) { m.think = 0.25; m.target = this.pickTarget(m, dp); }
    const t = m.target;
    // 주인에게서 너무 멀어지면 싸움을 그만두고 돌아감 (적 무리를 끌고 오지 않게)
    if (!t || t.dead || !hittable(t) || dp > 520 || dist(p.x, p.y, t.x, t.y) > 480) { m.target = null; this.follow(m, dp, dt); return; }
    const dt2 = dist(m.x, m.y, t.x, t.y);
    m.calmT = 0;
    if (MERC_TYPES[m.type].ranged) {
      const T = MERC_TYPES[m.type];
      if (dt2 <= T.range && d.clearPath(m.x, m.y, t.x, t.y, 4)) {
        m.facing = angleTo(m.x, m.y, t.x, t.y);
        m.moving = false;
        if (dt2 < 110) {
          // 너무 가까우면 한 발 물러남
          const a = angleTo(t.x, t.y, m.x, m.y);
          d.moveCircle(m, Math.cos(a) * s.speed * 0.7 * dt, Math.sin(a) * s.speed * 0.7 * dt);
          m.moving = true; m.walkPhase += s.speed * 0.7 * dt * 0.09;
        }
        if (m.atkCD <= 0) this.throwAt(m, t);
      } else navigate(m, t.x, t.y, dt, 40);
    } else {
      const reach = MERC_TYPES[m.type].range + t.r;
      if (dt2 <= reach) {
        m.facing = angleTo(m.x, m.y, t.x, t.y);
        m.moving = false;
        if (m.atkCD <= 0) m.atk = { t: 0, dur: Math.max(0.28, 0.5 / (s.aps / MERC_TYPES[m.type].aps)), target: t, hit: false };
      } else navigate(m, t.x, t.y, dt, reach - 6);
    }
  },
  // 싸울 상대: 주인 가까이 있는 적을 먼저 (주인을 지킴)
  pickTarget(m, dp) {
    const p = player, d = world.dungeon;
    let best = null, bs = Infinity;
    for (const o of world.monsters) {
      if (!hittable(o) || o.ambushWait) continue;
      const dm = dist(m.x, m.y, o.x, o.y), dpl = dist(p.x, p.y, o.x, o.y);
      if (dm > 420 || dpl > 420) continue;
      // 아직 싸움에 끼지 않은 적은 아주 가까울 때만 (먼저 달려들어 무리를 끌어오지 않게)
      if (!o.aggro && dm > 170 && dpl > 200) continue;
      const sc = dm * 0.7 + dpl - (o === m.target ? 60 : 0) - (o.tgt === m ? 80 : 0) - (o.tgt === p ? 60 : 0);
      if (sc >= bs) continue;
      if (!d.los(m.x, m.y, o.x, o.y)) continue;
      best = o; bs = sc;
    }
    return best;
  },
  follow(m, dp, dt) {
    const p = player;
    if (dp < 130) { m.moving = false; m.path = null; return; }
    // 멀면 조금 더 빨리 뛰어서 따라붙음
    const base = m.stats.speed;
    m.stats.speed = dp > 360 ? base * 1.45 : base;
    const a = (p.facing || 0) + Math.PI * 0.8;
    const tx = p.x + Math.cos(a) * 70, ty = p.y + Math.sin(a) * 70;
    const d = world.dungeon;
    if (!d.circleBlocked(tx, ty, m.r)) navigate(m, tx, ty, dt, 30); else navigate(m, p.x, p.y, dt, 90);
    m.stats.speed = base;
  },
  updateSwing(m, dt) {
    const a = m.atk, T = MERC_TYPES[m.type];
    a.t += dt;
    m.moving = false;
    if (a.target && !a.target.dead) m.facing = angleTo(m.x, m.y, a.target.x, a.target.y);
    if (!a.hit && a.t >= a.dur * 0.55) {
      a.hit = true;
      const t = a.target;
      if (t && hittable(t) && dist(m.x, m.y, t.x, t.y) <= T.range + t.r + 24) {
        // 검사: 방패 강타
        if (m.type === 'sword' && m.cd.skill <= 0) {
          m.cd.skill = 6;
          this.strike(t, 1.5, { stun: 1.2 });
          fxText(m.x, m.y, '방패 강타', '#cfe8ff', 13, { z: 80 });
          fxSparks(t.x, t.y, 40, 10, '#e8eef8', 140);
          SFX.play('block', 0.7);
        } else this.strike(t, 1);
        fxSprite('cleave', t.x, t.y, { dir: flareDir(m.facing), scale: 0.65, alpha: 0.7 });
      }
    }
    if (a.t >= a.dur) { m.atk = null; m.atkCD = Math.max(0.05, 1 / m.stats.aps - a.dur); }  // 휘두르는 시간을 포함해 초당 공격 횟수를 맞춤
  },
  throwAt(m, t) {
    const n = m.cd.skill <= 0 ? 3 : 1;
    if (n === 3) { m.cd.skill = 5; fxText(m.x, m.y, '부채 던지기', '#cfe8ff', 13, { z: 80 }); }
    const base = angleTo(m.x, m.y, t.x, t.y);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.22;
      spawnProjectile({ owner: 'merc', type: 'knife', x: m.x + Math.cos(a) * 14, y: m.y + Math.sin(a) * 14, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540,
        r: 8, mult: n === 3 ? 0.85 : 1, life: 0.9, angle: a, pierce: 0 });
    }
    SFX.play('arrow', 0.5);
    m.pose = 'throw'; m.poseT = 0.3;
    m.atkCD = 1 / m.stats.aps;
  },
  // 용병의 한 방
  strike(t, mult, opts = {}) {
    const m = player.merc, s = m.stats;
    if (!hittable(t)) return 0;
    let dmg = rand(s.minDmg, s.maxDmg) * mult;
    const crit = Math.random() * 100 < s.crit;
    if (crit) dmg *= 1 + s.critDmg / 100;
    dmg = Math.max(1, Math.round(dmg));
    damageMonster(t, dmg, crit, { color: crit ? '#d8ff9a' : '#b8f0a8' });
    if (s.lifeSteal > 0) m.life = Math.min(s.maxLife, m.life + Math.min(dmg * s.lifeSteal / 100, s.maxLife * 0.08));
    if (!t.dead && opts.stun && !t.stationary) {
      t.stun = Math.max(t.stun, t.tier === 3 ? opts.stun * 0.3 : opts.stun);
      t.windup = 0; t.pending = null; t.windupDur = t.baseWindup;
    }
    SFX.play(crit ? 'crit' : 'hit', 0.45);
    return dmg;
  },
  // 몬스터에게 맞음
  damage(amount, src, opts = {}) {
    const m = this.active();
    if (!m || world.town) return false;
    const s = m.stats;
    if ((opts.melee || opts.proj) && s.block > 0 && chance(s.block / 100)) {
      fxText(m.x, m.y, '막기', '#d6e2f2', 13, { z: 64 });
      SFX.play('block', 0.5);
      return false;
    }
    const mlvl = src && src.mlvl ? src.mlvl : world.mlvl;
    const red = Math.min(0.7, s.armorTotal / (s.armorTotal + 50 + 20 * mlvl));
    const elem = opts.fire || opts.cold || opts.poisonHit || opts.magic;
    let dmg = elem ? amount * (1 - red * 0.4) * (1 - s.res / 100) : amount * (1 - red);
    dmg = Math.max(1, Math.round(dmg));
    m.life -= dmg;
    m.hurtT = 0.15;
    m.calmT = 0;
    fxText(m.x, m.y, `-${dmg}`, '#ffb070', 13, { z: 58 });
    fxBlood(m.x, m.y, 34, 3);
    if (src && opts.melee && src.lifeSteal && !src.dead) src.life = Math.min(src.maxLife, src.life + dmg * src.lifeSteal);
    if (m.life <= 0) this.die();
    return true;
  },
  die() {
    const m = player.merc;
    m.dead = true;
    m.life = 0;
    fxBlood(m.x, m.y, 30, 16);
    fxSprite('spark_red', m.x, m.y, { z: -10, scale: 1 });
    SFX.play('hurt', 0.8);
    UI.message(`용병 ${m.name}이(가) 쓰러졌습니다. 마을의 경비대장 에드릭에게서 되살릴 수 있습니다`, '#ff9a6a');
    for (const o of world.monsters) if (o.tgt === m) o.tgt = null;
    m.x = null;
    Game.dirty = true;
  },
  // 주인이 물약을 마시면 용병도 한 모금
  onPotion() {
    const m = this.active();
    if (!m || dist(m.x, m.y, player.x, player.y) > 600) return;
    m.life = Math.min(m.stats.maxLife, m.life + m.stats.maxLife * 0.4);
    fxSprite('heal', m.x, m.y, { follow: m, scale: 0.7, alpha: 0.8 });
  },

  // ── 그림 ──
  layers(m) {
    const T = MERC_TYPES[m.type], L = Object.assign({}, T.gear), eq = m.equipment;
    const tier = it => GEAR_TIER[it.look || 0];
    if (eq.helm) L.head = { leather: 'leather_hood', chain: 'chain_coif', plate: 'plate_helm' }[tier(eq.helm)];
    if (eq.armor) {
      L.chest = { leather: 'leather_chest', chain: 'chain_cuirass', plate: 'plate_cuirass' }[tier(eq.armor)];
      L.legs = { leather: 'leather_pants', chain: 'chain_greaves', plate: 'plate_greaves' }[tier(eq.armor)];
    }
    if (eq.weapon) L.main = baseLayer(eq.weapon) || WEAPON_LAYER[eq.weapon.icon] || L.main;
    if (eq.shield) L.off = baseLayer(eq.shield) || 'buckler';
    if (eq.weapon && isTwoHanded(eq.weapon)) L.off = null;
    return L;
  },
  assetPaths() {
    const m = player && player.merc;
    if (!m || !HAS_FLARE) return [];
    return Object.values(this.layers(m)).filter(n => n && FLARE.hero[n]).map(n => FLARE.hero[n].img);
  },
  pose(m, t) {
    const anims = FLARE.hero.default_chest.anims, dir = flareDir(m.facing || 0);
    const at = (name, k) => [name, Math.min(anims[name].n - 1, Math.floor(clamp(k, 0, 0.999) * anims[name].n)), dir];
    if (m.atk) return at('swing', m.atk.t / m.atk.dur);
    if (m.pose === 'throw') return at('swing', 1 - m.poseT / 0.3);
    if (m.pose === 'cast') return at('cast', 1 - m.poseT / 0.5);
    if (m.hurtT > 0 && !m.moving) return ['hit', 1, dir];
    if (m.moving) return ['run', Math.floor(m.walkPhase * 0.9) % anims.run.n, dir];
    return ['stance', animIndex(anims.stance, t * 1000 + 400), dir];
  },
  draw(ctx, m, t) {
    const sx = isoX(m.x, m.y), sy = isoY(m.x, m.y);
    // 발밑의 초록 고리: 내 편
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#7fe08a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(sx, sy, 20, 10, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    const ok = HAS_FLARE && Assets.ready(FLARE.hero.default_chest.img);
    if (ok) {
      const [anim, idx, dir] = this.pose(m, t);
      const cast = GFX.q.shadows ? shadowCast(m.x, m.y, false) : null;
      drawBlobShadow(ctx, sx, sy, 14, cast);
      // 갑옷·투구에 용병 종류의 색을 입혀(검사 푸른 강철, 투척수 숲빛, 사제 흰 금빛) 주인과 다르게 보이게
      const L = this.layers(m), col = this.tintCss(m);
      for (const slot of HERO_LAYER_ORDER[dir]) {
        let name = L[slot];
        if (name && (!FLARE.hero[name] || !Assets.ready(FLARE.hero[name].img))) name = HERO_FALLBACK[slot];
        if (!name) continue;
        const set = FLARE.hero[name], plain = slot === 'main' || slot === 'off';
        drawSpriteFrame(ctx, set, anim, dir, idx, sx, sy, MERC_SCALE, plain ? null : Assets.tintedAtlas(set.img, col));
      }
    } else {
      drawShadow(ctx, sx, sy, 14, 6, 0.4);
      ctx.fillStyle = '#5a6a4a'; ctx.fillRect(sx - 8, sy - 50, 16, 46);
      circle(ctx, sx, sy - 58, 8, '#c78c5d');
    }
    // 머리 위 이름과 생명력 막대
    const w = 38, k = clamp(m.life / m.stats.maxLife, 0, 1), y = sy - 90;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(sx - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = k > 0.5 ? '#5fd06a' : k > 0.25 ? '#e0c050' : '#e0503a';
    ctx.fillRect(sx - w / 2, y, w * k, 4);
    ctx.font = '600 11px ' + Game.fontUI;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 3;
    ctx.strokeText(m.name, sx, y - 4);
    ctx.fillStyle = '#b8f0a8'; ctx.fillText(m.name, sx, y - 4);
  },
  tintCss(m) { const c = MERC_TYPES[m.type].tint; return `rgb(${c[0]},${c[1]},${c[2]})`; },
  // 색을 입힌 그림은 처음 그릴 때 만들어지므로 층에 들어갈 때 미리 만들어 둠 (첫 화면에서 멈칫하지 않게)
  warm(m) {
    if (!HAS_FLARE) return;
    const col = this.tintCss(m), L = this.layers(m);
    for (const slot in L) {
      const set = L[slot] && FLARE.hero[L[slot]];
      if (!set || slot === 'main' || slot === 'off') continue;
      if (Assets.ready(set.img)) warmCanvas(Assets.tintedAtlas(set.img, col));
    }
  },

  // ── 저장 ──
  save() {
    const m = player.merc;
    if (!m) return null;
    return { type: m.type, name: m.name, level: m.level, xp: m.xp, life: Math.round(m.life), dead: m.dead, equipment: m.equipment };
  },
  load(d) {
    if (!d || !MERC_TYPES[d.type]) { player.merc = null; return; }
    player.merc = { type: d.type, name: d.name || pick(MERC_NAMES), level: d.level || 1, xp: d.xp || 0, life: d.life || 1, dead: !!d.dead, equipment: d.equipment || {} };
    this.recalc();
    if (!player.merc.dead && player.merc.life <= 0) player.merc.life = player.merc.stats.maxLife;
  },

  // ── 경비대장 창의 '용병' 탭 ──
  panelHtml() {
    const p = player, m = p.merc;
    const hint = t => `<p class="shop-hint">${t}</p>`;
    const gold = `<div class="inv-meta"><span>가진 골드</span><span class="gold">${p.gold.toLocaleString()} 골드</span></div>`;
    let body = gold;
    if (!m) {
      body += hint('경비대의 병사를 한 명 붙여 주지. 너를 따라다니며 싸우고, 네가 강해지는 만큼 함께 강해진다. 무기·갑옷·투구를 맡기면 그것도 쓴다.');
      const L = p.level, cost = this.hireCost(L);
      body += '<ul class="merc-list">' + Object.keys(MERC_TYPES).map(k => {
        const T = MERC_TYPES[k], gl = this.growth(L, 0.1, 0.004), gd = this.growth(L, 0.2, 0.006);
        return `<li class="merc-card"><div class="mc-head"><span class="sl-icon">${iconHtml(T.icon)}</span><div><div class="mc-name">${T.name}</div>`
          + `<div class="mc-sub">레벨 ${L} · 생명력 ${Math.round(T.life * gl)} · 피해 ${Math.round(T.dmg[0] * gd)}–${Math.round(T.dmg[1] * gd)}${T.ranged ? ' (원거리)' : ''}</div></div></div>`
          + `<p class="mc-desc">${T.desc}</p><p class="mc-skill">${T.skill}</p>`
          + `<button class="btn-main" data-mact="hire:${k}">고용하기 <small>${cost.toLocaleString()} 골드</small></button></li>`;
      }).join('') + '</ul>';
      return { body, foot: '' };
    }
    const T = MERC_TYPES[m.type], s = m.stats;
    const need = this.xpNeed(m.level), capped = m.level >= p.level;
    body += `<div class="merc-sheet"><div class="mc-head"><span class="sl-icon">${iconHtml(T.icon)}</span><div><div class="mc-name">${escapeHtml(m.name)} <small>${T.name}</small></div>`
      + `<div class="mc-sub">레벨 ${m.level}${capped ? ' (주인 레벨까지)' : ` · 경험치 ${Math.floor(m.xp).toLocaleString()} / ${need.toLocaleString()}`}</div></div></div>`;
    if (m.dead) {
      const cost = this.reviveCost(m);
      body += `<p class="mc-dead">쓰러져 있습니다.</p><button class="btn-main" data-mact="revive">되살리기 <small>${cost.toLocaleString()} 골드</small></button>`;
    } else {
      body += `<div class="mc-stats"><span>생명력 <b>${Math.round(m.life)} / ${s.maxLife}</b></span><span>피해 <b>${s.minDmg}–${s.maxDmg}</b></span>`
        + `<span>공격 속도 <b>${s.aps.toFixed(2)}</b>/초</span><span>방어력 <b>${s.armorTotal}</b></span><span>원소 저항 <b>${s.res}%</b></span>`
        + (s.lifeSteal ? `<span>생명력 흡수 <b>${s.lifeSteal}%</b></span>` : '') + (s.block ? `<span>막기 <b>${s.block}%</b></span>` : '')
        + (s.aura ? `<span>회복 기운 <b>초당 ${s.aura}</b></span>` : '') + `</div><p class="mc-skill">${T.skill}</p>`;
    }
    body += '</div><h3>장비</h3><ul class="shop-list">' + T.slots.map(k => {
      const it = m.equipment[k];
      return `<li><span class="sl-icon">${it ? itemIconHtml(it) : ''}</span><div class="sl-main"><div class="sl-name"${it ? ` style="color:${RARITY[it.rarity].color}"` : ''}>${it ? escapeHtml(itemName(it)) : '비어 있음'}</div>`
        + `<div class="sl-desc">${MERC_SLOT_NAMES[k]}</div></div><div class="sl-btns">${it ? `<button data-mact="unequip:${k}">빼기</button>` : ''}</div></li>`;
    }).join('') + '</ul>';
    if (!m.dead) {
      const cands = [];
      p.inventory.forEach((it, i) => { if (it && T.slots.includes(it.slot)) cands.push([it, i]); });
      body += '<h3>가방에서 맡기기</h3>' + hint('소지품 창의 아이템을 이 창이나 소지품 창의 용병 칸으로 끌어다 놓아도 맡길 수 있습니다. 던전에서도 소지품 창(I)에서 바꿀 수 있습니다.') + (cands.length ? '<ul class="shop-list">' + cands.map(([it, i]) => {
        const ok = this.canWear(it);
        const why = ok ? '' : (it.req > m.level ? `용병 레벨 ${it.req} 필요` : '방패를 쓸 수 없음 (양손 무기)');
        return `<li><span class="sl-icon">${itemIconHtml(it)}</span><div class="sl-main"><div class="sl-name" style="color:${RARITY[it.rarity].color}">${escapeHtml(itemName(it))}</div>`
          + `<div class="sl-desc">${MERC_SLOT_NAMES[it.slot]}${why ? ' · ' + why : ''}</div></div><div class="sl-btns"><button ${ok ? '' : 'disabled'} data-mact="equip:${i}">맡기기</button></div></li>`;
      }).join('') + '</ul>' : hint(`가방에 ${T.slots.map(k => MERC_SLOT_NAMES[k]).join('·')}가 없습니다.`));
    }
    const foot = `<div class="foot-btns"><button data-mact="${this.confirmFire ? 'fire!' : 'fire'}">${this.confirmFire ? '정말 내보내기 (장비는 돌려받음)' : '용병 내보내기'}</button></div>`;
    return { body, foot };
  },
  onClick(act) {
    const [a, v] = act.split(':');
    if (a !== 'fire') this.confirmFire = false;
    if (a === 'hire') this.hire(v);
    else if (a === 'revive') this.revive();
    else if (a === 'equip') this.equipFromInv(+v);
    else if (a === 'unequip') this.unequip(v);
    else if (a === 'fire') this.confirmFire = true;
    else if (a === 'fire!') { this.confirmFire = false; this.fire(); }
  },
};
