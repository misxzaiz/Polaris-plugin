/**
 * 扫描 Tab：目录输入 → 服务扫描 → 布局/文件/摘要卡 + 「发送体检提示词到对话」。
 */
import { useEffect, useState } from 'react'
import type { PanelCtx } from './Panel'
import { apiScan, loadSettings, saveSettings, pushRecentDir, type ScanResult, type ServiceMeta } from './model'

export default function ScanTab({ ctx, meta, scan, onScanDone, goMatrix }: {
  ctx: PanelCtx
  meta: ServiceMeta | null
  scan: ScanResult | null
  onScanDone: (s: ScanResult | null) => void
  goMatrix: () => void
}) {
  const [dir, setDir] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSettings().then((s) => {
      setRecent(s.recentDirs || [])
      if (!dir && s.recentDirs && s.recentDirs.length) setDir(s.recentDirs[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doScan = async () => {
    if (!meta) { setError('服务未运行：等待宿主拉起，或到 设置→插件→i18n-sync 手动启动'); return }
    if (!dir.trim()) { setError('请输入 locale 根目录的绝对路径'); return }
    setBusy(true)
    setError('')
    try {
      const s = await apiScan(meta, dir.trim())
      onScanDone(s)
      const st = await loadSettings()
      await saveSettings({ ...st, recentDirs: pushRecentDir(st.recentDirs || [], dir.trim()) })
      setRecent(pushRecentDir(st.recentDirs || [], dir.trim()))
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }

  const sendPrompt = () => {
    if (!scan) return
    const locales = scan.locales.filter((l) => l !== scan.baseLocale)
    const text = [
      `请帮我体检并补齐多语言文件：`,
      `目录：${scan.root}`,
      `基准语言：${scan.baseLocale}；目标语言：${locales.join('、') || '（无其他语言）'}`,
      `当前摘要：缺失 ${scan.totals.missing} · 空值 ${scan.totals.empty} · 疑似未翻译 ${scan.totals.sameAsBase} · 占位符不一致 ${scan.totals.placeholder}`,
      `请先调用 i18n_status 核对，然后对每个目标语言调用 i18n_missing 获取工作表并翻译（遵守术语表与占位符规则），最后经我确认后用 i18n_apply 落盘。`,
    ].join('\n')
    if (ctx.onSendToChat) ctx.onSendToChat(text)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void doScan() }}
          placeholder="locale 根目录绝对路径，如 D:\proj\web\src\locales"
          style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--polaris-border, #3f3f46)', background: 'transparent', color: 'inherit' }}
        />
        <button
          onClick={() => void doScan()}
          disabled={busy}
          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: busy ? 'wait' : 'pointer', background: 'var(--polaris-accent, #6366f1)', color: '#fff' }}
        >
          {busy ? '扫描中…' : '扫描'}
        </button>
      </div>

      {recent.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {recent.map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              title={d}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--polaris-border, #3f3f46)', background: 'transparent', color: 'inherit', cursor: 'pointer', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}

      {!scan && !error && (
        <div style={{ padding: 16, border: '1px dashed var(--polaris-border, #3f3f46)', borderRadius: 8, lineHeight: 1.8, opacity: 0.85 }}>
          <b>首次使用：</b>输入项目的 locale 目录（如 <code>src/locales</code>），支持
          <code> zh-CN.json / en.json </code>（单文件一语言）与
          <code> zh-CN/common.json </code>（目录一语言多命名空间）两种布局，JSON/JSONC/YAML 皆可。
          <br />也可以直接在对话里对 AI 说：「用 i18n_status 体检 D:\myapp\locales」。
        </div>
      )}

      {scan && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Stat label="布局" value={scan.layout === 'file-per-locale' ? '文件一语言' : scan.layout === 'dir-per-locale' ? '目录一语言' : scan.layout === 'mixed' ? '混合（按目录/文件名识别）' : '未识别'} />
            <Stat label="基准语言" value={scan.baseLocale} />
            <Stat label="语言" value={scan.locales.join(', ')} />
            <Stat label="命名空间" value={scan.nsList.length ? scan.nsList.join(', ') : '（无）'} />
            <Stat label="文件" value={`${scan.totals.files} 个${scan.totals.parseErrors ? `（解析失败 ${scan.totals.parseErrors}）` : ''}`} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Stat label="缺失" value={scan.totals.missing} warn={scan.totals.missing > 0} />
            <Stat label="空值" value={scan.totals.empty} warn={scan.totals.empty > 0} />
            <Stat label="疑似未翻译" value={scan.totals.sameAsBase} warn={scan.totals.sameAsBase > 0} />
            <Stat label="占位符不一致" value={scan.totals.placeholder} warn={scan.totals.placeholder > 0} />
            <Stat label="多余键" value={scan.totals.extra} />
          </div>

          {scan.warnings.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
              {scan.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          {scan.parseErrors.length > 0 && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', marginBottom: 8, fontSize: 12 }}>
              {scan.parseErrors.map((p, i) => (
                <div key={i}><b>{p.relPath}</b>：{p.error}</div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={goMatrix}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--polaris-border, #3f3f46)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
            >
              查看矩阵 / 手工补齐
            </button>
            {ctx.onSendToChat && (
              <button
                onClick={sendPrompt}
                style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--polaris-accent, #6366f1)', color: '#fff', cursor: 'pointer' }}
              >
                把体检与补齐任务发到对话
              </button>
            )}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.7 }}>
                <th style={thStyle}>文件</th>
                <th style={thStyle}>语言</th>
                <th style={thStyle}>ns</th>
                <th style={thStyle}>格式</th>
                <th style={thStyle}>键数</th>
                <th style={thStyle}>备注</th>
              </tr>
            </thead>
            <tbody>
              {scan.files.map((f) => (
                <tr key={f.relPath} style={{ borderTop: '1px solid var(--polaris-border, #27272a)' }}>
                  <td style={tdStyle}>{f.relPath}</td>
                  <td style={tdStyle}>{f.locale}</td>
                  <td style={tdStyle}>{f.ns || '（根）'}</td>
                  <td style={tdStyle}>{f.format}{f.hasComments ? ' · 含注释' : ''}</td>
                  <td style={tdStyle}>{f.keys}</td>
                  <td style={tdStyle}>{f.size > 1024 * 512 ? '大文件' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '4px 8px', fontWeight: 500 }
const tdStyle: React.CSSProperties = { padding: '4px 8px', wordBreak: 'break-all' }

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{
      padding: '6px 12px', borderRadius: 8, minWidth: 90,
      background: warn ? 'rgba(239,68,68,.1)' : 'var(--polaris-surface, rgba(127,127,127,.08))',
      border: `1px solid ${warn ? 'rgba(239,68,68,.3)' : 'var(--polaris-border, #3f3f46)'}`,
    }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: warn ? '#ef4444' : 'inherit', wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}
