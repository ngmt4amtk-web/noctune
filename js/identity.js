// 表示名・アイコン（設定から任意変更・初回必須ゲートなし）

export const TITLES = [
  { id: 'otomusubi', label: 'おとむすび', tag: 'きいて あてる' },
  { id: 'otonoha', label: 'オトノハ', tag: 'おととあそぶ' },
  { id: 'noctune', label: 'NOCTUNE', tag: 'ear precision' },
];

export const ICONS = [
  { id: 'warm', label: 'おんぷ', src: 'assets/icons/otomusubi-icon.png' },
  { id: 'slash', label: 'リング', src: 'assets/icons/noctune-icon-slash.png' },
  { id: 'fork', label: 'フォーク', src: 'assets/icons/noctune-icon-fork.png' },
  { id: 'arcs', label: 'ウェーブ', src: 'assets/icons/noctune-icon-arcs.png' },
];

export function resolveTitle(settings = {}) {
  return TITLES.find((t) => t.id === settings.titleId) || TITLES[0];
}

export function resolveIcon(settings = {}) {
  return ICONS.find((i) => i.id === settings.iconId) || ICONS[0];
}
