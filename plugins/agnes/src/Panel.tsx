/**
 * Agnes 多模态面板 — 生图 / 生视频 / 设置
 *
 * 从内置版（src/plugins/agnes/）移植，改为外部插件模式：
 * - 配置持久化：hostInvoke('plugin_get_config' / 'plugin_set_config') → config.json 的 plugins["agnes"]
 * - 生图/生视频：面板直连 Agnes API（fetch，浏览器环境），与 MCP 共用同一套组包逻辑
 * - 历史与轮询：组件内 useState + setInterval（外部面板无 zustand store）
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入（--external:react）。
 */

import { useEffect, useState, useCallback, useRef } from 'react'

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface AgnesConfig {
  apiKey: string
  apiBase: string
  imageModel: string
  videoModel: string
  defaultSize: string
}

interface ImageHistoryItem {
  prompt: string
  size: string
  src: string
  model: string
  createdAt: number
}

interface VideoHistoryItem {
  prompt: string
  videoId: string
  status: string
  progress: number
  url: string | null
  seconds: string | null
  size: string | null
  error: string | null
  createdAt: number
}

type ImageMode = 'text' | 'image'
type VideoMode = 'text' | 'image' | 'multi' | 'keyframes'
type Tab = 'image' | 'video' | 'settings'

const PLUGIN_ID = 'agnes'
const MAX_IMAGE_HISTORY = 12
const MAX_VIDEO_HISTORY = 8
const POLL_INTERVAL_MS = 5000

// ── 帧数档位 / 尺寸预设（与内置版 api.ts 一致） ─────────────────────────────────
const FRAME_PRESETS: { label: string; frames: number; rate: number; seconds: string }[] = [
  { label: '约 3 秒', frames: 81, rate: 24, seconds: '3.4' },
  { label: '约 5 秒', frames: 121, rate: 24, seconds: '5.0' },
  { label: '约 10 秒', frames: 241, rate: 24, seconds: '10.0' },
  { label: '约 18 秒', frames: 441, rate: 24, seconds: '18.4' },
]

const IMAGE_SIZE_PRESETS = ['1024x1024', '1024x768', '768x1024', '1280x768', '768x1280']

// ── 通信层 ────────────────────────────────────────────────────────────────────

/** 宿主 invoke（桌面 Tauri IPC + Web 的统一入口，由 main.tsx 注入）。 */
async function hostInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const invoker = (window as unknown as {
    __POLARIS_HOST_INVOKE__?: (c: string, a?: Record<string, unknown>) => Promise<T>
  }).__POLARIS_HOST_INVOKE__
  if (invoker) return invoker(cmd, args)
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> }
  }).__TAURI_INTERNALS__
  if (internals?.invoke) return internals.invoke(cmd, args)
  throw new Error('宿主 invoke 不可用（需在 Polaris 内运行）')
}

async function loadConfig(): Promise<AgnesConfig> {
  const cfg = await hostInvoke<Record<string, unknown>>('plugin_get_config', { pluginId: PLUGIN_ID })
  return {
    apiKey: (cfg.apiKey as string) || '',
    apiBase: (cfg.apiBase as string) || 'https://apihub.agnes-ai.com',
    imageModel: (cfg.imageModel as string) || 'agnes-image-2.1-flash',
    videoModel: (cfg.videoModel as string) || 'agnes-video-v2.0',
    defaultSize: (cfg.defaultSize as string) || '1024x1024',
  }
}

async function saveConfig(patch: Partial<AgnesConfig>): Promise<void> {
  await hostInvoke('plugin_set_config', { pluginId: PLUGIN_ID, patch })
}

/** 把本地 File 转 data URL（用于图生图/图生视频上传）。 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** 把 base64 图片数据转为 data URL 供 <img> 直接渲染。 */
function toDataUrl(base64: string, mimeType = 'image/png'): string {
  if (base64.startsWith('data:')) return base64
  return `data:${mimeType};base64,${base64}`
}

// ── Agnes API（面板直连，组包与 MCP server.js 对齐） ─────────────────────────

interface AgnesImageResult {
  url: string | null
  base64: string | null
  mimeType: string
  revisedPrompt: string | null
  size: string
  model: string
}

