/**
 * image-recognition 面板 — 配置 + 测试
 *
 * 双 tab：
 * 1. 配置：API Key / 模型 / 端点，带「测试连接」按钮（发最小 chat 请求验证）
 * 2. 识别：拖拽或选择本地图片，调用智谱 GLM-4V 识别，展示结果
 *
 * 配置持久化：走 Polaris plugin_set_config → 存 config.json 的 plugins["image-recognition"]
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入（--external:react）。
 */

import { useEffect, useState, useCallback, useRef } from 'react'

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface AiConfig {
  apiKey: string
  model: string
  baseUrl: string
}

interface TestResult {
  status: 'idle' | 'testing' | 'ok' | 'err'
  message: string
  latency?: number
}

interface RecognizeResult {
  status: 'idle' | 'running' | 'ok' | 'err'
  text: string
  latency?: number
}

// ── 通信层 ────────────────────────────────────────────────────────────────────

const PLUGIN_ID = 'image-recognition'

/** Tauri invoke（桌面） */
async function tauriInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: (c: string, a?: Record<string, unknown>) => Promise<T> }
  }).__TAURI_INTERNALS__
  if (internals?.invoke) return internals.invoke(cmd, args)
  throw new Error('需在 Polaris 桌面环境运行')
}

/**
 * 宿主 invoke（桌面 Tauri IPC + Web/移动端 HTTP 的统一入口）。
 *
 * 由 main.tsx 注入（window.__POLARIS_HOST_INVOKE__ = invoke）。
 * 关键：走 transport 层，httpTransport 会自动按 getServerUrl() 解析目标
 * 并注入 Authorization: Bearer ${tokenMd5}。
 * 用裸 fetch + 硬编码 URL 在 app 模式（手机浏览器远程访问，无 Tauri internals）
 * 下必然 401 Unauthorized。
 */
async function hostInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  const invoker = (window as unknown as {
    __POLARIS_HOST_INVOKE__?: (c: string, a?: Record<string, unknown>) => Promise<T>
  }).__POLARIS_HOST_INVOKE__
  if (invoker) return invoker(cmd, args)
  throw new Error('宿主 invoke 不可用（需在 Polaris 内运行）')
}

/** 读取插件配置（宿主 invoke 优先，回退 Tauri） */
async function loadConfigApi(): Promise<AiConfig> {
  let cfg: Record<string, unknown>
  try {
    cfg = await hostInvoke('plugin_get_config', { pluginId: PLUGIN_ID })
  } catch (_) {
    cfg = await tauriInvoke('plugin_get_config', { pluginId: PLUGIN_ID })
  }
  return {
    apiKey: (cfg.apiKey as string) || '',
    model: (cfg.model as string) || 'glm-4v-flash',
    baseUrl: (cfg.baseUrl as string) || 'https://open.bigmodel.cn/api/paas/v4',
  }
}

/** 写入插件配置（字段级 patch） */
async function saveConfigApi(patch: Partial<AiConfig>): Promise<void> {
  try {
    await hostInvoke('plugin_set_config', { pluginId: PLUGIN_ID, patch })
  } catch (_) {
    await tauriInvoke('plugin_set_config', { pluginId: PLUGIN_ID, patch })
  }
}

// ── 智谱 API（面板直连，用于测试连接与试识别） ──────────────────────────────

/** 将 File 转 base64 data URL */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 调用智谱 GLM-4V chat/completions。
 * content 必须是数组，同时放 text 和 image_url。
 */
