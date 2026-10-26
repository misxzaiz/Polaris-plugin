/**
 * mimo-tts 面板 — 配置 + 语音合成 + 音色工坊 + 历史
 *
 * 双通道设计：
 * 1. 面板直连小米 MiMo API（fetch，浏览器环境）—— 合成/试听/克隆
 * 2. 音频落盘：面板先调 MCP 同款 API 拿到 base64 → 本地 HTTP 服务无写接口，
 *    因此面板合成走「直连 API + 浏览器播放」；历史列表走本地服务 /audio/
 *    （MCP 生成的音频会出现在历史中，可直接播放/下载）
 *
 * 配置持久化：hostInvoke('plugin_set_config') → config.json 的 plugins["mimo-tts"]
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入（--external:react）。
 */

import { useEffect, useState, useCallback } from 'react'

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface TtsConfig {
  apiKey: string
  baseUrl: string
  defaultVoice: string
  outputMode: string
}

interface AudioItem {
  name: string
  url: string
  size: number
}

type Tab = 'config' | 'synth' | 'workshop' | 'history'

const PLUGIN_ID = 'mimo-tts'
const LOCAL_AUDIO_BASE = 'http://127.0.0.1:9861'

const PRESET_VOICES = [
  { value: '冰糖', label: '冰糖（中文女声）' },
  { value: '茉莉', label: '茉莉（中文女声）' },
  { value: '苏打', label: '苏打（中文男声）' },
  { value: '白桦', label: '白桦（中文男声）' },
  { value: 'Mia', label: 'Mia（英文女声）' },
  { value: 'Chloe', label: 'Chloe（英文女声）' },
  { value: 'Milo', label: 'Milo（英文男声）' },
  { value: 'Dean', label: 'Dean（英文男声）' },
]

// ── 通信层 ────────────────────────────────────────────────────────────────────

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

async function loadConfig(): Promise<TtsConfig> {
  const cfg = await hostInvoke<Record<string, unknown>>('plugin_get_config', { pluginId: PLUGIN_ID })
  return {
    apiKey: (cfg.apiKey as string) || '',
    baseUrl: (cfg.baseUrl as string) || 'https://api.xiaomimimo.com/v1',
    defaultVoice: (cfg.defaultVoice as string) || '冰糖',
    outputMode: (cfg.outputMode as string) || 'file',
  }
}

async function saveConfig(patch: Partial<TtsConfig>): Promise<void> {
  await hostInvoke('plugin_set_config', { pluginId: PLUGIN_ID, patch })
}

// ── MiMo API 调用（面板：cap.http 宿主转发优先，fetch 回退） ────────────────

interface TtsApiResult {
  audioBase64: string
  transcript?: string
  usage?: unknown
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
}): Promise<{ status: number; ok: boolean; body: string }> {
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
    ok: !!result.ok,
    body: String(result.body ?? ''),
  }
}

/**
 * 调用 MiMo TTS。合成文本放 assistant，风格指令放 user。
 *
 * 优先经宿主 cap.http 转发（绕开 CORS）；宿主桥不可用时回退浏览器 fetch。
 * 说明：音频响应是嵌在 JSON 里的 base64 字符串字段（audio.data），
 * cap.http 转发返回的 body 就是含该字段的完整 JSON，直接解析即可。
 */
async function callTts(
  cfg: TtsConfig,
  model: string,
  messages: Array<{ role: string; content: string }>,
  audio: Record<string, unknown>,
): Promise<TtsApiResult> {
  if (!cfg.apiKey) throw new Error('未配置 API Key，请先在「配置」页填写')
  const baseUrl = (cfg.baseUrl || 'https://api.xiaomimimo.com/v1').trim().replace(/\/+$/, '')
  const url = `${baseUrl}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`,
  }
  const body = JSON.stringify({ model, messages, audio: { format: 'wav', ...audio }, stream: false })

  // 通道 1：宿主 cap.http 转发（无 CORS）
  let fallbackToFetch = false
  try {
    const r = await capHttpRequest({ method: 'POST', url, headers, body, bodyType: 'json' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = JSON.parse(r.body || '{}')
    const audioData = data.choices?.[0]?.message?.audio
    if (!audioData?.data) throw new Error('响应缺少 audio.data')
    return {
      audioBase64: audioData.data,
      transcript: audioData.transcript || '',
      usage: data.usage,
    }
  } catch (e) {
    const msg = String(e?.message || '')
    // 仅宿主 invoke 拒绝 / 转发失败 / 网络错误才回退 fetch；HTTP 业务错误直接抛
    fallbackToFetch = !/^HTTP \d+/.test(msg)
    if (!fallbackToFetch) throw e
  }
  const res = await fetch(url, { method: 'POST', headers, body })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const err = await res.json()
      if (err.error) msg += `: ${typeof err.error === 'string' ? err.error : (err.error.message || JSON.stringify(err.error))}`
    } catch (_) { /* ignore */ }
    throw new Error(`MiMo API 调用失败: ${msg}`)
  }
  const data = await res.json()
  const audioData = data.choices?.[0]?.message?.audio
  if (!audioData?.data) throw new Error('响应缺少 audio.data')
  return {
    audioBase64: audioData.data,
    transcript: audioData.transcript || '',
    usage: data.usage,
  }
}

