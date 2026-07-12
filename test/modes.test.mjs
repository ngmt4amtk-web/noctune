import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../js/modes/registry.js';
import chordAte from '../js/modes/chord-ate.js';
import { makeRng } from '../js/engine.js';

test('registry順: 音当て→和音当て→音程比較→ハモリ判定', () => {
  assert.deepEqual(MODES.map((m) => m.title), ['音当て', '和音当て', '音程比較', 'ハモリ判定']);
});

test('chord-ate setup size 2/3', () => {
  const item = chordAte.setup.find((s) => s.key === 'size');
  assert.deepEqual(item.options.map((o) => o.value), [2, 3]);
  assert.equal(item.default, 2);
});

test('chord-ate 2和音はDYADSラベルのみ・2声', () => {
  const round = chordAte.createRound({ size: 2 }, makeRng(3));
  const labels = new Set();
  let q = round.next(null);
  for (let i = 0; i < 10 && q; i++) {
    assert.equal(q.play[0].type, 'chord');
    assert.equal(q.play[0].notes.length, 2);
    assert.equal(q.input.options.length, 4);
    labels.add(q.input.options[q.input.correct]);
    q = round.next(true);
  }
  for (const L of labels) {
    assert.ok(['短3度', '長3度', '完全5度', 'オクターブ'].includes(L));
  }
});

test('chord-ate 3和音はmajor/minorのみ・3声', () => {
  const round = chordAte.createRound({ size: 3 }, makeRng(5));
  let q = round.next(null);
  for (let i = 0; i < 10 && q; i++) {
    assert.equal(q.play[0].notes.length, 3);
    assert.deepEqual(q.input.options, ['メジャー', 'マイナー']);
    assert.ok(q.input.correct === 0 || q.input.correct === 1);
    q = round.next(true);
  }
});

test('hamori startCents と oto explain', async () => {
  const hamori = (await import('../js/modes/hamori.js')).default;
  const oto = (await import('../js/modes/oto-ate.js')).default;
  assert.equal(hamori.title, 'ハモリ判定');
  assert.equal(oto.title, '音当て');
  const item = hamori.setup.find((s) => s.key === 'startCents');
  assert.deepEqual(item.options.map((o) => o.value), [40, 25, 10, 5]);
  const q = oto.createRound({ range: 'mid' }, makeRng(1), { noteStyle: 'doremi' }).next(null);
  assert.match(q.explain, /^答えは「/);
});
