// 画面遷移
import { bigButton, gameCard, streakBar, tipCard, el } from './components.js';
import { confetti, starBurst } from './fx.js';
import { TITLES, ICONS, resolveTitle, resolveIcon } from '../identity.js';

let deps = null;

function app() {
  return document.getElementById('app');
}

function mount(node) {
  app().replaceChildren(node);
}

function todaysTip() {
  const list = deps.tips;
  if (Array.isArray(list) && list.length > 0) {
    const idx = (deps.state.tipCursor || 0) % list.length;
    return list[idx];
  }
  return 'ちょっと聴いて、当てる。それだけで耳は育つ。';
}

function brand() {
  const title = resolveTitle(deps.state.settings);
  const icon = resolveIcon(deps.state.settings);
  return el('div', { class: 'brand' }, [
    el('img', { class: 'brand-icon', src: icon.src, alt: title.label, width: '36', height: '36' }),
    el('div', {}, [
      el('div', { class: 'brand-name' }, title.label),
      el('div', { class: 'brand-tag' }, title.tag),
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
  return config;
}

function rememberConfig(modeId, config) {
  if (!deps.state.lastConfig) deps.state.lastConfig = {};
  deps.state.lastConfig[modeId] = { ...config };
}

function configLabel(mode, config) {
  const parts = [];
  for (const item of setupItems(mode)) {
    const opt = item.options?.find((o) => String(o.value) === String(config?.[item.key]));
    if (opt) parts.push(opt.label);
  }
  return parts.join(' / ') || mode.subtitle || '';
}

function renderHome() {
  const list = el('div', { class: 'game-list' });
  for (const mode of deps.modes) {
    list.appendChild(gameCard(mode, { best: bestFor(mode) }, () => nav.show('setup', { modeId: mode.id })));
  }

  const top = el('div', { class: 'top-row' }, [
    brand(),
    el('button', { class: 'icon-btn', type: 'button', onclick: () => nav.show('settings') }, '⚙'),
  ]);

  mount(
    el('div', { class: 'screen home' }, [
      top,
      streakBar(deps.state.streak?.count || 0),
      list,
      tipCard(todaysTip()),
    ])
  );
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
    el('button', { class: 'icon-btn', type: 'button', onclick: () => nav.show('home') }, '←'),
    el('div', { class: 'screen-title' }, mode.title),
    el('div', { style: { width: '44px' } }),
  ]);

  const banner = el('div', { class: 'setup-banner', style: { '--mode-color': mode.color || 'var(--accent)' } }, [
    el('div', { class: 'setup-icon' }, mode.icon),
    el('div', { class: 'setup-sub' }, mode.subtitle || ''),
  ]);

  const pick = (key, value) => {
    config[key] = value;
    rememberConfig(modeId, config);
    deps.synth?.playFx?.('select');
    renderSetup(params);
  };

  const blocks = el('div', { class: 'setup-blocks' });
  const hints = [];
  for (const item of setupItems(mode)) {
    if (item.hint) hints.push(item.hint);
    const row = el('div', { class: 'chip-row wrap' });
    for (const opt of item.options || []) {
      const active = String(config[item.key]) === String(opt.value);
      row.appendChild(
        el('button', { class: `chip${active ? ' active' : ''}`, type: 'button', onclick: () => pick(item.key, opt.value) }, opt.label)
      );
    }
    blocks.appendChild(el('div', { class: 'settings-block' }, [el('div', { class: 'settings-label' }, item.label), row]));
  }

  const children = [top, banner];
  if (hints.length) children.push(el('div', { class: 'setup-hint' }, hints.join(' ')));
  children.push(blocks);
  children.push(
    el(
      'div',
      { class: 'setup-start' },
      bigButton('はじめる', () => {
        rememberConfig(modeId, config);
        nav.show('play', { modeId, config });
      }, { variant: 'primary' })
    )
  );

  mount(el('div', { class: 'screen setup', style: { '--mode-color': mode.color || 'var(--accent)' } }, children));
}

function renderPlay(params = {}) {
  const { modeId, config } = params;
  const mode = deps.modes.find((m) => m.id === modeId);

  const header = el('div', { class: 'play-header' }, [
    el(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        onclick: () => {
          deps.onRoundFinish?.(null);
          nav.show('home');
        },
      },
      '✕'
    ),
    el('div', { class: 'play-header-body' }, [
      el('div', { class: 'play-mode-title' }, mode ? `${mode.icon} ${mode.title}` : ''),
      el('div', { class: 'play-config-label' }, mode ? configLabel(mode, config) : ''),
    ]),
  ]);

  const roundRoot = el('div', { id: 'round-root' }, el('div', { class: 'round-placeholder' }, 'じゅんび中…'));
  mount(el('div', { class: 'screen play', style: { '--mode-color': mode?.color || 'var(--accent)' } }, [header, roundRoot]));
}

function statBox(value, label) {
  return el('div', { class: 'stat-box card' }, [
    el('div', { class: 'stat-value' }, value),
    el('div', { class: 'stat-label' }, label),
  ]);
}

function renderResult(params = {}) {
  const {
    modeId,
    config,
    accuracy = 0,
    score = 0,
    newBadges = [],
    summary,
    record = null,
    newBest = false,
  } = params;
  const mode = deps.modes.find((m) => m.id === modeId);

  const recordDisplay =
    record && typeof record.display === 'string'
      ? record.display
      : record && Number.isFinite(record.value)
      ? formatRecordValue(mode, record.value)
      : null;

  const burstZone = el('div', { class: 'result-burst-zone' });
  const heroChildren = [burstZone];
  if (newBest) heroChildren.push(el('div', { class: 'best-badge' }, 'じこベスト！'));
  if (recordDisplay) {
    heroChildren.push(el('div', { class: 'record-value' }, recordDisplay));
    heroChildren.push(el('div', { class: 'record-label' }, 'きろく'));
  }
  heroChildren.push(el('div', { class: 'result-title' }, mode ? `${mode.icon} ${mode.title}` : 'おつかれ！'));
  const hero = el('div', { class: 'result-hero card', style: { '--mode-color': mode?.color || 'var(--accent)' } }, heroChildren);

  const stats = el('div', { class: 'result-stats' }, [
    statBox(`${Math.round(accuracy * 100)}%`, 'せいかい'),
    statBox(String(score), 'ポイント'),
  ]);

  const children = [hero, stats, streakBar(deps.state.streak?.count || 0)];

  if (summary?.detail) {
    children.push(el('div', { class: 'card detail-card' }, summary.detail));
  }

  if (newBadges.length > 0) {
    const row = el('div', { class: 'badge-row' });
    for (const b of newBadges) if (b) row.appendChild(el('div', { class: 'badge-pill' }, [b.icon, ' ', b.name]));
    children.push(row);
  }

  children.push(tipCard(todaysTip()));

  children.push(
    el('div', { class: 'result-actions' }, [
      bigButton('もういっかい', () => nav.show('play', { modeId, config }), { variant: 'primary' }),
      el('div', { class: 'btn-row' }, [
        bigButton('せってい', () => nav.show('setup', { modeId }), { variant: 'ghost' }),
        bigButton('ホーム', () => nav.show('home'), { variant: 'ghost' }),
      ]),
    ])
  );

  mount(el('div', { class: 'screen result' }, children));

  if (newBest) {
    deps.synth?.playFx?.('newBest');
    starBurst(burstZone, 5);
    confetti(hero);
  } else {
    starBurst(burstZone, 3);
  }
}

function renderSettings() {
  const s = deps.state.settings || {
    a4: 442,
    noteStyle: 'doremi',
    volume: 0.8,
    titleId: 'otomusubi',
    iconId: 'slash',
  };

  const top = el('div', { class: 'top-row' }, [
    el('button', { class: 'icon-btn', type: 'button', onclick: () => nav.show('home') }, '←'),
    el('div', { class: 'screen-title' }, 'せってい'),
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

  const titleBlock = chipRow(
    'アプリ名',
    TITLES.map((t) => ({ label: t.label, value: t.id })),
    s.titleId || 'otomusubi',
    (v) => {
      s.titleId = v;
      deps.onSettingsChange?.({ titleId: v });
    }
  );

  const iconGrid = el('div', { class: 'identity-grid' });
  for (const icon of ICONS) {
    const active = (s.iconId || 'slash') === icon.id;
    iconGrid.appendChild(
      el(
        'button',
        {
          class: `identity-option${active ? ' active' : ''}`,
          type: 'button',
          onclick: () => {
            deps.synth?.playFx?.('select');
            s.iconId = icon.id;
            deps.onSettingsChange?.({ iconId: icon.id });
            renderSettings();
          },
        },
        [el('img', { src: icon.src, alt: icon.label, width: '56', height: '56' }), el('div', { class: 'id-label' }, icon.label)]
      )
    );
  }
  const iconBlock = el('div', { class: 'settings-block' }, [
    el('div', { class: 'settings-label' }, 'アイコン'),
    iconGrid,
  ]);

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
    '音名',
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
  const volumeBlock = el('div', { class: 'settings-block' }, [el('div', { class: 'settings-label' }, 'おんりょう'), volumeInput]);

  const about = el('div', { class: 'settings-block' }, [
    el('div', { class: 'settings-label' }, 'このアプリ'),
    el(
      'p',
      { class: 'about-text' },
      'おとむすびは、聴いて当てるだけの耳トレ。音当て・和音当て・音程比較・ハモリ判定。マイク不要。みみクエストの別アプリ。'
    ),
  ]);

  mount(el('div', { class: 'screen settings' }, [top, titleBlock, iconBlock, a4Block, noteStyleBlock, volumeBlock, about]));
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
