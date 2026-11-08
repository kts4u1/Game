'use strict';
// ───────── 플레이어: 능력치, 이동, 공격, 스킬, 소지품 ─────────

function createPlayer() {
  const p = {
    x: 0, y: 0, r: 14, z: 0, facing: 0.8, level: 1, xp: 0, life: 100, fury: 50, gold: 0, potions: 3, bonusLife: 0,
    skills: {}, hotbar: [null, null, null, null, null, null], cds: {}, difficulty: 0, deepestBy: [1, 1, 1], bonusDmg: 0, bonusArmor: 0,
    frenzy: { n: 0, t: 0 }, rampage: { n: 0, t: 0 }, rush: null, quests: {}, bounty: null, bountyDone: 0, freeSockets: 0, potionCap: 0, freeEnhance: 0, gambleDiscount: 0,
    mapSeed: randInt(1, 2000000000), merc: null,
    equipment: { weapon: null, shield: null, helm: null, amulet: null, armor: null, ring1: null, ring2: null, gloves: null, belt: null, boots: null },
    inventory: new Array(40).fill(null), stash: new Array(STASH_SIZE).fill(null), charms: new Array(CHARM_SLOTS).fill(null), elixirs: {}, poisonT: 0, poisonDps: 0,
    walkPhase: 0, moving: false, attack: null, leap: null, whirl: null, pose: null, poseT: 0, poseDur: 0,
    buffs: {}, hurtT: 0, slowT: 0, potionCD: 0, healLeft: 0, healRate: 0, dead: false, order: null,
    path: null, pathKey: '', pathT: 0, stuck: 0, stats: {}, procCD: 0, kills: 0,
  };
  p.equipment.weapon = finalizeItem(baseItem(BASE_INDEX.handaxe, 'weapon', 1, 0));
  recalcStats(p);
  p.life = p.stats.maxLife;
  return p;
}

function recalcStats(p) {
  const s = {
    minDmg: 2, maxDmg: 5, aps: 1.2, armor: 0, life: 0, lifePct: 0, furyMax: 0, furyRegen: 0, lifeRegen: 0,
    crit: 5, critDmg: 50, lifeSteal: 0, moveSpeed: 0, mf: 0, gf: 0, xp: 0, thorns: 0, allSkills: 0,
    dmgPct: 0, ias: 0, dmgFlat: 0, procLightning: 0, procFireNova: 0, procFrostNova: 0, armorPct: 0, regenPct: 0,
    fireDmg: 0, coldDmg: 0, lightDmg: 0, dmgUndead: 0, dmgReduce: 0, killLife: 0, killFury: 0, cdr: 0, furyCost: 0,
    potionBoost: 0, blockChance: 0, resAll: 0, block: 0, skillBonus: {},
  };
  let reach = 56;
  for (const k of EQUIP_KEYS) {
    const it = p.equipment[k];
    if (!it) continue;
    if (it.dmg) {
      s.minDmg = it.dmg[0]; s.maxDmg = it.dmg[1]; s.aps = it.aps;
      if (isTwoHanded(it)) reach = 66;
    }
    if (it.def) s.armor += it.def;
    if (it.block) s.block += it.block;
    for (const a of it.affixes) {
      if (a.stat === 'skill') s.skillBonus[a.skill] = (s.skillBonus[a.skill] || 0) + a.value;
      else if (!a.local) s[a.stat] = (s[a.stat] || 0) + a.value;
    }
    // 소켓에 박은 보석
    if (it.gems) for (const g of it.gems) { const [st, v] = gemStat(g, it.slot); s[st] = (s[st] || 0) + v; }
  }
  // 부적 주머니의 부적 (착용 레벨이 되어야 효과)
  for (const it of p.charms || []) {
    if (!it || it.slot !== 'charm' || p.level < it.req) continue;
    for (const a of it.affixes) if (a.stat !== 'skill') s[a.stat] = (s[a.stat] || 0) + a.value;
  }
  // 세트 효과
  const sets = setCounts(p.equipment);
  for (const id in sets) {
    const S = SETS[id];
    if (!S) continue;
    for (const n in S.bonus) if (sets[id] >= +n) for (const st in S.bonus[n]) s[st] = (s[st] || 0) + S.bonus[n][st];
  }
  // 마을에서 산 비약
  const el = p.elixirs || {};
  if (el.power > 0) s.dmgPct += 25;
  if (el.iron > 0) { s.armorPct += 30; s.resAll += 15; }
  if (el.luck > 0) { s.mf += 50; s.gf += 50; }
  p.stats = s;
  const pv = id => { const L = effLevel(p, id); return L ? SKILLS[id].vals(L) : null; };
  let v;
  if ((v = pv('mastery'))) { s.dmgPct += v.dmgPct; s.crit += v.crit; }
  if ((v = pv('hide'))) { s.armor += v.armor; s.armorPct += v.armorPct; }
  if ((v = pv('toughness'))) s.lifePct += v.lifePct;
  if ((v = pv('bloodlust'))) s.lifeSteal += v.lifeSteal;
  if ((v = pv('swiftness'))) { s.moveSpeed += v.moveSpeed; s.ias += v.ias; }
  if ((v = pv('furyheart'))) { s.furyMax += v.furyMax; s.furyRegen += v.furyRegen; }
  if ((v = pv('executioner'))) { s.critDmg += v.critDmg; s.crit += v.crit; }
  if ((v = pv('regen'))) s.regenPct += v.regenPct;
  if ((v = pv('thornskin'))) s.thorns += Math.round((4 + p.level * 1.5) * v.mult);
  if ((v = pv('treasure'))) { s.mf += v.mf; s.gf += v.gf; }
  if ((v = pv('shieldmaster'))) { s.blockChance += v.block; s.blockFury = v.fury; }
  if ((v = pv('resist'))) s.resAll += v.res;
  if ((v = pv('ironwill'))) { s.dmgTakenPct = (s.dmgTakenPct || 0) + v.reduce; s.ccRed = (s.ccRed || 0) + v.cc; }
  if ((v = pv('laststand'))) s.lastStand = v.reduce;
  if ((v = pv('retaliate'))) s.retaliate = v;
  if ((v = pv('heavyhand'))) { if (p.equipment.weapon && isTwoHanded(p.equipment.weapon)) s.dmgPct += v.dmg2h; s.bashChance = (s.bashChance || 0) + v.stun; }
  if ((v = pv('vitality'))) { s.potionBoost += v.potion; s.killLife += Math.round((2 + p.level * 0.15) * v.kill); }
  // 영구 보너스 카드, 광란·학살 중첩, 전투 명령
  s.dmgPct += p.bonusDmg || 0;
  if (p.bannerIn && typeof world !== 'undefined' && world && world.banner) s.dmgPct += world.banner.v.dmg;  // 전쟁 깃발 안
  s.armorPct += p.bonusArmor || 0;
  if (p.frenzy && p.frenzy.n > 0) { const f = SKILLS.frenzy.vals(Math.max(1, effLevel(p, 'frenzy'))); s.ias += f.ias * p.frenzy.n; s.moveSpeed += f.move * p.frenzy.n; }
  if (p.rampage && p.rampage.n > 0) { const r = SKILLS.rampage.vals(Math.max(1, effLevel(p, 'rampage'))); s.dmgPct += r.dmg * p.rampage.n; s.ias += r.ias * p.rampage.n; }
  if (p.buffs.orders > 0) { const o = SKILLS.battleorders.vals(Math.max(1, effLevel(p, 'battleorders'))); s.lifePct += o.life; s.armorPct += o.armor; }
  if (p.buffs.berserk > 0) {
    const b = SKILLS.berserk.vals(Math.max(1, effLevel(p, 'berserk')));
    s.dmgPct += b.dmg; s.ias += b.ias; s.moveSpeed += b.move; s.lifeSteal += b.lifeSteal;
  }
  s.maxLife = Math.round((90 + p.level * 10 + p.bonusLife + s.life) * (1 + s.lifePct / 100));
  s.maxFury = 100 + s.furyMax;
  s.furyRegenTotal = 4 + s.furyRegen;
  s.lifeRegenTotal = s.lifeRegen + s.maxLife * s.regenPct / 100;
  s.armorTotal = Math.round((s.armor + p.level * 2) * (1 + s.armorPct / 100));
  s.minDmg += s.dmgFlat; s.maxDmg += s.dmgFlat;
  s.apsTotal = s.aps * (1 + s.ias / 100);
  s.speed = 185 * (1 + s.moveSpeed / 100);
  s.reach = reach;
  s.lifeSteal = Math.min(s.lifeSteal, 25);
  s.crit = Math.min(s.crit, 75);
  s.block = p.equipment.shield ? Math.min(50, s.block + s.blockChance) : 0;
  s.res = Math.min(75, s.resAll) + (DIFFICULTIES[p.difficulty || 0].res || 0);  // 악몽·지옥은 원소 저항 감소
  s.cdr = Math.min(40, s.cdr);
  s.ccRed = Math.min(75, s.ccRed || 0);
  s.dmgTakenPct = Math.min(50, s.dmgTakenPct || 0);
  s.furyCost = Math.min(40, s.furyCost);
  p.life = Math.min(p.life, s.maxLife);
  p.fury = Math.min(p.fury, s.maxFury);
}

