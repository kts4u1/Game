'use strict';
// ───────── 몬스터 · 전투 · 전리품 · 투사체 ─────────

let world = null;   // 현재 층 상태
let player = null;  // 플레이어

function xpToNext(L) { return Math.round(40 * Math.pow(L, 1.65) + 20); }

function effLevel(p, id) {
  const b = p.skills[id] || 0;
  if (!b) return 0;
  return Math.min(SKILLS[id].max + 3, b + ((p.stats && p.stats.allSkills) || 0));
}

// ── 몬스터 생성 ──
function spawnMonster(type, x, y, mlvl, tier = 0, opts = {}) {
  const T = MONSTERS[type];
  const k = mlvl - 1;
  const lm = 1 + 0.45 * k + 0.02 * k * k;
  const dm = 1 + 0.26 * k + 0.008 * k * k;
  const m = {
    id: uid(), type, x, y, r: T.r, mlvl, tier, mods: opts.mods || [], pack: opts.pack || 0,
    name: T.name, life: T.life * lm, dmg: [T.dmg[0] * dm, T.dmg[1] * dm], speed: T.speed * rand(0.92, 1.08),
    atkRange: T.atkRange || 40, atkCD: T.atkCD, windupDur: T.windup, ranged: T.ranged || null,
    xp: T.xp * (1 + 0.5 * k), aggro: false, atkTimer: rand(0.2, 1), windup: 0, strikeT: 0, stun: 0, slow: 0,
    kvx: 0, kvy: 0, hitFlash: 0, dead: false, deadT: 0, walkPhase: Math.random() * 10, moving: false,
    facing: Math.random() * TAU, seed: Math.random() * 10, losT: Math.random() * 0.3, hasLos: false,
    scale: 1, pal: {}, lifeSteal: T.lifeSteal || 0, special: 0, flowT: 0, stuckT: 0,
  };
  if (tier === 1) { m.life *= 2.6; m.dmg = m.dmg.map(d => d * 1.3); m.speed *= 1.12; m.xp *= 3; m.scale = 1.12; }
  if (tier === 2) { m.life *= 4; m.dmg = m.dmg.map(d => d * 1.5); m.xp *= 6; m.scale = 1.22; m.name = opts.name; }
  if (tier === 3) {
    m.life *= 18; m.dmg = m.dmg.map(d => d * 2); m.xp *= 25; m.scale = opts.scale || 1.8;
    m.r = T.r * m.scale * 0.8; m.name = opts.name; m.pal = opts.pal || {}; m.special = 4; m.atkRange += 22; m.windupDur *= 1.3;
  }
  for (const mod of m.mods) {
    if (mod === 'fast') { m.speed *= 1.35; m.atkCD *= 0.75; }
    if (mod === 'strong') m.dmg = m.dmg.map(d => d * 1.5);
    if (mod === 'tough') m.life *= 1.6;
    if (mod === 'vamp') m.lifeSteal += 0.3;
  }
  m.maxLife = m.life = Math.round(m.life);
  return m;
}

function spawnPack(room, type, tier, packId) {
  const d = world.dungeon;
  const T = MONSTERS[type];
  let n = T.pack ? randInt(T.pack[0], T.pack[1]) : randInt(3, 5);
  if (type === 'brute') n = randInt(1, 3);
  if (type === 'wraith') n = randInt(2, 4);
  if (tier === 1) n = Math.max(3, Math.min(n, 4));
  const c = d.randomPointInRoom(room, 2);
  for (let i = 0; i < n; i++) {
    let x = c.x, y = c.y;
    for (let a = 0; a < 10; a++) {
      const tx = c.x + rand(-70, 70), ty = c.y + rand(-70, 70);
      if (!d.circleBlocked(tx, ty, 16)) { x = tx; y = ty; break; }
    }
    const ml = world.mlvl + (chance(0.3) ? 1 : 0) + (tier ? 1 : 0);
    world.monsters.push(spawnMonster(type, x, y, ml, tier, { pack: packId }));
  }
  if (type === 'fallen' && world.floor >= 2) world.monsters.push(spawnMonster('shaman', c.x + 20, c.y + 20, world.mlvl, tier, { pack: packId }));
}

