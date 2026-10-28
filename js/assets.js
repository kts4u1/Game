'use strict';
// ───────── Flare 스프라이트 자원: 불러오기 · 애니메이션 · 그리기 ─────────
// 그림 자원: Flare 프로젝트 (CC-BY-SA 3.0) — assets/flare/CREDITS.md 참고
// 그림이 아직 안 불러졌거나 실패하면 sprites.js의 코드 그림으로 대신 그린다.

const ASSET_BASE = 'assets/flare/';
const HAS_FLARE = typeof FLARE !== 'undefined';
// Flare 타일은 192px 폭, 이 게임 타일은 128px 폭 → 2/3 크기로 그림
const ART_K = HAS_FLARE ? (2 / 3) / FLARE.scale : 1;

const Assets = {
  imgs: {}, failed: {}, tinted: {},
  // 그림을 요청하고, 다 불러졌으면 Image를 돌려준다
  get(path) {
    let img = this.imgs[path];
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.onerror = () => { this.failed[path] = true; };
      img.src = ASSET_BASE + path;
      this.imgs[path] = img;
    }
    return img.complete && img.naturalWidth ? img : null;
  },
  ready(path) { return !!this.get(path); },
  // 여러 그림을 미리 불러옴. 진행률 콜백은 (불러온 수, 전체 수)
  preload(paths, onProgress) {
    const list = [...new Set(paths)];
    let done = 0;
    return Promise.all(list.map(p => new Promise(res => {
      this.get(p);
      const img = this.imgs[p];
      const fin = () => { done++; if (onProgress) onProgress(done, list.length); res(); };
      if (img.complete) fin();
      else { img.addEventListener('load', fin, { once: true }); img.addEventListener('error', fin, { once: true }); }
    })));
  },
  // 테마 색을 입힌 타일 아틀라스 (화면 픽셀은 읽지 않음)
  tintedAtlas(path, color) {
    if (!color) return this.get(path);
    const key = path + color;
    if (this.tinted[key]) return this.tinted[key];
    const img = this.get(path);
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    this.tinted[key] = c;
    return c;
  },
};

// 월드 방향(라디안) → Flare 8방향 번호 (0=왼쪽 아래 … 6=아래, 7=오른쪽 아래)
function flareDir(a) { return ((Math.round(a / (Math.PI / 4)) + 5) % 8 + 8) % 8; }

// 애니메이션 시간(ms) → 프레임 번호
function animIndex(anim, ms, once) {
  const n = anim.n;
  if (n <= 1) return 0;
  const step = Math.max(1, anim.dur / n);
  let i = Math.floor(ms / step);
  if (once || anim.type === 'play_once') return Math.min(n - 1, i);
  if (anim.type === 'back_forth') {
    const len = n * 2 - 2;
    i %= len;
    return i < n ? i : len - i;
  }
  return i % n;
}

function spriteSet(kind, name) { return HAS_FLARE ? (FLARE[kind] && FLARE[kind][name]) || null : null; }

// 스프라이트 한 프레임 그리기. 그림이 없으면 false
function drawSpriteFrame(ctx, set, animName, dir, idx, x, y, scale = 1) {
  if (!set) return false;
  const anim = set.anims[animName] || set.anims.stance || set.anims.power;
  if (!anim) return false;
  const row = anim.f[dir] && anim.f[dir][0] ? anim.f[dir] : anim.f[0];  // 방향이 적은 효과는 0번 방향 사용
  const fr = row && row[idx];
  if (!fr) return false;
  const img = Assets.get(set.img);
  if (!img) return false;
  const k = (2 / 3) / (set.scale || FLARE.scale) * scale;
  ctx.drawImage(img, fr[0], fr[1], fr[2], fr[3], x - fr[4] * k, y - fr[5] * k, fr[2] * k, fr[3] * k);
  return true;
}

// ── 주인공: 착용 장비 → Flare 레이어 ──
// Flare engine/hero_layers.txt 순서 (방향별로 먼저 그릴 것부터)
const HERO_LAYER_ORDER = [
  ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'],
  ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'],
  ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'],
  ['feet', 'legs', 'hands', 'chest', 'off', 'head', 'main'],
  ['feet', 'legs', 'hands', 'chest', 'off', 'head', 'main'],
  ['feet', 'legs', 'hands', 'chest', 'off', 'head', 'main'],
  ['feet', 'legs', 'hands', 'main', 'chest', 'head', 'off'],
  ['main', 'feet', 'legs', 'hands', 'chest', 'head', 'off'],
];
const GEAR_TIER = ['leather', 'chain', 'plate', 'plate'];
const WEAPON_LAYER = { axe: 'hand_axe', greataxe: 'battle_axe', sword: 'longsword', greatsword: 'greatsword', mace: 'mace', hammer: 'war_hammer' };

