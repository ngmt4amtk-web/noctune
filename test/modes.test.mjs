import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../js/modes/registry.js';
import chordAte from '../js/modes/chord-ate.js';
import { makeRng } from '../js/engine.js';

test('registry順と表示名', () => {
  assert.deepEqual(
    MODES.map((m) => m.title),
    ['音当て', '和音当て', '音程比較', 'ハモリ判定']
  );
});

test('和音当てはpitch-set・品質ラベルなし', () => {
  const round = chordAte.createRound({ size: 2 }, makeRng(9), { noteStyle: 'doremi' });
  const q = round.next(null);
  assert.equal(q.input.kind, 'pitch-set');
  assert.equal(q.input.requiredCount, 2);
  assert.equal(q.input.options.length, 12);
  const joined = q.input.options.map((o) => o.label).join(',');
  assert.equal(joined.includes('メジャー'), false);
  assert.equal(joined.includes('短3度'), false);
  assert.equal(q.play[0].notes.length, 2);
  assert.deepEqual(
    q.input.correctPcs,
    q.play[0].notes.map((n) => ((n.midi % 12) + 12) % 12).sort((a, b) => a - b)
  );
});

test('和音当て3音もpitch-set', () => {
  const round = chordAte.createRound({ size: 3 }, makeRng(2), { noteStyle: 'abc' });
  const q = round.next(null);
  assert.equal(q.input.requiredCount, 3);
  assert.equal(q.play[0].notes.length, 3);
  for (const n of q.play[0].notes) {
    assert.ok(n.midi >= 48 && n.midi <= 71);
  }
});

test('grade: 順不同は正解、部分集合は不正解', () => {
  const round = chordAte.createRound({ size: 2 }, makeRng(1), { noteStyle: 'doremi' });
  const q = round.next(null);
  const pcs = q.input.correctPcs;
  assert.equal(q.grade({ pcs: [...pcs].reverse() }), true);
  assert.equal(q.grade({ pcs: [pcs[0]] }), false);
  const wrong = [(pcs[0] + 1) % 12, (pcs[1] + 2) % 12];
  assert.equal(q.grade({ pcs: wrong }), false);
});

test('MIDI範囲とPC重複なしを10問確認', () => {
  const round = chordAte.createRound({ size: 3 }, makeRng(11), { noteStyle: 'doremi' });
  let q = round.next(null);
  for (let i = 0; i < 10 && q; i++) {
    const midis = q.play[0].notes.map((n) => n.midi);
    const pcs = midis.map((m) => ((m % 12) + 12) % 12);
    assert.equal(new Set(pcs).size, pcs.length);
    assert.ok(Math.min(...midis) >= 48);
    assert.ok(Math.max(...midis) <= 71);
    q = round.next(true);
  }
});
