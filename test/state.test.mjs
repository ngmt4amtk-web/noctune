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

test('初期状態 v3・records空', async () => {
  freshStorage();
  globalThis.localStorage.setItem('noctune-v1', '{{{broken');
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.version, 3);
  assert.deepEqual(s.records, {});
  assert.equal(s.settings.titleId, 'otomusubi');
  assert.equal(s.streak, undefined);
});

test('旧データのxp/streakは読み捨て、recordsは残す', async () => {
  freshStorage();
  globalThis.localStorage.setItem(
    'noctune-v1',
    JSON.stringify({
      version: 2,
      xp: 999,
      streak: { last: '2026-07-11', count: 4 },
      records: { 'oto-ate': { 'range=mid': 0.8 } },
      settings: { a4: 440 },
    })
  );
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.records['oto-ate']['range=mid'], 0.8);
  assert.equal(s.settings.a4, 440);
  assert.equal(s.xp, undefined);
  assert.equal(s.streak, undefined);
});

test('configKeyOf 安定', async () => {
  const { configKeyOf } = await mod();
  assert.equal(configKeyOf({ b: 2, a: 1 }), configKeyOf({ a: 1, b: 2 }));
});

test('recordResult better=high', async () => {
  freshStorage();
  const { loadState, recordResult } = await mod();
  const s = loadState();
  recordResult(s, 'chord-ate', 'size=2', { record: { value: 0.5, display: '50%' }, better: 'high' });
  const r = recordResult(s, 'chord-ate', 'size=2', { record: { value: 0.9, display: '90%' }, better: 'high' });
  assert.equal(r.record.improved, true);
  assert.equal(s.records['chord-ate']['size=2'], 0.9);
});
