'use strict';
// ───────── 화면 UI: HUD, 소지품, 캐릭터, 레벨업 카드, 툴팁 ─────────

const $ = id => document.getElementById(id);

// Flare 아이콘이 있으면 CSS 스프라이트, 없으면 코드로 그린 아이콘
function skillIconHtml(id) {
  return HAS_FLARE ? iconHtml(SKILL_ICON[id] != null ? SKILL_ICON[id] : 0, 'skill') : `<img src="${skillIcon(id)}" alt="">`;
}
function itemIconHtml(item) {
  return HAS_FLARE ? iconHtml(itemIconIndex(item), 'item') : `<img src="${itemIcon(item)}" alt="">`;
}

const UI = {
  el: {}, last: {}, selected: null, mapT: 0, hoverSlot: null, cards: null,
  finePointer: window.matchMedia ? window.matchMedia('(pointer: fine)').matches : true,

  init() {
    const ids = ['orb-life', 'orb-fury', 'xp-fill', 'xp-text', 'lvl-text', 'potion-slot', 'minimap', 'floor-name', 'floor-sub',
      'gold-text', 'target', 'messages', 'banner', 'hurt', 'inv-panel', 'char-panel', 'shop-panel', 'levelup', 'title', 'death', 'menu', 'tooltip', 'slots'];
    for (const id of ids) this.el[id] = $(id);
    this.el.slotBtns = [...document.querySelectorAll('.slot[data-slot]')];

    // 스킬 슬롯: 누르고 있는 동안 '눌림' 상태 (소용돌이용)
    this.el.slotBtns.forEach((b, i) => {
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        SFX.init();
        // 터치 화면에서는 가장 가까운 적을 자동으로 조준
        if (e.pointerType !== 'mouse' && player && world) {
          const m = nearestMonsterNear(player.x, player.y, 480);
          if (m) { const sp = worldToScreen(m.x, m.y); Input.mx = sp.x; Input.my = sp.y; Input.world = { x: m.x, y: m.y }; }
        }
        Input.slotDown[i] = true;
        useSkill(i);
      });
      const up = () => { Input.slotDown[i] = false; };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', () => { up(); this.hideTooltip(); });
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') this.skillTooltip(i, b); });
    });
    this.el['potion-slot'].addEventListener('pointerdown', e => { e.preventDefault(); drinkPotion(); });
    if (HAS_FLARE) this.el['potion-slot'].querySelector('.ic').innerHTML = iconHtml(ICON_POTION);
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
      const w = b.dataset.open;
      if (w === 'menu') this.toggleMenu();
      else if (w === 'tp') Town.castPortal();
      else this.togglePanel(w);
    }));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.closePanels()));
    $('btn-new').addEventListener('click', () => { SFX.init(); Game.newGame(); });
    $('btn-continue').addEventListener('click', () => { SFX.init(); Game.continueGame(); });
    $('btn-respawn').addEventListener('click', () => { this.el.death.hidden = true; respawn(); });
    $('btn-resume').addEventListener('click', () => this.toggleMenu(false));
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-loot').addEventListener('click', () => Game.cycleLootFilter());
    $('btn-quit').addEventListener('click', () => { Game.save(); this.toggleMenu(false); Game.toTitle(); });

    // 소지품 이벤트 위임
    const inv = this.el['inv-panel'];
    inv.addEventListener('click', e => this.onInvClick(e));
    inv.addEventListener('dblclick', e => this.onInvDbl(e));
    inv.addEventListener('mouseover', e => this.onInvHover(e));
    inv.addEventListener('mouseout', e => { if (e.target.closest('[data-inv],[data-eq]')) this.hideTooltip(); });
    inv.addEventListener('contextmenu', e => { e.preventDefault(); this.onInvDbl(e); });
    document.addEventListener('pointermove', e => { if (!this.el.tooltip.hidden) this.placeTooltip(e.clientX, e.clientY); });
    const shop = this.el['shop-panel'];
    shop.addEventListener('click', e => Shop.onClick(e));
    shop.addEventListener('mouseover', e => Shop.onHover(e));
    shop.addEventListener('mouseout', e => { if (e.target.closest('[data-stock],[data-bb],[data-stash]')) this.hideTooltip(); });
    this.el.levelup.addEventListener('click', e => {
      const c = e.target.closest('.card');
      if (c) Game.chooseCard(c.dataset.id);
    });
  },

  // ── 매 프레임 HUD ──
  update(dt) {
    const p = player;
    if (!p) return;
    const s = p.stats;
    const set = (key, val, fn) => { if (this.last[key] !== val) { this.last[key] = val; fn(val); } };
    const lifeK = clamp(p.life / s.maxLife, 0, 1), furyK = clamp(p.fury / s.maxFury, 0, 1);
    set('life', Math.round(lifeK * 200), v => { this.el['orb-life'].querySelector('.orb-fill').style.height = v / 2 + '%'; });
    set('lifeT', `${Math.ceil(p.life)}/${s.maxLife}`, v => { this.el['orb-life'].querySelector('.orb-text').textContent = v; });
    set('fury', Math.round(furyK * 200), v => { this.el['orb-fury'].querySelector('.orb-fill').style.height = v / 2 + '%'; });
    set('furyT', `${Math.floor(p.fury)}/${s.maxFury}`, v => { this.el['orb-fury'].querySelector('.orb-text').textContent = v; });
    const need = xpToNext(p.level);
    set('xp', Math.round(p.xp / need * 400), v => { this.el['xp-fill'].style.width = v / 4 + '%'; });
    set('xpT', `${p.xp} / ${need}`, v => { this.el['xp-text'].textContent = `경험치 ${v}`; });
    set('lvl', p.level, v => { this.el['lvl-text'].textContent = `레벨 ${v}`; });
    set('gold', p.gold, v => { this.el['gold-text'].textContent = `${v.toLocaleString()} 골드`; });
    set('pot', p.potions, v => { this.el['potion-slot'].querySelector('.count').textContent = v; this.el['potion-slot'].classList.toggle('empty', v === 0); });
    set('lowlife', lifeK < 0.3, v => this.el['orb-life'].classList.toggle('low', v));
    set('shopopen', !this.el['shop-panel'].hidden && !this.el['inv-panel'].hidden, v => document.body.classList.toggle('shop-open', v));
    // 스킬 슬롯
    p.hotbar.forEach((id, i) => {
      const b = this.el.slotBtns[i];
      set('slot' + i, id + ':' + (id ? effLevel(p, id) : 0), () => {
        b.querySelector('.ic').innerHTML = id ? skillIconHtml(id) : '';
        b.querySelector('.lv').textContent = id ? effLevel(p, id) : '';
        b.classList.toggle('filled', !!id);
      });
      if (!id) return;
      const v = SKILLS[id].vals(effLevel(p, id));
      const cd = p.cds[id] || 0;
      set('cd' + i, Math.round(cd * 10), () => { b.querySelector('.cd').style.height = (v.cd ? cd / v.cd * 100 : 0) + '%'; });
      set('nf' + i, p.fury < v.cost, val => b.classList.toggle('nofury', val));
      set('act' + i, !!(p.whirl && p.whirl.slot === i), val => b.classList.toggle('active', val));
    });
    // 미니맵
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.15; this.drawMinimap(); }
    // 대상 정보
    const h = Input.hover;
    if (h && h.kind === 'monster' && !h.ref.dead) this.showTarget(h.ref);
    else if (!this.el.target.hidden) this.el.target.hidden = true;
  },

  drawMinimap() {
    const c = this.el.minimap;
    const css = c.clientWidth || 160;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(css * dpr)) { c.width = c.height = Math.round(css * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    ctx.fillStyle = 'rgba(8,6,6,.72)';
    ctx.fillRect(0, 0, css, css);
    if (world) drawAutomap(ctx, css / 2, css / 2, 2.6, 1, false);
  },

  showTarget(m) {
    const t = this.el.target;
    t.hidden = false;
    const key = m.id + ':' + Math.ceil(m.life);
    if (this.last.target === key) return;
    this.last.target = key;
    const col = m.tier === 1 ? '#8aa0ff' : m.tier >= 2 ? RARITY[3].color : '#e8e2d6';
    t.querySelector('.t-name').textContent = m.name;
    t.querySelector('.t-name').style.color = col;
    t.querySelector('.t-fill').style.width = (m.life / m.maxLife * 100) + '%';
    const tags = [`레벨 ${m.mlvl}`];
    if (m.tier === 1) tags.push('챔피언');
    if (m.tier === 2) tags.push('정예');
    if (m.tier === 3) tags.push('보스');
    if (m.undead) tags.push('언데드');
    for (const mod of m.mods) tags.push(ELITE_MODS[mod].name);
    t.querySelector('.t-tags').textContent = tags.join(' · ');
  },

  message(text, color = '#e8e2d6') {
    const box = this.el.messages;
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = text;
    d.style.color = color;
    box.appendChild(d);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 3200);
    setTimeout(() => d.remove(), 4200);
  },

  banner(title, sub) {
    this.lastBanner = [title, sub];
    const b = this.el.banner;
    b.querySelector('.b-title').textContent = title;
    b.querySelector('.b-sub').textContent = sub;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.hidden = true; }, 3600);
  },

  hurt() {
    const h = this.el.hurt;
    h.classList.remove('on');
    void h.offsetWidth;
    h.classList.add('on');
  },

  setFloor() {
    if (world.town) {
      this.el['floor-name'].textContent = world.dungeon.theme.name;
      this.el['floor-sub'].textContent = `마을 · 가장 깊이 내려간 곳 ${player.deepest || 1}층`;
    } else {
      this.el['floor-name'].textContent = `${world.floor}층 · ${world.dungeon.theme.name}`;
      this.el['floor-sub'].textContent = `몬스터 레벨 ${world.mlvl}${isBossFloor(world.floor) ? ' · 보스 층' : ''}`;
    }
    $('btn-tp').hidden = !!world.town;
  },

  // ── 패널 ──
  anyPanel() { return !this.el['inv-panel'].hidden || !this.el['char-panel'].hidden || !this.el['shop-panel'].hidden; },
  togglePanel(name) {
    const el = this.el[name + '-panel'];
    const open = el.hidden;
    el.hidden = !open;
    // 왼쪽 칸은 하나만: 캐릭터 창을 열면 상점 창은 닫음
    if (open && name === 'char' && !this.el['shop-panel'].hidden) { this.el['shop-panel'].hidden = true; Shop.close(); }
    if (open) { if (name === 'inv') this.renderInventory(); else this.renderCharacter(); }
    if (name === 'inv' && !open) { this.selected = null; this.hideTooltip(); }
  },
  openShop() {
    this.el['char-panel'].hidden = true;
    this.el['shop-panel'].hidden = false;
    this.selected = null;
    Shop.render();
    // 웨이포인트 창 말고는 소지품도 함께 엶
    if (Shop.npc.role !== 'gate') { this.el['inv-panel'].hidden = false; this.renderInventory(); }
  },
  closePanels() {
    this.el['inv-panel'].hidden = true;
    this.el['char-panel'].hidden = true;
    this.el['shop-panel'].hidden = true;
    Shop.close();
    this.selected = null;
    this.hideTooltip();
  },
  refreshPanels() {
    if (!this.el['inv-panel'].hidden) this.renderInventory();
    if (!this.el['char-panel'].hidden) this.renderCharacter();
    if (!this.el['shop-panel'].hidden) Shop.render();
  },
  syncMenu() {
    $('btn-sound').textContent = SFX.muted ? '소리 켜기 (M)' : '소리 끄기 (M)';
    $('btn-loot').textContent = `바닥 아이템: ${LOOT_FILTER_NAMES[Game.settings.lootFilter || 0]} (L)`;
  },

  cellHtml(item, attrs, label) {
    if (!item) return `<div class="cell" ${attrs}>${label ? `<span class="cell-label">${label}</span>` : ''}</div>`;
    const sel = (this.selected && this.selected.item === item) || (Shop.target === item && Shop.isOpen()) ? ' selected' : '';
    const bad = !canEquip(item) ? ' cant' : '';
    return `<div class="cell r${item.rarity}${sel}${bad}" ${attrs}>${itemIconHtml(item)}${item.plus ? `<span class="plus">+${item.plus}</span>` : ''}</div>`;
  },

  renderInventory() {
    const p = player;
    const eqLabels = { weapon: '무기', shield: '방패', helm: '투구', amulet: '목걸이', armor: '갑옷', ring1: '반지', ring2: '반지', gloves: '장갑', belt: '허리띠', boots: '장화' };
    const doll = EQUIP_KEYS.map(k => this.cellHtml(p.equipment[k], `data-eq="${k}" style="grid-area:${k}"`, eqLabels[k])).join('');
    const grid = p.inventory.map((it, i) => this.cellHtml(it, `data-inv="${i}"`)).join('');
    const sellOk = Shop.canSell(), stashOk = Shop.isOpen() && Shop.npc.role === 'stash';
    let detail = `<p class="detail-empty">아이템을 누르면 자세한 정보가 여기 나오고, 아래에 버튼이 생깁니다. 두 번 누르면 바로 착용합니다.${sellOk || stashOk ? '' : ' 물건은 마을 상인에게 팔 수 있습니다.'}</p>`;
    let selRow = '';
    const sel = this.selected;
    if (sel && sel.item) {
      const it = sel.item;
      let btns;
      if (sel.kind === 'inv') {
        const can = canEquip(it);
        btns = `<button class="btn-main" data-act="equip" ${can ? '' : 'disabled'}>${can ? '착용' : `레벨 ${it.req} 필요`}</button>`
          + (sellOk ? `<button data-act="sell">판매 <small>+${it.value}</small></button>`
            : stashOk ? '<button data-act="stash">보관함에 넣기</button>'
            : '<button data-act="drop">버리기</button>');
        const cmpKey = it.slot === 'ring' ? (p.equipment.ring1 ? 'ring1' : null) : it.slot;
        const cur = cmpKey ? p.equipment[cmpKey] : null;
        detail = `<div class="tt">${itemTooltipHtml(it)}</div>`;
        if (cur) detail += `<div class="tt tt-compare">${itemTooltipHtml(cur, { header: '착용 중', noValue: true })}</div>`;
      } else {
        btns = '<button class="btn-main" data-act="unequip">해제해서 가방에 넣기</button>';
        detail = `<div class="tt">${itemTooltipHtml(it, { noValue: true })}</div>`;
      }
      detail = `<div class="detail-tips">${detail}</div>`;
      selRow = `<div class="foot-sel">
          <div class="foot-name" style="color:${RARITY[it.rarity].color}">${escapeHtml(it.name)}</div>
          <div class="foot-btns">${btns}<button class="btn-x" data-act="deselect" aria-label="선택 해제">×</button></div>
        </div>`;
    }
    const used = p.inventory.filter(Boolean).length;
    this.el['inv-panel'].querySelector('.panel-body').innerHTML = `
      <div class="doll">${doll}</div>
      <div class="inv-meta"><span>가방 ${used} / ${p.inventory.length}</span><span class="gold">${p.gold.toLocaleString()} 골드</span></div>
      <div class="grid">${grid}</div>
      <div class="detail">${detail}</div>`;
    const general = sellOk ? '<div class="foot-btns"><button data-act="sellnormal">일반 아이템 모두 판매</button></div>' : '';
    this.el['inv-panel'].querySelector('.panel-foot').innerHTML = `${selRow}${general}`;
  },

  onInvClick(e) {
    const p = player;
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act, sel = this.selected;
      if (a === 'equip' && sel) { const i = p.inventory.indexOf(sel.item); if (i >= 0) equipFromInventory(i); this.selected = null; }
      else if (a === 'sell' && sel && Shop.canSell()) { const i = p.inventory.indexOf(sel.item); if (i >= 0) sellInventory(i); this.selected = null; }
      else if (a === 'stash' && sel) { const i = p.inventory.indexOf(sel.item); if (i >= 0) Shop.stashPut(i); this.selected = null; }
      else if (a === 'drop' && sel) { const i = p.inventory.indexOf(sel.item); if (i >= 0) dropInventory(i); this.selected = null; }
      else if (a === 'unequip' && sel) { if (unequip(sel.key)) this.selected = null; }
      else if (a === 'deselect') this.selected = null;
      else if (a === 'sellnormal' && Shop.canSell()) sellAllNormal();
      this.hideTooltip();
      this.refreshPanels();
      return;
    }
    const inv = e.target.closest('[data-inv]');
    const eq = e.target.closest('[data-eq]');
    if (inv) {
      const it = p.inventory[+inv.dataset.inv];
      this.selected = it ? { kind: 'inv', item: it } : null;
    } else if (eq) {
      const it = p.equipment[eq.dataset.eq];
      this.selected = it ? { kind: 'eq', item: it, key: eq.dataset.eq } : null;
    } else return;
    if (this.selected) Shop.pickTarget(this.selected.item);
    this.renderInventory();
    // 터치 화면에서는 툴팁 대신 아래 상세 칸을 보여줌
    if (this.selected && !this.finePointer) this.el['inv-panel'].querySelector('.detail').scrollIntoView({ block: 'nearest' });
  },

  onInvDbl(e) {
    const p = player;
    const inv = e.target.closest('[data-inv]');
    const eq = e.target.closest('[data-eq]');
    if (inv && p.inventory[+inv.dataset.inv]) { equipFromInventory(+inv.dataset.inv); this.selected = null; }
    else if (eq && p.equipment[eq.dataset.eq]) { unequip(eq.dataset.eq); this.selected = null; }
    else return;
    this.hideTooltip();
    this.refreshPanels();
  },

  onInvHover(e) {
    if (!this.finePointer) return;
    const p = player;
    const inv = e.target.closest('[data-inv]');
    const eq = e.target.closest('[data-eq]');
    let html = null;
    if (inv) {
      const it = p.inventory[+inv.dataset.inv];
      if (it) {
        html = `<div class="tt">${itemTooltipHtml(it)}</div>`;
        const k = it.slot === 'ring' ? 'ring1' : it.slot;
        if (p.equipment[k]) html += `<div class="tt tt-compare">${itemTooltipHtml(p.equipment[k], { header: '착용 중', noValue: true })}</div>`;
      }
    } else if (eq) {
      const it = p.equipment[eq.dataset.eq];
      if (it) html = `<div class="tt">${itemTooltipHtml(it, { noValue: true })}</div>`;
    }
    if (html) this.showTooltip(html, e.clientX, e.clientY);
  },

  renderCharacter() {
    const p = player, s = p.stats;
    const red = Math.round(damageReduction(p, world.mlvl) * 100);
    const avg = Math.round((s.minDmg + s.maxDmg) / 2 * (1 + s.dmgPct / 100));
    const rows = [
      ['레벨', p.level], ['경험치', `${p.xp} / ${xpToNext(p.level)}`],
      ['생명력', `${Math.ceil(p.life)} / ${s.maxLife}`], ['분노', `${Math.floor(p.fury)} / ${s.maxFury}`],
      ['무기 피해', `${s.minDmg} - ${s.maxDmg}`], ['평균 타격 피해', avg],
      ['초당 공격', s.apsTotal.toFixed(2)], ['치명타', `확률 ${s.crit}% · 피해 ${100 + s.critDmg}%`],
      ['방어력', `${s.armorTotal} (피해 ${red}% 감소)`], ['생명력 흡수', `${s.lifeSteal.toFixed(1)}%`],
      ['초당 회복', s.lifeRegenTotal.toFixed(1)], ['이동 속도', `+${s.moveSpeed}%`],
      ['가시 피해', s.thorns], ['마법 아이템 발견', `+${s.mf}%`], ['골드 획득', `+${s.gf}%`],
      ['모든 스킬', s.allSkills ? `+${s.allSkills}` : '-'],
    ];
    const opt = [
      ['막기 확률', s.block, `${s.block}%`], ['원소 저항', s.res, `${s.res}%`], ['받는 피해 감소', s.dmgReduce, `-${s.dmgReduce}`],
      ['화염 피해', s.fireDmg, `+${s.fireDmg}`], ['냉기 피해', s.coldDmg, `+${s.coldDmg}`], ['번개 피해', s.lightDmg, `1-${s.lightDmg}`],
      ['언데드 추가 피해', s.dmgUndead, `+${s.dmgUndead}%`], ['처치 시 생명력', s.killLife, `+${s.killLife}`], ['처치 시 분노', s.killFury, `+${s.killFury}`],
      ['재사용 대기시간', s.cdr, `-${s.cdr}%`], ['분노 소모', s.furyCost, `-${s.furyCost}%`], ['물약 회복량', s.potionBoost, `+${s.potionBoost}%`],
    ];
    for (const [k, v, txt] of opt) if (v) rows.push([k, txt]);
    for (const id in ELIXIRS) if (p.elixirs[id] > 0) rows.push([ELIXIRS[id].name, `${Math.ceil(p.elixirs[id] / 60)}분 남음`]);
    const sc = setCounts(p.equipment);
    for (const id in sc) if (SETS[id]) rows.push([SETS[id].name, `${sc[id]}세트`]);
    rows.push(['가장 깊은 층', `${p.deepest || 1}층`], ['처치 수', p.kills]);
    const ids = Object.keys(p.skills);
    const skills = ids.length ? ids.map(id => {
      const L = effLevel(p, id), base = p.skills[id];
      const sk = SKILLS[id];
      return `<li><span class="sk-icon">${skillIconHtml(id)}</span><div><div class="sk-name">${sk.name} <span class="sk-lv">Lv ${L}${L > base ? ` <em>(+${L - base})</em>` : ''}</span></div><p>${sk.desc(sk.vals(L))}</p></div></li>`;
    }).join('') : '<li class="detail-empty">아직 배운 스킬이 없습니다.</li>';
    this.el['char-panel'].querySelector('.panel-body').innerHTML = `
      <dl class="stats">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</dl>
      <h3>스킬</h3>
      <ul class="skill-list">${skills}</ul>`;
  },

  skillTooltip(i, b) {
    const id = player && player.hotbar[i];
    if (!id) return;
    const sk = SKILLS[id], L = effLevel(player, id);
    const r = b.getBoundingClientRect();
    this.showTooltip(`<div class="tt"><div class="tt-name" style="color:#f4d6a8">${sk.name}</div><div class="tt-type">레벨 ${L} · ${i + 1}번 키${i === 0 ? ' / 오른쪽 클릭' : ''}</div><div class="tt-desc">${sk.desc(sk.vals(L))}</div></div>`, r.left + r.width / 2, r.top - 8, true);
  },

  showTooltip(html, x, y, above) {
    const t = this.el.tooltip;
    t.innerHTML = html;
    t.hidden = false;
    this.tipAbove = !!above;
    this.placeTooltip(x, y);
  },
  placeTooltip(x, y) {
    const t = this.el.tooltip;
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = this.tipAbove ? x - w / 2 : x + 18;
    let top = this.tipAbove ? y - h : y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 18;
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    t.style.left = Math.max(8, left) + 'px';
    t.style.top = Math.max(8, top) + 'px';
  },
  hideTooltip() { this.el.tooltip.hidden = true; },

  // ── 레벨업 카드 ──
  showLevelUp(cards, first) {
    const p = player;
    const lu = this.el.levelup;
    this.cards = cards;
    lu.querySelector('.lu-eyebrow').textContent = first ? '모험의 시작' : `레벨 ${p.level - Game.pendingLevels + 1} 달성`;
    lu.querySelector('.lu-title').textContent = first ? '첫 번째 기술을 고르세요' : '기술 하나를 고르세요';
    lu.querySelector('.lu-cards').innerHTML = cards.map((id, i) => {
      if (id.startsWith('_')) {
        const b = BONUS_CARDS.find(x => x.id === id);
        return `<button class="card bonus" data-id="${id}"><span class="card-n">${i + 1}</span><div class="card-type">보너스</div><span class="card-icon">${skillIconHtml(id)}</span><div class="card-name">${b.name}</div><div class="card-key">${b.key}</div><p class="card-desc">${b.desc}</p></button>`;
      }
      const sk = SKILLS[id];
      const lv = p.skills[id] || 0;
      const bonus = lv ? effLevel(p, id) - lv : 0;
      const nv = sk.vals(lv + 1 + bonus);
      const type = sk.type === 'active' ? '액티브' : '패시브';
      const tag = lv ? `Lv ${lv} → ${lv + 1}` : '새 기술';
      const key = lv ? `${sk.key(sk.vals(lv + bonus))} → ${sk.key(nv)}` : sk.key(nv);
      return `<button class="card ${sk.type}${lv ? '' : ' new'}" data-id="${id}"><span class="card-n">${i + 1}</span><div class="card-type">${type} · ${tag}</div><span class="card-icon">${skillIconHtml(id)}</span><div class="card-name">${sk.name}</div><div class="card-key">${key}</div><p class="card-desc">${sk.desc(nv)}</p></button>`;
    }).join('');
    lu.hidden = false;
  },
  hideLevelUp() { this.el.levelup.hidden = true; this.cards = null; },

  toggleMenu(force) {
    const m = this.el.menu;
    const open = force === undefined ? m.hidden : force;
    m.hidden = !open;
    this.syncMenu();
  },
  toggleSound() {
    const muted = SFX.toggleMute();
    $('btn-sound').textContent = muted ? '소리 켜기 (M)' : '소리 끄기 (M)';
    this.message(muted ? '소리 꺼짐' : '소리 켜짐', '#c9c1b3');
  },

  showTitle(hasSave, info) {
    this.el.title.hidden = false;
    $('btn-continue').hidden = !hasSave;
    if (hasSave) $('btn-continue').querySelector('small').textContent = info;
    document.body.classList.add('at-title');
  },
  hideTitle() { this.el.title.hidden = true; document.body.classList.remove('at-title'); },
};
