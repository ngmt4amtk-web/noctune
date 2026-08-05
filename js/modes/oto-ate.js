// 音当て: 開放弦を基準に、バイオリン第1ポジションの音名を当てる練習
import { noteNamesFor, STRINGS, positionsForString, WHITE_PCS } from '../theory.js?v=0805c1';
import { resolveQuestionCount } from '../identity.js?v=0805c1';
import { shuffle } from '../engine.js?v=0805c1';

export const RANGE_OPTIONS = [
  {
    value: '7',
    label: '1オクターブ',
    sub: 'C4〜B4。白鍵なら7音・♯／♭なら12音',
    start: 60,
    end: 71,
  },
  {
    value: '2oct',
    label: '2オクターブ',
    sub: 'C4〜B5。白鍵は自然音、♯／♭は全半音',
    start: 60,
    end: 83,
  },
  {
    value: 'violin',
    label: 'バイオリン音域',
    sub: 'G3〜B5。第1ポジション。白鍵は自然音、♯／♭は全半音',
    start: 55,
    end: 83,
  },
];

const RANGE_BY_ID = Object.fromEntries(RANGE_OPTIONS.map((r) => [r.value, r]));
const VALID_RANGES = new Set(RANGE_OPTIONS.map((r) => r.value));
const VALID_TONES = new Set(['white', 'sharp', 'flat']);
const VALID_OPEN = new Set(['on', 'off']);

export const CALIBRATION_MIDIS = [55, 62, 69, 76];
export const CALIBRATION_CUES = ['ソ', 'レ', 'ラ', 'ミ'];
export const READY_CUE = 'START!';
export const READY_HOLD_SECONDS = 0.48;

function pcOf(midi) {
  return ((midi % 12) + 12) % 12;
}

export function resolveRange(config) {
  const value = config?.range;
  return VALID_RANGES.has(value) ? value : '7';
}

export function resolveTones(config) {
  const value = config?.tones;
  return VALID_TONES.has(value) ? value : 'white';
}

export function resolveOpenEach(config) {
  const value = config?.openEach;
  return VALID_OPEN.has(value) ? value : 'on';
}

/** 音域の start/end から半音プールを動的生成。白鍵のみは WHITE_PCS で絞る */
export function buildPool(rangeId, tones) {
  const range = RANGE_BY_ID[resolveRange({ range: rangeId })];
  const all = [];
  for (let midi = range.start; midi <= range.end; midi++) all.push(midi);
  if (tones === 'white') return all.filter((midi) => WHITE_PCS.includes(pcOf(midi)));
  return all;
}

/**
 * G3–B5 を positionsForString 由来で一意に弦・指へ割当。
 * 重複する開放弦境界 D4/A4/E5 は新しい（高い）弦側。
 */
export function mapTarget(midi) {
  let best = null;
  for (let stringIndex = 0; stringIndex < STRINGS.length; stringIndex++) {
    const pos = positionsForString(stringIndex).find((p) => p.midi === midi);
    if (!pos) continue;
    // 後から見つかる高い弦を優先（境界の開放弦側）
    best = { stringIndex, pos };
  }
  if (!best) throw new Error(`unmapped oto-ate target midi: ${midi}`);
  const { stringIndex, pos } = best;
  const stringName = STRINGS[stringIndex].name;
  const fingerLabel = pos.finger === 0 ? '開放' : `${pos.finger}指`;
  return {
    stringIndex,
    stringName,
    anchorMidi: STRINGS[stringIndex].midi,
    finger: pos.finger,
    semi: pos.semi,
    mappingLabel: `${stringName}${fingerLabel}`,
  };
}

/** 互換・検査用: 自然音だけの旧マップ列（境界は新しい弦側） */
export const STRING_NATURALS = [
  [55, 57, 59, 60],
  [62, 64, 65, 67],
  [69, 71, 72, 74],
  [76, 77, 79, 81, 83],
];

