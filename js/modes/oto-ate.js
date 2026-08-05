// 音当て: 開放弦を基準に、バイオリン第1ポジションの音名を当てる練習
import { noteNamesFor, noteNameWithOctave, STRINGS, positionsForString, WHITE_PCS } from '../theory.js?v=0805a1';
import { resolveQuestionCount } from '../identity.js?v=0805a1';
import { shuffle } from '../engine.js?v=0805a1';

export const RANGE_OPTIONS = [
  {
    value: '7',
    label: '7音',
    sub: 'C4〜B4の自然音',
    pool: [60, 62, 64, 65, 67, 69, 71],
  },
  {
    value: '2oct',
    label: '2オクターブ',
    sub: '同じ音名を高さ違いで聴く（オクターブ番号は答えない）',
    pool: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83],
  },
  {
    value: 'violin',
    label: 'バイオリン音域',
    sub: '第1ポジションの自然音。音名のみ答える',
    pool: [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83],
  },
];

const RANGE_BY_ID = Object.fromEntries(RANGE_OPTIONS.map((r) => [r.value, r]));
const VALID_RANGES = new Set(RANGE_OPTIONS.map((r) => r.value));

/** 境界の開放弦は新しい弦側に属する */
export const STRING_NATURALS = [
  [55, 57, 59, 60], // G
  [62, 64, 65, 67], // D
  [69, 71, 72, 74], // A
  [76, 77, 79, 81, 83], // E
];

export const CALIBRATION_MIDIS = [55, 62, 69, 76];

function pcOf(midi) {
  return ((midi % 12) + 12) % 12;
}

export function resolveRange(config) {
  const value = config?.range;
  return VALID_RANGES.has(value) ? value : '7';
}

export function mapTarget(midi) {
  for (let stringIndex = 0; stringIndex < STRING_NATURALS.length; stringIndex++) {
    if (!STRING_NATURALS[stringIndex].includes(midi)) continue;
    const pos = positionsForString(stringIndex).find((p) => p.midi === midi);
    if (!pos) break;
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
  throw new Error(`unmapped oto-ate target midi: ${midi}`);
}

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

function note(midi, dur) {
  return { type: 'note', midi, dur };
}

function gap(dur) {
  return { type: 'gap', dur };
}

function anchorTargetPlay(anchorMidi, targetMidi) {
  return [note(anchorMidi, 0.68), gap(0.22), note(targetMidi, 0.9)];
}

function calibrationPlay() {
  const steps = [];
  for (let i = 0; i < CALIBRATION_MIDIS.length; i++) {
    steps.push(note(CALIBRATION_MIDIS[i], 0.42));
    if (i < CALIBRATION_MIDIS.length - 1) steps.push(gap(0.08));
  }
  steps.push(gap(0.35));
  return steps;
}

function pitchClassOptions(style) {
  const names = noteNamesFor(style, 'sharp');
  return WHITE_PCS.map((pc) => ({ value: pc, label: names[pc] }));
}

function makeQuestion({ targetMidi, style, firstOfRound }) {
  const mapped = mapTarget(targetMidi);
  const targetPc = pcOf(targetMidi);
  const options = pitchClassOptions(style);
  const correct = WHITE_PCS.indexOf(targetPc);
  const pcLabel = options[correct].label;
  const anchorLabel = noteNamesFor(style, 'sharp')[pcOf(mapped.anchorMidi)];
  const sciName = noteNameWithOctave(targetMidi, 'abc');
  const play = firstOfRound
    ? [...calibrationPlay(), ...anchorTargetPlay(mapped.anchorMidi, targetMidi)]
    : anchorTargetPlay(mapped.anchorMidi, targetMidi);

  return {
    play,
    prompt: '最後の1音の名前は？',
    context: `基準：${mapped.stringName}の${anchorLabel}`,
    input: { kind: 'buttons', layout: 'pc7', options, correct },
    feedbackFx: false,
    feedbackPlayOnWrong: anchorTargetPlay(mapped.anchorMidi, targetMidi),
    replay: true,
    explain: `${pcLabel}（${sciName}・${mapped.mappingLabel}）`,
    detail: {
      modeId: 'oto-ate',
      rangeId: null,
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
        '最初に4本の開放弦の高さを一度確認します。その後は毎問、問題音を弾く弦の開放音→問題音の順に鳴ります。最後の1音の名前を答えてください。開放弦との距離を使う、バイオリン向けの練習です。基準なしで当てる絶対音感テストではありません。',
      options: RANGE_OPTIONS.map(({ value, label, sub }) => ({ value, label, sub })),
      default: '7',
    },
  ],
  recordBetter: 'high',
  record(summary) {
    const accuracy = summary && typeof summary.accuracy === 'number' ? summary.accuracy : 0;
    return { value: accuracy, display: `${Math.round(accuracy * 100)}%` };
  },
  normalizeConfig(config) {
    if (!config || typeof config !== 'object') return config;
    config.range = resolveRange(config);
    delete config.stage;
    delete config.accidental;
    return config;
  },
  needsFingerboard: false,
  createRound(config = {}, rng, opts = {}) {
    const style = opts.noteStyle || opts.settings?.noteStyle || 'doremi';
    const rangeId = resolveRange(config);
    const range = RANGE_BY_ID[rangeId];
    const total = resolveQuestionCount(opts.settings);
    const deck = createTargetDeck(range.pool, rng);
    let asked = 0;
    let correctCount = 0;

    return {
      total,
      next(prevCorrect) {
        if (asked > 0 && prevCorrect) correctCount++;
        if (asked >= total) return null;
        asked++;
        const targetMidi = deck.next();
        const question = makeQuestion({
          targetMidi,
          style,
          firstOfRound: asked === 1,
        });
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
