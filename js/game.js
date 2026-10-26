'use strict';
// ───────── 게임 루프 · 입력 · 층 이동 · 저장 ─────────

const SAVE_KEY = 'pitbit-simyeon-save-v1';

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
  titleFocus: { x: 0, y: 0 }, titleA: 0, imgCache: {},

  iconImage(item) {
    const key = `${item.icon}:${item.rarity}:${item.look || 0}`;
    let img = this.imgCache[key];
    if (!img) { img = new Image(); img.src = itemIcon(item); this.imgCache[key] = img; }
    return img;
  },

  init() {
    initRender($('game'));
    UI.init();
    bindInput();
    this.buildTitleWorld();
    this.showTitle();
    requestAnimationFrame(loop);
  },

  buildTitleWorld() {
    const f = pick([1, 4, 7, 10, 13]);
    world = makeWorld(f);
    populateFloor();
    world.dungeon.explored.fill(1);
    buildThemeSprites(world.dungeon.theme);
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
    UI.showTitle(!!s, s ? `${s.floor}층 · 레벨 ${s.p.level}` : '');
  },

  newGame() {
    if (this.loadSaveData() && !this.newConfirm) {
      this.newConfirm = true;
      $('btn-new').textContent = '저장을 지우고 새로 시작';
      return;
    }
    player = createPlayer();
    this.pendingLevels = 0;
    this.startFloor(1);
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
    recalcStats(p);
    p.life = p.stats.maxLife;
    this.pendingLevels = 0;
    this.startFloor(s.floor);
    this.enterPlay();
    if (!Object.keys(p.skills).length) this.openCards(true);
  },

  enterPlay() {
    this.state = 'playing';
    this.deathShown = false;
    UI.hideTitle();
    UI.closePanels();
    UI.el.death.hidden = true;
    SFX.startDrone();
  },

  startFloor(n) {
    world = makeWorld(n);
    populateFloor();
    const p = player, d = world.dungeon;
    p.x = d.start.x; p.y = d.start.y; p.z = 0;
    p.order = p.path = p.attack = p.leap = p.whirl = null;
    if (R.themeName !== d.theme.name) buildThemeSprites(d.theme);
    FX.reset();
    R.camX = isoX(p.x, p.y);
    R.camY = isoY(p.x, p.y) - 30;
    d.reveal(p.x, p.y, 9);
    UI.setFloor();
    UI.banner(`${n}층 · ${d.theme.name}`, isBossFloor(n) ? `보스가 계단을 지키고 있습니다 · 몬스터 레벨 ${world.mlvl}` : `몬스터 레벨 ${world.mlvl}`);
    this.save();
  },

  descend() {
    SFX.play('stairs');
    this.startFloor(world.floor + 1);
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
      v: 1, floor: world.floor,
      p: { level: p.level, xp: p.xp, gold: p.gold, potions: p.potions, bonusLife: p.bonusLife, skills: p.skills, hotbar: p.hotbar, equipment: p.equipment, inventory: p.inventory, kills: p.kills },
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

function makeWorld(floor) {
  const dungeon = new Dungeon(floor);
  return { floor, dungeon, mlvl: monsterLevelForFloor(floor), monsters: [], ground: [], projectiles: [], chests: [], hazards: [], waves: [], flashes: [] };
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
        if (m.dead || dist(m.x, m.y, p.x, p.y) > 1000) continue;
        const hgt = m.type === 'brute' ? 40 : m.type === 'fallen' ? 20 : 28;
        const sp = worldToScreen(m.x, m.y, hgt * m.scale);
        const d = Math.hypot(sp.x - Input.mx, (sp.y - Input.my) * 0.8);
        const rr = (24 * m.scale + 4) * R.zoom + 6;
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
    if (!h) {
      const st = world.dungeon.stairs;
      const sp = worldToScreen(st.x, st.y);
      if (Math.abs(sp.x - Input.mx) < 60 * R.zoom && Math.abs(sp.y - Input.my) < 30 * R.zoom) h = { kind: 'stairs' };
    }
  }
  const prev = Input.hover;
  Input.hover = h;
  const cls = h ? (h.kind === 'monster' ? 'cur-attack' : 'cur-use') : '';
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
  const paused = Game.state !== 'playing' || !UI.el.menu.hidden || UI.anyPanel();
  if (!paused) {
    handleHeldInput(dt);
    updatePlayer(dt);
    updateMonsters(dt);
    updateProjectiles(dt);
    updateWaves(dt);
    updateHazards(dt);
    updateGround(dt);
    updateFX(dt);
    for (let i = world.flashes.length - 1; i >= 0; i--) { world.flashes[i].life -= dt; if (world.flashes[i].life <= 0) world.flashes.splice(i, 1); }
    if (world.monsters.some(m => m.dead && m.deadT > 9)) world.monsters = world.monsters.filter(m => !(m.dead && m.deadT > 9));
    Game.revealT -= dt;
    if (Game.revealT <= 0) { Game.revealT = 0.1; world.dungeon.reveal(player.x, player.y, 9); }
    if (Game.pendingLevels > 0 && !player.dead) {
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