function heroLayers(p) {
  const eq = p.equipment;
  const t = it => GEAR_TIER[it.look || 0];
  return {
    head: eq.helm ? { leather: 'leather_hood', chain: 'chain_coif', plate: 'plate_helm' }[t(eq.helm)] : 'head_short',
    chest: eq.armor ? { leather: 'leather_chest', chain: 'chain_cuirass', plate: 'plate_cuirass' }[t(eq.armor)] : 'default_chest',
    legs: eq.armor ? { leather: 'leather_pants', chain: 'chain_greaves', plate: 'plate_greaves' }[t(eq.armor)] : 'default_legs',
    hands: eq.gloves ? { leather: 'leather_gloves', chain: 'chain_gloves', plate: 'plate_gauntlets' }[t(eq.gloves)] : 'default_hands',
    feet: eq.boots ? { leather: 'leather_boots', chain: 'chain_boots', plate: 'plate_boots' }[t(eq.boots)] : 'default_feet',
    main: eq.weapon ? baseLayer(eq.weapon) || WEAPON_LAYER[eq.weapon.icon] || null : null,
    off: eq.shield ? baseLayer(eq.shield) || 'buckler' : null,
  };
}
function baseLayer(it) { const b = BASE_INDEX[it.baseId]; return b && b.layer && FLARE.hero[b.layer] ? b.layer : null; }
const HERO_FALLBACK = { head: 'head_short', chest: 'default_chest', legs: 'default_legs', hands: 'default_hands', feet: 'default_feet', main: null, off: null };

function heroAssetPaths(p) {
  const out = Object.values(HERO_FALLBACK).filter(Boolean).map(n => FLARE.hero[n].img);
  if (p) for (const n of Object.values(heroLayers(p))) if (n && FLARE.hero[n]) out.push(FLARE.hero[n].img);
  return out;
}

// 주인공의 현재 동작 → [애니메이션, 프레임, 방향]
function heroPose(p, t) {
  let dir = flareDir(p.facing);
  const anims = FLARE.hero.default_chest.anims;
  const at = (name, k) => [name, Math.min(anims[name].n - 1, Math.floor(clamp(k, 0, 0.999) * anims[name].n)), dir];
  if (p.dead) return ['die', anims.die.n - 1, dir];
  if (p.whirl) { dir = Math.floor(t * 22) % 8; return ['swing', 2, dir]; }
  if (p.leap) return at('swing', p.leap.t / p.leap.dur);
  if (p.attack) return at('swing', p.attack.t / p.attack.dur);
  if (p.pose === 'roar') return at('cast', p.poseT / p.poseDur);
  if (p.tp) return at('cast', Math.min(0.6, p.tp.t / p.tp.dur));
  if (p.pose === 'throw' || p.pose === 'slam') return at('swing', p.poseT / p.poseDur);
  if (p.hurtT > 0 && !p.moving) return ['hit', 1, dir];
  if (p.moving) return ['run', Math.floor(p.walkPhase * 0.9) % anims.run.n, dir];
  return ['stance', animIndex(anims.stance, t * 1000), dir];
}

// 레이어를 순서대로 겹쳐 그림. 장비 그림이 아직 없으면 기본 몸으로 대신 그림
function drawHeroFlare(ctx, p, t, x, y) {
  if (!HAS_FLARE || !Assets.ready(FLARE.hero.default_chest.img)) return false;
  const layers = heroLayers(p);
  const [anim, idx, dir] = heroPose(p, t);
  for (const slot of HERO_LAYER_ORDER[dir]) {
    let name = layers[slot];
    if (name && !Assets.ready(FLARE.hero[name].img)) name = HERO_FALLBACK[slot];
    if (!name) continue;
    drawSpriteFrame(ctx, FLARE.hero[name], anim, dir, idx, x, y);
  }
  return true;
}

// ── 몬스터 ──
function monsterSprite(m) { return spriteSet('monsters', m.sprite || MONSTERS[m.type].sprite); }

