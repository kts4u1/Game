'use strict';
// ───────── 몬스터 · 전투 · 전리품 · 투사체 ─────────
// 몬스터 특수 행동(돌진, 땅굴, 소환, 급강하 등)은 monsterai.js

let world = null;   // 현재 층 상태
let player = null;  // 플레이어

function xpToNext(L) { return Math.round(40 * Math.pow(L, 1.65) + 20); }

function effLevel(p, id) {
  const b = p.skills[id] || 0;
  if (!b) return 0;
  const st = p.stats || {};
  return Math.min(SKILLS[id].max + 5, b + (st.allSkills || 0) + ((st.skillBonus && st.skillBonus[id]) || 0));
}

// 공격할 수 있는 상태인지 (땅속에 숨었거나 공중에 떠 있으면 안 됨)
function hittable(m) { return !m.dead && !m.hidden && !m.air; }

// ── 몬스터 생성 ──
function spawnMonster(type, x, y, mlvl, tier = 0, opts = {}) {
  const T = MONSTERS[type];
  const k = mlvl - 1;
  const lm = 1 + 0.45 * k + 0.02 * k * k;
  const dm = 1 + 0.26 * k + 0.008 * k * k;
  const m = {
    id: uid(), type, sprite: opts.sprite || T.sprite, x, y, r: T.r, mlvl, tier, mods: opts.mods || [], pack: opts.pack || 0,
    name: T.name, life: T.life * lm, dmg: [T.dmg[0] * dm, T.dmg[1] * dm], speed: T.speed * rand(0.92, 1.08),
    atkRange: T.atkRange || 40, atkCD: T.atkCD || 2, windupDur: T.windup || 0.5, baseWindup: T.windup || 0.5, ranged: T.ranged || null,
    xp: T.xp * 0.85 * (1 + 0.5 * k), aggro: false, atkTimer: rand(0.2, 1), windup: 0, strikeT: 0, stun: 0, slow: 0,
    kvx: 0, kvy: 0, hitFlash: 0, dead: false, deadT: 0, walkPhase: Math.random() * 10, moving: false,
    facing: Math.random() * TAU, seed: Math.random() * 10, losT: Math.random() * 0.3, hasLos: false,
    scale: 1, pal: {}, lifeSteal: T.lifeSteal || 0, flowT: 0, stuckT: 0,
    abil: (opts.abil || T.abil || []).slice(), cd: {}, act: null, pending: null, z: 0,
    undead: !!T.undead, armorK: T.armorK || 1, stationary: !!T.stationary, summoned: !!opts.summoned,
    proj: opts.proj || (T.ranged && T.ranged.proj) || null, shots: 0, stolen: 0, tint: opts.tint || null,
    color: T.color || null, alpha: T.alpha || 1, final: !!opts.final, phase: 1,
  };
  if (tier === 1) { m.life *= 2.6; m.dmg = m.dmg.map(d => d * 1.3); m.speed *= 1.12; m.xp *= 3; m.scale = 1.12; }
  if (tier === 2) { m.life *= 4; m.dmg = m.dmg.map(d => d * 1.5); m.xp *= 6; m.scale = 1.22; m.name = opts.name; }
  if (tier === 3) {
    m.life *= 18; m.dmg = m.dmg.map(d => d * 2); m.xp *= 25; m.scale = opts.scale || 1.8;
    m.r = T.r * m.scale * 0.8; m.name = opts.name; m.pal = opts.pal || {}; m.atkRange += 22; m.windupDur *= 1.3; m.baseWindup = m.windupDur;
    if (m.final) { m.life *= 1.5; m.xp *= 3; m.dmg = m.dmg.map(d => d * 0.8); }
  }
  for (const mod of m.mods) {
    if (mod === 'fast') { m.speed *= 1.35; m.atkCD *= 0.75; }
    if (mod === 'strong') m.dmg = m.dmg.map(d => d * 1.5);
    if (mod === 'tough') m.life *= 1.6;
    if (mod === 'vamp') m.lifeSteal += 0.3;
    if (mod === 'blink' && !m.abil.includes('teleport')) m.abil.push('blink');
  }
  if (m.summoned) m.xp *= 0.5;
  // 특수 행동 첫 사용은 조금 늦게
  for (const a of m.abil) m.cd[a] = rand(1.5, 3.5);
  if (m.abil.includes('ambush')) { m.hidden = true; m.ambushWait = true; }
  m.maxLife = m.life = Math.round(m.life);
  return m;
}

// 몬스터 밀도: 처음 몇 층은 조금 덜, 5층부터 최대
function floorDensity(f) { return f <= 1 ? 0.7 : f === 2 ? 0.8 : f <= 4 ? 0.9 : 1; }

// 무리 크기: 기본 4–7마리, 무리 지어 다니는 종류는 data.js의 pack 값보다 30% 많게
function packSize(type, tier) {
  const T = MONSTERS[type];
  const dens = floorDensity(world.floor);
  let n = T.pack ? Math.max(3, Math.round(randInt(T.pack[0], T.pack[1]) * 1.3 * dens)) : Math.max(3, Math.round(randInt(4, 7) * dens));
  if (type === 'brute') n = randInt(2, 3);
  if (type === 'wraith') n = randInt(3, 5);
  if (tier === 1) n = Math.max(type === 'swarm' ? 5 : 3, Math.min(n, world.floor <= 2 ? 3 : 5));
  return n;
}

