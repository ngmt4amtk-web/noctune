// UI部品 — NOCTUNE 斜めガラス／画像アイコン

import { iconEl, isImageIcon } from './icons.js?v=0718a1';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') node.innerHTML = value;
    else if (key === 'style') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, v);
        else node.style[prop] = v;
      }
    } else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function bigButton(label, onClick, opts = {}) {
  const { variant = 'primary', icon = null, disabled = false } = opts;
  return el(
    'button',
    {
      class: `btn btn-${variant}`,
      onclick: onClick,
      disabled: disabled ? 'disabled' : null,
      type: 'button',
    },
    [icon ? (typeof icon === 'string' ? el('span', {}, icon) : icon) : null, el('span', {}, label)]
  );
}

export function iconButton(name, onClick, opts = {}) {
  return el(
    'button',
    {
      class: `icon-btn${opts.class ? ` ${opts.class}` : ''}`,
      type: 'button',
      'aria-label': opts.label || name,
      onclick: onClick,
    },
    iconEl(name, { size: opts.size || 18 })
  );
}

export function answerGrid(options, onPick, opts = {}) {
  const cols = opts.cols || (options.length === 12 ? 3 : 2);
  const grid = el('div', { class: `answer-grid${cols === 3 ? ' cols3' : ''}` });
  options.forEach((opt, index) => {
    const label = typeof opt === 'string' ? opt : opt.label;
    const value = typeof opt === 'string' ? opt : opt.value;
    const btn = el(
      'button',
      {
        class: 'answer-btn',
        type: 'button',
        'data-index': String(index),
        onclick: () => onPick(value, index),
      },
      label
    );
    grid.appendChild(btn);
  });
  return grid;
}

/**
 * 12音トグル選択 → 規定数で「答える」
 */
export function pitchSetPicker(input, onSubmit) {
  const selected = new Map();
  const required = input.requiredCount || 2;
  const wrap = el('div', { class: 'pitch-set' });
  const grid = el('div', { class: 'answer-grid cols3' });
  const hint = el('div', { class: 'pitch-set-hint' }, `あと ${required} 音選ぶ`);
  const submit = el('button', { class: 'btn btn-primary pitch-set-submit', type: 'button', disabled: 'disabled' }, input.submitLabel || '答える');

  function refresh() {
    const left = required - selected.size;
    hint.textContent = left > 0 ? `あと ${left} 音選ぶ` : `${required} 音選択中`;
    if (left === 0) submit.removeAttribute('disabled');
    else submit.setAttribute('disabled', 'disabled');
    grid.querySelectorAll('.answer-btn').forEach((btn) => {
      const pc = Number(btn.dataset.pc);
      btn.classList.toggle('is-selected', selected.has(pc));
      const atCap = selected.size >= required && !selected.has(pc);
      btn.classList.toggle('is-disabled', atCap);
      btn.disabled = atCap;
    });
  }

  for (const opt of input.options || []) {
    const pc = typeof opt === 'object' ? opt.pc : opt;
    const label = typeof opt === 'object' ? opt.label : String(opt);
    const btn = el(
      'button',
      {
        class: 'answer-btn',
        type: 'button',
        'data-pc': String(pc),
        onclick: () => {
          if (selected.has(pc)) selected.delete(pc);
          else if (selected.size < required) selected.set(pc, label);
          refresh();
        },
      },
      label
    );
    grid.appendChild(btn);
  }

  submit.onclick = () => {
    if (selected.size !== required) return;
    const pcs = [...selected.keys()].sort((a, b) => a - b);
    const labels = pcs.map((pc) => selected.get(pc));
    onSubmit({ kind: 'pitch-set', pcs, labels });
  };

  wrap.append(hint, grid, submit);
  refresh();
  return wrap;
}

export function hud(initial = {}) {
  const fill = el('div', { class: 'hud-progress-fill' });
  const notches = el('div', { class: 'hud-notches' });
  const track = el('div', { class: 'hud-progress-track' }, [fill, notches]);
  const score = el('div', { class: 'hud-score' }, '');
  const combo = el('div', { class: 'hud-combo' }, '');
  const root = el('div', { class: 'hud' }, [track, score, combo]);

  function update(patch = {}) {
    const s = { current: 0, total: 0, score: 0, combo: 0, ...initial, ...patch };
    Object.assign(initial, patch);
    const ratio = s.total > 0 ? Math.min(1, s.current / s.total) : 0;
    fill.style.width = `${Math.round(ratio * 100)}%`;
    score.textContent = `${s.score} pt`;
    combo.textContent = s.combo > 1 ? `×${s.combo}` : '';
    if (s.total > 0 && notches.childElementCount !== s.total) {
      notches.replaceChildren();
      for (let i = 0; i < s.total; i++) {
        notches.appendChild(el('span', { class: 'hud-notch' }));
      }
    }
  }

  update(initial);
  return { el: root, update };
}

function modeIconNode(mode) {
  if (isImageIcon(mode.icon)) {
    return el('div', { class: 'game-icon is-image' }, [
      el('img', { src: mode.icon, alt: '', width: '64', height: '64' }),
    ]);
  }
  return el('div', { class: 'game-icon' }, String(mode.icon || ''));
}

export function gameCard(mode, info, onClick) {
  const best = info && info.best ? info.best : null;
  return el(
    'button',
    {
      class: 'game-card',
      type: 'button',
      style: { '--mode-color': mode.color || 'var(--accent)' },
      onclick: onClick,
    },
    [
      modeIconNode(mode),
      el('div', { class: 'game-body' }, [
        el('div', { class: 'game-title' }, mode.title),
        el('div', { class: 'game-subtitle' }, mode.subtitle || ''),
      ]),
      el(
        'div',
        { class: 'game-best' },
        best
          ? [el('div', { class: 'game-best-label' }, 'BEST'), el('div', { class: 'game-best-value' }, best.display)]
          : iconEl('chevron', { size: 16, class: 'game-best-play' })
      ),
    ]
  );
}

/** Setup option panels (和声的 / フリー 等) */
export function optionPanels(item, current, onPick, { disabledValues = new Set() } = {}) {
  const row = el('div', { class: `panel-row${(item.options || []).length <= 2 ? ' dual' : ''}` });
  for (const opt of item.options || []) {
    const active = String(current) === String(opt.value);
    const disabled = disabledValues.has(String(opt.value));
    row.appendChild(
      el(
        'button',
        {
          class: `opt-panel${active ? ' active' : ''}${disabled ? ' is-disabled' : ''}`,
          type: 'button',
          disabled: disabled ? 'disabled' : null,
          onclick: () => {
            if (disabled) return;
            onPick(opt.value);
          },
        },
        [
          el('div', { class: 'opt-panel-label' }, opt.label),
          opt.sub ? el('div', { class: 'opt-panel-sub' }, opt.sub) : null,
        ]
      )
    );
  }
  return row;
}

export { el };