// ── 样式工具 ──────────────────────────────────────────────────────────────────

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
  badge: { fontSize: 11, color: '#FBBF24', border: '1px solid #FBBF24', borderRadius: 4, padding: '2px 8px', display: 'inline-block' },
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <div style={styles.label}>{label}</div>
      {children}
    </div>
  )
}

function Player({ url, label }: { url: string; label?: string }) {
  return (
    <div style={styles.row}>
      <audio controls src={url} style={{ height: 32, flex: 1, minWidth: 0 }} />
      {label && <span style={{ fontSize: 11, color: '#8E8E93' }}>{label}</span>}
    </div>
  )
}

// ── 面板组件 ─────────────────────────────────��────────────────────────────────

export default function MimoTtsPanel({ pluginId }: { pluginId: string; onSendToChat?: (msg: string) => void }) {
  const [tab, setTab] = useState<Tab>('config')
  const [cfg, setCfg] = useState<TtsConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // 合成 tab
  const [synthText, setSynthText] = useState('')
  const [synthVoice, setSynthVoice] = useState('冰糖')
  const [synthStyle, setSynthStyle] = useState('')
  const [synthBusy, setSynthBusy] = useState(false)
  const [synthUrl, setSynthUrl] = useState('')
  const [synthErr, setSynthErr] = useState('')

  // 工坊 tab
  const [designDesc, setDesignDesc] = useState('')
  const [designText, setDesignText] = useState('')
  const [designBusy, setDesignBusy] = useState(false)
  const [designUrl, setDesignUrl] = useState('')
  const [designErr, setDesignErr] = useState('')
  const [cloneSampleName, setCloneSampleName] = useState('')
  const [cloneSampleB64, setCloneSampleB64] = useState('')
  const [cloneText, setCloneText] = useState('')
  const [cloneBusy, setCloneBusy] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneErr, setCloneErr] = useState('')

  // 历史 tab
  const [history, setHistory] = useState<AudioItem[]>([])
  const [historyMsg, setHistoryMsg] = useState('')

  useEffect(() => {
    loadConfig().then((c) => {
      setCfg(c)
      setSynthVoice(c.defaultVoice || '冰糖')
    }).catch((e) => setCfgMsg({ ok: false, text: `读取配置失败: ${e}` }))
  }, [])

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch(`${LOCAL_AUDIO_BASE}/audio/`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const items = await res.json()
      setHistory(items)
      setHistoryMsg('')
    } catch (e) {
      setHistoryMsg(`无法连接本地音频服务（${e}）。请确认插件服务「mimo-tts-audio」已启动。`)
    }
  }, [])

  useEffect(() => {
    if (tab === 'history') refreshHistory()
  }, [tab, refreshHistory])

  async function handleSaveCfg() {
    if (!cfg) return
    setSaving(true)
    try {
      await saveConfig({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        defaultVoice: cfg.defaultVoice,
        outputMode: cfg.outputMode,
      })
      setCfgMsg({ ok: true, text: '配置已保存' })
    } catch (e) {
      setCfgMsg({ ok: false, text: `保存失败: ${e}` })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!cfg) return
    setCfgMsg(null)
    setSaving(true)
    try {
      const r = await callTts(cfg, 'mimo-v2.5-tts', [
        { role: 'user', content: '平静自然的语气' },
        { role: 'assistant', content: '语音连接测试成功。' },
      ], { voice: cfg.defaultVoice || '冰糖' })
      setCfgMsg({ ok: true, text: `连接成功，生成音频 ${Math.round((r.audioBase64.length * 3 / 4) / 1024)} KB（限时免费）` })
    } catch (e) {
      setCfgMsg({ ok: false, text: `${e}` })
    } finally {
      setSaving(false)
    }
  }

  async function handleSynth() {
    if (!cfg) return
    if (!synthText.trim()) { setSynthErr('请输入待合成文本'); return }
    setSynthBusy(true); setSynthErr(''); setSynthUrl('')
    try {
      const messages: Array<{ role: string; content: string }> = []
      if (synthStyle.trim()) messages.push({ role: 'user', content: synthStyle.trim() })
      messages.push({ role: 'assistant', content: synthText.trim() })
      const r = await callTts(cfg, 'mimo-v2.5-tts', messages, { voice: synthVoice })
      setSynthUrl(`data:audio/wav;base64,${r.audioBase64}`)
    } catch (e) {
      setSynthErr(`${e}`)
    } finally {
      setSynthBusy(false)
    }
  }

  async function handleDesign() {
    if (!cfg) return
    if (!designDesc.trim() || !designText.trim()) { setDesignErr('音色描述与合成文本都不能为空'); return }
    setDesignBusy(true); setDesignErr(''); setDesignUrl('')
    try {
      const r = await callTts(cfg, 'mimo-v2.5-tts-voicedesign', [
        { role: 'user', content: designDesc.trim() },
        { role: 'assistant', content: designText.trim() },
      ], { optimize_text_preview: true })
      setDesignUrl(`data:audio/wav;base64,${r.audioBase64}`)
    } catch (e) {
      setDesignErr(`${e}`)
    } finally {
      setDesignBusy(false)
    }
  }

  function handleCloneFile(file: File) {
    if (!file) return
    if (!/\.(mp3|wav)$/i.test(file.name)) { setCloneErr('仅支持 mp3 / wav 格式'); return }
    if (file.size > 10 * 1024 * 1024) { setCloneErr('样本不能超过 10MB（base64 上限）'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setCloneSampleB64(dataUrl)
      setCloneSampleName(file.name)
      setCloneErr('')
    }
    reader.onerror = () => setCloneErr('读取文件失败')
    reader.readAsDataURL(file)
  }

  async function handleClone() {
    if (!cfg) return
    if (!cloneSampleB64) { setCloneErr('请先选择音频样本'); return }
    if (!cloneText.trim()) { setCloneErr('请输入合成文本'); return }
    setCloneBusy(true); setCloneErr(''); setCloneUrl('')
    try {
      const r = await callTts(cfg, 'mimo-v2.5-tts-voiceclone', [
        { role: 'user', content: '' },
        { role: 'assistant', content: cloneText.trim() },
      ], { voice: cloneSampleB64 })
      setCloneUrl(`data:audio/wav;base64,${r.audioBase64}`)
    } catch (e) {
      setCloneErr(`${e}`)
    } finally {
      setCloneBusy(false)
    }
  }

  if (!cfg) {
    return <div style={styles.container}><div style={{ fontSize: 12, color: '#8E8E93' }}>加载配置中…（插件 {pluginId}）</div></div>
  }

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#F8F8F8' }}>MiMo 语音合成</span>
        <span style={styles.badge}>🎁 限时免费</span>
      </div>

      <div style={styles.tabs}>
        {(['config', 'synth', 'workshop', 'history'] as Tab[]).map((t) => (
          <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
            {{ config: '配置', synth: '合成', workshop: '音色工坊', history: '历史' }[t]}
          </button>
        ))}
      </div>

      {/* ── 配置 ── */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="API Key（https://mimo.mi.com 获取）">
            <input style={styles.input} type="password" value={cfg.apiKey} placeholder="sk-…"
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} />
          </Field>
          <Field label="API 端点">
            <input style={styles.input} value={cfg.baseUrl} placeholder="https://api.xiaomimimo.com/v1"
              onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} />
          </Field>
          <Field label="默认音色">
            <select style={styles.select} value={cfg.defaultVoice} onChange={(e) => setCfg({ ...cfg, defaultVoice: e.target.value })}>
              {PRESET_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="音频输出方式">
            <select style={styles.select} value={cfg.outputMode} onChange={(e) => setCfg({ ...cfg, outputMode: e.target.value })}>
              <option value="file">保存文件并返回路径（推荐，聊天卡片可播放）</option>
              <option value="base64">返回 base64 内联</option>
            </select>
          </Field>
          <div style={styles.row}>
            <button style={styles.btn(true)} onClick={handleSaveCfg} disabled={saving}>{saving ? '保存中…' : '保存配置'}</button>
            <button style={styles.btn()} onClick={handleTest} disabled={saving}>测试连接</button>
          </div>
          {cfgMsg && <div style={cfgMsg.ok ? styles.statusOk : styles.statusErr}>{cfgMsg.text}</div>}
        </div>
      )}

      {/* ── 合成 ── */}
      {tab === 'synth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="音色">
            <select style={styles.select} value={synthVoice} onChange={(e) => setSynthVoice(e.target.value)}>
              {PRESET_VOICES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="风格指令（可选，如「开心雀跃」「低沉威严」；也可在文本中用 (慵懒)[紧张] 标签）">
            <input style={styles.input} value={synthStyle} placeholder="温柔舒缓的语气，像在哄人睡觉"
              onChange={(e) => setSynthStyle(e.target.value)} />
          </Field>
          <Field label="待合成文本">
            <textarea style={styles.textarea} value={synthText} placeholder="输入要合成语音的文本…"
              onChange={(e) => setSynthText(e.target.value)} />
          </Field>
          <div style={styles.row}>
            <button style={styles.btn(true)} onClick={handleSynth} disabled={synthBusy}>
              {synthBusy ? '合成中…（约5-10秒）' : '合成语音'}
            </button>
          </div>
          {synthErr && <div style={styles.statusErr}>{synthErr}</div>}
          {synthUrl && <Player url={synthUrl} label="试听" />}
        </div>
      )}

      {/* ── 音色工坊 ── */}
      {tab === 'workshop' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={styles.card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F8F8F8' }}>① 文本设计音色（voicedesign）</div>
            <Field label="音色描述（1-4句：性别年龄/质感/情绪/语速）">
              <textarea style={styles.textarea} value={designDesc} placeholder="一位五十多岁的中年男性，嗓音略带沙哑沧桑，语速缓慢沉稳"
                onChange={(e) => setDesignDesc(e.target.value)} />
            </Field>
            <Field label="合成文本">
              <textarea style={styles.textarea} value={designText} placeholder="老话说得好，日子要慢慢过…"
                onChange={(e) => setDesignText(e.target.value)} />
            </Field>
            <div style={styles.row}>
              <button style={styles.btn(true)} onClick={handleDesign} disabled={designBusy}>
                {designBusy ? '生成中…' : '生成音色并合成'}
              </button>
            </div>
            {designErr && <div style={styles.statusErr}>{designErr}</div>}
            {designUrl && <Player url={designUrl} label="试听" />}
          </div>

          <div style={styles.card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F8F8F8' }}>② 音色克隆（voiceclone）</div>
            <Field label="音频样本（mp3/wav，≤10MB）">
              <input
                style={styles.input}
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCloneFile(f) }}
              />
              {cloneSampleName && <div style={{ fontSize: 11, color: '#4ADE80' }}>已选择: {cloneSampleName}</div>}
            </Field>
            <Field label="合成文本">
              <textarea style={styles.textarea} value={cloneText} placeholder="用克隆音色说出的话…"
                onChange={(e) => setCloneText(e.target.value)} />
            </Field>
            <div style={styles.row}>
              <button style={styles.btn(true)} onClick={handleClone} disabled={cloneBusy || !cloneSampleB64}>
                {cloneBusy ? '克隆中…（约10-20秒）' : '克隆音色并合成'}
              </button>
            </div>
            {cloneErr && <div style={styles.statusErr}>{cloneErr}</div>}
            {cloneUrl && <Player url={cloneUrl} label="试听" />}
          </div>
        </div>
      )}

      {/* ── 历史 ── */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={styles.row}>
            <button style={styles.btn()} onClick={refreshHistory}>刷新</button>
            <span style={{ fontSize: 11, color: '#8E8E93' }}>来自 MCP 合成与本地生成的音频（audio/ 目录）</span>
          </div>
          {historyMsg && <div style={styles.statusErr}>{historyMsg}</div>}
          {history.length === 0 && !historyMsg && (
            <div style={{ fontSize: 12, color: '#8E8E93', padding: 8 }}>暂无音频。用 AI 调用 mimo_tts_synthesize 或在此面板合成后，会出现在这里。</div>
          )}
          {history.map((item) => (
            <div key={item.name} style={styles.card}>
              <div style={{ fontSize: 11, color: '#8E8E93' }}>{item.name}（{Math.round(item.size / 1024)} KB）</div>
              <Player url={item.url} />
              <div style={styles.row}>
                <button style={styles.btn()} onClick={() => window.open(item.url, '_blank')}>打开</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
