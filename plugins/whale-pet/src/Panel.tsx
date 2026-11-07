/**
 * Panel.tsx —— ds大肥鱼桌面宠物：经插件 HTTP 服务加载 webm 动画。
 *
 * 为什么走插件服务：宿主面板 invoke 白名单（main.tsx HOST_INVOKE_ALLOWLIST）
 * 不放行 download_file_binary——面板无法直接读盘。插件服务进程不受限，
 * 面板经 127.0.0.1:<port>/asset/webm/<动画名>.webm 拉取（animation-2d 同范式）。
 *
 * 资源通道（Phase 0，APK 端修复）：
 * - 桌面：面板直连 localhost:<port>（direct，流式边下边播）
 * - 移动/Web：经宿主 cap.http 转发（viaCap，宿主的 Rust 进程在桌面机发起请求，
 *   127.0.0.1 指向桌面 server.js——手机 webview 里 127.0.0.1 指手机自身，直连必失败）
 * 通道自动探测：先试 direct，失败再试 viaCap，两候选健康检查后选命中者。
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

const FALLBACK_PORT = 9863 // 仅兜底：宿主未分配端口时用（v0.4.2 起 service 不再写死 port，由宿主动态分配，dev/正式版同机共存不冲突）

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

/** 服务端口解析：经 router_dispatch → cap.pluginServiceManager.list_status 查 whale-pet-assets
 *  动态分配端口（v0.4.2 起 service 不写死 port），兜底 FALLBACK_PORT。
 *
 *  为什么走 list_status 而非旧的 plugin_service_list：宿主未暴露 plugin_service_list
 *  command，正确总线入口是 cap.pluginServiceManager 的 list_status action，返回
 *  ServiceStatus[] 裸数组（pluginId/serviceId/port/state；serde camelCase）。
 *  旧版写死 9863 时 FALLBACK_PORT 恰好命中掩盖了此 bug，改动态端口后暴露。 */
async function resolvePort(invoke: HostInvoke): Promise<number> {
  let port = FALLBACK_PORT
  try {
    const res = await invoke<{ ok: boolean; result?: unknown; error?: string }>(
      'router_dispatch',
      { req: { target: 'cap.pluginServiceManager', payload: { action: 'list_status' } } },
    )
    if (res?.ok) {
      const arr = Array.isArray(res.result) ? res.result : []
      const svc = arr.find((s: unknown) => {
        const x = s as { pluginId?: string; serviceId?: string; port?: number }
        return x.pluginId === 'whale-pet' && x.serviceId === 'whale-pet-assets' && typeof x.port === 'number'
      }) as { port?: number } | undefined
      if (svc?.port) port = svc.port
    }
  } catch { /* 兜底端口 */ }
  return port
}

/**
 * 资源通道：direct = 面板直连本地服务（桌面）；viaCap = 经宿主 cap.http 转发（移动/Web 端）。
 *
 * 为什么区分（Phase 0，APK 端修复）：手机 APK 是远程壳，面板 fetch localhost:port
 * 连的是**手机本机**，而 server.js 跑在桌面 → 必然 Failed to fetch。cap.http 由宿主
 * Rust 进程（桌面机）发起请求，127.0.0.1 指向桌面本机 server.js，任何环境都可达。
 * cap.http 已 no_proxy()（主仓 http_capability.rs），不踩 Clash 系统代理截 127.0.0.1 的坑；
 * 二进制（video/webm）返回 base64 + isBase64:true。
 */
type Channel = 'direct' | 'viaCap'

/** base64 → Blob URL（cap.http 二进制响应是 base64 字符串） */
function b64ToBlobUrl(b64: string, contentType: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const blob = new Blob([bytes], { type: contentType || 'video/webm' })
  return URL.createObjectURL(blob)
}

