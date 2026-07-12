import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freqOfMidi,
  detune,
  centsBetween,
  NOTE_NAMES_DOREMI,
  NOTE_NAMES_ABC,
  noteName,
  noteNameWithOctave,
  INTERVALS,
  STRINGS,
  positionsForString,
  JI_RATIOS,
  beatRate,
} from '../js/theory.js';

test('freqOfMidi: A4基準の平均律計算', () => {
  assert.equal(freqOfMidi(69, 440), 440);
  assert.equal(freqOfMidi(69, 442), 442);
  assert.equal(freqOfMidi(81, 440), 880);
});

test('centsBetween と detune は逆演算になる', () => {
  const diff = centsBetween(440, detune(440, 7));
  assert.ok(Math.abs(diff - 7) < 1e-9);
});

test('INTERVALS は0..12の13要素', () => {
  assert.equal(INTERVALS.length, 13);
  INTERVALS.forEach((iv, i) => assert.equal(iv.semis, i));
});

test('STRINGS のmidiは [55,62,69,76]', () => {
  assert.deepEqual(STRINGS.map((s) => s.midi), [55, 62, 69, 76]);
});

test('noteName / noteNameWithOctave', () => {
  assert.equal(noteName(69), 'ラ');
  assert.equal(noteNameWithOctave(69, 'abc'), 'A4');
});

test('positionsForString(2) はA線8要素、先頭が開放', () => {
  const pos = positionsForString(2);
  assert.equal(pos.length, 8);
  assert.deepEqual(pos[0], { semi: 0, midi: 69, finger: 0, label: 'ラ' });
  for (let i = 0; i < pos.length; i++) {
    assert.equal(pos[i].midi, 69 + i);
  }
});

test('beatRate: 純正5度はうなりゼロ', () => {
  assert.equal(beatRate(220, 330, [3, 2]), 0);
});

test('平均律の長3度は純正長3度より約13.7セント広い', () => {
  const et = centsBetween(freqOfMidi(60), freqOfMidi(64)); // 平均律長3度=400セント
  const [p, q] = JI_RATIOS.M3; // 5/4
  const justCents = centsBetween(1, p / q);
  assert.ok(Math.abs(et - justCents - 13.7) < 0.1);
});

// --- 境界追加分 ---

test('noteName はオクターブ違いでも同じ音名', () => {
  assert.equal(noteName(60), 'ド');
  assert.equal(noteName(60 + 12), 'ド');
  assert.equal(noteName(60 - 12), 'ド');
});

test('noteNameWithOctave: C4は 60 が基準', () => {
  assert.equal(noteNameWithOctave(60, 'abc'), 'C4');
  assert.equal(noteNameWithOctave(0, 'abc'), 'C-1');
});

test('NOTE_NAMES配列は12要素で先頭が基準音', () => {
  assert.equal(NOTE_NAMES_DOREMI.length, 12);
  assert.equal(NOTE_NAMES_ABC.length, 12);
  assert.equal(NOTE_NAMES_DOREMI[0], 'ド');
  assert.equal(NOTE_NAMES_ABC[0], 'C');
});

test('FLAT表記配列と noteNamesFor', async () => {
  const { NOTE_NAMES_DOREMI_FLAT, NOTE_NAMES_ABC_FLAT, noteNamesFor, WHITE_PCS } = await import(
    '../js/theory.js'
  );
  assert.equal(NOTE_NAMES_DOREMI_FLAT[1], 'レ♭');
  assert.equal(NOTE_NAMES_ABC_FLAT[10], 'B♭');
  assert.deepEqual(noteNamesFor('abc', 'flat').slice(0, 3), ['C', 'D♭', 'D']);
  assert.equal(noteNamesFor('doremi', 'sharp')[1], 'ド♯');
  assert.deepEqual(WHITE_PCS, [0, 2, 4, 5, 7, 9, 11]);
});

test('positionsForString の指番号マッピング', () => {
  const pos = positionsForString(0); // G線
  assert.deepEqual(
    pos.map((p) => p.finger),
    [0, 1, 1, 2, 2, 3, 3, 4]
  );
});
