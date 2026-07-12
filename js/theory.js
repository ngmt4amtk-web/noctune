// 音理データ層。純粋関数のみ（DOM・Web Audio・localStorage禁止）

export const A4_DEFAULT = 442;

// 12平均律: midi69(A4) を基準に半音ごと2^(1/12)倍
export function freqOfMidi(midi, a4 = A4_DEFAULT) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

// セント差ぶんだけ周波数をずらす
export function detune(freq, cents) {
  return freq * Math.pow(2, cents / 1200);
}

// 2周波数間のセント差
export function centsBetween(f1, f2) {
  return 1200 * Math.log2(f2 / f1);
}

export const NOTE_NAMES_DOREMI = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
export const NOTE_NAMES_ABC = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NOTE_NAMES_DOREMI_FLAT = ['ド', 'レ♭', 'レ', 'ミ♭', 'ミ', 'ファ', 'ソ♭', 'ソ', 'ラ♭', 'ラ', 'シ♭', 'シ'];
export const NOTE_NAMES_ABC_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
/** 白鍵のピッチクラス（C D E F G A B） */
export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];

/**
 * @param {'doremi'|'abc'} style
 * @param {'none'|'sharp'|'flat'} accidental
 */
export function noteNamesFor(style = 'doremi', accidental = 'sharp') {
  if (accidental === 'flat') return style === 'abc' ? NOTE_NAMES_ABC_FLAT : NOTE_NAMES_DOREMI_FLAT;
  return style === 'abc' ? NOTE_NAMES_ABC : NOTE_NAMES_DOREMI;
}

function namesFor(style) {
  return noteNamesFor(style, 'sharp');
}

// オクターブ番号を除いた音名
export function noteName(midi, style = 'doremi') {
  const names = namesFor(style);
  const idx = ((midi % 12) + 12) % 12;
  return names[idx];
}

// 国際式オクターブ番号つき（C4=midi60が基準）
export function noteNameWithOctave(midi, style = 'doremi') {
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName(midi, style)}${octave}`;
}

// 音程。semis 0..12。ja=正式名、violin=バイオリン語（指の距離感）
export const INTERVALS = [
  { semis: 0, ja: 'ユニゾン', violin: 'おなじ音' },
  { semis: 1, ja: '短2度', violin: '半音（いちばんせまい距離）' },
  { semis: 2, ja: '長2度', violin: '全音（半音2つぶんの距離）' },
  { semis: 3, ja: '短3度', violin: '短3度' },
  { semis: 4, ja: '長3度', violin: '長3度' },
  { semis: 5, ja: '完全4度', violin: '完全4度（1の指と4の指の枠）' },
  { semis: 6, ja: '増4度', violin: '増4度（トライトーン）' },
  { semis: 7, ja: '完全5度', violin: '完全5度（となりの弦のおなじ場所）' },
  { semis: 8, ja: '短6度', violin: '短6度' },
  { semis: 9, ja: '長6度', violin: '長6度' },
  { semis: 10, ja: '短7度', violin: '短7度' },
  { semis: 11, ja: '長7度', violin: '長7度' },
  { semis: 12, ja: 'オクターブ', violin: 'オクターブ' },
];

// 開放弦のmidi番号（G線・D線・A線・E線）
export const STRINGS = [
  { name: 'G線', midi: 55 },
  { name: 'D線', midi: 62 },
  { name: 'A線', midi: 69 },
  { name: 'E線', midi: 76 },
];

// 第1ポジションの標準運指（半音上げ下げは同じ指）
const FINGER_BY_SEMI = [0, 1, 1, 2, 2, 3, 3, 4];

// 第1ポジションの指板マップ。開放(semi 0)〜semi 7の8点
export function positionsForString(stringIndex, style = 'doremi') {
  const base = STRINGS[stringIndex].midi;
  const out = [];
  for (let semi = 0; semi <= 7; semi++) {
    const midi = base + semi;
    out.push({ semi, midi, finger: FINGER_BY_SEMI[semi], label: noteName(midi, style) });
  }
  return out;
}

// 純正音程の周波数比 [p, q] は f2/f1 = p/q
export const JI_RATIOS = {
  P8: [2, 1],
  P5: [3, 2],
  P4: [4, 3],
  M3: [5, 4],
  m3: [6, 5],
  M6: [5, 3],
};

// 純正比[p,q]からのズレで生じるうなり周波数(Hz)
export function beatRate(f1, f2, ratio) {
  const [p, q] = ratio;
  return Math.abs(q * f2 - p * f1);
}
