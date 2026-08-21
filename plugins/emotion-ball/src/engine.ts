/**
 * EmotionBall v3 — 驱动层
 *
 * rAF 状态机 + 简化插值 + 表情轮换 + AI 协议处理。
 * 原创实现，基于动画原理独立编写。
 *
 * v3 变更：弃用 48 点眼环球面投影 + 弹簧物理，改用轻量 pose 直接驱动
 * （眼白椭圆 + 瞳孔 + 嘴巴），动画原语叠加到临时偏移，绝不累加污染。
 */

import { BallRenderer, defaultPose, clonePose, type Pose } from './renderer'
import { EMOTION_SEED } from './emotions'
import type { EmotionDef, Anim, EyePose, BodyPose, MouthPose } from './emotions'
import { lerp, lerpColor, clamp, TAU } from './geometry'

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
      const s = a.speed || 1
      const n = Math.sin(t * s * 7.3) * 0.6 + Math.sin(t * s * 13.1) * 0.3 + Math.sin(t * s * 23.7) * 0.1
      const dec = a.decay ? Math.max(0, 1 - t / a.decay) : 1
      return n * (a.amp || 0) * dec
    }
    case 'pulse': {
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
  private transT = 1
  private transFrom: Pose = defaultPose()
  private transTo: Pose = defaultPose()
  private blinkTimer = 0
  private blinkNext = 5000
  private blinkPhase = 0
  private animStartT = 0
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
    this.transFrom = clonePose(this.curPose)
    this.transTo = clonePose(this.targetPose)
    this.transT = 1
    this.animStartT = performance.now()
    const def = this.emotions.get(this.curId)!
    this.blinkNext = def.blinkMs ? this.randRange(def.blinkMs[0], def.blinkMs[1]) : 99999

    // 进入即触发的一次性特效（睡眠 zzz、彩带等持续特效由帧循环控制）
    if (def.body?.confetti) this.renderer.burst(24)
    if (def.body?.orbit) {
      this.renderer.spawnOrbit(0)
      this.renderer.spawnOrbit(1)
    }

    if (opts.autostart !== false) {
      this.start()
    } else {
      // 静态帧模式：渲染一次初始姿态
      this.renderer.applyPose(this.curPose, 0)
    }
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
    if (def.mouth) Object.assign(p.mouth, def.mouth)
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
    this.sequence = def.sequence || null
    this.seqT = 0
    this.anticsTimer = 0
    this.idleTimer = 0
    this.blinkTimer = 0
    this.blinkNext = def.blinkMs ? this.randRange(def.blinkMs[0], def.blinkMs[1]) : 99999

    // 进入即触发的事件
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

    // 过渡插值
    if (this.transT < 1) {
      this.transT = Math.min(1, this.transT + dt * 1000 / (def.transition || 400))
      const e = this.easeInOut(this.transT)
      this.curPose.body = this.lerpBody(this.transFrom.body, this.transTo.body, e)
      this.curPose.left = this.lerpEye(this.transFrom.left, this.transTo.left, e)
      this.curPose.right = this.lerpEye(this.transFrom.right, this.transTo.right, e)
      this.curPose.mouth = this.lerpMouth(this.transFrom.mouth, this.transTo.mouth, e)
    } else {
      this.curPose.body = { ...this.targetPose.body }
      this.curPose.left = { ...this.targetPose.left }
      this.curPose.right = { ...this.targetPose.right }
      this.curPose.mouth = { ...this.targetPose.mouth }
    }

    // 动画原语（叠加到临时偏移，不累加污染）
    const animOff: Record<string, number> = { lookX: 0, lookY: 0, open: 0, bodyX: 0, bodyY: 0, bodyScale: 0, mouthOpen: 0, width: 0 }
    const t = (now - this.animStartT) / 1000
    if (def.anims) {
      for (const a of def.anims) {
        const v = animVal(a, t, dt)
        switch (a.target) {
          case 'eyes':
            if (a.prop === 'lookX') animOff.lookX += v
            else if (a.prop === 'lookY') animOff.lookY += v
            else if (a.prop === 'x') animOff.lookX += v * 0.12
            else if (a.prop === 'y') animOff.lookY += v * 0.12
            else if (a.prop === 'open') animOff.open += v
            break
          case 'body':
            if (a.prop === 'x') animOff.bodyX += v
            else if (a.prop === 'y') animOff.bodyY += v
            else if (a.prop === 'scale') animOff.bodyScale += v
            break
          case 'mouth':
            if (a.prop === 'mouthOpen' || a.prop === 'open') animOff.mouthOpen += v
            else if (a.prop === 'width') animOff.width += v
            break
        }
      }
    }

    // 应用到 curPose（基于 target，不累加）
    this.curPose.left.lookX = clamp(this.targetPose.left.lookX + animOff.lookX, -1, 1)
    this.curPose.left.lookY = clamp(this.targetPose.left.lookY + animOff.lookY, -1, 1)
    this.curPose.right.lookX = clamp(this.targetPose.right.lookX + animOff.lookX, -1, 1)
    this.curPose.right.lookY = clamp(this.targetPose.right.lookY + animOff.lookY, -1, 1)
    this.curPose.body.x = this.targetPose.body.x + animOff.bodyX
    this.curPose.body.y = this.targetPose.body.y + animOff.bodyY

    // 呼吸
    const breathe = def.body?.breathe || 0.01
    this.curPose.body.scale = this.targetPose.body.scale + animOff.bodyScale + Math.sin(now * 0.0015) * breathe

    // 注视（鼠标）
    if (def.gaze) {
      this.curPose.left.lookX = clamp(this.curPose.left.lookX + this.gazeX * 0.4, -1, 1)
      this.curPose.left.lookY = clamp(this.curPose.left.lookY + this.gazeY * 0.4, -1, 1)
      this.curPose.right.lookX = clamp(this.curPose.right.lookX + this.gazeX * 0.4, -1, 1)
      this.curPose.right.lookY = clamp(this.curPose.right.lookY + this.gazeY * 0.4, -1, 1)
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
          if (f.mouth) Object.assign(this.curPose.mouth, f.mouth)
        }
      }
      const last = frames[frames.length - 1]
      if (last && this.seqT * 1000 > last.at + 600) {
        const settle = this.sequence.settle
        if (settle === 'base') { /* 已到基础姿态 */ }
        else if (settle === 'hold') { /* 定格 */ }
        else if (settle && (settle as any).next) { this.enterEmotion((settle as any).next, true) }
        this.sequence = null
      }
    }

    // 待机 antics（偶尔自旋甩彩带 / 轻跳）
    if (def.antics) {
      this.anticsTimer += dt
      if (this.anticsTimer > this.randRange(9, 18)) {
        this.anticsTimer = 0
        if (Math.random() < 0.5) this.yawVel = (Math.random() < 0.5 ? -1 : 1) * 6
        else {
          this.curPose.body.y = this.targetPose.body.y - 18
          this.curPose.body.scale = this.targetPose.body.scale * 1.04
        }
      }
      // antics 结束后恢复
      if (this.anticsTimer > 0.5) {
        this.curPose.body.y = this.targetPose.body.y
        this.curPose.body.scale = this.targetPose.body.scale
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
      zzz: lerp(a.zzz, b.zzz, t),
      ribbons: t > 0.5 ? b.ribbons : a.ribbons,
      confetti: t > 0.5 ? b.confetti : a.confetti,
      orbit: t > 0.5 ? b.orbit : a.orbit,
    }
  }

  private lerpEye(a: EyePose, b: EyePose, t: number): EyePose {
    return {
      ...a,
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      open: lerp(a.open, b.open, t),
      lookX: lerp(a.lookX, b.lookX, t),
      lookY: lerp(a.lookY, b.lookY, t),
      squint: lerp(a.squint, b.squint, t),
    }
  }

  private lerpMouth(a: MouthPose, b: MouthPose, t: number): MouthPose {
    return {
      type: t > 0.5 ? b.type : a.type,
      width: lerp(a.width, b.width, t),
      open: lerp(a.open, b.open, t),
    }
  }
}

/** 工厂方法，与原项目接口风格一致便于集成 */
export function createBall(container: HTMLElement, opts?: EngineOpts): EmotionEngine {
  return new EmotionEngine(container, opts || {})
}