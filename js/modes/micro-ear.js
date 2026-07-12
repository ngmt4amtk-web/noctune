// ミクロ耳: セント微差の2AFC弁別
import { Staircase } from '../engine.js';

const TOTAL = 14;
const OPTIONS = ['高い', '低い'];
const STARTS = { easy: 50, normal: 25, hard: 10, oni: 5 };

function fmtCents(c) {
  if (Number.isInteger(c) || c >= 10) return String(Math.round(c));
  return c.toFixed(1);
}

export default {
  id: 'micro-ear',
  title: '音程比較',
  subtitle: '小さなズレを聴き分ける',
  icon: '↕',
  color: '#6aa8ff',
  setup: [
    {
      key: 'start',
      label: 'スタートの差',
      options: [
        { value: 'easy', label: 'やさしい（50¢）' },
        { value: 'normal', label: 'ふつう（25¢）' },
        { value: 'hard', label: 'むずかしい（10¢）' },
        { value: 'oni', label: '鬼（5¢）' },
      ],
      default: 'normal',
    },
  ],
  recordBetter: 'low',
  record(summary) {
    const best = summary ? summary.best : null;
    if (best === null || best === undefined) return null;
    return { value: best, display: `${fmtCents(best)}セント` };
  },
  needsFingerboard: false,

  createRound(config = {}, rng) {
    const start = STARTS[config.start] || STARTS.normal;
    const sc = new Staircase({ start, min: 1.5, max: 60, down: 0.7, up: 1.5 });
    let asked = 0;
    let correctCount = 0;
    const dirs = [];
    let prevRef = null;

    function pickRefMidi() {
      for (let tries = 0; tries < 20; tries++) {
        const m = 60 + Math.floor(rng() * 10);
        if (m !== prevRef) return m;
      }
      return 60 + Math.floor(rng() * 10);
    }

    return {
      total: TOTAL,
      next(prevCorrect) {
        if (prevCorrect !== null && prevCorrect !== undefined) {
          sc.report(prevCorrect);
          if (prevCorrect) correctCount++;
        }
        if (asked >= TOTAL) return null;
        asked++;

        const cents = sc.current;
        let high;
        const n = dirs.length;
        if (n >= 3 && dirs[n - 1] === dirs[n - 2] && dirs[n - 2] === dirs[n - 3]) {
          high = !dirs[n - 1];
        } else {
          high = rng() < 0.5;
        }
        dirs.push(high);

        const refMidi = pickRefMidi();
        prevRef = refMidi;
        const signed = high ? cents : -cents;
        const disp = fmtCents(cents);
        return {
          play: [
            { type: 'note', midi: refMidi, dur: 1.0 },
            { type: 'gap', dur: 0.3 },
            { type: 'note', midi: refMidi, cents: signed, dur: 1.0 },
          ],
          prompt: '2番目の音は 1番目より？',
          input: { kind: 'buttons', options: OPTIONS, correct: high ? 0 : 1 },
          explain: high ? `+${disp}セント高かった` : `−${disp}セント低かった`,
          replay: false,
          detail: {
            modeId: 'micro-ear',
            referenceMidi: refMidi,
            deltaCents: cents,
            direction: high ? 'higher' : 'lower',
          },
        };
      },
      summary() {
        const accuracy = asked ? correctCount / asked : 0;
        const best = sc.best;
        const bestStr = best === null ? '—' : best.toFixed(1);
        return { accuracy, best, detail: `到達 ${bestStr} セント` };
      },
    };
  },
};
