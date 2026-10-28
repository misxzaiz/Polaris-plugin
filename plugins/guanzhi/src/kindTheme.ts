/**
 * 体裁视觉主题（面板三 Tab 共用）：无海报设计——排版化封面（emoji + 体裁渐变）
 */
export const KIND_THEME: Record<string, { emoji: string; grad: string }> = {
  book: { emoji: '📚', grad: 'linear-gradient(135deg,#3D5A80,#29426B)' },
  movie: { emoji: '🎬', grad: 'linear-gradient(135deg,#B0413E,#7A2A28)' },
  tv: { emoji: '📺', grad: 'linear-gradient(135deg,#2A7F7F,#1C5454)' },
  anime: { emoji: '🌸', grad: 'linear-gradient(135deg,#C76B98,#8F4568)' },
  music: { emoji: '🎵', grad: 'linear-gradient(135deg,#7B5CD6,#4F3A99)' },
  game: { emoji: '🎮', grad: 'linear-gradient(135deg,#4E9455,#315E36)' },
  podcast: { emoji: '🎙️', grad: 'linear-gradient(135deg,#B08B3E,#77591F)' },
  other: { emoji: '📦', grad: 'linear-gradient(135deg,#5C6678,#3A4356)' },
}

export const STATUS_CLS: Record<string, string> = {
  wish: 'wish',
  active: 'active',
  done: 'done',
  dropped: 'drop',
}
