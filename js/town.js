'use strict';
// ───────── 마을: 지도 · 주민 · 상점 · 보관함 · 귀환 차원문 · 웨이포인트 ─────────
// 그림: Flare grassland 타일셋과 NPC (CC-BY-SA 3.0)

// at: 마을 중심에서의 타일 위치. props: [그림, dx, dy, 막힘] (NPC 기준)
const TOWN_NPCS = [
  { id: 'smith', role: 'smith', name: '대장장이 브론', sprite: 'guild_man', at: [-7, -3], voice: ['npc_m1', 'npc_m2'],
    greet: ['쇠는 거짓말을 하지 않지. 뭘 찾나?', '좋은 날이 서야 살아 돌아온다네.', '망치질 한 번이면 그 장비도 새것처럼 될 걸세.'],
    props: [['anvil', 1, 1, true], ['campfire', -1, 2, true], ['wood', -2, 0, true], ['wood2', -2, -1, true], ['crates', 0, -2, true], ['stumpAxe', 2, -1, true]] },
  { id: 'gambler', role: 'gambler', name: '떠돌이 상인 실렌', sprite: 'wandering_trader', at: [-3, -7], voice: ['npc_m3'],
    greet: ['운을 시험해 보겠나? 상자 속엔 무엇이든 들어 있지.', '후후… 금화 몇 닢이면 전설이 될 수도 있다네.', '보는 눈이 있는 자만 웃게 되지.'],
    props: [['tent2', -1, -1, true], ['chest', 1, -1, true], ['crates2', -2, 1, true], ['sign2', 2, 0, true]] },
  { id: 'healer', role: 'healer', name: '약초상 마라', sprite: 'peasant_woman2', at: [-5, 4], voice: ['npc_f1', 'npc_f2', 'npc_f3'],
    greet: ['다쳤군요. 이리 와요, 상처부터 봐 줄게요.', '물약은 넉넉히 챙겨 가요. 아래는 생각보다 깊으니까.', '비약 한 병이 목숨을 구할 때가 있죠.'],
    props: [['tent', -1, 1, true], ['crate', -2, -1, true], ['wood', 1, 2, true]] },
  { id: 'refiner', role: 'refiner', name: '재련사 쿠루', sprite: 'peddler_goblin', at: [4, -5], voice: ['npc_m4'],
    greet: ['끼끼! 낡은 물건도 쿠루 손에선 보물이 되지!', '마법이 마음에 안 들어? 다시 녹여 주지, 끼끼.', '반짝이는 걸 더 반짝이게! 물론 공짜는 아니고.'],
    props: [['crates2', 1, -1, true], ['crateOpen', -1, -2, true], ['stump', 2, 1, true]] },
  { id: 'captain', role: 'talk', name: '경비대장 에드릭', sprite: 'knight', at: [6, 4], voice: ['npc_m2'],
    lines: [
      '다섯 층마다 강한 놈이 계단을 지키고 있다. 그놈을 쓰러뜨리면 다음 층의 웨이포인트가 열리지.',
      'T 키로 귀환 차원문을 열 수 있다. 가방이 차면 돌아와서 정비하게.',
      '방패를 들면 공격을 통째로 막아낼 수 있다. 대신 양손 무기는 못 쓰지.',
      '고블린 약탈자를 조심해라. 금화를 훔쳐 달아나는데, 잡으면 되찾을 수 있다.',
      '무덤에서 해골이 끝없이 기어 나온다면, 무덤부터 부숴라.',
      '바닥이 붉게 빛나면 피해라. 큰 놈들은 공격하기 전에 표시가 난다.',
      '얼음은 발을 묶고, 독은 서서히 목숨을 갉아먹는다. 원소 저항이 붙은 장비를 챙겨라.',
    ] },
  { id: 'farmer', role: 'talk', name: '농부 한스', sprite: 'peasant_man1', at: [-2, 6], voice: ['npc_m3'],
    lines: ['밭에 해골 손이 튀어나온 뒤로 아무것도 안 자라요.', '밤마다 땅 밑에서 긁는 소리가 들려요…', '용사님, 제발 저 구덩이를 막아 주세요.'] },
  { id: 'hunter', role: 'talk', name: '사냥꾼 요릭', sprite: 'peasant_man2', at: [5, 0], voice: ['npc_m1'],
    lines: ['개미귀신은 땅속으로 숨었다가 바로 발밑에서 튀어나와.', '비룡이 하늘로 솟구치면 그림자를 봐. 거기로 떨어지거든.', '새끼 개미귀신은 무리 지어 숨어 있어. 한 마리가 보이면 열 마리가 있다고 생각해.'] },
  { id: 'widow', role: 'talk', name: '엘사', sprite: 'peasant_woman1', at: [1, 7], voice: ['npc_f4'],
    lines: ['남편이 저 아래로 내려간 지 열흘째예요.', '보관함엔 아무도 손대지 않으니 걱정 말아요.', '대장장이 브론에게 장비를 강화해 달라고 해 봐요. 솜씨가 좋거든요.'] },
  { id: 'stash', role: 'stash', name: '보관함', prop: 'chest', at: [3, -2], reach: 60 },
  { id: 'gate', role: 'gate', name: '심연의 문', at: [0, 0], reach: 60 },
  { id: 'obelisk', role: 'gate', name: '귀환의 오벨리스크', sprite: 'return_obelisk1', at: [-2, -1], reach: 70 },
];

