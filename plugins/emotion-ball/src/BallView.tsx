/**
 * EmotionBall v2 — React 包装层
 *
 * 用 useRef 持有引擎实例，props 驱动 emotion 切换。
 * 主题色注入：读取 Polaris CSS 变量 --primary 等。
 * 鼠标注视：监听容器 mousemove。
 */

import React from 'react'
import { EmotionEngine, type EngineOpts } from './engine'
import type { AppearanceConfig } from './types'

export interface EmotionBallProps {
  emotion?: string
  shape?: 'blob' | 'wedge' | 'gem'
  /** 主题色（body）；不传则读 CSS 变量 */
  color?: string
  eyeColor?: string
  eyeScale?: number
  lite?: boolean
  size?: number
  gaze?: boolean
  appearance?: AppearanceConfig
  onReady?: (ball: EmotionEngine) => void
  onEmotionChange?: (id: string) => void
}

export const EmotionBallView = React.memo(function EmotionBallView(props: EmotionBallProps) {
  const {
    emotion = '02', shape = 'blob', color, eyeColor, eyeScale = 1, lite = false,
    size = 200, gaze = true, appearance, onReady, onEmotionChange,
  } = props

  const containerRef = React.useRef<HTMLDivElement>(null)
  const engineRef = React.useRef<EmotionEngine | null>(null)
  const onReadyRef = React.useRef(onReady)
  const onChangeRef = React.useRef(onEmotionChange)
  onReadyRef.current = onReady
  onChangeRef.current = onEmotionChange

  // 读主题色
  const themeColor = React.useMemo(() => {
    if (color) return color
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--primary-500') || getComputedStyle(document.documentElement).getPropertyValue('--primary')
      const s = v.trim()
      if (!s) return '#F3F0EA'
      if (s.startsWith('#')) return s
      // rgb(...) 形式
      const m = s.match(/(\d+)\s+(\d+)\s+(\d+)/)
      if (m) {
        return '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('')
      }
      return '#F3F0EA'
    } catch {
      return '#F3F0EA'
    }
  }, [color])

  // 创建引擎
  React.useEffect(() => {
    if (!containerRef.current) return
    const opts: EngineOpts = {
      emotion,
      shape,
      color: appearance?.bodyColor || themeColor,
      eyeColor,
      eyeScale,
      lite,
      appearance,
      autostart: !lite, // 画廊静态帧省电，主球动画
    }
    const eng = new EmotionEngine(containerRef.current, opts)
    engineRef.current = eng
    eng.on('change', (e: any) => {
      onChangeRef.current?.(e.id)
    })
    onReadyRef.current?.(eng)

    return () => {
      eng.destroy()
      engineRef.current = null
    }
    // 仅创建一次（依赖故意留空，靠 ref 同步 emotion）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换情绪
  React.useEffect(() => {
    engineRef.current?.setEmotion(emotion)
  }, [emotion])

  // 外观配置同步
  React.useEffect(() => {
    engineRef.current?.setAppearance(appearance)
  }, [appearance])

  // 鼠标注视
  React.useEffect(() => {
    if (!gaze) return
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => engineRef.current?.setGaze(nx, ny))
    }
    el.addEventListener('mousemove', onMove)
    const onLeave = () => engineRef.current?.setGaze(0, 0)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [gaze])

  const appBg = appearance?.background

  return React.createElement('div', {
    ref: containerRef,
    style: {
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...(appBg ? { background: appBg } : {}),
    },
    'aria-label': 'AI emotion ball',
  })
})