function populateFloor() {
  const d = world.dungeon, f = world.floor;
  const types = Object.keys(MONSTERS).filter(t => MONSTERS[t].minFloor <= f && MONSTERS[t].weight > 0);
  const rooms = d.rooms.filter(r => r !== d.startRoom);
  const champRooms = shuffle(rooms.slice()).slice(0, f === 1 ? 1 : randInt(1, 2));
  const uniqCands = rooms.filter(r => !champRooms.includes(r) && r !== d.stairsRoom);
  const uniqueRoom = f >= 2 && uniqCands.length ? pick(uniqCands) : null;
  let packId = 1;
  for (const r of rooms) {
    const packs = 1 + (r.w * r.h > 70 ? 1 : 0) + (chance(0.3) ? 1 : 0);
    for (let k = 0; k < packs; k++) {
      const type = weightedPick(types, t => MONSTERS[t].weight);
      spawnPack(r, type, k === 0 && champRooms.includes(r) ? 1 : 0, packId++);
    }
    if (r === uniqueRoom) {
      const type = weightedPick(types.filter(t => t !== 'fallen'), t => MONSTERS[t].weight);
      const mods = shuffle(Object.keys(ELITE_MODS)).slice(0, f >= 6 ? 3 : 2);
      const name = `${pick(UNIQUE_NAME_A)} ${pick(UNIQUE_NAME_B)}`;
      const c = d.randomPointInRoom(r, 2);
      const pid = packId++;
      world.monsters.push(spawnMonster(type, c.x, c.y, world.mlvl + 2, 2, { mods, name, pack: pid }));
      for (let i = 0; i < 3; i++) {
        const p = d.randomPointInRoom(r, 1);
        world.monsters.push(spawnMonster(type, p.x, p.y, world.mlvl + 1, 0, { pack: pid }));
      }
    }
  }
  if (isBossFloor(f)) {
    const B = BOSSES[(f / 5 - 1) % BOSSES.length];
    const r = d.stairsRoom;
    const pos = d.randomPointInRoom(r, 2);
    world.monsters.push(spawnMonster(B.type, pos.x, pos.y, world.mlvl + 3, 3, { name: B.name, scale: B.scale, pal: B.pal, pack: packId++ }));
    d.stairs.open = false;
  }
  // 보물 상자
  world.chests = [];
  for (const r of shuffle(rooms.slice()).slice(0, randInt(2, 3))) {
    const p = d.randomPointInRoom(r, 1);
    world.chests.push({ x: p.x, y: p.y, open: false, t: 0 });
  }
}

function aggroPack(m) {
  m.aggro = true;
  if (!m.pack) return;
  for (const o of world.monsters) if (o.pack === m.pack && !o.dead) o.aggro = true;
}