// 마을 지도: 숲속 공터 + 돌길 광장
function generateTown(d) {
  const W = 56, H = 56, cx = 28, cy = 28;
  d.w = W; d.h = H; d.town = true;
  d.tiles = new Uint8Array(W * H);
  d.path = new Uint8Array(W * H);
  const p0 = Math.random() * TAU, p1 = Math.random() * TAU;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx);
    const r = 12.5 + Math.sin(a * 3 + p0) * 1.2 + Math.sin(a * 5 + p1) * 0.7;
    d.tiles[y * W + x] = Math.hypot(dx, dy) < r ? 1 : 2;
  }
  const setPath = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H && d.tiles[y * W + x] === 1) d.path[y * W + x] = 1; };
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (Math.hypot(x, y) < 3.3) setPath(cx + x, cy + y);
  // 광장에서 각 상인에게 이어지는 길
  for (const n of TOWN_NPCS) {
    if (n.role === 'talk' || n.role === 'gate') continue;
    let x = cx, y = cy;
    const tx = cx + n.at[0], ty = cy + n.at[1];
    while (x !== tx || y !== ty) {
      if (Math.abs(tx - x) >= Math.abs(ty - y)) x += Math.sign(tx - x); else y += Math.sign(ty - y);
      setPath(x, y);
    }
  }
  d.npcs = [];
  d.props = [];
  const block = (x, y) => { if (d.tiles[y * W + x] === 1) d.tiles[y * W + x] = 3; };
  for (const def of TOWN_NPCS) {
    const tx = cx + def.at[0], ty = cy + def.at[1];
    const n = Object.assign({}, def, { tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, facing: angleTo(tx, ty, cx, cy), seed: Math.random() * 10, say: null });
    d.npcs.push(n);
    if (def.role !== 'gate') block(tx, ty);
    if (def.prop) d.props.push({ name: def.prop, x: n.x, y: n.y });
    for (const [name, dx, dy, b] of def.props || []) {
      const px = tx + dx, py = ty + dy;
      if (d.tiles[py * W + px] !== 1) continue;
      d.props.push({ name, x: (px + 0.5) * TILE, y: (py + 0.5) * TILE });
      d.path[py * W + px] = 0;
      if (b) block(px, py);
    }
  }
  // 오벨리스크 둘레 장식과 작은 묘지
  const deco = [['sign', 3, -4], ['graves', 8, -4], ['graves', 9, -3], ['graves', 8, -2], ['graves', 10, -5], ['stump', -8, 6], ['crate', 7, 6], ['bushes', -9, -2], ['bushes', 2, 9], ['rocks', 9, 3]];
  for (const [name, dx, dy] of deco) {
    const x = cx + dx, y = cy + dy;
    if (d.tiles[y * W + x] !== 1) continue;
    d.props.push({ name, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, pick: Math.floor(Math.random() * 4) });
    block(x, y);
  }
  d.rooms = [{ x: cx - 8, y: cy - 8, w: 16, h: 16, cx, cy }];
  d.startRoom = d.stairsRoom = d.rooms[0];
  d.start = { x: (cx + 2.5) * TILE, y: (cy + 3.5) * TILE };
  d.portalSpot = { x: (cx + 3.5) * TILE, y: (cy + 1.5) * TILE };
  d.gate = d.npcs.find(n => n.id === 'gate');
  d.stairs = { x: -99999, y: -99999, open: false, none: true };
  d.torches = [];
  d.decor = [];
  d.explored = new Uint8Array(W * H).fill(1);
  d.variant = new Uint8Array(W * H);
  // 모닥불과 광장 화로의 불빛
  const fire = d.props.find(p => p.name === 'campfire');
  d.lights = [];
  if (fire) d.lights.push({ x: fire.x, y: fire.y, r: 330, i: 0.8, c: [255, 160, 80], flicker: true, fire: true });
  d.lights.push({ x: d.gate.x, y: d.gate.y, r: 260, i: 0.55, c: [120, 190, 255] });
  d.center = { x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE };
  d.ambient = [26, 24, 26];
}

