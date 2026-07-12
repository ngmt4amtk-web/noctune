// おとむすび エントリ
import { loadState, saveState, recordResult, tipIndexForToday, configKeyOf } from './state.js';
import { Synth, unlockOnFirstGesture } from './audio.js';
import { runRound } from './ui/runner.js';
import { nav } from './ui/screens.js';
import { MODES } from './modes/registry.js';
import { TIPS } from './data/tips.js';

const state = loadState();
tipIndexForToday(state);
const tips = TIPS.map((t) => t.text);

const synth = new Synth();
synth.setVolume(state.settings.volume);
unlockOnFirstGesture(synth);

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
  state.lastConfig[mode.id] = { ...config };
  saveState(state);

  synth.stopAll();
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

function onRoundComplete(result, mode, config) {
  synth.stopAll();
  if (!result) {
    origShow('home');
    return;
  }
  const rec = typeof mode.record === 'function' ? mode.record(result.summary) : null;
  const diff = recordResult(state, mode.id, configKeyOf(config), {
    streakMax: result.streakMax,
    record: rec,
    better: mode.recordBetter || 'low',
  });
  origShow('result', {
    modeId: mode.id,
    config,
    accuracy: result.accuracy,
    score: result.score,
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
  if (id !== 'play') synth.stopAll();
  origShow(id, params);
};

nav.init({
  state,
  synth,
  modes: MODES,
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
  console.error('[otomusubi] error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[otomusubi] unhandled rejection:', e.reason);
});
