/**
 * EmotionBall v2 — 驱动层
 *
 * rAF 状态机 + 弹簧插值 + 表情池轮换 + AI 协议处理。
 * 原创实现，基于动画原理独立编写。
 */

import { BallRenderer, defaultPose, clonePose, type Pose } from './renderer'
import { EMOTION_SEED, DEFAULT_BODY, DEFAULT_EYE, genEyeRings } from './emotions'
import type { EmotionDef, Anim, EyePose, BodyPose } from './emotions'
import { lerp, lerpColor, clamp, TAU } from './geometry'

interface Spring { x: number; v: number; t: number }

function spring(v0: number): Spring { return { x: v0, v: 0, t: v0 } }

/** 临界阻尼弹簧步进，子步 1/120 保证稳定 */
function springStep(s: Spring, w: number, z: number, dt: number) {
  const sub = 4
  const h = dt / sub
  for (let i = 0; i < sub; i++) {
    s.v += (-2 * z * w * s.v - w * w * (s.x - s.t)) * h
    s.x += s.v * h
    if (!isFinite(s.x) || !isFinite(s.v)) { s.x = s.t; s.v = 0 }
  }
}

/** 6 种动画原语求值 */
function animVal(a: Anim, t: number, dt: number): number {
  const p = a.period || 2000
  const ph = (a.phase || 0) * p
  switch (a.type) {
    case 'sine':
      return Math.sin((t / p) * TAU + ph) * (a.amp || 0)
    case 'glance': {
      // 平滑方波：两端停留
      const u = (t % p) / p
      const g = u < 0.25 ? 1 : u < 0.5 ? 1 - (u - 0.25) * 8 : u < 0.75 ? -1 : -1 + (u - 0.75) * 8
      return g * (a.amp || 0)
    }
    case 'scan': {
      // 三角波快速扫动
      const u = (t % p) / p
      return (u < 0.5 ? u * 2 : 2 - u * 2) * 2 - 1 * (a.amp || 0)
    }
    case 'jitter': {
      // 伪噪声抖动（多频正弦叠加）
      const s = a.speed || 1
      const n = Math.sin(t * s * 7.3) * 0.6 + Math.sin(t * s * 13.1) * 0.3 + Math.sin(t * s * 23.7) * 0.1
      const dec = a.decay ? Math.max(0, 1 - t / a.decay) : 1
      return n * (a.amp || 0) * dec
    }
    case 'pulse': {
      // 0→amp 节奏缩放
      const u = (t % p) / p
      return (u < 0.5 ? u * 2 : 1 - (u - 0.5) * 2) * (a.amp || 0)
    }
    case 'blink':
      return 0
  }
  return 0
}

type EventCb = (e: any) => void

export interface EngineOpts {
  emotion?: string
  shape?: 'blob' | 'wedge' | 'gem'
  color?: string
  eyeColor?: string
  eyeScale?: number
  lite?: boolean
  idle?: boolean | { after?: number; to?: string }
  fallbackId?: string
  autostart?: boolean
  label?: string
}

export class EmotionEngine {
  private renderer: BallRenderer
  private emotions: Map<string, EmotionDef> = new Map()
  private curId: string
  private fallbackId: string
  private curPose: Pose
  private targetPose: Pose
  private eyeSpringL: { x: Spring; y: Spring }[] = []
  private eyeSpringR: { x: Spring; y: Spring }[] = []
  private bodySpring: { x: Spring; y: Spring; scale: Spring; rotate: Spring } = {
    x: spring(0), y: spring(0), scale: spring(1), rotate: spring(0),
  }
  private rings = genEyeRings()
  private curRingIdx = 0
  private targetRingIdx = 0
  private ringT = 1
  private poolTimer = 0
  private poolNext = 3000
  private blinkTimer = 0
  private blinkNext = 5000
  private blinkPhase = 0
  private animStartT = 0
  private transT = 1
  private transFrom: Pose = defaultPose()
  private transTo: Pose = defaultPose()
  private sequence: any = null
  private seqT = 0
  private anticsTimer = 0
  private idleTimer = 0
  private idleEnabled: boolean | { after?: number; to?: string }
  private gazeX = 0
  private gazeY = 0
  private yaw = 0
  private yawVel = 0
  private running = false
  private active = true
  private lastT = 0
  private cbs: Record<string, EventCb[]> = {}

