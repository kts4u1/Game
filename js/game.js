'use strict';
// ───────── 게임 루프 · 입력 · 층 이동 · 저장 ─────────

const SAVE_KEY = 'pitbit-simyeon-save-v1';
const SETTINGS_KEY = 'pitbit-simyeon-settings';
const LOOT_FILTER_NAMES = ['모든 아이템', '마법 이상', '레어 이상'];

const Input = {
  mx: 0, my: 0, world: { x: 0, y: 0 }, left: false, right: false, leftMode: null,
  keys: new Set(), slotDown: [false, false, false, false], hover: null, holdT: 0,
  slotHeld(i) { return this.slotDown[i] || this.keys.has('Digit' + (i + 1)) || (i === 0 && this.right); },
  // WASD/방향키 → 월드 방향 (화면 기준 위/아래/좌/우)
  keyDir() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (!x && !y) return null;
    return Math.atan2(-x * 0.5 + y, x * 0.5 + y);
  },
};

const Game = {
  state: 'title', time: 0, pendingLevels: 0, levelUpDelay: 0, deathT: 0, deathShown: false,
  dirty: false, saveT: 0, revealT: 0, godMode: false, cardsFirst: false, newConfirm: false,
  fontUI: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  titleFocus: { x: 0, y: 0 }, titleA: 0, imgCache: {}, dungeonWorld: null, settings: { lootFilter: 0 },

  iconImage(item) {
    const key = `${item.icon}:${item.rarity}:${item.look || 0}`;
    let img = this.imgCache[key];
    if (!img) { img = new Image(); img.src = itemIcon(item); this.imgCache[key] = img; }
    return img;
  },

  init() {
    try { Object.assign(this.settings, JSON.parse(store.get(SETTINGS_KEY) || '{}')); } catch (e) { /* 무시 */ }
    initRender($('game'));
    UI.init();
    bindInput();
    this.buildTitleWorld();
    this.showTitle();
    this.preloadStart();
    requestAnimationFrame(loop);
  },

  // 시작에 필요한 그림(타일, 아이콘, 기본 몸, 1층 몬스터)을 미리 불러옴
  preloadStart() {
    if (!HAS_FLARE) return;
    const el = $('load-status');
    const paths = [FLARE.tiles.dungeon.img, FLARE.tiles.cave.img, FLARE.tiles.grassland.img, 'icons.webp', FLARE.hero.hand_axe.img, ...heroAssetPaths(null),
      ...Object.values(FLARE.npcs || {}).map(n => n.img),
      ...monsterAssetPaths(['zombie', 'skeleton', 'skeleton_archer', 'goblin']),
      ...Object.values(FLARE.effects || {}).map(e => e.img)];
    el.textContent = '그림 불러오는 중…';
    Assets.preload(paths, (n, total) => { el.textContent = `그림 불러오는 중 ${n} / ${total}`; })
      .then(() => { el.textContent = Object.keys(Assets.failed).length ? '일부 그림을 불러오지 못해 기본 그림으로 표시합니다' : ''; });
  },

  // 이 층에 나오는 몬스터와 착용 장비 그림을 불러오는 동안 잠시 멈춤
  preloadFloor() {
    if (!HAS_FLARE) return;
    const sprites = [...new Set(world.monsters.map(m => m.sprite))];
    // 소환되는 졸개 그림도 미리
    if (world.monsters.some(m => m.abil.includes('summon'))) sprites.push('skeleton_weak');
    if (world.monsters.some(m => m.final)) sprites.push('skeleton_knight_boss');
    const paths = [world.dungeon.art.set.img, FLARE.tiles.dungeon.img, ...monsterAssetPaths(sprites), ...heroAssetPaths(player)];
    if (world.town) for (const n of world.dungeon.npcs) if (n.sprite && FLARE.npcs[n.sprite]) paths.push(FLARE.npcs[n.sprite].img);
    if (paths.every(p => Assets.ready(p))) return;
    this.loading = true;
    Assets.preload(paths).then(() => {
      // 색을 입힌 몬스터 그림도 미리 만들어 둠 (처음 나올 때 멈칫하지 않게)
      for (const m of world.monsters) { const fs = monsterSprite(m); if (fs && m.color) monsterAtlas(m, fs); }
      this.loading = false;
    });
    setTimeout(() => { this.loading = false; }, 8000);
  },

  buildTitleWorld() {
    const f = pick([1, 4, 7, 10, 13]);
    world = makeWorld(f, 0);
    populateFloor();
    world.dungeon.explored.fill(1);
    buildThemeSprites(world.dungeon.theme);
    prepareFloorArt(world.dungeon);
    const r = world.dungeon.startRoom;
    this.titleCenter = { x: (r.cx + 0.5) * TILE, y: (r.cy + 0.5) * TILE };
    this.titleFocus = { x: this.titleCenter.x, y: this.titleCenter.y };
    R.camX = isoX(this.titleFocus.x, this.titleFocus.y);
    R.camY = isoY(this.titleFocus.x, this.titleFocus.y);
  },

  showTitle() {
    const s = this.loadSaveData();
    this.newConfirm = false;
    $('btn-new').textContent = '새 게임';
    const nm = s && s.p.difficulty === 1;
    UI.showTitle(!!s, s ? `${nm ? '악몽 ' : ''}${s.floor ? s.floor + '층' : '마을'} · 레벨 ${s.p.level}${s.p.clearedNM ? ' · 악몽 정복' : s.p.cleared ? ' · 정복 완료' : ''}` : '');
  },

  newGame() {
    if (this.loadSaveData() && !this.newConfirm) {
      this.newConfirm = true;
      $('btn-new').textContent = '저장을 지우고 새로 시작';
      return;
    }
    player = createPlayer();
    this.pendingLevels = 0;
    this.dungeonWorld = null;
    Shop.buyback = [];
    this.goTown('new');
    this.enterPlay();
    this.openCards(true);
  },

  continueGame() {
    const s = this.loadSaveData();
    if (!s) { this.newGame(); return; }
    player = createPlayer();
    const p = player, d = s.p;
    p.level = d.level; p.xp = d.xp; p.gold = d.gold; p.potions = d.potions; p.bonusLife = d.bonusLife || 0;
    p.skills = d.skills || {}; p.hotbar = d.hotbar || [null, null, null, null];
    p.equipment = Object.assign(p.equipment, d.equipment || {});
    p.inventory = (d.inventory || []).concat(new Array(40).fill(null)).slice(0, 40);
    p.kills = d.kills || 0;
    p.deepest = d.deepest || s.floor || 1;
    p.stash = (d.stash || []).concat(new Array(STASH_SIZE).fill(null)).slice(0, STASH_SIZE);
    p.elixirs = d.elixirs || {};
    p.playTime = d.playTime || 0; p.deaths = d.deaths || 0; p.cleared = d.cleared || null; p.clearedNM = d.clearedNM || null;
    p.difficulty = d.cleared && d.difficulty === 1 ? 1 : 0;
    p.deepestBy = d.deepestBy || [p.deepest, 1];
    p.deepestBy[p.difficulty] = p.deepest;
    recalcStats(p);
    p.life = p.stats.maxLife;
    this.pendingLevels = s.pending || 0;
    this.levelUpDelay = 1.5;
    this.dungeonWorld = null;
    Shop.buyback = [];
    if (s.floor) this.startFloor(Math.min(FINAL_FLOOR, s.floor)); else this.goTown('start');
    this.enterPlay();
    if (!Object.keys(p.skills).length) this.openCards(true);
  },

  enterPlay() {
    this.state = 'playing';
    this.deathShown = false;
    UI.hideTitle();
    UI.closePanels();
    UI.el.death.hidden = true;
    SFX.setAmbient(world.dungeon.theme.sound || world.dungeon.theme.tiles);
  },

  // 새 층(또는 마을)에 플레이어를 세우고 그림·소리·카메라를 맞춤
  arrive(x, y) {
    const p = player, d = world.dungeon;
    const spot = d.freeSpot(x, y, p.r);  // 벽 안에 서지 않게
    p.x = spot.x; p.y = spot.y; p.z = 0;
    p.order = p.path = p.attack = p.leap = p.whirl = p.tp = null;
    p.dead = false;
    if (R.themeName !== d.theme.name) buildThemeSprites(d.theme);
    if (!d.art) prepareFloorArt(d);
    this.preloadFloor();
    SFX.setAmbient(d.theme.sound || d.theme.tiles);
    FX.reset();
    R.camX = isoX(p.x, p.y);
    R.camY = isoY(p.x, p.y) - 30;
    d.reveal(p.x, p.y, d.outdoor ? 12 : 9);
    UI.setFloor();
  },

  startFloor(n) {
    world = makeWorld(n);
    populateFloor();
    const p = player, d = world.dungeon;
    const prevDeep = p.deepest || 1;
    p.deepest = Math.max(prevDeep, n);
    this.arrive(d.start.x, d.start.y);
    const nm = world.diff === 1 ? '악몽 · ' : '';
    if (n >= FINAL_FLOOR) UI.banner(`${nm}최종층 · ${d.theme.name}`, `망자의 왕이 기다립니다 · 몬스터 레벨 ${world.mlvl}`);
    else UI.banner(`${nm}${n}층 · ${d.theme.name}`, isBossFloor(n) ? `보스가 계단을 지키고 있습니다 · 몬스터 레벨 ${world.mlvl}` : `몬스터 레벨 ${world.mlvl}`);
    if (n > prevDeep && n > 1 && (n - 1) % 5 === 0) UI.message(`${n}층 웨이포인트가 열렸습니다. 마을의 심연의 문에서 바로 올 수 있습니다.`, '#8fd0ff');
    this.save();
  },

  // 마을로 감. how: new 새 게임, start 이어하기, portal 귀환 차원문, death 부활
  goTown(how) {
    world = makeWorld(0);
    populateFloor();
    const d = world.dungeon, p = player;
    const at = how === 'portal' || how === 'death' ? d.portalSpot : d.start;
    this.arrive(at.x + (how === 'portal' ? -40 : 0), at.y + (how === 'portal' ? 30 : 0));
    p.poisonT = 0; p.slowT = 0;
    Shop.restock();
    UI.banner(d.theme.name, how === 'new' ? '심연의 문(가운데 빛나는 원)으로 들어가 던전으로 내려가세요' : '상인과 거래하고 장비를 정비하세요');
    if (how === 'new') UI.message('상인을 누르면 거래할 수 있습니다. 던전에서는 T 키로 마을에 돌아올 수 있습니다.', '#e8d9a8');
    this.save();
  },

  // 귀환 차원문을 통해 남겨 둔 던전으로 돌아감
  returnToDungeon() {
    const dw = this.dungeonWorld;
    if (!dw || !dw.portal) { UI.message('열려 있는 차원문이 없습니다', '#c9c1b3'); return; }
    world = dw;
    SFX.play('teleporter');
    // 차원문 바로 앞(빈자리)에 나타남
    const d = dw.dungeon, pt = dw.portal;
    let at = null;
    for (const [ox, oy] of [[40, 20], [20, 40], [45, -10], [-10, 45], [-40, -20], [-20, -40]]) {
      if (!d.circleBlocked(pt.x + ox, pt.y + oy, player.r) && d.clearPath(pt.x, pt.y, pt.x + ox, pt.y + oy, 10)) { at = { x: pt.x + ox, y: pt.y + oy }; break; }
    }
    this.arrive(at ? at.x : pt.x, at ? at.y : pt.y);
    UI.banner(`${world.diff === 1 ? '악몽 · ' : ''}${world.floor}층 · ${world.dungeon.theme.name}`, '차원문을 통해 돌아왔습니다');
    this.save();
  },

  // 웨이포인트 이동
  travel(f) {
    f = Math.min(FINAL_FLOOR, f);
    this.dungeonWorld = null;
    SFX.play('teleporter');
    this.startFloor(f);
  },

  descend() {
    if (world.floor >= FINAL_FLOOR) return;
    SFX.play('stairs');
    this.dungeonWorld = null;
    this.startFloor(world.floor + 1);
  },

  // 최종 보스 처치
  victory(m) {
    const p = player, nm = world.diff === 1;
    const key = nm ? 'clearedNM' : 'cleared';
    const first = !p[key];
    if (first) p[key] = { time: Math.round(p.playTime || 0), level: p.level, kills: p.kills, deaths: p.deaths || 0 };
    p.clearCount = (p.clearCount || 0) + 1;
    this.slowmo = 2.2;
    fxShake(20);
    for (let i = 0; i < 6; i++) fxRing(m.x, m.y, 10 + i * 20, 260 + i * 90, 1.2 + i * 0.25, i % 2 ? '#c9b6ff' : '#ffd36a', 8);
    world.flashes.push({ x: m.x, y: m.y, r: 700, life: 1.6, color: [255, 220, 150] });
    fxSprite('sparkle', m.x, m.y, { life: 4, fade: 1.2, scale: 2 });
    fxBeam(m.x, m.y, '#ffd36a', 6);
    SFX.play('levelup');
    SFX.synth('unique');
    UI.banner(nm ? '악몽의 왕관이 부서졌습니다' : '망자의 왕관이 부서졌습니다', nm ? '악몽이 끝났습니다' : '심연이 잠들었습니다');
    // 보스가 쓰러진 자리에 마을로 가는 차원문
    const spot = world.dungeon.freeSpot(m.x + 60, m.y, 26);
    world.portal = { x: spot.x, y: spot.y, kind: 'portal', t: 0 };
    this.dungeonWorld = world;
    if (first) { this.endingT = 4.2; this.endingNM = nm; }
    else UI.message(nm ? '악몽 속 망자의 왕을 다시 쓰러뜨렸습니다' : '망자의 왕을 다시 쓰러뜨렸습니다', '#ffd36a');
    this.save();
  },

  // 난이도별 가장 깊이 내려간 층 [일반, 악몽]
  deepestBy() {
    const p = player, by = (p.deepestBy || [1, 1]).slice();
    by[p.difficulty || 0] = p.deepest || 1;
    return by;
  },
  // 난이도 바꾸기 (마을에서). 다른 난이도로 열어 둔 차원문은 닫힘
  setDifficulty(diff) {
    const p = player;
    if (!p || diff === (p.difficulty || 0) || (diff === 1 && !p.cleared)) return;
    const by = this.deepestBy();
    p.difficulty = diff;
    p.deepestBy = by;
    p.deepest = by[diff] || 1;
    this.dungeonWorld = null;
    recalcStats(p);
    p.life = Math.min(p.life, p.stats.maxLife);
    UI.setFloor();
    SFX.play(diff ? 'levelup' : 'equip');
    if (diff === 1) UI.banner('악몽 난이도', `몬스터 레벨 ${monsterLevelForFloor(1, 1)}부터 · 더 좋은 아이템과 골드 · 원소 저항 ${DIFFICULTIES[1].res}%`);
    else UI.banner('일반 난이도', '처음 내려갔던 심연으로 돌아갑니다');
    this.save();
  },

  saveSettings() { store.set(SETTINGS_KEY, JSON.stringify(this.settings)); },

  // 바닥 아이템 표시: 전부 → 마법 이상 → 레어 이상
  cycleLootFilter() {
    this.settings.lootFilter = ((this.settings.lootFilter || 0) + 1) % 3;
    this.saveSettings();
    UI.message(`바닥 아이템 표시: ${LOOT_FILTER_NAMES[this.settings.lootFilter]}`, '#e8d9a8');
    UI.syncMenu();
  },

  openCards(first) {
    this.state = 'levelup';
    this.cardsFirst = first;
    UI.closePanels();
    UI.el.banner.hidden = true;
    UI.showLevelUp(rollCards(first), first);
  },

  chooseCard(id) {
    if (this.state !== 'levelup') return;
    const lv = player.skills[id] || 0;
    learnSkill(id);
    UI.hideLevelUp();
    if (!this.cardsFirst) this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    else if (UI.lastBanner) UI.banner(...UI.lastBanner);
    this.cardsFirst = false;
    this.state = 'playing';
    SFX.play('equip');
    if (SKILLS[id]) {
      const sk = SKILLS[id];
      const slot = player.hotbar.indexOf(id);
      UI.message(lv ? `${sk.name} 레벨 ${lv + 1}` : `${sk.name} 습득${slot >= 0 ? ` · ${slot + 1}번 키` : ''}`, '#ffd36a');
    }
    if (this.pendingLevels > 0) this.levelUpDelay = 0.25;
    this.save();
  },

  save() {
    if (!player || this.state === 'title' || !world) return;
    const p = player;
    const data = {
      v: 1, floor: world.town ? 0 : world.floor, pending: this.pendingLevels || 0,
      p: {
        level: p.level, xp: p.xp, gold: p.gold, potions: p.potions, bonusLife: p.bonusLife, skills: p.skills, hotbar: p.hotbar,
        equipment: p.equipment, inventory: p.inventory, kills: p.kills, deepest: p.deepest, stash: p.stash, elixirs: p.elixirs,
        playTime: Math.round(p.playTime || 0), deaths: p.deaths || 0, cleared: p.cleared || null,
        clearedNM: p.clearedNM || null, difficulty: p.difficulty || 0, deepestBy: this.deepestBy(),
      },
    };
    store.set(SAVE_KEY, JSON.stringify(data));
    this.dirty = false;
  },

  loadSaveData() {
    const raw = store.get(SAVE_KEY);
    if (!raw) return null;
    try { const d = JSON.parse(raw); return d && d.v === 1 ? d : null; } catch (e) { return null; }
  },

  toTitle() {
    this.state = 'title';
    UI.closePanels();
    UI.hideLevelUp();
    UI.el.death.hidden = true;
    this.buildTitleWorld();
    this.showTitle();
  },
};