/**
 * 加载动画资源，返回可直接设给 <video>.src 的 URL。
 * - direct：返回直连地址（流式，视频边下边播，桌面首选）
 * - viaCap：cap.http 全量下载 → base64 → blob URL（移动/Web 端，127.0.0.1 连的是桌面）。
 *   结果按 anim 缓存（同动画反复播放不重复下载）；缓存由调用方在卸载时统一 revoke。
 */
async function loadAsset(
  base: string, channel: Channel, anim: string, ext: string, contentType: string,
  cache: Map<string, string>,
): Promise<string> {
  if (channel === 'direct') return `${base}/asset/webm/${encodeURIComponent(anim)}${ext}`
  const key = `${anim}${ext}`
  const hit = cache.get(key)
  if (hit) return hit
  const r = await capHttpFetch('GET', `${base}/asset/webm/${encodeURIComponent(anim)}${ext}`, 60000)
  if (r.status !== 200) throw new Error(`资源加载失败 HTTP ${r.status}: ${anim}`)
  if (!r.isBase64) throw new Error(`cap.http 响应非 base64（${r.contentType || '未知'}）: ${anim}`)
  const url = b64ToBlobUrl(r.body, r.contentType || contentType)
  cache.set(key, url)
  return url
}

/** 经宿主 cap.http 发起请求（cap.http 契约：二进制 body 为 base64，isBase64:true）。
 *  调用链：__POLARIS_HOST_INVOKE__('router_dispatch') → RouterBus → cap.http → reqwest。 */
async function capHttpFetch(method: string, url: string, timeoutMs = 60000): Promise<{ status: number; body: string; isBase64: boolean; contentType: string }> {
  const res = await getInvoke()<{ ok: boolean; result?: Record<string, unknown>; error?: string | null }>(
    'router_dispatch',
    { req: { target: 'cap.http', payload: { action: 'request', method, url, timeoutMs } } },
  )
  if (!res || !res.ok) throw new Error((res && res.error) || 'cap.http 转发失败')
  const r = (res.result || {}) as Record<string, unknown>
  return {
    status: Number(r.status) || 0,
    body: String(r.body ?? ''),
    isBase64: !!r.isBase64,
    contentType: String(r.contentType || ''),
  }
}

/** 单轮探测：先 direct（桌面直连，localhost 走内置直连规避系统代理），再 viaCap（宿主转发）。
 *  返回命中的 { channel, base }，或 null（本轮未命中，调用方决定重试）。 */
async function probeHealth(port: number): Promise<{ channel: Channel; base: string } | null> {
  // direct：localhost 优先（系统代理 Clash 下 127.0.0.1 可能被代理截走，localhost 走内置直连）
  for (const base of [`http://localhost:${port}`, `http://127.0.0.1:${port}`]) {
    const ok = await fetch(`${base}/__health`).then((r) => r.json()).then((j) => !!j?.ok).catch(() => false)
    if (ok) return { channel: 'direct', base }
  }
  // viaCap：宿主转发到桌面 127.0.0.1（移动/Web 端）
  const viaBase = `http://127.0.0.1:${port}`
  try {
    const r = await capHttpFetch('GET', `${viaBase}/__health`, 8000)
    if (r.status === 200) return { channel: 'viaCap', base: viaBase }
  } catch { /* 本轮未命中 */ }
  return null
}

/** 动画资源类型（server.js 白名单扩展名 → MIME；video 走 base64，其余 fetch 直读） */
const EXT_MIME: Record<string, string> = {
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
}

