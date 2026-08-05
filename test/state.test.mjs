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

test('初期状態 v6・records/進捗空・既定5問', async () => {
  freshStorage();
  globalThis.localStorage.setItem('noctune-v1', '{{{broken');
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.version, 6);
  assert.deepEqual(s.records, {});
  assert.deepEqual(s.progress, {});
  assert.equal(s.settings.a4, 442);
  assert.equal(s.settings.questionCount, 5);
  assert.equal(s.settings.titleId, undefined);
  assert.equal(s.streak, undefined);
});

test('v4移行: 旧既定の10問は5問へ、明示選択の20問は保持', async () => {
  freshStorage();
  globalThis.localStorage.setItem(
    'noctune-v1',
    JSON.stringify({ version: 3, settings: { a4: 440, questionCount: 10 } })
  );
  const { loadState } = await mod();
  let s = loadState();
  assert.equal(s.settings.questionCount, 5);
  assert.equal(s.settings.a4, 440);

  globalThis.localStorage.setItem(
    'noctune-v1',
    JSON.stringify({ version: 3, settings: { questionCount: 20 } })
  );
  s = loadState();
  assert.equal(s.settings.questionCount, 20);
});

test('v4以降で選び直した10問は保持', async () => {
  freshStorage();
  globalThis.localStorage.setItem(
    'noctune-v1',
    JSON.stringify({ version: 4, settings: { questionCount: 10 } })
  );
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.settings.questionCount, 10);
});

test('v5→v6: 音当て記録とおまかせ進捗だけ捨て、他は残す', async () => {
  freshStorage();
  globalThis.localStorage.setItem(
    'noctune-v1',
    JSON.stringify({
      version: 5,
      progress: { 'oto-ate': { autoLevel: 3 } },
      records: {
        'oto-ate': { 'stage=auto&accidental=none': 0.9 },
        'chord-ate': { 'gen=harmonic&size=3': 0.7 },
      },
      settings: { a4: 440, questionCount: 10 },
      lastConfig: {
        'oto-ate': { stage: 'auto', accidental: 'sharp' },
        'chord-ate': { gen: 'free', size: 2 },
      },
    })
  );
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.version, 6);
  assert.equal(s.records['oto-ate'], undefined);
  assert.equal(s.records['chord-ate']['gen=harmonic&size=3'], 0.7);
  assert.deepEqual(s.progress, {});
  assert.equal(s.settings.a4, 440);
  assert.equal(s.settings.questionCount, 10);
  assert.equal(s.lastConfig['oto-ate'], undefined);
  assert.deepEqual(s.lastConfig['chord-ate'], { gen: 'free', size: 2 });
});

test('v6の音当て記録は保持し、おまかせ進捗は読まない', async () => {
  freshStorage();
  globalThis.localStorage.setItem(
    'noctune-v1',
    JSON.stringify({
      version: 6,
      records: { 'oto-ate': { 'range=7': 0.8 } },
      progress: { 'oto-ate': { autoLevel: 2 } },
    })
  );
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.records['oto-ate']['range=7'], 0.8);
  assert.equal(s.progress['oto-ate'], undefined);
});

test('旧データのxp/streakと旧音当て記録は読み捨て、他モード記録は残す', async () => {
  freshStorage();
  globalThis.localStorage.setItem(
    'noctune-v1',
    JSON.stringify({
      version: 2,
      xp: 999,
      streak: { last: '2026-07-11', count: 4 },
      records: {
        'oto-ate': { 'range=mid': 0.8 },
        'chord-ate': { 'size=2': 0.7 },
      },
      settings: { a4: 440 },
    })
  );
  const { loadState } = await mod();
  const s = loadState();
  assert.equal(s.records['oto-ate'], undefined);
  assert.equal(s.records['chord-ate']['size=2'], 0.7);
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