function makeWorld(floor, diff) {
  const dungeon = new Dungeon(floor);
  diff = !floor ? 0 : diff != null ? diff : (player && player.difficulty) || 0;
  return {
    floor, dungeon, town: floor === 0, diff, mlvl: floor ? monsterLevelForFloor(floor, diff) : 1, monsters: [], ground: [], projectiles: [],
    chests: [], hazards: [], waves: [], flashes: [], pools: [], portal: null,
  };
}

// ── 입력 ──
function bindInput() {
  const cv = R.canvas;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    SFX.init();
    Input.mx = e.clientX; Input.my = e.clientY;
    if (Game.state !== 'playing') return;
    if (UI.anyPanel() || !UI.el.menu.hidden) { UI.closePanels(); UI.toggleMenu(false); return; }
    updateHover();
    if (e.button === 2) { Input.right = true; useSkill(0); return; }
    if (e.button !== 0) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    Input.left = true;
    onLeftPress(e.shiftKey);
  });
  cv.addEventListener('pointermove', e => { Input.mx = e.clientX; Input.my = e.clientY; });
  const up = e => {
    if (e.button === 2) Input.right = false;
    else { Input.left = false; Input.leftMode = null; }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  window.addEventListener('keydown', e => {
    const k = e.code;
    if (k === 'Tab') e.preventDefault();
    if (e.repeat) return;
    SFX.init();
    Input.keys.add(k);
    if (Game.state === 'levelup') {
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(k);
      if (n >= 0 && UI.cards) Game.chooseCard(UI.cards[n]);
      return;
    }
    if (Game.state !== 'playing') return;
    const free = !UI.anyPanel() && UI.el.menu.hidden;
    switch (k) {
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
        if (free) useSkill(+k.slice(5) - 1);
        break;
      case 'KeyQ': if (free) drinkPotion(); break;
      case 'KeyT': if (free) Town.castPortal(); break;
      case 'KeyL': Game.cycleLootFilter(); break;
      case 'KeyI': UI.toggleMenu(false); UI.togglePanel('inv'); break;
      case 'KeyC': UI.toggleMenu(false); UI.togglePanel('char'); break;
      case 'Tab': R.showMap = !R.showMap; break;
      case 'KeyM': UI.toggleSound(); break;
      case 'Escape': if (UI.anyPanel()) UI.closePanels(); else UI.toggleMenu(); break;
    }
  });
  window.addEventListener('keyup', e => Input.keys.delete(e.code));
  window.addEventListener('blur', () => {
    Input.keys.clear(); Input.left = false; Input.right = false; Input.slotDown.fill(false);
  });
}

