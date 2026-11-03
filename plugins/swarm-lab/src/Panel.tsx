/**
 * 蜂群实验台面板：多智能体涌现行为实时沙盘
 *
 * 仿真引擎 = shared/engine.js（与 MCP 同一权威，确定性种子）。
 * 纯本地运行：无宿主 invoke、无服务、无外联——刷新即重置（边界见 plugin.json）。
 *
 * 写路径纪律：所有仿真状态进 runRef（engine.createRun 产物），React 渲染只读
 * state 投影（paramValues / readouts / curve），不反向读引擎内部——避免 ref 与
 * 场景切换竞态（切场景首帧读旧 run 参数会把旧键渲染进新场景）。参数写路径两类：
 *   连续型（权重/速度/蒸发率）→ 改 runRef.params（下一 tick 生效）+ state 同步
 *   结构型（count/食物堆/predator）→ 同种子重建 run（数量守恒叙事不破坏）
 */
import { useEffect, useRef, useState } from 'react'
import engine from '../shared/engine.js'

type ParamSpec = { key: string; type: 'number' | 'boolean'; min?: number; max?: number; step?: number; default: number | boolean; desc: string }
type ScenarioSpec = { id: string; name: string; description: string; defaultTicks: number; maxTicks: number; params: ParamSpec[]; metrics: { key: string; desc: string }[] }
type RunLike = {
  scenario: string
  tick(): void
  metrics(): Record<string, number>
  tickCount: number
  params: Record<string, number | boolean>
  state: never
}
type MetricPoint = Record<string, number> & { tick: number }

const SCENARIOS = Object.values(engine.SCENARIOS) as unknown as ScenarioSpec[]

// 面板样式：sw- 前缀防泄漏；色值与宿主暗色面板族一致（watchtower 同法）
const css = `
.sw-root{position:relative;height:100%;display:flex;flex-direction:column;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6E9F2;background:transparent}
.sw-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.sw-body{flex:1;overflow-y:auto;padding:0 0 24px}
.sw-body::-webkit-scrollbar{width:9px;height:9px}
.sw-body::-webkit-scrollbar-thumb{background:#2a3145;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.sw-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#0E1220 75%,rgba(14,18,32,0))}
.sw-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#0b2f3b,#12203a 60%,#0E1220);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;border:1px solid #1f4a5a}
.sw-tt{flex:1;min-width:0}
.sw-tt b{font-size:15px;display:block}
.sw-tt small{color:#8B94A9;font-size:10.5px;display:block;margin-top:1px}
.sw-tabs{display:flex;gap:4px}
.sw-tab{background:transparent;border:none;color:#8B94A9;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.sw-tab:hover{color:#E6E9F2}
.sw-tab.on{background:#1D2436;color:#E6E9F2;font-weight:600}
.sw-stage{margin:0 16px 10px}
.sw-canvas{display:block;width:100%;aspect-ratio:1/1;border-radius:13px;border:1px solid #232B40;background:#0b0e17}
.sw-ctrl{display:flex;align-items:center;gap:6px;padding:0 16px 10px;flex-wrap:wrap}
.sw-btn{background:#1e7a63;border:none;color:#fff;border-radius:8px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600}
.sw-btn:hover{filter:brightness(1.12)}
.sw-btn.ghost{background:#20263A;color:#E6E9F2;border:1px solid #2a3145}
.sw-speed{display:inline-flex;align-items:center;gap:5px;color:#8B94A9;font-size:11.5px;margin-left:auto}
.sw-speed select{background:#20263A;color:#E6E9F2;border:1px solid #2a3145;border-radius:7px;padding:4px 6px;font-size:12px}
.sw-head-metric{margin:0 16px 10px;background:#141927;border:1px solid #232B40;border-radius:13px;padding:11px 13px;display:flex;align-items:center;gap:12px}
.sw-hm-label{font-size:11px;color:#8B94A9;white-space:nowrap}
.sw-hm-value{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;color:#4fd1a0;min-width:74px}
.sw-curve{flex:1;height:44px;min-width:0}
.sw-sec{display:flex;align-items:center;gap:8px;padding:8px 18px 6px;font-size:13px;font-weight:700}
.sw-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.sw-card{background:#141927;border:1px solid #232B40;border-radius:13px;margin:0 16px 10px;overflow:hidden;min-width:0}
.sw-card-b{padding:11px 13px}
.sw-sub{font-size:10.5px;color:#8B94A9;line-height:1.6;margin-bottom:8px}
.sw-param{display:flex;align-items:center;gap:8px;padding:5px 0}
.sw-pk{font-size:11.5px;color:#B4B8C4;min-width:150px;flex-shrink:0}
.sw-pk b{color:#E6E9F2;font-variant-numeric:tabular-nums}
.sw-param input[type=range]{flex:1;min-width:0;accent-color:#4fd1a0}
.sw-chip{background:#1D2436;border:1px solid #2a3145;border-radius:999px;color:#B4B8C4;font-size:11.5px;padding:4px 14px;cursor:pointer}
.sw-chip.on{background:#14352a;border-color:#4fd1a0;color:#b7efdc;font-weight:600}
.sw-metric{padding:6px 0;border-bottom:1px solid #1c2333}
.sw-metric:last-child{border-bottom:none}
.sw-mk{font-size:12.5px}
.sw-mk b{color:#4fd1a0;font-variant-numeric:tabular-nums}
.sw-about{font-size:11.5px;color:#8B94A9;line-height:1.7;padding:12px 18px}
.sw-about b{color:#E6E9F2}
`
/** 面板主指标：boids 看秩序（极化），ants 看产出（采食） */
const HEAD_METRIC: Record<string, string> = { boids: 'polarization', ants: 'food' }
/** 结构型参数：变更需重建运行（其余连续型逐 tick 生效） */
const STRUCTURAL: Record<string, Set<string>> = {
  boids: new Set(['count', 'predator']),
  ants: new Set(['count', 'foodPiles', 'foodPerPile']),
}