function spawnPack(room, type, tier, packId, at, count) {
  const d = world.dungeon;
  const T = MONSTERS[type];
  const n = count || packSize(type, tier);
  const c = at || d.randomPointInRoom(room, 2);
  const spread = Math.min(110, 60 + n * 6);
  const place = () => {
    for (let a = 0; a < 12; a++) {
      const tx = c.x + rand(-spread, spread), ty = c.y + rand(-spread, spread);
      if (!d.circleBlocked(tx, ty, 16) && d.los(c.x, c.y, tx, ty)) return { x: tx, y: ty };
    }
    return { x: c.x, y: c.y };
  };
  for (let i = 0; i < n; i++) {
    const pt = place();
    const ml = world.mlvl + (chance(0.3) ? 1 : 0) + (tier ? 1 : 0);
    world.monsters.push(spawnMonster(type, pt.x, pt.y, ml, tier, { pack: packId }));
  }
  if (type === 'fallen' && world.floor >= 2) world.monsters.push(spawnMonster('shaman', c.x + 20, c.y + 20, world.mlvl, tier, { pack: packId }));
  if (T.escort && MONSTERS[T.escort].minFloor <= world.floor) {
    for (let i = 0; i < randInt(1, 2); i++) { const pt = place(); world.monsters.push(spawnMonster(T.escort, pt.x, pt.y, world.mlvl, tier, { pack: packId })); }
  }
}

// 이 층에 나올 몬스터 종류를 몇 개 골라 층마다 분위기가 달라지게 함
function pickRoster(f) {
  const eligible = Object.keys(MONSTERS).filter(t => {
    const T = MONSTERS[t];
    return T.weight > 0 && T.minFloor <= f && (!T.maxFloor || f <= T.maxFloor);
  });
  const lava = themeForFloor(f).lava;
  const w = t => MONSTERS[t].weight * (lava && t === 'fireAnt' ? 2.5 : 1) * (MONSTERS[t].minFloor >= f - 2 ? 1.6 : 1);
  const n = Math.min(eligible.length, f <= 2 ? 4 : randInt(4, 6));
  const pool = eligible.slice(), out = [];
  while (out.length < n && pool.length) {
    const t = weightedPick(pool, w);
    out.push(t);
    pool.splice(pool.indexOf(t), 1);
  }
  return out;
}

