// 音当て: 単音を聴いて音名を当てる
import { NOTE_NAMES_DOREMI, NOTE_NAMES_ABC } from '../theory.js';

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

const RANGES = {
  mid: midiRange(60, 71),
  wide: midiRange(55, 76),
  '2oct': midiRange(60, 83),
};

const TOTAL = 10;

export default {
  id: 'oto-ate',
  title: '音当て',
  subtitle: '単音の音名を当てる',
  icon: 'assets/modes/oto-ate.png',
  color: '#7ec8ff',
  setup: [
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
    const names = style === 'abc' ? NOTE_NAMES_ABC : NOTE_NAMES_DOREMI;
    const pool = RANGES[config.range] || RANGES.mid;
    let asked = 0;
    let correctCount = 0;
    let prevPc = null;
    return {
      total: TOTAL,
      next(prevCorrect) {
        if (prevCorrect) correctCount++;
        if (asked >= TOTAL) return null;
        asked++;
        const targetMidi = pickDifferentMidi(pool, prevPc, rng);
        const pc = ((targetMidi % 12) + 12) % 12;
        prevPc = pc;
        return {
          play: [{ type: 'note', midi: targetMidi, dur: 1.2 }],
          prompt: 'この音は？',
          input: { kind: 'buttons', options: names.slice(), correct: pc },
          explain: `答えは「${names[pc]}」`,
          replay: true,
          detail: { modeId: 'oto-ate', targetMidi, targetPc: pc },
        };
      },
      summary() {
        const accuracy = TOTAL ? correctCount / TOTAL : 0;
        return { accuracy, detail: `${correctCount}/${TOTAL}問正解` };
      },
    };
  },
};