function damageReduction(p, mlvl) {
  const a = p.stats.armorTotal;
  return Math.min(0.7, a / (a + 50 + 20 * mlvl));
}

// ── 이동 ──
function smoothPath(sx, sy, pts, r) {
  if (!pts || !pts.length) return null;
  const d = world.dungeon;
  const out = [];
  let cx = sx, cy = sy, i = 0;
  while (i < pts.length) {
    let j = Math.min(pts.length - 1, i + 14);
    while (j > i && !d.clearPath(cx, cy, pts[j].x, pts[j].y, r)) j--;
    out.push(pts[j]);
    cx = pts[j].x; cy = pts[j].y;
    i = j + 1;
  }
  return out;
}

function navigate(p, tx, ty, dt, stopDist = 4) {
  const d = world.dungeon;
  if (dist(p.x, p.y, tx, ty) <= stopDist) return true;
  const key = Math.floor(tx / TILE) + ',' + Math.floor(ty / TILE);
  p.pathT -= dt;
  if (!p.path || !p.path.length || p.pathKey !== key || p.pathT <= 0) {
    p.pathKey = key;
    p.pathT = 0.5;
    if (d.clearPath(p.x, p.y, tx, ty, p.r * 0.8)) p.path = [{ x: tx, y: ty, direct: true }];
    else p.path = smoothPath(p.x, p.y, d.findPath(p.x, p.y, tx, ty), p.r * 0.8) || [{ x: tx, y: ty, direct: true }];
  }
  if (p.path.length === 1 && p.path[0].direct) { p.path[0].x = tx; p.path[0].y = ty; }
  let wp = p.path[0];
  while (p.path.length > 1 && dist(p.x, p.y, wp.x, wp.y) < 10) { p.path.shift(); wp = p.path[0]; }
  const a = angleTo(p.x, p.y, wp.x, wp.y);
  const sp = p.stats.speed * (p.slowT > 0 ? 0.6 : 1) * dt;
  const step = Math.min(sp, dist(p.x, p.y, wp.x, wp.y));
  const ox = p.x, oy = p.y;
  d.moveCircle(p, Math.cos(a) * step, Math.sin(a) * step);
  const moved = dist(ox, oy, p.x, p.y);
  p.walkPhase += moved * 0.09;
  p.moving = moved > 0.2;
  if (p.moving) p.facing = a;
  if (moved < step * 0.2) { p.stuck += dt; if (p.stuck > 0.3) { p.path = null; p.stuck = 0; } } else p.stuck = 0;
  // 목표에 더 다가가지 못하면(벽에 막혀 미끄러지거나 제자리에서 떨면) 0.6초 뒤 멈춤
  const dd = dist(p.x, p.y, tx, ty), nk = Math.round(tx) + ',' + Math.round(ty);
  if (p.navKey !== nk) { p.navKey = nk; p.navBest = dd; p.navT = 0; }
  const following = !(p.path && p.path.length === 1 && p.path[0].direct) && moved > step * 0.7;
  if (dd < p.navBest - 1.5 || following) { p.navBest = Math.min(p.navBest, dd); p.navT = 0; }
  else if ((p.navT += dt) > 0.6) { p.navT = 0; p.path = null; p.order = null; p.moving = false; return false; }  // 도착이 아니라 포기: 명령만 취소
  return dd <= stopDist;
}

// ── 업데이트 ──
function updatePlayer(dt) {
  const p = player, s = p.stats;
  if (p.dead) return;
  for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.slowT = Math.max(0, p.slowT - dt);
  p.potionCD = Math.max(0, p.potionCD - dt);
  p.procCD = Math.max(0, p.procCD - dt);
  if (p.buffs.berserk > 0) {
    p.buffs.berserk -= dt;
    if (p.buffs.berserk <= 0) { p.buffs.berserk = 0; recalcStats(p); }
    else if (chance(dt * 25)) fxEmbers(p.x, p.y, 1, '#ff3a22', 14);
  }
  // 부적 주머니가 바뀌면 능력치 다시 계산
  p.charmT = (p.charmT || 0) - dt;
  if (p.charmT <= 0) {
    p.charmT = 0.3;
    let key = '';
    for (const it of p.charms || []) if (it) key += it.uid + ',';
    if (key !== p.charmKey) { p.charmKey = key; recalcStats(p); }
  }
  // 지속 효과: 강철 피부, 전투 명령, 광란·학살 중첩
  if (p.buffs.ironskin > 0) { p.buffs.ironskin -= dt; if (chance(dt * 10)) fxSparks(p.x, p.y, 50, 1, '#d8dde8', 40); }
  if (p.buffs.bloodrite > 0) { p.buffs.bloodrite -= dt; if (chance(dt * 8)) fxBlood(p.x, p.y, 40, 1); }
  if (p.invulnT > 0) p.invulnT -= dt;
  if (p.buffs.orders > 0) {
    p.buffs.orders -= dt;
    if (p.buffs.orders <= 0) { p.buffs.orders = 0; recalcStats(p); UI.message('전투 명령의 효과가 끝났습니다', '#c9c1b3'); }
  }
  for (const k of ['frenzy', 'rampage']) {
    const st = p[k];
    if (st && st.n > 0) { st.t -= dt; if (st.t <= 0) { st.n = 0; recalcStats(p); } }
  }
  // 비약 남은 시간
  for (const k in p.elixirs) {
    if (p.elixirs[k] <= 0) continue;
    p.elixirs[k] -= dt;
    if (p.elixirs[k] <= 0) { p.elixirs[k] = 0; recalcStats(p); UI.message(`${ELIXIRS[k].name}의 효과가 끝났습니다`, '#c9c1b3'); }
  }
  // 중독: 방어력을 무시하고 서서히 피해 (원소 저항으로 줄어듦)
  if (p.poisonT > 0) {
    p.poisonT -= dt;
    p.life -= p.poisonDps * (1 - p.stats.res / 100) * dt;
    if (chance(dt * 6)) fxSparks(p.x, p.y, 40, 1, '#8aff5a', 40);
    if (p.life <= 0) { playerDie(); return; }
  }
  if (p.healLeft > 0) {
    const h = Math.min(p.healLeft, p.healRate * dt);
    p.healLeft -= h;
    healPlayer(h);
  }
  healPlayer(s.lifeRegenTotal * dt);
  p.fury = Math.min(s.maxFury, p.fury + s.furyRegenTotal * dt);
  if (p.pose) { p.poseT += dt; if (p.poseT >= p.poseDur) p.pose = null; }
  if (p.quake) updateQuake(dt);
  p.moving = false;

  // 안전장치: 어떤 이유로든 벽 안에 끼었으면 가장 가까운 빈자리로 빼냄
  if (!p.leap && !p.rush && world.dungeon.circleBlocked(p.x, p.y, p.r * 0.8)) {
    const s2 = world.dungeon.freeSpot(p.x, p.y, p.r);
    p.x = s2.x; p.y = s2.y; p.path = null;
  }
  if (p.tp) {
    p.tp.t += dt;
    if (chance(dt * 30)) fxSparks(p.x + rand(-20, 20), p.y + rand(-20, 20), rand(10, 70), 1, '#8fd0ff', 40);
    if (Input.keyDir() !== null || (p.order && p.order.type === 'move')) { p.tp = null; UI.message('귀환이 취소되었습니다', '#c9c1b3'); }
    else if (p.tp.t >= p.tp.dur) { p.tp = null; Town.castPortalDone(); }
    return;
  }
  if (p.leap) { updateLeap(dt); return; }
  if (p.rush) { updateRush(dt); return; }
  if (p.whirl) { updateWhirl(dt); return; }
  if (p.attack) { updateAttack(dt); return; }
  if (p.pose === 'roar' || p.pose === 'slam') return;

  const kd = Input.keyDir();
  if (kd !== null) {
    p.order = null;
    const sp = s.speed * (p.slowT > 0 ? 0.6 : 1) * dt;
    const ox = p.x, oy = p.y;
    world.dungeon.moveCircle(p, Math.cos(kd) * sp, Math.sin(kd) * sp);
    const moved = dist(ox, oy, p.x, p.y);
    p.walkPhase += moved * 0.09;
    p.moving = moved > 0.2;
    p.facing = kd;
    return;
  }

  const o = p.order;
  if (!o) return;
  switch (o.type) {
    case 'move':
      if (navigate(p, o.x, o.y, dt, 5) && !(Input.left && Input.leftMode === 'move')) p.order = null;
      break;
    case 'attack': {
      const m = o.target;
      if (!m || !hittable(m)) { p.order = null; break; }
      const reach = s.reach + m.r;
      if (dist(p.x, p.y, m.x, m.y) <= reach) {
        startAttack(o.skill || 'basic', m);
        o.skill = null;
        if (!(Input.left && Input.leftMode === 'attack')) p.order = null;
      } else navigate(p, m.x, m.y, dt, reach * 0.9);
      break;
    }
    case 'pickup':
      if (!world.ground.includes(o.target)) { p.order = null; break; }
      if (navigate(p, o.target.x, o.target.y, dt, 28)) { pickupGround(o.target); p.order = null; }
      break;
    case 'chest':
      if (o.target.open) { p.order = null; break; }
      if (navigate(p, o.target.x, o.target.y, dt, 42)) { openChest(o.target); p.order = null; }
      break;
    case 'npc':
      if (navigate(p, o.target.x, o.target.y, dt, o.target.reach || 74)) { p.order = null; p.facing = angleTo(p.x, p.y, o.target.x, o.target.y); Town.interact(o.target); }
      break;
    case 'portal':
      if (navigate(p, o.target.x, o.target.y, dt, 34)) { p.order = null; Town.usePortal(o.target); }
      break;
    case 'stairs': {
      const st = world.dungeon.stairs;
      if (navigate(p, st.x, st.y, dt, 30)) {
        p.order = null;
        if (st.open) Game.descend();
        else UI.message('보스를 처치해야 계단의 봉인이 풀립니다', '#ff7a6a');
      }
      break;
    }
  }
}

