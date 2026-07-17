// 進捗管理 v3: ベスト記録のみ（連続記録UIなし）

const STORAGE_KEY = 'noctune-v1';
const STATE_VERSION = 4;

const MODE_IDS = ['oto-ate', 'chord-ate', 'micro-ear', 'hamori'];

function defaultState() {
  return {
    version: STATE_VERSION,
    settings: {
      a4: 442,
      noteStyle: 'doremi',
      volume: 0.8,
      questionCount: 5,
    },
    records: {},
    played: {},
    lastConfig: {},
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
  const settings = raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : {};
  // v4: 既定の問題数を10→5に変更。旧版が保存した旧既定値10だけ新既定に落とす（20など明示選択は保持）
  if ((Number(raw.version) || 0) < 4 && settings.questionCount === 10) delete settings.questionCount;
  return {
    version: STATE_VERSION,
    settings: { ...base.settings, ...settings },
    records,
    played,
    lastConfig: raw.lastConfig && typeof raw.lastConfig === 'object' ? { ...raw.lastConfig } : {},
  };
}

export function saveState(s) {
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function configKeyOf(config) {
  const c = config || {};
  return Object.keys(c).sort().map((k) => `${k}=${c[k]}`).join('&') || 'default';
}

export function bestOf(state, modeId, better = 'low') {
  const r = state.records[modeId];
  if (!r) return null;
  const vals = Object.values(r);
  if (!vals.length) return null;
  return better === 'low' ? Math.min(...vals) : Math.max(...vals);
}

export function recordResult(state, modeId, configKey, opts = {}) {
  const { record = null, better = 'low' } = opts;
  state.played[modeId] = (state.played[modeId] || 0) + 1;

  let recordOut = null;
  if (record && Number.isFinite(record.value)) {
    if (!state.records[modeId]) state.records[modeId] = {};
    const prev = state.records[modeId][configKey];
    const improved = prev === undefined || (better === 'low' ? record.value < prev : record.value > prev);
    if (improved) state.records[modeId][configKey] = record.value;
    recordOut = { ...record, improved, best: state.records[modeId][configKey] };
  }

  saveState(state);
  return { record: recordOut };
}
