// 画面遷移 — NOCTUNE（斜め構図・画面固有レイアウト・絵文字なし）
import { bigButton, gameCard, el, iconButton, optionPanels } from './components.js';
import { iconEl } from './icons.js';
import { APP_TITLE, APP_TAG, APP_ICON, APP_TAGLINE, applyIdentity } from '../identity.js';
import { freqOfMidi, detune } from '../theory.js';
import { isImageIcon } from './icons.js';

let deps = null;

function app() {
  return document.getElementById('app');
}

function mount(node, screenClass) {
  const root = app();
  root.className = `app-root screen-${screenClass || 'home'}`;
  root.replaceChildren(node);
  // 斜めワイプ用の一瞬クラス
  root.classList.remove('wipe-in');
  void root.offsetWidth;
  root.classList.add('wipe-in');
}

function brand() {
  return el('div', { class: 'brand' }, [
    el('img', { class: 'brand-icon', src: APP_ICON, alt: APP_TITLE, width: '40', height: '40' }),
    el('div', {}, [
      el('div', { class: 'brand-name' }, APP_TITLE),
      el('div', { class: 'brand-tag' }, APP_TAG),
    ]),
  ]);
}

function formatRecordValue(mode, value) {
  if (!Number.isFinite(value)) return null;
  if (mode && mode.recordBetter === 'low') return `${value.toFixed(1)}セント`;
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

function bestFor(mode) {
  const rec = deps.state.records?.[mode.id];
  if (!rec || typeof rec !== 'object') return null;
  let best = null;
  for (const key of Object.keys(rec)) {
    const entry = rec[key];
    const value = typeof entry === 'number' ? entry : entry && typeof entry.value === 'number' ? entry.value : null;
    const display = entry && typeof entry === 'object' && typeof entry.display === 'string' ? entry.display : null;
    if (value == null || !Number.isFinite(value)) continue;
    const better = mode.recordBetter === 'low' ? value < (best?.value ?? Infinity) : value > (best?.value ?? -Infinity);
    if (best == null || better) best = { value, display };
  }
  if (!best) return null;
  if (!best.display) best.display = formatRecordValue(mode, best.value);
  return best && best.display ? best : null;
}

function setupItems(mode) {
  return Array.isArray(mode.setup) ? mode.setup : [];
}

function resolvedConfig(mode) {
  const saved = deps.state.lastConfig?.[mode.id] || {};
  const config = {};
  for (const item of setupItems(mode)) {
    const fallback = item.default ?? item.options?.[0]?.value;
    config[item.key] = saved[item.key] ?? fallback;
  }
  // 和声的時は size を強制3
  if (mode.id === 'chord-ate' && config.gen !== 'free') config.size = 3;
  return config;
}

function rememberConfig(modeId, config) {
  if (!deps.state.lastConfig) deps.state.lastConfig = {};
  deps.state.lastConfig[modeId] = { ...config };
}

function configLabel(mode, config) {
  const parts = [];
  for (const item of setupItems(mode)) {
    if (item.key === 'size' && config.gen === 'harmonic') continue;
    const opt = item.options?.find((o) => String(o.value) === String(config?.[item.key]));
    if (opt) parts.push(opt.label);
  }
  return parts.join(' / ') || mode.subtitle || '';
}

function disabledValuesFor(item, config) {
  const set = new Set();
  const dw = item.disableWhen;
  if (!dw) return set;
  const watchKey = Object.keys(dw).find((k) => k !== 'values' && k !== 'reason');
  if (!watchKey) return set;
  if (String(config[watchKey]) === String(dw[watchKey])) {
    for (const v of dw.values || []) set.add(String(v));
  }
  return set;
}

function answerLabel(rec) {
  if (!rec) return '—';
  if (rec.kind === 'pitch-set') return (rec.labels || []).join('・') || '—';
  if (rec.label != null) return String(rec.label);
  return '—';
}

function insightFromLog(modeId, log) {
  if (!Array.isArray(log) || !log.length) return null;
  if (modeId === 'oto-ate') {
    const miss = {};
    for (const row of log) {
      if (row.correct) continue;
      const name = row.expected?.label;
      if (name) miss[name] = (miss[name] || 0) + 1;
    }
    const entries = Object.entries(miss).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '全音名を安定して当てられた';
    return `落としやすい音: ${entries.slice(0, 3).map(([n, c]) => `${n}×${c}`).join(' / ')}`;
  }
  if (modeId === 'chord-ate') {
    let hit = 0;
    let total = 0;
    const missedPc = {};
    const missedRole = {};
    let harmonicQs = 0;
    for (const row of log) {
      const targets = row.detail?.targetPcs || row.expected?.pcs || [];
      const got = new Set(row.response?.pcs || []);
      const roles = row.detail?.chord?.roles || [];
      if (row.detail?.gen === 'harmonic') harmonicQs++;
      for (const pc of targets) {
        total++;
        if (got.has(pc)) hit++;
        else {
          const label = row.expected?.labels?.[targets.indexOf(pc)] || String(pc);
          missedPc[label] = (missedPc[label] || 0) + 1;
          const role = roles.find((r) => r.pc === pc)?.role;
          if (role) missedRole[role] = (missedRole[role] || 0) + 1;
        }
      }
    }
    const rate = total ? Math.round((hit / total) * 100) : 0;
    const miss = Object.entries(missedPc).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const missTxt = miss.length ? `／落ちやすい音 ${miss.map(([n, c]) => `${n}×${c}`).join(' ')}` : '';
    const role = Object.entries(missedRole).sort((a, b) => b[1] - a[1])[0];
    const roleTxt = harmonicQs && role ? `／${role[0]}の取りこぼし ${role[1]}` : '';
    return `構成音の的中 ${hit}/${total}（${rate}%）${missTxt}${roleTxt}`;
  }
  if (modeId === 'micro-ear') {
    const cents = log.map((r) => r.detail?.deltaCents).filter((n) => Number.isFinite(n));
    const ok = log.filter((r) => r.correct);
    const bestOk = ok.map((r) => r.detail?.deltaCents).filter((n) => Number.isFinite(n));
    const minOk = bestOk.length ? Math.min(...bestOk) : null;
    return minOk != null
      ? `正解できた最小差 ${minOk.toFixed(1)}セント（出題幅 ${Math.min(...cents).toFixed(1)}〜${Math.max(...cents).toFixed(1)}）`
      : '今回は正解なし（差の感度はまだ測定中）';
  }
  if (modeId === 'hamori') {
    const pure = log.filter((r) => r.detail?.tuning === 'pure');
    const mis = log.filter((r) => r.detail?.tuning === 'mistuned');
    const pureOk = pure.filter((r) => r.correct).length;
    const misOk = mis.filter((r) => r.correct).length;
    const misCents = mis.filter((r) => r.correct).map((r) => Math.abs(r.detail?.offsetCents || 0));
    const minMis = misCents.length ? Math.min(...misCents) : null;
    const tail = minMis != null ? `／ズレ問で聴き分けた最小 ${minMis.toFixed(1)}セント` : '';
    return `純正 ${pureOk}/${pure.length}・ズレ ${misOk}/${mis.length}${tail}`;
  }
  return null;
}

async function replayPlay(steps) {
  const synth = deps.synth;
  if (!synth || !steps) return;
  const a4 = deps.state.settings?.a4 || 442;
  synth.stopAll();
  await synth.ensureRunning();
  for (const s of steps) {
    if (s.type === 'note') {
      const f = detune(freqOfMidi(s.midi, a4), s.cents || 0);
      await synth.playNote({ freq: f, dur: Math.min(s.dur ?? 1, 1.2) });
    } else if (s.type === 'gap') {
      await new Promise((r) => setTimeout(r, (s.dur ?? 0.3) * 1000));
    } else if (s.type === 'double') {
      const f1 = detune(freqOfMidi(s.midi, a4), s.cents || 0);
      let f2 = s.interval ? (f1 * s.interval[0]) / s.interval[1] : detune(f1, s.cents2 || 0);
      if (s.interval && s.cents2) f2 = detune(f2, s.cents2);
      await synth.playDoubleStop({ f1, f2, dur: Math.min(s.dur ?? 2, 1.6) });
    } else if (s.type === 'chord') {
      const freqs = (s.notes || []).map((n) => detune(freqOfMidi(n.midi, a4), n.cents || 0));
      await synth.playChord({ freqs, dur: Math.min(s.dur ?? 1.6, 1.4) });
    }
  }
}

function renderHome() {
  applyIdentity();
  const hero = el('div', { class: 'home-hero' }, [
    el('div', { class: 'home-hero-mark' }, [
      el('img', { src: APP_ICON, alt: '', width: '72', height: '72' }),
    ]),
    el('h1', { class: 'home-title' }, APP_TITLE),
    el('p', { class: 'home-tagline' }, APP_TAGLINE),
  ]);
  const list = el('div', { class: 'game-list' });
  for (const mode of deps.modes) {
    list.appendChild(gameCard(mode, { best: bestFor(mode) }, () => nav.show('setup', { modeId: mode.id })));
  }
  const top = el('div', { class: 'top-row home-top' }, [
    brand(),
    iconButton('settings', () => nav.show('settings'), { label: '設定' }),
  ]);
  mount(el('div', { class: 'screen home' }, [top, hero, list]), 'home');
}

function renderSetup(params = {}) {
  const { modeId } = params;
  const mode = deps.modes.find((m) => m.id === modeId);
  if (!mode) {
    nav.show('home');
    return;
  }
  const config = resolvedConfig(mode);
  const top = el('div', { class: 'top-row' }, [
    iconButton('back', () => nav.show('home'), { label: '戻る' }),
    el('div', { class: 'screen-title' }, mode.title),
    el('div', { style: { width: '44px' } }),
  ]);

  const bannerChildren = [];
  if (isImageIcon(mode.icon)) {
    bannerChildren.push(el('div', { class: 'setup-bleed', style: { backgroundImage: `url(${mode.icon})` } }));
    bannerChildren.push(
      el('div', { class: 'setup-icon is-image' }, [el('img', { src: mode.icon, alt: '', width: '72', height: '72' })])
    );
  } else {
    bannerChildren.push(el('div', { class: 'setup-icon' }, mode.icon));
  }
  bannerChildren.push(
    el('div', { class: 'setup-copy' }, [
      el('div', { class: 'setup-title' }, mode.title),
      el('div', { class: 'setup-sub' }, mode.subtitle || ''),
    ])
  );
  const banner = el('div', { class: 'setup-banner', style: { '--mode-color': mode.color || 'var(--accent)' } }, bannerChildren);

  const pick = (key, value) => {
    config[key] = value;
    if (key === 'gen' && value === 'harmonic') config.size = 3;
    rememberConfig(modeId, config);
    deps.synth?.playFx?.('select');
    renderSetup(params);
  };

  const blocks = el('div', { class: 'setup-blocks' });
  const hints = [];
  for (const item of setupItems(mode)) {
    if (item.hint) hints.push(item.hint);
    const disabled = disabledValuesFor(item, config);
    // 和声的時に size ブロックごと隠す
    if (item.key === 'size' && config.gen === 'harmonic') continue;

    if (item.layout === 'panels') {
      blocks.appendChild(
        el('div', { class: 'settings-block' }, [
          el('div', { class: 'settings-label' }, item.label),
          optionPanels(item, config[item.key], (v) => pick(item.key, v), { disabledValues: disabled }),
        ])
      );
    } else {
      const row = el('div', { class: 'chip-row wrap' });
      for (const opt of item.options || []) {
        const active = String(config[item.key]) === String(opt.value);
        const isDisabled = disabled.has(String(opt.value));
        row.appendChild(
          el(
            'button',
            {
              class: `chip${active ? ' active' : ''}${isDisabled ? ' is-disabled' : ''}`,
              type: 'button',
              disabled: isDisabled ? 'disabled' : null,
              onclick: () => {
                if (isDisabled) return;
                pick(item.key, opt.value);
              },
            },
            opt.label
          )
        );
      }
      blocks.appendChild(el('div', { class: 'settings-block' }, [el('div', { class: 'settings-label' }, item.label), row]));
    }
  }

  const children = [top, banner];
  if (hints.length) children.push(el('div', { class: 'setup-hint' }, hints.join(' ')));
  children.push(blocks);
  children.push(
    el(
      'div',
      { class: 'setup-start' },
      bigButton('スタート', () => {
        rememberConfig(modeId, config);
        nav.show('play', { modeId, config });
      }, { variant: 'primary' })
    )
  );
  mount(el('div', { class: 'screen setup', style: { '--mode-color': mode.color || 'var(--accent)' } }, children), 'setup');
}

function renderPlay(params = {}) {
  const { modeId, config } = params;
  const mode = deps.modes.find((m) => m.id === modeId);
  const header = el('div', { class: 'play-header' }, [
    iconButton('close', () => {
      deps.onRoundFinish?.(null);
      nav.show('home');
    }, { label: '終了' }),
    el('div', { class: 'play-header-body' }, [
      el('div', { class: 'play-mode-title' }, mode ? mode.title : ''),
      el('div', { class: 'play-config-label' }, mode ? configLabel(mode, config) : ''),
    ]),
  ]);
  const roundRoot = el('div', { id: 'round-root' }, el('div', { class: 'round-placeholder' }, '準備中'));
  mount(
    el('div', { class: 'screen play', style: { '--mode-color': mode?.color || 'var(--accent)' } }, [
      el('div', { class: 'play-surface' }),
      header,
      roundRoot,
    ]),
    'play'
  );
}

function renderResult(params = {}) {
  const {
    modeId,
    config,
    accuracy = 0,
    score = 0,
    summary,
    record = null,
    newBest = false,
    log = [],
  } = params;
  const mode = deps.modes.find((m) => m.id === modeId);
  const recordDisplay =
    record && typeof record.display === 'string'
      ? record.display
      : record && Number.isFinite(record.value)
      ? formatRecordValue(mode, record.value)
      : null;

  const top = el('div', { class: 'top-row' }, [
    iconButton('back', () => nav.show('home'), { label: '戻る' }),
    el('div', { class: 'screen-title' }, '結果'),
    el('div', { style: { width: '44px' } }),
  ]);

  const hero = el('div', { class: 'result-hero glass shear', style: { '--mode-color': mode?.color || 'var(--accent)' } }, [
    el('div', { class: 'result-mode' }, mode ? mode.title : ''),
    el('div', { class: 'result-config' }, mode ? configLabel(mode, config) : ''),
    newBest ? el('div', { class: 'best-badge' }, '自己ベスト更新') : null,
    recordDisplay ? el('div', { class: 'record-value' }, recordDisplay) : el('div', { class: 'record-value' }, `${Math.round(accuracy * 100)}%`),
    el('div', { class: 'record-label' }, recordDisplay ? '記録' : '正答率'),
    el('div', { class: 'result-stats-inline' }, [
      el('span', {}, `${Math.round(accuracy * 100)}%`),
      el('span', { class: 'dot' }, '/'),
      el('span', {}, `${score} pt`),
      el('span', { class: 'dot' }, '/'),
      el('span', {}, `${log.filter((r) => r.correct).length}/${log.length || 0}`),
    ]),
  ]);

  const insight = insightFromLog(modeId, log);
  const insightCard = insight
    ? el('div', { class: 'glass insight-card shear' }, [
        el('div', { class: 'insight-label' }, '聴き分け'),
        el('div', { class: 'insight-text' }, insight),
      ])
    : null;

  const list = el('div', { class: 'result-log' });
  for (const row of log) {
    const expected = answerLabel(row.expected);
    const got = answerLabel(row.response);
    list.appendChild(
      el(
        'button',
        {
          class: `log-row shear ${row.correct ? 'is-ok' : 'is-ng'}`,
          type: 'button',
          onclick: () => {
            deps.synth?.playFx?.('select');
            replayPlay(row.play);
          },
        },
        [
          el('div', { class: 'log-no' }, String(row.no).padStart(2, '0')),
          el('div', { class: 'log-mark' }, row.correct ? iconEl('ok', { size: 14 }) : iconEl('ng', { size: 14 })),
          el('div', { class: 'log-body' }, [
            el('div', { class: 'log-expected' }, expected),
            el('div', { class: 'log-response' }, row.correct ? '正解' : `回答 ${got}`),
          ]),
          el('div', { class: 'log-play' }, iconEl('play', { size: 14 })),
        ]
      )
    );
  }

  const actions = el('div', { class: 'result-actions' }, [
    bigButton('もう一度', () => nav.show('play', { modeId, config }), { variant: 'primary' }),
    el('div', { class: 'btn-row' }, [
      bigButton('設定を変える', () => nav.show('setup', { modeId }), { variant: 'ghost' }),
      bigButton('ホーム', () => nav.show('home'), { variant: 'ghost' }),
    ]),
  ]);

  const children = [top, el('div', { class: 'result-split' }, [hero, insightCard].filter(Boolean))];
  if (summary?.detail) children.push(el('div', { class: 'glass detail-card shear' }, summary.detail));
  children.push(el('div', { class: 'log-heading' }, '全問レビュー'));
  children.push(list);
  children.push(actions);
  mount(el('div', { class: 'screen result' }, children), 'result');
}

function renderSettings() {
  const s = deps.state.settings || { a4: 442, noteStyle: 'doremi', volume: 0.8 };
  const top = el('div', { class: 'top-row' }, [
    iconButton('back', () => nav.show('home'), { label: '戻る' }),
    el('div', { class: 'screen-title' }, '設定'),
    el('div', { style: { width: '44px' } }),
  ]);

  function chipRow(label, options, current, onPick) {
    const row = el('div', { class: 'chip-row wrap' });
    for (const opt of options) {
      const active = String(opt.value) === String(current);
      row.appendChild(
        el(
          'button',
          {
            class: `chip${active ? ' active' : ''}`,
            type: 'button',
            onclick: () => {
              deps.synth?.playFx?.('select');
              onPick(opt.value);
              renderSettings();
            },
          },
          opt.label
        )
      );
    }
    return el('div', { class: 'settings-block' }, [el('div', { class: 'settings-label' }, label), row]);
  }

  const a4Block = chipRow(
    '基準音 A4',
    [
      { label: '440Hz', value: 440 },
      { label: '441Hz', value: 441 },
      { label: '442Hz', value: 442 },
    ],
    s.a4,
    (v) => {
      s.a4 = v;
      deps.onSettingsChange?.({ a4: v });
    }
  );
  const noteStyleBlock = chipRow(
    '音名表記',
    [
      { label: 'ドレミ', value: 'doremi' },
      { label: 'ABC', value: 'abc' },
    ],
    s.noteStyle,
    (v) => {
      s.noteStyle = v;
      deps.onSettingsChange?.({ noteStyle: v });
    }
  );
  const volumeInput = el('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: String(s.volume),
    oninput: (e) => {
      s.volume = Number(e.target.value);
      deps.onSettingsChange?.({ volume: s.volume });
    },
  });

  mount(
    el('div', { class: 'screen settings' }, [
      top,
      el('div', { class: 'settings-identity shear glass' }, [
        el('img', { src: APP_ICON, alt: APP_TITLE, width: '56', height: '56' }),
        el('div', {}, [
          el('div', { class: 'brand-name' }, APP_TITLE),
          el('div', { class: 'brand-tag' }, APP_TAGLINE),
        ]),
      ]),
      a4Block,
      noteStyleBlock,
      el('div', { class: 'settings-block' }, [el('div', { class: 'settings-label' }, '音量'), volumeInput]),
      el('div', { class: 'settings-block' }, [
        el('div', { class: 'settings-label' }, 'このアプリ'),
        el(
          'p',
          { class: 'about-text' },
          'NOCTUNE は聴いて答える耳のトレーニング。音当て・和音当て・音程比較・ハモリ判定。マイク不要。'
        ),
      ]),
    ]),
    'settings'
  );
}

export const nav = {
  current: null,
  init(d) {
    deps = d;
  },
  show(id, params = {}) {
    if (!deps) throw new Error('nav.init(deps) を先に呼んでください');
    nav.current = id;
    if (id === 'home') renderHome();
    else if (id === 'setup') renderSetup(params);
    else if (id === 'play') renderPlay(params);
    else if (id === 'result') renderResult(params);
    else if (id === 'settings') renderSettings();
    else throw new Error(`unknown screen: ${id}`);
  },
};