interface AgnesVideoTask {
  videoId: string
  taskId: string | null
  status: string
  progress: number
  seconds: string | null
  size: string | null
  url: string | null
  error: string | null
  framesNormalized: boolean
}

/**
 * 经宿主 cap.http 发起请求（面板模式）。
 *
 * 调用链：hostInvoke('router_dispatch') → RouterBus → cap.http → 宿主 reqwest 转发。
 * 相比浏览器 fetch 直连：无 CORS / 混合内容限制，可携带禁发头，Web/移动端等价桌面 Tauri IPC。
 * 仅在宿主桥不可用时回退浏览器 fetch（如纯浏览器调试）。
 */
async function capHttpRequest(opts: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
  bodyType?: 'text' | 'json'
  timeoutMs?: number
}): Promise<{ status: number; statusText: string; ok: boolean; body: string }> {
  const res = await hostInvoke<{ ok: boolean; result?: Record<string, unknown>; error?: string | null }>(
    'router_dispatch',
    {
      req: {
        target: 'cap.http',
        payload: {
          action: 'request',
          method: opts.method,
          url: opts.url,
          headers: opts.headers || {},
          body: opts.body || '',
          bodyType: opts.bodyType || 'text',
          timeoutMs: opts.timeoutMs || 120000,
        },
      },
    },
  )
  if (!res || !res.ok) throw new Error((res && res.error) || 'cap.http 转发失败')
  const result = (res.result || {}) as Record<string, unknown>
  return {
    status: Number(result.status) || 0,
    statusText: String(result.statusText || ''),
    ok: !!result.ok,
    body: String(result.body ?? ''),
  }
}

async function agnesFetch<T>(cfg: AgnesConfig, apiPath: string, init: RequestInit): Promise<T> {
  const url = `${cfg.apiBase.replace(/\/+$/, '')}${apiPath}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`,
    ...(init.headers as Record<string, string> | undefined || {}),
  }
  const method = init.method || 'GET'
  const bodyStr = init.body ? String(init.body) : ''

  // 通道 1：宿主 cap.http 转发（无 CORS）
  try {
    const r = await capHttpRequest({ method, url, headers, body: bodyStr, bodyType: 'json' })
    if (!r.ok) {
      throw new Error(`API 返回错误 ${r.status}: ${String(r.body || '').slice(0, 500)}`)
    }
    return JSON.parse(r.body || '{}') as T
  } catch (e) {
    // cap.http 能力不可用时回退浏览器 fetch（可能遇 CORS）；HTTP 业务错误直接抛
    if (String(e?.message || '').match(/^API 返回错误/)) throw e
  }
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}`, ...(init.headers || {}) },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API 返回错误 ${res.status}: ${text.slice(0, 500)}`)
  }
  return res.json()
}

