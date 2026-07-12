import test from 'node:test';
import assert from 'node:assert/strict';
import hamori from '../js/modes/hamori.js';
import { makeRng } from '../js/engine.js';

test('hamori setup に startCents がある', () => {
  const item = hamori.setup.find((s) => s.key === 'startCents');
  assert.ok(item);
  assert.deepEqual(item.options.map((o) => o.value), [40, 25, 10, 5]);
  assert.equal(item.default, 25);
});

test('hamori startCents=5 で最初のズレ問が5セント付近', () => {
  const rng = makeRng(42);
  const round = hamori.createRound({ hibiki: 'P5', startCents: 5 }, rng);
  let q = round.next(null);
  // 純正とズレが混在するのでズレが出るまで進める
  let found = null;
  let prev = null;
  for (let i = 0; i < 12; i++) {
    if (q && q.play?.[0]?.cents2 !== 0) {
      found = Math.abs(q.play[0].cents2);
      break;
    }
    prev = true; // 適当に正解扱いして進めるとステアケースが動くので、ここでは報告せず
    // nextはprevCorrectで集計するので、未回答のまま次は取れない設計。
    // 代わりに同じroundを作り直してズレ枠を探す。
    break;
  }
  // 作り直しでズレ枠を確実に探す
  const rng2 = makeRng(7);
  const r2 = hamori.createRound({ hibiki: 'P5', startCents: 5 }, rng2);
  let qq = r2.next(null);
  let answer = null;
  for (let i = 0; i < 12 && qq; i++) {
    if (qq.play[0].cents2 !== 0) {
      found = Math.abs(qq.play[0].cents2);
      break;
    }
    answer = qq.input.correct === 0; // 純正問は「きれい」が正解 index0
    qq = r2.next(true);
  }
  assert.equal(found, 5);
});

test('おとあて explain に正解音名が入る', async () => {
  const oto = (await import('../js/modes/oto-ate.js')).default;
  const rng = makeRng(1);
  const round = oto.createRound({ range: 'mid' }, rng, { noteStyle: 'doremi' });
  const q = round.next(null);
  assert.match(q.explain, /^答えは「/);
});
