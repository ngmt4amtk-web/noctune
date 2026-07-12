// UI部品集。DOM要素を作って返すだけ（状態は持たない・保存はしない）

/** 簡易DOM生成ヘルパー。props.class や props.onClick 等の属性、childrenは配列可 */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') node.innerHTML = value;
    else if (key === 'style') {
      // CSSカスタムプロパティ(--xxx)はObject.assignでは反映されないためsetPropertyを使う
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

/**
 * 大きめの汎用ボタン。opts: {variant:'primary'|'ghost'|'danger', icon, disabled}
 */
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

/**
 * 回答ボタングリッド。options: Array<string | {label, value}>
 * onPick(value, index) がクリック時に呼ばれる。
 * opts.cols で列数を指定。省略時は options 12個で3列（12音グリッド）、それ以外は2列。
 * ボタンは class="answer-btn" data-index を持ち、正誤演出は
 * is-correct / is-wrong / is-disabled クラスを呼び出し側（runner）が付け外しする契約。
 */
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
 * HUD（進捗・スコア・コンボ）。{el, update(patch)} を返す。
 * initial/patch: {current, total, score, combo}
 */
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
    combo.textContent = s.combo > 1 ? `combo ${s.combo}` : '';
  }

  update(initial);
  return { el: root, update };
}

/**
 * ゲームカード（ホームの縦積みカード）。mode: {id,title,subtitle,icon,color}
 * info: {best: {display} | null}
 */
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
          ? [el('div', { class: 'game-best-label' }, 'ベスト'), el('div', { class: 'game-best-value' }, best.display)]
          : el('div', { class: 'game-best-play' }, '▶')
      ),
    ]
  );
}

/**
 * ランク/ヒーローバー。info: {name, icon, xp, prevAt=0, nextAt|null, streak=0}
 * prevAtは現ランクの下限XP（省略時0扱い・バーの精度が落ちるだけで壊れない）
 */
export function rankCard(info) {
  const { name = '', icon = '🥚', xp = 0, prevAt = 0, nextAt = null, streak = 0 } = info;
  const ratio = nextAt ? Math.min(1, Math.max(0, (xp - prevAt) / Math.max(1, nextAt - prevAt))) : 1;
  const caption = nextAt ? `次のランクまで ${Math.max(0, nextAt - xp)} XP` : '最高ランク';
  return el('div', { class: 'card rank-card' }, [
    el('div', { class: 'rank-icon' }, icon),
    el('div', { class: 'rank-body' }, [
      el('div', { class: 'rank-name-row' }, [
        el('div', { class: 'rank-name' }, name),
        el('div', { class: 'streak-badge' }, streak > 0 ? `STREAK ${streak}` : ''),
      ]),
      el('div', { class: 'xp-bar' }, el('div', { class: 'xp-bar-fill', style: { width: `${Math.round(ratio * 100)}%` } })),
      el('div', { class: 'xp-caption' }, caption),
    ]),
  ]);
}

/** きょうの一言。source既定はNOCTUNE向け */
export function tipCard(text, source = 'NOTE') {
  return el('div', { class: 'card tip-card' }, [
    el('div', { class: 'tip-icon' }, '▸'),
    el('div', { class: 'tip-body' }, [
      el('div', { class: 'tip-text' }, text),
      source ? el('div', { class: 'tip-source' }, source) : null,
    ]),
  ]);
}

export { el };
