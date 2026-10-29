'use strict';
// ───────── 몬스터 특수 행동 ─────────
// 몬스터마다 abil 목록(data.js)에 있는 행동을 재사용 대기시간(m.cd)에 맞춰 쓴다.
// 오래 걸리는 행동은 m.act에 상태를 두고 updateMonsterAction이 매 프레임 처리한다.
// 짧은 시전은 m.windup + m.pending(끝나면 실행할 함수)으로 처리해 기절하면 끊긴다.

// 시전 동작(공격 자세)을 취한 뒤 fn 실행
function castThen(m, dur, fn) {
  m.windup = dur;
  m.windupDur = dur;
  m.pending = fn;
}

function livingMinions(m) {
  let n = 0;
  for (const o of world.monsters) if (!o.dead && o.summoner === m.id) n++;
  return n;
}

// 플레이어 주변의 걸을 수 있는 빈 자리
function spotNear(x, y, rMin, rMax, needLos) {
  const d = world.dungeon;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * TAU, r = rand(rMin, rMax);
    const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
    if (d.circleBlocked(tx, ty, 18)) continue;
    if (needLos && !d.los(x, y, tx, ty)) continue;
    return { x: tx, y: ty };
  }
  return null;
}

// 쓸 수 있는 특수 행동이 있으면 시작하고 true
function tryMonsterAbility(m, dp) {
  const p = player;
  for (const ab of m.abil) {
    // 체력에 따라 바뀌는 행동은 재사용 대기시간과 상관없이 확인
    if (ab === 'enrage' && !m.enraged && m.life < m.maxLife * 0.4) { enrageMonster(m); return true; }
    if (ab === 'phases' && finalBossPhase(m)) return true;
    if ((m.cd[ab] || 0) > 0) continue;
    switch (ab) {
      case 'flee':
        if (m.life < m.maxLife * 0.3 && !m.fled) {
          m.fled = true;
          m.act = { kind: 'flee', t: 0, dur: 2.2 };
          fxText(m.x, m.y, '!', '#ffe27a', 18, { z: monsterHeight(m) });
          return true;
        }
        break;
      case 'revive': {
        let best = null;
        for (const o of world.monsters) {
          if (!o.dead || o.summoned || o.tier || o.revived || o.deadT < 0.6 || o.deadT > 7 || o.type === 'grave') continue;
          if (o.pack !== m.pack && !UNDEAD.has(o.type)) continue;
          if (dist(m.x, m.y, o.x, o.y) < 330) { best = o; break; }
        }
        if (!best) break;
        m.cd.revive = rand(6, 8);
        fxSprite('runes', best.x, best.y, { layer: 'ground', scale: 0.7 });
        castThen(m, 0.7, () => reviveMonster(best));
        return true;
      }
      case 'burrow':
        if (dp > 220 && dp < 700) {
          m.cd.burrow = rand(6, 9);
          m.act = { kind: 'burrow', phase: 'down', t: 0 };
          SFX.monster(m, 'ment');
          return true;
        }
        break;
      case 'charge':
        if (dp > 150 && dp < 460 && m.hasLos) {
          const cc = MONSTERS[m.type].chargeCD;
          m.cd.charge = cc ? rand(cc[0], cc[1]) : m.tier === 3 ? rand(5, 7) : rand(6, 9);
          const a = angleTo(m.x, m.y, p.x, p.y);
          m.chargeAim = { a, len: dp + 90 };
          SFX.monster(m, 'ment');
          fxText(m.x, m.y, '돌진!', '#ff8a5a', 15, { z: monsterHeight(m) });
          castThen(m, m.tier === 3 ? 0.65 : 0.55, () => {
            m.act = { kind: 'charge', t: 0, a: m.chargeAim.a, left: m.chargeAim.len, hit: false };
            m.chargeAim = null;
          });
          return true;
        }
        break;
      case 'slam':
        if (dp < 520) {
          m.cd.slam = rand(5, 7);
          world.hazards.push({ x: p.x, y: p.y, r: 120, t: 0, delay: 1.0, dmg: m.dmg[1] * 1.4, src: m, kind: 'slam' });
          castThen(m, 0.5, () => { m.atkTimer = Math.max(m.atkTimer, 0.6); });
          return true;
        }
        break;
      case 'dive':
        if (dp > 120 && dp < 500 && m.hasLos) {
          m.cd.dive = m.tier === 3 ? rand(6, 8) : rand(7, 10);
          const tx = p.x, ty = p.y, dur = 1.15;
          world.hazards.push({ x: tx, y: ty, r: m.tier === 3 ? 120 : 95, t: 0, delay: dur, dmg: m.dmg[1] * 1.4, src: m, kind: 'slam' });
          m.act = { kind: 'dive', t: 0, dur, sx: m.x, sy: m.y, tx, ty };
          m.air = true;
          SFX.monster(m, 'ment');
          return true;
        }
        break;
      case 'teleport':
      case 'blink': {
        const close = ab === 'teleport' ? dp < 170 || (!m.hasLos && dp < 700) : dp > 260 && dp < 800;
        if (!close) break;
        const spot = ab === 'teleport' ? spotNear(p.x, p.y, 260, 360, true) : spotNear(p.x, p.y, 70, 120, true);
        if (!spot) break;
        m.cd[ab] = ab === 'teleport' ? rand(5, 7) : rand(4, 6);
        teleportMonster(m, spot.x, spot.y);
        return true;
      }
      case 'nova':
        if (dp < 300) {
          m.cd.nova = rand(8, 10);
          fxRing(m.x, m.y, 10, 60, 0.6, '#9fdcff', 4);
          castThen(m, 0.7, () => {
            const n = m.tier === 3 ? 14 : 10, off = Math.random();
            for (let i = 0; i < n; i++) fireMonsterProjectile(m, 'icicle', (i + off) / n * TAU, m.dmg[1] * 0.6);
            SFX.play('freeze');
            fxRing(m.x, m.y, 10, 160, 0.4, '#cfefff', 5);
          });
          return true;
        }
        break;
      case 'summon': {
        const max = m.type === 'grave' ? 4 : m.tier === 3 ? 5 : 3;
        if (livingMinions(m) >= max || dp > 650) break;
        m.cd.summon = m.type === 'grave' ? 5.5 : rand(10, 13);
        const n = Math.min(max - livingMinions(m), m.type === 'grave' ? 1 : m.tier === 3 ? 3 : 2);
        const go = () => {
          for (let i = 0; i < n; i++) {
            const s = spotNear(m.x, m.y, 50, 120, true);
            if (s) summonMinion(m, s.x, s.y);
          }
          if (m.tier === 3) UI.message(`${m.name}: "일어나라, 망자들이여!"`, '#c9b6ff');
        };
        if (m.type === 'grave') { go(); SFX.play('grave', 0.8); m.strikeT = 0.6; }
        else castThen(m, 0.8, go);
        return true;
      }
      case 'blizzard':
        if (dp < 600) {
          m.cd.blizzard = rand(7, 9);
          castThen(m, 0.6, () => {
            const pts = [{ x: p.x, y: p.y }];
            for (let i = 0; i < 3; i++) pts.push({ x: p.x + rand(-160, 160), y: p.y + rand(-160, 160) });
            pts.forEach((q, i) => world.hazards.push({ x: q.x, y: q.y, r: 90, t: -i * 0.2, delay: 1.1, dmg: m.dmg[1] * 1.1, src: m, kind: 'frost' }));
            SFX.play('freeze');
          });
          return true;
        }
        break;
      case 'storm':
        if (dp < 640) {
          m.cd.storm = rand(6, 8);
          castThen(m, 0.5, () => {
            const n = m.tier === 3 ? 6 : 4;
            for (let i = 0; i < n; i++) {
              const q = i === 0 ? { x: p.x, y: p.y } : { x: p.x + rand(-190, 190), y: p.y + rand(-190, 190) };
              world.hazards.push({ x: q.x, y: q.y, r: 70, t: -i * 0.18, delay: 0.95, dmg: m.dmg[1] * 1.0, src: m, kind: 'shock' });
            }
            SFX.play('zap');
          });
          return true;
        }
        break;
      case 'meteor':
        if (dp < 600) {
          m.cd.meteor = rand(7, 9);
          castThen(m, 0.6, () => {
            const pts = [{ x: p.x, y: p.y }];
            for (let i = 0; i < 2; i++) pts.push({ x: p.x + rand(-140, 140), y: p.y + rand(-140, 140) });
            pts.forEach((q, i) => world.hazards.push({ x: q.x, y: q.y, r: 85, t: -i * 0.25, delay: 1.2, dmg: m.dmg[1] * 1.2, src: m, kind: 'fire', burn: true }));
            SFX.play('fire');
          });
          return true;
        }
        break;
    }
  }
  return false;
}

