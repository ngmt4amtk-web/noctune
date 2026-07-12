// 音当て: 単音を聴いて音名を当てる
import { noteNamesFor, WHITE_PCS } from '../theory.js?v=0713a3';
import { resolveQuestionCount } from '../identity.js?v=0713a3';

function pickDifferentMidi(pool, prevPc, rng) {
  if (pool.length <= 1) return pool[0];
  let pick;
  for (let tries = 0; tries < 20; tries++) {
    pick = pool[Math.floor(rng() * pool.length)];
    if (((pick % 12) + 12) % 12 !== prevPc) return pick;
  }
  return pick;
}

function midiRange(a, b) {
  const out = [];
  for (let m = a; m <= b; m++) out.push(m);
  return out;
}

function pcOf(midi) {
  return ((midi % 12) + 12) % 12;
}

const RANGES = {
  mid: midiRange(60, 71),
  wide: midiRange(55, 76),
  '2oct': midiRange(60, 83),
};

function resolveAccidental(config) {
  const v = config?.accidental;
  return v === 'none' || v === 'flat' || v === 'sharp' ? v : 'sharp';
}

export default {
  id: 'oto-ate',
  title: '音当て',
  subtitle: '単音の音名を当てる',
  icon: 'assets/modes/oto-ate.png',
  color: '#7ec8ff',
  setup: [
    {
      key: 'accidental',
      label: '臨時記号',
      layout: 'panels',
      options: [
        { value: 'none', label: '記号なし', sub: '白鍵だけ' },
        { value: 'sharp', label: 'シャープあり', sub: '♯表記' },
        { value: 'flat', label: 'フラットあり', sub: '♭表記' },
      ],
      default: 'sharp',
    },
    {
      key: 'range',
      label: '音域',
      layout: 'panels',
      options: [
        { value: 'mid', label: '中央', sub: 'ド4〜シ4' },
        { value: 'wide', label: '広め', sub: 'ソ3〜ミ5' },
        { value: '2oct', label: '2オクターブ', sub: 'ド4〜シ5' },
      ],
      default: 'mid',
    },
  ],
  recordBetter: 'high',
  record(summary) {
    const acc = summary && typeof summary.accuracy === 'number' ? summary.accuracy : 0;
    return { value: acc, display: `${Math.round(acc * 100)}%` };
  },
  needsFingerboard: false,
  createRound(config = {}, rng, opts = {}) {
    const style = opts.noteStyle || opts.settings?.noteStyle || 'doremi';
    const accidental = resolveAccidental(config);
    const allNames = noteNamesFor(style, accidental === 'flat' ? 'flat' : 'sharp');
    let pool = RANGES[config.range] || RANGES.mid;
    let optionPcs;
    let options;
    if (accidental === 'none') {
      pool = pool.filter((m) => WHITE_PCS.includes(pcOf(m)));
      optionPcs = WHITE_PCS.slice();
      options = optionPcs.map((pc) => allNames[pc]);
    } else {
      optionPcs = [...Array(12).keys()];
      options = allNames.slice();
    }
    const total = resolveQuestionCount(opts.settings);
    let asked = 0;
    let correctCount = 0;
    let prevPc = null;
    return {
      total,
      next(prevCorrect) {
        if (prevCorrect) correctCount++;
        if (asked >= total) return null;
        asked++;
        const targetMidi = pickDifferentMidi(pool, prevPc, rng);
        const pc = pcOf(targetMidi);
        prevPc = pc;
        const correct = optionPcs.indexOf(pc);
        const label = options[correct];
        return {
          play: [{ type: 'note', midi: targetMidi, dur: 1.2 }],
          prompt: 'この音は？',
          input: { kind: 'buttons', options: options.slice(), correct },
          explain: `答えは「${label}」`,
          replay: true,
          detail: {
            modeId: 'oto-ate',
            targetMidi,
            targetPc: pc,
            accidental,
          },
        };
      },
      summary() {
        const accuracy = total ? correctCount / total : 0;
        return { accuracy, detail: `${correctCount}/${total}問正解` };
      },
    };
  },
};