// ── 몬스터 AI ──
function updateMonsters(dt) {
  const p = player, d = world.dungeon;
  d.updateFlow(p.x, p.y);
  const active = [];
  for (const m of world.monsters) {
    if (m.dead) { m.deadT += dt; continue; }
    const dp = dist(m.x, m.y, p.x, p.y);
    if (dp > 1100 && !m.aggro) continue;
    active.push(m);
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    m.strikeT = Math.max(0, m.strikeT - dt);
    m.atkTimer -= dt;
    m.slow = Math.max(0, m.slow - dt);
    if (Math.abs(m.kvx) + Math.abs(m.kvy) > 2) {
      d.moveCircle(m, m.kvx * dt, m.kvy * dt);
      const f = Math.pow(0.004, dt);
      m.kvx *= f; m.kvy *= f;
    }
    m.moving = false;
    if (m.stun > 0) { m.stun -= dt; m.windup = 0; continue; }
    if (p.dead) continue;
    m.losT -= dt;
    if (m.losT <= 0) { m.losT = 0.25 + Math.random() * 0.1; m.hasLos = dp < 750 && d.los(m.x, m.y, p.x, p.y); }
    if (!m.aggro) {
      if (dp < (m.tier === 3 ? 440 : 360) && m.hasLos) aggroPack(m);
      else continue;
    }
    if (m.windup > 0) {
      m.windup -= dt;
      m.facing = angleTo(m.x, m.y, p.x, p.y);
      if (m.windup <= 0) resolveMonsterAttack(m);
      continue;
    }
    if (m.tier === 3) {
      m.special -= dt;
      if (m.special <= 0 && dp < 520) { bossSlam(m); m.special = rand(5, 7); }
    }
    let tx = null, ty = null, away = false;
    if (m.ranged) {
      if (dp <= m.ranged.range && m.hasLos) {
        m.facing = angleTo(m.x, m.y, p.x, p.y);
        if (m.atkTimer <= 0) { m.windup = m.windupDur; continue; }
        if (dp < m.ranged.keep) { tx = p.x; ty = p.y; away = true; }
      } else { tx = p.x; ty = p.y; }
    } else {
      const reach = m.atkRange + p.r;
      if (dp <= reach) {
        m.facing = angleTo(m.x, m.y, p.x, p.y);
        if (m.atkTimer <= 0) m.windup = m.windupDur;
        continue;
      }
      tx = p.x; ty = p.y;
    }
    if (tx === null) continue;
    // 시야가 있으면 직진, 없거나 끼었으면 흐름장을 따라감
    m.flowT -= dt;
    if (!away && (!m.hasLos || m.flowT > 0)) {
      const s = d.flowStep(m.x, m.y);
      if (s) { tx = s.x; ty = s.y; }
    }
    let a = angleTo(m.x, m.y, tx, ty);
    if (away) a += Math.PI;
    const sp = m.speed * (m.slow > 0 ? 0.5 : 1) * dt;
    const ox = m.x, oy = m.y;
    d.moveCircle(m, Math.cos(a) * sp, Math.sin(a) * sp);
    const moved = dist(ox, oy, m.x, m.y);
    if (moved < sp * 0.3) { m.stuckT += dt; if (m.stuckT > 0.35) { m.flowT = 1.2; m.stuckT = 0; } } else m.stuckT = 0;
    m.walkPhase += moved * 0.12;
    m.moving = moved > 0.1;
    if (!away) m.facing = a;
  }
  // 서로 겹치지 않게 밀어내기
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const dd = Math.hypot(dx, dy) || 0.01;
      if (dd < rr) {
        const push = (rr - dd) / 2;
        const nx = dx / dd, ny = dy / dd;
        d.moveCircle(a, -nx * push, -ny * push);
        d.moveCircle(b, nx * push, ny * push);
      }
    }
    if (!p.dead && !p.leap) {
      const dx = a.x - p.x, dy = a.y - p.y;
      const dd = Math.hypot(dx, dy) || 0.01;
      const rr = a.r + p.r;
      if (dd < rr) {
        const push = rr - dd;
        d.moveCircle(a, dx / dd * push * 0.8, dy / dd * push * 0.8);
        d.moveCircle(p, -dx / dd * push * 0.2, -dy / dd * push * 0.2);
      }
    }
  }
}

function resolveMonsterAttack(m) {
  const p = player;
  m.atkTimer = m.atkCD * rand(0.9, 1.15);
  m.strikeT = 0.25;
  const dmg = rand(m.dmg[0], m.dmg[1]);
  if (m.ranged) {
    const a = angleTo(m.x, m.y, p.x, p.y) + rand(-0.06, 0.06);
    const fire = m.ranged.proj === 'fireball';
    spawnProjectile({
      owner: 'monster', type: m.ranged.proj, x: m.x + Math.cos(a) * 16, y: m.y + Math.sin(a) * 16,
      vx: Math.cos(a) * m.ranged.speed, vy: Math.sin(a) * m.ranged.speed, r: fire ? 10 : 6, dmg, src: m, life: 1.6, angle: a,
    });
    SFX.play(fire ? 'fire' : 'arrow');
  } else {
    if (dist(m.x, m.y, p.x, p.y) <= m.atkRange + p.r + 16) damagePlayer(dmg, m, { melee: true });
    else SFX.play('swing');
  }
}

