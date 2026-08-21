/**
 * EmotionBall v3 — 渲染层
 *
 * 原创实现 SVG 球体渲染：
 * - 眼白椭圆 + 黑色瞳孔圆 + 白色高光（替代 v2 48 点眼环球面投影）
 * - 多种嘴巴类型（SVG path 绘制）
 * - 身体径向渐变（高光偏左上）+ 暗角 + 腮红
 * - 3D 轨道彩带、撒花粒子、zzz 睡眠粒子（保留 v2 精华）
 *
 * 不复制任何第三方代码，基于计算机图形学公知方法独立实现。
 */

import { HEAD_C, TAU, clamp, lerp, ringPath, genBlobBody, lerpColor, shade, hexToRgb } from './geometry'
import { DEFAULT_BODY, DEFAULT_EYE, DEFAULT_MOUTH } from './emotions'
import type { BodyPose, EyePose, MouthPose, MouthType } from './emotions'
import type { AppearanceConfig } from './types'

const SVGNS = 'http://www.w3.org/2000/svg'

export interface Pose {
  body: BodyPose
  left: EyePose
  right: EyePose
  mouth: MouthPose
}

export function defaultPose(): Pose {
  return {
    body: { ...DEFAULT_BODY },
    left: { ...DEFAULT_EYE },
    right: { ...DEFAULT_EYE },
    mouth: { ...DEFAULT_MOUTH },
  }
}

export function clonePose(p: Pose): Pose {
  return {
    body: { ...p.body },
    left: { ...p.left },
    right: { ...p.right },
    mouth: { ...p.mouth },
  }
}

/** 创建 SVG 元素 */
function el(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const node = document.createElementNS(SVGNS, tag)
  for (const k in attrs) node.setAttribute(k, attrs[k])
  return node as SVGElement
}

/** r2 格式化 */
function r2(v: number): string { return Math.round(v * 100) / 100 + '' }

/** 随机 [a,b] */
function rand(a: number, b: number): number { return a + Math.random() * (b - a) }

const CONFETTI_COLORS = ['#f9705c', '#5b95f0', '#3fbe86', '#f5b13f', '#9a72ee', '#35c3bd']

export interface BallOpts {
  shape?: 'blob' | 'wedge' | 'gem'
  color?: string
  eyeColor?: string
  lite?: boolean
  label?: string
}

/**
 * 球体渲染器 —— v3 眼白+瞳孔+嘴巴方案
 */
export class BallRenderer {
  private id: string
  private lite: boolean
  private shapeRing: number[][]

  // SVG 骨架
  svg: SVGSVGElement
  private defs: SVGDefsElement
  private bodyG: SVGGElement
  private fxBack: SVGGElement
  private fxFront: SVGGElement
  private head: SVGPathElement
  private stopA: SVGStopElement
  private stopB: SVGStopElement
  private stopC: SVGStopElement
  private curColor = ''

  // 眼睛 —— 眼白 + 瞳孔 + 高光 × 2
  private eyeWhiteL: SVGEllipseElement
  private eyeWhiteR: SVGEllipseElement
  private pupilL: SVGCircleElement
  private pupilR: SVGCircleElement
  private highlightL: SVGEllipseElement
  private highlightR: SVGEllipseElement
  private highlightL2: SVGCircleElement
  private highlightR2: SVGCircleElement
  // 上眼睑遮罩（用于眯眼/闭眼效果）
  private lidL: SVGPathElement
  private lidR: SVGPathElement

  // 嘴巴
  private mouthG: SVGGElement
  private mouthPath: SVGPathElement

  // 腮红
  private cheekL: SVGEllipseElement
  private cheekR: SVGEllipseElement

  // 彩带
  private trails: any[] = []
  private planes: any[] = []
  private planeG = 4
  private baseHue = 0
  private spawnIdx = 0
  private wasFast = false
  private prevYaw = 0
  private prevNow = 0

  // 撒花
  private confPieces: any[] = []

  // 轮廓缓存
  private silRows: number[][] = []
  private silMinY = 1e9
  private silMaxY = -1e9