  constructor(container: HTMLElement, opts: EngineOpts = {}) {
    this.renderer = new BallRenderer(container, {
      shape: opts.shape,
      color: opts.color,
      eyeColor: opts.eyeColor,
      eyeScale: opts.eyeScale,
      lite: opts.lite,
      label: opts.label,
    })

    // 注册全部情绪
    for (const e of EMOTION_SEED) this.emotions.set(e.id, e)

    this.fallbackId = opts.fallbackId || '02'
    this.curId = opts.emotion || '02'
    this.idleEnabled = opts.idle ?? false
    this.curPose = defaultPose()
    this.targetPose = this.computePose(this.curId)
    this.curPose = clonePose(this.targetPose)
    this.initSprings()
    this.enterEmotion(this.curId, false)

    if (opts.autostart !== false) {
      this.start()
    } else {
      // 静态帧模式：渲染一次初始姿态
      this.renderer.setEyeRings(this.rings[this.curRingIdx].L, this.rings[this.curRingIdx].R)
      this.renderer.applyPose(this.curPose, 0)
    }
  }

  private initSprings() {
    this.eyeSpringL = []
    this.eyeSpringR = []
    for (const r of this.rings) {
      const cL = this.ringCentroid(r.L)
      const cR = this.ringCentroid(r.R)
      this.eyeSpringL.push({
        x: spring(cL[0]), y: spring(cL[1]),
      })
      this.eyeSpringR.push({
        x: spring(cR[0]), y: spring(cR[1]),
      })
    }
  }

  private ringCentroid(ring: number[][]): [number, number] {
    let x = 0, y = 0
    for (const p of ring) { x += p[0]; y += p[1] }
    return [x / ring.length, y / ring.length]
  }

  /** 计算某个情绪的基础 pose */
  private computePose(id: string): Pose {
    const def = this.emotions.get(id) || this.emotions.get(this.fallbackId)!
    const p = defaultPose()
    if (def.body) Object.assign(p.body, def.body)
    if (def.eyes?.both) {
      Object.assign(p.left, def.eyes.both)
      Object.assign(p.right, def.eyes.both)
    }
    if (def.eyes?.left) Object.assign(p.left, def.eyes.left)
    if (def.eyes?.right) Object.assign(p.right, def.eyes.right)
    if (def.openness !== undefined) {
      p.left.open = def.openness
      p.right.open = def.openness
    }
    // 初始眼环
    if (def.pool.length > 0) {
      this.targetRingIdx = def.pool[0]
      if (this.ringT >= 1) this.curRingIdx = this.targetRingIdx
    }
    return p
  }

  private enterEmotion(id: string, auto: boolean) {
    const def = this.emotions.get(id)
    if (!def) {
      this.emit('error', { message: `Unknown emotionId: ${id}`, fallback: this.fallbackId })
      this.enterEmotion(this.fallbackId, true)
      return
    }
    this.curId = id
    this.transFrom = clonePose(this.curPose)
    this.targetPose = this.computePose(id)
    this.transTo = clonePose(this.targetPose)
    this.transT = 0
    this.animStartT = performance.now()
    this.poolTimer = 0
    this.poolNext = def.poolMs ? this.randRange(def.poolMs[0], def.poolMs[1]) : 99999
    this.blinkNext = def.blinkMs ? this.randRange(def.blinkMs[0], def.blinkMs[1]) : 99999
    this.blinkTimer = 0
    this.sequence = def.sequence || null
    this.seqT = 0
    this.idleTimer = 0

    // 进入即触发的事件
    if (def.body?.ribbons) this.renderer.spawnTrailSpin(4)
    if (def.body?.confetti) this.renderer.burst(24)
    if (def.body?.orbit) {
      this.renderer.spawnOrbit(0)
      this.renderer.spawnOrbit(1)
    }

    this.emit('change', { id, def, auto })
  }

  private randRange(a: number, b: number) { return a + Math.random() * (b - a) }

  // ============ 对外 API ============

  setEmotion(id: string) { this.enterEmotion(id, false) }

  handleAIMessage(msg: string | object) {
    let obj: any
    if (typeof msg === 'string') {
      try { obj = JSON.parse(msg) } catch {
        this.emit('error', { message: 'JSON parse failed' })
        this.enterEmotion(this.fallbackId, true)
        return
      }
    } else obj = msg
    const eid = obj.emotionId || obj.emotion
    if (eid && this.emotions.has(String(eid))) {
      this.enterEmotion(String(eid), true)
      if (obj.tips) this.emit('tips', { text: obj.tips })
    } else {
      this.emit('error', { message: `Unknown/missing emotionId: ${eid}`, fallback: this.fallbackId })
      this.enterEmotion(this.fallbackId, true)
    }
  }

  setGaze(nx: number, ny: number) {
    this.gazeX = clamp(nx, -1, 1)
    this.gazeY = clamp(ny, -1, 1)
  }

