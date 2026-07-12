import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../js/modes/registry.js';
import chordAte from '../js/modes/chord-ate.js';
import { makeRng } from '../js/engine.js';

const QUALITY_WORDS = ['メジャー', '短3度', '長三和音', '短三和音', '減三和音', 'sus4'];

test('registry順と表示名', () => {
  assert.deepEqual(
    MODES.map((m) => m.title),
    ['音当て', '和音当て', '音程比較', 'ハモリ判定']
  );
});

test('全モードが画像アイコンを持つ', () => {
  for (const m of MODES) {
    assert.match(m.icon, /^assets\/modes\/.+\.png$/);
  }
});

test('和音当てフリーはpitch-set・品質ラベルなし', () => {
  const round = chordAte.createRound({ gen: 'free', size: 2 }, makeRng(9), { noteStyle: 'doremi' });
  const q = round.next(null);
  assert.equal(q.input.kind, 'pitch-set');
  assert.equal(q.input.requiredCount, 2);
  assert.equal(q.input.options.length, 12);
  const joined = q.input.options.map((o) => o.label).join(',');
  for (const w of QUALITY_WORDS) assert.equal(joined.includes(w), false);
  assert.equal(q.play[0].notes.length, 2);
  assert.equal(q.detail.gen, 'free');
  assert.deepEqual(
    q.input.correctPcs,
    q.play[0].notes.map((n) => ((n.midi % 12) + 12) % 12).sort((a, b) => a - b)
  );
});

test('和音当て和声的は3音・コードプール由来', () => {
  const round = chordAte.createRound({ gen: 'harmonic', size: 2 }, makeRng(2), { noteStyle: 'abc' });
  const q = round.next(null);
  assert.equal(q.input.requiredCount, 3);
  assert.equal(q.play[0].notes.length, 3);
  assert.equal(q.detail.gen, 'harmonic');
  assert.ok(q.detail.chord);
  assert.ok(['maj', 'min', 'dim', 'sus4'].includes(q.detail.chord.chordId));
  assert.equal(q.detail.chord.roles.length, 3);
  for (const n of q.play[0].notes) {
    assert.ok(n.midi >= 48 && n.midi <= 71);
  }
  // 選択肢に品質名が出ない
  const joined = q.input.options.map((o) => o.label).join(',');
  assert.equal(joined.includes('メジャー'), false);
  assert.equal(joined.includes('長三和音'), false);
});

test('和声的の構成音PCはコードintervalsと一致', () => {
  const INTERVALS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], sus4: [0, 5, 7] };
  const round = chordAte.createRound({ gen: 'harmonic' }, makeRng(17), { noteStyle: 'doremi' });
  let q = round.next(null);
  for (let i = 0; i < 10 && q; i++) {
    const chord = q.detail.chord;
    const want = new Set(INTERVALS[chord.chordId].map((iv) => (chord.rootPc + iv) % 12));
    const got = new Set(q.detail.targetPcs);
    assert.deepEqual([...got].sort((a, b) => a - b), [...want].sort((a, b) => a - b));
    q = round.next(true);
  }
});

test('grade: 順不同は正解、部分集合は不正解', () => {
  const round = chordAte.createRound({ gen: 'free', size: 2 }, makeRng(1), { noteStyle: 'doremi' });
  const q = round.next(null);
  const pcs = q.input.correctPcs;
  assert.equal(q.grade({ pcs: [...pcs].reverse() }), true);
  assert.equal(q.grade({ pcs: [pcs[0]] }), false);
  const wrong = [(pcs[0] + 1) % 12, (pcs[1] + 2) % 12];
  assert.equal(q.grade({ pcs: wrong }), false);
});

test('MIDI範囲とPC重複なしを10問確認', () => {
  const round = chordAte.createRound({ gen: 'free', size: 3 }, makeRng(11), { noteStyle: 'doremi' });
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