function onLeftPress(shift) {
  const p = player;
  if (!p || p.dead) return;
  const h = Input.hover;
  if (shift) { Input.leftMode = 'stand'; return; }
  if (h && h.kind === 'ground') { p.order = { type: 'pickup', target: h.ref }; Input.leftMode = 'once'; }
  else if (h && h.kind === 'monster') { p.order = { type: 'attack', target: h.ref }; Input.leftMode = 'attack'; }
  else if (h && h.kind === 'chest') { p.order = { type: 'chest', target: h.ref }; Input.leftMode = 'once'; }
  else if (h && h.kind === 'stairs') { p.order = { type: 'stairs' }; Input.leftMode = 'once'; }
  else if (h && h.kind === 'npc') { p.order = { type: 'npc', target: h.ref }; Input.leftMode = 'once'; }
  else if (h && h.kind === 'portal') { p.order = { type: 'portal', target: h.ref }; Input.leftMode = 'once'; }
  else {
    p.order = { type: 'move', x: Input.world.x, y: Input.world.y };
    Input.leftMode = 'move';
    fxRing(Input.world.x, Input.world.y, 3, 16, 0.35, 'rgba(232,217,168,.8)', 2, false);
  }
}

function handleHeldInput(dt) {
  const p = player;
  if (!p || p.dead) return;
  if (Input.left) {
    if (Input.leftMode === 'move') {
      Input.holdT -= dt;
      if (Input.holdT <= 0) { Input.holdT = 0.08; p.order = { type: 'move', x: Input.world.x, y: Input.world.y }; }
    } else if (Input.leftMode === 'attack') {
      if (!p.order || p.order.type !== 'attack' || p.order.target.dead) {
        const h = Input.hover;
        if (h && h.kind === 'monster') p.order = { type: 'attack', target: h.ref };
      }
    } else if (Input.leftMode === 'stand' && !p.attack && !p.leap && !p.whirl) {
      startAttack('basic', null, Input.world.x, Input.world.y);
    }
  }
  // 스킬 키를 누르고 있으면 반복 사용
  for (let i = 0; i < 4; i++) {
    const id = p.hotbar[i];
    if (!id || id === 'whirlwind' || !Input.slotHeld(i)) continue;
    if (p.attack || p.leap || p.pose) continue;
    const v = SKILLS[id].vals(effLevel(p, id));
    if ((p.cds[id] || 0) > 0 || p.fury < v.cost) continue;
    useSkill(i);
  }
  // 소용돌이는 누르고 있는 동안 유지
  for (let i = 0; i < 4; i++) {
    if (p.hotbar[i] === 'whirlwind' && Input.slotHeld(i) && !p.whirl && !p.leap && p.fury >= 5) useSkill(i);
  }
}