async function callVision(cfg: AiConfig, imageUrl: string, prompt: string, maxTokens = 1000): Promise<string> {
  if (!cfg.apiKey) throw new Error('未配置 API Key')
  const baseUrl = (cfg.baseUrl || 'https://open.bigmodel.cn/api/paas/v4').trim().replace(/\/+$/, '')
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model || 'glm-4v-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
      temperature: 0.2,
      stream: false,
      max_tokens: maxTokens,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text.slice(0, 300)
    try { const e = JSON.parse(text); detail = e.error?.message || e.msg || detail } catch (_) { /* keep raw */ }
    throw new Error(`HTTP ${res.status}: ${detail}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  return extractAnswer(content)
}

/** 过滤 workingUF，取 <answer> 段 */
function extractAnswer(content: string): string {
  if (typeof content !== 'string') return JSON.stringify(content)
  const m = content.match(/<answer>([\s\S]*?)<\/answer>/i)
  if (m) return m[1].trim()
  return content.replace(/workingUF[\s\S]*?(?=<answer|$)/gi, '').trim() || content
}

// ── 主面板 ────────────────────────────────────────────────────────────────────

export default function ImageRecognitionPanel({ pluginId: _pluginId }: { pluginId?: string }) {
  const [tab, setTab] = useState<'recognize' | 'config'>('config')
  const [config, setConfig] = useState<AiConfig>({ apiKey: '', model: 'glm-4v-flash', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' })
  const [loaded, setLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    loadConfigApi().then((cfg) => { setConfig(cfg); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const updateField = useCallback((field: keyof AiConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaveStatus('saving')
    try {
      await saveConfigApi({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (e) {
      setSaveStatus('idle')
      alert(`保存失败：${e instanceof Error ? e.message : e}`)
    }
  }, [config])

  if (!loaded) {
    return (
      <div style={{ ...containerStyle, justifyContent: 'center', alignItems: 'center', color: '#8b949e' }}>
        加载配置中...
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>图片识别</h2>
          <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '3px' }}>
            智谱 GLM-4V · 视觉模型
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setTab('config')}
            style={{ ...tabBtnStyle, ...(tab === 'config' ? tabActiveStyle : {}) }}
          >配置</button>
          <button
            onClick={() => setTab('recognize')}
            style={{ ...tabBtnStyle, ...(tab === 'recognize' ? tabActiveStyle : {}) }}
          >识别</button>
        </div>
      </div>

      {/* Tab 内容 */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {tab === 'config'
          ? <ConfigTab config={config} updateField={updateField} onSave={handleSave} saveStatus={saveStatus} />
          : <RecognizeTab config={config} />}
      </div>
    </div>
  )
}

// ── 配置 Tab ───────────────────────────────────────────────────────────────────

function ConfigTab({ config, updateField, onSave, saveStatus }: {
  config: AiConfig
  updateField: (field: keyof AiConfig, value: string) => void
  onSave: () => void
  saveStatus: 'idle' | 'saving' | 'saved'
}) {
  const [test, setTest] = useState<TestResult>({ status: 'idle', message: '' })

  /**
   * 测试连接：发一次 max_tokens=5 的最小 chat 请求。
   * 成功条件：HTTP 200 + 返回有 content。
   */
  const handleTest = useCallback(async () => {
    if (!config.apiKey) { setTest({ status: 'err', message: '请先填入 API Key' }); return }
    setTest({ status: 'testing', message: '正在测试连接...' })
    const t0 = Date.now()
    try {
      // 最小文本请求（不附图，省 token）验证鉴权
      const baseUrl = config.baseUrl.trim().replace(/\/+$/, '')
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'glm-4v-flash',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
          stream: false,
        }),
      })
      const latency = Date.now() - t0
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const content = data?.choices?.[0]?.message?.content
        if (content !== undefined) {
          setTest({ status: 'ok', message: `✓ 连接成功（${latency}ms）`, latency })
        } else {
          setTest({ status: 'err', message: `✗ 响应异常：未返回 content`, latency })
        }
      } else {
        const text = await res.text().catch(() => '')
        let detail = text.slice(0, 200)
        try { const e = JSON.parse(text); detail = e.error?.message || e.msg || detail } catch (_) { /* keep */ }
        setTest({ status: 'err', message: `✗ 连接失败：HTTP ${res.status} ${detail}`, latency })
      }
    } catch (e) {
      setTest({ status: 'err', message: `✗ 连接失败：${e instanceof Error ? e.message : e}` })
    }
  }, [config])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* API Key */}
      <div style={fieldStyle}>
        <label style={labelStyle}>API Key <span style={{ color: '#f85149' }}>*</span></label>
        <input
          type="password"
          style={inputStyle}
          value={config.apiKey}
          onChange={e => updateField('apiKey', e.target.value)}
          placeholder="智谱开放平台 API Key"
        />
        <div style={hintStyle}>在 https://open.bigmodel.cn 控制台获取</div>
      </div>

      {/* 模型 */}
      <div style={fieldStyle}>
        <label style={labelStyle}>模型</label>
        <select
          style={inputStyle}
          value={config.model}
          onChange={e => updateField('model', e.target.value)}
        >
          <option value="glm-4v-flash">GLM-4V-Flash（快速，~5s）</option>
          <option value="glm-4.1v-thinking-flash">GLM-4.1V-Thinking-Flash（带推理）</option>
        </select>
      </div>

      {/* 端点 */}
      <div style={fieldStyle}>
        <label style={labelStyle}>API 端点</label>
        <input
          style={inputStyle}
          value={config.baseUrl}
          onChange={e => updateField('baseUrl', e.target.value)}
          placeholder="https://open.bigmodel.cn/api/paas/v4"
        />
      </div>

      {/* 测试 + 保存按钮 */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={handleTest}
          disabled={test.status === 'testing' || !config.apiKey}
          style={{
            ...btnStyle,
            background: '#1f6feb',
            color: '#fff',
            opacity: (test.status === 'testing' || !config.apiKey) ? 0.5 : 1,
          }}
        >
          {test.status === 'testing' ? '测试中...' : '测试连接'}
        </button>
        <button
          onClick={onSave}
          disabled={saveStatus === 'saving'}
          style={{ ...btnStyle, background: '#238636', color: '#fff' }}
        >
          {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '✓ 已保存' : '保存配置'}
        </button>
      </div>

      {/* 测试结果 */}
      {test.status !== 'idle' && (
        <div style={{
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          background: test.status === 'ok' ? '#0d2818' : test.status === 'err' ? '#3d1f1f' : '#1c1c1c',
          border: `1px solid ${test.status === 'ok' ? '#3fb950' : test.status === 'err' ? '#f85149' : '#373e47'}`,
          color: test.status === 'ok' ? '#3fb950' : test.status === 'err' ? '#f85149' : '#8b949e',
          wordBreak: 'break-all',
        }}>
          {test.message}
        </div>
      )}

      {/* 说明 */}
      <div style={{
        padding: '10px 12px',
        background: '#161b22',
        border: '1px solid #373e47',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#8b949e',
        lineHeight: 1.6,
      }}>
        <div style={{ fontWeight: 600, color: '#c9d1d9', marginBottom: '6px' }}>使用说明</div>
        <div>· MCP 工具 <code style={codeStyle}>recognize_image</code> 支持 AI 直接调用</div>
        <div>· 本地图片自动转 base64 上传，单张约消耗 2700 tokens</div>
        <div>· URL 图片直接透传，不占本地带宽</div>
        <div>· Thinking 模型会过滤推理过程，仅返回 <code style={codeStyle}>&lt;answer&gt;</code> 结论</div>
      </div>
    </div>
  )
}

// ── 识别 Tab ───────────────────────────────────────────────────────────────────

function RecognizeTab({ config }: { config: AiConfig }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('请识别这张图片，简要描述主要内容。')
  const [result, setResult] = useState<RecognizeResult>({ status: 'idle', text: '' })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setResult({ status: 'err', text: '请选择图片文件' })
      return
    }
    try {
      const url = await fileToDataUrl(file)
      setPreview(url)
      setDataUrl(url)
      setResult({ status: 'idle', text: '' })
    } catch (e) {
      setResult({ status: 'err', text: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleRecognize = useCallback(async () => {
    if (!dataUrl) { setResult({ status: 'err', text: '请先选择图片' }); return }
    if (!config.apiKey) { setResult({ status: 'err', text: '请先在配置页填入 API Key' }); return }
    setResult({ status: 'running', text: '识别中...' })
    const t0 = Date.now()
    try {
      const text = await callVision(config, dataUrl, prompt)
      setResult({ status: 'ok', text, latency: Date.now() - t0 })
    } catch (e) {
      setResult({ status: 'err', text: e instanceof Error ? e.message : String(e), latency: Date.now() - t0 })
    }
  }, [config, dataUrl, prompt])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 图片选择区 */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#58a6ff' : '#373e47'}`,
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? '#161b22' : 'transparent',
          transition: 'all 0.2s',
          minHeight: preview ? 'auto' : '120px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {preview ? (
          <img src={preview} alt="预览" style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '6px', objectFit: 'contain' }} />
        ) : (
          <>
            <div style={{ fontSize: '32px' }}>🖼</div>
            <div style={{ fontSize: '13px', color: '#8b949e' }}>拖拽图片到此处，或点击选择</div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleSelect}
          style={{ display: 'none' }}
        />
      </div>

      {/* 识别指令 */}
      <div style={fieldStyle}>
        <label style={labelStyle}>识别指令</label>
        <textarea
          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'system-ui' }}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="请识别这张图片，简要描述主要内容。"
        />
      </div>

      {/* 识别按钮 */}
      <button
        onClick={handleRecognize}
        disabled={result.status === 'running' || !dataUrl || !config.apiKey}
        style={{
          ...btnStyle,
          background: '#238636',
          color: '#fff',
          opacity: (result.status === 'running' || !dataUrl || !config.apiKey) ? 0.5 : 1,
        }}
      >
        {result.status === 'running' ? '识别中...' : '开始识别'}
      </button>

      {/* 结果 */}
      {result.status !== 'idle' && (
        <div style={{
          padding: '12px',
          borderRadius: '6px',
          background: result.status === 'ok' ? '#0d2818' : result.status === 'err' ? '#3d1f1f' : '#1c1c1c',
          border: `1px solid ${result.status === 'ok' ? '#3fb950' : result.status === 'err' ? '#f85149' : '#373e47'}`,
          fontSize: '13px',
          color: result.status === 'ok' ? '#c9d1d9' : result.status === 'err' ? '#f85149' : '#8b949e',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.6,
        }}>
          {result.status === 'running' && <span>{result.text}</span>}
          {result.status === 'ok' && (
            <>
              {result.latency && <div style={{ fontSize: '11px', color: '#3fb950', marginBottom: '6px' }}>✓ 识别完成（{result.latency}ms）</div>}
              {result.text}
            </>
          )}
          {result.status === 'err' && result.text}
        </div>
      )}
    </div>
  )
}

// ── 样式 ──────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  padding: '16px', height: '100%', display: 'flex', flexDirection: 'column',
  fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#e1e4e8', background: '#0d1117',
}

const btnStyle: React.CSSProperties = {
  padding: '7px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontSize: '13px', fontWeight: 500, background: '#373e47', color: '#e1e4e8',
}

const tabBtnStyle: React.CSSProperties = {
  padding: '5px 12px', border: '1px solid #373e47', borderRadius: '6px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 500, background: '#2d333b', color: '#8b949e',
}

const tabActiveStyle: React.CSSProperties = {
  background: '#1f6feb', color: '#fff', borderColor: '#1f6feb',
}

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px' }

const labelStyle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 500, color: '#c9d1d9',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #373e47', borderRadius: '6px',
  fontSize: '13px', background: '#2d333b', color: '#e1e4e8', boxSizing: 'border-box', outline: 'none',
}

const hintStyle: React.CSSProperties = {
  fontSize: '11px', color: '#6e7681',
}

const codeStyle: React.CSSProperties = {
  padding: '1px 5px', background: '#2d333b', borderRadius: '3px',
  fontSize: '11px', fontFamily: 'monospace', color: '#58a6ff',
}
