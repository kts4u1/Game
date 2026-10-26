'use strict';
// ───────── 공통 유틸리티 ─────────

const TAU = Math.PI * 2;
const TILE = 64;      // 타일 한 칸의 월드 크기
const WALL_H = 62;    // 벽 높이(픽셀)

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(p) { return Math.random() < p; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInQuad(t) { return t * t; }

function weightedPick(list, wf) {
  let total = 0;
  for (const it of list) total += wf(it);
  let r = Math.random() * total;
  for (const it of list) {
    r -= wf(it);
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 아이소메트릭 변환: 월드(x,y) → 화면 평면
function isoX(x, y) { return x - y; }
function isoY(x, y) { return (x + y) * 0.5; }
function fromIso(ix, iy) { return { x: iy + ix / 2, y: iy - ix / 2 }; }

let _uid = 1;
function uid() { return _uid++; }

function pct(v) { return Math.round(v * 100) + '%'; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 저장소 접근은 막혀 있을 수 있으므로 항상 try/catch
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
};
