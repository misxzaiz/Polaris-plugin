/**
 * 设置 Tab：服务管理卡（自举 start / stop / restart）+ 保留策略 + 数据管理 + 键空间契约
 */
import { useEffect, useState } from 'react'
import {
  fmtBytes, fmtTime, listServiceStatus, restartService, saveSettings, sendCommand,
  startServiceBootstrapped, stopService,
  type ServiceStatus,
} from '../model'
import type { PanelData, Toast } from '../Panel'

interface Props {
  data: PanelData
  running: boolean
  reload: () => Promise<PanelData>
  showToast: Toast
}

export default function SettingsTab({ data, reload, showToast }: Props) {
  const [svc, setSvc] = useState<ServiceStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [maxPerBucket, setMaxPerBucket] = useState('')
  const [bodyCapKb, setBodyCapKb] = useState('')

  const refreshSvc = async () => setSvc(await listServiceStatus())
  useEffect(() => { void refreshSvc() }, [])

  const meta = data.meta
  const settings = data.settings

  const doStart = async () => {
    setBusy(true)
    try {
      const err = await startServiceBootstrapped()
      showToast(err ? `启动失败：${err}` : '启动命令已发出，几秒后看状态', err ? 'bad' : 'good')
      setTimeout(() => { void refreshSvc(); void reload() }, 2500)
    } catch (e) {
      showToast(`启动失败：${(e as Error).message}`, 'bad')
    } finally { setBusy(false) }
  }
  const doStop = async () => {
    setBusy(true)
    try { await stopService(); showToast('已停止', 'good') } catch (e) { showToast(`停止失败：${(e as Error).message}`, 'bad') } finally { setBusy(false); setTimeout(() => void refreshSvc(), 800) }
  }
  const doRestart = async () => {
    setBusy(true)
    try { await restartService(); showToast('重启命令已发出', 'good') } catch (e) { showToast(`重启失败：${(e as Error).message}`, 'bad') } finally { setBusy(false); setTimeout(() => { void refreshSvc(); void reload() }, 2500) }
  }

  const saveRetention = async () => {
    if (!settings) return
    const mpb = parseInt(maxPerBucket, 10)
    const cap = parseInt(bodyCapKb, 10)
    const next = {
      ...settings,
      retention: {
        maxPerBucket: Number.isFinite(mpb) ? mpb : settings.retention.maxPerBucket,
        bodyCapKb: Number.isFinite(cap) ? cap : settings.retention.bodyCapKb,
      },
    }
    try {
      await saveSettings(next)
      showToast('保留策略已保存（服务 5s 内生效）', 'good')
      await reload()
    } catch (e) { showToast(`保存失败：${(e as Error).message}`, 'bad') }
  }

  const clearAll = async () => {
    if (!settings) return
    if (!window.confirm('清空全部桶的捕获留痕（JSONL 文件重写，不可恢复）。确认？')) return
    setBusy(true)
    try {
      for (const b of settings.buckets) {
        await sendCommand('clear', { bucketId: b.id, confirm: true }, 15000)
      }
      showToast('已清空全部捕获留痕', 'good')
      await reload()
    } catch (e) { showToast(`清空失败：${(e as Error).message}`, 'bad') } finally { setBusy(false) }
  }

  const svcState = svc?.status || 'unknown'
  const svcColor = svcState === 'running' ? '#3fb950' : svcState === 'failed' || svcState === 'dead' ? '#f85149' : '#d29922'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 服务管理卡 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ color: '#f4f4f5', fontSize: 13 }}>后台捕获服务</b>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,255,255,.06)', color: svcColor }}>
            {svcState === 'running' ? `运行中 (pid ${svc?.status ? meta?.pid ?? '?' : '?'})` : svcState}
          </span>
          {svc?.lastError && <span style={{ fontSize: 10, color: '#f85149' }}>{String(svc.lastError).slice(0, 80)}</span>}
        </div>
        <div style={{ fontSize: 11, color: '#71717a', marginTop: 6, lineHeight: 1.7 }}>
          {meta
            ? <>v{meta.version} · 端口 {meta.port} · 心跳 {fmtTime(meta.lastTickAt)} · 累计 {meta.capturesTotal ?? 0} 条 · 留痕 {fmtBytes(meta.fileBytes)}</>
            : '服务无心跳：面板可读 kv 但服务未上线（首次启用等几秒；仍无则点启动）。'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={doStart} disabled={busy} style={btnPrimary}>启动</button>
          <button onClick={doRestart} disabled={busy} style={btnGhost}>重启</button>
          <button onClick={doStop} disabled={busy} style={btnDanger}>停止</button>
          <button onClick={() => void refreshSvc()} style={btnGhost}>刷新状态</button>
        </div>
        <div style={{ fontSize: 10, color: '#52525b', marginTop: 6 }}>
          端口被占用时服务会诚实退出：释放 9869 后点「启动」。日志在数据目录 webhook-station.log（宿主不收集服务 stdout）。
        </div>
      </div>

      {/* 保留策略 */}
      {settings && (
        <div style={card}>
          <b style={{ color: '#f4f4f5', fontSize: 13 }}>保留策略</b>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, width: 180 }}>
              每桶最多保留条数（10–500）
              <input
                value={maxPerBucket}
                onChange={(e) => setMaxPerBucket(e.target.value)}
                placeholder={String(settings.retention.maxPerBucket)}
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, width: 180 }}>
              单条 body 存储上限 KB（8–1024）
              <input
                value={bodyCapKb}
                onChange={(e) => setBodyCapKb(e.target.value)}
                placeholder={String(settings.retention.bodyCapKb)}
                style={inputStyle}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={saveRetention} style={btnPrimary}>保存</button>
            <button onClick={clearAll} disabled={busy} style={btnDanger}>清空全部留痕</button>
          </div>
          <div style={{ fontSize: 10, color: '#52525b', marginTop: 6 }}>
            超限自动淘汰最旧；留痕文件 8MB 自动轮转（保留一代 .old）。
          </div>
        </div>
      )}

      {/* 数据与隐私 */}
      <div style={card}>
        <b style={{ color: '#f4f4f5', fontSize: 13 }}>数据与隐私</b>
        <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 6, lineHeight: 1.8 }}>
          <div>留痕文件：{meta?.filePath || '（服务未上线）'}</div>
          <div>存储目录：{meta?.storeDir || '-'}</div>
          <div>键空间：cap.kv 的 whs.*（本机 sqlite），捕获预览 ≤10KB/条；全文只在留痕文件。</div>
          <div style={{ color: '#d29922' }}>
            捕获内容可能含签名/密钥/PII：数据不出本机；让 AI 分析时 hook_get 已对敏感头脱敏，但请求体原样可读——共享屏幕或转发日志时注意。
          </div>
        </div>
      </div>

      {/* 键空间契约 */}
      <div style={card}>
        <b style={{ color: '#f4f4f5', fontSize: 13 }}>键空间契约（whs.*）</b>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#71717a', lineHeight: 1.8, marginTop: 6 }}>
          <div>whs.settings — 桶配置+保留策略（面板/MCP 写，服务读；服务仅缺失时引导默认桶）</div>
          <div>whs.meta — 服务心跳（服务写）</div>
          <div>whs.rec.&lt;n&gt; — 捕获预览分块（服务单写者；rec.0 最新，每块 20 条）</div>
          <div>whs.idx — 捕获索引 {`{count,total,chunkCount}`}</div>
          <div>whs.cmd.&lt;op&gt;.&lt;nonce&gt; — 命令键（面板/MCP 写，服务先删后做）</div>
          <div>whs.result.&lt;nonce&gt; — 命令结果（服务写，读后删）</div>
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { border: '1px solid #27272a', borderRadius: 8, padding: 10, background: '#131316' }
const labelStyle: React.CSSProperties = { fontSize: 11, color: '#a1a1aa', display: 'flex', flexDirection: 'column', gap: 4 }
const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #3f3f46',
  background: '#18181b', color: '#d4d4d8', minHeight: 28,
}
const btnPrimary: React.CSSProperties = {
  fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', minHeight: 30,
  border: '1px solid #3b82f6', background: 'rgba(59,130,246,.18)', color: '#93c5fd',
}
const btnGhost: React.CSSProperties = {
  fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 28,
  border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa',
}
const btnDanger: React.CSSProperties = {
  fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 28,
  border: '1px solid rgba(248,81,73,.5)', background: 'rgba(248,81,73,.08)', color: '#f85149',
}