// ── 마을 상호작용 ──
const Town = {
  // 귀환 차원문 시전 (T 키)
  castPortal() {
    const p = player;
    if (!p || p.dead || Game.state !== 'playing') return;
    if (world.town) { UI.message('이미 마을에 있습니다', '#c9c1b3'); return; }
    if (p.tp) return;
    p.order = null; p.attack = null; p.whirl = null; p.path = null;
    p.tp = { t: 0, dur: 1.2 };
    SFX.play('teleport', 0.7);
    fxSprite('runes_blue', p.x, p.y, { layer: 'ground', life: 1.2, scale: 1.1, fade: 0.3 });
    fxRing(p.x, p.y, 10, 70, 1.2, '#8fd0ff', 3);
  },
  castPortalDone() {
    const p = player, d = world.dungeon;
    // 차원문은 플레이어 옆의 넓은 빈자리에 (벽 너머가 아니게 시야도 확인), 없으면 발밑에
    let spot = { x: p.x, y: p.y };
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 4 + i / 8 * TAU;
      const q = { x: p.x + Math.cos(a) * 55, y: p.y + Math.sin(a) * 55 };
      if (!d.circleBlocked(q.x, q.y, 26) && d.clearPath(p.x, p.y, q.x, q.y, 12)) { spot = q; break; }
    }
    world.portal = { x: spot.x, y: spot.y, kind: 'portal', t: 0 };
    Game.dungeonWorld = world;
    SFX.play('teleporter');
    Game.goTown('portal');
  },
  // 차원문을 밟음
  usePortal(pt) {
    if (world.town) Game.returnToDungeon();
    else { Game.dungeonWorld = world; SFX.play('teleporter'); Game.goTown('portal'); }
  },
  interact(n) {
    const p = player;
    n.facing = angleTo(n.x, n.y, p.x, p.y);
    if (n.voice) SFX.voice(pick(n.voice));
    switch (n.role) {
      case 'talk':
        n.lineIdx = ((n.lineIdx == null ? -1 : n.lineIdx) + 1) % n.lines.length;
        n.say = { text: n.lines[n.lineIdx], t: 6 };
        break;
      case 'healer':
        if (p.life < p.stats.maxLife || p.poisonT > 0) {
          p.life = p.stats.maxLife; p.poisonT = 0; p.slowT = 0;
          fxSprite('heal', p.x, p.y, { follow: p, scale: 0.9 });
          SFX.play('potion');
          UI.message('마라가 상처를 치료해 주었습니다', '#ff9a9a');
        }
        Shop.open(n);
        break;
      default:
        Shop.open(n);
    }
  },
  // 웨이포인트로 갈 수 있는 층: 1층과 보스를 잡은 다음 층(6, 11, 16 …)
  waypointFloors() {
    const out = [1];
    const deep = player.deepest || 1;
    for (let f = 6; f <= deep; f += 5) out.push(f);
    return out;
  },
};

