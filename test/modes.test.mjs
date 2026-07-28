import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../js/modes/registry.js';
import chordAte from '../js/modes/chord-ate.js';
import { makeRng } from '../js/engine.js';

const QUALITY_WORDS = ['メジャー', '短3度', '長三和音', '短三和音', '減三和音', 'sus4'];
const oto = MODES.find((mode) => mode.id === 'oto-ate');

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

test('音当て: 最初は基準との高低を3択で聴く', () => {
  const q = oto
    .createRound({ stage: 'direction', accidental: 'none' }, makeRng(4), {
      settings: { questionCount: 5, noteStyle: 'doremi' },
    })
    .next(null);
  assert.deepEqual(q.input.options, ['低い', '同じ', '高い']);
  assert.equal(q.play.filter((step) => step.type === 'note').length, 2);
  assert.ok(q.guidePlay.length >= 3);
  assert.equal(q.untilCorrect, true);
  assert.equal(q.assistanceCountsAsMiss, true);
});

test('音当て: 3音→5音→7音は調性文脈と段階別の選択肢を持つ', () => {
  const stages = [
    ['triad', 3],
    ['penta', 5],
    ['diatonic', 7],
  ];
  for (const [stage, count] of stages) {
    const q = oto
      .createRound({ stage, accidental: 'none' }, makeRng(5), {
        settings: { questionCount: 5, noteStyle: 'doremi' },
      })
      .next(null);
    assert.equal(q.input.options.length, count);
    assert.equal(q.play[0].type, 'chord');
    assert.equal(q.play.filter((step) => step.type === 'chord').length, 4);
    assert.equal(q.play.at(-1).type, 'note');
    assert.equal(q.input.options[q.input.correct].value, q.detail.targetPc);
    assert.equal(q.input.options.some((opt) => /[♯♭]/.test(opt.label)), false);
    assert.match(q.context, /^主音 /);
    assert.ok(q.hint.includes(q.input.options[q.input.correct].label));
  }
});

test('音当て: 12音は基準音との関係・選択表記・ガイドを持つ', () => {
  const flat = oto
    .createRound({ stage: 'chromatic', accidental: 'flat' }, makeRng(6), {
      settings: { questionCount: 5, noteStyle: 'abc' },
    })
    .next(null);
  assert.equal(flat.input.options.length, 12);
  assert.deepEqual(
    flat.input.options.slice(0, 3).map((option) => option.label),
    ['C', 'D♭', 'D']
  );
  assert.equal(flat.input.options.map((option) => option.label).join('').includes('♯'), false);
  assert.equal(flat.input.correct, flat.detail.targetPc);
  assert.equal(flat.play.filter((step) => step.type === 'note').length, 2);
  assert.ok(flat.guidePlay.length >= 3);

  const sharp = oto
    .createRound({ stage: 'chromatic', accidental: 'sharp' }, makeRng(7), {
      settings: { questionCount: 5, noteStyle: 'doremi' },
    })
    .next(null);
  assert.ok(sharp.input.options.map((option) => option.label).join('').includes('♯'));
  assert.equal(sharp.detail.accidental, 'sharp');
});

test('音当て: 白鍵のみでは12音を選んでも7音へ安全に丸める', () => {
  const q = oto
    .createRound({ stage: 'chromatic', accidental: 'none' }, makeRng(8), {
      settings: { questionCount: 5, noteStyle: 'doremi' },
    })
    .next(null);
  assert.equal(q.detail.stageId, 'diatonic');
  assert.equal(q.input.options.length, 7);
});

test('音当て: おまかせは正解で段階を上げ、誤答で一段戻す', () => {
  const round = oto.createRound({ stage: 'auto', accidental: 'sharp' }, makeRng(9), {
    settings: { questionCount: 5, noteStyle: 'doremi' },
    progress: { autoLevel: 0 },
  });
  const q1 = round.next(null);
  const q2 = round.next(true);
  const q3 = round.next(true);
  const q4 = round.next(true);
  const q5 = round.next(false);
  assert.equal(q1.detail.stageId, 'direction');
  assert.equal(q2.detail.stageId, 'triad');
  assert.equal(q3.detail.stageId, 'triad');
  assert.equal(q4.detail.stageId, 'penta');
  assert.equal(q5.detail.stageId, 'triad');
  assert.equal(round.next(true), null);
  const summary = round.summary();
  assert.equal(summary.adaptive, true);
  assert.equal(summary.accuracy, 4 / 5);
  assert.equal(summary.autoLevelEnd, 1);
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

test('音当て: 全問 untilCorrect（正解を押すまで進まない）', () => {
  const round = oto.createRound({ stage: 'diatonic', accidental: 'none' }, makeRng(7), {
    settings: { questionCount: 5, noteStyle: 'doremi' },
  });
  let q = round.next(null);
  let n = 0;
  while (q) {
    n++;
    assert.equal(q.untilCorrect, true);
    q = round.next(true);
  }
  assert.equal(n, 5);
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
