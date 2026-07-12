// 和音当て: 同時に鳴る構成音の音名（ピッチクラス）を当てる
import { NOTE_NAMES_DOREMI, NOTE_NAMES_ABC } from '../theory.js';

const TOTAL = 10;
const MIDI_MIN = 48;
const MIDI_MAX = 71;

function pcOf(midi) {
  return ((midi % 12) + 12) % 12;
}

function pickChordMidis(size, rng) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const midis = [];
    const pcs = new Set();
    while (midis.length < size) {
      const m = MIDI_MIN + Math.floor(rng() * (MIDI_MAX - MIDI_MIN + 1));
      const pc = pcOf(m);
      if (pcs.has(pc)) continue;
      pcs.add(pc);
      midis.push(m);
    }
    midis.sort((a, b) => a - b);
    const span = midis[midis.length - 1] - midis[0];
    if (size === 2 && span >= 3 && span <= 19) return midis;
    if (size === 3 && span >= 6 && span <= 19) return midis;
  }
  return size === 3 ? [60, 64, 67] : [60, 67];
}

function samePcSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

export default {
  id: 'chord-ate',
  title: '和音当て',
  subtitle: '鳴っている音名を当てる',
  icon: '♫',
  color: '#5eb8c8',
  setup: [
    {
      key: 'size',
      label: '音の数',
      options: [
        { value: 2, label: '2和音' },
        { value: 3, label: '3和音' },
      ],
      default: 2,
    },
  ],
  recordBetter: 'high',
  record(summary) {
    const acc = summary && typeof summary.accuracy === 'number' ? summary.accuracy : 0;
    return { value: acc, display: `${Math.round(acc * 100)}%` };
  },
  needsFingerboard: false,
  createRound(config = {}, rng, opts = {}) {
    const size = Number(config.size) === 3 ? 3 : 2;
    const style = opts.noteStyle || opts.settings?.noteStyle || 'doremi';
    const names = style === 'abc' ? NOTE_NAMES_ABC : NOTE_NAMES_DOREMI;
    const options = names.map((label, pc) => ({ pc, label }));
    let asked = 0;
    let correctCount = 0;
    let prevKey = '';

    return {
      total: TOTAL,
      next(prevCorrect) {
        if (prevCorrect) correctCount++;
        if (asked >= TOTAL) return null;
        asked++;

        let midis;
        let key;
        for (let t = 0; t < 20; t++) {
          midis = pickChordMidis(size, rng);
          key = midis.map(pcOf).sort((a, b) => a - b).join(',');
          if (key !== prevKey) break;
        }
        prevKey = key;
        const correctPcs = midis.map(pcOf).sort((a, b) => a - b);
        const labelStr = correctPcs.map((pc) => names[pc]).join('・');

        return {
          play: [{ type: 'chord', notes: midis.map((midi) => ({ midi })), dur: 1.6 }],
          prompt: size === 3 ? '鳴っている3音は？' : '鳴っている2音は？',
          input: {
            kind: 'pitch-set',
            options,
            requiredCount: size,
            correctPcs,
            submitLabel: '答える',
          },
          explain: `鳴っていたのは「${labelStr}」`,
          replay: true,
          detail: {
            modeId: 'chord-ate',
            noteCount: size,
            targetMidis: midis.slice(),
            targetPcs: correctPcs.slice(),
          },
          grade(response) {
            return samePcSet((response && response.pcs) || [], correctPcs);
          },
        };
      },
      summary() {
        const accuracy = TOTAL ? correctCount / TOTAL : 0;
        return { accuracy, detail: `${correctCount}/${TOTAL}問正解` };
      },
    };
  },
};
