// ランナー: 早押し可・回答/再生前にstopAll・世代管理で音被り防止
import { freqOfMidi, detune } from '../theory.js';
import { answerGrid, hud } from './components.js';
import { pop, shake, starBurst } from './fx.js';
import { createFingerboard } from './fingerboard.js';
import { scoreFor, makeRng } from '../engine.js';

const FEEDBACK_MS = 700;
const FEEDBACK_MS_LONG = 1000;

export async function runRound({ mode, config, synth, container, settings = {}, onFinish }) {
  const a4 = settings.a4 || 442;
  const seed = (settings.seed ?? Date.now()) >>> 0;
  const rng = makeRng(seed);
  const round = mode.createRound(config, rng, { settings });
  const total = round.total;

  let asked = 0;
  let correctCount = 0;
  let score = 0;
  let streak = 0;
  let maxStreak = 0;
  let aborted = false;
  let finished = false;

  container.innerHTML = '';
  const root = el('div', 'runner');
  root.style.setProperty('--mode-color', mode.color || '#ff7a59');
  const h = hud({ progress: 0, total, score: 0, combo: 0 });
  const stage = el('div', 'runner-stage');
  const promptEl = el('div', 'runner-prompt');
  const playBtn = el('button', 'runner-play');
  playBtn.textContent = 'きく';
  const timerBar = el('div', 'runner-timer');
  timerBar.style.display = 'none';
  const answerArea = el('div', 'runner-answer');
  const replayBtn = el('button', 'runner-replay');
  replayBtn.textContent = 'もういちど';
  const feedbackEl = el('div', 'runner-feedback');
  stage.append(promptEl, playBtn, timerBar, answerArea, replayBtn, feedbackEl);
  root.append(h.el, stage);
  container.append(root);

  function finish(result) {
    if (finished) return;
    finished = true;
    onFinish && onFinish(result);
  }

  function stillLive(epoch, answered) {
    return !answered && !aborted && container.isConnected && epoch === playEpoch;
  }

  let playEpoch = 0;

  async function playSteps(steps, alive) {
    for (const s of steps || []) {
      if (!alive()) return;
      if (s.type === 'note') {
        const f = detune(freqOfMidi(s.midi, a4), s.cents || 0);
        await synth.playNote({ freq: f, dur: s.dur ?? 1.0, vibrato: false });
      } else if (s.type === 'gap') {
        await sleep((s.dur ?? 0.3) * 1000);
      } else if (s.type === 'double') {
        const f1 = detune(freqOfMidi(s.midi, a4), s.cents || 0);
        let f2;
        if (s.interval) {
          f2 = (f1 * s.interval[0]) / s.interval[1];
          if (s.cents2) f2 = detune(f2, s.cents2);
        } else {
          f2 = detune(f1, s.cents2 || 0);
        }
        await synth.playDoubleStop({ f1, f2, dur: s.dur ?? 2.0 });
      } else if (s.type === 'chord') {
        const freqs = (s.notes || []).map((n) => detune(freqOfMidi(n.midi, a4), n.cents || 0));
        await synth.playChord({ freqs, dur: s.dur ?? 1.6, vol: s.vol ?? 0.55 });
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

  function setAnswerEnabled(on) {
    answerArea.style.pointerEvents = on ? '' : 'none';
    answerArea.querySelectorAll('button').forEach((b) => (b.disabled = !on));
  }

  function setTransportEnabled(on) {
    playBtn.disabled = !on;
    replayBtn.disabled = !on;
  }

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
        if (visCleanup) {
          visCleanup();
          visCleanup = null;
        }
        timerBar.style.display = 'none';
      };

      const done = (correct) => {
        if (answered || aborted) return;
        answered = true;
        playEpoch += 1; // 進行中の再生を無効化
        synth.stopAll();
        clearTimers();
        if (!container.isConnected) {
          aborted = true;
          resolve(null);
          return;
        }
        setAnswerEnabled(false);
        setTransportEnabled(false);
        handleResult(q, correct).then(() => resolve(correct));
      };

      if (q.input && q.input.kind === 'buttons') {
        answerArea.append(answerGrid(q.input.options, (_val, idx) => done(idx === q.input.correct)));
      } else if (q.input && q.input.kind === 'fingerboard') {
        setupFingerboard(q.input, done);
      }

      // 回答は再生中でも可。再生ボタンだけ一時ロック。
      setAnswerEnabled(true);

      const doPlay = async () => {
        const epoch = ++playEpoch;
        synth.stopAll();
        setTransportEnabled(false);
        playBtn.classList.add('is-playing');
        try {
          await playSteps(q.play, () => stillLive(epoch, answered));
        } finally {
          playBtn.classList.remove('is-playing');
          // 古い再生のfinallyでUIを勝手に戻さない
          if (stillLive(epoch, answered)) setTransportEnabled(true);
        }
      };

      playBtn.onclick = doPlay;
      replayBtn.style.display = q.replay === false ? 'none' : '';
      replayBtn.onclick = doPlay;

      doPlay().then(() => {
        if (aborted) {
          resolve(null);
          return;
        }
        if (!answered && q.timeLimitMs) startTimer(q.timeLimitMs);
      });

      function startTimer(ms) {
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
          fb.highlight(correctSeq, 'hint');
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
    // 刺激はdoneで停止済み。ここから快感SFX。
    if (correct) {
      correctCount++;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
      score += scoreFor({ correct: true, streakNow: streak });
      feedbackEl.textContent = q.explain ? `せいかい！ ${q.explain}` : 'せいかい！';
      feedbackEl.classList.add('is-correct');
      synth.playFx && synth.playFx('correct');
      pop && pop(feedbackEl);
      starBurst && starBurst(root, 1);
    } else {
      streak = 0;
      feedbackEl.textContent = q.explain ? `おしい… ${q.explain}` : 'おしい…';
      feedbackEl.classList.add('is-wrong');
      synth.playFx && synth.playFx('wrong');
      shake && shake(stage);
    }
    h.update({ current: asked, total, score, combo: streak });
    await sleep(q.explain ? FEEDBACK_MS_LONG : FEEDBACK_MS);
    synth.stopAll(); // 次問前にSFX残響も掃除
  }

  let prevCorrect = null;
  while (!aborted && !finished && container.isConnected) {
    const q = round.next(prevCorrect);
    if (!q) break;
    const res = await runQuestion(q);
    if (aborted || finished) return;
    prevCorrect = res;
  }
  if (aborted || finished) return;
  if (!container.isConnected) return;
  const summary = round.summary ? round.summary() : {};
  const accuracy = asked > 0 ? correctCount / asked : 0;
  finish({ accuracy, score, summary, streakMax: maxStreak });
}

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
