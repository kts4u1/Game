'use strict';
// ───────── 플레이어: 능력치, 이동, 공격, 스킬, 소지품 ─────────

function createPlayer() {
  const p = {
    x: 0, y: 0, r: 14, z: 0, facing: 0.8, level: 1, xp: 0, life: 100, fury: 50, gold: 0, potions: 3, bonusLife: 0,
    skills: {}, hotbar: [null, null, null, null], cds: {},
    equipment: { weapon: null, shield: null, helm: null, amulet: null, armor: null, ring1: null, ring2: null, gloves: null, belt: null, boots: null },
    inventory: new Array(40).fill(null), stash: new Array(STASH_SIZE).fill(null), elixirs: {}, poisonT: 0, poisonDps: 0,
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
  s.res = Math.min(75, s.resAll);
  s.cdr = Math.min(40, s.cdr);
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
  return dist(p.x, p.y, tx, ty) <= stopDist;
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
  p.moving = false;

  if (p.tp) {
    p.tp.t += dt;
    if (chance(dt * 30)) fxSparks(p.x + rand(-20, 20), p.y + rand(-20, 20), rand(10, 70), 1, '#8fd0ff', 40);
    if (Input.keyDir() !== null || (p.order && p.order.type === 'move')) { p.tp = null; UI.message('귀환이 취소되었습니다', '#c9c1b3'); }
    else if (p.tp.t >= p.tp.dur) { p.tp = null; Town.castPortalDone(); }
    return;
  }
  if (p.leap) { updateLeap(dt); return; }
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
  if (kind === 'bash') {
    const cost = skillCost(SKILLS.bash.vals(effLevel(p, 'bash')));
    if (p.fury < cost) { kind = 'basic'; noFury(); }
    else { p.fury -= cost; dur *= 1.1; }
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
  const bash = a.kind === 'bash';
  fxSprite('cleave', p.x + Math.cos(a.angle) * 30, p.y + Math.sin(a.angle) * 30, { dir: flareDir(a.angle), scale: bash ? 1.25 : 0.95, alpha: 0.8 });
  const v = bash ? SKILLS.bash.vals(effLevel(p, 'bash')) : null;
  const opts = bash ? { knock: v.knock, stun: v.stun, fury: 2 } : { fury: 5 };
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

function noFury() {
  if (Game.time - (Game.lastNoFury || 0) > 1.2) {
    Game.lastNoFury = Game.time;
    UI.message('분노가 부족합니다', '#ffad4a');
    SFX.play('nope');
  }
}

// ── 스킬 ──
function useSkill(slot) {
  const p = player;
  if (!p || p.dead || p.leap || Game.state !== 'playing') return;
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
  if (id === 'bash') {
    const hov = Input.hover && Input.hover.kind === 'monster' ? Input.hover.ref : null;
    const target = hov || nearestMonsterNear(aim.x, aim.y, 120);
    if (target) p.order = { type: 'attack', target, skill: 'bash' };
    else if (!p.attack) startAttack('bash', null, aim.x, aim.y);
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
}

// ── 소지품 ──
function canEquip(item) { return player.level >= item.req; }

// ── 아이템 위치: { c: 'inv' | 'eq' | 'stash', i: 칸 번호, k: 장비 칸 이름 } ──
function itemAt(loc) {
  const p = player;
  return loc.c === 'eq' ? p.equipment[loc.k] : loc.c === 'inv' ? p.inventory[loc.i] : p.stash[loc.i];
}
function putAt(loc, it) {
  const p = player;
  if (loc.c === 'eq') p.equipment[loc.k] = it || null;
  else if (loc.c === 'inv') p.inventory[loc.i] = it || null;
  else p.stash[loc.i] = it || null;
}
function sameLoc(a, b) { return a.c === b.c && (a.c === 'eq' ? a.k === b.k : a.i === b.i); }
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
    const list = to.c === 'inv' ? p.inventory : p.stash;
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
const SORT_SLOTS = ['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'];
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
  if (p.potions >= MAX_POTIONS) { UI.message(`물약은 ${MAX_POTIONS}개까지 들 수 있습니다`, '#c9c1b3'); return; }
  if (p.gold < price) { UI.message('골드가 부족합니다', '#ff7a6a'); SFX.play('nope'); return; }
  p.gold -= price;
  p.potions++;
  SFX.play('buyPotion');
}

// ── 레벨업 카드 ──
function rollCards(first) {
  const p = player;
  const ids = Object.keys(SKILLS);
  const learnedActives = ids.filter(id => SKILLS[id].type === 'active' && p.skills[id]);
  let pool = ids.filter(id => {
    const lv = p.skills[id] || 0;
    if (lv >= SKILLS[id].max) return false;
    if (SKILLS[id].type === 'active' && !lv && learnedActives.length >= 4) return false;
    if (first && SKILLS[id].type !== 'active') return false;
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
    const cand = ids.filter(id => SKILLS[id].type === 'active' && !p.skills[id]);
    if (cand.length) out[out.length - 1] = pick(cand);
  }
  for (const b of BONUS_CARDS) if (out.length < 3) out.push(b.id);
  return out;
}

function learnSkill(id) {
  const p = player;
  if (id === '_life') p.bonusLife += 25;
  else if (id === '_gold') p.gold += 500;
  else if (id === '_potion') p.potions = Math.min(MAX_POTIONS, p.potions + 3);
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
  p.dead = true;
  p.life = 0;
  p.attack = p.leap = p.whirl = p.order = null;
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
