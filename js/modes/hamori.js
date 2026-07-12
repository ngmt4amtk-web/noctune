// ハモリ判定。純正とうなりを聴き分ける。ズレ幅はステアケース初期値のみ。
import { JI_RATIOS, beatRate, freqOfMidi, detune } from '../theory.js';
import { Staircase, shuffle, pickDifferent } from '../engine.js';
import { resolveQuestionCount } from '../identity.js';

const RATIO_JA = { P5: '完全5度', P8: 'オクターブ', P4: '完全4度', M3: '長3度', m3: '短3度' };
const ALL = ['P5', 'P8', 'P4', 'M3', 'm3'];
const HIBIKI = {
  P5: ['P5'],
  P8: ['P8'],
  P4: ['P4'],
  M3: ['M3'],
  m3: ['m3'],
  mix: ALL,
};
const START_CENTS = [40, 25, 10, 5];
const LOW_MIN = 55;
const LOW_MAX = 69;

function fmtCents(c) {
  if (Number.isInteger(c) || c >= 10) return String(Math.round(c));
  return c.toFixed(1);
}

function resolveStart(config) {
  const n = Number(config?.startCents);
  return START_CENTS.includes(n) ? n : 25;
}

export default {
  id: 'hamori',
  title: 'ハモリ判定',
  subtitle: 'きれい／キモいを当てる',
  icon: 'assets/modes/hamori.png',
  color: '#8b9cff',
  setup: [
    {
      key: 'hibiki',
      label: 'ひびき',
      options: [
        { value: 'P5', label: '完全5度' },
        { value: 'P8', label: 'オクターブ' },
        { value: 'P4', label: '完全4度' },
        { value: 'M3', label: '長3度' },
        { value: 'm3', label: '短3度' },
        { value: 'mix', label: 'ミックス' },
      ],
      default: 'P5',
    },
    {
      key: 'startCents',
      label: '最初のズレ幅',
      layout: 'panels',
      hint: '正解が続くと自動で細かくなる。ここで選ぶのは最初のズレ幅だけ。',
      options: [
        { value: 40, label: 'はじめて', sub: '40¢' },
        { value: 25, label: 'ふつう', sub: '25¢' },
        { value: 10, label: 'きびしい', sub: '10¢' },
        { value: 5, label: '極小', sub: '5¢' },
      ],
      default: 25,
    },
  ],
  recordBetter: 'low',
  record(summary) {
    const best = summary ? summary.best : null;
    if (best === null || best === undefined) return null;
    return { value: best, display: `${fmtCents(best)}セント` };
  },
  needsFingerboard: false,
  createRound(config = {}, rng, opts = {}) {
    const ratios = HIBIKI[config.hibiki] || HIBIKI.P5;
    const start = resolveStart(config);
    const sc = new Staircase({ start, min: 2, max: 40, down: 0.7, up: 1.5 });
    const total = resolveQuestionCount(opts.settings);
    const pureN = Math.ceil(total / 2);
    const misN = total - pureN;
    const types = shuffle([...Array(pureN).fill('pure'), ...Array(misN).fill('mis')], rng);
    let idx = 0;
    let prevRatio = null;
    let lastMis = false;
    let answered = 0;
    let correctCount = 0;

    function makeQuestion() {
      const type = types[idx++];
      const ratioName = pickDifferent(ratios, prevRatio, rng);
      prevRatio = ratioName;
      const [p, q] = JI_RATIOS[ratioName];
      const lowMidi = LOW_MIN + Math.floor(rng() * (LOW_MAX - LOW_MIN + 1));
      const cents2 = type === 'mis' ? (rng() < 0.5 ? -1 : 1) * sc.current : 0;
      lastMis = type === 'mis';

      const f1 = freqOfMidi(lowMidi);
      const f2 = detune((f1 * p) / q, cents2);
      const beat = beatRate(f1, f2, [p, q]);
      const ratioLabel = RATIO_JA[ratioName] || ratioName;
      const explain = type === 'mis'
        ? `${ratioLabel}・${cents2 > 0 ? '+' : '−'}${fmtCents(Math.abs(cents2))}セント → 約${beat.toFixed(1)}回/秒うなる`
        : `${ratioLabel}・純正。うなりゼロ`;

      return {
        play: [{ type: 'double', midi: lowMidi, interval: [p, q], cents2, dur: 2.2 }],
        prompt: 'このハモリは？',
        input: { kind: 'buttons', options: ['きれい', 'キモい'], correct: type === 'mis' ? 1 : 0 },
        explain,
        replay: true,
        detail: {
          modeId: 'hamori',
          lowMidi,
          ratioId: ratioName,
          ratio: [p, q],
          tuning: type === 'mis' ? 'mistuned' : 'pure',
          offsetCents: cents2,
          beatHz: beat,
        },
      };
    }

    return {
      total,
      next(prevCorrect) {
        if (prevCorrect !== null && prevCorrect !== undefined) {
          answered++;
          if (prevCorrect) correctCount++;
          if (lastMis) sc.report(prevCorrect);
        }
        if (idx >= total) return null;
        return makeQuestion();
      },
      summary() {
        const accuracy = answered ? correctCount / answered : 0;
        const best = sc.best;
        const bestTxt = best === null ? '—' : best.toFixed(1);
        return { accuracy, best, detail: `最小 ${bestTxt} セントまで聴き分けた` };
      },
    };
  },
};
