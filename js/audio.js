// バイオリン音源エンジン（Web Audio・発音専用・マイク不使用）
// 契約: docs/CONTRACTS.md「js/audio.js」節 / I-03

const ATTACK = 0.025; // 立ち上がり 25ms
const RELEASE = 0.18; // リリース 180ms
const DECAY_TO = 0.8; // アタック後、この比率まで軽く減衰
const DECAY_TIME = 0.35; // 減衰にかける秒数
// 加算合成の部分音（sine）: 基音1.0 / 2倍0.35 / 3倍0.12 / 4倍0.05
const PARTIALS = [1.0, 0.35, 0.12, 0.05];
const PARTIAL_NORM = 0.6; // 合算のヘッドルーム確保（クリップ防止）

export class Synth {
  constructor() {
    // AudioContextは遅延生成（iOS対策）
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this._voices = new Set(); // 進行中の声部（{gain, oscs, stop}）
    this._unlocked = false;
    this._volume = null; // setVolumeで設定。未設定はmaster既定(0.9)
  }

  // 初回タップから呼ぶ想定。resume + iOS無音アンロック
  async ensureRunning() {
    if (!this.ctx) this._build();
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch (_) { /* 連打時の例外を無視 */ }
    if (!this._unlocked) this._silentUnlock();
    return this.ctx;
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    // マスター: DynamicsCompressor（重音のクリップ防止）→ destination
    this.comp = this.ctx.createDynamicsCompressor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._volume != null ? this._volume : 0.9;
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    // interrupted→復帰時に自動resume（iOS Safari）
    this.ctx.addEventListener?.('statechange', () => {
      if (this.ctx.state === 'interrupted' || this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    });
  }

  // iOS無音バッファ再生でアンロック
  _silentUnlock() {
    try {
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      this._unlocked = true;
    } catch (_) { /* 失敗しても継続 */ }
  }

  // 1声部を構築。startTimeで発音、返り値でリリース制御
  // 加算合成: 部分音sineを4本、固定振幅比で混ぜ→ローパスで丸め→包絡ゲイン。
  // 全声部が同一の部分音構成なので、純正重音なら各倍音同士も同時にうなりゼロ、
  // ズレると倍音間でうなりが聴こえる（チューナー基準音のような澄んだ音）。
  // 第5引数は旧chorus互換の受け口（加算合成では未使用・両声部同構成を保証）。
  _makeVoice(freq, vol, vibrato, t0, _legacy = true) {
    const ctx = this.ctx;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;

    // わずかなローパス(≈3kHz)で高次のギラつきを抑える
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    lp.Q.value = 0.5;

    lp.connect(voiceGain);
    voiceGain.connect(this.master);

    // 部分音sine 4本（基音の整数倍）。各々を固定振幅比でローパスへ混ぜる
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

    // ビブラート（vibrato=true時のみ 5.5Hz・±12cents）。全部分音へ比例適用
    let lfo = null, lfoGain = null;
    if (vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      lfoGain = ctx.createGain();
      lfoGain.gain.value = 12; // detuneはcent単位
      lfo.connect(lfoGain);
      oscs.forEach((o) => lfoGain.connect(o.detune));
      lfo.start(t0);
    }

    // 包絡: attack 25ms で vol → 0.35s かけて 0.8*vol へ軽く減衰 → サスティン
    const g = voiceGain.gain;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(vol, t0 + ATTACK);
    g.linearRampToValueAtTime(vol * DECAY_TO, t0 + ATTACK + DECAY_TIME);

    oscs.forEach((o) => o.start(t0));

    const voice = { voiceGain, oscs, lfo, released: false };
    // リリース関数
    voice.release = (when) => {
      if (voice.released) return;
      voice.released = true;
      const rt = Math.max(when, ctx.currentTime);
      try {
        g.cancelScheduledValues(rt);
        // rt時点の値を確定させる（未来rtでg.value=0を読むとクリック＋RELEASE無効化）。
        // cancelAndHoldでランプ途中も正しく保持。非対応環境はサスティンvolで代替。
        if (typeof g.cancelAndHoldAtTime === 'function') {
          g.cancelAndHoldAtTime(rt);
        } else {
          g.setValueAtTime(vol * DECAY_TO, rt); // 非対応環境: サスティン値で保持
        }
        g.setTargetAtTime(0, rt, RELEASE / 3);
      } catch (_) {}
      const stopAt = rt + RELEASE + 0.05;
      oscs.forEach((o) => { try { o.stop(stopAt); } catch (_) {} });
      if (lfo) { try { lfo.stop(stopAt); } catch (_) {} }
      const cleanup = () => this._voices.delete(voice);
      oscs[0].onended = cleanup;
      setTimeout(cleanup, (stopAt - ctx.currentTime) * 1000 + 60);
    };

    this._voices.add(voice);
    return voice;
  }

  // 単音。resolveは発音終了時
  async playNote({ freq, dur = 1.0, vol = 0.8, vibrato = false }) {
    await this.ensureRunning();
    const t0 = this.ctx.currentTime + 0.01;
    const voice = this._makeVoice(freq, vol, vibrato, t0);
    const relAt = t0 + Math.max(dur, ATTACK);
    voice.release(relAt);
    const totalMs = (relAt + RELEASE - this.ctx.currentTime) * 1000;
    return this._wait(totalMs);
  }

  // 順次再生。gapは音間の無音秒
  async playSequence(notes, { vol = 0.8 } = {}) {
    await this.ensureRunning();
    for (const n of notes) {
      await this.playNote({ freq: n.freq, dur: n.dur ?? 0.6, vol });
      if (n.gap) await this._wait(n.gap * 1000);
    }
  }

  // 重音（2声同時）。うなりが明瞭に聴こえること（最重要）
  // 両声部とも同一の加算合成構成: 純正時は各倍音同士も同時にうなりゼロ、
  // ズレ時だけ倍音間でうなる。刺激純度を守る
  async playDoubleStop({ f1, f2, dur = 2.0, vol = 0.7 }) {
    await this.ensureRunning();
    const t0 = this.ctx.currentTime + 0.01;
    const v = Math.min(1, vol); // 加算合成は基音が強いので追加ブースト不要
    const v1 = this._makeVoice(f1, v, false, t0);
    const v2 = this._makeVoice(f2, v, false, t0);
    const relAt = t0 + Math.max(dur, ATTACK);
    v1.release(relAt);
    v2.release(relAt);
    const totalMs = (relAt + RELEASE - this.ctx.currentTime) * 1000;
    return this._wait(totalMs);
  }

  // 短い効果音（await不要）。耳トレ刺激と帯域が被らない短いUIスナップ中心
  playFx(name) {
    if (!this.ctx) { this.ensureRunning(); }
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.005;
    const dest = this.master || ctx.destination;

    // ノイズバースト（音程感なし）
    const noise = (start, len, peak = 0.22, hp = 1800) => {
      const n = Math.max(1, Math.floor(ctx.sampleRate * len));
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = hp;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      src.connect(f);
      f.connect(g);
      g.connect(dest);
      src.start(start);
      src.stop(start + len + 0.02);
    };

    const click = (freq, start, len, peak = 0.18) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(dest);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, start + len);
      o.start(start);
      o.stop(start + len + 0.02);
    };

