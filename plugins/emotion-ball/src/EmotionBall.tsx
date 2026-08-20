/**
 * EmotionBall - 纯 CSS 动态情绪球组件
 *
 * 根据 emotion state 展示不同的颜色/动画效果：
 * - idle:      柔和呼吸，中性蓝
 * - thinking:  深邃旋转，蓝紫渐变
 * - streaming: 活跃波动，青蓝
 * - happy:     温暖明亮，橙黄
 * - sad:       忧郁低沉，冷灰蓝
 * - excited:   快速多彩旋转
 * - error:     红色闪烁
 * - listening: 绿色脉冲
 */

import { createElement as h, memo, useMemo } from 'react'

export type EmotionState =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'happy'
  | 'sad'
  | 'excited'
  | 'error'
  | 'listening'

export interface EmotionBallProps {
  /** 当前情绪状态 */
  emotion: EmotionState
  /** 球体尺寸 px，默认 48 */
  size?: number
  /** 紧凑模式 */
  compact?: boolean
}

// ── 每种情绪的颜色配置 ────────────────────────────────────────────────────

interface EmotionConfig {
  primary: string
  secondary: string
  accent: string
  glow: string
  /** CSS animation name */
  anim: string
  /** 标签文字 */
  label: string
}

const EMOTION_CONFIG: Record<EmotionState, EmotionConfig> = {
  idle: {
    primary: '#3b82f6',
    secondary: '#60a5fa',
    accent: 'rgba(59,130,246,0.3)',
    glow: 'rgba(59,130,246,0.15)',
    anim: 'eb-pulse',
    label: 'Idle',
  },
  thinking: {
    primary: '#8b5cf6',
    secondary: '#a78bfa',
    accent: 'rgba(139,92,246,0.3)',
    glow: 'rgba(139,92,246,0.15)',
    anim: 'eb-spin',
    label: 'Thinking',
  },
  streaming: {
    primary: '#06b6d4',
    secondary: '#22d3ee',
    accent: 'rgba(6,182,212,0.3)',
    glow: 'rgba(6,182,212,0.15)',
    anim: 'eb-wave',
    label: 'Streaming',
  },
  happy: {
    primary: '#f59e0b',
    secondary: '#fbbf24',
    accent: 'rgba(245,158,11,0.3)',
    glow: 'rgba(245,158,11,0.15)',
    anim: 'eb-bounce',
    label: 'Happy',
  },
  sad: {
    primary: '#64748b',
    secondary: '#94a3b8',
    accent: 'rgba(100,116,139,0.3)',
    glow: 'rgba(100,116,139,0.1)',
    anim: 'eb-sigh',
    label: 'Sad',
  },
  excited: {
    primary: '#ec4899',
    secondary: '#f472b6',
    accent: 'rgba(236,72,153,0.3)',
    glow: 'rgba(236,72,153,0.15)',
    anim: 'eb-excite',
    label: 'Excited',
  },
  error: {
    primary: '#ef4444',
    secondary: '#f87171',
    accent: 'rgba(239,68,68,0.3)',
    glow: 'rgba(239,68,68,0.15)',
    anim: 'eb-flash',
    label: 'Error',
  },
  listening: {
    primary: '#22c55e',
    secondary: '#4ade80',
    accent: 'rgba(34,197,94,0.3)',
    glow: 'rgba(34,197,94,0.15)',
    anim: 'eb-listen',
    label: 'Listening',
  },
}

// ── 组件 ────────────────────────────────────────────────────────────────────

export const EmotionBall = memo(function EmotionBall({
  emotion,
  size = 48,
  compact = false,
}: EmotionBallProps) {
  const cfg = EMOTION_CONFIG[emotion]
  const s = compact ? Math.max(size * 0.6, 24) : size

  // 内圈尺寸
  const innerSize = s * 0.45
  const innerOffset = (s - innerSize) / 2

  // 动态注入 @keyframes（仅一次）
  return h('div', {
    className: 'eb-root',
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      minHeight: compact ? s + 16 : s + 24,
    },
  },
    // 球体容器
    h('div', {
      style: {
        position: 'relative',
        width: s,
        height: s,
        flexShrink: 0,
      },
      'data-emotion': emotion,
    },
      // 辉光
      h('div', {
        style: {
          position: 'absolute',
          inset: -s * 0.15,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)`,
          animation: `${cfg.anim} 2s ease-in-out infinite`,
          willChange: 'transform, opacity',
        },
      }),
      // 外圈（主色）
      h('div', {
        style: {
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `${Math.max(2, s * 0.06)}px solid ${cfg.primary}`,
          boxShadow: `0 0 ${s * 0.15}px ${cfg.glow}, inset 0 0 ${s * 0.1}px ${cfg.glow}`,
          animation: `${cfg.anim} 2s ease-in-out infinite`,
          willChange: 'transform',
        },
      }),
      // 渐变弧（secondary）
      h('div', {
        style: {
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `${Math.max(2, s * 0.06)}px solid transparent`,
          borderTopColor: cfg.secondary,
          borderRightColor: cfg.accent,
          animation: `${emotion === 'thinking' || emotion === 'excited' ? 'eb-spin' : 'eb-drift'} 1.5s ${emotion === 'excited' ? 'linear' : 'ease-in-out'} infinite`,
          willChange: 'transform',
        },
      }),
      // 内圈
      h('div', {
        style: {
          position: 'absolute',
          top: innerOffset,
          left: innerOffset,
          width: innerSize,
          height: innerSize,
          borderRadius: '50%',
          background: `radial-gradient(circle at 40% 35%, ${cfg.secondary} 0%, ${cfg.primary} 100%)`,
          opacity: 0.8,
          animation: `${cfg.anim} 2s ease-in-out infinite`,
          willChange: 'transform, opacity',
        },
      }),
      // 中心亮点
      h('div', {
        style: {
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: s * 0.12,
          height: s * 0.12,
          marginTop: -s * 0.06,
          marginLeft: -s * 0.06,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.4)',
          animation: 'eb-glow 1.5s ease-in-out infinite',
          willChange: 'transform, opacity',
        },
      }),
    ),
  )
})

// ── 获取情绪配置（外部使用） ──────────────────────────────────────────────

export function getEmotionConfig(state: EmotionState): EmotionConfig {
  return EMOTION_CONFIG[state]
}

export function getEmotionLabel(state: EmotionState): string {
  return EMOTION_CONFIG[state].label
}