function bossSlam(m) {
  const p = player;
  world.hazards.push({ x: p.x, y: p.y, r: 120, t: 0, delay: 1.0, dmg: m.dmg[1] * 1.4, src: m, kind: 'slam' });
  m.windup = 0.5; m.windupDur = Math.max(m.windupDur, 0.5);
  m.atkTimer = Math.max(m.atkTimer, 1.2);
}

// ── 피해 처리 ──
function rollPlayerDamage(mult) {
  const s = player.stats;
  let d = rand(s.minDmg, s.maxDmg) * (1 + s.dmgPct / 100) * mult;
  const crit = Math.random() * 100 < s.crit;
  if (crit) d *= 1 + s.critDmg / 100;
  return { d: Math.max(1, Math.round(d)), crit };
}

function healPlayer(n) {
  const p = player;
  p.life = Math.min(p.stats.maxLife, p.life + n);
}

function playerStrike(m, mult, opts = {}) {
  if (m.dead) return 0;
  const { d, crit } = rollPlayerDamage(mult);
  damageMonster(m, d, crit, opts);
  const s = player.stats;
  if (s.lifeSteal > 0) healPlayer(Math.min(d * s.lifeSteal / 100, s.maxLife * 0.06));
  if (opts.fury) player.fury = Math.min(s.maxFury, player.fury + opts.fury);
  if (!m.dead && opts.knock && m.tier < 3) {
    const a = angleTo(player.x, player.y, m.x, m.y);
    m.kvx = Math.cos(a) * opts.knock; m.kvy = Math.sin(a) * opts.knock;
  }
  if (!m.dead && opts.stun) { m.stun = Math.max(m.stun, m.tier === 3 ? opts.stun * 0.3 : opts.stun); m.windup = 0; }
  if (!opts.proc && player.procCD <= 0) {
    if (s.procLightning && chance(s.procLightning / 100)) { chainLightning(m); player.procCD = 0.3; }
    else if (s.procFireNova && chance(s.procFireNova / 100)) { fireNova(m.x, m.y); player.procCD = 0.3; }
  }
  SFX.play(crit ? 'crit' : 'hit');
  return d;
}

function damageMonster(m, amount, crit, opts = {}) {
  if (m.dead) return;
  m.life -= amount;
  m.hitFlash = 0.12;
  if (!m.aggro) aggroPack(m);
  fxText(m.x, m.y, crit ? `${amount}!` : `${amount}`, opts.color || (crit ? '#ffd24a' : '#f2ede4'), crit ? 22 : 15, { crit, z: 52 * m.scale });
  const z = 30 * m.scale;
  if (m.type === 'skeleton' || m.type === 'archer') fxSparks(m.x, m.y, z, 4, '#e8e2d0', 120);
  else if (m.type === 'wraith') fxSparks(m.x, m.y, z, 5, '#7ff2ff', 120);
  else fxBlood(m.x, m.y, z, crit ? 10 : 5, m.type === 'zombie' ? '#4a5a1c' : '#8c1014');
  if (m.life <= 0) killMonster(m);
}

function killMonster(m) {
  m.dead = true; m.deadT = 0; m.life = 0; m.windup = 0;
  m.fallDir = chance(0.5) ? 1 : -1;
  player.kills++;
  gainXp(m.xp);
  const bony = m.type === 'skeleton' || m.type === 'archer';
  if (bony) { SFX.play('bones'); fxSparks(m.x, m.y, 20, 10, '#d8d1bd', 140); }
  else { SFX.play('die'); fxBlood(m.x, m.y, 30, 16); fxDecal('blood', m.x, m.y, m.scale * rand(0.8, 1.2), m.type === 'zombie' ? 'rgba(40,52,14,.8)' : 'rgba(70,6,8,.8)'); }
  if (m.type === 'wraith') fxSparks(m.x, m.y, 30, 20, '#7ff2ff', 200);
  dropLoot(m.x, m.y, m.mlvl, m.tier);
  if (m.mods.includes('fire')) world.hazards.push({ x: m.x, y: m.y, r: 110, t: 0, delay: 0.7, dmg: m.dmg[1] * 1.2, src: m, kind: 'fire' });
  if (m.tier === 2) UI.message(`${m.name} 처치!`, RARITY[3].color);
  if (m.tier === 3) {
    world.dungeon.stairs.open = true;
    UI.message(`${m.name} 처치! 아래로 가는 계단이 열렸습니다.`, '#ff9a4a');
    fxShake(14);
    fxRing(m.x, m.y, 10, 300, 1.2, '#ff8a3a', 8);
  }
}

