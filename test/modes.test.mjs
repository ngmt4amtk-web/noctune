import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../js/modes/registry.js';
import chordAte from '../js/modes/chord-ate.js';
import {
  RANGE_OPTIONS,
  STRING_NATURALS,
  CALIBRATION_MIDIS,
  mapTarget,
  createTargetDeck,
  resolveRange,
} from '../js/modes/oto-ate.js';
import { makeRng } from '../js/engine.js';
import { WHITE_PCS } from '../js/theory.js';

const QUALITY_WORDS = ['メジャー', '短3度', '長三和音', '短三和音', '減三和音', 'sus4'];
const oto = MODES.find((mode) => mode.id === 'oto-ate');
const FORBIDDEN_STEP = new Set(['chord', 'double', 'seq']);

function noteMidis(steps) {
  return (steps || []).filter((s) => s.type === 'note').map((s) => s.midi);
}

function assertCleanQuestion(q) {
  assert.equal(q.untilCorrect, undefined);
  assert.equal(q.guidePlay, undefined);
  assert.equal(q.timeLimitMs, undefined);
  assert.equal(q.feedbackFx, false);
  assert.equal(q.hint, undefined);
  for (const step of q.play || []) {
    assert.equal(FORBIDDEN_STEP.has(step.type), false, `forbidden play type ${step.type}`);
  }
}

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

test('音当て: setupは音域のみ・禁止オプションなし', () => {
  assert.deepEqual(
    oto.setup.map((s) => s.key),
    ['range']
  );
  assert.equal(oto.setup[0].default, '7');
  assert.deepEqual(
    oto.setup[0].options.map((o) => o.value),
    ['7', '2oct', 'violin']
  );
  assert.deepEqual(
    oto.setup[0].options.map((o) => o.label),
    ['7音', '2オクターブ', 'バイオリン音域']
  );
  const blob = JSON.stringify(oto.setup);
  assert.equal(blob.includes('おまかせ'), false);
  assert.equal(blob.includes('accidental'), false);
  assert.equal(blob.includes('stage'), false);
  assert.equal(blob.includes('direction'), false);
  assert.equal(blob.includes('chromatic'), false);

  const cfg = oto.normalizeConfig({ stage: 'auto', accidental: 'sharp', range: 'nope' });
  assert.equal(cfg.range, '7');
  assert.equal(cfg.stage, undefined);
  assert.equal(cfg.accidental, undefined);
  assert.equal(resolveRange({}), '7');
});

test('音当て: 各音域のプール境界・臨時記号なし', () => {
  const byValue = Object.fromEntries(RANGE_OPTIONS.map((r) => [r.value, r.pool]));
  assert.deepEqual(byValue['7'], [60, 62, 64, 65, 67, 69, 71]);
  assert.deepEqual(byValue['2oct'], [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83]);
  assert.deepEqual(byValue.violin, [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83]);
  assert.equal(byValue.violin.includes(55), true);
  assert.equal(byValue.violin.includes(83), true);
  for (const pool of Object.values(byValue)) {
    for (const midi of pool) {
      assert.equal(WHITE_PCS.includes(((midi % 12) + 12) % 12), true);
    }
  }
});

test('音当て: 第1問はキャリブレーション＋開放弦＋問題音、以降は開放弦＋問題音', () => {
  const round = oto.createRound({ range: 'violin' }, makeRng(11), {
    settings: { questionCount: 3, noteStyle: 'doremi' },
  });
  const q1 = round.next(null);
  const notes1 = noteMidis(q1.play);
  assert.match(q1.context, /^基準：[GDAE]線の[ソレラミ]$/);
  assert.deepEqual(notes1.slice(0, 4), CALIBRATION_MIDIS);
  assert.equal(notes1[4], q1.detail.anchorMidi);
  assert.equal(notes1[5], q1.detail.targetMidi);
  assert.equal(notes1.length, 6);
  assertCleanQuestion(q1);

  const q2 = round.next(true);
  const notes2 = noteMidis(q2.play);
  assert.deepEqual(notes2, [q2.detail.anchorMidi, q2.detail.targetMidi]);
  assert.equal(notes2.length, 2);
  assert.notDeepEqual(notes2.slice(0, 4), CALIBRATION_MIDIS);
  assertCleanQuestion(q2);
});