function populateFloor() {
  const d = world.dungeon, f = world.floor;
  world.chests = [];
  if (world.town) return;
  const types = pickRoster(f);
  world.roster = types;
  const rooms = d.rooms.filter(r => r !== d.startRoom);
  const champRooms = shuffle(rooms.slice()).slice(0, f === 1 ? 1 : randInt(1, 2));
  const uniqCands = rooms.filter(r => !champRooms.includes(r) && r !== d.stairsRoom);
  const uniqueRoom = f >= 2 && uniqCands.length ? pick(uniqCands) : null;
  let packId = 1;
  for (const r of rooms) {
    const area = r.w * r.h, dens = floorDensity(f);
    const packs = 1 + (area > 56 && chance(dens) ? 1 : 0) + (area > 100 && chance(dens) ? 1 : 0) + (chance(0.45 * dens) ? 1 : 0);
    for (let k = 0; k < packs; k++) {
      const type = weightedPick(types, t => MONSTERS[t].weight);
      spawnPack(r, type, k === 0 && champRooms.includes(r) ? 1 : 0, packId++);
    }
    if (r === uniqueRoom) {
      const cands = types.filter(t => t !== 'fallen' && t !== 'swarm');
      const type = weightedPick(cands.length ? cands : types, t => MONSTERS[t].weight);
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
  // 통로를 떠도는 작은 무리
  const wander = corridorSpots(Math.min(9, Math.round((4 + Math.floor(f / 2)) * floorDensity(f))));
  const roamers = types.filter(t => !MONSTERS[t].stationary);
  for (const pt of wander) {
    const type = weightedPick(roamers.length ? roamers : types, t => MONSTERS[t].weight);
    spawnPack(null, type, 0, packId++, pt, MONSTERS[type].pack ? Math.max(3, packSize(type, 0) - 2) : randInt(2, 4));
  }
  // 저주받은 무덤: 부수기 전까지 해골 병사를 계속 불러냄 (깊은 층은 불타는·얼어붙은 무덤도)
  if (f >= 3 && chance(0.55)) {
    const graves = f >= 26 ? ['grave', 'fireGrave', 'iceGrave'] : f >= 18 ? ['grave', 'fireGrave'] : ['grave'];
    for (const r of shuffle(rooms.filter(r => r !== d.stairsRoom)).slice(0, randInt(1, f >= 18 ? 3 : 2))) {
      const c = d.randomPointInRoom(r, 2);
      world.monsters.push(spawnMonster(pick(graves), c.x, c.y, world.mlvl, 0, { pack: packId++ }));
    }
  }
  if (isBossFloor(f)) {
    const B = BOSSES[Math.min(BOSSES.length, f / 5) - 1];
    const r = d.stairsRoom;
    const pos = d.randomPointInRoom(r, 2);
    world.monsters.push(spawnMonster(B.type, pos.x, pos.y, world.mlvl + 3, 3, { name: B.name, scale: B.scale, pal: B.pal, sprite: B.sprite, abil: B.abil, proj: B.proj, tint: B.tint, final: B.final, pack: packId++ }));
    d.stairs.open = false;
    // 마지막 층에는 더 내려가는 계단이 없음
    if (f >= FINAL_FLOOR) d.stairs.none = true;
  }
  // 보물 상자
  for (const r of shuffle(rooms.slice()).slice(0, randInt(2, 3))) {
    const p = d.randomPointInRoom(r, 1);
    world.chests.push({ x: p.x, y: p.y, open: false, t: 0 });
  }
}

// 방 밖의 통로 칸 중에서 시작 지점과 멀고 서로 떨어진 곳들
function corridorSpots(n) {
  const d = world.dungeon;
  const inRoom = (x, y) => d.rooms.some(r => x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h);
  const s = d.startRoom;
  const cand = [];
  for (let y = 1; y < d.h - 1; y++) for (let x = 1; x < d.w - 1; x++) {
    if (!d.walkable(x, y) || inRoom(x, y)) continue;
    if (Math.abs(x - s.cx) + Math.abs(y - s.cy) < 12) continue;
    cand.push({ x, y });
  }
  shuffle(cand);
  const out = [];
  for (const c of cand) {
    if (out.some(o => Math.abs(o.tx - c.x) + Math.abs(o.ty - c.y) < 10)) continue;
    out.push({ tx: c.x, ty: c.y, x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE });
    if (out.length >= n) break;
  }
  return out;
}

function aggroPack(m) {
  if (!m.aggro && !m.dead && !m.hidden) SFX.monster(m, 'ment');
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
    for (const k in m.cd) m.cd[k] -= dt / (m.cdScale || 1);
    if (Math.abs(m.kvx) + Math.abs(m.kvy) > 2) {
      d.moveCircle(m, m.kvx * dt, m.kvy * dt);
      const f = Math.pow(0.004, dt);
      m.kvx *= f; m.kvy *= f;
    }
    m.moving = false;
    if (m.act && updateMonsterAction(m, dt, dp)) continue;
    if (m.stun > 0) { m.stun -= dt; m.windup = 0; m.pending = null; m.windupDur = m.baseWindup; continue; }
    if (p.dead) continue;
    m.losT -= dt;
    if (m.losT <= 0) { m.losT = 0.25 + Math.random() * 0.1; m.hasLos = dp < 750 && d.los(m.x, m.y, p.x, p.y); }
    // 땅속에 숨어 기다리는 몬스터
    if (m.ambushWait) {
      if (!m.aggro && dp < 230) aggroPack(m);
      if (m.aggro && dp < 520) { m.ambushWait = false; startEmerge(m); }
      continue;
    }
    if (!m.aggro) {
      if (dp < (m.tier === 3 ? 440 : 360) && m.hasLos) aggroPack(m);
      else continue;
    }
    if (m.windup > 0) {
      m.windup -= dt;
      m.facing = angleTo(m.x, m.y, p.x, p.y);
      if (m.windup <= 0) {
        const fn = m.pending;
        m.pending = null;
        m.windupDur = m.baseWindup;
        if (fn) fn(); else resolveMonsterAttack(m);
      }
      continue;
    }
    if (tryMonsterAbility(m, dp)) continue;
    if (m.stationary) continue;
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
    monsterStep(m, a, m.speed * (m.slow > 0 ? 0.5 : 1) * dt, dt);
    if (!away) m.facing = a;
  }
  // 서로 겹치지 않게 밀어내기 (땅속·공중에 있는 몬스터는 제외)
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    if (a.hidden || a.air) continue;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (b.hidden || b.air) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const dd = Math.hypot(dx, dy) || 0.01;
      if (dd < rr) {
        const push = (rr - dd) / 2;
        const nx = dx / dd, ny = dy / dd;
        if (!a.stationary) d.moveCircle(a, -nx * push, -ny * push);
        if (!b.stationary) d.moveCircle(b, nx * push, ny * push);
      }
    }
    if (!p.dead && !p.leap) {
      const dx = a.x - p.x, dy = a.y - p.y;
      const dd = Math.hypot(dx, dy) || 0.01;
      const rr = a.r + p.r;
      if (dd < rr) {
        const push = rr - dd;
        const k = a.stationary ? 1 : 0.2;
        if (!a.stationary) d.moveCircle(a, dx / dd * push * 0.8, dy / dd * push * 0.8);
        d.moveCircle(p, -dx / dd * push * k, -dy / dd * push * k);
      }
    }
  }
}

// 한 걸음 이동 (끼임 감지 포함)
function monsterStep(m, a, sp, dt) {
  const d = world.dungeon;
  const ox = m.x, oy = m.y;
  d.moveCircle(m, Math.cos(a) * sp, Math.sin(a) * sp);
  const moved = dist(ox, oy, m.x, m.y);
  if (moved < sp * 0.3) { m.stuckT += dt; if (m.stuckT > 0.35) { m.flowT = 1.2; m.stuckT = 0; } } else m.stuckT = 0;
  m.walkPhase += moved * 0.12;
  m.moving = moved > 0.1;
  return moved;
}