// ── 기본 공격 / 강타 ──
function startAttack(kind, target, ax, ay) {
  const p = player, s = p.stats;
  let dur = clamp(1 / s.apsTotal, 0.25, 1.4);
  if (kind === 'bash' || kind === 'frenzy' || kind === 'execute') {
    const v = SKILLS[kind].vals(effLevel(p, kind));
    const cost = skillCost(v);
    if (p.fury < cost || (p.cds[kind] || 0) > 0) { if (p.fury < cost) noFury(); kind = 'basic'; }
    else {
      p.fury -= cost;
      if (v.cd) p.cds[kind] = v.cd * (1 - p.stats.cdr / 100);
      dur *= kind === 'bash' ? 1.1 : kind === 'execute' ? 1.3 : 0.85;
    }
  }
  const angle = target ? angleTo(p.x, p.y, target.x, target.y) : angleTo(p.x, p.y, ax, ay);
  p.facing = angle;
  p.path = null;
  p.attack = { kind, target, angle, t: 0, dur, hit: false };
}

function updateAttack(dt) {
  const p = player, a = p.attack;
  a.t += dt;
  if (!a.hit && a.t >= a.dur * 0.45) { a.hit = true; resolveSwing(a); }
  if (a.t >= a.dur) p.attack = null;
}

function resolveSwing(a) {
  const p = player, s = p.stats;
  SFX.play('swing');
  if (a.kind === 'frenzy' || a.kind === 'execute') { resolveSkillSwing(a); return; }
  const bash = a.kind === 'bash';
  fxSprite('cleave', p.x + Math.cos(a.angle) * 30, p.y + Math.sin(a.angle) * 30, { dir: flareDir(a.angle), scale: bash ? 1.25 : 0.95, alpha: 0.8 });
  const v = bash ? SKILLS.bash.vals(effLevel(p, 'bash')) : null;
  const opts = bash ? { knock: v.knock, stun: v.stun, fury: 2 } : { fury: 5 };
  // 무거운 일격: 기본 공격이 가끔 기절시킴
  if (!bash && s.bashChance && chance(s.bashChance / 100)) opts.stun = 0.4;
  const mult = bash ? v.mult : 1;
  let targets = [];
  if (a.target && !a.target.dead && dist(p.x, p.y, a.target.x, a.target.y) <= s.reach + a.target.r + 24) targets = [a.target];
  else {
    for (const m of world.monsters) {
      if (m.dead) continue;
      if (dist(p.x, p.y, m.x, m.y) > s.reach + m.r + 6) continue;
      if (Math.abs(angleDiff(a.angle, angleTo(p.x, p.y, m.x, m.y))) < 0.9) targets.push(m);
    }
    if (bash && targets.length > 1) targets = [targets.sort((x, y) => dist(p.x, p.y, x.x, x.y) - dist(p.x, p.y, y.x, y.y))[0]];
  }
  for (const t of targets) playerStrike(t, mult, opts);
  if (bash && targets.length) { fxShake(4); fxSparks(targets[0].x, targets[0].y, 30, 10, '#ffd28a', 160); fxSprite('spark_orange', targets[0].x, targets[0].y, { z: monsterHeight(targets[0]) * 0.5 - 52, scale: 1.2 }); }
}

// 광란(두 번 베기 + 속도 중첩)과 처형 일격(약한 적에게 2배, 처치하면 분노 환급)
function resolveSkillSwing(a) {
  const p = player, s = p.stats, id = a.kind, v = SKILLS[id].vals(effLevel(p, id));
  let t = a.target && !a.target.dead && dist(p.x, p.y, a.target.x, a.target.y) <= s.reach + a.target.r + 24 ? a.target : null;
  if (!t) {
    let bd = s.reach + 30;
    for (const m of world.monsters) {
      if (!hittable(m)) continue;
      const d = dist(p.x, p.y, m.x, m.y) - m.r;
      if (d < bd && Math.abs(angleDiff(a.angle, angleTo(p.x, p.y, m.x, m.y))) < 0.9) { bd = d; t = m; }
    }
  }
  const fx = p.x + Math.cos(a.angle) * 30, fy = p.y + Math.sin(a.angle) * 30;
  if (id === 'frenzy') {
    SFX.play('swing');
    fxSprite('cleave', fx, fy, { dir: flareDir(a.angle), scale: 0.95, alpha: 0.8 });
    setTimeout(() => { SFX.play('swing'); fxSprite('cleave', fx, fy, { dir: (flareDir(a.angle) + 1) % 8, scale: 0.9, alpha: 0.7 }); }, 90);
    if (!t) return;
    playerStrike(t, v.mult, { fury: 3 });
    if (!t.dead) playerStrike(t, v.mult, { fury: 3, knock: 40 });
    p.frenzy.n = Math.min(v.stacks, p.frenzy.n + 1);
    p.frenzy.t = v.dur;
    recalcStats(p);
    if (p.frenzy.n === v.stacks) fxEmbers(p.x, p.y, 4, '#ffb04a', 14);
    return;
  }
  // 처형 일격
  SFX.play('swing');
  fxSprite('cleave', fx, fy, { dir: flareDir(a.angle), scale: 1.4, alpha: 0.9 });
  if (!t) return;
  const low = t.life < t.maxLife * v.low / 100;
  playerStrike(t, v.mult * (low ? 2 : 1), { knock: 120, fury: 0 });
  fxShake(low ? 8 : 5);
  fxSparks(t.x, t.y, 30, low ? 18 : 10, low ? '#ff5a3a' : '#ffd28a', 180);
  if (low) fxText(t.x, t.y, '처형!', '#ff5a3a', 16, { z: monsterHeight(t) + 6 });
  if (t.dead) { p.fury = Math.min(s.maxFury, p.fury + v.refund); SFX.play('crit'); }
}

// 지진: 0.35초 간격으로 세 번 흔들림 (게임 시간 기준, 멈추면 같이 멈춤)
function quake(v) {
  const p = player;
  p.pose = 'slam'; p.poseT = 0; p.poseDur = 0.4;
  p.quake = { t: 0, n: 0, v };
}
function updateQuake(dt) {
  const p = player, q = p.quake;
  q.t += dt;
  while (q.n < 3 && q.t >= q.n * 0.35) {
    const i = q.n++, v = q.v, r = v.radius * (0.65 + i * 0.175);
    SFX.play('boom', 0.7);
    fxShake(6 + i * 2);
    fxSprite('quake', p.x, p.y, { layer: 'ground', scale: r / 80 });
    fxRing(p.x, p.y, 10, r, 0.45, '#d8b07a', 5);
    fxDust(p.x, p.y, 10, '130,110,85', 160);
    for (const m of world.monsters) {
      if (!hittable(m) || dist(p.x, p.y, m.x, m.y) > r + m.r) continue;
      playerStrike(m, v.mult, { knock: 40, fury: 1 });
      if (!m.dead) m.slow = Math.max(m.slow, v.slow);
    }
  }
  if (q.n >= 3) p.quake = null;
}

// 돌진: 땅을 박차고 미끄러지듯 달려가며 길목의 적을 들이받음 (그동안 무적)
function startRush(aim, v) {
  const p = player, d = world.dungeon;
  const a = angleTo(p.x, p.y, aim.x, aim.y);
  const len = Math.min(v.range, Math.max(80, dist(p.x, p.y, aim.x, aim.y)));
  let tx = p.x, ty = p.y;
  for (let s = 8; s <= len; s += 8) {
    const x = p.x + Math.cos(a) * s, y = p.y + Math.sin(a) * s;
    if (d.circleBlocked(x, y, p.r * 0.8)) break;
    tx = x; ty = y;
  }
  p.order = null; p.path = null;
  p.facing = a;
  p.rush = { sx: p.x, sy: p.y, tx, ty, a, t: 0, dur: Math.max(0.12, dist(p.x, p.y, tx, ty) / 950), v, hit: new Set() };
  SFX.play('whirl');
  fxDust(p.x, p.y, 8);
}
function updateRush(dt) {
  const p = player, r = p.rush;
  r.t += dt;
  const k = Math.min(1, r.t / r.dur);
  p.x = lerp(r.sx, r.tx, k); p.y = lerp(r.sy, r.ty, k);
  p.moving = true; p.walkPhase += dt * 30;
  if (chance(0.7)) fxDust(p.x, p.y, 1, '120,100,80', 50);
  for (const m of world.monsters) {
    if (!hittable(m) || r.hit.has(m.id) || dist(p.x, p.y, m.x, m.y) > m.r + p.r + 22) continue;
    r.hit.add(m.id);
    playerStrike(m, r.v.mult, { knock: 170, stun: r.v.stun, fury: 3 });
    fxShake(4);
  }
  if (k >= 1) { p.rush = null; p.attack = null; }
}

