// ランナー: Questionを実行する唯一の場所。play再生→入力→正誤→next。
import { freqOfMidi, detune } from '../theory.js';
import { answerGrid, hud } from './components.js';
import { pop, shake, starBurst } from './fx.js';
import { createFingerboard } from './fingerboard.js';
import { scoreFor, makeRng } from '../engine.js';

const FEEDBACK_MS = 1000; // 通常フィードバック
const FEEDBACK_MS_LONG = 1400; // explainあり

export async function runRound({ mode, config, synth, container, settings = {}, onFinish }) {
  const a4 = settings.a4 || 442;
  const seed = (settings.seed ?? Date.now()) >>> 0;
  const rng = makeRng(seed);
  const round = mode.createRound(config, rng, { settings });
  const total = round.total;

  // ラウンド状態
  let asked = 0;
  let correctCount = 0;
  let score = 0;
  let streak = 0;
  let maxStreak = 0; // コンボの達人バッジ判定用（state.recordResultへ渡す）
  let aborted = false;
  let finished = false;

  // DOM構築
  container.innerHTML = '';
  const root = el('div', 'runner');
  root.style.setProperty('--mode-color', mode.color || '#3de7ff');
  // 中断はプレイ画面ヘッダーの✕（screens.js側）に一本化。コンテナが
  // DOMから外れたら以降の再生・演出を止める（外部ナビゲーション対策）
  // HUD（想定API: hud(state)=>{el, update(partial)}）
  const h = hud({ progress: 0, total, score: 0, combo: 0 });
  const stage = el('div', 'runner-stage');
  const promptEl = el('div', 'runner-prompt');
  const playBtn = el('button', 'runner-play');
  playBtn.textContent = 'LISTEN';
  const timerBar = el('div', 'runner-timer');
  timerBar.style.display = 'none';
  const answerArea = el('div', 'runner-answer');
  const replayBtn = el('button', 'runner-replay');
  replayBtn.textContent = 'REPLAY';
  const feedbackEl = el('div', 'runner-feedback');
  stage.append(promptEl, playBtn, timerBar, answerArea, replayBtn, feedbackEl);
  root.append(h.el, stage);
  container.append(root);

  function finish(result) {
    if (finished) return;
    finished = true;
    onFinish && onFinish(result);
  }

  // 再生: midi+cents → freqOfMidi(a4)+detune。再生中は入力無効
  async function playSteps(steps) {
    for (const s of steps || []) {
      if (aborted || !container.isConnected) return;
      if (s.type === 'note') {
        const f = detune(freqOfMidi(s.midi, a4), s.cents || 0);
        await synth.playNote({ freq: f, dur: s.dur ?? 1.0, vibrato: false });
      } else if (s.type === 'gap') {
        await sleep((s.dur ?? 0.3) * 1000);
      } else if (s.type === 'double') {
        const f1 = detune(freqOfMidi(s.midi, a4), s.cents || 0);
        let f2;
        if (s.interval) {
          f2 = (f1 * s.interval[0]) / s.interval[1]; // 純正比
          if (s.cents2) f2 = detune(f2, s.cents2);
        } else {
          f2 = detune(f1, s.cents2 || 0); // 下声からのセント
        }
        await synth.playDoubleStop({ f1, f2, dur: s.dur ?? 2.0 });
      } else if (s.type === 'seq') {
        const notes = (s.notes || []).map((n) => ({
          freq: detune(freqOfMidi(n.midi, a4), n.cents || 0),
          dur: n.dur ?? 0.5,
          gap: n.gap ?? 0.05,
        }));
        await synth.playSequence(notes);
      }
    }
  }

  function setInputsEnabled(on) {
    answerArea.style.pointerEvents = on ? '' : 'none';
    answerArea.querySelectorAll('button').forEach((b) => (b.disabled = !on));
    replayBtn.disabled = !on;
  }

  async function withPlaying(fn) {
    setInputsEnabled(false);
    playBtn.disabled = true;
    playBtn.classList.add('is-playing');
    try {
      await fn();
    } finally {
      playBtn.classList.remove('is-playing');
      playBtn.disabled = false;
      if (!aborted) setInputsEnabled(true);
    }
  }

  // 1問処理。correct(true/false) を解決
  function runQuestion(q) {
    return new Promise((resolve) => {
      asked++;
      promptEl.textContent = q.prompt || '';
      feedbackEl.textContent = '';
      feedbackEl.className = 'runner-feedback';
      answerArea.innerHTML = '';
      h.update({ current: asked, total, score, combo: streak });

      let answered = false;
      let timer = null;
      let raf = null;
      let visCleanup = null;

      const clearTimers = () => {
        if (timer) clearTimeout(timer);
        if (raf) cancelAnimationFrame(raf);
        if (visCleanup) { visCleanup(); visCleanup = null; }
        timerBar.style.display = 'none';
      };
      const done = (correct) => {
        if (answered || aborted) return;
        answered = true;
        clearTimers();
        // 画面が既に離脱していたら演出せず静かに終わる
        if (!container.isConnected) {
          aborted = true;
          resolve(null);
          return;
        }
        setInputsEnabled(false);
        handleResult(q, correct).then(() => resolve(correct));
      };

      // 入力UI（answerGridのコールバックは (value, index)）
      if (q.input && q.input.kind === 'buttons') {
        answerArea.append(answerGrid(q.input.options, (_val, idx) => done(idx === q.input.correct)));
      } else if (q.input && q.input.kind === 'fingerboard') {
        setupFingerboard(q.input, done);
      }

      const doPlay = () => withPlaying(() => playSteps(q.play));
      playBtn.onclick = doPlay;
      replayBtn.style.display = q.replay === false ? 'none' : '';
      replayBtn.onclick = doPlay;

      // 初回自動再生 → タイムリミット開始
      doPlay().then(() => {
        if (aborted) {
          resolve(null);
          return;
        }
        if (q.timeLimitMs) startTimer(q.timeLimitMs);
      });

      function startTimer(ms) {
        // タブ非表示・画面ロック中はタイマを凍結し、復帰後に残り時間から再開する
        // （バックグラウンドのsetTimeoutスロットルで復帰瞬間に不正解になるのを防ぐ）
        timerBar.style.display = '';
        let remaining = ms;
        let start = now();
        const arm = () => {
          start = now();
          timer = setTimeout(() => done(false), remaining);
          tick();
        };
        const freeze = () => {
          if (timer) clearTimeout(timer);
          if (raf) cancelAnimationFrame(raf);
          remaining = Math.max(0, remaining - (now() - start));
        };
        const onVis = () => {
          if (answered || aborted) return;
          if (document.hidden) freeze();
          else arm();
        };
        document.addEventListener('visibilitychange', onVis);
        visCleanup = () => document.removeEventListener('visibilitychange', onVis);
        const tick = () => {
          const left = Math.max(0, (remaining - (now() - start)) / ms);
          timerBar.style.setProperty('--t', String(left));
          if (left > 0 && !answered) raf = requestAnimationFrame(tick);
        };
        arm();
      }
    });
  }

  // 指板入力: anchorを光らせ、correctSeq順にタップ。1音でも外したら不正解
  // createFingerboardは container に自分でSVGを差し込み、highlightは (配列, kind) を取る
  function setupFingerboard(input, done) {
    const { anchor, correctSeq = [] } = input;
    let idx = 0;
    const wrap = el('div', 'runner-fb');
    answerArea.append(wrap);
    const fb = createFingerboard({
      container: wrap,
      noteStyle: settings.noteStyle || 'doremi',
      onTap: (pos) => {
        const want = correctSeq[idx];
        const ok = want && pos.stringIndex === want.stringIndex && pos.semi === want.semi;
        if (!ok) {
          fb.flash(pos, 'wrong');
          fb.highlight(correctSeq, 'hint'); // 正解の並びを見せてから次へ
          done(false);
          return;
        }
        idx++;
        fb.highlight(correctSeq.slice(0, idx), 'correct');
        if (idx >= correctSeq.length) done(true);
      },
    });
    if (anchor) fb.highlight([anchor], 'anchor');
  }

  async function handleResult(q, correct) {
    if (correct) {
      correctCount++;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
      score += scoreFor({ correct: true, streakNow: streak });
      feedbackEl.textContent = q.explain ? '正解！ ' + q.explain : '正解！';
      feedbackEl.classList.add('is-correct');
      synth.playFx && synth.playFx('correct');
      pop && pop(feedbackEl);
      starBurst && starBurst(root, 1);
    } else {
      streak = 0;
      feedbackEl.textContent = q.explain ? '残念… ' + q.explain : '残念…';
      feedbackEl.classList.add('is-wrong');
      synth.playFx && synth.playFx('wrong');
      shake && shake(stage);
    }
    h.update({ current: asked, total, score, combo: streak });
    await sleep(q.explain ? FEEDBACK_MS_LONG : FEEDBACK_MS);
  }

  // メインループ
  let prevCorrect = null;
  while (!aborted && !finished && container.isConnected) {
    const q = round.next(prevCorrect);
    if (!q) break;
    const res = await runQuestion(q);
    if (aborted || finished) return;
    prevCorrect = res;
  }
  if (aborted || finished) return;
  // 外部ナビゲーションでコンテナが外れて抜けた場合は記録せず静かに終わる
  if (!container.isConnected) return;
  const summary = round.summary ? round.summary() : {};
  const accuracy = asked > 0 ? correctCount / asked : 0;
  finish({ accuracy, score, summary, streakMax: maxStreak });
}

// --- 小物ヘルパ ---
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// --- 依存する契約シグネチャ（2026-07-12 編集長レビューで実体と突合済み）---
// theory.js:    freqOfMidi(midi, a4) / detune(freq, cents)
// engine.js:    scoreFor({correct, streakNow, level}) / makeRng(seed)
// components.js:answerGrid(options, onPick(value, index))=>HTMLElement /
//               hud(state)=>{el, update(partial:{current,total,score,combo})}
// fx.js:        pop(el) / shake(el) / starBurst(container, n)
// fingerboard.js:createFingerboard({container, onTap(pos), noteStyle})
//               =>{highlight(cells[], kind:'anchor'|'correct'|'wrong'|'hint'), flash(cell, kind), ...}
// synth(I-03):  playNote / playSequence / playDoubleStop / playFx(name) / stopAll
// mode(契約):   createRound(level, rng, opts)=>{total, next(prevCorrect|null), summary()}
