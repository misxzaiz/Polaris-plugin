/**
 * 审计 Tab：敏感信息分级清单（服务侧已掩码样例）+ 一键脱敏导出（先预检后落盘）
 */
import { useEffect, useState } from 'react'
import { getSettings, saveSettings, sendCommand, fmtBytes, type PanelData, type HarSettings } from '../model'

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const SAN_KEYS: Array<{ k: keyof HarSettings['sanitize']; label: string }> = [
  { k: 'authHeaders', label: '鉴权头（Authorization / X-Api-Key 等 → 值置掩码）' },
  { k: 'cookies', label: '请求 Cookie' },
  { k: 'setCookies', label: '响应 Set-Cookie' },
  { k: 'querySecrets', label: 'URL 敏感参数（token/key/secret…）' },
  { k: 'bodies', label: '请求/响应体内容（整体替换占位）' },
  { k: 'urlCredentials', label: 'URL 内嵌凭据（user:pass@）' },
]

export default function AuditTab({ data, running, reload, showToast }: {
  data: PanelData
  running: boolean
  reload: () => Promise<PanelData>
  showToast: Toast
}) {
  const audit = data.audit
  const [settings, setSettings] = useState<HarSettings | null>(null)
  const [outPath, setOutPath] = useState('')
  const [busy, setBusy] = useState<'' | 'preview' | 'export'>('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)

  useEffect(() => { void getSettings().then(setSettings) }, [])

  const hasHar = !!(data.meta?.activePath || data.report)

  const toggle = async (k: keyof HarSettings['sanitize']) => {
    if (!settings) return
    const next = { ...settings, sanitize: { ...settings.sanitize, [k]: !settings.sanitize[k] } }
    setSettings(next)
    await saveSettings(next)
  }

  const runExport = async (confirm: boolean) => {
    setBusy(confirm ? 'export' : 'preview')
    setResult(null)
    const payload: Record<string, unknown> = {}
    if (outPath.trim()) payload.outputPath = outPath.trim()
    if (confirm) { payload.confirm = true; payload.overwrite = !!(result as { overwrite?: boolean } | null)?.overwrite }
    const r = await sendCommand('sanitize', payload, 90000)
    setBusy('')
    if (!r.ok) { showToast(`失败：${r.error || '未知'}`, 'bad'); return }
    if (r.preview) { setResult(r as Record<string, unknown>); showToast('预检完成（未写盘）', 'info') } else {
      setResult(r as Record<string, unknown>)
      showToast(`已导出 ${r.outputPath}`, 'good')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!hasHar && <div style={{ padding: 14, borderRadius: 8, border: '1px dashed #3f3f46', fontSize: 12, color: '#71717a' }}>先到「分析」页打开一个 HAR——打开即自动完成审计。</div>}

      {hasHar && audit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: audit.total === 0 ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)', color: audit.total === 0 ? '#3fb950' : '#f85149' }}>
            命中 {audit.total} 处（高危 {audit.highCount}）· 扫描 {audit.scannedEntries} 条
          </span>
          <span style={{ fontSize: 10, color: '#52525b', alignSelf: 'center' }}>审计只覆盖已知特征；对外分享前建议无论如何跑一次全量脱敏。</span>
        </div>
      )}

      {hasHar && audit && audit.findings.length === 0 && (
        <div style={{ padding: 14, borderRadius: 8, border: '1px solid rgba(63,185,80,.35)', background: 'rgba(63,185,80,.08)', fontSize: 12, color: '#7ee2a8' }}>
          ✅ 未发现敏感信息命中（鉴权头/Cookie/敏感参数/密钥特征/私钥/JWT/连接串）。可继续用下方脱敏导出做兜底清洗。
        </div>
      )}

      {audit && audit.findings.map((f) => (
        <div key={f.cat} style={{ border: `1px solid ${f.sev === 'high' ? 'rgba(248,81,73,.4)' : 'rgba(210,153,34,.35)'}`, borderRadius: 8, padding: 10, background: f.sev === 'high' ? 'rgba(248,81,73,.06)' : 'rgba(210,153,34,.05)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 12, color: f.sev === 'high' ? '#f85149' : '#d29922' }}>{f.sev === 'high' ? '高危' : '中危'} · {f.label}</b>
            <span style={{ fontSize: 10, color: '#71717a' }}>{f.count} 处 / {f.entryCount} 条请求（#{f.idx.slice(0, 10).join(' #')}{f.idx.length > 10 ? '…' : ''}）</span>
          </div>
          {f.samples.map((s, i) => (
            <div key={i} style={{ fontSize: 10, color: '#a1a1aa', marginTop: 3, wordBreak: 'break-all' }}>
              #{s.i} {s.where}：{s.masked.length > 130 ? `${s.masked.slice(0, 130)}…` : s.masked}
            </div>
          ))}
        </div>
      ))}

      {hasHar && (
        <div style={{ border: '1px solid #3f3f46', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f4f4f5', marginBottom: 6 }}>🧼 脱敏导出（分享安全版）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
            {settings && SAN_KEYS.map(({ k, label }) => (
              <label key={k} style={{ fontSize: 11, color: '#d4d4d8', display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.sanitize[k]} onChange={() => void toggle(k)} />
                {label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={outPath}
              onChange={(e) => setOutPath(e.target.value)}
              placeholder="输出路径（留空 = 源文件同目录 <原名>.sanitized.har）"
              style={{ flex: 1, padding: '6px 10px', fontSize: 11, borderRadius: 8, border: '1px solid #3f3f46', background: '#18181b', color: '#e4e4e7' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => void runExport(false)}
              disabled={!running || busy !== ''}
              style={{ padding: '6px 14px', fontSize: 11, borderRadius: 8, cursor: 'pointer', border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', minHeight: 30 }}
            >预检（不写盘）</button>
            <button
              onClick={() => void runExport(true)}
              disabled={!running || busy !== ''}
              style={{ padding: '6px 14px', fontSize: 11, borderRadius: 8, cursor: 'pointer', border: '1px solid #3fb950', background: 'rgba(63,185,80,.15)', color: '#3fb950', minHeight: 30 }}
            >导出脱敏版</button>
            {busy && <span style={{ fontSize: 10, color: '#71717a' }}>处理中…</span>}
          </div>
          {result && (result as { preview?: boolean }).preview && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid rgba(59,130,246,.3)', background: 'rgba(59,130,246,.06)', fontSize: 11, color: '#93c5fd' }}>
              <div>输出到：{String((result as { outputPath?: string }).outputPath || '')}{(result as { overwrite?: boolean }).overwrite ? '（⚠ 目标已存在，导出将需要确认覆盖）' : ''}</div>
              <div style={{ marginTop: 3, color: '#71717a' }}>预检未写盘；确认无误点「导出脱敏版」。</div>
            </div>
          )}
          {result && !(result as { preview?: boolean }).preview && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid rgba(63,185,80,.4)', background: 'rgba(63,185,80,.07)', fontSize: 11, color: '#7ee2a8', wordBreak: 'break-all' }}>
              <div>✅ 已导出：{String((result as { outputPath?: string }).outputPath || '')}（{fmtBytes(Number((result as { bytes?: number }).bytes) || 0)}）</div>
              <div>sha256: {String((result as { sha256?: string }).sha256 || '')}</div>
              {(() => {
                const stats = (result as { stats?: Record<string, number> }).stats || {}
                const rc = (result as { recheck?: { valid: boolean; auditTotal: number; auditHigh: number } }).recheck
                return (
                  <>
                    <div>脱敏统计: {Object.entries(stats).map(([k, n]) => `${k}:${n}`).join(', ') || '无命中'}</div>
                    {rc && <div>复核: 结构{rc.valid ? '合法 ✅' : '异常 ❌'} · 复核审计剩余 {rc.auditTotal} 处（高危 {rc.auditHigh}）</div>}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