// 작살: 처음 맞은 적을 끌어옴
function throwHarpoon(aim, v) {
  const p = player;
  const a = angleTo(p.x, p.y, aim.x, aim.y);
  p.facing = a;
  p.pose = 'throw'; p.poseT = 0; p.poseDur = 0.3;
  spawnProjectile({
    owner: 'player', type: 'spear', x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
    vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, r: 12, mult: v.mult, pierce: 0, life: 0.6, angle: a, pull: v.stun,
  });
  SFX.play('throw');
}
function harpoonPull(m, stun) {
  const p = player;
  if (m.tier < 3 && !m.stationary && !m.dead) {
    const a = angleTo(p.x, p.y, m.x, m.y), want = p.r + m.r + 12;
    const s = world.dungeon.freeSpot(p.x + Math.cos(a) * want, p.y + Math.sin(a) * want, m.r * 0.8, 80);
    fxDust(m.x, m.y, 6);
    m.x = s.x; m.y = s.y; m.kvx = m.kvy = 0;
  }
  if (!m.dead) { m.stun = Math.max(m.stun, m.tier === 3 ? stun * 0.3 : stun); m.windup = 0; m.pending = null; m.act = m.act && m.act.kind === 'emerge' ? m.act : null; }
  fxSparks(m.x, m.y, 40, 10, '#e8e2d0', 120);
  SFX.play('block', 0.6);
}

function noFury() {
  if (Game.time - (Game.lastNoFury || 0) > 1.2) {
    Game.lastNoFury = Game.time;
    UI.message('분노가 부족합니다', '#ffad4a');
    SFX.play('nope');
  }
}

// ── 스킬 ──
// 단축칸 두 곳의 스킬 자리를 맞바꿈 (캐릭터 창의 1~6 버튼, 창이 열려 있을 때 단축칸 끌기)
function swapHotbar(i, j) {
  const p = player;
  if (i === j || i < 0 || j < 0 || i > 5 || j > 5) return false;
  [p.hotbar[i], p.hotbar[j]] = [p.hotbar[j], p.hotbar[i]];
  p.whirl = null;
  Input.slotDown[i] = Input.slotDown[j] = false;
  SFX.play('click');
  Game.dirty = true;
  return true;
}
function useSkill(slot) {
  const p = player;
  if (!p || p.dead || p.leap || p.rush || Game.state !== 'playing') return;
  const id = p.hotbar[slot];
  if (!id) return;
  const v = SKILLS[id].vals(effLevel(p, id));
  const aim = Input.world;
  if (id === 'whirlwind') {
    if (!p.whirl) {
      if (p.fury < skillCost(v)) { noFury(); return; }
      p.attack = null; p.order = null;
      p.whirl = { slot, tick: 0, sfx: 0, v };
    }
    return;
  }
  if ((p.cds[id] || 0) > 0) { SFX.play('nope'); return; }
  if (id === 'bash' || id === 'frenzy' || id === 'execute') {
    const hov = Input.hover && Input.hover.kind === 'monster' ? Input.hover.ref : null;
    const target = hov || nearestMonsterNear(aim.x, aim.y, 120);
    if (target) p.order = { type: 'attack', target, skill: id };
    else if (!p.attack) startAttack(id, null, aim.x, aim.y);
    return;
  }
  if (p.fury < skillCost(v)) { noFury(); return; }
  if (world.town) { UI.message('마을에서는 싸울 수 없습니다', '#c9c1b3'); return; }
  p.whirl = null;
  p.attack = null;
  switch (id) {
    case 'leap': startLeap(aim, v); break;
    case 'warcry': warcry(v); break;
    case 'slam': slam(aim, v); break;
    case 'axes': throwAxes(aim, v); break;
    case 'quake': quake(v); break;
    case 'rush': startRush(aim, v); break;
    case 'harpoon': throwHarpoon(aim, v); break;
    case 'boomerang': throwBoomerang(aim, v); break;
    case 'snare': chainSnare(v); break;
    case 'fear': fearHowl(v); break;
    case 'banner': plantBanner(v); break;
    case 'ancestors': callAncestors(v); break;
    case 'bloodrite': bloodRite(v); break;
    case 'thunder': thunderCall(aim, v); break;
    case 'ironskin':
      p.buffs.ironskin = v.dur;
      p.slowT = 0;
      SFX.play('berserk');
      fxSprite('shield_orange', p.x, p.y, { follow: p, life: v.dur, scale: 0.7, alpha: 0.35, fade: 0.5 });
      fxRing(p.x, p.y, 10, 90, 0.5, '#d8dde8', 6);
      UI.message('강철 피부!', '#d8dde8');
      break;
    case 'battleorders': {
      const before = p.stats.maxLife;
      p.buffs.orders = v.dur;
      recalcStats(p);
      healPlayer(p.stats.maxLife - before);
      p.pose = 'roar'; p.poseT = 0; p.poseDur = 0.45;
      SFX.play('warcry');
      fxRing(p.x, p.y, 10, 140, 0.6, '#8fd0ff', 6);
      fxSprite('sparkle', p.x, p.y, { follow: p, life: 1, scale: 1.2 });
      UI.message(`전투 명령! 최대 생명력 +${v.life}% · 방어력 +${v.armor}%`, '#8fd0ff');
      break;
    }
    case 'rally': {
      const heal = p.stats.maxLife * v.heal / 100;
      p.healLeft += heal; p.healRate = Math.max(p.healRate, heal / 3);
      p.poisonT = 0; p.slowT = 0;
      SFX.play('revive');
      fxSprite('heal', p.x, p.y, { follow: p, scale: 1.1 });
      fxRing(p.x, p.y, 10, 100, 0.6, '#7dffa0', 5);
      break;
    }
    case 'berserk':
      p.buffs.berserk = v.dur;
      recalcStats(p);
      SFX.play('berserk');
      fxSprite('shield_orange', p.x, p.y, { follow: p, life: v.dur, scale: 0.75, alpha: 0.4, fade: 0.6 });
      fxRing(p.x, p.y, 10, 120, 0.6, '#ff3a22', 6);
      fxEmbers(p.x, p.y, 30, '#ff3a22', 30);
      UI.message('광폭화!', '#ff5a3a');
      break;
  }
  p.fury -= skillCost(v);
  p.cds[id] = v.cd * (1 - p.stats.cdr / 100);
}

// 분노 소모 (아이템의 '분노 소모 감소' 반영)
function skillCost(v) { return v.cost * (1 - ((player && player.stats.furyCost) || 0) / 100); }