function resolveMonsterAttack(m) {
  const p = player;
  m.atkTimer = m.atkCD * rand(0.9, 1.15);
  m.strikeT = 0.25;
  const dmg = rand(m.dmg[0], m.dmg[1]);
  if (m.ranged) {
    m.shots++;
    const base = angleTo(m.x, m.y, p.x, p.y);
    // 일제 사격: 보스는 매번, 궁수는 세 번째마다 여러 발
    let n = m.ranged.spread || 1;
    if (m.abil.includes('volley') && (m.tier === 3 || m.shots % 3 === 0)) n = m.tier === 3 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.2 + rand(-0.05, 0.05);
      fireMonsterProjectile(m, m.proj, a, dmg * (n >= 5 ? 0.6 : n > 1 ? 0.75 : 1));
    }
    const proj = m.proj;
    SFX.play(proj === 'fireball' ? 'fire' : proj === 'icicle' ? 'freeze' : proj === 'spit' ? 'spit' : proj === 'plasma' ? 'zap' : 'arrow', 0.8);
  } else {
    SFX.monster(m, 'phys');
    if (dist(m.x, m.y, p.x, p.y) <= m.atkRange + p.r + 16) {
      const T = MONSTERS[m.type];
      const venom = T.poison || m.mods.includes('venom');
      const hit = damagePlayer(dmg, m, { melee: true, poison: venom ? dmg * 0.6 : 0, fireTouch: T.fireBurn, cold: T.coldHit });
      if (hit && m.abil.includes('steal')) stealGold(m);
    }
  }
}

function fireMonsterProjectile(m, type, a, dmg) {
  const sp = type === 'plasma' ? 300 : type === 'bolt' ? 220 : (m.ranged ? m.ranged.speed : 360);
  spawnProjectile({
    owner: 'monster', type, x: m.x + Math.cos(a) * 16, y: m.y + Math.sin(a) * 16,
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: type === 'arrow' ? 6 : 10, dmg, src: m, life: type === 'bolt' ? 1.4 : 1.8, angle: a,
    pool: type === 'spit' && m.abil.includes('pools'),
  });
}

// 고블린 약탈자: 골드를 훔쳐 달아남. 잡으면 돌려받음
function stealGold(m) {
  const p = player;
  if (p.gold <= 0 || m.act) return;
  const amt = Math.min(p.gold, Math.round(8 + m.mlvl * 5 + p.gold * 0.03));
  p.gold -= amt;
  m.stolen += amt;
  fxText(p.x, p.y, `-${amt} 골드`, '#e8c35a', 15, { z: 70 });
  UI.message(`${m.name}이(가) 골드 ${amt}을 훔쳐 달아납니다!`, '#ffb84a');
  SFX.play('gold');
  m.act = { kind: 'flee', t: 0, dur: 4 };
}

// ── 피해 처리 ──
function rollPlayerDamage(mult, m) {
  const s = player.stats;
  const elem = s.fireDmg + s.coldDmg + (s.lightDmg ? randInt(1, s.lightDmg) : 0);
  let d = (rand(s.minDmg, s.maxDmg) + elem) * (1 + s.dmgPct / 100) * mult;
  if (m && m.undead && s.dmgUndead) d *= 1 + s.dmgUndead / 100;
  const crit = Math.random() * 100 < s.crit;
  if (crit) d *= 1 + s.critDmg / 100;
  return { d: Math.max(1, Math.round(d)), crit };
}

function healPlayer(n) {
  const p = player;
  p.life = Math.min(p.stats.maxLife, p.life + n);
}

function playerStrike(m, mult, opts = {}) {
  if (!hittable(m)) return 0;
  const s = player.stats;
  // 방패를 든 몬스터는 앞에서 오는 공격을 가끔 막음
  if (m.abil.includes('block') && !m.stun && !opts.proc && chance(m.tier === 3 ? 0.18 : 0.25)
      && Math.abs(angleDiff(m.facing, angleTo(m.x, m.y, player.x, player.y))) < 1.1) {
    fxText(m.x, m.y, '막음', '#c9d4e2', 14, { z: monsterHeight(m) * 0.7 });
    fxSparks(m.x, m.y, 40, 6, '#e8eef8', 120);
    SFX.play('block', 0.7);
    m.atkTimer = Math.min(m.atkTimer, 0.3);
    return 0;
  }
  const { d, crit } = rollPlayerDamage(mult, m);
  damageMonster(m, d, crit, opts);
  if (s.lifeSteal > 0) healPlayer(Math.min(d * s.lifeSteal / 100, s.maxLife * 0.06));
  if (opts.fury) player.fury = Math.min(s.maxFury, player.fury + opts.fury);
  if (!m.dead && opts.knock && m.tier < 3 && !m.stationary) {
    const a = angleTo(player.x, player.y, m.x, m.y);
    m.kvx = Math.cos(a) * opts.knock; m.kvy = Math.sin(a) * opts.knock;
  }
  if (!m.dead && opts.stun && !m.stationary) {
    m.stun = Math.max(m.stun, m.tier === 3 ? opts.stun * 0.3 : opts.stun);
    m.windup = 0; m.pending = null; m.windupDur = m.baseWindup;
    if (m.act && (m.act.kind === 'charge' || m.act.kind === 'flee')) m.act = null;
  }
  // 원소 피해 효과
  if (!m.dead) {
    if (s.coldDmg > 0) { m.slow = Math.max(m.slow, 1.2); if (chance(0.3)) fxSparks(m.x, m.y, 30, 4, '#9fdcff', 80); }
    if (s.fireDmg > 0 && chance(0.4)) fxEmbers(m.x, m.y, 3, '#ff8a2a', 10);
    if (s.lightDmg > 0 && chance(0.25)) fxSprite('spark_blue', m.x, m.y, { z: monsterHeight(m) * 0.5 - 52, scale: 0.6 });
  }
  if (!opts.proc && player.procCD <= 0) {
    if (s.procLightning && chance(s.procLightning / 100)) { chainLightning(m); player.procCD = 0.3; }
    else if (s.procFireNova && chance(s.procFireNova / 100)) { fireNova(m.x, m.y); player.procCD = 0.3; }
    else if (s.procFrostNova && chance(s.procFrostNova / 100)) { frostNova(player.x, player.y); player.procCD = 0.3; }
  }
  SFX.play(crit ? 'crit' : 'hit', 0.7);
  if (!m.dead) SFX.monster(m, 'hit');
  return d;
}