test('音当て: 7択の音名ボタンと正解indexが全音域で一致', () => {
  for (const range of ['7', '2oct', 'violin']) {
    for (const style of ['doremi', 'abc']) {
      const round = oto.createRound({ range }, makeRng(21), {
        settings: { questionCount: 20, noteStyle: style },
      });
      let q = round.next(null);
      let n = 0;
      while (q) {
        n++;
        assert.equal(q.input.options.length, 7);
        assert.deepEqual(
          q.input.options.map((o) => o.value),
          WHITE_PCS
        );
        assert.equal(q.input.options[q.input.correct].value, q.detail.targetPc);
        assert.equal(q.input.correct, WHITE_PCS.indexOf(q.detail.targetPc));
        if (style === 'doremi') assert.equal(q.input.options[0].label, 'ド');
        if (style === 'abc') assert.equal(q.input.options[0].label, 'C');
        if (style === 'doremi') assert.match(q.context, /^基準：[GDAE]線の[ソレラミ]$/);
        if (style === 'abc') assert.match(q.context, /^基準：[GDAE]線の[GDAE]$/);
        assertCleanQuestion(q);
        assert.ok(Array.isArray(q.feedbackPlayOnWrong));
        assert.deepEqual(noteMidis(q.feedbackPlayOnWrong), [q.detail.anchorMidi, q.detail.targetMidi]);
        q = round.next(true);
      }
      assert.equal(n, 20);
    }
  }
});

test('音当て: シャッフル袋はプール内非反復・補充境界で直前を避ける', () => {
  for (const seed of [1, 2, 3, 7, 13, 42, 99]) {
    for (const range of RANGE_OPTIONS) {
      const deck = createTargetDeck(range.pool, makeRng(seed));
      const seen = [];
      const poolSize = range.pool.length;
      for (let i = 0; i < poolSize * 3; i++) seen.push(deck.next());
      for (let cycle = 0; cycle < 3; cycle++) {
        const slice = seen.slice(cycle * poolSize, (cycle + 1) * poolSize);
        assert.equal(new Set(slice).size, poolSize);
        assert.deepEqual([...slice].sort((a, b) => a - b), [...range.pool].sort((a, b) => a - b));
      }
      for (let i = poolSize; i < seen.length; i += poolSize) {
        assert.notEqual(seen[i], seen[i - 1]);
      }
    }
  }
});

test('音当て: 弦指マッピング代表値', () => {
  const cases = [
    [55, 'G線', 0, 'G線開放', 55],
    [60, 'G線', 3, 'G線3指', 55], // C4 境界はG線
    [62, 'D線', 0, 'D線開放', 62],
    [65, 'D線', 2, 'D線2指', 62], // F4 = 3半音
    [67, 'D線', 3, 'D線3指', 62], // G4 はD線側
    [72, 'A線', 2, 'A線2指', 69], // C5 = 3半音
    [83, 'E線', 4, 'E線4指', 76], // B5
  ];
  for (const [midi, stringName, finger, label, anchor] of cases) {
    const m = mapTarget(midi);
    assert.equal(m.stringName, stringName);
    assert.equal(m.finger, finger);
    assert.equal(m.mappingLabel, label);
    assert.equal(m.anchorMidi, anchor);
  }
  assert.deepEqual(STRING_NATURALS.flat(), [
    55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83,
  ]);
});

test('音当て: 説明文に科学的ピッチと弦指が入る', () => {
  const q = oto
    .createRound({ range: '7' }, makeRng(5), { settings: { questionCount: 1, noteStyle: 'abc' } })
    .next(null);
  assert.match(q.explain, /[A-G]\d/);
  assert.match(q.explain, /線/);
  assert.match(oto.subtitle, /開放弦/);
  assert.match(oto.setup[0].hint, /絶対音感テストではありません/);
  assert.equal(oto.setup[0].hint.includes('科学的に最適'), false);
});

test('設定の問題数が全モードに効く', () => {
  for (const mode of MODES) {
    const round5 = mode.createRound({}, makeRng(1), { settings: { questionCount: 5 } });
    assert.equal(round5.total, 5);
    const round20 = mode.createRound({}, makeRng(1), { settings: { questionCount: 20 } });
    assert.equal(round20.total, 20);
    const roundDef = mode.createRound({}, makeRng(1), { settings: {} });
    assert.equal(roundDef.total, 5);
  }
});

test('他モードは untilCorrect を持たない', () => {
  for (const mode of MODES) {
    if (mode.id === 'oto-ate') continue;
    const q = mode.createRound({}, makeRng(2), { settings: { questionCount: 5 } }).next(null);
    assert.equal(q.untilCorrect, undefined);
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
