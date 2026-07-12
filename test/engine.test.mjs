import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRng,
  shuffle,
  pickDifferent,
  Staircase,
  stars,
  scoreFor,
} from '../js/engine.js';

test('makeRng 決定性: 同seedは同列', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('shuffle 非破壊・同要素集合', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, makeRng(7));
  assert.notEqual(out, src);
  assert.deepEqual([...out].sort(), [...src].sort());
});

test('pickDifferent 直前回避・単一要素は諦め', () => {
  const rng = makeRng(1);
  assert.notEqual(pickDifferent(['a', 'b'], 'a', rng), 'a');
  assert.equal(pickDifferent(['x'], 'x', rng), 'x');
});

test('Staircase down/up と clamp', () => {
  const sc = new Staircase({ start: 20, min: 2, max: 40, down: 0.7, up: 1.5 });
  assert.equal(sc.current, 20);
  sc.report(true);
  assert.ok(sc.current < 20);
  sc.report(false);
  assert.ok(sc.current > 2);
});

test('Staircase best と reversals', () => {
  const sc = new Staircase({ start: 10, min: 2, max: 40 });
  sc.report(true);
  assert.ok(sc.best !== null);
  assert.ok(sc.best <= 10);
});

test('stars 境界値4点', () => {
  assert.equal(stars(0.95), 3);
  assert.equal(stars(0.8), 2);
  assert.equal(stars(0.6), 1);
  assert.equal(stars(0.59), 0);
});

test('scoreFor: 不正解0・レベル倍率・コンボ上限', () => {
  assert.equal(scoreFor({ correct: false, streakNow: 5, level: 3 }), 0);
  assert.equal(scoreFor({ correct: true, streakNow: 0, level: 1 }), 100);
  assert.equal(scoreFor({ correct: true, streakNow: 0, level: 2 }), 110);
  const s10 = scoreFor({ correct: true, streakNow: 10, level: 1 });
  const s15 = scoreFor({ correct: true, streakNow: 15, level: 1 });
  assert.equal(s10, s15);
  assert.equal(s10, 200);
});
