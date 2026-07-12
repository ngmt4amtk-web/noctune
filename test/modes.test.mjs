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

test('音当て: シャープ・フラットなしは白鍵のみ・7択', () => {
  const oto = MODES.find((m) => m.id === 'oto-ate');
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const round = oto.createRound({ accidental: 'none', range: 'mid' }, makeRng(4), {
    settings: { questionCount: 10, noteStyle: 'doremi' },
  });
  assert.equal(round.total, 10);
  let q = round.next(null);
  for (let i = 0; i < 10 && q; i++) {
    assert.equal(q.input.options.length, 7);
    assert.ok(WHITE.includes(q.detail.targetPc));
    const joined = q.input.options.join('');
    assert.equal(joined.includes('♯'), false);
    assert.equal(joined.includes('♭'), false);
    assert.ok(q.input.correct >= 0 && q.input.correct < 7);
    assert.equal(q.input.options[q.input.correct], q.explain.match(/「(.+)」/)[1]);
    q = round.next(true);
  }
});

test('音当て: フラットありは♭表記・♯なし', () => {
  const oto = MODES.find((m) => m.id === 'oto-ate');
  const round = oto.createRound({ accidental: 'flat', range: 'mid' }, makeRng(5), {
    settings: { questionCount: 10, noteStyle: 'abc' },
  });
  let q = round.next(null);
  for (let i = 0; i < 10 && q; i++) {
    assert.equal(q.input.options.length, 12);
    const joined = q.input.options.join('');
    assert.ok(joined.includes('♭'));
    assert.equal(joined.includes('♯'), false);
    assert.ok(q.input.correct >= 0 && q.input.correct < 12);
    assert.equal(q.input.options[q.input.correct], q.explain.match(/「(.+)」/)[1]);
    assert.equal(q.detail.targetPc, q.input.correct);
    q = round.next(true);
  }
  const first = oto.createRound({ accidental: 'flat', range: 'mid' }, makeRng(5), {
    settings: { questionCount: 1, noteStyle: 'abc' },
  }).next(null);
  assert.deepEqual(first.input.options.slice(0, 3), ['C', 'D♭', 'D']);
});

test('音当て: シャープありは既定どおり♯', () => {
  const oto = MODES.find((m) => m.id === 'oto-ate');
  const round = oto.createRound({ range: 'mid' }, makeRng(6), {
    settings: { questionCount: 3, noteStyle: 'doremi' },
  });
  const q = round.next(null);
  assert.equal(q.input.options.length, 12);
  assert.ok(q.input.options.join('').includes('♯'));
  assert.equal(q.detail.accidental, 'sharp');
});

test('設定の問題数が全モードに効く', () => {
  for (const mode of MODES) {
    const round5 = mode.createRound({}, makeRng(1), { settings: { questionCount: 5 } });
    assert.equal(round5.total, 5);
    const round20 = mode.createRound({}, makeRng(1), { settings: { questionCount: 20 } });
    assert.equal(round20.total, 20);
    const roundDef = mode.createRound({}, makeRng(1), { settings: {} });
    assert.equal(roundDef.total, 10);
  }
});

test('ハモリ odd問題数でも落ちない', () => {
  const hamori = MODES.find((m) => m.id === 'hamori');
  const round = hamori.createRound({ hibiki: 'P5', startCents: 25 }, makeRng(3), {
    settings: { questionCount: 5 },
  });
  assert.equal(round.total, 5);
  let q = round.next(null);
  let n = 0;
  while (q) {
    n++;
    q = round.next(true);
  }
  assert.equal(n, 5);
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