function damageMonster(m, amount, crit, opts = {}) {
  if (m.dead) return;
  amount = Math.max(1, Math.round(amount * m.armorK));
  m.overkill = crit && amount > m.maxLife * 0.5;
  m.life -= amount;
  m.hitFlash = 0.12;
  if (!m.aggro) aggroPack(m);
  fxText(m.x, m.y, crit ? `${amount}!` : `${amount}`, opts.color || (crit ? '#ffd24a' : '#f2ede4'), crit ? 22 : 15, { crit, z: monsterHeight(m) * 0.75 });
  const z = 30 * m.scale;
  const bony = m.sprite && m.sprite.startsWith('skeleton');
  fxSprite(crit ? 'spark_orange' : bony ? 'spark_blue' : 'spark_red', m.x + rand(-6, 6), m.y + rand(-6, 6), { z: monsterHeight(m) * 0.5 - 52, scale: crit ? 0.9 : 0.65 });
  if (bony) fxSparks(m.x, m.y, z, 4, '#e8e2d0', 120);
  else if (m.type === 'grave') fxDust(m.x, m.y, 3, '120,110,100', 60);
  else if (m.sprite === 'antlion' || m.sprite === 'antlion_armored') fxSparks(m.x, m.y, z, 5, '#7ff2ff', 120);
  else fxBlood(m.x, m.y, z, crit ? 10 : 5, m.type === 'zombie' || m.type === 'darkZombie' ? '#4a5a1c' : '#8c1014');
  // 번개 강화: 맞으면 전기 구슬을 흩뿌림
  if (m.mods.includes('shock') && (m.cd.shock || 0) <= 0 && m.life > 0) {
    m.cd.shock = 0.8;
    for (let i = 0; i < 3; i++) fireMonsterProjectile(m, 'bolt', Math.random() * TAU, m.dmg[1] * 0.4);
    SFX.play('zap', 0.5);
  }
  if (m.life <= 0) killMonster(m);
}

function killMonster(m) {
  m.dead = true; m.deadT = 0; m.life = 0; m.windup = 0; m.act = null; m.pending = null; m.hidden = false; m.air = false; m.z = 0;
  m.fallDir = chance(0.5) ? 1 : -1;
  const p = player, s = p.stats;
  p.kills++;
  gainXp(m.xp);
  if (s.killLife) healPlayer(s.killLife);
  if (s.killFury) p.fury = Math.min(s.maxFury, p.fury + s.killFury);
  const bony = m.sprite && m.sprite.startsWith('skeleton');
  SFX.monster(m, m.overkill ? 'critdie' : 'die');
  if (bony || m.type === 'grave') { fxSparks(m.x, m.y, 20, 10, '#d8d1bd', 140); }
  else { fxBlood(m.x, m.y, 30, 16); fxDecal('blood', m.x, m.y, m.scale * rand(0.8, 1.2), m.type === 'zombie' || m.type === 'darkZombie' ? 'rgba(40,52,14,.8)' : 'rgba(70,6,8,.8)'); }
  if (m.sprite === 'antlion') fxSparks(m.x, m.y, 30, 20, '#7ff2ff', 200);
  if (m.type === 'grave') {
    for (const o of world.monsters) if (o.summoner === m.id && !o.dead) { o.life = 0; killMonster(o); }
    UI.message('저주받은 무덤을 부쉈습니다', '#c9c1b3');
  }
  if (!m.summoned) dropLoot(m.x, m.y, m.mlvl, m.tier, m.stolen);
  if (m.stolen) UI.message('훔쳐 간 골드를 되찾았습니다!', '#e8c35a');
  if (m.mods.includes('fire') || m.abil.includes('explode')) {
    world.hazards.push({ x: m.x, y: m.y, r: m.abil.includes('explode') ? 90 : 110, t: 0, delay: 0.7, dmg: m.dmg[1] * 1.2, src: m, kind: 'fire' });
  }
  if (m.abil.includes('poisonDeath') || m.mods.includes('venom')) addPool(m.x, m.y, 75, 4, m.dmg[1] * 0.5, 'poison', m);
  if (m.tier === 3) fxSprite('blast', m.x, m.y, { scale: 1.1 });
  if (m.tier === 2) UI.message(`${m.name} 처치!`, RARITY[3].color);
  if (m.tier === 3) {
    fxShake(14);
    fxRing(m.x, m.y, 10, 300, 1.2, '#ff8a3a', 8);
    for (const o of world.monsters) if (o.summoned && !o.dead) { o.life = 0; killMonster(o); }
    if (m.final) {
      // 최종 보스: 유니크·세트 3개를 더 떨어뜨리고 엔딩
      for (let i = 0; i < 3; i++) spawnGround('item', m.x, m.y, { item: generateItem(m.mlvl + 2, chance(0.6) ? 3 : 4) });
      Game.victory(m);
    } else {
      world.dungeon.stairs.open = true;
      UI.message(`${m.name} 처치! 아래로 가는 계단이 열렸습니다.`, '#ff9a4a');
    }
  }
}

