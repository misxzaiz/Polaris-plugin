/**
 * EmotionBall v2 — 渲染层
 *
 * 原创实现 SVG 球体渲染：
 * - 48 点眼环折线 + 球面投影（经度换算 + 余弦压缩 + 自旋背面隐藏）
 * - 弹簧驱动的眼环形变
 * - 3D 轨道彩带（5-stop 渐变 + 头宽尾细）
 * - 撒花粒子
 *
 * 不复制任何第三方代码，基于计算机图形学公知方法独立实现。
 */

import {
  HEAD_C, EYE_HALF, TAU, clamp, lerp, lerpRing, centroid, ringPath,
  genBlobBody, lerpColor, shade, hexToRgb,
} from './geometry'
import { genEyeRings, DEFAULT_BODY, DEFAULT_EYE } from './emotions'
import type { BodyPose, EyePose, EyeRingSet } from './emotions'

const SVGNS = 'http://www.w3.org/2000/svg'

export interface Pose {
  body: BodyPose
  left: EyePose
  right: EyePose
}

export function defaultPose(): Pose {
  return {
    body: { ...DEFAULT_BODY },
    left: { ...DEFAULT_EYE },
    right: { ...DEFAULT_EYE },
  }
}

export function clonePose(p: Pose): Pose {
  return {
    body: { ...p.body },
    left: { ...p.left },
    right: { ...p.right },
  }
}

interface EyeNode {
  node: SVGPathElement
  ring: number[][]
  c: [number, number]
  lastFill?: string
  lastStroke?: string
  highlight: SVGEllipseElement
}

/** 创建 SVG 元素 */
function el(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const node = document.createElementNS(SVGNS, tag)
  for (const k in attrs) node.setAttribute(k, attrs[k])
  return node as SVGElement
}

/** r2 */
function r2(v: number): number {
  return Math.round(v * 100) / 100
}

/** 随机 [a,b] */
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a)
}

const CONFETTI_COLORS = ['#f9705c', '#5b95f0', '#3fbe86', '#f5b13f', '#9a72ee', '#35c3bd']

export interface BallOpts {
  shape?: 'blob' | 'wedge' | 'gem'
  color?: string
  eyeColor?: string
  eyeScale?: number
  lite?: boolean
  label?: string
}

/**
 * 球体渲染器实例
 */
export class BallRenderer {
  private id: string
  private lite: boolean
  private rings: EyeRingSet[]
  private shapeRing: number[][]
  private bodyPath: SVGPathElement
  private head: SVGPathElement
  private eyeL: EyeNode
  private eyeR: EyeNode
  private defs: SVGDefsElement
  private fxBack: SVGGElement
  private fxFront: SVGGElement
  private bodyG: SVGGElement
  private stopA: SVGStopElement
  private stopB: SVGStopElement
  private stopC: SVGStopElement
  private curColor = DEFAULT_BODY.color
  private curSketch = 0
  private zzzNodes: SVGTextElement[] | null = null
  private cheekL!: SVGEllipseElement
  private cheekR!: SVGEllipseElement
  private baseC: [[number, number], [number, number]]

  // 彩带
  private trails: any[] = []
  private planes: any[] = []
  private planeG = 4
  private baseHue = 0
  private spawnIdx = 0
  private wasFast = false
  private prevYaw = 0
  private prevNow = 0
  private confPieces: any[] = []
  private silRows: number[][] = []
  private silMinY = 1e9
  private silMaxY = -1e9

  // SVG 骨架引用
  svg: SVGSVGElement

