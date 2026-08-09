/**
 * 禅房 - Canvas 小僧动画组件
 *
 * 用 Canvas 2D 绘制像素风格小和尚，替代字符表情 ( -_- ) 等。
 * 四种状态：
 *   - idle：闭眼、轻微呼吸（上下浮动）
 *   - content：睁眼微笑、身体微微前倾
 *   - sleepy：犯困、头一点一点
 *   - happy：开心、眼睛弯成月牙、小幅跳跃
 *
 * 仅面板激活时运行 requestAnimationFrame，卸载时停止。
 */

import { createElement as h, useEffect, useRef } from 'react'

const MONK_COLORS = {
  skin: '#f5c99b',
  skinShadow: '#e0a877',
  robe: '#8a9a8a',
  robeShadow: '#6f7f6f',
  face: '#f7d4a8',
  eyeClosed: '#3a3a3a',
  eyeOpen: '#2a2a2a',
  mouth: '#c96f5a',
  blush: '#e8a08a',
  bead: '#c96f5a',
}

const W = 120
const H = 120

function drawMonk(ctx, t, mood, isSleeping) {
  ctx.clearRect(0, 0, W, H)

  // 呼吸浮动偏移
  const breathe = isSleeping ? 0 : Math.sin(t * 0.002) * 2
  const bob = mood === 'happy' ? Math.abs(Math.sin(t * 0.006)) * 6 : 0

  // 水平翻转处理（happy 时轻微左右晃）
  const sway = mood === 'happy' ? Math.sin(t * 0.004) * 2 : 0

  ctx.save()
  ctx.translate(W / 2 + sway, H / 2 + breathe + bob)

  const cx = 0
  const cy = 0

  // ── 僧袍（梯形主体） ──
  ctx.fillStyle = MONK_COLORS.robe
  ctx.beginPath()
  ctx.moveTo(-34, 18)
  ctx.lineTo(-22, 52)
  ctx.lineTo(22, 52)
  ctx.lineTo(34, 18)
  ctx.closePath()
  ctx.fill()
  // 僧袍阴影
  ctx.fillStyle = MONK_COLORS.robeShadow
  ctx.beginPath()
  ctx.moveTo(-22, 52)
  ctx.lineTo(0, 52)
  ctx.lineTo(0, 18)
  ctx.lineTo(-22, 18)
  ctx.closePath()
  ctx.fill()

  // ── 圆头 ──
  ctx.fillStyle = MONK_COLORS.skin
  ctx.beginPath()
  ctx.arc(cx, cy - 2, 24, 0, Math.PI * 2)
  ctx.fill()

  // 头顶（发髻/光头高光）
  ctx.fillStyle = MONK_COLORS.skinShadow
  ctx.beginPath()
  ctx.arc(cx, cy - 20, 9, Math.PI, Math.PI * 2)
  ctx.fill()

  // ── 眼睛（按状态） ──
  ctx.strokeStyle = MONK_COLORS.eyeClosed
  ctx.lineWidth = 2
  ctx.lineCap = 'round'

  if (mood === 'happy') {
    // 弯成月牙的开心眼
    ctx.strokeStyle = MONK_COLORS.eyeClosed
    ctx.beginPath()
    ctx.arc(cx - 9, cy - 2, 5, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx + 9, cy - 2, 5, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
  } else if (mood === 'content' || mood === 'idle' && !isSleeping) {
    // 睁眼：两个圆点
    ctx.fillStyle = MONK_COLORS.eyeOpen
    ctx.beginPath()
    ctx.arc(cx - 9, cy - 2, 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + 9, cy - 2, 2.4, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // 闭眼 / 犯困：两条横线
    ctx.beginPath()
    ctx.moveTo(cx - 13, cy - 2)
    ctx.lineTo(cx - 5, cy - 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx + 5, cy - 2)
    ctx.lineTo(cx + 13, cy - 2)
    ctx.stroke()
  }

  // ── 脸红 ──
  ctx.fillStyle = MONK_COLORS.blush
  ctx.globalAlpha = isSleeping ? 0.4 : 0.3
  ctx.beginPath()
  ctx.arc(cx - 15, cy + 6, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + 15, cy + 6, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  // ── 嘴巴 ──
  ctx.strokeStyle = MONK_COLORS.mouth
  ctx.lineWidth = 1.6
  if (mood === 'sleepy') {
    // 犯困：小圆嘴（打哈欠）
    ctx.beginPath()
    ctx.arc(cx, cy + 8, 3, 0, Math.PI * 2)
    ctx.stroke()
  } else if (mood === 'happy') {
    // 开心：上扬嘴
    ctx.beginPath()
    ctx.arc(cx, cy + 6, 5, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
  } else {
    // 平静：短横线
    ctx.beginPath()
    ctx.moveTo(cx - 4, cy + 8)
    ctx.lineTo(cx + 4, cy + 8)
    ctx.stroke()
  }

  // ── 眉心红点 ──
  ctx.fillStyle = MONK_COLORS.bead
  ctx.beginPath()
  ctx.arc(cx, cy - 14, 1.8, 0, Math.PI * 2)
  ctx.fill()

  // ── 犯困 zzz ──
  if (mood === 'sleepy') {
    ctx.fillStyle = MONK_COLORS.eyeClosed
    ctx.font = '10px monospace'
    ctx.fillText('z', 20 + Math.sin(t * 0.003) * 2, -18)
    ctx.fillText('Z', 30 + Math.sin(t * 0.003) * 3, -26)
  }

  ctx.restore()
}

/**
 * 小僧 Canvas 组件
 * @param mood 当前心情（idle/content/sleepy/happy）
 * @param size 画布尺寸（像素，默认 120）
 */
export function MonkCanvas({ mood = 'idle', size = 120 }) {
  const canvasRef = useRef(null)
  const moodRef = useRef(mood)
  moodRef.current = mood

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isSleeping = moodRef.current === 'sleepy'
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    let raf = 0
    const start = performance.now()
    const loop = (now) => {
      const t = now - start
      drawMonk(ctx, t, moodRef.current, isSleeping)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => cancelAnimationFrame(raf)
  }, [size])

  return h('canvas', {
    ref: canvasRef,
    style: { width: size, height: size },
    width: size,
    height: size,
  })
}