// 플레이어 피해. 막았거나 무시되면 false
function damagePlayer(amount, src, opts = {}) {
  const p = player;
  if (p.dead || p.leap || Game.godMode || world.town) return false;
  const s = p.stats;
  // 방패 막기: 근접 공격과 투사체
  if ((opts.melee || opts.proj) && s.block > 0 && chance(s.block / 100)) {
    fxText(p.x, p.y, '막기', '#d6e2f2', 15, { z: 64 });
    fxSparks(p.x, p.y, 40, 8, '#e8eef8', 120);
    SFX.play('block', 0.8);
    p.blockT = 0.25;
    return false;
  }
  const red = damageReduction(p, src ? src.mlvl : world.mlvl);
  const fireMod = src && src.mods && src.mods.includes('fire');
  const elem = opts.fire || opts.cold || opts.poisonHit || opts.magic;
  let dmg = elem ? amount * (1 - red * 0.4) * (1 - s.res / 100) : amount * (1 - red);
  if (fireMod && opts.melee) { dmg *= 1.3; fxEmbers(p.x, p.y, 8); }
  if (opts.fireTouch) fxEmbers(p.x, p.y, 6);
  dmg = Math.max(1, Math.round(dmg - s.dmgReduce));
  p.life -= dmg;
  p.hurtT = 0.15;
  p.fury = Math.min(s.maxFury, p.fury + 2);
  fxText(p.x, p.y, `-${dmg}`, '#ff5a4a', 15, { z: 60 });
  fxBlood(p.x, p.y, 34, 5);
  SFX.play('hurt');
  UI.hurt();
  if (opts.cold) chillPlayer(1.6);
  if (opts.poison) poisonPlayer(opts.poison);
  if (src && opts.melee) {
    if (s.thorns > 0 && !src.dead) damageMonster(src, s.thorns, false, { color: '#c7a0ff' });
    if (src.mods && src.mods.includes('cold')) chillPlayer(2);
    if (src.lifeSteal && !src.dead) src.life = Math.min(src.maxLife, src.life + dmg * src.lifeSteal);
  }
  if (p.life <= 0) playerDie();
  return true;
}

function chillPlayer(t) {
  const p = player;
  if (p.slowT <= 0.2) { fxSprite('freeze', p.x, p.y, { layer: 'top', scale: 0.7, alpha: 0.85 }); SFX.play('freeze'); }
  p.slowT = Math.max(p.slowT, t * (1 - p.stats.res / 150));
  fxSparks(p.x, p.y, 30, 8, '#9fdcff', 100);
}
// 중독: 4초 동안 총 피해 = total (원소 저항으로 줄어듦)
function poisonPlayer(total) {
  const p = player;
  if (p.dead || world.town) return;
  if (p.poisonT <= 0) UI.message('중독되었습니다', '#8aff5a');
  const dps = total / 4;
  p.poisonDps = p.poisonT > 0 ? Math.max(p.poisonDps, dps) : dps;
  p.poisonT = 4;
}

function chainLightning(start) {
  SFX.play('zap');
  const hit = new Set([start.id]);
  let cur = start;
  const pts = [{ x: player.x, y: player.y, z: 40 }, { x: cur.x, y: cur.y }];
  playerStrike(cur, 0.8, { proc: true, color: '#bfe4ff' });
  fxSprite('thunderstrike', cur.x, cur.y, { scale: 0.8 });
  for (let j = 0; j < 4; j++) {
    let best = null, bd = 230;
    for (const m of world.monsters) {
      if (!hittable(m) || hit.has(m.id)) continue;
      const dd = dist(cur.x, cur.y, m.x, m.y);
      if (dd < bd) { bd = dd; best = m; }
    }
    if (!best) break;
    hit.add(best.id);
    pts.push({ x: best.x, y: best.y });
    playerStrike(best, 0.8, { proc: true, color: '#bfe4ff' });
    fxSprite('thunderstrike', best.x, best.y, { scale: 0.7 });
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
  SFX.play('burn');
  fxSprite('blast', x, y, { scale: 1.0 });
  fxRing(x, y, 10, 150, 0.45, '#ff8a2a', 6);
  fxEmbers(x, y, 30, '#ff8a2a', 90);
  fxDecal('scorch', x, y, 1.6);
  world.flashes.push({ x, y, r: 320, life: 0.35, color: [255, 140, 50] });
  for (const m of world.monsters) if (hittable(m) && dist(x, y, m.x, m.y) < 150 + m.r) playerStrike(m, 1.2, { proc: true, color: '#ffae5a' });
}

function frostNova(x, y) {
  SFX.play('freeze');
  fxRing(x, y, 10, 190, 0.5, '#9fdcff', 6);
  fxSparks(x, y, 20, 30, '#cfefff', 220);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; fxSprite('freeze', x + Math.cos(a) * 110, y + Math.sin(a) * 110, { layer: 'top', scale: 0.6, alpha: 0.8 }); }
  world.flashes.push({ x, y, r: 300, life: 0.3, color: [140, 200, 255] });
  for (const m of world.monsters) {
    if (!hittable(m) || dist(x, y, m.x, m.y) > 190 + m.r) continue;
    playerStrike(m, 0.9, { proc: true, color: '#bfe8ff' });
    m.slow = Math.max(m.slow, 3);
  }
}

