// ゲームコア（純粋モジュール）。DOM・Web Audio・localStorage禁止。

// mulberry32。seedから決定的な () => [0,1)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates。元配列は破壊せずシャッフル済みコピーを返す
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 直前と同じ要素を避けて選ぶ。要素が1種のみなら諦めてそれを返す
export function pickDifferent(arr, prev, rng) {
  if (arr.length === 0) return undefined;
  if (arr.length === 1) return arr[0];
  let pick;
  // 全要素がprevと同値でも無限ループしないよう試行回数に上限
  for (let tries = 0; tries < 20; tries++) {
    pick = arr[Math.floor(rng() * arr.length)];
    if (pick !== prev) return pick;
  }
  return pick;
}

// 適応ステアケース。正解で難化(down)・不正解で易化(up)、[min,max]にclamp
export class Staircase {
  constructor({ start = 50, min = 2, max = 60, down = 0.7, up = 1.5 } = {}) {
    this._min = min;
    this._max = max;
    this._down = down;
    this._up = up;
    this._current = clamp(start, min, max);
    this._best = null; // 正解できた中での最小セント差
    this._reversals = 0;
    this._lastDir = 0; // -1=難化, +1=易化
  }
  get current() {
    return this._current;
  }
  report(correct) {
    if (correct) {
      // この難度で聴き分けられた → best候補
      this._best = this._best === null ? this._current : Math.min(this._best, this._current);
    }
    const dir = correct ? -1 : 1;
    if (this._lastDir !== 0 && dir !== this._lastDir) this._reversals++;
    this._lastDir = dir;
    const factor = correct ? this._down : this._up;
    this._current = clamp(this._current * factor, this._min, this._max);
  }
  get best() {
    return this._best;
  }
  get reversals() {
    return this._reversals;
  }
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

// 正答率→★数
export function stars(accuracy) {
  if (accuracy >= 0.95) return 3;
  if (accuracy >= 0.8) return 2;
  if (accuracy >= 0.6) return 1;
  return 0;
}

// スコア。正解=基礎点×コンボ係数、不正解=0。コンボは10で頭打ち
export function scoreFor({ correct, streakNow = 0, level = 1 }) {
  if (!correct) return 0;
  const base = 100 * (1 + 0.1 * (level - 1));
  const combo = 1 + Math.min(streakNow, 10) * 0.1;
  return Math.round(base * combo);
}

// ランク8段階（大人向けコピー）
const RANKS = [
  { name: 'SIGNAL 0', icon: '◦', at: 0 },
  { name: 'WARM-UP', icon: '⌁', at: 300 },
  { name: 'LOCK-IN', icon: '◎', at: 1000 },
  { name: 'FINE CUT', icon: '△', at: 2500 },
  { name: 'CLEAN LINE', icon: '◇', at: 5000 },
  { name: 'EDGE EAR', icon: '▣', at: 9000 },
  { name: 'MASTER CUT', icon: '◆', at: 15000 },
  { name: 'ABSOLUTE', icon: '◈', at: 25000 },
];

export function xpToRank(xp) {
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) {
    if (xp >= RANKS[k].at) i = k;
  }
  const r = RANKS[i];
  const next = RANKS[i + 1];
  return {
    name: r.name,
    icon: r.icon,
    level: i + 1,
    prevAt: r.at,
    nextAt: next ? next.at : null,
  };
}
