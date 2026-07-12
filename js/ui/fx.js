// 演出用の最小JS。実体はCSSアニメ（style.css の fx-*/confetti-*/burst-* を参照）

/** 正解などの「ポン」アニメを要素に付け直す */
export function pop(el) {
  if (!el) return;
  el.classList.remove('fx-pop');
  void el.offsetWidth; // 再付与のためreflowを挟む
  el.classList.add('fx-pop');
}

/** 不正解の横シェイクアニメ */
export function shake(el) {
  if (!el) return;
  el.classList.remove('fx-shake');
  void el.offsetWidth;
  el.classList.add('fx-shake');
}

const CONFETTI_COLORS = ['#ff9f5a', '#ffc94d', '#45b787', '#7c9cff', '#ff6b6b'];

/** container内に紙吹雪を散らして自動消滅させる */
export function confetti(container, count = 20) {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const width = rect.width || 240;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const left = Math.random() * width;
    const delay = Math.random() * 0.2;
    const duration = 0.9 + Math.random() * 0.6;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.left = `${left}px`;
    piece.style.background = color;
    piece.style.animationDelay = `${delay}s`;
    piece.style.animationDuration = `${duration}s`;
    piece.style.transform = `rotate(${Math.random() * 60 - 30}deg)`;
    container.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove(), { once: true });
    // 保険: animationendが飛ばないブラウザ向けにタイムアウトでも消す
    setTimeout(() => piece.remove(), (delay + duration + 0.3) * 1000);
  }
}

/** container中央からn個の★を放射状に飛ばす */
export function starBurst(container, n = 3) {
  if (!container) return;
  const radius = 70;
  for (let i = 0; i < n; i++) {
    const star = document.createElement('div');
    star.className = 'burst-star';
    star.textContent = '★';
    const angle = (Math.PI * 2 * i) / Math.max(n, 1) - Math.PI / 2;
    const bx = Math.cos(angle) * radius;
    const by = Math.sin(angle) * radius;
    star.style.setProperty('--bx', `${bx}px`);
    star.style.setProperty('--by', `${by}px`);
    star.style.animationDelay = `${i * 0.08}s`;
    star.style.animationDuration = '0.7s';
    container.appendChild(star);
    star.addEventListener('animationend', () => star.remove(), { once: true });
    setTimeout(() => star.remove(), (i * 0.08 + 1.0) * 1000);
  }
}