// ── 전리품 ──
// tier: 0 일반, 1 챔피언, 2 유니크 정예, 3 보스, 4 상자
function dropLoot(x, y, mlvl, tier, extraGold = 0) {
  const s = player.stats;
  let items = 0, gold = 0, potion = 0, minRarity = 0;
  if (tier === 0) { items = chance(0.04) ? 1 : 0; gold = 0.14; potion = 0.045; }
  else if (tier === 1) { items = chance(0.45) ? 1 : 0; gold = 0.7; potion = 0.25; }
  else if (tier === 2) { items = 2; gold = 1; potion = 0.6; minRarity = 1; }
  else if (tier === 3) { items = 3; gold = 1; potion = 1; minRarity = 2; }
  else if (tier === 4) { items = randInt(1, 2); gold = 1; potion = 0.5; }
  const ilvl = mlvl + (tier === 3 ? 2 : tier >= 1 ? 1 : 0);
  for (let i = 0; i < items; i++) {
    let r = rollRarity(mlvl, tier, s.mf);
    if (i === 0 && minRarity && r < minRarity) r = minRarity;
    spawnGround('item', x, y, { item: generateItem(ilvl, r) });
  }
  if (chance(gold) || extraGold) {
    const amt = Math.round(randInt(3, 9) * 1.6 * (1 + mlvl * 0.6) * (1 + s.gf / 100) * (tier ? 2 + tier : 1) + extraGold * 1.5);
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
    if (r >= 3) {
      const col = RARITY[r].color;
      fxBeam(tx, ty, col, 4); SFX.play('unique'); SFX.play('rare');
      fxSprite('sparkle', tx, ty, { life: 2.5, fade: 0.8 });
      UI.message(`${RARITY[r].name} 아이템이 떨어졌습니다: ${g.item.name}`, col);
    } else if (r === 2) { fxBeam(tx, ty, '#f4e06d', 1.6); SFX.play('rare'); }
  }
  return g;
}

// 바닥 아이템 표시 필터: 0 전부, 1 마법 이상, 2 레어 이상
function groundVisible(g) {
  if (g.kind !== 'item') return true;
  const f = (Game.settings && Game.settings.lootFilter) || 0;
  return g.item.rarity >= f;
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
        if (p.potions >= MAX_POTIONS) continue;
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
    SFX.play('pickup');
    if (g.item.rarity >= 2) SFX.synth(g.item.rarity >= 3 ? 'unique' : 'rare');
    UI.message(`${itemName(g.item)} 획득`, RARITY[g.item.rarity].color);
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
  fxSprite('sparkle', c.x, c.y, { life: 1.2, fade: 0.5 });
  fxSparks(c.x, c.y, 20, 14, '#ffd27a', 120);
  dropLoot(c.x, c.y, world.mlvl + 1, 4);
}

// ── 투사체 ──
function spawnProjectile(o) {
  world.projectiles.push(Object.assign({ life: 2, hit: new Set(), z: 30, spin: 0, pierce: 0 }, o));
}

// 투사체가 맞거나 벽에 닿았을 때 효과
function projectileImpact(pr) {
  const t = pr.type;
  if (t === 'fireball') { fxEmbers(pr.x, pr.y, 12); fxDecal('scorch', pr.x, pr.y, 0.5); fxSprite('blast', pr.x, pr.y, { scale: 0.3 }); SFX.play('burn', 0.6); }
  else if (t === 'icicle') { fxSprite('freeze', pr.x, pr.y, { layer: 'top', scale: 0.4, alpha: 0.8 }); fxSparks(pr.x, pr.y, 25, 6, '#cfefff', 90); }
  else if (t === 'spit') { fxSprite('spark_green', pr.x, pr.y, { z: -20, scale: 0.6 }); if (pr.pool) addPool(pr.x, pr.y, 80, 5, pr.dmg * 0.6, 'poison', pr.src); }
  else if (t === 'plasma' || t === 'bolt') { fxSprite('spark_blue', pr.x, pr.y, { z: -20, scale: 0.7 }); }
  else { fxSparks(pr.x, pr.y, 25, 5, '#d8c9a0', 90); if (t === 'arrow') SFX.play('arrowWall'); }
}