function damagePlayer(amount, src, opts = {}) {
  const p = player;
  if (p.dead || p.leap || Game.godMode) return;
  const s = p.stats;
  const red = damageReduction(p, src ? src.mlvl : world.mlvl);
  const fireMod = src && src.mods && src.mods.includes('fire');
  let dmg = amount * (1 - red);
  if (opts.fire) dmg = amount * (1 - red * 0.4);
  if (fireMod && opts.melee) { dmg *= 1.3; fxEmbers(p.x, p.y, 8); }
  dmg = Math.max(1, Math.round(dmg));
  p.life -= dmg;
  p.hurtT = 0.15;
  p.fury = Math.min(s.maxFury, p.fury + 2);
  fxText(p.x, p.y, `-${dmg}`, '#ff5a4a', 15, { z: 60 });
  fxBlood(p.x, p.y, 34, 5);
  SFX.play('hurt');
  UI.hurt();
  if (src && opts.melee) {
    if (s.thorns > 0 && !src.dead) damageMonster(src, s.thorns, false, { color: '#c7a0ff' });
    if (src.mods && src.mods.includes('cold')) { p.slowT = 2; fxSparks(p.x, p.y, 30, 8, '#9fdcff', 100); }
    if (src.lifeSteal && !src.dead) src.life = Math.min(src.maxLife, src.life + dmg * src.lifeSteal);
  }
  if (p.life <= 0) playerDie();
}

function chainLightning(start) {
  SFX.play('zap');
  const hit = new Set([start.id]);
  let cur = start;
  const pts = [{ x: player.x, y: player.y, z: 40 }, { x: cur.x, y: cur.y }];
  playerStrike(cur, 0.8, { proc: true, color: '#bfe4ff' });
  for (let j = 0; j < 4; j++) {
    let best = null, bd = 230;
    for (const m of world.monsters) {
      if (m.dead || hit.has(m.id)) continue;
      const dd = dist(cur.x, cur.y, m.x, m.y);
      if (dd < bd) { bd = dd; best = m; }
    }
    if (!best) break;
    hit.add(best.id);
    pts.push({ x: best.x, y: best.y });
    playerStrike(best, 0.8, { proc: true, color: '#bfe4ff' });
    cur = best;
  }
  // 지그재그 번개 모양
  const jag = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let k = 0; k < 5; k++) {
      const t = k / 5;
      jag.push({ x: lerp(a.x, b.x, t) + (k ? rand(-12, 12) : 0), y: lerp(a.y, b.y, t) + (k ? rand(-12, 12) : 0), z: lerp(a.z || 30, 30, t) + (k ? rand(-8, 8) : 0) });
    }
  }
  jag.push(pts[pts.length - 1]);
  fxBolt(jag);
  world.flashes.push({ x: start.x, y: start.y, r: 260, life: 0.2, color: [120, 170, 255] });
}

function fireNova(x, y) {
  SFX.play('fire');
  fxRing(x, y, 10, 150, 0.45, '#ff8a2a', 10);
  fxEmbers(x, y, 30, '#ff8a2a', 90);
  fxDecal('scorch', x, y, 1.6);
  world.flashes.push({ x, y, r: 320, life: 0.35, color: [255, 140, 50] });
  for (const m of world.monsters) if (!m.dead && dist(x, y, m.x, m.y) < 150 + m.r) playerStrike(m, 1.2, { proc: true, color: '#ffae5a' });
}

