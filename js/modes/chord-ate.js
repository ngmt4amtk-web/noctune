// 和音当て: 2和音（音程）／3和音（triad品質）。固定ルートC4・ブロック同時。
import { shuffle } from '../engine.js';

const ROOT_MIDI = 60;
const TOTAL = 10;

const DYADS = [
  { id: 'm3', label: '短3度', semitones: [0, 3] },
  { id: 'M3', label: '長3度', semitones: [0, 4] },
  { id: 'P5', label: '完全5度', semitones: [0, 7] },
  { id: 'P8', label: 'オクターブ', semitones: [0, 12] },
];

const TRIADS = [
  { id: 'major', label: 'メジャー', semitones: [0, 4, 7] },
  { id: 'minor', label: 'マイナー', semitones: [0, 3, 7] },
];

function buildDeck(pool, total, rng) {
  const deck = [];
  while (deck.length < total) {
    for (const item of shuffle(pool, rng)) {
      if (deck.length >= total) break;
      deck.push(item);
    }
  }
  // 連続同一を軽く崩す
  for (let i = 1; i < deck.length; i++) {
    if (deck[i].id === deck[i - 1].id) {
      for (let j = i + 1; j < deck.length; j++) {
        if (deck[j].id !== deck[i].id) {
          const tmp = deck[i];
          deck[i] = deck[j];
          deck[j] = tmp;
          break;
        }
      }
    }
  }
  return deck;
}

export default {
  id: 'chord-ate',
  title: '和音当て',
  subtitle: '重なりのひびきを当てる',
  icon: '♫',
  color: '#5ec8a7',
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
  createRound(config = {}, rng) {
    const size = Number(config.size) === 3 ? 3 : 2;
    const pool = size === 3 ? TRIADS : DYADS;
    const options = pool.map((p) => p.label);
    const deck = buildDeck(pool, TOTAL, rng);
    let idx = 0;
    let answered = 0;
    let correctCount = 0;

    return {
      total: TOTAL,
      next(prevCorrect) {
        if (prevCorrect !== null && prevCorrect !== undefined) {
          answered++;
          if (prevCorrect) correctCount++;
        }
        if (idx >= TOTAL) return null;
        const item = deck[idx++];
        const correct = pool.findIndex((p) => p.id === item.id);
        return {
          play: [
            {
              type: 'chord',
              notes: item.semitones.map((n) => ({ midi: ROOT_MIDI + n })),
              dur: 1.6,
            },
          ],
          prompt: size === 3 ? 'この3和音は？' : 'この2和音は？',
          input: { kind: 'buttons', options: options.slice(), correct },
          explain: `答えは「${item.label}」`,
          replay: true,
        };
      },
      summary() {
        const accuracy = answered ? correctCount / answered : 0;
        return { accuracy, detail: `${correctCount}/${answered || TOTAL}問正解` };
      },
    };
  },
};
