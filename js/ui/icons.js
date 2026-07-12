/** Inline SVG icons — no emoji. Stroke icons, cyan ink. */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.75',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

function svg(inner, view = '0 0 24 24') {
  const attrs = Object.entries(STROKE)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="20" height="20" aria-hidden="true" ${attrs}>${inner}</svg>`;
}

const PATHS = {
  settings: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.05 5.05l1.56 1.56M17.39 17.39l1.56 1.56M5.05 18.95l1.56-1.56M17.39 6.61l1.56-1.56"/>'
  ),
  back: svg('<path d="M15 5L8 12l7 7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  play: svg('<path d="M9 7.5v9l8-4.5z" fill="currentColor" stroke="none"/>'),
  ok: svg('<circle cx="12" cy="12" r="7"/><path d="M8.5 12.2l2.3 2.3 4.7-5"/>'),
  ng: svg('<circle cx="12" cy="12" r="7"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
};

/**
 * @param {string} name
 * @param {{ class?: string, size?: number }} [opts]
 */
export function iconHtml(name, opts = {}) {
  let html = PATHS[name] || PATHS.close;
  if (opts.size) {
    html = html.replace(/width="20"/, `width="${opts.size}"`).replace(/height="20"/, `height="${opts.size}"`);
  }
  return html;
}

export function iconEl(name, opts = {}) {
  const wrap = document.createElement('span');
  wrap.className = opts.class || 'ui-icon';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = iconHtml(name, opts);
  return wrap;
}

export function isImageIcon(src) {
  return typeof src === 'string' && /\.(png|webp|jpg|jpeg|svg)$/i.test(src);
}