// ── 전리품 ──
function dropLoot(x, y, mlvl, tier) {
  const s = player.stats;
  let items = 0, gold = 0, potion = 0;
  if (tier === 0) { items = chance(0.2) ? 1 : 0; gold = 0.28; potion = 0.07; }
  else if (tier === 1) { items = randInt(1, 2); gold = 1; potion = 0.35; }
  else if (tier === 2) { items = randInt(2, 3); gold = 1; potion = 0.6; }
  else if (tier === 3) { items = randInt(5, 6); gold = 1; potion = 1; }
  else if (tier === 4) { items = randInt(2, 3); gold = 1; potion = 0.5; }
  const ilvl = mlvl + (tier === 3 ? 2 : tier >= 1 ? 1 : 0);
  for (let i = 0; i < items; i++) {
    let r = rollRarity(mlvl, tier, s.mf);
    if (tier === 3 && i === 0) r = Math.max(r, 2);
    spawnGround('item', x, y, { item: generateItem(ilvl, r) });
  }
  if (chance(gold)) {
    const amt = Math.round(randInt(3, 9) * (1 + mlvl * 0.6) * (1 + s.gf / 100) * (tier ? 2 + tier : 1));
    spawnGround('gold', x, y, { amount: amt });
  }
  if (chance(potion)) spawnGround('potion', x, y, {});
}

function spawnGround(kind, x, y, data) {
  const d = world.dungeon;
  let tx = x, ty = y;
  for (let a = 0; a < 12; a++) {
    const nx = x + rand(-55, 55), ny = y + rand(-55, 55);
    if (!d.circleBlocked(nx, ny, 10) && d.los(x, y, nx, ny)) { tx = nx; ty = ny; break; }
  }
  const g = Object.assign({ id: uid(), kind, sx: x, sy: y, x: tx, y: ty, tx, ty, z: 0, t: 0 }, data);
  world.ground.push(g);
  if (kind === 'item') {
    const r = g.item.rarity;
    if (r === 3) { fxBeam(tx, ty, '#ffb84a', 4); SFX.play('unique'); UI.message(`유니크 아이템이 떨어졌습니다: ${g.item.name}`, RARITY[3].color); }
    else if (r === 2) { fxBeam(tx, ty, '#f4e06d', 1.6); SFX.play('rare'); }
  }
  return g;
}

function updateGround(dt) {
  const p = player;
  for (let i = world.ground.length - 1; i >= 0; i--) {
    const g = world.ground[i];
    if (g.t < 0.45) {
      g.t += dt;
      const k = Math.min(1, g.t / 0.45);
      g.x = lerp(g.sx, g.tx, k); g.y = lerp(g.sy, g.ty, k);
      g.z = Math.sin(k * Math.PI) * 40;
    }
    if (p.dead || g.t < 0.3) continue;
    if ((g.kind === 'gold' || g.kind === 'potion') && dist(p.x, p.y, g.x, g.y) < 38) {
      if (g.kind === 'gold') { p.gold += g.amount; fxText(g.x, g.y, `+${g.amount} 골드`, '#e8c35a', 13, { z: 20 }); SFX.play('gold'); }
      else {
        if (p.potions >= 12) continue;
        p.potions++; fxText(g.x, g.y, '생명력 물약', '#ff6b6b', 13, { z: 20 }); SFX.play('pickup');
      }
      world.ground.splice(i, 1);
    }
  }
}

function pickupGround(g) {
  const p = player;
  const idx = world.ground.indexOf(g);
  if (idx < 0) return;
  if (g.kind === 'item') {
    const slot = p.inventory.indexOf(null);
    if (slot < 0) { UI.message('가방이 가득 찼습니다', '#ff7a6a'); SFX.play('nope'); return; }
    p.inventory[slot] = g.item;
    world.ground.splice(idx, 1);
    SFX.play(g.item.rarity >= 2 ? 'rare' : 'pickup');
    UI.message(`${g.item.name} 획득`, RARITY[g.item.rarity].color);
    UI.refreshPanels();
    Game.dirty = true;
  } else {
    // 금화/물약은 근처로 가면 자동으로 주움
    g.t = Math.max(g.t, 0.3);
    p.x = lerp(p.x, g.x, 0.9); p.y = lerp(p.y, g.y, 0.9);
  }
}