function nearestMonsterNear(x, y, r) {
  let best = null, bd = r;
  for (const m of world.monsters) {
    if (!hittable(m)) continue;
    const d = dist(x, y, m.x, m.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function startLeap(aim, v) {
  const p = player, d = world.dungeon;
  const a = angleTo(p.x, p.y, aim.x, aim.y);
  const len = Math.min(v.range, dist(p.x, p.y, aim.x, aim.y));
  let tx = p.x, ty = p.y;
  for (let s = 8; s <= len; s += 8) {
    const x = p.x + Math.cos(a) * s, y = p.y + Math.sin(a) * s;
    if (d.circleBlocked(x, y, p.r * 0.8)) break;
    tx = x; ty = y;
  }
  p.order = null;
  p.facing = a;
  p.leap = { sx: p.x, sy: p.y, tx, ty, t: 0, dur: 0.45 + len / 2200, v };
  SFX.play('throw');
}

function updateLeap(dt) {
  const p = player, l = p.leap;
  l.t += dt;
  const k = Math.min(1, l.t / l.dur);
  p.x = lerp(l.sx, l.tx, k);
  p.y = lerp(l.sy, l.ty, k);
  p.z = Math.sin(k * Math.PI) * 90;
  if (k >= 1) {
    p.z = 0;
    p.leap = null;
    const v = l.v;
    SFX.play('boom');
    fxShake(9);
    fxSprite('quake', p.x, p.y, { layer: 'ground', scale: v.radius / 80 });
    fxRing(p.x, p.y, 10, v.radius, 0.45, '#e9c68a', 4);
    fxDust(p.x, p.y, 18);
    fxDecal('crack', p.x, p.y, 1.4);
    if (!spriteSet('effects', 'quake')) for (let i = 0; i < 9; i++) {
      const an = (i / 9) * TAU;
      fxRock(p.x + Math.cos(an) * v.radius * 0.55, p.y + Math.sin(an) * v.radius * 0.55, 0.8);
    }
    for (const m of world.monsters) {
      if (!m.dead && dist(p.x, p.y, m.x, m.y) < v.radius + m.r) playerStrike(m, v.mult, { stun: v.stun, knock: 160, fury: 2 });
    }
  }
}

function warcry(v) {
  const p = player;
  p.pose = 'roar'; p.poseT = 0; p.poseDur = 0.45;
  SFX.play('warcry');
  fxShake(6);
  fxSprite('shield_orange', p.x, p.y, { follow: p, life: 0.55, scale: 0.6, scale1: 1.9, fade: 0.3 });
  fxRing(p.x, p.y, 20, v.radius, 0.6, '#ff6a3a', 7);
  fxRing(p.x, p.y, 10, v.radius * 0.7, 0.5, '#ffd27a', 4);
  for (const m of world.monsters) {
    if (!m.dead && dist(p.x, p.y, m.x, m.y) < v.radius + m.r) playerStrike(m, v.mult, { stun: v.stun, knock: 60 });
  }
}

function slam(aim, v) {
  const p = player;
  const a = angleTo(p.x, p.y, aim.x, aim.y);
  p.facing = a;
  p.pose = 'slam'; p.poseT = 0; p.poseDur = 0.4;
  world.waves.push({ x: p.x + Math.cos(a) * 26, y: p.y + Math.sin(a) * 26, a, dist: 0, len: v.length, v, hit: new Set(), next: 0, delay: 0.12 });
  setTimeout(() => { SFX.play('spikes'); SFX.play('boom', 0.5); }, 110);
  fxSprite('rupture', p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, { dir: flareDir(a) % 3, layer: 'top', scale: 1.2 });
}

function updateWaves(dt) {
  const d = world.dungeon;
  for (let i = world.waves.length - 1; i >= 0; i--) {
    const w = world.waves[i];
    if (w.delay > 0) { w.delay -= dt; if (w.delay <= 0) fxShake(6); continue; }
    w.dist += 950 * dt;
    const hx = w.x + Math.cos(w.a) * w.dist, hy = w.y + Math.sin(w.a) * w.dist;
    while (w.next <= w.dist && w.next <= w.len) {
      const px = w.x + Math.cos(w.a) * w.next, py = w.y + Math.sin(w.a) * w.next;
      if (d.solidAt(px, py)) { w.next = w.len + 1; break; }
      const side = rand(-14, 14);
      if (!fxSprite('spikes', px - Math.sin(w.a) * side, py + Math.cos(w.a) * side, { layer: 'top', dir: flareDir(w.a), life: 0.5, scale: rand(0.7, 0.95) })) fxRock(px - Math.sin(w.a) * side, py + Math.cos(w.a) * side, 1);
      if (chance(0.5)) fxDust(px, py, 2);
      if (((w.next / 26) | 0) % 3 === 0) fxDecal('crack', px, py, 0.7);
      w.next += 26;
    }
    for (const m of world.monsters) {
      if (m.dead || w.hit.has(m.id)) continue;
      if (dist(hx, hy, m.x, m.y) < w.v.width / 2 + m.r) { w.hit.add(m.id); playerStrike(m, w.v.mult, { knock: 90, stun: 0.25 }); }
    }
    if (w.dist >= w.len || d.solidAt(hx, hy)) world.waves.splice(i, 1);
  }
}

function throwAxes(aim, v) {
  const p = player;
  const a = angleTo(p.x, p.y, aim.x, aim.y);
  p.facing = a;
  p.pose = 'throw'; p.poseT = 0; p.poseDur = 0.28;
  for (let i = 0; i < v.count; i++) {
    const off = (i - (v.count - 1) / 2) * 0.16;
    spawnProjectile({
      owner: 'player', type: 'axe', x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
      vx: Math.cos(a + off) * 640, vy: Math.sin(a + off) * 640, r: 12, mult: v.mult, pierce: v.pierce, life: 0.85, angle: a + off,
    });
  }
  SFX.play('throw');
}

function updateWhirl(dt) {
  const p = player, w = p.whirl, v = w.v, s = p.stats;
  if (!Input.slotHeld(w.slot) || p.fury <= 0) { p.whirl = null; return; }
  p.fury = Math.max(0, p.fury - v.drain * (1 - s.furyCost / 100) * dt);
  const aim = Input.world;
  const dd = dist(p.x, p.y, aim.x, aim.y);
  if (dd > 14) {
    const a = angleTo(p.x, p.y, aim.x, aim.y);
    const sp = Math.min(s.speed * 0.85 * dt, dd);
    world.dungeon.moveCircle(p, Math.cos(a) * sp, Math.sin(a) * sp);
    p.facing = a;
  }
  p.moving = true;
  p.walkPhase += dt * 10;
  w.tick -= dt;
  if (w.tick <= 0) {
    w.tick = 0.18 / (1 + s.ias / 200);
    const ra = Math.random() * TAU;
    fxSprite('cleave', p.x + Math.cos(ra) * 24, p.y + Math.sin(ra) * 24, { dir: flareDir(ra), scale: 1.1, alpha: 0.7 });
    for (const m of world.monsters) {
      if (!m.dead && dist(p.x, p.y, m.x, m.y) < v.radius + m.r) playerStrike(m, v.mult, {});
    }
  }
  w.sfx -= dt;
  if (w.sfx <= 0) { w.sfx = 0.22; SFX.play('whirl'); fxDust(p.x, p.y, 2, '120,110,95', 60); }
}

// ── 물약 ──
function drinkPotion() {
  const p = player;
  if (!p || p.dead || Game.state !== 'playing') return;
  if (p.potions <= 0) { UI.message('물약이 없습니다', '#ff7a6a'); SFX.play('nope'); return; }
  if (p.potionCD > 0) return;
  if (p.life >= p.stats.maxLife - 0.5) { UI.message('생명력이 가득 찼습니다', '#c9c1b3'); return; }
  p.potions--;
  p.potionCD = 0.8;
  const heal = p.stats.maxLife * 0.45 * (1 + p.stats.potionBoost / 100);
  p.healLeft += heal;
  p.healRate = heal / 1.2;
  SFX.play('potion');
  fxSprite('heal', p.x, p.y, { follow: p, scale: 0.9, alpha: 0.9 });
  fxSparks(p.x, p.y, 40, 12, '#ff5a5a', 80);
  if (!p.attack && !p.pose) { p.pose = 'drink'; p.poseT = 0; p.poseDur = 0.4; }
  Merc.onPotion();
}

// ── 소지품 ──
function canEquip(item) { return player.level >= item.req; }

// ── 아이템 위치: { c: 'inv' | 'eq' | 'stash', i: 칸 번호, k: 장비 칸 이름 } ──
function itemAt(loc) {
  const p = player;
  if (loc.c === 'merc') return (p.merc && p.merc.equipment[loc.k]) || null;  // 용병 장비 칸
  return loc.c === 'eq' ? p.equipment[loc.k] : loc.c === 'inv' ? p.inventory[loc.i] : loc.c === 'charm' ? p.charms[loc.i] : p.stash[loc.i];
}
function putAt(loc, it) {
  const p = player;
  if (loc.c === 'eq') p.equipment[loc.k] = it || null;
  else if (loc.c === 'merc') { if (p.merc) p.merc.equipment[loc.k] = it || null; }
  else if (loc.c === 'inv') p.inventory[loc.i] = it || null;
  else if (loc.c === 'charm') p.charms[loc.i] = it || null;
  else p.stash[loc.i] = it || null;
}
function listOf(c) { const p = player; return c === 'inv' ? p.inventory : c === 'charm' ? p.charms : p.stash; }
// 부적 주머니 넣기·빼기 (두 번 누르기)
function charmToPouch(loc) {
  const p = player, it = itemAt(loc);
  if (!it || it.slot !== 'charm') return false;
  const i = p.charms.indexOf(null);
  if (i < 0) { UI.message(`부적 주머니가 가득 찼습니다 (${CHARM_SLOTS}칸). 바꿀 부적을 끌어다 놓으세요`, '#ff7a6a'); SFX.play('nope'); return false; }
  p.charms[i] = it; putAt(loc, null);
  recalcStats(p); SFX.equip(it); Game.dirty = true;
  return true;
}
function charmFromPouch(i) {
  const p = player, it = p.charms[i];
  if (!it) return false;
  const s = p.inventory.indexOf(null);
  if (s < 0) { UI.message('가방이 가득 찼습니다', '#ff7a6a'); SFX.play('nope'); return false; }
  p.inventory[s] = it; p.charms[i] = null;
  recalcStats(p); SFX.equip(it); Game.dirty = true;
  return true;
}
function sameLoc(a, b) { return a.c === b.c && (a.c === 'eq' || a.c === 'merc' ? a.k === b.k : a.i === b.i); }
// 이동 목표가 벽 안이면 가까운 빈자리로 (벽에 붙어 계속 미끄러지지 않게)
function moveTarget(x, y) {
  const d = world.dungeon, r = player.r * 0.8;
  if (!d.circleBlocked(x, y, r)) return { x, y };
  const s = d.freeSpot(x, y, r, 140);
  return dist(s.x, s.y, x, y) <= 140 ? s : { x, y };
}
function fitsKey(it, k) { return !!it && slotOfKey(k) === it.slot; }
function defaultKey(it) {
  const p = player;
  if (it.slot !== 'ring') return it.slot;
  return !p.equipment.ring1 ? 'ring1' : !p.equipment.ring2 ? 'ring2' : 'ring1';
}
function cantEquipMsg(it) { UI.message(`레벨 ${it.req}부터 착용할 수 있습니다`, '#ff7a6a'); SFX.play('nope'); }

// 장비가 바뀐 뒤: 능력치 다시 계산 (생명력 비율 유지), 소리, 저장 표시
function afterEquipChange(item) {
  const p = player;
  const ratio = p.life / p.stats.maxLife;
  recalcStats(p);
  p.life = Math.max(1, Math.min(p.stats.maxLife, ratio * p.stats.maxLife));
  if (item) SFX.equip(item);
  Game.dirty = true;
}

// loc에 있는 물건을 key 칸에 착용. 원래 착용하던 물건은 loc 자리로 감
// 양손 무기와 방패는 함께 들 수 없으므로 다른 쪽은 가방 빈칸으로
function equipInto(loc, key) {
  const p = player, it = itemAt(loc);
  if (it && (it.slot === 'gem' || it.slot === 'charm' || it.slot === 'quest')) {
    UI.message(it.slot === 'gem' ? '보석은 소켓이 있는 장비 위로 끌어다 놓으면 박힙니다' : it.slot === 'quest' ? '퀘스트 물건입니다. 부탁한 사람에게 가져가세요' : '부적은 부적 주머니에 넣으면 효과가 있습니다', '#c9c1b3');
    return false;
  }
  if (!it || !fitsKey(it, key)) return false;
  if (!canEquip(it)) { cantEquipMsg(it); return false; }
  const prev = p.equipment[key];
  let bump = null;
  if (key === 'weapon' && isTwoHanded(it) && p.equipment.shield) bump = 'shield';
  if (key === 'shield' && isTwoHanded(p.equipment.weapon)) bump = 'weapon';
  putAt(loc, prev);
  p.equipment[key] = it;
  if (bump) {
    const free = p.inventory.indexOf(null);
    if (free < 0) {
      p.equipment[key] = prev; putAt(loc, it);
      UI.message(bump === 'shield' ? '양손 무기를 들려면 방패를 넣을 가방 칸이 필요합니다' : '방패를 들려면 양손 무기를 넣을 가방 칸이 필요합니다', '#ff7a6a');
      SFX.play('nope');
      return false;
    }
    p.inventory[free] = p.equipment[bump];
    p.equipment[bump] = null;
    UI.message(bump === 'shield' ? '양손 무기를 들어 방패를 가방에 넣었습니다' : '방패를 들어 양손 무기를 가방에 넣었습니다', '#c9c1b3');
  }
  afterEquipChange(it);
  return true;
}

function equipFromInventory(idx, key) {
  const item = player.inventory[idx];
  if (!item) return false;
  return equipInto({ c: 'inv', i: idx }, key || defaultKey(item));
}

// 끌어다 놓기·옮기기: from 자리의 물건을 to 자리로. to에 물건이 있으면 맞바꿈
function moveItem(from, to) {
  const p = player;
  if (sameLoc(from, to)) return false;
  const a = itemAt(from), b = itemAt(to);
  if (!a) return false;
  // 용병 장비 칸이 끼면 용병 쪽 규칙으로
  if (from.c === 'merc' || to.c === 'merc') return Merc.move(from, to);
  // 부적 주머니에는 부적만
  if (to.c === 'charm' && a.slot !== 'charm') { UI.message('부적 주머니에는 부적만 넣을 수 있습니다', '#ff7a6a'); SFX.play('nope'); return false; }
  if (from.c === 'charm' && b && b.slot !== 'charm') {
    const list = listOf(to.c), free = list.indexOf(null);
    if (free < 0) { SFX.play('nope'); return false; }
    list[free] = a; putAt(from, null); recalcStats(player); SFX.equip(a); Game.dirty = true;
    return true;
  }
  if (to.c === 'charm' || from.c === 'charm') { putAt(from, b); putAt(to, a); recalcStats(player); SFX.equip(a); Game.dirty = true; return true; }
  if (to.c === 'eq') {
    if (!fitsKey(a, to.k)) { UI.message(`${SLOT_NAMES[a.slot]}은(는) 그 칸에 착용할 수 없습니다`, '#ff7a6a'); SFX.play('nope'); return false; }
    if (from.c === 'eq') {  // 반지 두 칸끼리 맞바꿈
      putAt(from, b); putAt(to, a);
      afterEquipChange(a);
      return true;
    }
    return equipInto(from, to.k);
  }
  if (from.c === 'eq') {
    // 착용 중인 물건을 가방·보관함 칸으로
    if (!b) { putAt(to, a); putAt(from, null); afterEquipChange(a); return true; }
    if (fitsKey(b, from.k) && canEquip(b)) return equipInto(to, from.k);
    // 바꿀 수 없는 물건이 있는 칸이면 같은 곳의 빈칸으로
    const list = listOf(to.c);
    const free = list.indexOf(null);
    if (free < 0) { UI.message(to.c === 'inv' ? '가방이 가득 찼습니다' : '보관함이 가득 찼습니다', '#ff7a6a'); SFX.play('nope'); return false; }
    list[free] = a; putAt(from, null);
    afterEquipChange(a);
    return true;
  }
  // 가방·보관함 칸끼리 맞바꿈
  putAt(from, b); putAt(to, a);
  SFX.equip(a);
  Game.dirty = true;
  return true;
}

// 가방(또는 보관함) 자동 정리: 부위 → 희귀도 → 아이템 레벨 순
const SORT_SLOTS = ['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet', 'charm', 'gem'];

// 보석을 소켓에 박음 (gemLoc의 보석 → targetLoc의 장비). 한 번 박은 보석은 빼낼 수 없음
function canSocket(it) { return !!it && it.sockets > (it.gems ? it.gems.length : 0); }
function insertGem(gemLoc, targetLoc) {
  const gem = itemAt(gemLoc), it = itemAt(targetLoc);
  if (!gem || gem.slot !== 'gem' || !it || it === gem) return false;
  if (!canSocket(it)) { UI.message(it.sockets ? '빈 소켓이 없습니다' : '소켓이 없는 장비입니다. 대장장이가 소켓을 뚫어 줍니다', '#ff7a6a'); SFX.play('nope'); return false; }
  it.gems = it.gems || [];
  it.gems.push({ gem: gem.gem, grade: gem.grade });
  putAt(gemLoc, null);
  finalizeItem(it);
  if (targetLoc.c === 'eq') recalcStats(player);
  if (targetLoc.c === 'merc') Merc.recalc();
  SFX.play('anvil');
  const [st, v] = gemStat(gem, it.slot);
  UI.message(`${gem.name}을(를) 박았습니다: ${statLine(st, v)}`, GEM_TYPES[gem.gem].color);
  Game.dirty = true;
  return true;
}
function sortItems(list) {
  const items = list.filter(Boolean);
  items.sort((a, b) => SORT_SLOTS.indexOf(a.slot) - SORT_SLOTS.indexOf(b.slot) || b.rarity - a.rarity || b.ilvl - a.ilvl || (b.plus || 0) - (a.plus || 0));
  for (let i = 0; i < list.length; i++) list[i] = items[i] || null;
  SFX.play('pickup');
  Game.dirty = true;
}

function unequip(key) {
  const p = player;
  const item = p.equipment[key];
  if (!item) return false;
  const idx = p.inventory.indexOf(null);
  if (idx < 0) { UI.message('가방이 가득 찼습니다', '#ff7a6a'); return false; }
  p.inventory[idx] = item;
  p.equipment[key] = null;
  recalcStats(p);
  SFX.equip(item);
  Game.dirty = true;
  return true;
}

function sellInventory(idx) {
  const p = player;
  const item = p.inventory[idx];
  if (!item) return;
  if (item.slot === 'quest') { UI.message('퀘스트 물건은 팔 수 없습니다', '#ff7a6a'); SFX.play('nope'); return; }
  p.gold += item.value;
  Shop.addBuyback(item);
  p.inventory[idx] = null;
  SFX.play('gold');
  Game.dirty = true;
}

function dropInventory(idx) {
  const p = player;
  const item = p.inventory[idx];
  if (!item) return;
  if (item.slot === 'quest') { UI.message('퀘스트 물건은 버릴 수 없습니다', '#ff7a6a'); SFX.play('nope'); return; }
  p.inventory[idx] = null;
  const g = spawnGround('item', p.x, p.y, { item });
  g.t = 0.2;
  Game.dirty = true;
}

function sellAllNormal() {
  const p = player;
  let n = 0, gold = 0;
  p.inventory.forEach((it, i) => { if (it && it.rarity === 0 && !it.plus) { gold += it.value; p.inventory[i] = null; n++; } });
  if (n) { p.gold += gold; SFX.play('gold'); UI.message(`일반 아이템 ${n}개 판매: +${gold} 골드`, '#e8c35a'); Game.dirty = true; }
  else UI.message('판매할 일반 아이템이 없습니다', '#c9c1b3');
}

function potionPrice() { return 25 + ((player && player.deepest) || 1) * 5; }
function buyPotion() {
  const p = player, price = potionPrice();
  if (p.potions >= maxPotions()) { UI.message(`물약은 ${maxPotions()}개까지 들 수 있습니다`, '#c9c1b3'); return; }
  if (p.gold < price) { UI.message('골드가 부족합니다', '#ff7a6a'); SFX.play('nope'); return; }
  p.gold -= price;
  p.potions++;
  SFX.play('buyPotion');
}

// ── 레벨업 카드 ──
// 단축키 칸 수 = 배울 수 있는 공격·방어 기술 수
const MAX_ACTIVES = 6;
// 기술 포인트로 기술 하나를 배우거나 한 단계 올림 (기술 창). 보너스(_life 등)도 1점
function spendSkillPoint(id) {
  const p = player, sk = SKILLS[id], bonus = id.startsWith('_');
  if ((p.skillPoints || 0) <= 0) { UI.message('기술 포인트가 없습니다. 레벨이 오르면 1점씩 생깁니다', '#ff7a6a'); SFX.play('nope'); return false; }
  if (!bonus) {
    if (!sk) return false;
    const lv = p.skills[id] || 0;
    if (lv >= sk.max) { UI.message('이미 최고 레벨입니다', '#c9c1b3'); return false; }
    if ((sk.req || 1) > p.level) { UI.message(`캐릭터 레벨 ${sk.req}부터 배울 수 있습니다`, '#ff7a6a'); SFX.play('nope'); return false; }
  }
  const lv = bonus ? 0 : p.skills[id] || 0;
  learnSkill(id);
  p.skillPoints--;
  SFX.play('equip');
  if (bonus) {
    const b = BONUS_CARDS.find(c => c.id === id);
    UI.message(`${b ? b.name : ''}: ${id === '_life' ? `최대 생명력 +${bonusLifeAmount(p.level)}` : b ? b.key : ''}`, '#ffd36a');
  } else {
    const slot = p.hotbar.indexOf(id);
    UI.message(lv ? `${sk.name} 레벨 ${lv + 1}` : `${sk.name} 습득${sk.type === 'active' ? (slot >= 0 ? ` · ${slot + 1}번 키` : ' · 단축칸이 가득 차서 기술 창에서 1~6을 골라 넣으세요') : ''}`, '#ffd36a');
  }
  Game.save();
  return true;
}

function rollCards(first) {
  const p = player;
  const ids = Object.keys(SKILLS);
  const learnedActives = ids.filter(id => SKILLS[id].type === 'active' && p.skills[id]);
  let pool = ids.filter(id => {
    const lv = p.skills[id] || 0;
    if (lv >= SKILLS[id].max) return false;
    if (SKILLS[id].type === 'active' && !lv && learnedActives.length >= MAX_ACTIVES) return false;
    if (first && (SKILLS[id].type !== 'active' || SKILLS[id].def)) return false;  // 첫 기술은 공격 기술로
    return true;
  });
  const weight = id => {
    const lv = p.skills[id] || 0;
    if (SKILLS[id].type === 'active' && !lv && learnedActives.length < 2) return 2.4;
    return lv ? 1.3 : 1;
  };
  const out = [];
  while (out.length < 3 && pool.length) {
    const id = weightedPick(pool, weight);
    out.push(id);
    pool = pool.filter(x => x !== id);
  }
  // 액티브가 1개뿐이면 새 액티브를 최소 하나 보장
  if (!first && learnedActives.length < 2 && !out.some(id => SKILLS[id].type === 'active' && !p.skills[id])) {
    const cand = ids.filter(id => SKILLS[id].type === 'active' && !SKILLS[id].def && !p.skills[id]);
    if (cand.length) out[out.length - 1] = pick(cand);
  }
  // 고를 기술이 모자라면 보너스 카드로 채움 (생명력·피해·방어가 먼저)
  const bonus = shuffle(BONUS_CARDS.slice(0, 3).map(b => b.id)).concat(shuffle(BONUS_CARDS.slice(3).map(b => b.id)));
  for (const b of bonus) if (out.length < 3) out.push(b);
  return out;
}

function learnSkill(id) {
  const p = player;
  if (id === '_life') p.bonusLife += bonusLifeAmount(p.level);
  else if (id === '_gold') p.gold += bonusGoldAmount(p.level);
  else if (id === '_might') p.bonusDmg = (p.bonusDmg || 0) + 3;
  else if (id === '_guard') p.bonusArmor = (p.bonusArmor || 0) + 5;
  else if (id === '_potion') p.potions = Math.min(maxPotions(), p.potions + 3);
  else {
    p.skills[id] = (p.skills[id] || 0) + 1;
    if (SKILLS[id].type === 'active' && !p.hotbar.includes(id)) {
      const i = p.hotbar.indexOf(null);
      if (i >= 0) p.hotbar[i] = id;
    }
  }
  recalcStats(p);
  p.life = p.stats.maxLife;
  Game.dirty = true;
}

// ── 죽음 ──
function playerDie() {
  const p = player;
  // 불굴: 쓰러질 만큼 맞아도 한 번 버팀
  const u = effLevel(p, 'undying');
  if (u && !(p.cds.undying > 0) && !world.town) {
    const v = SKILLS.undying.vals(u);
    p.life = Math.max(1, p.stats.maxLife * v.heal / 100);
    p.invulnT = v.inv;
    p.cds.undying = v.cd;
    fxSprite('shield_orange', p.x, p.y, { follow: p, life: v.inv, scale: 0.8, alpha: 0.5, fade: 0.4 });
    fxRing(p.x, p.y, 10, 160, 0.7, '#ffd36a', 7);
    fxText(p.x, p.y, '불굴!', '#ffd36a', 20, { z: 90 });
    SFX.play('berserk');
    UI.message(`불굴! 죽음을 버텨냈습니다 (${v.cd}초 뒤 다시)`, '#ffd36a');
    return;
  }
  p.deaths = (p.deaths || 0) + 1;
  p.dead = true;
  p.life = 0;
  p.attack = p.leap = p.whirl = p.order = p.rush = p.quake = null;
  p.z = 0;
  SFX.play('pdie');
  fxBlood(p.x, p.y, 30, 30);
  fxDecal('blood', p.x, p.y, 1.4);
  Game.deathT = 1.4;
}

function respawn() {
  const p = player;
  const lost = Math.floor(p.gold * 0.1);
  p.gold -= lost;
  p.dead = false;
  p.life = p.stats.maxLife;
  p.fury = 30;
  p.slowT = 0; p.poisonT = 0;
  p.healLeft = 0;
  if (!world.town) {
    // 쓰러진 층은 그대로 두고, 층 입구로 가는 차원문을 남김
    const d = world.dungeon;
    for (const m of world.monsters) {
      m.aggro = false; m.windup = 0; m.act = null; m.pending = null; m.air = false; m.z = 0;
      m.hidden = !!m.ambushWait;
      if (!m.dead) m.life = m.maxLife;
    }
    world.projectiles.length = 0;
    world.hazards.length = 0;
    world.pools.length = 0;
    world.portal = { x: d.start.x + 50, y: d.start.y, kind: 'portal', t: 0 };
    Game.dungeonWorld = world;
    Game.goTown('death');
  }
  UI.message(lost ? `마을에서 깨어났습니다. 골드 ${lost}을 잃었습니다.` : '마을에서 깨어났습니다.', '#c9c1b3');
}


// ───────── 새 기술 ─────────
// 회전 도끼: 날아갔다가 되돌아오며 오가는 길의 적을 모두 벰
function throwBoomerang(aim, v) {
  const p = player, a = angleTo(p.x, p.y, aim.x, aim.y);
  p.facing = a;
  p.pose = 'throw'; p.poseT = 0; p.poseDur = 0.28;
  spawnProjectile({
    owner: 'player', type: 'axe', x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
    r: 18, mult: v.mult, pierce: 999, life: 4, angle: a, knock: 30, scale: 1.4, boomerang: { range: v.range, gone: 0, back: false },
  });
  SFX.play('throw');
}

// 사슬 올가미: 반경 안의 적을 모두 끌어와 기절
function chainSnare(v) {
  const p = player, pulled = [];
  p.pose = 'throw'; p.poseT = 0; p.poseDur = 0.3;
  for (const m of world.monsters) {
    if (!hittable(m) || m.stationary) continue;
    const d = dist(p.x, p.y, m.x, m.y);
    if (d > v.radius + m.r) continue;
    if (m.tier < 3) {
      const stop = p.r + m.r + 16;
      if (d > stop) { const a = angleTo(m.x, m.y, p.x, p.y), k = (d - stop) * 5.5; m.kvx = Math.cos(a) * k; m.kvy = Math.sin(a) * k; }
    }
    pulled.push(m);
    playerStrike(m, v.mult, { stun: v.stun });
  }
  world.skillFx.push({ kind: 'chains', t: 0, dur: 0.4, targets: pulled.slice(0, 14) });
  fxRing(p.x, p.y, v.radius, 24, 0.4, '#c8c8d8', 4);
  SFX.play('throw'); SFX.play('swing', 0.6);
  if (!pulled.length) UI.message('끌어올 적이 없습니다', '#c9c1b3');
}

// 공포의 포효: 적이 달아나고 받는 피해가 늘어남
function fearHowl(v) {
  const p = player;
  p.pose = 'roar'; p.poseT = 0; p.poseDur = 0.5;
  SFX.play('warcry'); fxShake(5);
  fxRing(p.x, p.y, 20, v.radius, 0.7, '#9a6aff', 7);
  fxSprite('dark_mist', p.x, p.y, { layer: 'top', scale: 0.9, alpha: 0.6 });
  for (const m of world.monsters) {
    if (!hittable(m) || dist(p.x, p.y, m.x, m.y) > v.radius + m.r) continue;
    m.vulnT = v.dur + 2; m.vulnPct = v.vuln;
    if (!m.aggro) aggroPack(m);
    if (m.tier < 3 && !m.stationary && !(m.act && m.act.kind === 'dive')) {
      m.act = { kind: 'flee', t: 0, dur: v.dur };
      m.windup = 0; m.pending = null; m.windupDur = m.baseWindup;
    }
    fxSprite('dark_mist', m.x, m.y, { layer: 'top', scale: 0.35, alpha: 0.7 });
  }
  fxText(p.x, p.y, '공포!', '#c9a8ff', 18, { z: 90 });
}

// 전쟁 깃발: 둘레에서 피해·회복이 오르고 적은 느려짐 (한 번에 하나)
function plantBanner(v) {
  const p = player;
  p.pose = 'slam'; p.poseT = 0; p.poseDur = 0.35;
  world.banner = { x: p.x, y: p.y, t: 0, dur: v.dur, v };
  SFX.play('warcry', 0.6); SFX.play('boom', 0.4);
  fxRing(p.x, p.y, 20, v.radius, 0.6, '#ffb84a', 6);
  fxDust(p.x, p.y, 8);
}

// 조상의 부름: 공격받지 않는 조상의 혼이 함께 싸움
function callAncestors(v) {
  const p = player, d = world.dungeon;
  p.pose = 'roar'; p.poseT = 0; p.poseDur = 0.5;
  for (const a of world.allies) fxSprite('dark_mist', a.x, a.y, { layer: 'top', scale: 0.5 });
  world.allies = [];
  const looks = ['battle_axe', 'greatsword', 'war_hammer', 'infantry_axe'];
  for (let i = 0; i < v.count; i++) {
    const ang = p.facing + Math.PI + (i - (v.count - 1) / 2) * 1.1;
    const s = d.freeSpot(p.x + Math.cos(ang) * 64, p.y + Math.sin(ang) * 64, 14) || { x: p.x, y: p.y };
    world.allies.push({ x: s.x, y: s.y, t: 0, dur: v.dur, mult: v.mult, facing: p.facing, atkCD: 0.3 + i * 0.25, atk: null, moving: false, walkPhase: 0,
      r: 14, stats: { speed: 245 }, path: null, slowT: 0, target: null, think: 0, seed: i, look: looks[i % looks.length] });
    fxSprite('dark_mist', s.x, s.y, { layer: 'top', scale: 0.6 });
    fxSprite('sparkle', s.x, s.y, { life: 1.2, fade: 0.5 });
  }
  SFX.play('revive'); SFX.play('warcry', 0.5);
  UI.message('조상들이 응답합니다!', '#a8d8ff');
}

// 선혈의 의식: 생명력을 바치고, 때릴 때마다 둘레의 적에게 피가 튐
function bloodRite(v) {
  const p = player;
  const cost = Math.round(p.life * v.lifeCost / 100);
  p.life = Math.max(1, p.life - cost);
  p.buffs.bloodrite = v.dur;
  p.bloodriteV = v;
  p.pose = 'roar'; p.poseT = 0; p.poseDur = 0.4;
  fxBlood(p.x, p.y, 40, 24);
  fxRing(p.x, p.y, 10, 130, 0.6, '#d0202a', 7);
  fxText(p.x, p.y, `-${cost}`, '#ff5a4a', 15, { z: 60 });
  SFX.play('berserk');
  UI.message('선혈의 의식!', '#ff5a4a');
}

// 천둥 강림: 커서 둘레에 낙뢰를 차례로
function thunderCall(aim, v) {
  const p = player;
  p.pose = 'roar'; p.poseT = 0; p.poseDur = 0.5;
  world.skillFx.push({ kind: 'thunder', t: 0, next: 0.15, left: v.bolts, x: aim.x, y: aim.y, v, hit: new Set() });
  fxRing(aim.x, aim.y, 20, v.radius, 0.5, '#a8c8ff', 4);
  SFX.play('zap', 0.6);
}

// 새 기술의 지속 효과: 낙뢰, 사슬, 깃발, 조상의 혼
function updateSkillFx(dt) {
  const p = player, d = world.dungeon;
  for (let i = world.skillFx.length - 1; i >= 0; i--) {
    const f = world.skillFx[i];
    f.t += dt;
    if (f.kind === 'thunder') {
      while (f.left > 0 && f.t >= f.next) {
        f.next += 0.16; f.left--;
        const cands = world.monsters.filter(m => hittable(m) && dist(f.x, f.y, m.x, m.y) < f.v.radius + m.r);
        const fresh = cands.filter(m => !f.hit.has(m.id));
        const m = pick(fresh.length ? fresh : cands);
        let bx, by;
        if (m) { bx = m.x; by = m.y; f.hit.add(m.id); playerStrike(m, f.v.mult, { stun: f.v.stun, proc: true, color: '#cfe8ff' }); }
        else { const a = Math.random() * TAU, r = Math.random() * f.v.radius; bx = f.x + Math.cos(a) * r; by = f.y + Math.sin(a) * r; }
        if (!fxSprite('thunderstrike', bx, by, { layer: 'top', scale: 0.9 })) fxSparks(bx, by, 60, 12, '#cfe8ff', 200);
        world.flashes.push({ x: bx, y: by, r: 260, life: 0.25, color: [170, 200, 255] });
        fxDecal('scorch', bx, by, 0.4);
        SFX.play('zap', 0.5);
        if (chance(0.4)) fxShake(3);
      }
      if (f.left <= 0 && f.t > f.next) world.skillFx.splice(i, 1);
    } else if (f.t >= f.dur) world.skillFx.splice(i, 1);
  }
  // 전쟁 깃발
  const b = world.banner;
  let inside = false;
  if (b) {
    b.t += dt;
    if (b.t >= b.dur) { world.banner = null; fxDust(b.x, b.y, 6); }
    else {
      inside = !p.dead && dist(p.x, p.y, b.x, b.y) < b.v.radius;
      if (inside) healPlayer(p.stats.maxLife * b.v.regen / 100 * dt);
      const mc = typeof Merc !== 'undefined' && Merc.active();
      if (mc && dist(mc.x, mc.y, b.x, b.y) < b.v.radius) mc.life = Math.min(mc.stats.maxLife, mc.life + mc.stats.maxLife * b.v.regen / 100 * dt);
      for (const m of world.monsters) if (!m.dead && dist(m.x, m.y, b.x, b.y) < b.v.radius + m.r) m.slow = Math.max(m.slow, 0.25);
    }
  }
  if (!!p.bannerIn !== inside) { p.bannerIn = inside; recalcStats(p); }
  // 조상의 혼
  for (let i = world.allies.length - 1; i >= 0; i--) {
    const a = world.allies[i];
    a.t += dt; a.atkCD -= dt; a.think -= dt;
    if (a.t >= a.dur || world.town) { fxSprite('dark_mist', a.x, a.y, { layer: 'top', scale: 0.5 }); world.allies.splice(i, 1); continue; }
    if (a.atk) {
      a.atk.t += dt; a.moving = false;
      const tg = a.atk.target;
      if (tg && !tg.dead) a.facing = angleTo(a.x, a.y, tg.x, tg.y);
      if (!a.atk.hit && a.atk.t >= a.atk.dur * 0.55) {
        a.atk.hit = true;
        if (tg && hittable(tg) && dist(a.x, a.y, tg.x, tg.y) < 70 + tg.r) {
          const { d: dmg, crit } = rollPlayerDamage(a.mult, tg);
          damageMonster(tg, dmg, crit, { color: '#a8d8ff' });
          fxSprite('cleave', tg.x, tg.y, { dir: flareDir(a.facing), scale: 0.7, alpha: 0.6 });
          SFX.play('hit', 0.35);
        }
      }
      if (a.atk.t >= a.atk.dur) { a.atk = null; a.atkCD = 0.5; }
      continue;
    }
    if (dist(a.x, a.y, p.x, p.y) > 1100) { const s = d.freeSpot(p.x - 50, p.y + 40, 14); a.x = s.x; a.y = s.y; a.path = null; }
    if (a.think <= 0) {
      a.think = 0.3;
      let best = null, bd = Infinity;
      for (const m of world.monsters) {
        if (!hittable(m) || m.ambushWait) continue;
        const dm = dist(a.x, a.y, m.x, m.y);
        if (dm > 430 || dist(p.x, p.y, m.x, m.y) > 600) continue;
        if (dm < bd) { bd = dm; best = m; }
      }
      a.target = best;
    }
    const tg = a.target;
    if (tg && hittable(tg)) {
      const dd = dist(a.x, a.y, tg.x, tg.y);
      if (dd <= 48 + tg.r) { a.moving = false; a.facing = angleTo(a.x, a.y, tg.x, tg.y); if (a.atkCD <= 0) a.atk = { t: 0, dur: 0.42, target: tg, hit: false }; }
      else navigate(a, tg.x, tg.y, dt, 42 + tg.r);
    } else if (dist(a.x, a.y, p.x, p.y) > 120) {
      const ang = (p.facing || 0) + Math.PI + (a.seed - 1) * 0.9;
      navigate(a, p.x + Math.cos(ang) * 70, p.y + Math.sin(ang) * 70, dt, 30);
    } else a.moving = false;
  }
}
