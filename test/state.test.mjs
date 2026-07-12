import test from 'node:test';
import assert from 'node:assert/strict';

function freshStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const mod = () => import(`./../js/state.js?t=${Date.now()}-${Math.random()}`);

test('初期状態: 壊れたJSONから復帰しv3・XPなし', async () => {
  freshStorage();
  globalThis.localStorage.setItem('noctune-v1', '{{{broken');
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.version, 3);
  assert.deepEqual(s.records, {});
  assert.equal(s.settings.a4, 442);
  assert.equal(s.xp, undefined);
  assert.equal(s.settings.titleId, 'otomusubi');
});

test('v2からの移行: records/streakは引き継ぎ、xpは読み捨て', async () => {
  freshStorage();
  globalThis.localStorage.setItem('noctune-v1', JSON.stringify({
    version: 2,
    settings: { a4: 440, noteStyle: 'abc', volume: 0.5 },
    xp: 9999,
    records: { 'oto-ate': { 'range=mid': 0.8 } },
    streak: { last: '2026-07-11', count: 4 },
    badges: ['hajime', 'muttsu-no-tobira', 'combo-no-tatsujin'],
  }));
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.version, 3);
  assert.equal(s.xp, undefined);
  assert.equal(s.settings.a4, 440);
  assert.equal(s.streak.count, 4);
  assert.equal(s.records['oto-ate']['range=mid'], 0.8);
  assert.deepEqual(s.badges.sort(), ['combo-no-tatsujin', 'hajime']);
});

test('configKeyOf はキー順に依存しない', async () => {
  const { configKeyOf } = await mod();
  assert.equal(configKeyOf({ b: 2, a: 1 }), configKeyOf({ a: 1, b: 2 }));
  assert.equal(configKeyOf(null), 'default');
});

test('recordResult: better=low で小さい値だけ更新', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  const r1 = recordResult(s, 'micro-ear', 'start=25', { record: { value: 12, display: '12セント' }, better: 'low' });
  assert.equal(r1.record.improved, true);
  const r2 = recordResult(s, 'micro-ear', 'start=25', { record: { value: 20, display: '20セント' }, better: 'low' });
  assert.equal(r2.record.improved, false);
  assert.equal(r2.record.best, 12);
});

test('recordResult: better=high（正答率）', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  recordResult(s, 'oto-ate', 'range=mid', { record: { value: 0.6, display: '60%' }, better: 'high' });
  const r = recordResult(s, 'oto-ate', 'range=mid', { record: { value: 0.9, display: '90%' }, better: 'high' });
  assert.equal(r.record.improved, true);
  assert.equal(r.record.best, 0.9);
});

test('バッジ: 三つの扉はコア3モード、和音バッジはchord-ate', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  recordResult(s, 'oto-ate', 'k', { record: { value: 0.5, display: '' }, better: 'high' });
  recordResult(s, 'hamori', 'k', { record: { value: 30, display: '' }, better: 'low' });
  const r = recordResult(s, 'micro-ear', 'k', { record: { value: 9.5, display: '' }, better: 'low' });
  const ids = r.newBadges.map((b) => b && b.id);
  assert.ok(ids.includes('mittsu-no-tobira'));
  assert.ok(ids.includes('micro-no-mimi'));
  const r2 = recordResult(s, 'chord-ate', 'size=2', { record: { value: 0.7, display: '70%' }, better: 'high' });
  assert.ok(r2.newBadges.map((b) => b.id).includes('chord-hajime'));
});

test('ストリーク: 同日2回目は増えない', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  const a = recordResult(s, 'oto-ate', 'k', {});
  const b = recordResult(s, 'oto-ate', 'k', {});
  assert.equal(a.streak, 1);
  assert.equal(b.streak, 1);
});

test('永続化: chord-ate記録が復元される', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  recordResult(s, 'chord-ate', 'size=3', { record: { value: 0.8, display: '80%' }, better: 'high' });
  const s2 = loadState();
  assert.equal(s2.records['chord-ate']['size=3'], 0.8);
});