function monsterPose(m, set, t) {
  const dir = flareDir(m.facing);
  const atk = set.anims.swing ? 'swing' : set.anims.shoot ? 'shoot' : 'cast';
  const A = set.anims;
  if (m.dead) return ['die', animIndex(A.die, m.deadT * 1000, true), dir];
  const act = m.act && m.act.kind;
  if (act === 'emerge' && A.spawn) return ['spawn', animIndex(A.spawn, m.act.t * 1000, true), dir];
  if ((act === 'charge' || act === 'dive' || act === 'flee' || act === 'burrow') && A.run) {
    return ['run', Math.floor((m.walkPhase + t * (act === 'charge' ? 14 : 8)) * 0.75) % A.run.n, dir];
  }
  if (m.windup > 0 && A[atk]) {
    const k = 1 - m.windup / m.windupDur;
    return [atk, Math.min(A[atk].n - 1, Math.floor(k * A[atk].n * 0.6)), dir];
  }
  if (m.strikeT > 0 && A[atk]) {
    const k = 1 - m.strikeT / 0.25;
    const n = A[atk].n;
    return [atk, Math.min(n - 1, Math.floor(n * 0.6 + k * n * 0.4)), dir];
  }
  if (m.moving && A.run) return ['run', Math.floor(m.walkPhase * 0.75) % A.run.n, dir];
  return ['stance', animIndex(A.stance, t * 1000 + m.seed * 300), dir];
}

// ── 마을 사람 ──
function npcPose(n, set, t) {
  return ['stance', animIndex(set.anims.stance, t * 1000 + n.seed * 500), flareDir(n.facing)];
}

function monsterAssetPaths(types) {
  return types.map(t => spriteSet('monsters', t)).filter(Boolean).map(s => s.img);
}

// ── 아이콘 (icons.webp, 64px 칸) ──
const ITEM_ICON = {
  handaxe: 117, longsword: 100, club: 109, waraxe: 118, broadsword: 98, morningstar: 110, doubleaxe: 119,
  bastard: 99, warhammer: 103, berserkeraxe: 118, executioner: 99, ancientaxe: 119,
  cap: 144, skullcap: 152, hornhelm: 160, warhelm: 152, greathelm: 160, warlordhelm: 160, ancienthorn: 160,
  quilted: 137, leatherarmor: 145, scalemail: 153, chainmail: 153, platemail: 161, gothicplate: 161, ancientarmor: 161,
  leathergloves: 146, chaingloves: 154, steelgauntlets: 162, wargauntlets: 162,
  leatherboots: 148, chainboots: 156, plateboots: 164, warboots: 164,
  sash: 208, leatherbelt: 208, chainbelt: 208, warbelt: 208,
};
const SKILL_ICON = {
  bash: 39, whirlwind: 46, leap: 19, warcry: 10, slam: 14, axes: 44, berserk: 18,
  mastery: 1, hide: 4, toughness: 11, bloodlust: 25, swiftness: 9, furyheart: 37,
  executioner: 12, regen: 17, thornskin: 15, treasure: 30, _life: 11, _gold: 88, _potion: 64,
};
const ICON_POTION = 64;

function itemIconIndex(item) {
  if (item.slot === 'ring') return [198, 202, 205, 207, 204][item.rarity];
  if (item.slot === 'amulet') return [212, 214, 212, 213, 215][item.rarity];
  const b = BASE_INDEX[item.baseId];
  if (b && b.ii != null) return b.ii;
  return ITEM_ICON[item.baseId] != null ? ITEM_ICON[item.baseId] : 0;
}

// CSS 스프라이트로 아이콘 표시 (크기는 부모 요소에 맞춤)
function iconHtml(index, cls = '') {
  const cols = HAS_FLARE ? FLARE.icons.cols : 8;
  const col = index % cols, row = Math.floor(index / cols);
  return `<span class="ficon ${cls}" style="background-position:${(col / (cols - 1)) * 100}% ${(row / 31) * 100}%"></span>`;
}

function drawIcon(ctx, index, x, y, size) {
  const img = Assets.get('icons.webp');
  if (!img) return false;
  const cols = FLARE.icons.cols;
  ctx.drawImage(img, (index % cols) * 64, Math.floor(index / cols) * 64, 64, 64, x, y, size, size);
  return true;
}
