/**
 * Panel.tsx —— v0.3.0 dsh 形象正式版：经插件 HTTP 服务加载 webm 动画。
 *
 * 为什么走插件服务：宿主面板 invoke 白名单（main.tsx HOST_INVOKE_ALLOWLIST）
 * 不放行 download_file_binary——面板无法直接读盘。插件服务进程不受限，
 * 面板 fetch 127.0.0.1:<port>/asset/webm/<动画名>.webm（animation-2d 同范式）。
 *
 * 服务地址：优先 plugin_service_list 查宿主分配端口，兜底 manifest 声明的 9863。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

function getInvoke(): HostInvoke {
  const w = window as unknown as { __POLARIS_HOST_INVOKE__?: HostInvoke }
  if (!w.__POLARIS_HOST_INVOKE__) throw new Error('__POLARIS_HOST_INVOKE__ 不存在（请更新 Polaris 主应用）')
  return w.__POLARIS_HOST_INVOKE__
}

const FALLBACK_PORT = 9863

const IDLE = ['待机呼吸休闲']
const TURN = ['东张西望']
const DRAG = ['被鼠标拖拽悬空反馈']
const CLICKS = [
  '点击回应-开心跃动',
  '点击回应-害羞惊讶',
  '点击回应-傲娇生气',
  '点击回应-挠痒咯咯笑',
  '点击回应-元气挥手',
]
// 随机动作分类池（同步自 dsh-pet config.jsonc，MIT, PC2005-cloud）
const CATEGORIES: { id: string; weight: number; actions: string[] }[] = [
  { id: '小动作', weight: 20, actions: ['悠闲哼歌', '超大伸懒腰', '原地敲击桌面互动', '原地重力下蹲压缩', '哈欠连天', '原地小憩沉眠', '女仆屈膝礼仪', '被吓一跳', '小幅度原地360度旋转展示', '偷吃零食被抓住', '用鲸鱼尾巴拍打地面', '打瞌睡被惊醒', '照镜子', '整体换装试色', '轻快记录', '写代码', '摇扇纳凉', '晨间刷牙'] },
  { id: '玩耍', weight: 20, actions: ['原地专心玩魔方', '原地蹲下玩玩具汽车', '鲸鱼吐泡泡特效', '原地跳跃抓碎头顶物品', '玩游戏气急败坏', '玩水枪', '小提琴演奏', '蓝鲸现世', '优雅女仆舞', '轻快摇摆舞', '可爱宅舞', '吹气球', '动物环绕', '放风筝', '拆礼物', '变鸽子', '扑克魔术', '抽陀螺', '吹笛子', '蝴蝶蜜蜂环绕头顶开花', '撸猫', '凭空生花', '骑木马', '三球抛接', '踢毽子', '下五子棋', '荡秋千'] },
  { id: '吃什么', weight: 16, actions: ['吃白饭', '大口吃零食', '吃Token', '吃早餐', '吃午餐', '吃晚餐', '吃冰淇淋融化', '吃大闸蟹', '吃糖葫芦', '吃长寿面', '吃西瓜', '涮火锅'] },
  { id: '时节', weight: 14, actions: ['被落叶淹没', '中秋赏月吃月饼', '堆雪人', '放烟花', '吃粽子', '吃年糕', '吃青团', '吃腊八粥', '吃重阳糕', '收红包', '写福字', '穿针乞巧', '舞狮头', '讨糖南瓜灯', '插茱萸赏菊', '放河灯', '萌化小幽灵', '装点圣诞树', '放孔明灯', '吃汤圆', '吃饺子'] },
  { id: '文字', weight: 10, actions: ['是啊，吃什么', '深度思考碎碎念'] },
]
const IDLE_WEIGHT = 10
const TURN_WEIGHT = 5
const MOVE_WEIGHT = 5

function pick<T>(arr: T[], avoid?: T): T {
  if (arr.length === 1) return arr[0]
  const filtered = avoid ? arr.filter((x) => x !== avoid) : arr
  const pool = filtered.length ? filtered : arr
  return pool[Math.floor(Math.random() * pool.length)]
}

function rollNext(current: string): { anim: string; once: boolean } {
  const totalCat = CATEGORIES.reduce((s, c) => s + c.weight, 0)
  const r = Math.random() * 100
  let acc = 0
  if (r < (acc += IDLE_WEIGHT)) return { anim: pick(IDLE, current), once: false }
  if (r < (acc += TURN_WEIGHT)) return { anim: pick(TURN, current), once: false }
  if (r < (acc += MOVE_WEIGHT)) return { anim: pick(CATEGORIES[1].actions, current), once: true }
  const catR = Math.random() * totalCat
  let cAcc = 0
  for (const c of CATEGORIES) {
    cAcc += c.weight
    if (catR < cAcc) return { anim: pick(c.actions, current), once: true }
  }
  return { anim: pick(IDLE, current), once: false }
}

/** 服务地址解析：宿主服务状态查端口，返回 localhost 与 127.0.0.1 两个候选。
 *  为什么两个：系统代理（Clash 7897）下 WebView fetch 127.0.0.1 可能被代理截走，
 *  而 localhost 走 Chromium 内置直连规则；宿主自身 fetch localhost:9820 可用是先例。 */
