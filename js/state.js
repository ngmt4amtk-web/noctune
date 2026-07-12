// 進捗・ランク・ストリーク管理 v2（レベル/星制を廃止しベスト記録制へ。docs/V2.md）
// import は js/engine.js の xpToRank のみ。DOM禁止・localStorageのみ。

import { xpToRank } from './engine.js';

const STORAGE_KEY = 'noctune-v1'; // みみクエストと分離
const STATE_VERSION = 2;

const MODE_IDS = ['oto-ate', 'micro-ear', 'hamori'];

const BADGE_DEFS = [
  { id: 'hajime', name: 'はじめの一歩', icon: '👣' },
  { id: 'mainichi-no-mimi', name: '毎日の耳', icon: '📅' },
  { id: 'isshuukan-no-mimi', name: '一週間の耳', icon: '🔥' },
  { id: 'mittsu-no-tobira', name: '三つの扉', icon: '🚪' },
  { id: 'combo-no-tatsujin', name: 'コンボの達人', icon: '🎯' },
  { id: 'micro-no-mimi', name: 'ミクロの耳', icon: '🔬' },
  { id: 'cho-micro-no-mimi', name: '超ミクロの耳', icon: '🔭' },
  { id: 'kirei-no-mimi', name: 'きれいの耳', icon: '💎' },
];
const BADGE_IDS = BADGE_DEFS.map((b) => b.id);

function badgeDef(id) {
  return BADGE_DEFS.find((b) => b.id === id);
}

function defaultState() {
  return {
    version: STATE_VERSION,
    settings: {
      a4: 442,
      noteStyle: 'doremi',
      volume: 0.8,
      titleId: 'noctune',
      iconId: 'slash',
    },
    xp: 0,
    records: {},
    played: {},
    lastConfig: {},
    streak: { last: null, count: 0 },
    badges: [],
    tipCursor: 0,
    tipDate: null,
  };
}

// 壊れたJSON・旧バージョンからでも初期値で補って復帰する
export function loadState() {
  let raw = null;
  try {
    raw = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY));
  } catch {
    raw = null;
  }
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  const records = {};
  if (raw.records && typeof raw.records === 'object') {
    for (const id of MODE_IDS) {
      const r = raw.records[id];
      if (!r || typeof r !== 'object') continue;
      records[id] = {};
      for (const k in r) if (Number.isFinite(r[k])) records[id][k] = r[k];
    }
  }
  const played = {};
  if (raw.played && typeof raw.played === 'object') {
    for (const id of MODE_IDS) if (Number.isFinite(raw.played[id])) played[id] = raw.played[id];
  }
  return {
    version: STATE_VERSION,
    settings: { ...base.settings, ...(raw.settings || {}) },
    xp: Number.isFinite(raw.xp) ? raw.xp : 0,
    records,
    played,
    lastConfig: raw.lastConfig && typeof raw.lastConfig === 'object' ? { ...raw.lastConfig } : {},
    streak: {
      last: typeof raw.streak?.last === 'string' ? raw.streak.last : null,
      count: Number.isFinite(raw.streak?.count) ? raw.streak.count : 0,
    },
    // v1のバッジはv2に現存するIDだけ引き継ぐ（星・レベル系は自然消滅）
    badges: Array.isArray(raw.badges) ? raw.badges.filter((b) => BADGE_IDS.includes(b)) : [],
    tipCursor: Number.isFinite(raw.tipCursor) ? raw.tipCursor : 0,
    tipDate: typeof raw.tipDate === 'string' ? raw.tipDate : null,
  };
}

export function saveState(s) {
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// configの安定キー化（キー順に依存しない）
export function configKeyOf(config) {
  const c = config || {};
  return Object.keys(c).sort().map((k) => `${k}=${c[k]}`).join('&') || 'default';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayStr(today) {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// モードの全configにまたがるベスト（better='low'なら最小、'high'なら最大）
export function bestOf(state, modeId, better = 'low') {
  const r = state.records[modeId];
  if (!r) return null;
  const vals = Object.values(r);
  if (!vals.length) return null;
  return better === 'low' ? Math.min(...vals) : Math.max(...vals);
}

// 結果記録 v2。XP・ストリーク・ベスト記録・バッジをまとめて更新し差分を返す
// opts: { score, streakMax, record: {value, display}|null, better: 'high'|'low' }
export function recordResult(state, modeId, configKey, opts = {}) {
  const { score = 0, streakMax, record = null, better = 'low' } = opts;

  // プレイ回数
  state.played[modeId] = (state.played[modeId] || 0) + 1;

  // ベスト記録
  let recordOut = null;
  if (record && Number.isFinite(record.value)) {
    if (!state.records[modeId]) state.records[modeId] = {};
    const prev = state.records[modeId][configKey];
    const improved = prev === undefined || (better === 'low' ? record.value < prev : record.value > prev);
    if (improved) state.records[modeId][configKey] = record.value;
    recordOut = { ...record, improved, best: state.records[modeId][configKey] };
  }

  // XP・ランク
  const rankBefore = xpToRank(state.xp);
  state.xp += score;
  const rankAfter = xpToRank(state.xp);

  // ストリーク
  const today = todayStr();
  if (state.streak.last !== today) {
    state.streak.count = state.streak.last === yesterdayStr(today) ? state.streak.count + 1 : 1;
    state.streak.last = today;
  }
  const streak = state.streak.count;

  // バッジ
  const newBadges = [];
  const award = (id) => {
    if (!state.badges.includes(id)) {
      state.badges.push(id);
      newBadges.push(badgeDef(id));
    }
  };
  award('hajime');
  if (streak >= 3) award('mainichi-no-mimi');
  if (streak >= 7) award('isshuukan-no-mimi');
  if (MODE_IDS.every((id) => (state.played[id] || 0) > 0)) award('mittsu-no-tobira');
  if (Number.isFinite(streakMax) && streakMax >= 10) award('combo-no-tatsujin');
  const microBest = bestOf(state, 'micro-ear', 'low');
  if (microBest !== null && microBest <= 10) award('micro-no-mimi');
  if (microBest !== null && microBest <= 3) award('cho-micro-no-mimi');
  const hamoriBest = bestOf(state, 'hamori', 'low');
  if (hamoriBest !== null && hamoriBest <= 5) award('kirei-no-mimi');

  saveState(state);

  return { xpGained: score, rankBefore, rankAfter, streak, newBadges, record: recordOut };
}

// きょうの一言の巡回インデックス。日付が変わったら+1、同日内は同じ値を返す
export function tipIndexForToday(state) {
  const today = todayStr();
  if (state.tipDate !== today) {
    state.tipDate = today;
    state.tipCursor = (state.tipCursor || 0) + 1;
    saveState(state); // ラウンド未実施の日でもカーソル前進を永続化する
  }
  return state.tipCursor;
}