// ── 상점 · 보관함 · 웨이포인트 창 ──
const ENHANCE_RATE = [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
const GAMBLE_SLOTS = ['weapon', 'shield', 'helm', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'];
const GAMBLE_ICON = { weapon: 117, shield: 121, helm: 160, armor: 161, gloves: 154, boots: 164, belt: 208, ring: 207, amulet: 213 };

const Shop = {
  npc: null, tab: null, sel: null, target: null, stock: [], buyback: [], lastGamble: null,

  level() { return player ? player.level : 1; },
  buyPrice(it) { return Math.round(it.value * 4); },
  restockPrice() { return 40 + this.level() * 8; },
  gamblePrice(slot) { return Math.round((90 + this.level() * 28) * (slot === 'ring' || slot === 'amulet' ? 1.6 : slot === 'weapon' ? 1.2 : 1)); },
  canEnhance(it) { return !!it && (it.dmg || it.def !== undefined) && (it.plus || 0) < 10; },
  enhanceCost(it) { return Math.round((40 + it.ilvl * 12) * Math.pow((it.plus || 0) + 1, 1.5)); },
  rerollCost(it) { return Math.round(it.value * 2.5); },
  upgradeCost(it) { return Math.round(it.value * (it.rarity === 0 ? 5 : 6)); },

  // 마을에 들어올 때마다 대장장이 물건이 바뀜
  restock() {
    const L = this.level();
    this.stock = [];
    const forced = ['weapon', 'shield', 'armor'];
    for (let i = 0; i < 12; i++) {
      const slot = forced[i] || pickSlot();
      const x = Math.random();
      const r = x < 0.06 ? 2 : x < 0.38 ? 1 : 0;
      this.stock.push(generateItem(Math.max(1, L + randInt(-1, 2)), r, { slot }));
    }
  },
  addBuyback(it) {
    this.buyback.unshift(it);
    if (this.buyback.length > 8) this.buyback.pop();
  },

  open(npc) {
    this.npc = npc;
    this.sel = null;
    this.target = null;
    this.lastGamble = null;
    this.tab = { smith: 'buy', refiner: 'reroll' }[npc.role] || npc.role;
    if (npc.greet) UI.message(`${npc.name}: "${pick(npc.greet)}"`, '#e8d9a8');
    UI.openShop();
  },
  close() { this.npc = null; this.sel = null; this.target = null; },
  isOpen() { return !!this.npc && !UI.el['shop-panel'].hidden; },
  // 판매할 수 있는 상인 창이 열려 있는지
  canSell() { return this.isOpen() && ['smith', 'healer', 'gambler', 'refiner'].includes(this.npc.role); },

  pay(cost) {
    const p = player;
    if (p.gold < cost) { UI.message('골드가 부족합니다', '#ff7a6a'); SFX.play('nope'); return false; }
    p.gold -= cost;
    Game.dirty = true;
    return true;
  },
  freeSlot() {
    const i = player.inventory.indexOf(null);
    if (i < 0) { UI.message('가방이 가득 찼습니다', '#ff7a6a'); SFX.play('nope'); }
    return i;
  },

  // ── 행동 ──
  buy(list, idx, price) {
    const it = list[idx];
    if (!it) return;
    const slot = this.freeSlot();
    if (slot < 0 || !this.pay(price)) return;
    player.inventory[slot] = it;
    list.splice(idx, 1);
    this.sel = null;
    SFX.play('gold');
    SFX.equip(it);
    UI.message(`${itemName(it)} 구매`, RARITY[it.rarity].color);
  },
  restockPaid() {
    if (!this.pay(this.restockPrice())) return;
    this.restock();
    this.sel = null;
    SFX.play('chest');
    UI.message('브론이 새 물건을 꺼내 왔습니다', '#e8d9a8');
  },
  enhance() {
    const it = this.target;
    if (!this.canEnhance(it)) return;
    if (!this.pay(this.enhanceCost(it))) return;
    const rate = ENHANCE_RATE[it.plus || 0];
    const p = player;
    SFX.play('anvil');
    if (Math.random() < rate) {
      it.plus = (it.plus || 0) + 1;
      finalizeItem(it);
      recalcStats(p);
      SFX.play('levelup', 0.6);
      fxSparks(p.x, p.y, 40, 24, '#ffd27a', 160);
      UI.message(`강화 성공! ${itemName(it)}`, '#ffd36a');
    } else {
      SFX.play('nope');
      UI.message(`강화 실패… (+${it.plus || 0} 유지)`, '#ff9a6a');
    }
  },
  gamble(slot) {
    const free = this.freeSlot();
    if (free < 0 || !this.pay(this.gamblePrice(slot))) return;
    const x = Math.random();
    const r = x < 0.02 ? 3 : x < 0.04 ? 4 : x < 0.26 ? 2 : 1;
    const it = generateItem(this.level() + randInt(0, 4), r, { slot });
    player.inventory[free] = it;
    this.lastGamble = it;
    SFX.play('gold');
    if (it.rarity >= 2) { SFX.play('rare'); SFX.synth(it.rarity >= 3 ? 'unique' : 'rare'); }
    UI.message(`${RARITY[it.rarity].name}: ${itemName(it)}`, RARITY[it.rarity].color);
  },
  reroll() {
    const it = this.target;
    if (!it || (it.rarity !== 1 && it.rarity !== 2)) return;
    if (!this.pay(this.rerollCost(it))) return;
    rerollItem(it);
    recalcStats(player);
    SFX.play('freeze', 0.6);
    fxSparks(player.x, player.y, 40, 20, '#b0b8ff', 140);
    UI.message(`재련 완료: ${itemName(it)}`, RARITY[it.rarity].color);
  },
  upgrade() {
    const it = this.target;
    if (!it || it.rarity >= 2) return;
    if (!this.pay(this.upgradeCost(it))) return;
    upgradeRarity(it);
    recalcStats(player);
    SFX.play('rare');
    fxSparks(player.x, player.y, 40, 24, RARITY[it.rarity].color, 160);
    UI.message(`승급 완료: ${itemName(it)}`, RARITY[it.rarity].color);
  },
  buyPotions(n) { for (let i = 0; i < n; i++) { if (player.potions >= MAX_POTIONS) break; const g = player.gold; buyPotion(); if (player.gold === g) break; } },
  buyElixir(id) {
    const E = ELIXIRS[id];
    if (!this.pay(E.price(this.level()))) return;
    player.elixirs[id] = E.dur;
    recalcStats(player);
    SFX.play('potion');
    fxSprite('heal', player.x, player.y, { follow: player, scale: 0.8 });
    UI.message(`${E.name}을(를) 마셨습니다: ${E.desc}`, '#ffd36a');
  },
  stashPut(i) {
    const p = player, it = p.inventory[i];
    if (!it) return;
    const s = p.stash.indexOf(null);
    if (s < 0) { UI.message('보관함이 가득 찼습니다', '#ff7a6a'); SFX.play('nope'); return; }
    p.stash[s] = it; p.inventory[i] = null;
    SFX.equip(it);
    Game.dirty = true;
  },
  stashTake(i) {
    const p = player, it = p.stash[i];
    if (!it) return;
    const s = this.freeSlot();
    if (s < 0) return;
    p.inventory[s] = it; p.stash[i] = null;
    SFX.equip(it);
    Game.dirty = true;
  },

  // ── 창 그리기 ──
  render() {
    const panel = UI.el['shop-panel'];
    const n = this.npc;
    if (!n) return;
    const p = player;
    panel.querySelector('h2').textContent = n.name;
    const tabs = {
      smith: [['buy', '사기 · 팔기'], ['enhance', '강화']],
      refiner: [['reroll', '재련'], ['upgrade', '승급']],
    }[n.role] || [];
    panel.querySelector('.shop-tabs').innerHTML = tabs.map(([id, label]) => `<button data-tab="${id}" class="${this.tab === id ? 'on' : ''}">${label}</button>`).join('');
    panel.querySelector('.shop-tabs').hidden = !tabs.length;
    let body = '', foot = '';
    const gold = `<div class="inv-meta"><span>${n.role === 'stash' ? `보관함 ${p.stash.filter(Boolean).length} / ${p.stash.length}` : '가진 골드'}</span><span class="gold">${p.gold.toLocaleString()} 골드</span></div>`;
    const cell = (it, attrs, price, target) => {
      const mv = target && UI.moveFrom ? ' move-target' : '';
      if (!it) return `<div class="cell${mv}" ${attrs}></div>`;
      const sel = this.sel && this.sel.item === it ? ' selected' : '';
      return `<div class="cell r${it.rarity}${sel}${mv}${canEquip(it) ? '' : ' cant'}" ${attrs}>${itemIconHtml(it)}${price != null ? `<span class="price">${price >= 10000 ? Math.round(price / 1000) + 'k' : price}</span>` : ''}${it.plus ? `<span class="plus">+${it.plus}</span>` : ''}</div>`;
    };
    const detail = (it, price) => `<div class="detail"><div class="detail-tips"><div class="tt">${itemTooltipHtml(it, { price })}</div></div></div>`;
    const selFoot = (it, btns) => `<div class="foot-sel"><div class="foot-name" style="color:${RARITY[it.rarity].color}">${escapeHtml(itemName(it))}</div><div class="foot-btns">${btns}<button class="btn-x" data-act="deselect" aria-label="선택 해제">×</button></div></div>`;
    const hint = t => `<p class="shop-hint">${t}</p>`;

    if (n.role === 'smith' && this.tab === 'buy') {
      body = gold + hint('물건을 누르면 자세히 보고 살 수 있습니다. 소지품 창에서 가방의 물건을 <b>Shift + 클릭</b>하거나 이 창으로 끌어다 놓으면 바로 팝니다.')
        + `<div class="grid">${this.stock.map((it, i) => cell(it, `data-stock="${i}"`, this.buyPrice(it))).join('')}</div>`
        + `<div class="foot-btns"><button data-act="restock">물건 새로 들여오기 <small>${this.restockPrice()} 골드</small></button></div>`;
      if (this.buyback.length) body += `<h3>판 물건 되사기</h3><div class="grid">${this.buyback.map((it, i) => cell(it, `data-bb="${i}"`, it.value)).join('')}</div>`;
      if (this.sel) {
        const price = this.sel.list === 'bb' ? this.sel.item.value : this.buyPrice(this.sel.item);
        body += detail(this.sel.item, price);
        foot = selFoot(this.sel.item, `<button class="btn-main" data-act="buy">구매 <small>${price.toLocaleString()} 골드</small></button>`);
      }
    } else if (n.role === 'smith' && this.tab === 'enhance') {
      body = gold + hint('강화할 무기·방어구·방패를 소지품 창(착용 중인 장비 포함)에서 고르세요. 한 단계마다 기본 피해·방어력이 7% 오릅니다. +3부터는 실패할 수 있지만, 실패해도 장비는 그대로 남습니다.');
      const it = this.target;
      if (it) {
        if (this.canEnhance(it)) {
          const cost = this.enhanceCost(it), rate = Math.round(ENHANCE_RATE[it.plus || 0] * 100);
          body += `<div class="enh-box"><div class="enh-line">+${it.plus || 0} → <b>+${(it.plus || 0) + 1}</b></div><div class="enh-line">성공 확률 <b>${rate}%</b> · 비용 <b class="gold">${cost.toLocaleString()} 골드</b></div></div>`;
          foot = selFoot(it, `<button class="btn-main" data-act="enhance">강화하기 <small>${cost.toLocaleString()} 골드</small></button>`);
        } else body += hint(it.plus >= 10 ? '이미 최대(+10)로 강화된 장비입니다.' : '반지와 목걸이는 강화할 수 없습니다.');
        body += detail(it);
      }
    } else if (n.role === 'healer') {
      const pp = potionPrice();
      body = gold + `<ul class="shop-list">
        <li><span class="sl-icon">${iconHtml(ICON_POTION)}</span><div class="sl-main"><div class="sl-name">생명력 물약</div><div class="sl-desc">생명력의 45%를 회복합니다. 가진 수 ${p.potions} / ${MAX_POTIONS}</div></div>
          <div class="sl-btns"><button data-act="potion1">1개 <small>${pp}</small></button><button data-act="potion5">5개 <small>${pp * 5}</small></button></div></li>
        ${Object.entries(ELIXIRS).map(([id, E]) => {
          const left = p.elixirs[id] > 0 ? ` <em>남은 시간 ${Math.ceil(p.elixirs[id] / 60)}분</em>` : '';
          return `<li><span class="sl-icon">${iconHtml(E.ii)}</span><div class="sl-main"><div class="sl-name">${E.name}${left}</div><div class="sl-desc">${E.desc}</div></div>
            <div class="sl-btns"><button data-elixir="${id}">마시기 <small>${E.price(this.level())}</small></button></div></li>`;
        }).join('')}
      </ul>` + hint('소지품 창에서 가방의 물건을 <b>Shift + 클릭</b>하거나 이 창으로 끌어다 놓으면 바로 팝니다.');
    } else if (n.role === 'gambler') {
      body = gold + hint('어떤 물건이 나올지는 열어 봐야 압니다. 대부분 마법 아이템이지만, 레어·세트·유니크가 나오기도 합니다.')
        + `<div class="gamble-grid">${GAMBLE_SLOTS.map(sl => `<button data-gamble="${sl}"><span class="gb-icon">${iconHtml(GAMBLE_ICON[sl])}</span><span class="gb-name">${SLOT_NAMES[sl]}</span><small>${this.gamblePrice(sl).toLocaleString()} 골드</small></button>`).join('')}</div>`;
      if (this.lastGamble) body += `<h3>방금 산 물건</h3>` + detail(this.lastGamble);
    } else if (n.role === 'refiner') {
      body = gold + hint(this.tab === 'reroll'
        ? '마법·레어 아이템의 능력치를 같은 희귀도로 모두 다시 굴립니다. 소지품 창에서 고르세요.'
        : '일반 아이템은 마법으로, 마법 아이템은 레어로 바꿉니다. 능력치는 새로 붙습니다.');
      const it = this.target;
      if (it) {
        const ok = this.tab === 'reroll' ? (it.rarity === 1 || it.rarity === 2) : it.rarity < 2;
        if (ok) {
          const cost = this.tab === 'reroll' ? this.rerollCost(it) : this.upgradeCost(it);
          const label = this.tab === 'reroll' ? '재련하기' : `${RARITY[it.rarity + 1].name}(으)로 승급`;
          foot = selFoot(it, `<button class="btn-main" data-act="${this.tab}">${label} <small>${cost.toLocaleString()} 골드</small></button>`);
        } else body += hint(this.tab === 'reroll' ? '마법·레어 아이템만 재련할 수 있습니다.' : '일반·마법 아이템만 승급할 수 있습니다.');
        body += detail(it);
      }
    } else if (n.role === 'stash') {
      body = gold + hint('보관함에 넣은 물건은 죽어도, 다시 시작해도 남습니다. 가방과 보관함 사이로 끌어다 놓거나, 두 번 눌러 꺼낼 수 있습니다.')
        + `<div class="foot-btns"><button data-act="sortstash">보관함 정리</button></div>`
        + `<div class="grid">${p.stash.map((it, i) => cell(it, `data-stash="${i}"`, null, true)).join('')}</div>`;
      if (this.sel) {
        body += detail(this.sel.item);
        foot = selFoot(this.sel.item, '<button class="btn-main" data-act="take">가방으로 꺼내기</button><button data-act="stashmove">옮기기</button>');
      }
    } else if (n.role === 'gate') {
      const dw = Game.dungeonWorld;
      body = hint('웨이포인트는 1층과, 보스를 쓰러뜨린 다음 층(6, 11, 16층 …)에서 열립니다.')
        + `<ul class="shop-list">${dw && dw.portal ? `<li><div class="sl-main"><div class="sl-name">차원문으로 돌아가기</div><div class="sl-desc">${dw.floor}층 · ${dw.dungeon.theme.name}</div></div><div class="sl-btns"><button class="btn-main" data-act="back">돌아가기</button></div></li>` : ''}
          ${Town.waypointFloors().map(f => `<li><div class="sl-main"><div class="sl-name">${f}층 · ${themeForFloor(f).name}</div><div class="sl-desc">몬스터 레벨 ${monsterLevelForFloor(f)}</div></div><div class="sl-btns"><button data-floor="${f}">이동</button></div></li>`).join('')}</ul>`
        + hint(`가장 깊이 내려간 곳: ${player.deepest || 1}층`);
    }
    panel.querySelector('.panel-body').innerHTML = body;
    panel.querySelector('.panel-foot').innerHTML = foot;
  },

  onClick(e) {
    if (Drag.justDropped && performance.now() - Drag.justDropped < 350) return;
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab) { this.tab = tab.dataset.tab; this.sel = null; this.target = null; return this.refresh(); }
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'deselect') { this.sel = null; this.target = null; }
      else if (a === 'buy' && this.sel) { const list = this.sel.list === 'bb' ? this.buyback : this.stock; this.buy(list, list.indexOf(this.sel.item), this.sel.list === 'bb' ? this.sel.item.value : this.buyPrice(this.sel.item)); }
      else if (a === 'restock') this.restockPaid();
      else if (a === 'enhance') this.enhance();
      else if (a === 'reroll') this.reroll();
      else if (a === 'upgrade') this.upgrade();
      else if (a === 'potion1') this.buyPotions(1);
      else if (a === 'potion5') this.buyPotions(5);
      else if (a === 'take' && this.sel) { this.stashTake(player.stash.indexOf(this.sel.item)); this.sel = null; }
      else if (a === 'stashmove' && this.sel) { const i = player.stash.indexOf(this.sel.item); if (i >= 0) UI.moveFrom = { c: 'stash', i }; this.sel = null; }
      else if (a === 'sortstash') { sortItems(player.stash); this.sel = null; }
      else if (a === 'back') { UI.closePanels(); Game.returnToDungeon(); return; }
      return this.refresh();
    }
    const el = t.closest('[data-elixir]');
    if (el) { this.buyElixir(el.dataset.elixir); return this.refresh(); }
    const gb = t.closest('[data-gamble]');
    if (gb) { this.gamble(gb.dataset.gamble); return this.refresh(); }
    const fl = t.closest('[data-floor]');
    if (fl) { UI.closePanels(); Game.travel(+fl.dataset.floor); return; }
    const st = t.closest('[data-stock]'), bb = t.closest('[data-bb]'), sh = t.closest('[data-stash]');
    if (st) { const it = this.stock[+st.dataset.stock]; this.sel = it ? { item: it, list: 'stock' } : null; }
    else if (bb) { const it = this.buyback[+bb.dataset.bb]; this.sel = it ? { item: it, list: 'bb' } : null; }
    else if (sh) { if (e.shiftKey) UI.shiftClick({ c: 'stash', i: +sh.dataset.stash }); else UI.tapCell({ c: 'stash', i: +sh.dataset.stash }); return; }
    else return;
    this.refresh();
  },
  onHover(e) {
    if (!UI.finePointer) return;
    const st = e.target.closest('[data-stock],[data-bb],[data-stash]');
    if (!st) return;
    let it, price;
    if (st.dataset.stock != null) { it = this.stock[+st.dataset.stock]; price = it && this.buyPrice(it); }
    else if (st.dataset.bb != null) { it = this.buyback[+st.dataset.bb]; price = it && it.value; }
    else it = player.stash[+st.dataset.stash];
    if (!it) return;
    let html = `<div class="tt">${itemTooltipHtml(it, { price })}</div>`;
    const k = it.slot === 'ring' ? 'ring1' : it.slot;
    if (player.equipment[k]) html += `<div class="tt tt-compare">${itemTooltipHtml(player.equipment[k], { header: '착용 중', noValue: true })}</div>`;
    UI.showTooltip(html, e.clientX, e.clientY);
  },
  // 소지품에서 물건을 골랐을 때 (강화·재련 대상)
  pickTarget(item) {
    if (!this.isOpen()) return false;
    if ((this.npc.role === 'smith' && this.tab === 'enhance') || this.npc.role === 'refiner') {
      this.target = item;
      this.render();
      return true;
    }
    return false;
  },
  refresh() { UI.hideTooltip(); this.render(); UI.refreshPanels(); },
};

// 마을 사람: 가까이 오면 플레이어 쪽을 봄, 말풍선 시간
function updateTownNpcs(dt) {
  const p = player;
  for (const n of world.dungeon.npcs) {
    if (n.say) { n.say.t -= dt; if (n.say.t <= 0) n.say = null; }
    if (!n.sprite || n.role === 'gate') continue;
    if (dist(n.x, n.y, p.x, p.y) < 260) {
      const want = angleTo(n.x, n.y, p.x, p.y);
      n.facing += angleDiff(n.facing, want) * Math.min(1, dt * 4);
    }
  }
}