export default function WhalePetPanel(props: { pluginId?: string; onSendToChat?: (message: string) => void | Promise<void> }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<{ pokes: number }>({ pokes: 0 })
  const [phase, setPhase] = useState<'init' | 'ready' | 'error'>('init')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const currentAnimRef = useRef<string>(IDLE[0])
  const channelRef = useRef<Channel>('direct')
  const baseRef = useRef<string | null>(null)
  const onPokeRef = useRef<() => void>(() => {})
  // viaCap 通道的 blob URL 缓存（按 anim+ext 键；同动画复用）。卸载时统一 revoke。
  const blobCacheRef = useRef<Map<string, string>>(new Map())

  // R1 桌面悬浮（spike）：宿主 main.tsx 暴露 __POLARIS_PET_OVERLAY__ 桥（Tauri 桌面才有），
  // 经固定配置 WebviewWindow 开透明置顶悬浮窗。桥不存在（旧宿主/移动/Web）则按钮隐藏。
  const petOverlayApi = (window as unknown as {
    __POLARIS_PET_OVERLAY__?: { open(): Promise<string>; close(): Promise<void> }
  }).__POLARIS_PET_OVERLAY__
  const [overlayBusy, setOverlayBusy] = useState(false)
  const openOverlay = useCallback(() => {
    if (!petOverlayApi || overlayBusy) return
    setOverlayBusy(true)
    petOverlayApi.open()
      .then((r) => { if (String(r).startsWith('error')) window.alert(`悬浮窗打开失败：${r}`) })
      .catch((e) => window.alert(`悬浮窗打开失败：${String(e instanceof Error ? e.message : e)}`))
      .finally(() => setOverlayBusy(false))
  }, [overlayBusy])

  const switchTo = useCallback(async (anim: string, once: boolean) => {
    const base = baseRef.current
    if (!base) return
    const v = videoRef.current
    if (!v) return
    try {
      const url = await loadAsset(base, channelRef.current, anim, '.webm', EXT_MIME['.webm'], blobCacheRef.current)
      v.src = url
      v.loop = !once
      currentAnimRef.current = anim
      await v.play()
    } catch (e) {
      // 播放失败不致命：保持上一帧，下轮 handleEnded 会再试
      void e
    }
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
        const port = await resolvePort(invoke)
        if (!alive) return
        // 通道探测：direct（桌面直连）→ viaCap（宿主转发）。各轮循环直到任一命中
        // 或 8 轮耗尽（宿主拉起服务有延迟；通道间无需轮换——probeHealth 内部已测两候选）
        let working: { channel: Channel; base: string } | null = null
        for (let i = 0; i < 8 && !working; i++) {
          if (!alive) return
          working = await probeHealth(port)
          if (!working && alive) setErrMsg(`资源服务启动中…（第 ${i + 1} 轮探测）`)
          if (!working) await new Promise((r) => setTimeout(r, 1500))
        }
        if (!alive) return
        if (!working) {
          setPhase('error')
          setErrMsg(`资源服务未就绪（localhost:${port}）。可点击此提示重试；若反复失败请重启应用。`)
          return
        }
        baseRef.current = working.base
        channelRef.current = working.channel
        setPhase('ready')
        // 待机动画
        const v = videoRef.current
        if (v) {
          const url = await loadAsset(working.base, working.channel, IDLE[0], '.webm', EXT_MIME['.webm'], blobCacheRef.current)
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
    // 卸载时释放全部 blob URL（viaCap 通道产生；direct 直连地址非 blob 无需释放）
    return () => {
      alive = false
      blobCacheRef.current.forEach((u) => { try { URL.revokeObjectURL(u) } catch { /* 忽略 */ } })
      blobCacheRef.current.clear()
    }
  }, [retryTick])

  return (
    <div style={{ font: '13px/1.55 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', color: '#d7dde6', background: '#0a1428', minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>ds<span style={{ color: '#3b82f6' }}>大肥鱼</span></span>
        <span style={{ fontSize: 10, color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 6, padding: '1px 6px' }}>v0.4.3</span>
        {petOverlayApi && (
          <button
            onClick={openOverlay}
            disabled={overlayBusy}
            style={{
              fontSize: 11, color: '#3b82f6', background: 'transparent', border: '1px solid #3b82f6',
              borderRadius: 6, padding: '2px 8px', cursor: overlayBusy ? 'wait' : 'pointer',
            }}
            title="在桌面上打开透明置顶悬浮窗（R1 spike）"
          >{overlayBusy ? '开窗中…' : '🖥 悬浮桌面'}</button>
        )}
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
