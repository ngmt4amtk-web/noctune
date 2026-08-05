import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from '../js/modes/registry.js';
import chordAte from '../js/modes/chord-ate.js';
import {
  RANGE_OPTIONS,
  STRING_NATURALS,
  CALIBRATION_MIDIS,
  CALIBRATION_CUES,
  READY_CUE,
  READY_HOLD_SECONDS,
  mapTarget,
  createTargetDeck,
  resolveRange,
  resolveTones,
  resolveOpenEach,
  buildPool,
} from '../js/modes/oto-ate.js';
import { makeRng } from '../js/engine.js';
import { WHITE_PCS, STRINGS, positionsForString, noteNamesFor } from '../js/theory.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const QUALITY_WORDS = ['メジャー', '短3度', '長三和音', '短三和音', '減三和音', 'sus4'];
const oto = MODES.find((mode) => mode.id === 'oto-ate');
const FORBIDDEN_STEP = new Set(['chord', 'double', 'seq']);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function noteMidis(steps) {
  return (steps || []).filter((s) => s.type === 'note').map((s) => s.midi);
}

function assertCleanQuestion(q) {
  assert.equal(q.untilCorrect, undefined);
  assert.equal(q.guidePlay, undefined);
  assert.equal(q.timeLimitMs, undefined);
  assert.equal(q.feedbackFx, true);
  assert.equal(q.hint, undefined);
  assert.equal(q.correctFx, 'otoCorrect');
  assert.equal(q.streakFx, 'otoStreak');
  assert.equal(q.wrongFx, 'otoWrong');
  assert.equal(q.rewardBurst, true);
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

test('音当て: setupは音域・使う音・表記・毎問の開放弦の3項目', () => {
  assert.deepEqual(
    oto.setup.map((s) => s.key),
    ['range', 'tones', 'openEach']
  );
  assert.equal(oto.setup[0].default, '7');
  assert.equal(oto.setup[1].default, 'white');
  assert.equal(oto.setup[2].default, 'on');
  assert.deepEqual(
    oto.setup[0].options.map((o) => o.value),
    ['7', '2oct', 'violin']
  );
  assert.deepEqual(
    oto.setup[0].options.map((o) => o.label),
    ['1オクターブ', '2オクターブ', 'バイオリン音域']
  );
  assert.match(oto.setup[0].options[0].sub, /白鍵なら7音/);
  assert.match(oto.setup[0].options[0].sub, /12音/);
  assert.deepEqual(
    oto.setup[1].options.map((o) => o.value),
    ['white', 'sharp', 'flat']
  );
  assert.deepEqual(
    oto.setup[1].options.map((o) => o.label),
    ['白鍵のみ', '♯系', '♭系']
  );
  assert.deepEqual(
    oto.setup[2].options.map((o) => o.value),
    ['on', 'off']
  );
  assert.match(oto.setup[2].options[1].sub, /誤答/);
  assert.match(oto.setup[2].options[1].sub, /問題音だけ/);

  const blob = JSON.stringify(oto.setup);
  assert.equal(blob.includes('おまかせ'), false);
  assert.equal(blob.includes('direction'), false);
  assert.equal(blob.includes('chromatic'), false);
  assert.equal(blob.includes('stage'), false);

  const cfg = oto.normalizeConfig({ stage: 'auto', accidental: 'sharp', range: 'nope' });
  assert.equal(cfg.range, '7');
  assert.equal(cfg.tones, 'white');
  assert.equal(cfg.openEach, 'on');
  assert.equal(cfg.stage, undefined);
  assert.equal(cfg.accidental, undefined);
  assert.equal(resolveRange({}), '7');
  assert.equal(resolveTones({}), 'white');
  assert.equal(resolveOpenEach({}), 'on');
  assert.deepEqual(oto.completionFx, { normal: 'otoComplete', newBest: 'otoCompleteBest' });
});

test('音当て: 白鍵／♯／♭のプール境界', () => {
  assert.deepEqual(buildPool('7', 'white'), [60, 62, 64, 65, 67, 69, 71]);
  assert.deepEqual(buildPool('7', 'sharp'), [...Array(12).keys()].map((i) => 60 + i));
  assert.deepEqual(buildPool('7', 'flat'), buildPool('7', 'sharp'));
  assert.equal(buildPool('2oct', 'white').length, 14);
  assert.equal(buildPool('2oct', 'sharp').length, 24);
  assert.equal(buildPool('violin', 'white').length, 17);
  assert.equal(buildPool('violin', 'sharp').length, 29);
  assert.equal(buildPool('violin', 'sharp')[0], 55);
  assert.equal(buildPool('violin', 'sharp').at(-1), 83);
  for (const midi of buildPool('violin', 'white')) {
    assert.equal(WHITE_PCS.includes(((midi % 12) + 12) % 12), true);
  }
});

test('音当て: createRoundのintroはcue同期カウントインで第1問へ混入しない', () => {
  const round = oto.createRound({ range: 'violin', tones: 'white', openEach: 'on' }, makeRng(11), {
    settings: { questionCount: 3, noteStyle: 'doremi' },
  });
  assert.equal(round.intro.label, undefined);
  assert.deepEqual(noteMidis(round.intro.play), CALIBRATION_MIDIS);
  assert.deepEqual(
    round.intro.play.filter((s) => s.type === 'note').map((s) => s.cue),
    CALIBRATION_CUES
  );
  assert.equal(round.intro.play.at(-1).type, 'gap');
  assert.equal(round.intro.play.at(-1).dur, READY_HOLD_SECONDS);
  assert.equal(round.intro.play.at(-1).cue, READY_CUE);
  assert.equal(round.intro.play.at(-1).ready, true);
  assert.equal(
    round.intro.play.some((s) => s.type === 'note' && /START/.test(s.cue || '')),
    false
  );
  // 音間gapは従来どおり3つ、START!用の末尾gapは1つだけ
  const gaps = round.intro.play.filter((s) => s.type === 'gap');
  assert.equal(gaps.length, 4);
  assert.deepEqual(
    gaps.map((g) => g.dur),
    [0.08, 0.08, 0.08, READY_HOLD_SECONDS]
  );

  const q1 = round.next(null);
  const notes1 = noteMidis(q1.play);
  assert.deepEqual(notes1, [q1.detail.anchorMidi, q1.detail.targetMidi]);
  assert.notDeepEqual(notes1.slice(0, 4), CALIBRATION_MIDIS);
  assertCleanQuestion(q1);

  const q2 = round.next(true);
  assert.deepEqual(noteMidis(q2.play), [q2.detail.anchorMidi, q2.detail.targetMidi]);
  assertCleanQuestion(q2);
});

test('音当て: runnerはstep開始callbackでcue更新し独立タイマー同期しない', () => {
  const runnerSrc = readFileSync(join(ROOT, 'js/ui/runner.js'), 'utf8');
  const cssSrc = readFileSync(join(ROOT, 'css/style.css'), 'utf8');
  assert.match(runnerSrc, /onStepStart\?\.\(s\)/);
  assert.match(runnerSrc, /if \(step\?\.cue\) showIntroCue\(step\.cue, step\.ready === true\)/);
  assert.match(runnerSrc, /runner-intro-cue/);
  assert.match(runnerSrc, /classList\.toggle\('is-ready'/);
  assert.match(runnerSrc, /classList\.add\('is-enter'\)/);
  // 導入cue用の独立setTimeout同期は持たない（sleepはgap再生用のみ）
  assert.equal(/setTimeout\([^)]*cue|cue[^;]*setTimeout/i.test(runnerSrc), false);
  assert.match(cssSrc, /\.runner-intro-cue\.is-ready/);
  assert.match(cssSrc, /\.runner-intro-cue\.is-ready\.is-enter/);
  assert.match(cssSrc, /\.runner-intro-cue\.is-enter/);
  assert.match(cssSrc, /runner-intro-cue\.is-enter/);
  assert.equal(cssSrc.includes('runner-intro-start'), false);
  // 和名cueとSTART!で同じ過剰letter-spacingを使わない
  assert.match(cssSrc, /\.runner-intro-cue \{[\s\S]*?letter-spacing:\s*0;/);
  assert.match(cssSrc, /\.runner-intro-cue\.is-ready \{[\s\S]*?letter-spacing:\s*0\.06em;/);
  const introCueBlock = cssSrc.match(/\.runner-intro-cue[\s\S]*?@keyframes intro-cue-enter/)?.[0] || '';
  assert.equal(/letter-spacing:\s*0\.28em/.test(introCueBlock), false);
  assert.equal(/text-indent:\s*0\.28em/.test(introCueBlock), false);
  assert.match(
    runnerSrc,
    /if \(!container\.isConnected \|\| aborted \|\| introEpoch !== playEpoch\) return;[\s\S]*?synth\.stopAll/
  );
});

test('音当て: 毎問開放弦OFFは出題targetのみ、誤答確認はanchor→target', () => {
  const round = oto.createRound({ range: '7', tones: 'white', openEach: 'off' }, makeRng(3), {
    settings: { questionCount: 2, noteStyle: 'abc' },
  });
  const q1 = round.next(null);
  assert.deepEqual(noteMidis(q1.play), [q1.detail.targetMidi]);
  assert.deepEqual(noteMidis(q1.feedbackPlayOnWrong), [q1.detail.anchorMidi, q1.detail.targetMidi]);
  assert.equal(q1.detail.openEach, 'off');
});

test('音当て: 白鍵7択と♯／♭の12音正解index・表記', () => {
  for (const tones of ['white', 'sharp', 'flat']) {
    for (const range of ['7', '2oct', 'violin']) {
      for (const style of ['doremi', 'abc']) {
        const round = oto.createRound({ range, tones, openEach: 'on' }, makeRng(21), {
          settings: { questionCount: 20, noteStyle: style },
        });
        let q = round.next(null);
        let n = 0;
        while (q) {
          n++;
          if (tones === 'white') {
            assert.equal(q.input.options.length, 7);
            assert.equal(q.input.layout, 'pc7');
            assert.deepEqual(
              q.input.options.map((o) => o.value),
              WHITE_PCS
            );
            assert.equal(q.input.correct, WHITE_PCS.indexOf(q.detail.targetPc));
          } else {
            assert.equal(q.input.options.length, 12);
            assert.equal(q.input.cols, 3);
            assert.deepEqual(
              q.input.options.map((o) => o.value),
              [...Array(12).keys()]
            );
            assert.equal(q.input.correct, q.detail.targetPc);
            const names = noteNamesFor(style, tones === 'flat' ? 'flat' : 'sharp');
            assert.equal(q.input.options[1].label, names[1]);
            if (tones === 'sharp') assert.match(q.input.options[1].label, /♯|#/);
            if (tones === 'flat') assert.match(q.input.options[1].label, /♭|b/);
          }
          assert.equal(q.input.options[q.input.correct].value, q.detail.targetPc);
          assertCleanQuestion(q);
          q = round.next(true);
        }
        assert.equal(n, 20);
      }
    }
  }
});

test('音当て: G3–B5全29半音が一意に弦指へ割り当てられ境界は新しい開放弦側', () => {
  const seen = new Map();
  for (let midi = 55; midi <= 83; midi++) {
    const m = mapTarget(midi);
    assert.ok(m.stringIndex >= 0 && m.stringIndex <= 3);
    assert.equal(m.anchorMidi, STRINGS[m.stringIndex].midi);
    const pos = positionsForString(m.stringIndex).find((p) => p.midi === midi);
    assert.ok(pos);
    assert.equal(m.finger, pos.finger);
    assert.equal(m.semi, pos.semi);
    assert.equal(seen.has(midi), false);
    seen.set(midi, m);
  }
  assert.equal(seen.size, 29);
  assert.equal(mapTarget(62).stringName, 'D線'); // D4 新しい開放弦側
  assert.equal(mapTarget(69).stringName, 'A線');
  assert.equal(mapTarget(76).stringName, 'E線');
  assert.equal(mapTarget(60).stringName, 'G線'); // C4
  assert.equal(mapTarget(67).stringName, 'D線'); // G4
  assert.equal(mapTarget(83).mappingLabel, 'E線4指');
});

test('音当て: シャッフル袋はプール内非反復・補充境界で直前を避ける', () => {
  for (const seed of [1, 2, 3, 7, 13, 42, 99]) {
    for (const range of RANGE_OPTIONS) {
      for (const tones of ['white', 'sharp']) {
        const pool = buildPool(range.value, tones);
        const deck = createTargetDeck(pool, makeRng(seed));
        const seen = [];
        const poolSize = pool.length;
        for (let i = 0; i < poolSize * 3; i++) seen.push(deck.next());
        for (let cycle = 0; cycle < 3; cycle++) {
          const slice = seen.slice(cycle * poolSize, (cycle + 1) * poolSize);
          assert.equal(new Set(slice).size, poolSize);
          assert.deepEqual([...slice].sort((a, b) => a - b), [...pool].sort((a, b) => a - b));
        }
        for (let i = poolSize; i < seen.length; i += poolSize) {
          assert.notEqual(seen[i], seen[i - 1]);
        }
      }
    }
  }
});

test('音当て: 1000seed×全音域×全表記で袋・正解ラベル・再生列', () => {
  for (let seed = 0; seed < 1000; seed++) {
    for (const range of ['7', '2oct', 'violin']) {
      for (const tones of ['white', 'sharp', 'flat']) {
        for (const openEach of ['on', 'off']) {
          const pool = buildPool(range, tones);
          const deck = createTargetDeck(pool, makeRng(seed));
          const bagSize = pool.length;
          const firstBag = [];
          for (let i = 0; i < bagSize; i++) firstBag.push(deck.next());
          assert.equal(new Set(firstBag).size, bagSize);
          const next = deck.next();
          assert.notEqual(next, firstBag[bagSize - 1]);

          const round = oto.createRound({ range, tones, openEach }, makeRng(seed), {
            settings: { questionCount: 1, noteStyle: 'doremi' },
          });
          assert.deepEqual(noteMidis(round.intro.play), CALIBRATION_MIDIS);
          const q = round.next(null);
          assert.equal(q.input.options[q.input.correct].value, q.detail.targetPc);
          if (openEach === 'on') {
            assert.deepEqual(noteMidis(q.play), [q.detail.anchorMidi, q.detail.targetMidi]);
          } else {
            assert.deepEqual(noteMidis(q.play), [q.detail.targetMidi]);
          }
          assert.deepEqual(noteMidis(q.feedbackPlayOnWrong), [q.detail.anchorMidi, q.detail.targetMidi]);
          assert.notDeepEqual(noteMidis(q.play).slice(0, 4), CALIBRATION_MIDIS);
        }
      }
    }
  }
});

test('音当て: 弦指マッピング代表値と自然音互換列', () => {
  const cases = [
    [55, 'G線', 0, 'G線開放', 55],
    [60, 'G線', 3, 'G線3指', 55],
    [62, 'D線', 0, 'D線開放', 62],
    [65, 'D線', 2, 'D線2指', 62],
    [67, 'D線', 3, 'D線3指', 62],
    [72, 'A線', 2, 'A線2指', 69],
    [83, 'E線', 4, 'E線4指', 76],
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
    .createRound({ range: '7', tones: 'flat', openEach: 'on' }, makeRng(5), {
      settings: { questionCount: 1, noteStyle: 'abc' },
    })
    .next(null);
  assert.match(q.explain, /[A-G][♯♭]?[b#]?\d|[A-G]\d/);
  assert.match(q.explain, /線/);
  assert.match(oto.subtitle, /開放弦/);
  assert.match(oto.setup[0].hint, /絶対音感テストではありません/);
  assert.equal(oto.setup[0].hint.includes('科学的に最適'), false);
  assert.equal(JSON.stringify(oto).includes('ドーパミン'), false);
});

test('音当て専用SFX名がaudioにあり、既存correct/wrong/fanfareを壊さない', () => {
  const src = readFileSync(join(ROOT, 'js/audio.js'), 'utf8');
  for (const name of ['correct', 'wrong', 'fanfare', 'newBest', 'select', 'tap']) {
    assert.match(src, new RegExp(`case '${name}'`));
  }
  for (const name of ['otoCorrect', 'otoStreak', 'otoWrong', 'otoComplete', 'otoCompleteBest']) {
    assert.match(src, new RegExp(`case '${name}'`));
  }
  // 既存 correct の音程（C6/G6）が残っていること
  assert.match(src, /1046\.5/);
  assert.match(src, /1568\.0/);

  const runnerSrc = readFileSync(join(ROOT, 'js/ui/runner.js'), 'utf8');
  const fxSrc = readFileSync(join(ROOT, 'js/ui/fx.js'), 'utf8');
  const cssSrc = readFileSync(join(ROOT, 'css/style.css'), 'utf8');
  assert.match(runnerSrc, /rewardBurst\(stage, \{ strong: streak >= 2 \}\)/);
  assert.match(runnerSrc, /new MutationObserver/);
  assert.match(runnerSrc, /if \(container\.isConnected \|\| answered\) return/);
  assert.ok((runnerSrc.match(/if \(!container\.isConnected\) \{/g) || []).length >= 3);
  assert.match(fxSrc, /strong \? ' is-strong' : ''/);
  assert.match(cssSrc, /\.fx-reward-burst\.is-strong/);
});

test('キャッシュトークン0805c1が一貫', () => {
  const files = [
    'index.html',
    'js/asset-v.js',
    'js/main.js',
    'js/modes/registry.js',
    'js/modes/oto-ate.js',
    'js/ui/runner.js',
    'js/ui/screens.js',
    'js/ui/components.js',
  ];
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.equal(src.includes('0805b1'), false, rel);
    assert.equal(src.includes('0805c1'), true, rel);
  }
  assert.equal(readFileSync(join(ROOT, 'js/asset-v.js'), 'utf8').includes("ASSET_V = '0805c1'"), true);
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

test('他モードは untilCorrect を持たず completionFx を強制されない', () => {
  for (const mode of MODES) {
    if (mode.id === 'oto-ate') continue;
    const q = mode.createRound({}, makeRng(2), { settings: { questionCount: 5 } }).next(null);
    assert.equal(q.untilCorrect, undefined);
    assert.equal(mode.completionFx, undefined);
    assert.equal(q.correctFx, undefined);
    assert.equal(q.rewardBurst, undefined);
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
