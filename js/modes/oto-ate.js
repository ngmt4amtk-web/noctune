// 音当て: 基準音・調性文脈から最後の音名を導く相対音感トレーニング
import { noteNamesFor } from '../theory.js?v=0728a1';
import { resolveQuestionCount } from '../identity.js?v=0728a1';

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const CHROMATIC = [...Array(12).keys()];

export const OTO_LEVELS = [
  { id: 'direction', label: '音の向き', sub: '高い・同じ・低い', intervals: null },
  { id: 'triad', label: '3音', sub: '主音・3番目・5番目', intervals: [0, 4, 7] },
  { id: 'penta', label: '5音', sub: 'すき間の広い5音', intervals: [0, 2, 4, 7, 9] },
  { id: 'diatonic', label: '7音', sub: '長音階のすべて', intervals: MAJOR_SCALE },
  { id: 'chromatic', label: '12音', sub: '半音を含むすべて', intervals: CHROMATIC },
];

const LEVEL_INDEX = Object.fromEntries(OTO_LEVELS.map((level, index) => [level.id, index]));
const ROOT_PCS = {
  none: [0],
  sharp: [0, 7, 2, 9, 4],
  flat: [0, 5, 10, 3, 8],
};

function pcOf(midi) {
  return ((midi % 12) + 12) % 12;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function choose(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function resolveAccidental(config) {
  const value = config?.accidental;
  return value === 'none' || value === 'flat' || value === 'sharp' ? value : 'none';
}

function resolveStage(config) {
  const value = config?.stage;
  return value === 'auto' || Object.hasOwn(LEVEL_INDEX, value) ? value : 'auto';
}

function pitchOption(pc, names) {
  return { value: pc, label: names[pc] };
}

function noteStep(midi, dur = 0.3, gap = 0.035) {
  return { freq: null, midi, dur, gap };
}

function cadence(rootMidi, targetMidi) {
  const chord = (offset) => ({
    type: 'chord',
    notes: [0, 4, 7].map((semi) => ({ midi: rootMidi + offset + semi })),
    dur: 0.34,
    vol: 0.42,
  });
  return [
    chord(0),
    { type: 'gap', dur: 0.055 },
    chord(5),
    { type: 'gap', dur: 0.055 },
    chord(7),
    { type: 'gap', dur: 0.055 },
    { ...chord(0), dur: 0.52 },
    { type: 'gap', dur: 0.22 },
    { type: 'note', midi: targetMidi, dur: 0.9 },
  ];
}

function guideFromScale(rootMidi, targetMidi, interval) {
  const degreeIndex = MAJOR_SCALE.indexOf(interval);
  const semitones = degreeIndex >= 0 ? MAJOR_SCALE.slice(0, degreeIndex + 1) : [0, interval];
  if (semitones.length === 1) semitones.push(0);
  return [
    {
      type: 'seq',
      notes: semitones.map((semi) => noteStep(rootMidi + 12 + semi)),
    },
    { type: 'gap', dur: 0.12 },
    { type: 'note', midi: targetMidi, dur: 0.75 },
  ];
}

function guideChromatic(anchorMidi, targetMidi, interval) {
  const semitones = [...Array(interval + 1).keys()];
  if (semitones.length === 1) semitones.push(0);
  return [
    {
      type: 'seq',
      notes: semitones.map((semi) => noteStep(anchorMidi + semi, 0.24, 0.025)),
    },
    { type: 'gap', dur: 0.12 },
    { type: 'note', midi: targetMidi, dur: 0.75 },
  ];
}

function rootChoices(levelIndex, accidental) {
  const roots = ROOT_PCS[accidental] || ROOT_PCS.none;
  if (levelIndex <= 1 || roots.length === 1) return [roots[0]];
  if (levelIndex === 2) return roots.slice(0, Math.min(3, roots.length));
  return roots;
}

function makeDirectionQuestion(rng) {
  const anchorMidi = 62 + Math.floor(rng() * 8);
  const delta = choose([-7, -4, -2, 0, 2, 4, 7], rng);
  const targetMidi = anchorMidi + delta;
  const correct = delta < 0 ? 0 : delta > 0 ? 2 : 1;
  const label = ['低い', '同じ', '高い'][correct];
  return {
    play: [
      { type: 'note', midi: anchorMidi, dur: 0.68 },
      { type: 'gap', dur: 0.22 },
      { type: 'note', midi: targetMidi, dur: 0.9 },
    ],
    prompt: '次の音は、基準より？',
    context: '基準音 → 次の音',
    input: { kind: 'buttons', options: ['低い', '同じ', '高い'], correct },
    untilCorrect: true,
    assistanceCountsAsMiss: true,
    explain: `次の音は基準より「${label}」`,
    hint: `2音を比べると、答えは「${label}」です`,
    guideLabel: 'ゆっくり聴く',
    guidePlay: [
      { type: 'note', midi: anchorMidi, dur: 0.9 },
      { type: 'gap', dur: 0.42 },
      { type: 'note', midi: targetMidi, dur: 1.0 },
    ],
    replay: true,
    detail: {
      modeId: 'oto-ate',
      stageId: 'direction',
      stageLabel: OTO_LEVELS[0].label,
      anchorMidi,
      targetMidi,
      deltaSemitones: delta,
      targetPc: pcOf(targetMidi),
    },
  };
}

function makeTonalQuestion(levelIndex, accidental, style, prevTargetPc, rng) {
  const level = OTO_LEVELS[levelIndex];
  const names = noteNamesFor(style, accidental === 'flat' ? 'flat' : 'sharp');
  const roots = rootChoices(levelIndex, accidental);
  let rootPc = roots[0];
  let interval = level.intervals[0];
  let targetPc = pcOf(rootPc + interval);

  for (let tries = 0; tries < 20; tries++) {
    rootPc = choose(roots, rng);
    interval = choose(level.intervals, rng);
    targetPc = pcOf(rootPc + interval);
    if (targetPc !== prevTargetPc) break;
  }

  const rootMidi = 48 + rootPc;
  const targetMidi = rootMidi + 12 + interval;
  const options = level.intervals.map((semi) => pitchOption(pcOf(rootPc + semi), names));
  const correct = level.intervals.indexOf(interval);
  const rootLabel = names[rootPc];
  const targetLabel = names[targetPc];
  const degree = MAJOR_SCALE.indexOf(interval) + 1;

  return {
    play: cadence(rootMidi, targetMidi),
    prompt: '響きの最後の音は？',
    context: `主音 ${rootLabel}`,
    input: { kind: 'buttons', options, correct },
    untilCorrect: true,
    assistanceCountsAsMiss: true,
    explain: `主音 ${rootLabel} から${degree}番目、答えは「${targetLabel}」`,
    hint: `主音 ${rootLabel} から${degree}番目。答えは「${targetLabel}」です`,
    guideLabel: '音の道すじ',
    guidePlay: guideFromScale(rootMidi, targetMidi, interval),
    replay: true,
    detail: {
      modeId: 'oto-ate',
      stageId: level.id,
      stageLabel: level.label,
      rootMidi,
      rootPc,
      targetMidi,
      targetPc,
      intervalSemitones: interval,
      scaleDegree: degree,
      accidental,
    },
  };
}

function makeChromaticQuestion(accidental, style, prevTargetPc, rng) {
  const names = noteNamesFor(style, accidental === 'flat' ? 'flat' : 'sharp');
  let anchorPc = 0;
  let interval = 0;
  let targetPc = 0;
  for (let tries = 0; tries < 20; tries++) {
    anchorPc = Math.floor(rng() * 12);
    interval = Math.floor(rng() * 12);
    targetPc = pcOf(anchorPc + interval);
    if (targetPc !== prevTargetPc) break;
  }
  const anchorMidi = 60 + anchorPc;
  const targetMidi = anchorMidi + interval;
  const anchorLabel = names[anchorPc];
  const targetLabel = names[targetPc];
  const relation = interval === 0 ? '同じ高さ' : `半音${interval}個上`;

  return {
    play: [
      { type: 'note', midi: anchorMidi, dur: 0.68 },
      { type: 'gap', dur: 0.22 },
      { type: 'note', midi: targetMidi, dur: 0.9 },
    ],
    prompt: '次の音名は？',
    context: `基準音 ${anchorLabel}`,
    input: { kind: 'buttons', options: CHROMATIC.map((pc) => pitchOption(pc, names)), correct: targetPc },
    untilCorrect: true,
    assistanceCountsAsMiss: true,
    explain: `基準音 ${anchorLabel} から${relation}、答えは「${targetLabel}」`,
    hint: `基準音 ${anchorLabel} から${relation}。答えは「${targetLabel}」です`,
    guideLabel: '半音でたどる',
    guidePlay: guideChromatic(anchorMidi, targetMidi, interval),
    replay: true,
    detail: {
      modeId: 'oto-ate',
      stageId: 'chromatic',
      stageLabel: OTO_LEVELS[4].label,
      anchorMidi,
      anchorPc,
      targetMidi,
      targetPc,
      intervalSemitones: interval,
      accidental,
    },
  };
}

export default {
  id: 'oto-ate',
  title: '音当て',
  subtitle: '基準音から、少しずつ当てる',
  icon: 'assets/modes/oto-ate.png',
  color: '#7ec8ff',
  setup: [
    {
      key: 'stage',
      label: '練習段階',
      layout: 'panels',
      hint: '基準音との関係を聴く練習です。迷ったら「音の道すじ」で答えまで聴き直せます。',
      options: [
        { value: 'auto', label: 'おまかせ', sub: 'できたら3→5→7音。前回の続きから' },
        ...OTO_LEVELS.map((level) => ({ value: level.id, label: level.label, sub: level.sub })),
      ],
      disableWhen: { accidental: 'none', values: ['chromatic'], reason: '12音は臨時記号ありで使えます' },
      default: 'auto',
    },
    {
      key: 'accidental',
      label: '使う音',
      options: [
        { value: 'none', label: '白鍵のみ' },
        { value: 'sharp', label: '♯を含む' },
        { value: 'flat', label: '♭を含む' },
      ],
      default: 'none',
    },
  ],
  recordBetter: 'high',
  record(summary) {
    const accuracy = summary && typeof summary.accuracy === 'number' ? summary.accuracy : 0;
    return { value: accuracy, display: `${Math.round(accuracy * 100)}%` };
  },
  normalizeConfig(config) {
    if (config?.accidental === 'none' && config.stage === 'chromatic') config.stage = 'diatonic';
    return config;
  },
  updateProgress({ summary, state }) {
    if (!summary?.adaptive || !Number.isFinite(summary.autoLevelEnd)) return;
    if (!state.progress || typeof state.progress !== 'object') state.progress = {};
    state.progress['oto-ate'] = { autoLevel: clamp(Math.round(summary.autoLevelEnd), 0, OTO_LEVELS.length - 1) };
  },
  needsFingerboard: false,
  createRound(config = {}, rng, opts = {}) {
    const style = opts.noteStyle || opts.settings?.noteStyle || 'doremi';
    const accidental = resolveAccidental(config);
    const stage = resolveStage(config);
    const total = resolveQuestionCount(opts.settings);
    const adaptive = stage === 'auto';
    const maxLevel = accidental === 'none' ? LEVEL_INDEX.diatonic : LEVEL_INDEX.chromatic;
    let levelIndex = adaptive
      ? clamp(Math.round(opts.progress?.autoLevel || 0), 0, maxLevel)
      : clamp(LEVEL_INDEX[stage] ?? 0, 0, maxLevel);
    let asked = 0;
    let correctCount = 0;
    let correctStreak = 0;
    let prevTargetPc = null;

    return {
      total,
      next(prevCorrect) {
        if (asked > 0) {
          if (prevCorrect) {
            correctCount++;
            correctStreak++;
            const needed = levelIndex === LEVEL_INDEX.direction ? 1 : 2;
            if (adaptive && correctStreak >= needed && levelIndex < maxLevel) {
              levelIndex++;
              correctStreak = 0;
            }
          } else {
            correctStreak = 0;
            if (adaptive && levelIndex > LEVEL_INDEX.direction) levelIndex--;
          }
        }
        if (asked >= total) return null;
        asked++;

        let question;
        if (levelIndex === LEVEL_INDEX.direction) {
          question = makeDirectionQuestion(rng);
        } else if (levelIndex === LEVEL_INDEX.chromatic) {
          question = makeChromaticQuestion(accidental, style, prevTargetPc, rng);
        } else {
          question = makeTonalQuestion(levelIndex, accidental, style, prevTargetPc, rng);
        }
        prevTargetPc = question.detail.targetPc;
        return question;
      },
      summary() {
        const accuracy = total ? correctCount / total : 0;
        const suffix = adaptive ? `・次回は「${OTO_LEVELS[levelIndex].label}」から` : '';
        return {
          accuracy,
          detail: `${correctCount}/${total}問をヒントなしで正解${suffix}`,
          adaptive,
          autoLevelEnd: levelIndex,
        };
      },
    };
  },
};