  // zzz
  private zzzNodes: SVGTextElement[] | null = null

  constructor(container: HTMLElement, opts: BallOpts = {}) {
    this.id = 'eb' + (Math.random().toString(36).slice(2, 9))
    this.lite = !!opts.lite

    // 身体轮廓
    const shapeName = opts.shape || 'blob'
    if (shapeName === 'blob') {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C, 108, 0.012)
    } else if (shapeName === 'wedge') {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C + 12, 100, 0)
    } else {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C, 100, 0.04)
    }

    // 轮廓采样
    for (const p of this.shapeRing) {
      if (p[1] < this.silMinY) this.silMinY = p[1]
      if (p[1] > this.silMaxY) this.silMaxY = p[1]
    }
    this.buildSil()

    // SVG 骨架
    const svg = el('svg', {
      viewBox: '-16 -16 252 252',
      width: '100%',
      height: '100%',
      role: 'img',
      'aria-label': opts.label || 'AI emotion ball',
    }) as unknown as SVGSVGElement
    ;(svg.style as any).display = 'block'
    ;(svg.style as any).overflow = 'visible'
    this.svg = svg

    const defs = el('defs', {}) as unknown as SVGDefsElement
    this.defs = defs

    // 主体径向渐变
    const grad = el('radialGradient', { id: this.id + 'g', cx: '38%', cy: '30%', r: '78%' }) as unknown as SVGElement
    this.stopA = el('stop', { offset: '0%' }) as unknown as SVGStopElement
    this.stopB = el('stop', { offset: '55%' }) as unknown as SVGStopElement
    this.stopC = el('stop', { offset: '100%' }) as unknown as SVGStopElement
    grad.appendChild(this.stopA)
    grad.appendChild(this.stopB)
    grad.appendChild(this.stopC)
    defs.appendChild(grad)

    // 边缘暗角
    const rim = el('radialGradient', { id: this.id + 'r', cx: '50%', cy: '50%', r: '50%' }) as unknown as SVGElement
    const rimA = el('stop', { offset: '70%' }) as unknown as SVGStopElement
    const rimB = el('stop', { offset: '100%' }) as unknown as SVGStopElement
    rimA.setAttribute('stop-color', 'rgba(0,0,0,0)')
    rimB.setAttribute('stop-color', 'rgba(0,0,0,0.18)')
    rim.appendChild(rimA)
    rim.appendChild(rimB)
    defs.appendChild(rim)

    // 眼睑遮罩裁剪区域
    const clipL = el('clipPath', { id: this.id + 'cl' }) as unknown as SVGElement
    this.lidL = el('path', { d: 'M0 0h220v220H0Z' }) as unknown as SVGPathElement
    clipL.appendChild(this.lidL)
    defs.appendChild(clipL)
    const clipR = el('clipPath', { id: this.id + 'cr' }) as unknown as SVGElement
    this.lidR = el('path', { d: 'M0 0h220v220H0Z' }) as unknown as SVGPathElement
    clipR.appendChild(this.lidR)
    defs.appendChild(clipR)

    svg.appendChild(defs)

    this.fxBack = el('g', { 'pointer-events': 'none' }) as unknown as SVGGElement
    svg.appendChild(this.fxBack)

    this.bodyG = el('g', {}) as unknown as SVGGElement
    // 身体
    this.head = el('path', {
      d: ringPath(this.shapeRing),
      fill: 'url(#' + this.id + 'g)',
      stroke: 'none',
    }) as unknown as SVGPathElement
    this.bodyG.appendChild(this.head)
    // 暗角层
    const rimLayer = el('path', {
      d: ringPath(this.shapeRing),
      fill: 'url(#' + this.id + 'r)', stroke: 'none',
      'pointer-events': 'none',
    }) as unknown as SVGPathElement
    this.bodyG.appendChild(rimLayer)
    // 高光覆盖层（立体感）
    const gloss = el('path', {
      d: ringPath(this.shapeRing),
      fill: 'url(#' + this.id + 'g)', stroke: 'none', opacity: '0.35',
      'pointer-events': 'none',
      transform: 'translate(0 0) scale(0.92)',
      'transform-origin': '110px 110px',
    }) as unknown as SVGPathElement
    ;(gloss.style as any).mixBlendMode = 'overlay'
    this.bodyG.appendChild(gloss)

    // ====== 眼睛（婴儿比例：大、低、圆）======
    // 眼白
    this.eyeWhiteL = el('ellipse', {
      cx: r2(HEAD_C - 26), cy: r2(HEAD_C + 6), rx: '20', ry: '22',
      fill: '#FFFFFF', stroke: 'none', opacity: '1',
    }) as unknown as SVGEllipseElement
    this.eyeWhiteR = el('ellipse', {
      cx: r2(HEAD_C + 26), cy: r2(HEAD_C + 6), rx: '20', ry: '22',
      fill: '#FFFFFF', stroke: 'none', opacity: '1',
    }) as unknown as SVGEllipseElement
    this.bodyG.appendChild(this.eyeWhiteL)
    this.bodyG.appendChild(this.eyeWhiteR)

    // 瞳孔
    this.pupilL = el('circle', {
      cx: r2(HEAD_C - 26), cy: r2(HEAD_C + 6), r: '10',
      fill: '#1A1A1A', stroke: 'none',
    }) as unknown as SVGCircleElement
    this.pupilR = el('circle', {
      cx: r2(HEAD_C + 26), cy: r2(HEAD_C + 6), r: '10',
      fill: '#1A1A1A', stroke: 'none',
    }) as unknown as SVGCircleElement
    this.bodyG.appendChild(this.pupilL)
    this.bodyG.appendChild(this.pupilR)

    // 高光（瞳孔左上角，一大一小双高光更萌）
    this.highlightL = el('ellipse', {
      rx: '3.2', ry: '4',
      fill: 'rgba(255,255,255,0.95)', stroke: 'none',
      'pointer-events': 'none',
    }) as unknown as SVGEllipseElement
    this.highlightR = el('ellipse', {
      rx: '3.2', ry: '4',
      fill: 'rgba(255,255,255,0.95)', stroke: 'none',
      'pointer-events': 'none',
    }) as unknown as SVGEllipseElement
    this.bodyG.appendChild(this.highlightL)
    this.bodyG.appendChild(this.highlightR)

    // 次级小高光（瞳孔右下角）
    this.highlightL2 = el('circle', {
      r: '1.8',
      fill: 'rgba(255,255,255,0.6)', stroke: 'none',
      'pointer-events': 'none',
    }) as unknown as SVGCircleElement
    this.highlightR2 = el('circle', {
      r: '1.8',
      fill: 'rgba(255,255,255,0.6)', stroke: 'none',
      'pointer-events': 'none',
    }) as unknown as SVGCircleElement
    this.bodyG.appendChild(this.highlightL2)
    this.bodyG.appendChild(this.highlightR2)

    // ====== 嘴巴 ======
    this.mouthG = el('g', { 'pointer-events': 'none' }) as unknown as SVGGElement
    this.mouthPath = el('path', {
      fill: 'none', stroke: '#3A2A22', 'stroke-width': '2.4', 'stroke-linecap': 'round',
    }) as unknown as SVGPathElement
    this.mouthG.appendChild(this.mouthPath)
    this.bodyG.appendChild(this.mouthG)

    // ====== 腮红 ======
    this.cheekL = el('ellipse', {
      cx: r2(HEAD_C - 36), cy: r2(HEAD_C + 24),
      rx: '11', ry: '6.5',
      fill: 'rgba(244,114,108,0.5)', stroke: 'none', opacity: '0',
      'pointer-events': 'none',
    }) as unknown as SVGEllipseElement
    this.cheekR = el('ellipse', {
      cx: r2(HEAD_C + 36), cy: r2(HEAD_C + 24),
      rx: '11', ry: '6.5',
      fill: 'rgba(244,114,108,0.5)', stroke: 'none', opacity: '0',
      'pointer-events': 'none',
    }) as unknown as SVGEllipseElement
    this.bodyG.appendChild(this.cheekL)
    this.bodyG.appendChild(this.cheekR)

    svg.appendChild(this.bodyG)

    this.fxFront = el('g', { 'pointer-events': 'none' }) as unknown as SVGGElement
    svg.appendChild(this.fxFront)

    // zzz 睡眠粒子
    if (!this.lite) {
      this.zzzNodes = []
      for (let i = 0; i < 3; i++) {
        const zn = el('text', {
          x: '0', y: '0', fill: '#A8A296', opacity: '0',
          'font-family': "'Space Grotesk', 'Noto Sans SC', sans-serif",
          'font-weight': '700', 'font-style': 'italic', 'text-anchor': 'middle',
        }) as unknown as SVGTextElement
        zn.textContent = 'z'
        this.fxFront.appendChild(zn)
        this.zzzNodes.push(zn)
      }
    }

    // 初始体色
    const c = opts.color || DEFAULT_BODY.color
    this.setBodyColor(c)

    container.appendChild(svg)
  }

  private buildSil() {
    const SIL_STEP = 2
    const rows = Math.ceil((this.silMaxY - this.silMinY) / SIL_STEP) + 1
    const out: number[][] = []
    for (let r = 0; r < rows; r++) {
      const y = this.silMinY + r * SIL_STEP
      let lo = 1e9, hi = -1e9
      for (let e = 0; e < this.shapeRing.length; e++) {
        const a = this.shapeRing[e]
        const b = this.shapeRing[(e + 1) % this.shapeRing.length]
        const y0 = a[1], y1 = b[1]
        if ((y0 <= y && y1 >= y) || (y1 <= y && y0 >= y)) {
          const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0)
          const x = a[0] + (b[0] - a[0]) * t
          if (x < lo) lo = x
          if (x > hi) hi = x
        }
      }
      if (lo > hi) { lo = HEAD_C - 4; hi = HEAD_C + 4 }
      out.push([lo, hi])
    }
    this.silRows = out
  }

  setBodyColor(color: string) {
    if (color === this.curColor) return
    this.curColor = color
    this.stopA.setAttribute('stop-color', shade(color, 0.18))
    this.stopB.setAttribute('stop-color', color)
    this.stopC.setAttribute('stop-color', shade(color, -0.25))
  }

  /** 生成嘴巴 path */
  private buildMouthPath(mouth: MouthPose): string {
    const { type, width, open } = mouth
    const cx = HEAD_C
    const cy = HEAD_C + 30
    const w = 8 + width * 18  // 嘴宽 8-26
    const h = 2 + open * 10   // 嘴高 2-12

    if (type === 'none' || width <= 0.01) return ''

    switch (type) {
      case 'smile':
        return `M${r2(cx - w)} ${r2(cy)} Q${r2(cx)} ${r2(cy - h - 4)} ${r2(cx + w)} ${r2(cy)}`
      case 'happy':
        // 张嘴笑
        if (open > 0.15) {
          const hh = 4 + open * 8
          return `M${r2(cx - w)} ${r2(cy)} Q${r2(cx)} ${r2(cy - hh - 3)} ${r2(cx + w)} ${r2(cy)} Q${r2(cx)} ${r2(cy + hh + 1)} ${r2(cx - w)} ${r2(cy)}`
        }
        return `M${r2(cx - w)} ${r2(cy)} Q${r2(cx)} ${r2(cy - h - 1)} ${r2(cx + w)} ${r2(cy)}`
      case 'sad':
        return `M${r2(cx - w)} ${r2(cy - 2)} Q${r2(cx)} ${r2(cy + h + 2)} ${r2(cx + w)} ${r2(cy - 2)}`
      case 'open':
        return `M${r2(cx - w)} ${r2(cy)} Q${r2(cx)} ${r2(cy + h + 2)} ${r2(cx + w)} ${r2(cy)} Q${r2(cx)} ${r2(cy - h - 2)} ${r2(cx - w)} ${r2(cy)}`
      case 'o':
        return `M${r2(cx - w * 0.6)} ${r2(cy)} A${r2(w * 0.6)} ${r2(3 + open * 5)} 0 1 0 ${r2(cx + w * 0.6)} ${r2(cy)} A${r2(w * 0.6)} ${r2(3 + open * 5)} 0 1 0 ${r2(cx - w * 0.6)} ${r2(cy)}`
      case 'w':
        return `M${r2(cx - w)} ${r2(cy - 2)} Q${r2(cx - w * 0.5)} ${r2(cy + 4)} ${r2(cx)} ${r2(cy - 2)} Q${r2(cx + w * 0.5)} ${r2(cy + 4)} ${r2(cx + w)} ${r2(cy - 2)}`
      case 'flat':
        return `M${r2(cx - w)} ${r2(cy)} L${r2(cx + w)} ${r2(cy)}`
      case 'pout':
        return `M${r2(cx - w)} ${r2(cy)} Q${r2(cx)} ${r2(cy + 2)} ${r2(cx + w)} ${r2(cy)} Q${r2(cx + w * 0.5)} ${r2(cy - 3)} ${r2(cx)} ${r2(cy - 1)}`
      default:
        return `M${r2(cx - w)} ${r2(cy)} Q${r2(cx)} ${r2(cy - 3)} ${r2(cx + w)} ${r2(cy)}`
    }
  }

  /** 设置单只眼睛 */
  private setEye(
    eyeWhite: SVGEllipseElement,
    pupil: SVGCircleElement,
    highlight: SVGEllipseElement,
    highlight2: SVGCircleElement,
    lid: SVGPathElement,
    isLeft: boolean,
    pose: EyePose,
  ) {
    const dir = isLeft ? -1 : 1
    const baseX = HEAD_C + dir * 26 + pose.x
    const baseY = HEAD_C + 6 + pose.y

    const open = clamp(pose.open, 0, 1.5)
    const squint = clamp(pose.squint, 0, 1)
    const rx = 20
    const ry = 22 * open
    const eyeOp = clamp(open, 0, 1)

    // 眼白
    eyeWhite.setAttribute('cx', r2(baseX))
    eyeWhite.setAttribute('cy', r2(baseY))
    eyeWhite.setAttribute('rx', r2(rx))
    eyeWhite.setAttribute('ry', r2(Math.max(ry, 0.5)))
    eyeWhite.setAttribute('opacity', String(eyeOp))

    // 眯眼 / 闭眼：上眼睑遮罩
    const useLid = squint > 0.05 || open < 0.55
    if (useLid) {
      const cutY = baseY - ry * 0.92 + (ry * 1.84) * squint * 0.6 + (open < 0.55 ? ry * (1 - open) * 0.7 : 0)
      // 裁剪区域：单矩形保留 cutY 下方（避免双路径 union 导致全显）
      lid.setAttribute('d', `M-30 ${r2(cutY)} H240 V240 H-30 Z`)
      ;(eyeWhite.style as any).clipPath = `url(#${this.id + (isLeft ? 'cl' : 'cr')})`
    } else {
      ;(eyeWhite.style as any).clipPath = ''
    }

    // 瞳孔
    const lookX = clamp(pose.lookX, -1, 1) * 6
    const lookY = clamp(pose.lookY, -1, 1) * 5
    const pupilR = 10 * (1 - squint * 0.3)
    const px = baseX + lookX
    const py = baseY + lookY
    pupil.setAttribute('cx', r2(px))
    pupil.setAttribute('cy', r2(py))
    pupil.setAttribute('r', r2(Math.max(pupilR, 0.5)))
    pupil.setAttribute('opacity', String(eyeOp))

    // 主高光（左上）
    const hx = px - 3.5
    const hy = py - 4.5
    highlight.setAttribute('cx', r2(hx))
    highlight.setAttribute('cy', r2(hy))
    highlight.setAttribute('rx', r2(3.2 * (1 - squint * 0.2)))
    highlight.setAttribute('ry', r2(4 * (1 - squint * 0.2)))
    highlight.setAttribute('opacity', String(eyeOp))

    // 次级高光（右下，更萌）
    highlight2.setAttribute('cx', r2(px + 3.5))
    highlight2.setAttribute('cy', r2(py + 4))
    highlight2.setAttribute('r', r2(1.8 * (1 - squint * 0.2)))
    highlight2.setAttribute('opacity', String(eyeOp * 0.6))
  }

  applyPose(pose: Pose, yaw = 0, appearance?: AppearanceConfig): number {
    const b = pose.body
    const now = performance.now()

    // 外观覆盖：bodyColor 优先于情绪色，eyeWhite/pupil/mouth/cheek 直接覆盖
    const bodyColor = appearance?.bodyColor || b.color
    const eyeWhiteColor = appearance?.eyeWhite || '#FFFFFF'
    const pupilColor = appearance?.pupil || '#1A1A1A'
    const mouthColor = appearance?.mouth || '#3A2A22'
    const cheekColor = appearance?.cheek || 'rgba(244,114,108,0.5)'

    const [r, g, bl] = hexToRgb(bodyColor)

    // 身体变换
    this.bodyG.setAttribute(
      'transform',
      'translate(' + r2(HEAD_C + b.x) + ' ' + r2(HEAD_C + b.y) + ')' +
        ' rotate(' + r2(b.rotate || 0) + ')' +
        ' scale(' + r2(b.scale) + ')' +
        ' translate(' + r2(-HEAD_C) + ' ' + r2(-HEAD_C) + ')',
    )
    this.setBodyColor(bodyColor)

    // 眼睛
    this.setEye(this.eyeWhiteL, this.pupilL, this.highlightL, this.highlightL2, this.lidL, true, pose.left)
    this.setEye(this.eyeWhiteR, this.pupilR, this.highlightR, this.highlightR2, this.lidR, false, pose.right)

    // 眼白颜色覆盖
    if (appearance?.eyeWhite) {
      this.eyeWhiteL.setAttribute('fill', eyeWhiteColor)
      this.eyeWhiteR.setAttribute('fill', eyeWhiteColor)
    }
    // 瞳孔颜色覆盖
    if (appearance?.pupil) {
      this.pupilL.setAttribute('fill', pupilColor)
      this.pupilR.setAttribute('fill', pupilColor)
    }

    // 嘴巴
    const mouthPath = this.buildMouthPath(pose.mouth)
    if (mouthPath) {
      this.mouthPath.setAttribute('d', mouthPath)
      this.mouthPath.setAttribute('opacity', '1')
      // 用户自定义嘴色优先，否则按暖冷色选
      const isWarm = r > g + 10 && r > bl + 10
      this.mouthPath.setAttribute('stroke', appearance?.mouth || (isWarm ? '#3A2A22' : '#2A2A3A'))
    } else {
      this.mouthPath.setAttribute('opacity', '0')
    }

    // 腮红
    const isWarm = r > g + 15 && r > bl + 15
    const cheekOp = isWarm ? 0.55 : 0
    this.cheekL.setAttribute('fill', cheekColor)
    this.cheekR.setAttribute('fill', cheekColor)
    this.cheekL.setAttribute('opacity', String(cheekOp))
    this.cheekR.setAttribute('opacity', String(cheekOp))

    if (this.lite) return yaw

    const dt = this.prevNow ? clamp((now - this.prevNow) / 1000, 0.001, 0.05) : 1 / 60
    this.prevNow = now

    // zzz 粒子
    if (this.zzzNodes) {
      const zOn = (b.zzz || 0) > 0
      for (let z = 0; z < this.zzzNodes.length; z++) {
        const zn = this.zzzNodes[z]
        if (!zOn) { if (zn.getAttribute('opacity') !== '0') zn.setAttribute('opacity', '0'); continue }
        const zp = (now * 0.00033 + z / 3) % 1
        const zo = (zp < 0.18 ? zp / 0.18 : 1 - (zp - 0.18) / 0.82) * 0.8 * b.zzz
        zn.setAttribute('opacity', String(zo.toFixed(3)))
        zn.setAttribute('font-size', String((12 + zp * 11).toFixed(1)))
        zn.setAttribute('transform',
          'translate(' + r2(180 + zp * 34 + 4 * Math.sin(zp * 9)) + ' ' + r2(48 - zp * 42) + ')' +
          ' rotate(' + r2(-10 + zp * 14) + ')')
      }
    }

    // 彩带
    this.updateTrails(dt)
    // 撒花
    this.updateConfetti(dt)

    return yaw
  }

  // ============ 彩带 ============

  spawnTrailSpin(yawVel: number) {
    if (Math.abs(yawVel) < 2) return
    if (!this.wasFast) { this.makePlanes(); this.wasFast = true }
    this.spawnTrail(this.prevYaw, yawVel > 0 ? 1 : -1)
  }

  private makePlanes() {
    const base = rand(-0.85, 0.85)
    this.planes = [{ tilt: rand(0.16, 0.5), roll: base + rand(-0.12, 0.12) }]
    this.planeG = Math.round(rand(3, 5))
    this.baseHue = rand(0, 360)
    this.spawnIdx = 0
  }

  private spawnTrail(lam0: number, dir: number) {
    if (this.trails.length > 8) return
    const pl = this.planes[0]
    const tierStep = 38 / Math.max(this.planeG - 1, 1)
    const rw = this.planeG <= 3 ? rand(8, 10.5) : this.planeG === 4 ? rand(6.6, 8.6) : rand(5.6, 7.4)
    this.createTrail({
      o: {
        lam: lam0, lamVel: dir * rand(0.5, 1.1),
        tilt: pl.tilt + rand(-0.04, 0.04),
        roll: pl.roll + rand(-0.05, 0.05),
        rad: 116 + this.spawnIdx * tierStep + rand(-1.5, 1.5),
        radVel: rand(0, 2.5),
        follow: rand(0.74, 0.94),
        carry: 0, arc: rand(2.2, 3.4),
      },
      r: rw,
      hue: this.baseHue + (360 * this.spawnIdx) / Math.max(this.planeG, 1) + rand(-14, 14),
    })
    this.spawnIdx++
  }

  spawnOrbit(idx: number) {
    this.createTrail({
      orbit: true,
      o: {
        lam: rand(0, TAU), lamVel: (Math.random() < 0.5 ? -1 : 1) * rand(1.7, 2.3),
        tilt: rand(0.1, 0.22), roll: rand(-0.12, 0.12),
        rad: 124 + idx * 16, radVel: 0, follow: 0.8, carry: 0, arc: rand(2.4, 3.2),
      },
      r: rand(5.5, 7), hue: rand(0, 360),
    })
  }

  private createTrail(cfg: any) {
    if (this.trails.length > 8) return
    const gid = this.id + 'tg' + Math.random().toString(36).slice(2, 7)
    const gradEl = el('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse' }) as unknown as SVGElement
    const stops: SVGStopElement[] = []
    for (let s = 0; s < 5; s++) {
      const st = el('stop', { offset: (s / 4).toFixed(3) }) as unknown as SVGStopElement
      gradEl.appendChild(st)
      stops.push(st)
    }
    this.defs.appendChild(gradEl)
    const fill = 'url(#' + gid + ')'
    const back = el('path', { stroke: 'none', fill, opacity: '0' }) as unknown as SVGPathElement
    const front = el('path', { stroke: 'none', fill, opacity: '0' }) as unknown as SVGPathElement
    this.fxBack.appendChild(back)
    this.fxFront.appendChild(front)
    this.trails.push({
      o: cfg.o, r: cfg.r, life: 0, ret: 0, hist: [],
      orbitMode: !!cfg.orbit, hue: cfg.hue,
      hueSpan: rand(45, 95) * (Math.random() < 0.5 ? 1 : -1),
      hueVel: rand(18, 42) * (Math.random() < 0.5 ? 1 : -1),
      gradEl, stops, back, front,
    })
  }

  private updateTrails(dt: number) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i]; const o = t.o
      o.lam += o.lamVel * dt; o.rad += o.radVel * dt
      o.lamVel *= 0.99; o.radVel *= 0.96
      const p = this.orbitPoint(o, o.lam)
      t.hist.unshift(p)
      const maxHist = 22
      if (t.hist.length > maxHist) t.hist.length = maxHist
      t.hue += t.hueVel * dt
      for (let s = 0; s < t.stops.length; s++) {
        const local = t.hue + (s / (t.stops.length - 1)) * t.hueSpan
        t.stops[s].setAttribute('stop-color', this.hslToHex(local % 360, 0.68, 0.55))
      }
      const a = t.gradEl.getAttribute('id')!
      const first = t.hist[0]; const last = t.hist[t.hist.length - 1] || first
      t.gradEl.setAttribute('x1', r2(first.x)); t.gradEl.setAttribute('y1', r2(first.y))
      t.gradEl.setAttribute('x2', r2(last.x)); t.gradEl.setAttribute('y2', r2(last.y))
      const d = this.trailPath(t.hist, t.r)
      t.front.setAttribute('d', d)
      t.front.setAttribute('opacity', String(t.orbitMode ? 0.85 : Math.max(0, 1 - t.life / 3)))
      t.back.setAttribute('d', d)
      t.back.setAttribute('opacity', String(t.orbitMode ? 0.4 : Math.max(0, 0.5 - t.life / 3)))
      if (!t.orbitMode) {
        t.life += dt
        if (t.life > 3 && t.hist.length <= 1) {
          this.fxBack.removeChild(t.back); this.fxFront.removeChild(t.front); t.gradEl.remove()
          this.trails.splice(i, 1)
        } else if (t.life > 0.4) { t.hist.pop() }
      }
    }
  }

  private trailPath(hist: any[], r: number): string {
    if (hist.length < 2) return ''
    let s = 'M'
    for (let i = 0; i < hist.length; i++) {
      const p = hist[i]; const w = r * (1 - i / hist.length * 0.7)
      s += (i ? 'L' : '') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)
      if (i === 0) s += ' L' + (p.x + w).toFixed(2) + ' ' + p.y.toFixed(2)
    }
    return s
  }

  private orbitPoint(o: any, lam: number) {
    const hx = o.rad * Math.sin(lam); const hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt)
    const ca = Math.cos(o.roll); const sa = Math.sin(o.roll)
    return {
      x: HEAD_C + hx * ca - hy * sa,
      y: HEAD_C + hx * sa + hy * ca,
      z: Math.cos(lam) * Math.cos(o.tilt), l: lam,
    }
  }

  private hslToHex(h: number, s: number, l: number): string {
    h /= 360
    const k = (n: number) => (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
  }

  // ============ 撒花 ============

  burst(n: number) {
    if (this.lite) return
    for (let i = 0; i < n; i++) {
      const ang = rand(0, TAU); const spd = rand(40, 110)
      this.confPieces.push({
        x: HEAD_C + Math.cos(ang) * rand(96, 116),
        y: HEAD_C + Math.sin(ang) * rand(96, 116),
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - rand(20, 75),
        life: 0, max: rand(1.2, 2.4),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        r: rand(3, 5), star: Math.random() < 0.25, node: null as null | SVGPathElement,
      })
    }
  }

  private updateConfetti(dt: number) {
    for (let i = this.confPieces.length - 1; i >= 0; i--) {
      const p = this.confPieces[i]
      p.life += dt
      if (p.life > p.max) { if (p.node) p.node.remove(); this.confPieces.splice(i, 1); continue }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.vx *= 0.99
      const op = Math.max(0, 1 - p.life / p.max)
      if (!p.node) {
        p.node = el('path', { d: this.starPath(), fill: p.color, opacity: String(op) }) as unknown as SVGPathElement
        this.fxFront.appendChild(p.node)
      }
      p.node.setAttribute('opacity', String(op))
      p.node.setAttribute('transform', 'translate(' + r2(p.x) + ' ' + r2(p.y) + ') rotate(' + r2(p.life * 220) + ') scale(' + r2(p.r / 4) + ')')
    }
  }

  private starPath(): string {
    const pts: string[] = []
    for (let e = 0; e < 10; e++) {
      const a = -Math.PI / 2 + (e * Math.PI) / 10
      const r = e % 2 === 0 ? 1 : 0.42
      pts.push((Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3))
    }
    return 'M' + pts.join('L') + 'Z'
  }

  destroy() {
    this.svg.remove()
  }
}