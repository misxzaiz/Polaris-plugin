/**
 * HAR 分析台面板：Tab 组装 + 轮询 + Toast
 *
 * 数据面：cap.kv 投影（meta/report/rows/audit 每 2.5s 轮询）；
 * 服务状态徽章据 meta 心跳渲染；控制面写（open/sanitize/compare/selftest）全走命令信箱。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import AnalyzeTab from './tabs/AnalyzeTab'
import AuditTab from './tabs/AuditTab'
import CompareTab from './tabs/CompareTab'
import SelftestTab from './tabs/SelftestTab'
import {
  getMeta, getReport, getAudit, getDiff, getHist, getSelftest,
  type PanelData,
} from './model'

export type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const META_FRESH_MS = 90 * 1000
const POLL_MS = 2500

const TABS: Array<{ id: string; label: string }> = [
  { id: 'analyze', label: '分析' },
  { id: 'audit', label: '审计' },
  { id: 'compare', label: '对比' },
  { id: 'selftest', label: '自检' },
]


export default function Panel({ pluginId, onSendToChat }: { pluginId: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState('analyze')
  const [data, setData] = useState<PanelData>({ meta: null, report: null, audit: null, diff: null, hist: [], selftest: null, loaded: false })
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const loadedOnce = useRef(false)

  const showToast: Toast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async (): Promise<PanelData> => {
    try {
      const [meta, report, audit] = await Promise.all([getMeta(), getReport(), getAudit()])
      const [diff, hist, selftest] = await Promise.all([getDiff(), getHist(), getSelftest()])
      const next: PanelData = { meta, report, audit, diff, hist, selftest, loaded: true }
      setData(next)
      return next
    } catch (_) {
      const next: PanelData = { meta: null, report: null, audit: null, diff: null, hist: [], selftest: null, loaded: true }
      setData(next)
      return next
    }
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => { void reload() }, POLL_MS)
    return () => clearInterval(timer)
  }, [reload])

  const running = !!(data.meta && data.meta.lastTickAt && Date.now() - data.meta.lastTickAt < META_FRESH_MS)
  if (data.loaded && !loadedOnce.current) loadedOnce.current = true

  const stLabel = data.meta?.state === 'parsing' ? '解析中…' : data.meta?.state === 'error' ? '上次打开出错' : data.meta?.state === 'ready' ? '已就绪' : '待打开'

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, color: '#d4d4d8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>⌗ HAR 分析台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? `服务中 :${data.meta?.port ?? ''}` : '服务离线'}</span>
        {running && (
          <span style={{ fontSize: 10, color: '#52525b' }}>
            {stLabel}
            {data.report ? ` · ${data.report.entryCount} 条 · ${(data.report.spanMs / 1000).toFixed(2)}s` : ''}
          </span>
        )}
        {data.report && data.report.auditHigh && data.report.auditHigh.total > 0 && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(248,81,73,.15)', color: '#f85149' }}>
            ⚠ 敏感信息 {data.report.auditHigh.total} 处（高危 {data.report.auditHigh.high}）
          </span>
        )}
      </div>

      <div style={{
        fontSize: 11, padding: '6px 10px', borderRadius: 8,
        background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', color: '#93c5fd',
      }}>
        浏览器 DevTools → Network → 右键 ⬇ Export HAR 导出抓包，把文件路径贴进「分析」页即可：全本地解析（不出本机）、瀑布图与慢请求诊断、分享前一键审计脱敏。上限 150MB / 2 万条。
      </div>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
              border: '1px solid', minHeight: 32, whiteSpace: 'nowrap',
              borderColor: tab === tb.id ? '#3b82f6' : '#3f3f46',
              background: tab === tb.id ? 'rgba(59,130,246,.15)' : 'transparent',
              color: tab === tb.id ? '#93c5fd' : '#a1a1aa',
            }}
          >{tb.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!data.loaded && <div style={{ color: '#71717a', fontSize: 12 }}>读取数据中…</div>}
        {data.loaded && !running && (
          <div style={{
            padding: 12, borderRadius: 8, border: '1px solid rgba(248,81,73,.35)',
            background: 'rgba(248,81,73,.08)', fontSize: 12, color: '#fca5a5', marginBottom: 8,
          }}>
            后台服务未运行：无法解析 HAR。去 <b>设置</b> 页启动服务（或检查端口 9873 是否被占用）。
          </div>
        )}
        {tab === 'analyze' && <AnalyzeTab data={data} running={running} reload={reload} showToast={showToast} />}
        {tab === 'audit' && <AuditTab data={data} running={running} reload={reload} showToast={showToast} />}
        {tab === 'compare' && <CompareTab data={data} running={running} reload={reload} showToast={showToast} />}
        {tab === 'selftest' && <SelftestTab data={data} running={running} reload={reload} showToast={showToast} />}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', borderRadius: 8, fontSize: 12, maxWidth: '80%',
          background: toast.kind === 'good' ? 'rgba(63,185,80,.92)' : toast.kind === 'bad' ? 'rgba(248,81,73,.92)' : 'rgba(59,130,246,.92)',
          color: '#fff', zIndex: 50,
        }}>{toast.msg}</div>
      )}

      <div style={{ fontSize: 10, color: '#52525b' }}>
        全程无网络请求：解析/审计/脱敏/导出全在本机完成；kv 投影与 AI 摘要均经过脱敏，明文密钥不落 kv。上限 150MB / 2 万条，超出部分截断并明示。
      </div>
    </div>
  )
}
