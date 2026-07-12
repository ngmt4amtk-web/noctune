// 進捗管理 v3: XP/ランク廃止。ベスト記録・ストリーク・バッジ。

const STORAGE_KEY = 'noctune-v1';
const STATE_VERSION = 3;

const MODE_IDS = ['oto-ate', 'chord-ate', 'micro-ear', 'hamori'];
// 「三つの扉」は元コア3モードのまま（和音当て追加で意味を崩さない）
const CORE_MODE_IDS = ['oto-ate', 'micro-ear', 'hamori'];

const BADGE_DEFS = [
  { id: 'hajime', name: 'はじめの一歩', icon: '👣' },
  { id: 'mainichi-no-mimi', name: '毎日の耳', icon: '📅' },
  { id: 'isshuukan-no-mimi', name: '一週間の耳', icon: '🔥' },
  { id: 'mittsu-no-tobira', name: '三つの扉', icon: '🚪' },
  { id: 'combo-no-tatsujin', name: 'コンボの達人', icon: '🎯' },
  { id: 'micro-no-mimi', name: 'ミクロの耳', icon: '🔬' },
  { id: 'cho-micro-no-mimi', name: '超ミクロの耳', icon: '🔭' },
  { id: 'kirei-no-mimi', name: 'きれいの耳', icon: '💎' },
  { id: 'chord-hajime', name: '和音のはじまり', icon: '♫' },
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
      titleId: 'otomusubi',
      iconId: 'warm',
    },
    records: {},
    played: {},
    lastConfig: {},
    streak: { last: null, count: 0 },
    badges: [],
    tipCursor: 0,
    tipDate: null,
  };
}

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
    records,
    played,
    lastConfig: raw.lastConfig && typeof raw.lastConfig === 'object' ? { ...raw.lastConfig } : {},
    streak: {
      last: typeof raw.streak?.last === 'string' ? raw.streak.last : null,
      count: Number.isFinite(raw.streak?.count) ? raw.streak.count : 0,
    },
    badges: Array.isArray(raw.badges) ? raw.badges.filter((b) => BADGE_IDS.includes(b)) : [],
    tipCursor: Number.isFinite(raw.tipCursor) ? raw.tipCursor : 0,
    tipDate: typeof raw.tipDate === 'string' ? raw.tipDate : null,
  };
}

export function saveState(s) {
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

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

export function bestOf(state, modeId, better = 'low') {
  const r = state.records[modeId];
  if (!r) return null;
  const vals = Object.values(r);
  if (!vals.length) return null;
  return better === 'low' ? Math.min(...vals) : Math.max(...vals);
}

// opts: { streakMax, record, better } ※scoreはラウンド表示用のみ・永続化しない
export function recordResult(state, modeId, configKey, opts = {}) {
  const { streakMax, record = null, better = 'low' } = opts;

  state.played[modeId] = (state.played[modeId] || 0) + 1;

  let recordOut = null;
  if (record && Number.isFinite(record.value)) {
    if (!state.records[modeId]) state.records[modeId] = {};
    const prev = state.records[modeId][configKey];
    const improved = prev === undefined || (better === 'low' ? record.value < prev : record.value > prev);
    if (improved) state.records[modeId][configKey] = record.value;
    recordOut = { ...record, improved, best: state.records[modeId][configKey] };
  }

  const today = todayStr();
  if (state.streak.last !== today) {
    state.streak.count = state.streak.last === yesterdayStr(today) ? state.streak.count + 1 : 1;
    state.streak.last = today;
  }
  const streak = state.streak.count;

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
  if (CORE_MODE_IDS.every((id) => (state.played[id] || 0) > 0)) award('mittsu-no-tobira');
  if (Number.isFinite(streakMax) && streakMax >= 10) award('combo-no-tatsujin');
  const microBest = bestOf(state, 'micro-ear', 'low');
  if (microBest !== null && microBest <= 10) award('micro-no-mimi');
  if (microBest !== null && microBest <= 3) award('cho-micro-no-mimi');
  const hamoriBest = bestOf(state, 'hamori', 'low');
  if (hamoriBest !== null && hamoriBest <= 5) award('kirei-no-mimi');
  if ((state.played['chord-ate'] || 0) > 0) award('chord-hajime');

  saveState(state);

  return { streak, newBadges, record: recordOut };
}

export function tipIndexForToday(state) {
  const today = todayStr();
  if (state.tipDate !== today) {
    state.tipDate = today;
    state.tipCursor = (state.tipCursor || 0) + 1;
    saveState(state);
  }
  return state.tipCursor;
}