// 진행 중인 행동 처리. true면 이번 프레임은 이 행동이 몬스터를 조종함
function updateMonsterAction(m, dt, dp) {
  const p = player, d = world.dungeon, a = m.act;
  a.t += dt;
  switch (a.kind) {
    case 'emerge':
      if (a.t >= a.dur) { m.act = null; m.atkTimer = Math.min(m.atkTimer, 0.3); }
      return true;
    case 'flee': {
      if (a.t >= a.dur) { m.act = null; return false; }
      let ang = angleTo(p.x, p.y, m.x, m.y) + Math.sin(a.t * 3 + m.seed) * 0.6;
      if (monsterStep(m, ang, m.speed * 1.15 * dt, dt) < 0.5) {
        ang += Math.PI / 2;
        monsterStep(m, ang, m.speed * dt, dt);
      }
      m.facing = ang;
      return true;
    }
    case 'charge': {
      const sp = 560 * dt;
      const moved = monsterStep(m, a.a, sp, dt);
      m.facing = a.a;
      a.left -= moved;
      if (chance(0.5)) fxDust(m.x, m.y, 1, '120,100,80', 40);
      if (!a.hit && !p.dead && dist(m.x, m.y, p.x, p.y) < m.r + p.r + 10) {
        a.hit = true;
        if (damagePlayer(m.dmg[1] * 1.6, m, { melee: true })) {
          d.moveCircle(p, Math.cos(a.a) * 50, Math.sin(a.a) * 50);
          p.slowT = Math.max(p.slowT, 0.6);
          fxShake(8);
        }
        SFX.monster(m, 'phys');
        m.act = null;
        m.atkTimer = 0.8;
        return true;
      }
      if (moved < sp * 0.3) {
        // 벽에 부딪혀 잠시 비틀거림
        m.act = null;
        m.stun = 0.7;
        fxShake(5); fxDust(m.x, m.y, 8);
        SFX.play('boom', 0.5);
        return true;
      }
      if (a.left <= 0 || a.t > 1.1) m.act = null;
      return true;
    }
    case 'burrow':
      if (a.phase === 'down') {
        if (chance(0.6)) fxDust(m.x, m.y, 1);
        if (a.t > 0.35) { a.phase = 'under'; a.t = 0; m.hidden = true; }
        return true;
      }
      if (a.phase === 'under') {
        let tx = p.x, ty = p.y;
        if (!d.clearPath(m.x, m.y, p.x, p.y, m.r * 0.8)) { const s = d.flowStep(m.x, m.y); if (s) { tx = s.x; ty = s.y; } }
        const ang = angleTo(m.x, m.y, tx, ty);
        monsterStep(m, ang, m.speed * 1.9 * dt, dt);
        m.facing = ang;
        if (chance(dt * 20)) fxDust(m.x, m.y, 1, '140,120,95', 30);
        if (dist(m.x, m.y, p.x, p.y) < 70 || a.t > 2.6) {
          m.hidden = false;
          m.act = { kind: 'emerge', t: 0, dur: 0.35 };
          fxDust(m.x, m.y, 12);
          fxShake(4);
          SFX.play('boom', 0.4);
          // 갑각 개미귀신은 솟아오르며 주변을 내리침
          if (m.type === 'armorAnt' || m.tier >= 2) {
            fxSprite('quake', m.x, m.y, { layer: 'ground', scale: 0.9 });
            if (!p.dead && dist(m.x, m.y, p.x, p.y) < 95 + p.r) damagePlayer(m.dmg[1], m, {});
          }
        }
        return true;
      }
      m.act = null;
      return false;
    case 'dive': {
      const k = Math.min(1, a.t / a.dur);
      // 날아올랐다가 표시된 곳으로 내려꽂힘
      m.x = lerp(a.sx, a.tx, easeInQuad(k));
      m.y = lerp(a.sy, a.ty, easeInQuad(k));
      m.z = Math.sin(k * Math.PI) * 150;
      m.facing = angleTo(a.sx, a.sy, a.tx, a.ty);
      m.moving = true;
      m.walkPhase += dt * 8;
      if (k >= 1) {
        m.z = 0; m.air = false; m.act = null;
        // 벽 안에 내려앉지 않게
        if (d.circleBlocked(m.x, m.y, m.r * 0.8)) { m.x = a.sx; m.y = a.sy; }
        m.atkTimer = 0.6;
      }
      return true;
    }
  }
  m.act = null;
  return false;
}