  constructor(container: HTMLElement, opts: BallOpts = {}) {
    this.id = 'eb' + (Math.random().toString(36).slice(2, 9))
    this.lite = !!opts.lite
    this.rings = genEyeRings()

    // 身体轮廓
    const shapeName = opts.shape || 'blob'
    if (shapeName === 'blob') {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C, 108, 0.012)
    } else if (shapeName === 'wedge') {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C + 12, 100, 0)
    } else {
      this.shapeRing = genBlobBody(HEAD_C, HEAD_C, 100, 0.04)
    }

    // 轮廓采样（每 2px 一行的 [minX, maxX]）
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
    // 主体径向渐变（高光偏左上）
    const grad = el('radialGradient', { id: this.id + 'g', cx: '38%', cy: '30%', r: '78%' }) as unknown as SVGElement
    this.stopA = el('stop', { offset: '0%' }) as unknown as SVGStopElement
    this.stopB = el('stop', { offset: '55%' }) as unknown as SVGStopElement
    this.stopC = el('stop', { offset: '100%' }) as unknown as SVGStopElement
    grad.appendChild(this.stopA)
    grad.appendChild(this.stopB)
    grad.appendChild(this.stopC)
    defs.appendChild(grad)
    // 边缘暗角渐变（让球体更立体）
    const rim = el('radialGradient', { id: this.id + 'r', cx: '50%', cy: '50%', r: '50%' }) as unknown as SVGElement
    const rimA = el('stop', { offset: '70%' }) as unknown as SVGStopElement
    const rimB = el('stop', { offset: '100%' }) as unknown as SVGStopElement
    rimA.setAttribute('stop-color', 'rgba(0,0,0,0)')
    rimB.setAttribute('stop-color', 'rgba(0,0,0,0.18)')
    rim.appendChild(rimA)
    rim.appendChild(rimB)
    defs.appendChild(rim)
    svg.appendChild(defs)

    this.fxBack = el('g', { 'pointer-events': 'none' }) as unknown as SVGGElement
    svg.appendChild(this.fxBack)

    this.bodyG = el('g', {}) as unknown as SVGGElement
    this.head = el('path', {
      d: ringPath(this.shapeRing),
      fill: 'url(#' + this.id + 'g)',
      stroke: 'none',
      'stroke-width': '2',
    }) as unknown as SVGPathElement
    this.bodyG.appendChild(this.head)
    // 暗角层（边缘加深，立体感）
    const rimLayer = el('path', {
      d: ringPath(this.shapeRing),
      fill: 'url(#' + this.id + 'r)',
      stroke: 'none',
      'pointer-events': 'none',
    }) as unknown as SVGPathElement
    this.bodyG.appendChild(rimLayer)
    // 顶部高光弧（让球更立体）
    const gloss = el('path', {
      d: ringPath(this.shapeRing),
      fill: 'url(#' + this.id + 'g)',
      stroke: 'none',
      opacity: '0.5',
      'pointer-events': 'none',
      transform: 'translate(0 0) scale(0.92)',
      'transform-origin': '110px 110px',
    }) as unknown as SVGPathElement
    ;(gloss.style as any).mixBlendMode = 'overlay'
    this.bodyG.appendChild(gloss)

    // 眼睛
    this.eyeL = this.buildEye(0)
    this.eyeR = this.buildEye(1)
    this.bodyG.appendChild(this.eyeL.node)
    this.bodyG.appendChild(this.eyeR.node)
    this.bodyG.appendChild(this.eyeL.highlight)
    this.bodyG.appendChild(this.eyeR.highlight)

    // 腮红（默认隐藏，害羞/开心类情绪显示）
    this.cheekL = el('ellipse', {
      cx: String(HEAD_C - 32), cy: String(HEAD_C + 18), rx: '9', ry: '5',
      fill: 'rgba(244,114,108,0.5)', stroke: 'none', opacity: '0',
      'pointer-events': 'none',
    }) as unknown as SVGEllipseElement
    this.cheekR = el('ellipse', {
      cx: String(HEAD_C + 32), cy: String(HEAD_C + 18), rx: '9', ry: '5',
      fill: 'rgba(244,114,108,0.5)', stroke: 'none', opacity: '0',
      'pointer-events': 'none',
    }) as unknown as SVGEllipseElement
    this.bodyG.appendChild(this.cheekL)
    this.bodyG.appendChild(this.cheekR)

    svg.appendChild(this.bodyG)

    this.fxFront = el('g', { 'pointer-events': 'none' }) as unknown as SVGGElement
    svg.appendChild(this.fxFront)

    this.baseC = [centroid(this.rings[0].L), centroid(this.rings[0].R)]

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

  private buildEye(k: number): EyeNode {
    const ring = k === 0 ? this.rings[0].L : this.rings[0].R
    const node = el('path', { fill: '#1A1A1A', stroke: 'none', 'stroke-width': '1.6' }) as unknown as SVGPathElement
    node.setAttribute('d', ringPath(ring))
    // 眼睛高光（白色小椭圆，让眼神灵动）
    const highlight = el('ellipse', {
      rx: '2.4', ry: '3.2',
      fill: 'rgba(255,255,255,0.85)',
      stroke: 'none',
      'pointer-events': 'none',
    }) as unknown as SVGEllipseElement
    return { node, ring, c: centroid(ring), highlight }
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

  private silAt(y: number): number[] {
    const r = Math.round((clamp(y, this.silMinY, this.silMaxY) - this.silMinY) / 2)
    return this.silRows[clamp(r, 0, this.silRows.length - 1)]
  }

  setBodyColor(color: string) {
    if (color === this.curColor) return
    this.curColor = color
    this.stopA.setAttribute('stop-color', shade(color, 0.18))
    this.stopB.setAttribute('stop-color', color)
    this.stopC.setAttribute('stop-color', shade(color, -0.25))
  }

  /** 更新眼睛环（外部弹簧插值后传入） */
  setEyeRings(L: number[][], R: number[][]) {
    this.eyeL.ring = L
    this.eyeR.ring = R
    this.eyeL.c = centroid(L)
    this.eyeR.c = centroid(R)
  }

  /** 单只眼睛应用 pose + 球面投影 */
  private setEye(eye: EyeNode, pose: EyePose, k: number, sketch: number, yaw: number) {
    eye.node.setAttribute('d', ringPath(eye.ring))
    const base = this.baseC[k]
    const open = clamp(pose.open, 0, 1.2)
    const sy = clamp(pose.scaleY * open, 0.02, 2.4)
    const sxBase = pose.scaleX

    const halfH = EYE_HALF * sy + 2
    let ey0 = HEAD_C + (base[1] - HEAD_C) + pose.y + pose.lookY
    ey0 = clamp(ey0, this.silMinY + halfH, this.silMaxY - halfH)

    const sil = this.silAt(ey0)
    const cx0 = (sil[0] + sil[1]) / 2
    const hw = Math.max((sil[1] - sil[0]) / 2, 12)

    // 经度换算 + 自旋偏航 + 余弦压缩
    // base[0] 是眼环质心 x（左眼≈86，右眼≈134）
    // 用眼睛自身的质心而非固定 base，更准确
    const eyeCx = eye.c[0]
    const ox = (eyeCx - HEAD_C) + pose.x + pose.lookX
    const theta = clamp(ox / hw, -1.15, 1.15)
    const total = theta + (yaw || 0)
    const cn = Math.cos(total)
    if (cn <= 0.02) {
      ;(eye.node.style as any).display = 'none'
      ;(eye.highlight.style as any).display = 'none'
      return
    }
    ;(eye.node.style as any).display = ''
    const ex = cx0 + hw * Math.sin(total) * 0.985
    const dyN = (ey0 - HEAD_C) / 130
    const fy = Math.sqrt(1 - dyN * dyN * 0.22)

    eye.node.setAttribute(
      'transform',
      'translate(' + r2(ex) + ' ' + r2(ey0) + ')' +
        (pose.rotate ? ' rotate(' + r2(pose.rotate) + ')' : '') +
        ' scale(' + r2(sxBase * cn) + ' ' + r2(sy * fy) + ')' +
        ' translate(' + r2(-eyeCx) + ' ' + r2(-eye.c[1]) + ')',
    )

    // 高光：在眼睛左上偏移，随眼睛缩放
    const open2 = clamp(pose.open, 0, 1.2)
    if (open2 < 0.3) {
      ;(eye.highlight.style as any).display = 'none'
    } else {
      ;(eye.highlight.style as any).display = ''
      const hx = ex - sxBase * cn * 4 + pose.lookX * 0.3
      const hy = ey0 - sy * fy * 5 + pose.lookY * 0.3
      eye.highlight.setAttribute('cx', r2(hx))
      eye.highlight.setAttribute('cy', r2(hy))
      eye.highlight.setAttribute('rx', r2(2.4 * sxBase * cn))
      eye.highlight.setAttribute('ry', r2(3.2 * sy * fy * open2))
    }

    const fill = sketch > 0.5 ? 'none' : pose.color
    const stroke = sketch > 0.5 ? pose.color : 'none'
    if (fill !== eye.lastFill) { eye.node.setAttribute('fill', fill); eye.lastFill = fill }
    if (stroke !== eye.lastStroke) { eye.node.setAttribute('stroke', stroke); eye.lastStroke = stroke }
  }

  /**
   * 每帧应用 pose。
   * 返回 yaw 供彩带判断。
   */
  applyPose(pose: Pose, yaw = 0): number {
    const b = pose.body
    const now = performance.now()
    const sketch = 0

    this.bodyG.setAttribute(
      'transform',
      'translate(' + r2(HEAD_C + b.x) + ' ' + r2(HEAD_C + b.y) + ')' +
        ' rotate(' + r2(b.rotate || 0) + ')' +
        ' scale(' + r2(b.scale) + ')' +
        ' translate(' + r2(-HEAD_C) + ' ' + r2(-HEAD_C) + ')',
    )
    this.setBodyColor(b.color)

    // 腮红：暖色/粉色调体色时显现
    const [r, g, bl] = hexToRgb(b.color)
    const isWarm = r > g + 10 && r > bl + 10 // 偏红/粉/橙
    const cheekOp = isWarm ? 0.55 : 0
    this.cheekL.setAttribute('opacity', String(cheekOp))
    this.cheekR.setAttribute('opacity', String(cheekOp))

    this.setEye(this.eyeL, pose.left, 0, sketch, yaw)
    this.setEye(this.eyeR, pose.right, 1, sketch, yaw)

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
        zn.setAttribute('opacity', zo.toFixed(3))
        zn.setAttribute('font-size', (12 + zp * 11).toFixed(1))
        zn.setAttribute(
          'transform',
          'translate(' + r2(180 + zp * 34 + 4 * Math.sin(zp * 9)) + ' ' + r2(48 - zp * 42) + ')' +
            ' rotate(' + r2(-10 + zp * 14) + ')',
        )
      }
    }

    // 彩带更新
    this.updateTrails(dt)
    // 撒花更新
    this.updateConfetti(dt)

    return yaw
  }

  /** 设置目光（归一化 [-1,1]） */
  setGaze(nx: number, ny: number) {
    // 由外部通过 pose.left/right.lookX/lookY 注入，此处仅触发
  }

  // ============ 彩带 ============

  spawnTrailSpin(yawVel: number) {
    if (Math.abs(yawVel) < 2) return
    if (!this.wasFast) {
      this.makePlanes()
      this.wasFast = true
    }
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
        lam: rand(0, TAU),
        lamVel: (Math.random() < 0.5 ? -1 : 1) * rand(1.7, 2.3),
        tilt: rand(0.1, 0.22),
        roll: rand(-0.12, 0.12),
        rad: 124 + idx * 16,
        radVel: 0, follow: 0.8, carry: 0, arc: rand(2.4, 3.2),
      },
      r: rand(5.5, 7),
      hue: rand(0, 360),
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
    const now = performance.now()
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i]
      const o = t.o
      o.lam += o.lamVel * dt
      o.rad += o.radVel * dt
      o.lamVel *= 0.99
      o.radVel *= 0.96

      const p = this.orbitPoint(o, o.lam)
      t.hist.unshift(p)
      const maxHist = 22
      if (t.hist.length > maxHist) t.hist.length = maxHist

      // 色相漂移
      t.hue += t.hueVel * dt
      for (let s = 0; s < t.stops.length; s++) {
        const local = t.hue + (s / (t.stops.length - 1)) * t.hueSpan
        const col = this.hslToHex(local % 360, 0.68, 0.55)
        t.stops[s].setAttribute('stop-color', col)
      }
      const a = t.gradEl.getAttribute('id')!
      const first = t.hist[0]
      const last = t.hist[t.hist.length - 1] || first
      t.gradEl.setAttribute('x1', String(r2(first.x)))
      t.gradEl.setAttribute('y1', String(r2(first.y)))
      t.gradEl.setAttribute('x2', String(r2(last.x)))
      t.gradEl.setAttribute('y2', String(r2(last.y)))

      // 头宽尾细 path
      const d = this.trailPath(t.hist, t.r)
      t.front.setAttribute('d', d)
      t.front.setAttribute('opacity', String(t.orbitMode ? 0.85 : Math.max(0, 1 - t.life / 3)))
      t.back.setAttribute('d', d)
      t.back.setAttribute('opacity', String(t.orbitMode ? 0.4 : Math.max(0, 0.5 - t.life / 3)))

      if (!t.orbitMode) {
        t.life += dt
        if (t.life > 3 && t.hist.length <= 1) {
          this.fxBack.removeChild(t.back)
          this.fxFront.removeChild(t.front)
          t.gradEl.remove()
          this.trails.splice(i, 1)
        } else if (t.life > 0.4) {
          t.hist.pop()
        }
      }
    }
  }

  private trailPath(hist: any[], r: number): string {
    if (hist.length < 2) return ''
    let s = 'M'
    for (let i = 0; i < hist.length; i++) {
      const p = hist[i]
      const w = r * (1 - i / hist.length * 0.7)
      s += (i ? 'L' : '') + p.x.toFixed(2) + ' ' + p.y.toFixed(2)
      if (i === 0) s += ' L' + (p.x + w).toFixed(2) + ' ' + p.y.toFixed(2)
    }
    return s
  }

  private orbitPoint(o: any, lam: number) {
    const hx = o.rad * Math.sin(lam)
    const hy = -o.rad * Math.cos(lam) * Math.sin(o.tilt)
    const ca = Math.cos(o.roll), sa = Math.sin(o.roll)
    return {
      x: HEAD_C + hx * ca - hy * sa,
      y: HEAD_C + hx * sa + hy * ca,
      z: Math.cos(lam) * Math.cos(o.tilt),
      l: lam,
    }
  }

  private hslToHex(h: number, s: number, l: number): string {
    h /= 360
    const k = (n: number) => (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return shade(
      '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join(''),
      0,
    )
  }

  // ============ 撒花 ============

  burst(n: number) {
    if (this.lite) return
    for (let i = 0; i < n; i++) {
      const ang = rand(0, TAU)
      const spd = rand(40, 110)
      this.confPieces.push({
        x: HEAD_C + Math.cos(ang) * rand(96, 116),
        y: HEAD_C + Math.sin(ang) * rand(96, 116),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - rand(20, 75),
        life: 0,
        max: rand(1.2, 2.4),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        r: rand(3, 5),
        star: Math.random() < 0.25,
        node: null as null | SVGPathElement,
      })
    }
  }

  private updateConfetti(dt: number) {
    for (let i = this.confPieces.length - 1; i >= 0; i--) {
      const p = this.confPieces[i]
      p.life += dt
      if (p.life > p.max) {
        if (p.node) { p.node.remove() }
        this.confPieces.splice(i, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 60 * dt
      p.vx *= 0.99
      const op = Math.max(0, 1 - p.life / p.max)
      if (!p.node) {
        p.node = el('path', {
          d: this.starPath(),
          fill: p.color,
          opacity: String(op),
        }) as unknown as SVGPathElement
        this.fxFront.appendChild(p.node)
      }
      p.node.setAttribute('opacity', String(op))
      p.node.setAttribute('transform', 'translate(' + r2(p.x) + ' ' + r2(p.y) + ') rotate(' + r2(p.life * 220) + ') scale(' + r2(p.r / 4) + ')')
    }
  }

  private starPath(): string {
    const pts: string[] = []
    for (let e = 0; e < 10; e++) {
      const a = -Math.PI / 2 + (e * Math.PI) / 5
      const r = e % 2 === 0 ? 1 : 0.42
      pts.push((Math.cos(a) * r).toFixed(3) + ' ' + (Math.sin(a) * r).toFixed(3))
    }
    return 'M' + pts.join('L') + 'Z'
  }

  destroy() {
    this.svg.remove()
  }
}
