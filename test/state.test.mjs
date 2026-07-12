// state.js v2 のテスト（ベスト記録制・移行・ストリーク・バッジ）
import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage モック
function freshStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const mod = () => import('./../js/state.js');

test('初期状態: 壊れたJSONから復帰しv2構造を持つ', async () => {
  freshStorage();
  globalThis.localStorage.setItem('noctune-v1', '{{{broken');
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.version, 2);
  assert.deepEqual(s.records, {});
  assert.equal(s.settings.a4, 442);
});

test('壊れたデータからの復帰でもtitleId/iconIdの既定がある', async () => {
  freshStorage();
  globalThis.localStorage.setItem('noctune-v1', '{}');
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.settings.titleId, 'noctune');
  assert.equal(s.settings.iconId, 'slash');
});

test('v1からの移行: xp/streak/設定は引き継ぎ、星は破棄、旧バッジは現存IDのみ', async () => {
  freshStorage();
  globalThis.localStorage.setItem('noctune-v1', JSON.stringify({
    version: 1,
    settings: { a4: 440, noteStyle: 'abc', volume: 0.5 },
    xp: 1234,
    modes: { 'oto-ate': { unlockedLevel: 5, stars: { 1: 3 } } },
    streak: { last: '2026-07-11', count: 4 },
    badges: ['hajime', 'muttsu-no-tobira', 'combo-no-tatsujin'],
  }));
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.xp, 1234);
  assert.equal(s.settings.a4, 440);
  assert.equal(s.streak.count, 4);
  assert.deepEqual(s.badges.sort(), ['combo-no-tatsujin', 'hajime']);
  assert.equal(s.records['oto-ate'], undefined);
});

test('configKeyOf はキー順に依存しない安定キーを返す', async () => {
  const { configKeyOf } = await mod();
  assert.equal(configKeyOf({ b: 2, a: 1 }), configKeyOf({ a: 1, b: 2 }));
  assert.equal(configKeyOf(null), 'default');
});

test('recordResult: better=low で小さい値だけ更新', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  const r1 = recordResult(s, 'micro-ear', 'start=25', { score: 100, record: { value: 12, display: '12セント' }, better: 'low' });
  assert.equal(r1.record.improved, true);
  const r2 = recordResult(s, 'micro-ear', 'start=25', { score: 100, record: { value: 20, display: '20セント' }, better: 'low' });
  assert.equal(r2.record.improved, false);
  assert.equal(r2.record.best, 12);
  const r3 = recordResult(s, 'micro-ear', 'start=25', { score: 100, record: { value: 8, display: '8セント' }, better: 'low' });
  assert.equal(r3.record.improved, true);
  assert.equal(r3.record.best, 8);
});

test('recordResult: better=high（おとあての正答率）', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  recordResult(s, 'oto-ate', 'range=1oct', { score: 0, record: { value: 0.6, display: '60%' }, better: 'high' });
  const r = recordResult(s, 'oto-ate', 'range=1oct', { score: 0, record: { value: 0.9, display: '90%' }, better: 'high' });
  assert.equal(r.record.improved, true);
  assert.equal(r.record.best, 0.9);
});

test('バッジ: 三つの扉は3モード全プレイで、ミクロの耳はbest<=10で付与', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  recordResult(s, 'oto-ate', 'k', { score: 0, record: { value: 0.5, display: '' }, better: 'high' });
  recordResult(s, 'hamori', 'k', { score: 0, record: { value: 30, display: '' }, better: 'low' });
  const r = recordResult(s, 'micro-ear', 'k', { score: 0, record: { value: 9.5, display: '' }, better: 'low' });
  const ids = r.newBadges.map((b) => b && b.id);
  assert.ok(ids.includes('mittsu-no-tobira'));
  assert.ok(ids.includes('micro-no-mimi'));
});

test('ストリーク: 同日2回目は増えない', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  const a = recordResult(s, 'oto-ate', 'k', { score: 0 });
  const b = recordResult(s, 'oto-ate', 'k', { score: 0 });
  assert.equal(a.streak, 1);
  assert.equal(b.streak, 1);
});

test('recordがnull（ミクロ耳全問不正解等）でも落ちずXPは加算', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  const r = recordResult(s, 'micro-ear', 'k', { score: 50, record: null, better: 'low' });
  assert.equal(r.record, null);
  assert.equal(s.xp, 50);
});

test('永続化: recordResult後にloadStateで復元される', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  recordResult(s, 'hamori', 'interval=P5', { score: 10, record: { value: 6, display: '6セント' }, better: 'low' });
  const s2 = loadState();
  assert.equal(s2.records.hamori['interval=P5'], 6);
  assert.equal(s2.xp, 10);
});