function openChest(c) {
  if (c.open) return;
  c.open = true;
  SFX.play('chest');
  fxSparks(c.x, c.y, 20, 14, '#ffd27a', 120);
  dropLoot(c.x, c.y, world.mlvl + 1, 4);
}

// ── 투사체 ──
function spawnProjectile(o) {
  world.projectiles.push(Object.assign({ life: 2, hit: new Set(), z: 30, spin: 0, pierce: 0 }, o));
}

function updateProjectiles(dt) {
  const d = world.dungeon, p = player;
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    pr.life -= dt;
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.spin += dt * 22;
    let dead = pr.life <= 0;
    if (!dead && d.solidAt(pr.x, pr.y)) {
      dead = true;
      if (pr.type === 'fireball') { fxEmbers(pr.x, pr.y, 12); fxDecal('scorch', pr.x, pr.y, 0.5); }
      else fxSparks(pr.x, pr.y, 25, 5, '#d8c9a0', 90);
    }
    if (pr.type === 'fireball' && chance(0.6)) fxEmbers(pr.x, pr.y, 1, '#ff7a22', 4);
    if (!dead && pr.owner === 'player') {
      for (const m of world.monsters) {
        if (m.dead || pr.hit.has(m.id)) continue;
        if (Math.abs(m.x - pr.x) > 50 || Math.abs(m.y - pr.y) > 50) continue;
        if (dist(m.x, m.y, pr.x, pr.y) < m.r + pr.r) {
          pr.hit.add(m.id);
          playerStrike(m, pr.mult, { knock: 70 });
          pr.pierce--;
          if (pr.pierce < 0) { dead = true; break; }
        }
      }
    } else if (!dead && !p.dead && dist(p.x, p.y, pr.x, pr.y) < p.r + pr.r) {
      dead = true;
      damagePlayer(pr.dmg, pr.src, { fire: pr.type === 'fireball' });
      if (pr.type === 'fireball') fxEmbers(pr.x, pr.y, 14);
    }
    if (dead) world.projectiles.splice(i, 1);
  }
}

// 지연 범위 공격(보스 내려찍기, 화염 강화 폭발)
function updateHazards(dt) {
  const p = player;
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i];
    h.t += dt;
    if (h.t < h.delay) continue;
    world.hazards.splice(i, 1);
    if (h.kind === 'fire') {
      SFX.play('fire');
      fxRing(h.x, h.y, 10, h.r, 0.4, '#ff8a2a', 10);
      fxEmbers(h.x, h.y, 30, '#ff7a22', 60);
      fxDecal('scorch', h.x, h.y, 1.3);
      world.flashes.push({ x: h.x, y: h.y, r: 280, life: 0.3, color: [255, 120, 40] });
    } else {
      SFX.play('boom');
      fxRing(h.x, h.y, 10, h.r * 1.2, 0.5, '#ff5a3a', 10);
      fxDust(h.x, h.y, 16);
      fxDecal('crack', h.x, h.y, 1.6);
      fxShake(10);
    }
    if (!p.dead && dist(p.x, p.y, h.x, h.y) < h.r + p.r) damagePlayer(h.dmg, h.src, { fire: h.kind === 'fire' });
  }
}

function gainXp(n) {
  const p = player;
  n = Math.round(n * (1 + p.stats.xp / 100));
  p.xp += n;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    Game.pendingLevels++;
    Game.levelUpDelay = 0.7;
    recalcStats(p);
    p.life = p.stats.maxLife;
    p.fury = p.stats.maxFury;
    SFX.play('levelup');
    fxRing(p.x, p.y, 10, 160, 0.9, '#ffd36a', 6);
    fxSparks(p.x, p.y, 40, 40, '#ffd36a', 200);
    UI.message(`레벨 ${p.level} 달성!`, '#ffd36a');
  }
}