// 땅속에서 솟아오름 (spawn 애니메이션이 있으면 사용)
function startEmerge(m) {
  m.hidden = false;
  const set = monsterSprite(m);
  const dur = set && set.anims.spawn ? set.anims.spawn.dur / 1000 : 0.45;
  m.act = { kind: 'emerge', t: 0, dur: Math.min(1, dur) };
  fxDust(m.x, m.y, 6);
  SFX.monster(m, 'ment', 0.7);
}

// 분노: 체력이 적어지면 빨라지고 공격이 잦아짐
function enrageMonster(m) {
  m.enraged = true;
  m.speed *= 1.35;
  m.atkCD *= 0.7;
  if (m.tint) m.tint = 'hue-rotate(-40deg) saturate(2.4) brightness(0.85)';
  fxRing(m.x, m.y, 10, 160, 0.6, '#ff3a22', 7);
  fxEmbers(m.x, m.y, 30, '#ff3a22', 40);
  SFX.monster(m, 'ment');
  SFX.play('berserk');
  UI.message(`${m.name}이(가) 분노합니다!`, '#ff5a3a');
}

// 최종 보스 단계: 60% 이하에서 호위 기사 소환, 25% 이하에서 분노
function finalBossPhase(m) {
  const k = m.life / m.maxLife;
  if (m.phase === 1 && k <= 0.6) {
    m.phase = 2;
    UI.message(`${m.name}: "왕관 앞에 무릎 꿇어라!"`, '#c9b6ff');
    UI.banner('망자의 왕관이 빛납니다', '호위 기사들이 깨어났습니다');
    for (let i = 0; i < 2; i++) {
      const s = spotNear(m.x, m.y, 90, 160, true);
      if (!s) continue;
      const o = spawnMonster('knight', s.x, s.y, m.mlvl - 2, 1, { pack: m.pack, summoned: true, abil: ['charge', 'block'] });
      o.summoner = m.id; o.aggro = true; o.act = { kind: 'emerge', t: 0, dur: 0.6 };
      world.monsters.push(o);
      fxSprite('dark_mist', s.x, s.y, { layer: 'top', scale: 0.6 });
    }
    fxShake(12);
    castThen(m, 1.0, () => {});
    return true;
  }
  if (m.phase === 2 && k <= 0.25) {
    m.phase = 3;
    enrageMonster(m);
    for (const a in m.cd) m.cd[a] = Math.min(m.cd[a], 1);
    m.cdScale = 0.6;
    UI.banner('망자의 왕이 마지막 힘을 끌어냅니다', '');
    return true;
  }
  return false;
}

