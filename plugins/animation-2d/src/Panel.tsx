/**
 * animation-2d 面板 — 2D 手绘动画渲染/预览/质检
 *
 * 通过 Polaris services 机制访问渲染 HTTP 服务（服务地址由宿主注入）。
 * 功能：
 *  1. 预览：输入时刻 → 渲染静帧 PNG → 面板内展示
 *  2. 联系方式图：多帧拼一张 JPG 快速检查
 *  3. 出片：渲染帧序列 + 编码 MP4
 *  4. 质检：GLM-4V 识图（直连智谱，复用 image-recognition 配置）
 *
 * 运行环境：宿主 webview，React 由 pluginModuleLoader shim 注入（--external:react）。
 */

import { useEffect, useState, useCallback } from 'react'

const PLUGIN_ID = 'animation-2d'

// ── 宿主通信 ───────────────────────────────────────────────────────────────────

/** 宿主注入：__POLARIS_HOST_INVOKE__ = invoke（router_dispatch → cap.pluginServiceManager） */
type HostInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<{ ok?: boolean; result?: { services?: Array<{ pluginId: string; serviceId: string; port?: number; state?: string }> } } | any>

/** 获取渲染 HTTP 服务地址（优先宿主服务状态，兜底 9862）。 */
async function getRenderBase(): Promise<string> {
  // 1) 宿主服务管理器：查 animation-2d-render 的真实端口
  const invoke = (window as unknown as { __POLARIS_HOST_INVOKE__?: HostInvoke }).__POLARIS_HOST_INVOKE__
  if (invoke) {
    try {
      const res = await invoke('router_dispatch', {
        req: { target: 'cap.pluginServiceManager', payload: { action: 'list_status' } },
      })
      const svc = (res?.result?.services || res?.services || []).find(
        (s: any) => s.pluginId === PLUGIN_ID && s.serviceId === 'animation-2d-render'
      )
      if (svc?.port) return `http://127.0.0.1:${svc.port}`
    } catch (_) { /* fallthrough */ }
  }
  // 2) 兜底：本地调试默认端口
  return 'http://127.0.0.1:9862'
}

/** 调用渲染服务 */
async function callRender(base: string, endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// ── 样式 ──────────────────────────────────────────────────────────────────────

const styles = {
  container: { padding: 14, display: 'flex' as const, flexDirection: 'column' as const, height: '100%', gap: 10, overflow: 'auto' as const },
  label: { fontSize: 11, color: '#8E8E93', marginBottom: 4 },
  input: { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, boxSizing: 'border-box' as const },
  btn: (primary = false) => ({
    padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' as const,
    background: primary ? '#3B82F6' : '#2D2D33', color: primary ? '#fff' : '#B4B4B8',
    border: primary ? 'none' : '1px solid #3F3F46',
  }),
  card: { padding: 10, borderRadius: 8, border: '1px solid #3F3F46', background: '#25252B', display: 'flex' as const, flexDirection: 'column' as const, gap: 8 },
  field: { display: 'flex' as const, flexDirection: 'column' as const, gap: 4 },
  row: { display: 'flex' as const, gap: 8, alignItems: 'center' },
  img: { maxWidth: '100%', borderRadius: 6, border: '1px solid #3F3F46' },
  statusOk: { fontSize: 12, color: '#4ADE80', padding: 4 },
  statusErr: { fontSize: 12, color: '#F87171', padding: 4 },
  statusInfo: { fontSize: 11, color: '#8E8E93', padding: 4, whiteSpace: 'pre-wrap' as const },
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <div style={styles.label}>{label}</div>
      {children}
    </div>
  )
}

// ── 面板 ──────────────────────────────────────────────────────────────────────