function updateHover() {
  Input.world = screenToWorld(Input.mx, Input.my);
  let h = null;
  const p = player;
  if (Game.state === 'playing' && p && world) {
    for (const L of R.labels) {
      const r = L.rect;
      if (Input.mx >= r.x && Input.mx <= r.x + r.w && Input.my >= r.y && Input.my <= r.y + r.h) { h = { kind: 'ground', ref: L.g }; break; }
    }
    if (!h) {
      let bd = Infinity;
      for (const m of world.monsters) {
        if (!hittable(m) || dist(m.x, m.y, p.x, p.y) > 1000) continue;
        const mh = monsterHeight(m);
        const sp = worldToScreen(m.x, m.y, mh * 0.45);
        const d = Math.hypot(sp.x - Input.mx, (sp.y - Input.my) * 0.7);
        const rr = Math.max(22, mh * 0.38) * R.zoom + 6;
        if (d < rr && d < bd) { bd = d; h = { kind: 'monster', ref: m }; }
      }
    }
    if (!h) {
      for (const c of world.chests) {
        if (c.open) continue;
        const sp = worldToScreen(c.x, c.y, 14);
        if (Math.hypot(sp.x - Input.mx, sp.y - Input.my) < 28 * R.zoom + 6) { h = { kind: 'chest', ref: c }; break; }
      }
    }
    if (!h && world.portal) {
      const sp = worldToScreen(world.portal.x, world.portal.y, 40);
      if (Math.hypot(sp.x - Input.mx, (sp.y - Input.my) * 0.8) < 46 * R.zoom) h = { kind: 'portal', ref: world.portal };
    }
    if (!h && world.town) {
      // 마을 사람·보관함·심연의 문
      let bd = Infinity;
      for (const n of world.dungeon.npcs) {
        const hgt = n.sprite ? 70 : n.role === 'gate' ? 0 : 20;
        const sp = worldToScreen(n.x, n.y, hgt * 0.6);
        const rr = (n.role === 'gate' ? 70 : 34) * R.zoom;
        const d = Math.hypot(sp.x - Input.mx, (sp.y - Input.my) * (n.role === 'gate' ? 1.9 : 0.7));
        if (d < rr && d < bd) { bd = d; h = { kind: 'npc', ref: n }; }
      }
      const tp = Game.dungeonWorld && Game.dungeonWorld.portal ? world.dungeon.portalSpot : null;
      if (!h && tp) {
        const sp = worldToScreen(tp.x, tp.y, 40);
        if (Math.hypot(sp.x - Input.mx, (sp.y - Input.my) * 0.8) < 46 * R.zoom) h = { kind: 'portal', ref: tp };
      }
    }
    if (!h && !world.dungeon.stairs.none) {
      const st = world.dungeon.stairs;
      const sp = worldToScreen(st.x, st.y);
      if (Math.abs(sp.x - Input.mx) / (110 * R.zoom) + Math.abs(sp.y - Input.my) / (55 * R.zoom) < 1) h = { kind: 'stairs' };
    }
  }
  const prev = Input.hover;
  Input.hover = h;
  const cls = h ? (h.kind === 'monster' ? 'cur-attack' : h.kind === 'npc' && h.ref.role === 'talk' ? 'cur-talk' : 'cur-use') : '';
  if (R.canvas.dataset.cur !== cls) { R.canvas.dataset.cur = cls; R.canvas.className = cls; }
  // 바닥 아이템 툴팁
  if (UI.finePointer && h && h.kind === 'ground' && h.ref.kind === 'item') {
    if (!prev || prev.ref !== h.ref || UI.el.tooltip.hidden) {
      const it = h.ref.item;
      let html = `<div class="tt">${itemTooltipHtml(it)}</div>`;
      const k = it.slot === 'ring' ? 'ring1' : it.slot;
      if (p.equipment[k]) html += `<div class="tt tt-compare">${itemTooltipHtml(p.equipment[k], { header: '착용 중', noValue: true })}</div>`;
      UI.showTooltip(html, Input.mx, Input.my);
    }
  } else if (prev && prev.kind === 'ground' && !UI.anyPanel()) UI.hideTooltip();
}