function reviveMonster(o) {
  if (!o.dead || o.deadT > 9) return;
  o.dead = false; o.deadT = 0; o.revived = true;
  o.life = Math.round(o.maxLife * 0.6);
  o.aggro = true; o.windup = 0; o.stun = 0.3;
  fxSprite('heal', o.x, o.y, { scale: 0.8 });
  fxSparks(o.x, o.y, 30, 16, '#b8ffb0', 120);
  SFX.play('revive', 0.7);
}

function summonMinion(m, x, y) {
  const type = MONSTERS[m.type].summon || 'boneling';
  const o = spawnMonster(type, x, y, Math.max(1, m.mlvl - 1), 0, { pack: m.pack, summoned: true });
  o.summoner = m.id;
  o.aggro = true;
  o.atkTimer = 1;
  o.act = { kind: 'emerge', t: 0, dur: 0.6 };
  world.monsters.push(o);
  fxSprite('runes', x, y, { layer: 'ground', scale: 0.55 });
  fxDust(x, y, 6, '110,140,110', 60);
}

function teleportMonster(m, x, y) {
  fxSprite('dark_mist', m.x, m.y, { layer: 'top', scale: 0.55 });
  m.x = x; m.y = y;
  m.windup = 0; m.pending = null; m.windupDur = m.baseWindup;
  m.atkTimer = Math.max(m.atkTimer, 0.5);
  fxSprite('dark_mist', x, y, { layer: 'top', scale: 0.55 });
  SFX.play('teleport', 0.6);
}