    switch (name) {
      case 'correct': // ~120ms 高域シュッ＋短いスナップ（音程メロディなし）
        noise(now, 0.07, 0.2, 2200);
        click(2400, now + 0.02, 0.05, 0.12);
        break;
      case 'wrong': // ~140ms 低めキャンセル（罰ブザーにしない）
        noise(now, 0.09, 0.14, 400);
        click(220, now, 0.11, 0.1);
        break;
      case 'fanfare':
      case 'newBest': // 短い上昇ノイズ＋白線的クリック（アルペジオ禁止）
        noise(now, 0.06, 0.16, 1600);
        click(1800, now + 0.05, 0.05, 0.1);
        noise(now + 0.08, 0.07, 0.18, 2400);
        click(2800, now + 0.1, 0.06, 0.1);
        break;
      case 'select':
      case 'tap':
        click(1600, now, 0.018, 0.12);
        break;
      default:
        break;
    }
  }

  // マスター音量(0..1)を設定。ctx未生成でも記憶し_build時に反映（I-12統合の許可改修）
  setVolume(v) {
    const vol = Math.max(0, Math.min(1, Number(v)));
    this._volume = Number.isFinite(vol) ? vol : this._volume;
    if (this.master) this.master.gain.value = this._volume ?? 0.9;
  }

  // 進行中の全声部をリリース付きで即時停止
  stopAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of Array.from(this._voices)) {
      v.release(now);
    }
  }

  _wait(ms) {
    return new Promise((res) => setTimeout(res, Math.max(0, ms)));
  }
}

// documentに一度だけ登録。初回ジェスチャで resume + 無音再生
export function unlockOnFirstGesture(synth) {
  const handler = () => {
    synth.ensureRunning();
    document.removeEventListener('touchend', handler);
    document.removeEventListener('click', handler);
  };
  document.addEventListener('touchend', handler, { once: true });
  document.addEventListener('click', handler, { once: true });
}