/** シャッフル袋。プール使い切りまで非反復。補充境界では直前MIDI・可能なら直前PCを避ける */
export function createTargetDeck(pool, rng) {
  let bag = shuffle(pool, rng);
  let index = 0;
  let prevMidi = null;
  let prevPc = null;

  function refill() {
    bag = shuffle(pool, rng);
    if (bag.length <= 1 || prevMidi == null) {
      index = 0;
      return;
    }
    const prefer = (midi) => midi !== prevMidi && pcOf(midi) !== prevPc;
    const okMidi = (midi) => midi !== prevMidi;
    let swapAt = bag.findIndex(prefer);
    if (swapAt < 0) swapAt = bag.findIndex(okMidi);
    if (swapAt > 0) [bag[0], bag[swapAt]] = [bag[swapAt], bag[0]];
    index = 0;
  }

  return {
    next() {
      if (index >= bag.length) refill();
      const midi = bag[index++];
      prevMidi = midi;
      prevPc = pcOf(midi);
      return midi;
    },
  };
}

function note(midi, dur, extra) {
  return extra ? { type: 'note', midi, dur, ...extra } : { type: 'note', midi, dur };
}

function gap(dur, extra) {
  return extra ? { type: 'gap', dur, ...extra } : { type: 'gap', dur };
}

function anchorTargetPlay(anchorMidi, targetMidi) {
  return [note(anchorMidi, 0.68), gap(0.22), note(targetMidi, 0.9)];
}

function targetOnlyPlay(targetMidi) {
  return [note(targetMidi, 0.9)];
}

function calibrationPlay() {
  const steps = [];
  for (let i = 0; i < CALIBRATION_MIDIS.length; i++) {
    steps.push(note(CALIBRATION_MIDIS[i], 0.42, { cue: CALIBRATION_CUES[i] }));
    if (i < CALIBRATION_MIDIS.length - 1) steps.push(gap(0.08));
  }
  // ミのrelease完了後、短い無音の着地でready cueを読める時間だけ残す
  steps.push(gap(READY_HOLD_SECONDS, { cue: READY_CUE, ready: true }));
  return steps;
}

function sciNameOf(midi, accidental) {
  const names = noteNamesFor('abc', accidental === 'flat' ? 'flat' : 'sharp');
  const octave = Math.floor(midi / 12) - 1;
  return `${names[pcOf(midi)]}${octave}`;
}

function pitchOptions(style, tones) {
  const accidental = tones === 'flat' ? 'flat' : 'sharp';
  const names = noteNamesFor(style, accidental);
  if (tones === 'white') {
    return WHITE_PCS.map((pc) => ({ value: pc, label: names[pc] }));
  }
  return [...Array(12).keys()].map((pc) => ({ value: pc, label: names[pc] }));
}

function makeQuestion({ targetMidi, style, tones, openEach }) {
  const mapped = mapTarget(targetMidi);
  const targetPc = pcOf(targetMidi);
  const options = pitchOptions(style, tones);
  const correct =
    tones === 'white' ? WHITE_PCS.indexOf(targetPc) : options.findIndex((o) => o.value === targetPc);
  const pcLabel = options[correct].label;
  const accidental = tones === 'flat' ? 'flat' : 'sharp';
  const anchorLabel = noteNamesFor(style, accidental)[pcOf(mapped.anchorMidi)];
  const sciName = sciNameOf(targetMidi, accidental);
  const play = openEach === 'on' ? anchorTargetPlay(mapped.anchorMidi, targetMidi) : targetOnlyPlay(targetMidi);

  return {
    play,
    prompt: '最後の1音の名前は？',
    context: `基準：${mapped.stringName}の${anchorLabel}`,
    input: {
      kind: 'buttons',
      layout: tones === 'white' ? 'pc7' : null,
      cols: tones === 'white' ? undefined : 3,
      options,
      correct,
    },
    feedbackFx: true,
    correctFx: 'otoCorrect',
    streakFx: 'otoStreak',
    wrongFx: 'otoWrong',
    rewardBurst: true,
    feedbackPlayOnWrong: anchorTargetPlay(mapped.anchorMidi, targetMidi),
    replay: true,
    explain: `${pcLabel}（${sciName}・${mapped.mappingLabel}）`,
    detail: {
      modeId: 'oto-ate',
      rangeId: null,
      tones,
      openEach,
      targetMidi,
      targetPc,
      anchorMidi: mapped.anchorMidi,
      stringIndex: mapped.stringIndex,
      stringName: mapped.stringName,
      finger: mapped.finger,
      mappingLabel: mapped.mappingLabel,
      sciName,
    },
  };
}

