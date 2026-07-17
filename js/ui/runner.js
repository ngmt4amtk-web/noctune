// ランナー: 早押し・stopAll・pitch-set・問別ログ
import { freqOfMidi, detune } from '../theory.js?v=0718a1';
import { answerGrid, hud, pitchSetPicker } from './components.js?v=0718a1';
import { pop, shake, listenRipple, clearFlash } from './fx.js?v=0718a1';
import { createFingerboard } from './fingerboard.js?v=0718a1';
import { scoreFor, makeRng } from '../engine.js?v=0718a1';

const FEEDBACK_MS = 700;
const FEEDBACK_MS_LONG = 1100;

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
  let aborted = false;
  let finished = false;
  const log = [];
  let playEpoch = 0;

  container.innerHTML = '';
  const root = el('div', 'runner');
  root.style.setProperty('--mode-color', mode.color || '#6ec8ff');
  const h = hud({ progress: 0, total, score: 0, combo: 0 });
  const stage = el('div', 'runner-stage');
  const promptEl = el('div', 'runner-prompt');
  const playWrap = el('div', 'runner-play-wrap');
  const playBtn = el('button', 'runner-play');
  playBtn.textContent = '聴く';
  playWrap.append(playBtn);
  const timerBar = el('div', 'runner-timer');
  timerBar.style.display = 'none';
  const answerArea = el('div', 'runner-answer');
  const replayBtn = el('button', 'runner-replay');
  replayBtn.textContent = 'もう一度';
  const feedbackEl = el('div', 'runner-feedback');
  stage.append(promptEl, playWrap, timerBar, answerArea, replayBtn, feedbackEl);
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
    answerArea.querySelectorAll('button').forEach((b) => {
      if (!on) b.disabled = true;
    });
  }

  function setTransportEnabled(on) {
    playBtn.disabled = !on;
    replayBtn.disabled = !on;
  }

  function expectedRecord(q) {
    const input = q.input || {};
    if (input.kind === 'pitch-set') {
      const labels = (input.correctPcs || []).map((pc) => {
        const opt = (input.options || []).find((o) => o.pc === pc);
        return opt ? opt.label : String(pc);
      });
      return { kind: 'pitch-set', pcs: [...(input.correctPcs || [])], labels };
    }
    if (input.kind === 'buttons') {
      const idx = input.correct;
      const label = input.options?.[idx];
      return {
        kind: 'buttons',
        index: idx,
        value: label,
        label: typeof label === 'string' ? label : label?.label ?? String(idx),
      };
    }
    return { kind: 'unknown', label: q.explain || '' };
  }

  function gradeAnswer(q, response) {
    if (typeof q.grade === 'function') return !!q.grade(response);
    if (!response) return false;
    if (q.input?.kind === 'pitch-set') {
      const a = [...(response.pcs || [])].sort((x, y) => x - y);
      const b = [...(q.input.correctPcs || [])].sort((x, y) => x - y);
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    if (response.kind === 'buttons') return response.index === q.input.correct;
    return !!response.correct;
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

      const done = (response) => {
        if (answered || aborted) return;
        answered = true;
        playEpoch += 1;
        synth.stopAll();
        clearTimers();
        if (!container.isConnected) {
          aborted = true;
          resolve(null);
          return;
        }
        setAnswerEnabled(false);
        setTransportEnabled(false);
        const correct = gradeAnswer(q, response);
        log.push({
          no: asked,
          play: q.play,
          prompt: q.prompt || '',
          expected: expectedRecord(q),
          response: response || null,
          correct,
          explain: q.explain || '',
          detail: q.detail || { modeId: mode.id },
        });
        handleResult(q, correct).then(() => resolve(correct));
      };

      if (q.input && q.input.kind === 'buttons') {
        // untilCorrect: 誤答は潰して継続、正解を押すまで進まない。採点は最初のタップ
        let firstResponse = null;
        const grid = answerGrid(q.input.options, (val, idx) => {
          const label = typeof q.input.options[idx] === 'string' ? q.input.options[idx] : q.input.options[idx]?.label;
          const response = { kind: 'buttons', index: idx, value: val, label };
          if (q.untilCorrect && idx !== q.input.correct) {
            if (!firstResponse) firstResponse = response;
            const btn = grid.querySelector(`button[data-index="${idx}"]`);
            if (btn) {
              btn.disabled = true;
              btn.classList.add('is-wrong');
              shake && shake(btn);
            }
            synth.playFx && synth.playFx('wrong');
            return;
          }
          if (q.untilCorrect) {
            const btn = grid.querySelector(`button[data-index="${idx}"]`);
            if (btn) btn.classList.add('is-correct');
          }
          done(firstResponse || response);
        });
        answerArea.append(grid);
      } else if (q.input && q.input.kind === 'pitch-set') {
        answerArea.append(pitchSetPicker(q.input, (res) => done(res)));
      } else if (q.input && q.input.kind === 'fingerboard') {
        setupFingerboard(q.input, (ok) => done({ kind: 'fingerboard', correct: ok }));
      }

      setAnswerEnabled(true);

      const doPlay = async () => {
        const epoch = ++playEpoch;
        synth.stopAll();
        setTransportEnabled(false);
        playBtn.classList.add('is-playing');
        const voices =
          q.play?.[0]?.type === 'chord'
            ? (q.play[0].notes || []).length
            : q.play?.[0]?.type === 'double'
            ? 2
            : 1;
        listenRipple(playBtn, voices);
        try {
          await playSteps(q.play, () => stillLive(epoch, answered));
        } finally {
          playBtn.classList.remove('is-playing');
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
          timer = setTimeout(() => done(null), remaining);
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
    if (correct) {
      correctCount++;
      streak++;
      score += scoreFor({ correct: true, streakNow: streak });
      feedbackEl.textContent = q.explain ? `正解 — ${q.explain}` : '正解';
      feedbackEl.classList.add('is-correct');
      synth.playFx && synth.playFx('correct');
      pop && pop(feedbackEl);
      clearFlash(stage);
    } else {
      streak = 0;
      feedbackEl.textContent = q.explain ? `不正解 — ${q.explain}` : '不正解';
      feedbackEl.classList.add('is-wrong');
      // untilCorrect は誤答タップごとに鳴らし済み。正解到達の瞬間に再びブザーを鳴らさない
      if (!q.untilCorrect) {
        synth.playFx && synth.playFx('wrong');
        shake && shake(stage);
      }
    }
    h.update({ current: asked, total, score, combo: streak });
    await sleep(q.explain ? FEEDBACK_MS_LONG : FEEDBACK_MS);
    synth.stopAll();
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
  finish({ accuracy, score, summary, log });
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
