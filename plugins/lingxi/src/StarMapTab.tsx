/**
 * 星图 Tab：想法池的可视化主视图。
 * 星系（虚线圆）= 主标签聚类；星等/大小 = 成熟度；红环 = 到期待访；
 * 暗星 = 归档，绿环 = 已落地。点击星体打开详情抽屉。
 * 布局计算在 shared/pond-core.js（纯函数，与测试同源）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { computeStarLayout, MATURITIES, type Idea } from './model'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export default function StarMapTab(props: { ideas: Idea[]; onOpenIdea: (id: string) => void }) {
  const { ideas, onOpenIdea } = props
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = Math.max(260, el.clientWidth - 2)
      const h = clamp(Math.round(w * 1.02), 300, 470)
      setSize({ w, h })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(
    () => (size.w > 0 ? computeStarLayout(ideas, size.w, size.h) : null),
    [ideas, size],
  )

  // 绘制（ideas/size/hover 变化即重绘；无动画帧循环，静置零开销）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = layout.width * dpr
    canvas.height = layout.height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, layout.width, layout.height)

    // 底噪星尘（确定性散布，纯装饰）
    ctx.save()
    for (let i = 0; i < 40; i++) {
      const x = (i * 137.51) % layout.width
      const y = (i * 61.8) % layout.height
      ctx.globalAlpha = 0.1 + ((i * 7) % 10) / 60
      ctx.fillStyle = '#9FB0D8'
      ctx.fillRect(x, y, 1.4, 1.4)
    }
    ctx.restore()

    // 星系（簇）虚线圈 + 标签
    for (const c of layout.clusters) {
      ctx.save()
      ctx.strokeStyle = `hsla(${c.tag === '未分域' ? 220 : (c.tag.length * 37) % 360}, 60%, 62%, 0.22)`
      ctx.setLineDash([4, 5])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '10px -apple-system,Segoe UI,PingFang SC,sans-serif'
      ctx.fillStyle = 'rgba(160,170,196,0.75)'
      ctx.textAlign = 'center'
      ctx.fillText(`#${c.tag}·${c.count}`, c.cx, Math.max(10, c.cy - c.r - 4))
      ctx.restore()
    }

    // 星体
    for (const s of layout.stars) {
      ctx.save()
      const color = `hsla(${s.hue}, 66%, 64%, ${s.alpha})`
      if (s.status === 'active') {
        ctx.shadowColor = color
        ctx.shadowBlur = 9
      }
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      if (s.due) {
        ctx.strokeStyle = 'rgba(240,111,100,0.9)'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r + 3.2, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (s.status === 'done') {
        ctx.strokeStyle = 'rgba(126,226,160,0.7)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r + 2.4, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }

    // 悬停气泡
    const hv = hover ? layout.stars.find((s) => s.id === hover) : null
    if (hv) {
      ctx.save()
      ctx.font = '11px -apple-system,Segoe UI,PingFang SC,sans-serif'
      const label = hv.title.length > 18 ? `${hv.title.slice(0, 17)}…` : hv.title
      const tw = ctx.measureText(label).width + 14
      const bx = clamp(hv.x - tw / 2, 4, layout.width - tw - 4)
      const by = clamp(hv.y - 30, 4, layout.height - 22)
      ctx.fillStyle = 'rgba(10,13,22,0.92)'
      ctx.strokeStyle = 'rgba(139,124,246,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, tw, 18, 6)
      else ctx.rect(bx, by, tw, 18)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#E6E9F2'
      ctx.textAlign = 'left'
      ctx.fillText(label, bx + 7, by + 13)
      ctx.restore()
    }
  }, [layout, hover])

  const pickStar = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !layout) return null
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    let best: StarLayoutStar | null = null
    let bestD = Infinity
    for (const s of layout.stars) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2
      const hit = Math.max(13, s.r + 7)
      if (d < hit * hit && d < bestD) {
        best = s
        bestD = d
      }
    }
    return best
  }

  if (!ideas.length) {
    return (
      <>
        <div className="lx-empty">
          星空还是空的。<br />
          去对话里说「记个想法：…」，或在「池子」页快捕一条——<br />
          每个念头都会化作一颗星，到期自动回来见你。
        </div>
        <Legend />
      </>
    )
  }

  return (
    <>
      <div className="lx-mapwrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={size.h ? { height: size.h } : undefined}
          onMouseMove={(e) => {
            const s = pickStar(e.clientX, e.clientY)
            setHover(s ? s.id : null)
          }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const s = pickStar(e.clientX, e.clientY)
            if (s) onOpenIdea(s.id)
          }}
        />
      </div>
      <Legend />
    </>
  )
}

interface StarLayoutStar {
  id: string
  x: number
  y: number
  r: number
  title: string
}

function Legend() {
  return (
    <div className="lx-legend">
      {MATURITIES.map((m, i) => (
        <span key={m.key}><i style={{ width: 4 + i * 2.4, height: 4 + i * 2.4, background: '#8B7CF6', opacity: 0.9 }} />{m.label}</span>
      ))}
      <span><i style={{ width: 8, height: 8, background: 'transparent', border: '1.4px solid #F06F64' }} />到期</span>
      <span><i style={{ width: 8, height: 8, background: 'transparent', border: '1px solid #7EE2A0' }} />已落地</span>
      <span><i style={{ width: 7, height: 7, background: '#3a4152' }} />归档</span>
      <span style={{ marginLeft: 'auto' }}>星系 = 主标签</span>
    </div>
  )
}
