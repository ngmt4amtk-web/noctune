import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRng,
  shuffle,
  pickDifferent,
  Staircase,
  stars,
  scoreFor,
  xpToRank,
} from '../js/engine.js';

test('makeRng 決定性: 同seedは同列', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  seqA.forEach((v) => assert.ok(v >= 0 && v < 1));
  // 別seedは（ほぼ確実に）別列
  const c = makeRng(43);
  assert.notEqual(a(), c());
});

test('shuffle 非破壊・同要素集合', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, makeRng(7));
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
});

test('pickDifferent 直前回避・単一要素は諦め', () => {
  const rng = makeRng(3);
  for (let i = 0; i < 50; i++) {
    assert.notEqual(pickDifferent(['a', 'b', 'c'], 'b', rng), 'b');
  }
  assert.equal(pickDifferent(['x'], 'x', rng), 'x');
});

test('Staircase down/up と clamp', () => {
  const sc = new Staircase({ start: 50, min: 2, max: 60, down: 0.5, up: 2 });
  assert.equal(sc.current, 50);
  sc.report(true); // 50*0.5=25
  assert.equal(sc.current, 25);
  sc.report(true); // 12.5
  assert.equal(sc.current, 12.5);
  sc.report(false); // 25
  assert.equal(sc.current, 25);
  // 上限clamp
  const up = new Staircase({ start: 55, min: 2, max: 60, up: 2 });
  up.report(false);
  assert.equal(up.current, 60);
  // 下限clamp
  const dn = new Staircase({ start: 3, min: 2, max: 60, down: 0.1 });
  dn.report(true);
  assert.equal(dn.current, 2);
});

test('Staircase best と reversals', () => {
  const sc = new Staircase({ start: 40, min: 2, max: 60, down: 0.5, up: 2 });
  assert.equal(sc.best, null);
  sc.report(true); // best=40, cur=20, dir=-1
  assert.equal(sc.best, 40);
  sc.report(true); // best=20, cur=10, dir=-1
  assert.equal(sc.best, 20);
  sc.report(false); // reversal(1), cur=20, dir=+1
  assert.equal(sc.reversals, 1);
  sc.report(true); // best=min(20,20)=20, reversal(2), dir=-1
  assert.equal(sc.reversals, 2);
  assert.equal(sc.best, 20);
});

test('stars 境界値4点', () => {
  assert.equal(stars(0.95), 3);
  assert.equal(stars(0.8), 2);
  assert.equal(stars(0.6), 1);
  assert.equal(stars(0.59), 0);
  assert.equal(stars(1.0), 3);
});

test('scoreFor: 不正解0・レベル倍率・コンボ上限', () => {
  assert.equal(scoreFor({ correct: false, streakNow: 5, level: 3 }), 0);
  assert.equal(scoreFor({ correct: true, streakNow: 0, level: 1 }), 100);
  // level2 = 110基礎, streak0
  assert.equal(scoreFor({ correct: true, streakNow: 0, level: 2 }), 110);
  // コンボ上限: streak10と15で同点
  const s10 = scoreFor({ correct: true, streakNow: 10, level: 1 });
  const s15 = scoreFor({ correct: true, streakNow: 15, level: 1 });
  assert.equal(s10, s15);
  assert.equal(s10, 200); // 100 * 2.0
});

test('xpToRank 境界', () => {
  assert.equal(xpToRank(0).name, 'SIGNAL 0');
  assert.equal(xpToRank(0).level, 1);
  assert.equal(xpToRank(0).nextAt, 300);
  assert.equal(xpToRank(0).prevAt, 0);
  assert.equal(xpToRank(299).name, 'SIGNAL 0');
  assert.equal(xpToRank(300).name, 'WARM-UP');
  assert.equal(xpToRank(300).level, 2);
  assert.equal(xpToRank(25000).name, 'ABSOLUTE');
  assert.equal(xpToRank(25000).nextAt, null);
  assert.equal(xpToRank(999999).name, 'ABSOLUTE');
});
