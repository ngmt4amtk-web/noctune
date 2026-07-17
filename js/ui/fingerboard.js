// 指板コンポーネント（I-06）。SVGで第1ポジションの指板を描き、タップで回答する。
// theory.js の STRINGS / positionsForString に依存。スタイルはSVG内<style>で完結させる。
import { STRINGS, positionsForString } from '../theory.js?v=0718a1';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SEMI_COUNT = 8; // 開放(0)〜semi7

// 幾何（viewBox基準。width100%で320〜430pxに追従）
const W = 340, H = 560;
const PAD_X = 55, PAD_TOP = 64, PAD_BOTTOM = 48;
const MARKER_R = 17, HIT_R = 26;
const stepX = (W - PAD_X * 2) / (STRINGS.length - 1);
const stepY = (H - PAD_TOP - PAD_BOTTOM) / (SEMI_COUNT - 1);
const xFor = (si) => PAD_X + si * stepX;
const yFor = (semi) => PAD_TOP + semi * stepY;

// 指番号ごとの柔らかい色（0=開放,1,2,3,4）
const FINGER_FILL = ['#9bb8d3', '#f2b8a2', '#f6d68a', '#a7d8b0', '#c7b3e6'];

const STATE_CLASSES = ['anchor', 'correct', 'wrong', 'hint', 'tap'];

let uidSeq = 0;

export function createFingerboard({ container, onTap, noteStyle = 'doremi', interactive = true }) {
  const uid = 'fb' + ++uidSeq;
  let enabled = interactive;
  const cells = new Map(); // "si:semi" -> <g>

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', `fb ${uid}`);
  svg.setAttribute('role', 'group');
  svg.style.cssText = 'width:100%;height:auto;display:block;max-width:430px;margin:0 auto;touch-action:manipulation;user-select:none;';

  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = css(uid);
  svg.appendChild(style);

  // ナット（上端の太線）
  const nut = line(xFor(0) - 18, PAD_TOP, xFor(STRINGS.length - 1) + 18, PAD_TOP, 'nut');
  svg.appendChild(nut);

  // 弦（縦線・G線を最も太く）
  STRINGS.forEach((s, si) => {
    const strokeW = 3.4 - si * 0.5;
    const ln = line(xFor(si), PAD_TOP, xFor(si), H - PAD_BOTTOM, 'gut');
    ln.style.strokeWidth = strokeW.toFixed(2);
    svg.appendChild(ln);
    // 弦名ラベル（ナット上）
    svg.appendChild(text(xFor(si), PAD_TOP - 24, s.name.replace('線', ''), 'string-name'));
  });

  // マーカー生成
  STRINGS.forEach((s, si) => {
    const positions = positionsForString(si, noteStyle);
    positions.forEach((p) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', `cell finger-${p.finger}`);
      const cx = xFor(si), cy = yFor(p.semi);

      const marker = circle(cx, cy, MARKER_R, 'marker');
      marker.style.fill = FINGER_FILL[p.finger] || FINGER_FILL[0];
      g.appendChild(marker);
      g.appendChild(text(cx, cy, p.label, 'label'));

      // 見た目より大きいタップ領域（透明・40px相当以上）
      const hit = circle(cx, cy, HIT_R, 'hit');
      hit.dataset.si = String(si);
      hit.dataset.semi = String(p.semi);
      hit.dataset.midi = String(p.midi);
      g.appendChild(hit);

      cells.set(si + ':' + p.semi, g);
      svg.appendChild(g);
    });
  });

  function handleClick(e) {
    const hit = e.target.closest('.hit');
    if (!hit || !enabled) return;
    const si = +hit.dataset.si, semi = +hit.dataset.semi, midi = +hit.dataset.midi;
    flash({ stringIndex: si, semi }, 'tap');
    if (onTap) onTap({ stringIndex: si, semi, midi });
  }
  svg.addEventListener('click', handleClick);

  container.appendChild(svg);

  // ---- 公開API ----
  function cellOf(c) { return cells.get(c.stringIndex + ':' + c.semi); }

  function highlight(list, kind = 'hint') {
    // 同種の既存強調を消してから付け直す（予測しやすい挙動）
    cells.forEach((g) => g.classList.remove(kind));
    (list || []).forEach((c) => { const g = cellOf(c); if (g) g.classList.add(kind); });
  }

  function flash(cell, kind = 'tap') {
    const g = cellOf(cell);
    if (!g) return;
    g.classList.add(kind, 'flashing');
    setTimeout(() => g.classList.remove(kind, 'flashing'), 420);
  }

  function clear() {
    cells.forEach((g) => { STATE_CLASSES.forEach((k) => g.classList.remove(k)); g.classList.remove('flashing'); });
  }

  function setEnabled(v) {
    enabled = !!v;
    svg.classList.toggle('disabled', !enabled);
  }
  setEnabled(enabled);

  function destroy() {
    svg.removeEventListener('click', handleClick);
    svg.remove();
    cells.clear();
  }

  return { highlight, flash, clear, setEnabled, destroy };
}

// ---- SVGヘルパ ----
function line(x1, y1, x2, y2, cls) {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', x1); el.setAttribute('y1', y1);
  el.setAttribute('x2', x2); el.setAttribute('y2', y2);
  el.setAttribute('class', cls);
  return el;
}
function circle(cx, cy, r, cls) {
  const el = document.createElementNS(SVG_NS, 'circle');
  el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r);
  el.setAttribute('class', cls);
  return el;
}
function text(x, y, str, cls) {
  const el = document.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', x); el.setAttribute('y', y);
  el.setAttribute('class', cls);
  el.textContent = str;
  return el;
}

// コンポーネント内で完結するスタイル（style.cssに依存しない）
function css(uid) {
  return `
.${uid} .nut { stroke:#6b5a48; stroke-width:6; stroke-linecap:round; }
.${uid} .gut { stroke:#c9bda9; stroke-linecap:round; }
.${uid} .string-name { fill:#8a7a63; font:600 15px/1 ui-rounded,'Hiragino Maru Gothic ProN',system-ui,sans-serif; text-anchor:middle; }
.${uid} .marker { stroke:#ffffff; stroke-width:2; transform-box:fill-box; transform-origin:center; transition:fill .15s ease, transform .12s ease; }
.${uid} .label { fill:#4a3f31; font:600 12px/1 ui-rounded,'Hiragino Maru Gothic ProN',system-ui,sans-serif; text-anchor:middle; dominant-baseline:central; pointer-events:none; }
.${uid} .hit { fill:transparent; cursor:pointer; }
.${uid}.disabled .hit { cursor:default; pointer-events:none; }
.${uid} .cell.anchor .marker { fill:#4f9df7 !important; }
.${uid} .cell.anchor { animation:${uid}-pulse 1s ease-in-out infinite; transform-origin:center; transform-box:fill-box; }
.${uid} .cell.correct .marker { fill:#3fbf6f !important; }
.${uid} .cell.wrong .marker { fill:#e8615c !important; }
.${uid} .cell.hint .marker { fill:#f4dd7a !important; }
.${uid} .cell.tap .marker, .${uid} .cell.flashing .marker { fill:#4f9df7 !important; transform:scale(1.18); }
.${uid} .cell.anchor .label, .${uid} .cell.correct .label, .${uid} .cell.wrong .label { fill:#ffffff; }
@keyframes ${uid}-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
`;
}
