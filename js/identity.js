// タイトル／アイコンの選択肢（設定から任意変更・初回必須ゲートにしない）

export const TITLES = [
  { id: 'noctune', label: 'NOCTUNE', tag: 'ear precision' },
  { id: 'cyanote', label: 'CYANOTE', tag: 'cyan note lab' },
  { id: 'pitchline', label: 'PITCH//LINE', tag: 'cut the pitch' },
  { id: 'aural', label: 'AURAL SHIFT', tag: 'shift detection' },
  { id: 'echo', label: 'ECHO MODE', tag: 'listen only' },
];

export const ICONS = [
  { id: 'slash', label: 'SLASH', src: 'assets/icons/noctune-icon-slash.png' },
  { id: 'fork', label: 'FORK', src: 'assets/icons/noctune-icon-fork.png' },
  { id: 'arcs', label: 'ARCS', src: 'assets/icons/noctune-icon-arcs.png' },
];

export function resolveTitle(settings = {}) {
  return TITLES.find((t) => t.id === settings.titleId) || TITLES[0];
}

export function resolveIcon(settings = {}) {
  return ICONS.find((i) => i.id === settings.iconId) || ICONS[0];
}