function defaultsOf(sc: ScenarioSpec): Record<string, number | boolean> {
  const o: Record<string, number | boolean> = {}
  for (const p of sc.params) o[p.key] = p.default
  return o
}

type Boid = { x: number; y: number; vx: number; vy: number }
type BoidState = { agents: Boid[]; predator: { x: number; y: number } | null; catches: number }
type AntState = { ants: { x: number; y: number; carrying: boolean }[]; pher: Float32Array; nest: { x: number; y: number }; piles: { x: number; y: number; amount: number; r: number }[] }

export default function SwarmLabPanel() {
  const [scenarioId, setScenarioId] = useState('boids')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(2) // 每帧 tick 数
  const [seed, setSeed] = useState(42)
  const [readouts, setReadouts] = useState<{ tick: number; metrics: Record<string, number> }>({ tick: 0, metrics: {} })
  const [paramValues, setParamValues] = useState<Record<string, number | boolean>>(() => defaultsOf(SCENARIOS[0]))
  const [, bumpTick] = useState(0) // 参数行内数值刷新泵

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const heatRef = useRef<HTMLCanvasElement | null>(null) // 蚁群信息素离屏热图
  const curveCanvas = useRef<HTMLCanvasElement | null>(null)
  const curveRef = useRef<MetricPoint[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runRef = useRef<any>(null)
  const rafRef = useRef(0)
  const playingRef = useRef(playing)
  const speedRef = useRef(speed)
  const sidRef = useRef(scenarioId)
  playingRef.current = playing
  speedRef.current = speed
  sidRef.current = scenarioId

  // 重建运行（同种子）：结构参数变更/场景切换/重置按钮共用这一个入口（单一写路径）
  const buildRun = (sid: string, sd: number) => {
    const target = SCENARIOS.find((s) => s.id === sid)!
    const params = defaultsOf(target)
    runRef.current = engine.createRun(sid, params, sd)
    curveRef.current = []
    setParamValues({ ...params })
    setReadouts({ tick: 0, metrics: {} })
  }

  // 场景/种子变更 → 重建（含首次挂载）
  useEffect(() => { buildRun(scenarioId, seed) /* eslint-disable-line react-hooks/exhaustive-deps */ }, [scenarioId, seed])

  // 主循环：rAF 驱动仿真 + 绘制
  useEffect(() => {
    let stop = false
    const loop = () => {
      if (stop) return
      const run = runRef.current
      if (run && playingRef.current) {
        for (let i = 0; i < speedRef.current; i++) run.tick()
        const m = run.metrics()
        const arr = curveRef.current
        arr.push({ tick: run.tickCount, ...m })
        if (arr.length > 160) arr.shift()
        setReadouts({ tick: run.tickCount, metrics: m })
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { stop = true; cancelAnimationFrame(rafRef.current) }
  }, [])

  // ── 绘制 ──────────────────────────────────────────────────────────────────
  function draw() {
    const cv = canvasRef.current
    const run = runRef.current
    if (!cv || !run) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth
    if (!w) return
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr) }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const S = cv.width
    const k = S / engine.WORLD
    ctx.fillStyle = '#0b0e17'
    ctx.fillRect(0, 0, S, S)
    if (run.scenario === 'ants') drawAnts(ctx, run.state as AntState, k, dpr)
    else drawBoids(ctx, run.state as BoidState, k)
  }

  function drawBoids(ctx: CanvasRenderingContext2D, st: BoidState, k: number) {
    const { agents, predator } = st
    ctx.fillStyle = '#4fd1a0'
    for (const a of agents) {
      const sp = Math.hypot(a.vx, a.vy) || 1e-9
      const ux = a.vx / sp, uy = a.vy / sp
      const x = a.x * k, y = a.y * k, r = 3.2 * k
      ctx.beginPath()
      ctx.moveTo(x + ux * r * 1.6, y + uy * r * 1.6)
      ctx.lineTo(x - ux * r - uy * r * 0.7, y - uy * r + ux * r * 0.7)
      ctx.lineTo(x - ux * r + uy * r * 0.7, y - uy * r - ux * r * 0.7)
      ctx.closePath()
      ctx.fill()
    }
    if (predator) {
      ctx.fillStyle = '#F08AA8'
      ctx.beginPath()
      ctx.arc(predator.x * k, predator.y * k, 5.5 * k, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawAnts(ctx: CanvasRenderingContext2D, st: AntState, k: number, dpr: number) {
    const { ants, pher, nest, piles } = st
    // 信息素热图：64² 离屏 → 最近邻放大（每帧重建 ImageData，64² 量级可承受）
    let heat = heatRef.current
    if (!heat) { heat = document.createElement('canvas'); heatRef.current = heat }
    heat.width = engine.GRID; heat.height = engine.GRID
    const hctx = heat.getContext('2d')
    if (hctx) {
      const img = hctx.createImageData(engine.GRID, engine.GRID)
      let maxP = 1e-6
      for (let i = 0; i < pher.length; i++) if (pher[i] > maxP) maxP = pher[i]
      for (let i = 0; i < pher.length; i++) {
        const v = Math.min(1, pher[i] / maxP)
        img.data[i * 4] = 26
        img.data[i * 4 + 1] = Math.round(120 + 60 * v)
        img.data[i * 4 + 2] = 110
        img.data[i * 4 + 3] = Math.round(v * 190)
      }
      hctx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(heat, 0, 0, engine.WORLD * k, engine.WORLD * k)
      ctx.imageSmoothingEnabled = true
    }
    // 巢穴
    ctx.strokeStyle = '#9FB6DD'
    ctx.lineWidth = 2 * dpr
    ctx.beginPath()
    ctx.arc(nest.x * k, nest.y * k, 4 * k, 0, Math.PI * 2)
    ctx.stroke()
    // 食物堆（半径随剩余量收缩）
    for (const p of piles) {
      if (p.amount <= 0) continue
      ctx.fillStyle = '#7EE2A0'
      ctx.beginPath()
      ctx.arc(p.x * k, p.y * k, p.r * k * (0.5 + 0.5 * (p.amount / 200)), 0, Math.PI * 2)
      ctx.fill()
    }
    // 蚂蚁（携食=琥珀色）
    for (const a of ants) {
      ctx.fillStyle = a.carrying ? '#F0B47A' : '#E6E9F2'
      ctx.fillRect(a.x * k - 1.2 * k, a.y * k - 1.2 * k, 2.4 * k, 2.4 * k)
    }
  }

  // 主指标迷你曲线（每帧读数后重画；160 点窗口）
  useEffect(() => {
    const cv = curveCanvas.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth || 300
    cv.width = Math.round(w * dpr); cv.height = Math.round(44 * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    const arr = curveRef.current
    const head = HEAD_METRIC[sidRef.current]
    if (arr.length < 2) return
    const vals = arr.map((p) => p[head])
    const lo = Math.min(...vals), hi = Math.max(...vals)
    const span = hi - lo || 1
    ctx.strokeStyle = '#4fd1a0'
    ctx.lineWidth = 1.6 * dpr
    ctx.beginPath()
    arr.forEach((p, i) => {
      const x = (i / (arr.length - 1)) * cv.width
      const y = cv.height - 4 * dpr - ((p[head] - lo) / span) * (cv.height - 8 * dpr)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [readouts])

  const sc = SCENARIOS.find((s) => s.id === scenarioId)!
  const headKey = HEAD_METRIC[scenarioId]
  const headVal = readouts.metrics[headKey]
  const fmt = (key: string, v: number | undefined) => (v === undefined ? '—' : v.toFixed(key === 'food' || key === 'catches' || key === 'clusters' ? 0 : 3))

  // 参数变更：连续型 → 原地改（引擎下一 tick 生效）；结构型 → 同种子重建
  const onParam = (p: ParamSpec, value: number | boolean) => {
    const run = runRef.current
    if (!run) return
    setParamValues((prev) => ({ ...prev, [p.key]: value }))
    if (!STRUCTURAL[scenarioId].has(p.key)) {
      run.params[p.key] = value
      bumpTick((t) => t + 1)
    } else {
      buildRun(scenarioId, seed)
    }
  }

  return (
    <div className="sw-root">
      {css ? <style>{css}</style> : null}
      <div className="sw-top">
        <div className="sw-logo">🐝</div>
        <div className="sw-tt">
          <b>蜂群实验台</b>
          <small>多智能体涌现行为沙盘 · 种子 {seed} · tick {readouts.tick}</small>
        </div>
        <div className="sw-tabs">
          {SCENARIOS.map((s) => (
            <button key={s.id} className={`sw-tab${s.id === scenarioId ? ' on' : ''}`} onClick={() => setScenarioId(s.id)}>{s.name.split('（')[0]}</button>
          ))}
        </div>
      </div>

      <div className="sw-body">
        <div className="sw-stage">
          <canvas ref={canvasRef} className="sw-canvas" />
        </div>

        <div className="sw-ctrl">
          <button className="sw-btn" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ 暂停' : '▶ 开始'}</button>
          <button className="sw-btn ghost" onClick={() => { const r = runRef.current; if (r) { r.tick(); setReadouts({ tick: r.tickCount, metrics: r.metrics() }) } }}>单步</button>
          <button className="sw-btn ghost" onClick={() => buildRun(scenarioId, seed)}>重置</button>
          <button className="sw-btn ghost" onClick={() => setSeed(Math.floor(Math.random() * 4294967296))}>新种子</button>
          <label className="sw-speed">
            速度
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {[1, 2, 4, 8].map((v) => <option key={v} value={v}>{v}×</option>)}
            </select>
          </label>
        </div>

        <div className="sw-head-metric">
          <div className="sw-hm-label">{headKey === 'polarization' ? '极化指数（秩序）' : '累计采食（产出）'}</div>
          <div className="sw-hm-value">{fmt(headKey, headVal)}</div>
          <canvas ref={curveCanvas} className="sw-curve" />
        </div>

        <div className="sw-sec">实验参数 <span className="sw-hint">{sc.name}</span></div>
        <div className="sw-card">
          <div className="sw-card-b">
            <div className="sw-sub">{sc.description}</div>
            {sc.params.map((p) => (
              <div key={p.key} className="sw-param">
                {p.type === 'boolean' ? (
                  <>
                    <span className="sw-pk">{p.desc}</span>
                    <button
                      className={`sw-chip${paramValues[p.key] ? ' on' : ''}`}
                      onClick={() => onParam(p, !paramValues[p.key])}
                    >{paramValues[p.key] ? '开' : '关'}</button>
                  </>
                ) : (
                  <>
                    <span className="sw-pk">{p.desc} <b>{String(paramValues[p.key])}</b></span>
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={Number(paramValues[p.key])}
                      onChange={(e) => onParam(p, Number(e.target.value))}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="sw-sec">实时指标 <span className="sw-hint">逐帧读数</span></div>
        <div className="sw-card">
          <div className="sw-card-b">
            {sc.metrics.map((m) => (
              <div key={m.key} className="sw-metric">
                <div className="sw-mk"><b>{m.key}</b> {fmt(m.key, readouts.metrics[m.key])}</div>
                <div className="sw-sub">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="sw-about">
          纯本地确定性仿真（mulberry32 种子），无服务无外联。想做对照实验，让 AI 用 MCP 工具
          <b> swarmlab_compare</b> 同种子跑参数组；面板与 AI 共用同一引擎与口径。
        </div>
      </div>
    </div>
  )
}
