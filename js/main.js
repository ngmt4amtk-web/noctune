import { loadState, saveState, recordResult, configKeyOf } from './state.js?v=0713a2';
import { Synth, unlockOnFirstGesture } from './audio.js?v=0713a2';
import { runRound } from './ui/runner.js?v=0713a2';
import { nav } from './ui/screens.js?v=0713a2';
import { MODES } from './modes/registry.js?v=0713a2';

const state = loadState();
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
    record: rec,
    better: mode.recordBetter || 'low',
  });
  origShow('result', {
    modeId: mode.id,
    config,
    accuracy: result.accuracy,
    score: result.score,
    summary: result.summary,
    record: diff.record ? { value: diff.record.value, display: diff.record.display } : null,
    newBest: !!(diff.record && diff.record.improved),
    log: result.log || [],
  });
}

nav.show = (id, params = {}) => {
  if (id === 'play') {
    startPlay(params);
    return;
  }
  synth.stopAll();
  origShow(id, params);
};

nav.init({
  state,
  synth,
  modes: MODES,
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