async function generateImage(cfg: AgnesConfig, input: {
  prompt: string
  size?: string
  images?: string[]
  responseFormat?: 'url' | 'b64_json'
}): Promise<AgnesImageResult> {
  const size = input.size || cfg.defaultSize
  const responseFormat = input.responseFormat || 'url'
  const images = input.images || []
  const body: Record<string, unknown> = { model: cfg.imageModel, prompt: input.prompt, size }
  if (images.length > 0) {
    body.extra_body = { image: images, response_format: responseFormat }
  } else if (responseFormat === 'b64_json') {
    body.return_base64 = true
  } else {
    body.extra_body = { response_format: 'url' }
  }
  const resp = await agnesFetch<{ data: Array<Record<string, unknown>> }>(cfg, '/v1/images/generations', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const data = resp.data?.[0] || {}
  return {
    url: typeof data.url === 'string' ? data.url : null,
    base64: typeof data.b64_json === 'string' ? data.b64_json : null,
    mimeType: 'image/png',
    revisedPrompt: typeof data.revised_prompt === 'string' ? data.revised_prompt : null,
    size,
    model: cfg.imageModel,
  }
}

/** 帧数合法化（8n+1 且 ≤441）。 */
function normalizeNumFrames(requested: number): number {
  const clamped = Math.min(Math.max(requested, 9), 441)
  const k = Math.round((clamped - 1) / 8)
  return Math.min(Math.max(8 * k + 1, 9), 441)
}

async function createVideo(cfg: AgnesConfig, input: {
  prompt: string
  numFrames?: number
  frameRate?: number
  image?: string
  images?: string[]
  mode?: 'ti2vid' | 'keyframes'
  negativePrompt?: string
  seed?: number
}): Promise<AgnesVideoTask> {
  const requestedFrames = input.numFrames || 121
  const numFrames = normalizeNumFrames(requestedFrames)
  const body: Record<string, unknown> = {
    model: cfg.videoModel,
    prompt: input.prompt,
    width: 1152,
    height: 768,
    num_frames: numFrames,
    frame_rate: input.frameRate || 24,
  }
  if (input.image) body.image = input.image
  if (input.negativePrompt) body.negative_prompt = input.negativePrompt
  if (input.seed !== undefined) body.seed = input.seed
  const extra: Record<string, unknown> = {}
  if (input.images && input.images.length > 0) extra.image = input.images
  if (input.mode) {
    if (input.mode === 'keyframes') extra.mode = 'keyframes'
    else body.mode = input.mode
  }
  if (Object.keys(extra).length > 0) body.extra_body = extra

  const resp = await agnesFetch<Record<string, unknown>>(cfg, '/v1/videos', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const videoId = (typeof resp.video_id === 'string' && resp.video_id)
    ? resp.video_id
    : (typeof resp.id === 'string' ? resp.id : '')
  if (!videoId) throw new Error('响应缺少 video_id')
  return {
    videoId,
    taskId: typeof resp.task_id === 'string' ? resp.task_id : null,
    status: typeof resp.status === 'string' ? resp.status : 'queued',
    progress: typeof resp.progress === 'number' ? resp.progress : 0,
    seconds: typeof resp.seconds === 'string' ? resp.seconds : null,
    size: typeof resp.size === 'string' ? resp.size : null,
    url: null,
    error: null,
    framesNormalized: requestedFrames !== numFrames,
  }
}

async function queryVideo(cfg: AgnesConfig, videoId: string): Promise<AgnesVideoTask> {
  const encoded = encodeURIComponent(videoId)
  let resp: Record<string, unknown>
  try {
    resp = await agnesFetch<Record<string, unknown>>(cfg, `/agnesapi?video_id=${encoded}`, { method: 'GET' })
  } catch (e) {
    if (e instanceof Error && e.message.includes('404')) {
      resp = { status: 'queued', progress: 0 }
    } else {
      throw e
    }
  }
  const status = typeof resp.status === 'string' ? resp.status : 'unknown'
  const url = (typeof resp.url === 'string' && resp.url.trim()) ? resp.url : null
  const error = status === 'failed'
    ? (typeof resp.error === 'string' ? resp.error : '未知错误')
    : null
  return {
    videoId,
    taskId: typeof resp.task_id === 'string' ? resp.task_id : null,
    status,
    progress: typeof resp.progress === 'number' ? resp.progress : 0,
    seconds: typeof resp.seconds === 'string' ? resp.seconds : null,
    size: typeof resp.size === 'string' ? resp.size : null,
    url,
    error,
    framesNormalized: false,
  }
}

// ── 样式 ──────────────────────────────────────────────────────────────────────

const styles = {
  container: { padding: 14, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, overflow: 'auto' as const },
  tabs: { display: 'flex', gap: 6, borderBottom: '1px solid #3F3F46', paddingBottom: 8 },
  tab: (active: boolean) => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #3F3F46',
    background: active ? '#3B82F6' : '#2D2D33', color: active ? '#fff' : '#B4B4B8',
  }),
  label: { fontSize: 11, color: '#8E8E93', marginBottom: 4 },
  input: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, boxSizing: 'border-box' as const },
  textarea: { width: '100%', minHeight: 90, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' as const, resize: 'vertical' as const },
  select: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12 },
  btn: (primary = false) => ({
    padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    background: primary ? '#3B82F6' : '#2D2D33', color: primary ? '#fff' : '#B4B4B8',
    border: primary ? 'none' : '1px solid #3F3F46',
  }),
  card: { padding: 10, borderRadius: 8, border: '1px solid #3F3F46', background: '#25252B', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  field: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  row: { display: 'flex', gap: 8, alignItems: 'center' },
  statusOk: { fontSize: 12, color: '#4ADE80', padding: 4 },
  statusErr: { fontSize: 12, color: '#F87171', padding: 4 },
  chip: (active: boolean) => ({
    padding: '4px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer', border: '1px solid #3F3F46',
    background: active ? '#3B82F6' : '#2D2D33', color: active ? '#fff' : '#B4B4B8',
  }),
  thumb: { width: 64, height: 64, borderRadius: 6, objectFit: 'cover' as const, border: '1px solid #3F3F46' },
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <div style={styles.label}>{label}</div>
      {children}
    </div>
  )
}

