// 演出 — pop / shake / listen ripple / clear flash（紙吹雪・星は使わない）

export function pop(el) {
  if (!el) return;
  el.classList.remove('fx-pop');
  void el.offsetWidth;
  el.classList.add('fx-pop');
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('fx-shake');
  void el.offsetWidth;
  el.classList.add('fx-shake');
}

/** 聴くボタン中心から同心円リップル。voices = 位相ずらし数（和音の構成音数） */
export function listenRipple(anchor, voices = 1) {
  if (!anchor) return;
  const host = anchor.parentElement || anchor;
  const n = Math.max(1, Math.min(4, Number(voices) || 1));
  for (let i = 0; i < n; i++) {
    const ring = document.createElement('span');
    ring.className = 'listen-ripple';
    ring.style.animationDelay = `${i * 0.09}s`;
    host.appendChild(ring);
    const kill = () => ring.remove();
    ring.addEventListener('animationend', kill, { once: true });
    setTimeout(kill, 900 + i * 90);
  }
}

/** 正解時：面が一瞬クリアに抜ける */
export function clearFlash(container) {
  if (!container) return;
  const flash = document.createElement('div');
  flash.className = 'fx-clear-flash';
  container.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove(), { once: true });
  setTimeout(() => flash.remove(), 500);
}

/** 互換のため残すが実体は無効 */
export function confetti() {}
export function starBurst() {}
