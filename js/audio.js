// 音源エンジン（Web Audio）。刺激音とSFXを分離管理し、stopAllで即黙る。

const ATTACK = 0.025;
const RELEASE = 0.18;
const DECAY_TO = 0.8;
const DECAY_TIME = 0.35;
const PARTIALS = [1.0, 0.35, 0.12, 0.05];
const PARTIAL_NORM = 0.6;
const STOP_RELEASE = 0.045; // stopAll時の短いフェード

export class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this._voices = new Set();
    this._fxNodes = new Set(); // SFX用（stopAll対象）
    this._gen = 0; // 再生世代。stopAllで加算し古いawaitを切る
    this._unlocked = false;
    this._volume = null;
  }

  async ensureRunning() {
    if (!this.ctx) this._build();
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch (_) {}
    if (!this._unlocked) this._silentUnlock();
    return this.ctx;
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._volume != null ? this._volume : 0.9;
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    this.ctx.addEventListener?.('statechange', () => {
      if (this.ctx.state === 'interrupted' || this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    });
  }

  _silentUnlock() {
    try {
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      this._unlocked = true;
    } catch (_) {}
  }

  _makeVoice(freq, vol, vibrato, t0) {
    const ctx = this.ctx;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.Q.value = 0.5;
    lp.connect(voiceGain);
    voiceGain.connect(this.master);

    const oscs = PARTIALS.map((amp, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * (i + 1);
      const pg = ctx.createGain();
      pg.gain.value = amp * PARTIAL_NORM;
      o.connect(pg);
      pg.connect(lp);
      return o;
    });

    let lfo = null;
    let lfoGain = null;
    if (vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = 12;
      lfo.connect(lfoGain);
      oscs.forEach((o) => lfoGain.connect(o.detune));
      lfo.start(t0);
    }

    const g = voiceGain.gain;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(vol, t0 + ATTACK);
    g.linearRampToValueAtTime(vol * DECAY_TO, t0 + ATTACK + DECAY_TIME);

    oscs.forEach((o) => o.start(t0));

    const voice = { voiceGain, oscs, lfo, released: false };
    voice.release = (when, quick = false) => {
      if (voice.released) return;
      voice.released = true;
      const rt = Math.max(when, ctx.currentTime);
      const rel = quick ? STOP_RELEASE : RELEASE;
      try {
        g.cancelScheduledValues(rt);
        if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(rt);
        else g.setValueAtTime(vol * DECAY_TO, rt);
        g.setTargetAtTime(0, rt, rel / 3);
      } catch (_) {}
      const stopAt = rt + rel + 0.05;
      oscs.forEach((o) => { try { o.stop(stopAt); } catch (_) {} });
      if (lfo) { try { lfo.stop(stopAt); } catch (_) {} }
      const cleanup = () => this._voices.delete(voice);
      oscs[0].onended = cleanup;
      setTimeout(cleanup, (stopAt - ctx.currentTime) * 1000 + 60);
    };

    this._voices.add(voice);
    return voice;
  }

  // 世代が変わったら即resolve（stopAll後の古いawaitを切る）
  _waitGen(ms, gen) {
    return new Promise((res) => {
      const end = performance.now() + Math.max(0, ms);
      const tick = () => {
        if (this._gen !== gen) return res();
        if (performance.now() >= end) return res();
        setTimeout(tick, 16);
      };
      tick();
    });
  }

  async playNote({ freq, dur = 1.0, vol = 0.8, vibrato = false }) {
    await this.ensureRunning();
    const gen = this._gen;
    const t0 = this.ctx.currentTime + 0.01;
    const voice = this._makeVoice(freq, vol, vibrato, t0);
    const relAt = t0 + Math.max(dur, ATTACK);
    voice.release(relAt);
    const totalMs = (relAt + RELEASE - this.ctx.currentTime) * 1000;
    return this._waitGen(totalMs, gen);
  }

  async playSequence(notes, { vol = 0.8 } = {}) {
    await this.ensureRunning();
    const gen = this._gen;
    for (const n of notes) {
      if (this._gen !== gen) return;
      await this.playNote({ freq: n.freq, dur: n.dur ?? 0.6, vol });
      if (n.gap && this._gen === gen) await this._waitGen(n.gap * 1000, gen);
    }
  }

  async playDoubleStop({ f1, f2, dur = 2.0, vol = 0.7 }) {
    return this.playChord({ freqs: [f1, f2], dur, vol });
  }

  // 2〜3声同時。同一t0で開始。
  async playChord({ freqs, dur = 1.6, vol = 0.55, vibrato = false }) {
    await this.ensureRunning();
    if (!Array.isArray(freqs) || (freqs.length !== 2 && freqs.length !== 3)) {
      throw new TypeError('playChord: freqs must be length 2 or 3');
    }
    if (freqs.some((f) => !Number.isFinite(f) || f <= 0)) {
      throw new TypeError('playChord: freqs must be positive finite numbers');
    }
    const gen = this._gen;
    const t0 = this.ctx.currentTime + 0.01;
    const voiceVol = Math.min(1, vol);
    const voices = freqs.map((f) => this._makeVoice(f, voiceVol, vibrato, t0));
    const relAt = t0 + Math.max(dur, ATTACK);
    voices.forEach((v) => v.release(relAt));
    const totalMs = (relAt + RELEASE - this.ctx.currentTime) * 1000;
    return this._waitGen(totalMs, gen);
  }

  _trackFx(node) {
    this._fxNodes.add(node);
    const clear = () => this._fxNodes.delete(node);
    try {
      node.onended = clear;
    } catch (_) {}
    setTimeout(clear, 1200);
  }

  // 子ども快感系SFX。刺激音停止後に呼ぶ前提。≦350ms。
  playFx(name) {
    if (!this.ctx) this.ensureRunning();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.005;
    const dest = this.master || ctx.destination;

    const tone = (freq, start, len, peak = 0.22, type = 'sine') => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.connect(g);
      g.connect(dest);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      o.start(start);
      o.stop(start + len + 0.03);
      this._trackFx(o);
    };

    switch (name) {
      case 'correct': // ピロン 明るい2音（~280ms）
        tone(1046.5, now, 0.12, 0.26, 'triangle'); // C6
        tone(1568.0, now + 0.09, 0.16, 0.22, 'triangle'); // G6
        break;
      case 'wrong': // ポヨン 柔らかい下向き（~220ms）
        tone(392, now, 0.1, 0.16, 'sine'); // G4
        tone(293.7, now + 0.08, 0.12, 0.12, 'sine'); // D4
        break;
      case 'fanfare':
      case 'newBest': // キラキラ小祝（~320ms）
        tone(784, now, 0.1, 0.2, 'triangle');
        tone(988, now + 0.08, 0.1, 0.2, 'triangle');
        tone(1318.5, now + 0.16, 0.14, 0.18, 'triangle');
        break;
      case 'select':
      case 'tap':
        // 短いピッ
        tone(1320, now, 0.028, 0.14, 'sine');
        break;
      default:
        break;
    }
  }

  setVolume(v) {
    const vol = Math.max(0, Math.min(1, Number(v)));
    this._volume = Number.isFinite(vol) ? vol : this._volume;
    if (this.master) this.master.gain.value = this._volume ?? 0.9;
  }

  // 刺激＋SFXを即フェード。古いawaitも世代で切る。
  stopAll() {
    this._gen += 1;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of Array.from(this._voices)) {
      v.release(now, true);
    }
    for (const n of Array.from(this._fxNodes)) {
      try {
        n.stop(now);
      } catch (_) {}
      this._fxNodes.delete(n);
    }
  }
}

export function unlockOnFirstGesture(synth) {
  const handler = () => {
    synth.ensureRunning();
    document.removeEventListener('touchend', handler);
    document.removeEventListener('click', handler);
  };
  document.addEventListener('touchend', handler, { once: true });
  document.addEventListener('click', handler, { once: true });
}