// ── 메인 루프 ──
let lastT = 0;
function loop(ts) {
  const dt = Math.min(0.05, Math.max(0.001, (ts - lastT) / 1000 || 0.016));
  lastT = ts;
  try {
    update(dt);
    renderFrame(Game.time, Game.state === 'title' || !player ? Game.titleFocus : player);
  } catch (e) {
    console.error(e);
  }
  requestAnimationFrame(loop);
}

function update(dt) {
  Game.time += dt;
  if (Game.state === 'title') {
    Game.titleA += dt * 0.12;
    const c = Game.titleCenter;
    const tx = c.x + Math.cos(Game.titleA) * 140, ty = c.y + Math.sin(Game.titleA) * 140;
    if (!world.dungeon.circleBlocked(tx, ty, 4)) { Game.titleFocus.x = tx; Game.titleFocus.y = ty; }
    updateFX(dt);
    return;
  }
  updateHover();
  const paused = Game.state !== 'playing' || !UI.el.menu.hidden || UI.anyPanel() || Game.loading;
  if (Game.endingT > 0 && Game.state === 'playing') {
    Game.endingT -= dt;
    if (Game.endingT <= 0) { Game.endingT = 0; Game.state = 'ending'; UI.closePanels(); UI.showEnding(Game.endingNM); }
  }
  // 최종 보스가 쓰러질 때 잠시 느리게
  if (Game.slowmo > 0) { Game.slowmo -= dt; dt *= Game.slowmo > 0 ? 0.3 : 1; }
  if (!paused) {
    player.playTime = (player.playTime || 0) + dt;
    handleHeldInput(dt);
    updatePlayer(dt);
    // 발소리와 심장 박동
    const pl = player;
    if (pl.moving && !pl.whirl && !pl.leap && !pl.dead) {
      Game.stepT = (Game.stepT || 0) - dt * (pl.stats.speed / 185);
      if (Game.stepT <= 0) { Game.stepT = 0.34; SFX.play('step'); }
    }
    if (!pl.dead && !world.town && pl.life < pl.stats.maxLife * 0.25) {
      Game.heartT = (Game.heartT || 0) - dt;
      if (Game.heartT <= 0) { Game.heartT = 1.75; SFX.play('heartbeat'); }
    } else Game.heartT = 0;
    updateMonsters(dt);
    updateProjectiles(dt);
    updateWaves(dt);
    updateHazards(dt);
    updatePools(dt);
    updateGround(dt);
    if (world.town) updateTownNpcs(dt);
    updateFX(dt);
    for (let i = world.flashes.length - 1; i >= 0; i--) { world.flashes[i].life -= dt; if (world.flashes[i].life <= 0) world.flashes.splice(i, 1); }
    if (world.monsters.some(m => m.dead && m.deadT > 9)) world.monsters = world.monsters.filter(m => !(m.dead && m.deadT > 9));
    Game.revealT -= dt;
    if (Game.revealT <= 0) { Game.revealT = 0.1; world.dungeon.reveal(player.x, player.y, world.dungeon.outdoor ? 12 : 9); }
    if (Game.pendingLevels > 0 && !player.dead && !(Game.endingT > 0)) {
      Game.levelUpDelay -= dt;
      if (Game.levelUpDelay <= 0) Game.openCards(false);
    }
    if (player.dead && !Game.deathShown) {
      Game.deathT -= dt;
      if (Game.deathT <= 0) { Game.deathShown = true; UI.el.death.hidden = false; }
    }
    if (!player.dead) Game.deathShown = false;
    Game.saveT -= dt;
    if (Game.saveT <= 0) { Game.saveT = 20; if (Game.dirty) Game.save(); }
  }
  UI.update(dt);
}

// 호스팅 환경이 페이지를 갱신할 때 진행 상황을 넘겨받을 수 있으면 사용
window.addEventListener('load', () => {
  const hot = window.claude && window.claude.hot;
  const boot = data => {
    if (data && data.save) store.set(SAVE_KEY, JSON.stringify(data.save));
    Game.init();
    if (data && data.save && data.playing) Game.continueGame();
  };
  if (hot && typeof hot.snapshot === 'function') {
    hot.snapshot(() => {
      if (Game.state !== 'title') Game.save();
      const raw = store.get(SAVE_KEY);
      return { save: raw ? JSON.parse(raw) : null, playing: Game.state !== 'title' };
    });
  }
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot(hot && hot.data);
});