// ── 处理函数（生图/生视频共用，供两个 Tab 内联处理） ──────────────────────────

/** 任务轮询器：videoId → timer，模块级 map（组件卸载不丢失在跑任务）。 */
const pollTimers = new Map<string, ReturnType<typeof setInterval>>()

function useVideoPoller(applyUpdate: (videoId: string, task: AgnesVideoTask) => void) {
  const applyRef = useRef(applyUpdate)
  applyRef.current = applyUpdate

  const startPolling = useCallback((videoId: string) => {
    if (pollTimers.has(videoId)) return
    const tick = async () => {
      if (document.hidden) return
      try {
        const cfg = await loadConfig()
        const task = await queryVideo(cfg, videoId)
        applyRef.current(videoId, task)
        if (task.status === 'completed' || task.status === 'failed') {
          const t = pollTimers.get(videoId)
          if (t) { clearInterval(t); pollTimers.delete(videoId) }
        }
      } catch (e) {
        console.error('[Agnes] poll failed', e)
      }
    }
    pollTimers.set(videoId, setInterval(tick, POLL_INTERVAL_MS))
    void tick()
  }, [])

  useEffect(() => {
    return () => {
      // 组件卸载时保留轮询？外部面板无持久化 store，卸载即停止较安全。
      for (const t of pollTimers.values()) clearInterval(t)
      pollTimers.clear()
    }
  }, [])

  return { startPolling }
}

// ── 面板组件 ──────────────────────────────────────────────────────────────────

