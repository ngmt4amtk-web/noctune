/** NOCTUNE — fixed identity (no title/icon picker). */

export const APP_TITLE = 'NOCTUNE';
export const APP_TAG = 'EAR TRAINING';
export const APP_ICON = 'assets/icons/noctune-icon-fork.png';

/** Allowed question counts in settings (shared). */
export const QUESTION_COUNTS = [5, 10, 20];
export const DEFAULT_QUESTION_COUNT = 10;

export function resolveQuestionCount(settings = {}) {
  const n = Number(settings.questionCount);
  return QUESTION_COUNTS.includes(n) ? n : DEFAULT_QUESTION_COUNT;
}

/** @deprecated compatibility stubs */
export const TITLES = [{ id: 'noctune', label: APP_TITLE, tag: APP_TAG }];
export const ICONS = [{ id: 'fork', label: 'FORK', src: APP_ICON }];

export function resolveTitle() {
  return { id: 'noctune', label: APP_TITLE, tag: APP_TAG };
}

export function resolveIcon() {
  return { id: 'fork', label: 'FORK', src: APP_ICON };
}

export function applyIdentity() {
  document.title = APP_TITLE;
  const metaTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (metaTitle) metaTitle.setAttribute('content', APP_TITLE);
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = APP_ICON;
  const apple = document.querySelector('link[rel="apple-touch-icon"]');
  if (apple) apple.href = APP_ICON;
}