function updateProjectiles(dt) {
  const d = world.dungeon, p = player;
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    pr.life -= dt;
    pr.t = (pr.t || 0) + dt;
    // 번개 구슬은 이리저리 흔들리며 날아감
    if (pr.type === 'bolt') { const a = Math.atan2(pr.vy, pr.vx) + rand(-0.5, 0.5); pr.vx = Math.cos(a) * 220; pr.vy = Math.sin(a) * 220; }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.spin += dt * 22;
    let dead = pr.life <= 0;
    if (!dead && d.solidAt(pr.x, pr.y)) { dead = true; projectileImpact(pr); }
    if (pr.type === 'fireball' && chance(0.6)) fxEmbers(pr.x, pr.y, 1, '#ff7a22', 4);
    if (!dead && pr.owner === 'player') {
      for (const m of world.monsters) {
        if (!hittable(m) || pr.hit.has(m.id)) continue;
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
      const t = pr.type;
      damagePlayer(pr.dmg, pr.src, {
        proj: true, fire: t === 'fireball', cold: t === 'icicle', magic: t === 'plasma' || t === 'bolt',
        poisonHit: t === 'spit', poison: t === 'spit' ? pr.dmg * 0.8 : 0,
      });
      projectileImpact(pr);
    }
    if (dead) world.projectiles.splice(i, 1);
  }
}

// ── 바닥에 남는 독·불 웅덩이 ──
function addPool(x, y, r, dur, dps, kind, src) {
  world.pools.push({ x, y, r, t: 0, dur, dps, kind, src, tick: 0 });
  if (kind === 'poison') fxSprite('spark_green', x, y, { z: -30, scale: 0.9 });
}
function updatePools(dt) {
  const p = player;
  for (let i = world.pools.length - 1; i >= 0; i--) {
    const pl = world.pools[i];
    pl.t += dt;
    if (pl.t >= pl.dur) { world.pools.splice(i, 1); continue; }
    if (chance(dt * 3)) fxSparks(pl.x + rand(-pl.r, pl.r) * 0.7, pl.y + rand(-pl.r, pl.r) * 0.35, 2, 2, pl.kind === 'poison' ? '#8aff5a' : '#ff9a3a', 30);
    pl.tick -= dt;
    if (pl.tick <= 0 && !p.dead && dist(p.x, p.y, pl.x, pl.y) < pl.r + p.r * 0.5) {
      pl.tick = 0.5;
      if (pl.kind === 'poison') poisonPlayer(pl.dps * 1.2);
      else damagePlayer(pl.dps * 0.5, pl.src, { fire: true });
    }
  }
}

// 지연 범위 공격(보스 내려찍기, 화염 폭발, 급강하 착지, 운석)
function updateHazards(dt) {
  const p = player;
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i];
    h.t += dt;
    if (h.t < h.delay) continue;
    world.hazards.splice(i, 1);
    if (h.kind === 'frost') {
      SFX.play('freeze');
      fxSprite('freeze', h.x, h.y, { layer: 'top', scale: h.r / 60, alpha: 0.9 });
      fxRing(h.x, h.y, 10, h.r, 0.4, '#bfe8ff', 5);
      fxSparks(h.x, h.y, 20, 18, '#dff4ff', 140);
      world.flashes.push({ x: h.x, y: h.y, r: 240, life: 0.3, color: [150, 210, 255] });
      if (!p.dead && dist(p.x, p.y, h.x, h.y) < h.r + p.r) damagePlayer(h.dmg, h.src, { cold: true });
      continue;
    }
    if (h.kind === 'shock') {
      SFX.play('zap');
      fxSprite('thunderstrike', h.x, h.y, { scale: 0.9 });
      fxSparks(h.x, h.y, 20, 14, '#cbbcff', 160);
      world.flashes.push({ x: h.x, y: h.y, r: 260, life: 0.25, color: [170, 150, 255] });
      if (!p.dead && dist(p.x, p.y, h.x, h.y) < h.r + p.r) damagePlayer(h.dmg, h.src, { magic: true });
      continue;
    }
    if (h.kind === 'fire') {
      SFX.play('burn');
      fxSprite('blast', h.x, h.y, { scale: h.r / 151 });
      fxRing(h.x, h.y, 10, h.r, 0.4, '#ff8a2a', 6);
      fxEmbers(h.x, h.y, 30, '#ff7a22', 60);
      fxDecal('scorch', h.x, h.y, 1.3);
      world.flashes.push({ x: h.x, y: h.y, r: 280, life: 0.3, color: [255, 120, 40] });
      if (h.burn) addPool(h.x, h.y, h.r * 0.7, 3, h.dmg * 0.3, 'fire', h.src);
    } else {
      SFX.play('boom');
      fxSprite('quake', h.x, h.y, { layer: 'ground', scale: h.r / 80 });
      fxRing(h.x, h.y, 10, h.r * 1.2, 0.5, '#ff5a3a', 6);
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
    fxSprite('sparkle', p.x, p.y, { follow: p, life: 1.4, fade: 0.5, scale: 1.2 });
    fxSprite('heal', p.x, p.y, { follow: p, scale: 1.1 });
    fxRing(p.x, p.y, 10, 160, 0.9, '#ffd36a', 6);
    fxSparks(p.x, p.y, 40, 40, '#ffd36a', 200);
    UI.message(`레벨 ${p.level} 달성!`, '#ffd36a');
  }
}