  setActive(v: boolean) { this.active = v }

  on(ev: string, cb: EventCb) {
    (this.cbs[ev] = this.cbs[ev] || []).push(cb)
  }

  private emit(ev: string, data: any) {
    (this.cbs[ev] || []).forEach((cb) => cb(data))
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastT = performance.now()
    const tick = (now: number) => {
      if (!this.running) return
      const dt = clamp((now - this.lastT) / 1000, 0.001, 0.05)
      this.lastT = now
      if (this.active) this.frame(dt, now)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  destroy() {
    this.running = false
    this.renderer.destroy()
  }

  // ============ 主循环 ============

  private frame(dt: number, now: number) {
    const def = this.emotions.get(this.curId)!

    // 过渡
    if (this.transT < 1) {
      this.transT = Math.min(1, this.transT + dt * 1000 / (def.transition || 400))
      const e = this.easeInOut(this.transT)
      this.curPose.body = this.lerpBody(this.transFrom.body, this.transTo.body, e)
      this.curPose.left = this.lerpEye(this.transFrom.left, this.transTo.left, e)
      this.curPose.right = this.lerpEye(this.transFrom.right, this.transTo.right, e)
    } else {
      this.curPose.body = { ...this.targetPose.body }
      this.curPose.left = { ...this.targetPose.left }
      this.curPose.right = { ...this.targetPose.right }
    }

    // 表情池轮换
    this.poolTimer += dt * 1000
    if (def.pool.length > 1 && this.poolTimer > this.poolNext) {
      this.poolTimer = 0
      this.poolNext = this.randRange(def.poolMs[0], def.poolMs[1])
      const others = def.pool.filter((i) => i !== this.targetRingIdx)
      const next = others[Math.floor(Math.random() * others.length)]
      this.targetRingIdx = next
      this.ringT = 0
    }

    // 眼环插值
    if (this.ringT < 1) {
      this.ringT = Math.min(1, this.ringT + dt * (def.poolSpeed || 6))
      const e = this.easeInOut(this.ringT)
      const L = this.lerpRingPts(this.rings[this.curRingIdx].L, this.rings[this.targetRingIdx].L, e)
      const R = this.lerpRingPts(this.rings[this.curRingIdx].R, this.rings[this.targetRingIdx].R, e)
      this.renderer.setEyeRings(L, R)
      if (this.ringT >= 1) this.curRingIdx = this.targetRingIdx
    } else {
      this.renderer.setEyeRings(this.rings[this.curRingIdx].L, this.rings[this.curRingIdx].R)
    }

    // 动画原语（叠加到临时偏移，不累加污染 pose）
    const animOff = { eyeX: 0, eyeY: 0, eyeOpen: 0, bodyX: 0, bodyY: 0, bodyScale: 0 }
    if (def.anims) {
      const t = (now - this.animStartT) / 1000
      for (const a of def.anims) {
        const v = animVal(a, t, dt)
        if (a.target === 'eyes') {
          if (a.prop === 'lookX') animOff.eyeX += v
          else if (a.prop === 'lookY') animOff.eyeY += v
          else if (a.prop === 'x') animOff.eyeX += v
          else if (a.prop === 'y') animOff.eyeY += v
          else if (a.prop === 'open') animOff.eyeOpen += v
        } else if (a.target === 'body') {
          if (a.prop === 'x') animOff.bodyX += v
          else if (a.prop === 'y') animOff.bodyY += v
          else if (a.prop === 'scale') animOff.bodyScale += v
        }
      }
    }
    this.curPose.left.lookX = this.targetPose.left.lookX + animOff.eyeX
    this.curPose.left.lookY = this.targetPose.left.lookY + animOff.eyeY
    this.curPose.right.lookX = this.targetPose.right.lookX + animOff.eyeX
    this.curPose.right.lookY = this.targetPose.right.lookY + animOff.eyeY
    this.curPose.body.x = this.targetPose.body.x + animOff.bodyX
    this.curPose.body.y = this.targetPose.body.y + animOff.bodyY

    // 呼吸（叠加到 scale）
    const breathe = def.body?.breathe || 0.01
    this.curPose.body.scale = this.targetPose.body.scale + animOff.bodyScale + Math.sin(now * 0.0015) * breathe

    // 注视
    if (def.gaze) {
      this.curPose.left.lookX += this.gazeX * 8
      this.curPose.left.lookY += this.gazeY * 5
      this.curPose.right.lookX += this.gazeX * 8
      this.curPose.right.lookY += this.gazeY * 5
    }

    // 眨眼（基于 target open，不累乘）
    if (def.blinkMs) {
      this.blinkTimer += dt * 1000
      if (this.blinkTimer > this.blinkNext) {
        this.blinkTimer = 0
        this.blinkNext = this.randRange(def.blinkMs[0], def.blinkMs[1])
        this.blinkPhase = 1
      }
      if (this.blinkPhase > 0) {
        this.blinkPhase = Math.max(0, this.blinkPhase - dt * 8)
        const b = Math.sin((1 - this.blinkPhase) * Math.PI)
        const factor = 1 - b * 0.9
        this.curPose.left.open = this.targetPose.left.open * factor
        this.curPose.right.open = this.targetPose.right.open * factor
      } else {
        this.curPose.left.open = this.targetPose.left.open
        this.curPose.right.open = this.targetPose.right.open
      }
    }

    // 关键帧序列
    if (this.sequence) {
      this.seqT += dt
      const frames = this.sequence.frames || []
      for (const f of frames) {
        if (this.seqT * 1000 >= f.at) {
          if (f.eyes?.both) { Object.assign(this.curPose.left, f.eyes.both); Object.assign(this.curPose.right, f.eyes.both) }
          if (f.eyes?.left) Object.assign(this.curPose.left, f.eyes.left)
          if (f.eyes?.right) Object.assign(this.curPose.right, f.eyes.right)
          if (f.body) Object.assign(this.curPose.body, f.body)
        }
      }
      const last = frames[frames.length - 1]
      if (last && this.seqT * 1000 > last.at + 600) {
        const settle = this.sequence.settle
        if (settle === 'base') { this.targetRingIdx = def.pool[0] || 0; this.ringT = 0 }
        else if (settle === 'hold') { /* 定格 */ }
        else if (settle && (settle as any).next) { this.enterEmotion((settle as any).next, true) }
        this.sequence = null
      }
    }

    // 待机 antics
    if (def.antics) {
      this.anticsTimer += dt
      if (this.anticsTimer > this.randRange(9, 18)) {
        this.anticsTimer = 0
        if (Math.random() < 0.5) this.yawVel = (Math.random() < 0.5 ? -1 : 1) * 6
        else this.curPose.body.y -= 20
      }
    }

    // 待机超时
    if (this.idleEnabled) {
      this.idleTimer += dt
      const cfg = typeof this.idleEnabled === 'object' ? this.idleEnabled : {}
      const after = (cfg as any).after || 45
      const to = (cfg as any).to || '00'
      if (this.idleTimer > after && this.curId !== to) {
        this.enterEmotion(to, true)
      }
    }

    // 自旋 yaw
    this.yaw += this.yawVel * dt
    this.yawVel *= 0.92
    if (Math.abs(this.yawVel) > 2) this.renderer.spawnTrailSpin(this.yawVel)

    // 应用 pose
    this.renderer.applyPose(this.curPose, this.yaw)
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  private lerpBody(a: BodyPose, b: BodyPose, t: number): BodyPose {
    return {
      ...a,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      scale: lerp(a.scale, b.scale, t),
      rotate: lerp(a.rotate, b.rotate, t),
      color: lerpColor(a.color, b.color, t),
      breathe: lerp(a.breathe, b.breathe, t),
      ribbons: t > 0.5 ? b.ribbons : a.ribbons,
      confetti: t > 0.5 ? b.confetti : a.confetti,
      zzz: lerp(a.zzz, b.zzz, t),
      orbit: t > 0.5 ? b.orbit : a.orbit,
    }
  }

  private lerpEye(a: EyePose, b: EyePose, t: number): EyePose {
    return {
      ...a,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      scaleX: lerp(a.scaleX, b.scaleX, t),
      scaleY: lerp(a.scaleY, b.scaleY, t),
      rotate: lerp(a.rotate, b.rotate, t),
      open: lerp(a.open, b.open, t),
      color: lerpColor(a.color, b.color, t),
      lookX: lerp(a.lookX, b.lookX, t),
      lookY: lerp(a.lookY, b.lookY, t),
    }
  }

  private lerpRingPts(a: number[][], b: number[][], t: number): number[][] {
    const out: number[][] = new Array(a.length)
    for (let i = 0; i < a.length; i++) {
      out[i] = [lerp(a[i][0], b[i][0], t), lerp(a[i][1], b[i][1], t)]
    }
    return out
  }
}

/** 工厂方法，与原项目接口风格一致便于集成 */
export function createBall(container: HTMLElement, opts?: EngineOpts): EmotionEngine {
  return new EmotionEngine(container, opts || {})
}