async function resolveCandidates(invoke: HostInvoke): Promise<string[]> {
  let port = FALLBACK_PORT
  try {
    const res = await invoke<{ ok?: boolean; result?: { services?: Array<{ pluginId: string; serviceId: string; port?: number; state?: string }> }; services?: Array<{ pluginId: string; serviceId: string; port?: number; state?: string }> }>('plugin_service_list', {})
    const wrapped = res as { result?: { services?: Array<{ pluginId: string; serviceId: string; port?: number; state?: string }> }; services?: Array<{ pluginId: string; serviceId: string; port?: number; state?: string }> }
    const services = wrapped?.result?.services ?? wrapped?.services ?? []
    const svc = services.find((s) => s.pluginId === 'whale-pet' && s.serviceId === 'whale-pet-assets' && s.port)
    if (svc?.port) port = svc.port
  } catch { /* 兜底端口 */ }
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`]
}

export default function WhalePetPanel(props: { pluginId?: string; onSendToChat?: (message: string) => void | Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<{ pokes: number }>({ pokes: 0 })
  const [phase, setPhase] = useState<'init' | 'ready' | 'error'>('init')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const currentAnimRef = useRef<string>(IDLE[0])
  const baseRef = useRef<string | null>(null)
  const onPokeRef = useRef<() => void>(() => {})

  const switchTo = useCallback(async (anim: string, once: boolean) => {
    const base = baseRef.current
    if (!base) return
    const v = videoRef.current
    if (!v) return
    v.src = `${base}/asset/webm/${encodeURIComponent(anim)}.webm`
    v.loop = !once
    currentAnimRef.current = anim
    try { await v.play() } catch { /* autoplay 拒绝静默 */ }
  }, [])

  const handleEnded = useCallback(() => {
    const next = rollNext(currentAnimRef.current)
    void switchTo(next.anim, next.once)
  }, [switchTo])

  const handleClick = useCallback(() => {
    onPokeRef.current()
    void switchTo(pick(CLICKS), true)
  }, [switchTo])

  useEffect(() => {
    onPokeRef.current = () => setState((s) => ({ pokes: s.pokes + 1 }))
  }, [])

  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const invoke = getInvoke()
        const candidates = await resolveCandidates(invoke)
        if (!alive) return
        // 健康检查：候选地址轮换 × 8 轮（宿主拉起服务有延迟 + 双地址适配代理/直连差异）
        let working: string | null = null
        for (let i = 0; i < 8 && !working; i++) {
          for (const base of candidates) {
            if (!alive) return
            const ok = await fetch(`${base}/__health`).then((r) => r.json()).then((j) => !!j?.ok).catch(() => false)
            if (ok) { working = base; break }
          }
          if (!working && alive) setErrMsg(`资源服务启动中…（第 ${i + 1} 轮探测）`)
          if (!working) await new Promise((r) => setTimeout(r, 1500))
        }
        if (!alive) return
        if (!working) {
          setPhase('error')
          setErrMsg(`资源服务未就绪（${candidates[0]}）。可点击此提示重试；若反复失败请重启应用。`)
          return
        }
        baseRef.current = working
        setPhase('ready')
        // 待机动画
        const v = videoRef.current
        if (v) {
          const url = `${working}/asset/webm/${encodeURIComponent(IDLE[0])}.webm`
          v.src = url
          v.loop = true
          currentAnimRef.current = IDLE[0]
          setVideoSrc(url)
          void v.play().catch(() => {})
        }
      } catch (e) {
        if (alive) {
          setPhase('error')
          setErrMsg(String(e instanceof Error ? e.message : e).slice(0, 120))
        }
      }
    })()
    return () => { alive = false }
  }, [retryTick])

  return (
    <div style={{ font: '13px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', color: '#d7dde6', background: '#0a1428', minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>ds<span style={{ color: '#3b82f6' }}>大肥鱼</span></span>
        <span style={{ fontSize: 10, color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 6, padding: '1px 6px' }}>v0.3.2</span>
        <span style={{ color: '#7d8590', fontSize: 11, marginLeft: 'auto' }}>已陪伴 {state.pokes} 次</span>
      </div>

      <div
        onClick={handleClick}
        style={{ flex: 1, position: 'relative', minHeight: 260, borderTop: '1px solid #1f2630', borderBottom: '1px solid #1f2630', overflow: 'hidden', cursor: 'pointer', background: 'linear-gradient(#0b1f3a, #0a1428)' }}
      >
        <video
          ref={videoRef}
          loop muted playsInline
          onEnded={handleEnded}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: videoSrc ? 'block' : 'none' }}
        />
        {phase === 'init' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7d8590', fontSize: 12 }}>鲸鱼正在游过来…</div>
        )}
        {phase === 'error' && errMsg && (
          <div
            onClick={() => { setPhase('init'); setErrMsg(null); setRetryTick((t) => t + 1) }}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f0883e', fontSize: 12, padding: 20, textAlign: 'center', cursor: 'pointer' }}
            title="点击重试"
          >{errMsg}</div>
        )}
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#7d8590', flexWrap: 'wrap' }}>
        <span>点击鲸鱼 <span style={{ color: '#3b82f6', fontWeight: 600 }}>{state.pokes}</span> 次 · 它会回应你</span>
      </div>
    </div>
  )
}
