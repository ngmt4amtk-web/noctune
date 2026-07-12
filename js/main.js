// アプリのエントリ v2。全モジュールを結線する唯一の場所（docs/V2.md）。
// state読込 → Synth生成 → nav依存注入 → home表示。
// play画面は「枠だけ描くnav.show('play')」をラップし、#round-root へ runner を起動する。
import { loadState, saveState, recordResult, tipIndexForToday, configKeyOf } from './state.js';
import { Synth, unlockOnFirstGesture } from './audio.js';
import { xpToRank } from './engine.js';
import { runRound } from './ui/runner.js';
import { nav } from './ui/screens.js';
import { MODES } from './modes/registry.js';
import { TIPS } from './data/tips.js';

const state = loadState();

// きょうの一言カーソルを当日ぶん前進させる（screensは state.tipCursor % TIPS.length を読む）
tipIndexForToday(state);
const tips = TIPS.map((t) => t.text);

// 音源。初回ジェスチャでアンロック。保存済み音量を反映（ctx生成前でも_build時に適用される）
const synth = new Synth();
synth.setVolume(state.settings.volume);
unlockOnFirstGesture(synth);

// mode.setup の既定値から config を組み立てる（未指定時の防御）
function defaultConfig(mode) {
  const config = {};
  for (const item of mode.setup || []) {
    config[item.key] = item.default ?? item.options?.[0]?.value;
  }
  return config;
}

const origShow = nav.show.bind(nav);

async function startPlay(params = {}) {
  const mode = MODES.find((m) => m.id === params.modeId);
  if (!mode) {
    origShow('home');
    return;
  }
  const config = params.config || state.lastConfig?.[mode.id] || defaultConfig(mode);
  // 前回選択として永続化（setup画面のin-memory書き込みもここで保存される）
  state.lastConfig[mode.id] = { ...config };
  saveState(state);

  // iOS初回無音対策: タップ内で resume を発火させる（ensureRunningは同期的にresume呼び出し）
  const running = synth.ensureRunning();
  origShow('play', { modeId: mode.id, config });
  const container = document.getElementById('round-root');
  if (!container) return;
  container.innerHTML = '';
  await running;
  runRound({
    mode,
    config,
    synth,
    container,
    settings: state.settings,
    onFinish: (result) => onRoundComplete(result, mode, config),
  });
}

// ラウンド終了。result=有効値→記録してリザルト。null=中断（防御的、通常はrunnerが返さない）
function onRoundComplete(result, mode, config) {
  if (!result) {
    synth.stopAll();
    origShow('home');
    return;
  }
  const rec = typeof mode.record === 'function' ? mode.record(result.summary) : null;
  const diff = recordResult(state, mode.id, configKeyOf(config), {
    score: result.score,
    streakMax: result.streakMax,
    record: rec,
    better: mode.recordBetter || 'low',
  });
  origShow('result', {
    modeId: mode.id,
    config,
    accuracy: result.accuracy,
    score: result.score,
    xpGained: diff.xpGained,
    rankAfter: diff.rankAfter,
    newBadges: diff.newBadges,
    summary: result.summary,
    record: diff.record ? { value: diff.record.value, display: diff.record.display } : null,
    newBest: !!(diff.record && diff.record.improved),
  });
}

nav.show = (id, params = {}) => {
  if (id === 'play') {
    startPlay(params);
    return;
  }
  origShow(id, params);
};

nav.init({
  state,
  synth,
  modes: MODES,
  computeRank: xpToRank,
  tips,
  onRoundFinish: () => synth.stopAll(),
  onSettingsChange: (patch) => {
    Object.assign(state.settings, patch);
    saveState(state);
    if ('volume' in patch) synth.setVolume(patch.volume);
  },
});

nav.show('home');

window.addEventListener('error', (e) => {
  console.error('[noctune] error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[noctune] unhandled rejection:', e.reason);
});