export default function AgnesPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('image')
  const [cfg, setCfg] = useState<AgnesConfig | null>(null)
  const [cfgLoading, setCfgLoading] = useState(true)
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const refreshConfig = useCallback(async () => {
    setCfgLoading(true)
    try {
      setCfg(await loadConfig())
    } catch (e) {
      setCfgMsg({ ok: false, text: `读取配置失败: ${e}` })
    } finally {
      setCfgLoading(false)
    }
  }, [])

  useEffect(() => { refreshConfig() }, [refreshConfig])

  // ── 生图 state ──
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [imageMode, setImageMode] = useState<ImageMode>('text')
  const [inputImages, setInputImages] = useState<string[]>([])
  const [responseFormat, setResponseFormat] = useState<'url' | 'b64_json'>('url')
  const [imageHistory, setImageHistory] = useState<ImageHistoryItem[]>([])
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState('')

  // ── 生视频 state ──
  const [videoPrompt, setVideoPrompt] = useState('')
  const [presetIdx, setPresetIdx] = useState(1)
  const [videoMode, setVideoMode] = useState<VideoMode>('text')
  const [videoImage, setVideoImage] = useState<string | null>(null)
  const [videoImages, setVideoImages] = useState<string[]>([])
  const [negativePrompt, setNegativePrompt] = useState('')
  const [seed, setSeed] = useState('')
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([])
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState('')

  const applyVideoUpdate = useCallback((videoId: string, task: AgnesVideoTask) => {
    setVideoHistory((prev) => prev.map((item) =>
      item.videoId === videoId
        ? {
            ...item,
            status: task.status,
            progress: task.progress,
            url: task.url || item.url,
            seconds: task.seconds ?? item.seconds,
            size: task.size ?? item.size,
            error: task.error ?? item.error,
          }
        : item,
    ))
  }, [])
  const { startPolling } = useVideoPoller(applyVideoUpdate)

  const noKey = !!cfg && !cfg.apiKey

  // ── 生图 ──
  const handleUploadImages = useCallback(async (files: FileList | null) => {
    if (!files) return
    const datas = await Promise.all(Array.from(files).slice(0, 4).map(fileToDataUrl))
    setInputImages((prev) => [...prev, ...datas].slice(0, 4))
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!cfg || noKey || !imagePrompt.trim() || imageLoading) return
    setImageLoading(true)
    setImageError('')
    try {
      const result = await generateImage(cfg, {
        prompt: imagePrompt.trim(),
        size: imageSize,
        images: imageMode === 'image' ? inputImages : undefined,
        responseFormat,
      })
      const src = result.url ?? (result.base64 ? toDataUrl(result.base64, result.mimeType) : '')
      if (!src) throw new Error('响应缺少 url 或 base64')
      setImageHistory((prev) => [{
        prompt: imagePrompt.trim(),
        size: imageSize,
        src,
        model: result.model,
        createdAt: Date.now(),
      }, ...prev].slice(0, MAX_IMAGE_HISTORY))
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e))
    } finally {
      setImageLoading(false)
    }
  }, [cfg, noKey, imagePrompt, imageLoading, imageSize, imageMode, inputImages, responseFormat])

  // ── 生视频 ──
  const handleUploadVideoImages = useCallback(async (files: FileList | null) => {
    if (!files) return
    const datas = await Promise.all(Array.from(files).slice(0, 4).map(fileToDataUrl))
    setVideoImages((prev) => [...prev, ...datas].slice(0, 4))
  }, [])

  const handleVideoImage = useCallback(async (files: FileList | null) => {
    if (!files || !files[0]) return
    setVideoImage(await fileToDataUrl(files[0]))
  }, [])

  const handleCreateVideo = useCallback(async () => {
    if (!cfg || noKey || !videoPrompt.trim() || videoLoading) return
    setVideoLoading(true)
    setVideoError('')
    try {
      const preset = FRAME_PRESETS[presetIdx] ?? FRAME_PRESETS[1]
      const task = await createVideo(cfg, {
        prompt: videoPrompt.trim(),
        numFrames: preset.frames,
        frameRate: preset.rate,
        image: videoMode === 'image' && videoImage ? videoImage : undefined,
        images: videoMode === 'multi' || videoMode === 'keyframes' ? videoImages : undefined,
        mode: videoMode === 'image' ? 'ti2vid' : videoMode === 'keyframes' ? 'keyframes' : undefined,
        negativePrompt: negativePrompt.trim() || undefined,
        seed: seed.trim() ? Number(seed) : undefined,
      })
      if (task.framesNormalized) {
        setVideoError('帧数已自动纠正为合法值 8n+1。')
      }
      setVideoHistory((prev) => [{
        prompt: videoPrompt.trim(),
        videoId: task.videoId,
        status: task.status,
        progress: task.progress,
        url: null,
        seconds: task.seconds,
        size: null,
        error: null,
        createdAt: Date.now(),
      }, ...prev].slice(0, MAX_VIDEO_HISTORY))
      startPolling(task.videoId)
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e))
    } finally {
      setVideoLoading(false)
    }
  }, [cfg, noKey, videoPrompt, videoLoading, presetIdx, videoMode, videoImage, videoImages, negativePrompt, seed, startPolling])

  const handleQueryVideo = useCallback(async (videoId: string) => {
    if (!cfg) return
    try {
      const task = await queryVideo(cfg, videoId)
      applyVideoUpdate(videoId, task)
    } catch (e) {
      console.error('[Agnes] query failed', e)
    }
  }, [cfg, applyVideoUpdate])

  // ── 设置 ──
  const handleSaveConfig = useCallback(async () => {
    if (!cfg) return
    setCfgMsg(null)
    try {
      await saveConfig({
        apiKey: cfg.apiKey,
        apiBase: cfg.apiBase,
        imageModel: cfg.imageModel,
        videoModel: cfg.videoModel,
        defaultSize: cfg.defaultSize,
      })
      setCfgMsg({ ok: true, text: '配置已保存' })
      await refreshConfig()
    } catch (e) {
      setCfgMsg({ ok: false, text: `保存失败: ${e}` })
    }
  }, [cfg, refreshConfig])

  if (cfgLoading && !cfg) {
    return <div style={styles.container}><div style={{ fontSize: 12, color: '#8E8E93' }}>加载配置中…（插件 {pluginId}）</div></div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#F8F8F8' }}>Agnes 多模态</span>
        {noKey && <span style={{ fontSize: 11, color: '#FBBF24' }}>未配置 API Key</span>}
      </div>

      <div style={styles.tabs}>
        {(['image', 'video', 'settings'] as Tab[]).map((t) => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {{ image: '生图', video: '生视频', settings: '设置' }[t]}
          </button>
        ))}
      </div>

      {/* ── 生图 ── */}
      {tab === 'image' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="模式">
            <div style={styles.row}>
              {(['text', 'image'] as ImageMode[]).map((m) => (
                <button key={m} style={styles.chip(imageMode === m)} onClick={() => setImageMode(m)}>
                  {m === 'text' ? '文生图' : '图生图'}
                </button>
              ))}
            </div>
          </Field>

          {imageMode === 'image' && (
            <Field label="输入图（最多 4 张，data URL）">
              <input
                style={styles.input}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleUploadImages(e.target.files)}
              />
              {inputImages.length > 0 && (
                <div style={styles.row}>
                  {inputImages.map((src, i) => (
                    <img key={i} src={src} style={styles.thumb} alt="input"
                      onClick={() => setInputImages((prev) => prev.filter((_, idx) => idx !== i))} />
                  ))}
                </div>
              )}
            </Field>
          )}

          <Field label="提示词">
            <textarea style={styles.textarea} value={imagePrompt} placeholder="描述要生成的图片内容…"
              onChange={(e) => setImagePrompt(e.target.value)} />
          </Field>

          <Field label="尺寸">
            <select style={styles.select} value={imageSize} onChange={(e) => setImageSize(e.target.value)}>
              {IMAGE_SIZE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="返回格式">
            <select style={styles.select} value={responseFormat} onChange={(e) => setResponseFormat(e.target.value as 'url' | 'b64_json')}>
              <option value="url">URL（推荐）</option>
              <option value="b64_json">Base64</option>
            </select>
          </Field>

          <button style={styles.btn(true)} onClick={handleGenerate} disabled={imageLoading || !!noKey}>
            {imageLoading ? '生成中…' : '生成图片'}
          </button>
          {imageError && <div style={styles.statusErr}>{imageError}</div>}

          {imageHistory.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#8E8E93' }}>历史（{imageHistory.length}）</div>
              {imageHistory.map((item, i) => (
                <div key={i} style={styles.card}>
                  <div style={styles.row}>
                    <img src={item.src} style={{ width: 48, height: 48, borderRadius: 4, objectFit: 'cover' }} alt="result" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: '#B4B4B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.prompt}</div>
                      <div style={{ fontSize: 10, color: '#8E8E93' }}>{[item.model, item.size].filter(Boolean).join(' · ')}</div>
                    </div>
                    <a href={item.src} download={`agnes-${i}.png`} style={styles.btn()}>下载</a>
                    {onSendToChat && (
                      <button style={styles.btn()} onClick={() => onSendToChat(item.src)}>发送</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 生视频 ── */}
      {tab === 'video' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="模式">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['text', 'image', 'multi', 'keyframes'] as VideoMode[]).map((m) => (
                <button key={m} style={styles.chip(videoMode === m)} onClick={() => setVideoMode(m)}>
                  {{ text: '文生视频', image: '图生视频', multi: '多图', keyframes: '关键帧' }[m]}
                </button>
              ))}
            </div>
          </Field>

          {videoMode === 'image' && (
            <Field label="输入图（单张）">
              <input style={styles.input} type="file" accept="image/*" onChange={(e) => handleVideoImage(e.target.files)} />
              {videoImage && <img src={videoImage} style={styles.thumb} alt="input" onClick={() => setVideoImage(null)} />}
            </Field>
          )}

          {(videoMode === 'multi' || videoMode === 'keyframes') && (
            <Field label="输入图（2-4 张）">
              <input style={styles.input} type="file" accept="image/*" multiple onChange={(e) => handleUploadVideoImages(e.target.files)} />
              {videoImages.length > 0 && (
                <div style={styles.row}>
                  {videoImages.map((src, i) => (
                    <img key={i} src={src} style={styles.thumb} alt="input"
                      onClick={() => setVideoImages((prev) => prev.filter((_, idx) => idx !== i))} />
                  ))}
                </div>
              )}
            </Field>
          )}

          <Field label="提示词">
            <textarea style={styles.textarea} value={videoPrompt} placeholder="描述视频内容、镜头运动、光线…"
              onChange={(e) => setVideoPrompt(e.target.value)} />
          </Field>

          <Field label="时长">
            <select style={styles.select} value={presetIdx}
              onChange={(e) => setPresetIdx(Number(e.target.value))}>
              {FRAME_PRESETS.map((p, idx) => (
                <option key={p.frames} value={idx}>{p.label}（{p.frames} 帧）</option>
              ))}
            </select>
          </Field>

          <details>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#8E8E93' }}>高级</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              <Field label="反向提示词">
                <textarea style={styles.textarea} value={negativePrompt} placeholder="避免的内容…"
                  onChange={(e) => setNegativePrompt(e.target.value)} />
              </Field>
              <Field label="随机种子（可选）">
                <input style={styles.input} value={seed} placeholder="留空随机"
                  onChange={(e) => setSeed(e.target.value)} />
              </Field>
            </div>
          </details>

          <button style={styles.btn(true)} onClick={handleCreateVideo} disabled={videoLoading || !!noKey}>
            {videoLoading ? '创建中…' : '创建视频'}
          </button>
          {videoError && <div style={styles.statusErr}>{videoError}</div>}

          {videoHistory.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: '#8E8E93' }}>任务（{videoHistory.length}）</div>
              {videoHistory.map((item) => (
                <div key={item.videoId} style={styles.card}>
                  <div style={styles.row}>
                    <span style={{ fontSize: 12, color: '#F8F8F8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.status === 'completed' ? '✅ 已完成' : item.status === 'failed' ? '❌ 失败' : `⏳ ${item.status}（${item.progress}%）`}
                    </span>
                    {item.url && (
                      <>
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: '#60A5FA' }}>打开</a>
                        <a href={item.url} download={`agnes-${item.videoId.slice(0, 12)}.mp4`} style={styles.btn()}>下载</a>
                        {onSendToChat && (
                          <button style={styles.btn()} onClick={() => onSendToChat(item.url!)}>发送</button>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#8E8E93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.prompt || item.videoId}
                  </div>
                  {(item.status === 'queued' || item.status === 'in_progress') && (
                    <div style={styles.row}>
                      <button style={styles.btn()} onClick={() => handleQueryVideo(item.videoId)}>刷新</button>
                    </div>
                  )}
                  {item.error && <div style={styles.statusErr}>{item.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 设置 ── */}
      {tab === 'settings' && cfg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="API Key">
            <input style={styles.input} type="password" value={cfg.apiKey} placeholder="sk-…"
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} />
          </Field>
          <Field label="API Base URL">
            <input style={styles.input} value={cfg.apiBase}
              onChange={(e) => setCfg({ ...cfg, apiBase: e.target.value })} />
          </Field>
          <Field label="图片模型">
            <input style={styles.input} value={cfg.imageModel}
              onChange={(e) => setCfg({ ...cfg, imageModel: e.target.value })} />
          </Field>
          <Field label="视频模型">
            <input style={styles.input} value={cfg.videoModel}
              onChange={(e) => setCfg({ ...cfg, videoModel: e.target.value })} />
          </Field>
          <Field label="默认图片尺寸">
            <select style={styles.select} value={cfg.defaultSize}
              onChange={(e) => setCfg({ ...cfg, defaultSize: e.target.value })}>
              {IMAGE_SIZE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <div style={styles.row}>
            <button style={styles.btn(true)} onClick={handleSaveConfig}>保存配置</button>
          </div>
          {cfgMsg && <div style={cfgMsg.ok ? styles.statusOk : styles.statusErr}>{cfgMsg.text}</div>}
          <div style={{ fontSize: 10, color: '#71717A', lineHeight: 1.5 }}>
            配置保存在 Polaris config.json 的 plugins["agnes"]；MCP server 与面板共用。
            （旧版内置插件的 &lt;appConfigDir&gt;/agnes/config.json 会在首次读取时自动兼容。）
          </div>
        </div>
      )}
    </div>
  )
}