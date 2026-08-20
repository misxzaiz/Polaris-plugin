/**
 * EmotionBall v2 — 几何生成器
 *
 * 原创实现：用参数化方法生成眼环与身体轮廓，不复制任何第三方数据。
 *
 * 坐标系：viewBox -16 -16 252 252，中心 HEAD_C = 110
 * 眼环 = 48 点闭合折线，由基础椭圆 + 上下弧度参数 + 倾斜组合生成
 */

export const HEAD_C = 110
export const EYE_HALF = 20
export const SVG_VB = '-16 -16 252 252'

/** 2π */
export const TAU = Math.PI * 2

/** 角度 → 弧度 */
export function rad(d: number): number {
  return (d * Math.PI) / 180
}

/** 钳制 */
export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v
}

/** 线性插值 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 逐点插值两个等长点环 */
export function lerpRing(a: number[][], b: number[][], t: number): number[][] {
  const out: number[][] = new Array(a.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = [a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t]
  }
  return out
}

/** 点环质心 */
export function centroid(ring: number[][]): [number, number] {
  let x = 0, y = 0
  for (const p of ring) { x += p[0]; y += p[1] }
  return [x / ring.length, y / ring.length]
}

/** 点环 → 闭合折线 path */
export function ringPath(ring: number[][]): string {
  let s = 'M'
  for (let i = 0; i < ring.length; i++) {
    s += (i ? 'L' : '') + ring[i][0].toFixed(2) + ' ' + ring[i][1].toFixed(2)
  }
  return s + 'Z'
}

/**
 * 生成一个 48 点眼环（单只眼睛）。
 *
 * 原理：基础椭圆，上半弧与下半弧可独立控制开合度，模拟眼睛形状。
 * - cx, cy: 中心
 * - rx, ry: 横纵向半径
 * - openTop, openBot: 上下弧开合 [0=闭合, 1=全开]
 * - tilt: 整体倾斜角度（度）
 * - squish: 闭合时向中线收缩（模拟眯眼）
 *
 * 48 点保证 path 平滑且形变插值时不走样。
 */
export function genEyeRing(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  openTop = 1,
  openBot = 1,
  tilt = 0,
  squish = 0,
): number[][] {
  const N = 48
  const ring: number[][] = []
  const ct = Math.cos(rad(tilt))
  const st = Math.sin(rad(tilt))
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU
    // 上半 (sin>0) 用 openTop, 下半用 openBot
    const sa = Math.sin(a)
    const open = sa >= 0 ? openTop : openBot
    // 闭合时纵向压缩 + 向中线收
    const ryc = ry * (0.04 + 0.96 * open)
    const rxc = rx * (1 - squish * (1 - open))
    let x = Math.cos(a) * rxc
    let y = sa * ryc
    // 倾斜
    const rx2 = x * ct - y * st
    const ry2 = x * st + y * ct
    ring.push([+(cx + rx2).toFixed(2), +(cy + ry2).toFixed(2)])
  }
  return ring
}

/**
 * 生成圆形身体轮廓（48 点）。
 * 可选微扰动让边缘有机感。
 */
export function genBlobBody(
  cx: number,
  cy: number,
  r: number,
  wobble = 0,
): number[][] {
  const N = 48
  const ring: number[][] = []
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU
    // 有机扰动：低频正弦叠加
    const w = 1 + wobble * (Math.sin(a * 3 + 1.1) * 0.4 + Math.sin(a * 5 + 0.3) * 0.3)
    ring.push([
      +(cx + Math.cos(a) * r * w).toFixed(2),
      +(cy + Math.sin(a) * r * w).toFixed(2),
    ])
  }
  return ring
}

/**
 * 颜色工具
 */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function lerpColor(a: string, b: string, t: number): string {
  if (a === b) return b
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t))
}

/** 向白/黑混合 */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  const target = amt < 0 ? 0 : 255
  const a = Math.abs(amt)
  return rgbToHex(
    r + (target - r) * a,
    g + (target - g) * a,
    b + (target - b) * a,
  )
}
