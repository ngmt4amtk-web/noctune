export const TITLES = [
  { id: 'otomusubi', label: 'おとむすび', tag: 'EAR TRAINING' },
  { id: 'otonoha', label: 'オトノハ', tag: 'LISTEN & ANSWER' },
  { id: 'noctune', label: 'NOCTUNE', tag: 'PRECISION' },
];

export const ICONS = [
  { id: 'slash', label: 'RING', src: 'assets/icons/noctune-icon-slash.png' },
  { id: 'warm', label: 'NOTE', src: 'assets/icons/otomusubi-icon.png' },
  { id: 'fork', label: 'FORK', src: 'assets/icons/noctune-icon-fork.png' },
  { id: 'arcs', label: 'WAVE', src: 'assets/icons/noctune-icon-arcs.png' },
];

export function resolveTitle(settings = {}) {
  return TITLES.find((t) => t.id === settings.titleId) || TITLES[0];
}

export function resolveIcon(settings = {}) {
  return ICONS.find((i) => i.id === settings.iconId) || ICONS[0];
}
