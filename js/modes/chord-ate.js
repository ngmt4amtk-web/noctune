// 和音当て: 構成音の音名当て。出題は和声的（コード）／フリー選択可
import { NOTE_NAMES_DOREMI, NOTE_NAMES_ABC } from '../theory.js?v=0713a4';
import { resolveQuestionCount } from '../identity.js?v=0713a4';

const MIDI_MIN = 48;
const MIDI_MAX = 71;

const HARMONIC_CHORDS = [
  { id: 'maj', name: '長三和音', intervals: [0, 4, 7] },
  { id: 'min', name: '短三和音', intervals: [0, 3, 7] },
  { id: 'dim', name: '減三和音', intervals: [0, 3, 6] },
  { id: 'sus4', name: 'sus4', intervals: [0, 5, 7] },
];

function pcOf(midi) {
  return ((midi % 12) + 12) % 12;
}

function samePcSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function placeChord(rootPc, intervals, rng) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const inversion = Math.floor(rng() * intervals.length);
    const rotated = intervals.slice(inversion).concat(intervals.slice(0, inversion));
    const bassPc = (rootPc + rotated[0]) % 12;
    const base = MIDI_MIN + Math.floor(rng() * 12);
    let cursor = base - (base % 12) + bassPc;
    if (cursor < MIDI_MIN) cursor += 12;
    if (cursor > MIDI_MAX) cursor -= 12;
    const midis = [cursor];
    for (let i = 1; i < rotated.length; i++) {
      const wantPc = (rootPc + rotated[i]) % 12;
      let next = midis[midis.length - 1] - (midis[midis.length - 1] % 12) + wantPc;
      while (next <= midis[midis.length - 1]) next += 12;
      midis.push(next);
    }
    if (midis.every((m) => m >= MIDI_MIN && m <= MIDI_MAX)) {
      const span = midis[midis.length - 1] - midis[0];
      if (span >= 6 && span <= 19) return midis;
    }
  }
  // フォールバック root C maj
  return [60, 64, 67];
}

function pickFreeMidis(size, rng) {
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

function rolesFor(rootPc, intervals, midis) {
  const map = {};
  for (const iv of intervals) map[(rootPc + iv) % 12] = iv;
  const roleName = { 0: '根音', 3: '第3音', 4: '第3音', 5: '第4音', 6: '第5音', 7: '第5音' };
  return midis.map((m) => {
    const pc = pcOf(m);
    const iv = map[pc];
    return { pc, role: roleName[iv] || '構成音' };
  });
}

export default {
  id: 'chord-ate',
  title: '和音当て',
  subtitle: 'コードの構成音を当てる',
  icon: 'assets/modes/chord-ate.png',
  color: '#5eb8c8',
  setup: [
    {
      key: 'gen',
      label: '出題タイプ',
      layout: 'panels',
      options: [
        { value: 'harmonic', label: '和声的', sub: 'コードの構成音だけ鳴る' },
        { value: 'free', label: 'フリー', sub: '任意の音の組み合わせ' },
      ],
      default: 'harmonic',
    },
    {
      key: 'size',
      label: '音の数',
      layout: 'panels',
      options: [
        { value: 2, label: '2和音', sub: 'フリー時のみ' },
        { value: 3, label: '3和音', sub: '標準' },
      ],
      default: 3,
      disableWhen: { gen: 'harmonic', values: [2], reason: '和声的は三和音（3音）固定' },
    },
  ],
  recordBetter: 'high',
  record(summary) {
    const acc = summary && typeof summary.accuracy === 'number' ? summary.accuracy : 0;
    return { value: acc, display: `${Math.round(acc * 100)}%` };
  },
  needsFingerboard: false,
  createRound(config = {}, rng, opts = {}) {
    const gen = config.gen === 'free' ? 'free' : 'harmonic';
    const size = gen === 'harmonic' ? 3 : Number(config.size) === 2 ? 2 : 3;
    const style = opts.noteStyle || opts.settings?.noteStyle || 'doremi';
    const names = style === 'abc' ? NOTE_NAMES_ABC : NOTE_NAMES_DOREMI;
    const options = names.map((label, pc) => ({ pc, label }));
    const total = resolveQuestionCount(opts.settings);
    let asked = 0;
    let correctCount = 0;
    let prevKey = '';

    return {
      total,
      next(prevCorrect) {
        if (prevCorrect) correctCount++;
        if (asked >= total) return null;
        asked++;

        let midis;
        let chordMeta = null;
        let key = '';
        for (let t = 0; t < 24; t++) {
          if (gen === 'harmonic') {
            const chord = HARMONIC_CHORDS[Math.floor(rng() * HARMONIC_CHORDS.length)];
            const rootPc = Math.floor(rng() * 12);
            midis = placeChord(rootPc, chord.intervals, rng);
            chordMeta = {
              chordId: chord.id,
              chordName: chord.name,
              rootPc,
              roles: rolesFor(rootPc, chord.intervals, midis),
            };
          } else {
            midis = pickFreeMidis(size, rng);
            chordMeta = null;
          }
          key = midis.map(pcOf).sort((a, b) => a - b).join(',');
          if (key !== prevKey) break;
        }
        prevKey = key;
        const correctPcs = midis.map(pcOf).sort((a, b) => a - b);
        const labelStr = correctPcs.map((pc) => names[pc]).join('・');
        const explainExtra = chordMeta ? `（${names[chordMeta.rootPc]}の${chordMeta.chordName}）` : '';

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
          explain: `鳴っていたのは「${labelStr}」${explainExtra}`,
          replay: true,
          detail: {
            modeId: 'chord-ate',
            gen,
            noteCount: size,
            targetMidis: midis.slice(),
            targetPcs: correctPcs.slice(),
            chord: chordMeta,
          },
          grade(response) {
            return samePcSet((response && response.pcs) || [], correctPcs);
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