export default function Animation2dPanel({ pluginId: _pluginId }: { pluginId?: string }) {
  const [base, setBase] = useState('')
  const [svcMsg, setSvcMsg] = useState('')

  // 预览静帧
  const [times, setTimes] = useState('0,2.5,5')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 质检
  const [checkPrompt, setCheckPrompt] = useState('')
  const [checkResult, setCheckResult] = useState('')
  const [checking, setChecking] = useState(false)
  // 最近渲染的文件列表（质检/预览用）
  const [lastFiles, setLastFiles] = useState<string[]>([])

  useEffect(() => {
    getRenderBase().then((b) => {
      setBase(b)
      // 探测服务健康
      fetch(`${b}/__health`).then((r) => {
        if (r.ok) setSvcMsg(`渲染服务在线（${b}）`)
        else setSvcMsg('渲染服务地址不确定，请确认插件服务已启动')
      }).catch(() => setSvcMsg('渲染服务未就绪（Polaris 插件服务启动中？）'))
    }).catch(() => setSvcMsg('无法获取渲染服务地址'))
  }, [])

  const handleRenderStill = useCallback(async () => {
    if (!times.trim() || busy) return
    setBusy(true); setErr('')
    try {
      const r = await callRender(base, '/render/stills', { times: times.trim() })
      const files = Array.isArray(r.out) ? r.out : []
      const last = files[files.length - 1]
      setLastFiles(files)
      if (last) {
        // 通过渲染服务 /file 端点预览（跨域 OK，同一服务）
        setPreview(`${base}/file?path=${encodeURIComponent(last)}`)
        setSvcMsg(`渲染完成：${files.length} 帧（预览最后一帧）\n${files.join('\n')}`)
      } else {
        setPreview(null)
        setSvcMsg(`渲染完成：${r.log || r.out}`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [base, times, busy])

  const handleSheet = useCallback(async () => {
    if (!times.trim() || busy) return
    setBusy(true); setErr('')
    try {
      const r = await callRender(base, '/render/sheet', { times: times.trim() })
      setSvcMsg(`联系方式图已生成：${r.out}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [base, times, busy])

  const handleEncode = useCallback(async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await callRender(base, '/encode', {})
      setSvcMsg(`MP4 已生成：${r.out}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [base, busy])

  const handleCheck = useCallback(async () => {
    if (!lastFiles.length) { setCheckResult('请先渲染静帧'); return }
    setChecking(true); setCheckResult('质检中...')
    try {
      const prompt = checkPrompt.trim() || '请按 2D 手绘动画标准审查此帧：纯2D笔触/无文字/构图清晰/色彩柔和。逐条指出问题并给总评。'
      const r = await callRender(base, '/vision', { image: lastFiles[lastFiles.length - 1], prompt })
      setCheckResult(r.verdict)
    } catch (e) {
      setCheckResult(`质检失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setChecking(false)
    }
  }, [base, checkPrompt, lastFiles])

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#F8F8F8' }}>2D 手绘动画</span>
      </div>
      <div style={{ fontSize: 11, color: '#8E8E93' }}>p5.brush 水墨风 · 纯 2D 手绘逐帧</div>
      {svcMsg && <div style={styles.statusInfo}>{svcMsg}</div>}
      {err && <div style={styles.statusErr}>{err}</div>}

      <div style={styles.card}>
        <Field label="渲染时刻（秒，逗号分隔）">
          <input style={styles.input} value={times} onChange={(e) => setTimes(e.target.value)} />
        </Field>
        <div style={styles.row}>
          <button style={styles.btn(true)} onClick={handleRenderStill} disabled={busy || !base}>
            {busy ? '渲染中...' : '渲染静帧'}
          </button>
          <button style={styles.btn()} onClick={handleSheet} disabled={busy || !base}>联系方式图</button>
          <button style={styles.btn()} onClick={handleEncode} disabled={busy || !base}>编码 MP4</button>
        </div>
      </div>

      {preview && (
        <div style={styles.card}>
          <img src={preview} alt="preview" style={styles.img} />
        </div>
      )}

      <div style={styles.card}>
        <Field label="质检指令（可选）">
          <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={checkPrompt}
            onChange={(e) => setCheckPrompt(e.target.value)} placeholder="按 2D 手绘动画标准审查此帧..." />
        </Field>
        <button style={styles.btn()} onClick={handleCheck} disabled={checking}>质检说明</button>
        {checkResult && <div style={styles.statusInfo}>{checkResult}</div>}
      </div>

      <div style={{ fontSize: 10, color: '#71717A', lineHeight: 1.6 }}>
        渲染服务由插件声明（autoStart 自动拉起）。帧/视频输出在插件目录 out/ 下。
        让 AI 调用 render_still / render_contact_sheet / render_frames / encode_video / vision_check 可完成全流程。
      </div>
    </div>
  )
}
