/**
 * 禅房 - 动画样式注入
 *
 * 注入所有面板所需的 CSS keyframes。
 * 面板加载时调用一次 ensureZenStyles() 即可。
 */

let injected = false

export function ensureZenStyles() {
  if (injected) return
  injected = true
  const style = document.createElement('style')
  style.textContent = `
    /* ── 木鱼 ── */
    @keyframes muyu-pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(110, 168, 254, 0.4); }
      40% { transform: scale(0.92); box-shadow: 0 0 0 8px rgba(110, 168, 254, 0.1); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(110, 168, 254, 0); }
    }
    @keyframes muyu-ripple {
      0% { transform: scale(0.8); opacity: 0.6; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .muyu-btn {
      position: relative;
      width: 80px; height: 80px;
      border-radius: 50%;
      border: 2px solid var(--border-color, #3f3f46);
      background: radial-gradient(circle at 40% 35%, #d4a76a, #b8864a 50%, #8b6914);
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
      display: flex; align-items: center; justify-content: center;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    .muyu-btn:hover { border-color: var(--accent, #6366f1); box-shadow: 0 0 16px rgba(110, 168, 254, 0.15); }
    .muyu-btn:active { transform: scale(0.96); }
    .muyu-btn.pulse { animation: muyu-pulse 0.3s ease-out; }
    .muyu-btn::before {
      content: ''; position: absolute; top: 50%; left: 50%;
      width: 36px; height: 36px; transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(circle at 45% 40%, rgba(255,255,255,0.25), transparent 60%);
      pointer-events: none;
    }
    .muyu-btn .muyu-eye {
      position: absolute; width: 10px; height: 10px; border-radius: 50%;
      background: #2a1a0a; top: 38%; left: 62%; transform: translate(-50%, -50%);
      box-shadow: 0 0 2px rgba(0,0,0,0.3);
    }
    .muyu-btn .muyu-eye::after {
      content: ''; position: absolute; width: 4px; height: 4px;
      border-radius: 50%; background: white; top: 2px; left: 2px;
    }
    .muyu-btn .muyu-mouth {
      position: absolute; width: 14px; height: 8px;
      border-bottom: 2px solid #5a3a1a; border-radius: 50%;
      bottom: 30%; left: 62%; transform: translateX(-50%);
    }
    .muyu-ripple {
      position: absolute; inset: 0; border-radius: 50%;
      border: 2px solid var(--accent, #6366f1);
      pointer-events: none;
      animation: muyu-ripple 0.5s ease-out forwards;
    }

    /* ── 抽签 ── */
    @keyframes fortune-shake {
      0% { transform: rotate(0deg); }
      10% { transform: rotate(-8deg); }
      20% { transform: rotate(8deg); }
      30% { transform: rotate(-6deg); }
      40% { transform: rotate(6deg); }
      50% { transform: rotate(-4deg); }
      60% { transform: rotate(4deg); }
      70% { transform: rotate(-2deg); }
      80% { transform: rotate(2deg); }
      90% { transform: rotate(-1deg); }
      100% { transform: rotate(0deg); }
    }
    @keyframes fortune-stick-slide {
      0% { transform: translateY(-20px); opacity: 0; }
      50% { opacity: 1; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes fortune-glow {
      0% { filter: brightness(1); }
      50% { filter: brightness(1.15); }
      100% { filter: brightness(1); }
    }
    .fortune-shaking {
      animation: fortune-shake 0.5s ease-in-out;
    }
    .fortune-stick {
      animation: fortune-stick-slide 0.4s ease-out forwards;
      opacity: 0;
    }
    .fortune-card {
      animation: fortune-glow 1.5s ease-in-out 0.3s;
    }
    .fortune-card-inner {
      animation: fortune-stick-slide 0.5s ease-out 0.2s both;
    }

    /* ── 答案之书翻页 ── */
    @keyframes book-cover-open {
      0% { transform: perspective(800px) rotateY(0deg); }
      100% { transform: perspective(800px) rotateY(-180deg); }
    }
    @keyframes book-content-in {
      0% { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes book-page-sway {
      0%, 100% { transform: rotateY(0deg); }
      25% { transform: rotateY(2deg); }
      75% { transform: rotateY(-2deg); }
    }
    .book-cover {
      position: relative;
      width: 100%; max-width: 200px; height: 140px;
      perspective: 800px;
      cursor: pointer;
    }
    .book-cover-inner {
      width: 100%; height: 100%;
      position: relative;
      transform-style: preserve-3d;
      transition: transform 0.6s ease-in-out;
      border-radius: 4px;
    }
    .book-cover.open .book-cover-inner {
      animation: book-cover-open 0.6s ease-in-out forwards;
    }
    .book-front, .book-back {
      position: absolute; inset: 0;
      backface-visibility: hidden;
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; letter-spacing: 2px;
    }
    .book-front {
      background: linear-gradient(135deg, #2d2d3a, #1a1a28);
      border: 1px solid var(--border-color, #3f3f46);
      color: var(--text-color, #e2e8f0);
      z-index: 2;
    }
    .book-back {
      background: var(--bg-background-elevated, #1e1e24);
      border: 1px solid var(--border-color, #3f3f46);
      transform: rotateY(180deg);
      color: var(--text-secondary, #a1a1aa);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.5px;
      padding: 12px;
    }
    .book-content {
      animation: book-content-in 0.4s ease-out 0.5s both;
    }
    .book-body {
      animation: book-page-sway 3s ease-in-out infinite;
    }

    /* ── 通用动画 ── */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.3s ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .muyu-btn.pulse, .muyu-ripple,
      .fortune-shaking, .fortune-stick, .fortune-card,
      .book-cover-inner, .book-content, .book-body {
        animation: none !important;
      }
    }
  `
  document.head.appendChild(style)
}