export default {
  id: 'oto-ate',
  title: '音当て',
  subtitle: '開放弦を基準に、音名を当てる',
  icon: 'assets/modes/oto-ate.png',
  color: '#7ec8ff',
  setup: [
    {
      key: 'range',
      label: '音域',
      layout: 'panels',
      hint:
        'STARTでソ・レ・ラ・ミを一度確認。最後の音名を答える、開放弦との距離を使う相対音感練習です（絶対音感テストではありません）。',
      options: RANGE_OPTIONS.map(({ value, label, sub }) => ({ value, label, sub })),
      default: '7',
    },
    {
      key: 'tones',
      label: '使う音・表記',
      layout: 'panels',
      options: [
        { value: 'white', label: '白鍵のみ', sub: '自然音だけを出題。答えは7択' },
        { value: 'sharp', label: '♯系', sub: '範囲内の全半音。♯表記の12択（3列）' },
        { value: 'flat', label: '♭系', sub: '範囲内の全半音。♭表記の12択（3列）' },
      ],
      default: 'white',
    },
    {
      key: 'openEach',
      label: '毎問の開放弦',
      layout: 'panels',
      options: [
        { value: 'on', label: 'ON', sub: '毎問・もう一度で開放弦→問題音' },
        { value: 'off', label: 'OFF', sub: '出題は問題音だけ。誤答確認は開放弦→問題音' },
      ],
      default: 'on',
    },
  ],
  recordBetter: 'high',
  completionFx: { normal: 'otoComplete', newBest: 'otoCompleteBest' },
  record(summary) {
    const accuracy = summary && typeof summary.accuracy === 'number' ? summary.accuracy : 0;
    return { value: accuracy, display: `${Math.round(accuracy * 100)}%` };
  },
  normalizeConfig(config) {
    if (!config || typeof config !== 'object') return config;
    config.range = resolveRange(config);
    config.tones = resolveTones(config);
    config.openEach = resolveOpenEach(config);
    delete config.stage;
    delete config.accidental;
    return config;
  },
  needsFingerboard: false,
  createRound(config = {}, rng, opts = {}) {
    const style = opts.noteStyle || opts.settings?.noteStyle || 'doremi';
    const rangeId = resolveRange(config);
    const tones = resolveTones(config);
    const openEach = resolveOpenEach(config);
    const pool = buildPool(rangeId, tones);
    const total = resolveQuestionCount(opts.settings);
    const deck = createTargetDeck(pool, rng);
    let asked = 0;
    let correctCount = 0;

    return {
      total,
      intro: {
        play: calibrationPlay(),
      },
      next(prevCorrect) {
        if (asked > 0 && prevCorrect) correctCount++;
        if (asked >= total) return null;
        asked++;
        const targetMidi = deck.next();
        const question = makeQuestion({ targetMidi, style, tones, openEach });
        question.detail.rangeId = rangeId;
        return question;
      },
      summary() {
        const accuracy = total ? correctCount / total : 0;
        return {
          accuracy,
          detail: `${correctCount}/${total}問正解`,
        };
      },
    };
  },
};
