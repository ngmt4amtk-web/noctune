// UI部品（深海トーン向け）

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
    [icon ? el('span', {}, icon) : null, el('span', {}, label)]
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
 * onSubmit({ pcs, labels }) — 音は鳴らさない
 */
export function pitchSetPicker(input, onSubmit) {
  const selected = new Map(); // pc -> label
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
  const track = el('div', { class: 'hud-progress-track' }, fill);
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
  }

  update(initial);
  return { el: root, update };
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
      el('div', { class: 'game-icon' }, mode.icon),
      el('div', { class: 'game-body' }, [
        el('div', { class: 'game-title' }, mode.title),
        el('div', { class: 'game-subtitle' }, mode.subtitle || ''),
      ]),
      el(
        'div',
        { class: 'game-best' },
        best
          ? [el('div', { class: 'game-best-label' }, 'BEST'), el('div', { class: 'game-best-value' }, best.display)]
          : el('div', { class: 'game-best-play' }, '▶')
      ),
    ]
  );
}

export { el };
