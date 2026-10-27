/**
 * 检查 Tab：导入（文件/路径）、运行控制与进度、运行报告、去重清单、导出。
 */
import React from 'react'
import type { DigRecord, Meta, RunState } from './model'
import { core, fmtTime, pollResult, sendCmd, sendImportBatches, statusColor, statusLabel } from './model'

interface Report {
  id: string
  type: string
  startedAt: number
  finishedAt: number
  total: number
  checked: number
  okCount: number
  deadCount: number
  byStatus: Record<string, number>
}

interface Props {
  records: DigRecord[]
  run: RunState | null
  reports: Report[]
  busy: boolean
  pluginId: string
  onImportDone: (msg: string) => void
  onErr: (msg: string) => void
  onChanged: () => void
  onOpenTab: (tab: 'library') => void
  onRemove: (ids: string[]) => void
}

const S = {
  panel: { padding: '12px 14px', borderRadius: 10, background: 'var(--p-panel, rgba(128,128,128,.08))', marginBottom: 10 },
  btn: { padding: '7px 14px', borderRadius: 8, border: '1px solid var(--p-border, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12.5 },
  btnAccent: { padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--p-accent, #4a7dff)', color: '#fff', cursor: 'pointer', fontSize: 13 },
  btnDanger: { padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(220,80,80,.4)', background: 'transparent', color: '#d9564a', cursor: 'pointer', fontSize: 12.5 },
  input: {
    flex: 1, minWidth: 200, padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--p-border, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit', fontSize: 12.5,
  },
  bar: { height: 12, borderRadius: 6, overflow: 'hidden', background: 'var(--p-chip, rgba(128,128,128,.15))', margin: '8px 0' },
  dim: { fontSize: 12, color: 'var(--p-text-dim, #999)' },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' as const },
}

function dupGroups(records: DigRecord[]): Array<{ key: string; items: DigRecord[] }> {
  const byKey = new Map<string, DigRecord[]>()
  for (const r of records) {
    const arr = byKey.get(r.normKey) || []
    arr.push(r)
    byKey.set(r.normKey, arr)
  }
  return [...byKey.entries()].filter(([, v]) => v.length > 1).map(([key, items]) => ({ key, items }))
    .sort((a, b) => b.items.length - a.items.length)
}

export default function CheckTab({ records, run, reports, busy, pluginId, onImportDone, onErr, onChanged, onOpenTab, onRemove }: Props) {
  const [importing, setImporting] = React.useState(false)
  const [path, setPath] = React.useState('')
  const [showDups, setShowDups] = React.useState(false)
  const dups = React.useMemo(() => dupGroups(records), [records])

  const importFile = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    try {
      const html = await file.text()
      const parsed = core.parseNetscapeHtml(html)
      if (!parsed.records.length) throw new Error(`没解析到书签（跳过 ${parsed.skipped} 行）——确认是浏览器导出的 HTML（书签管理器 → 导出书签）`)
      const batches = await sendImportBatches(parsed.records)
      onImportDone(`已解析 ${parsed.records.length} 条（跳过 ${parsed.skipped} 行），分 ${batches} 批发送给服务合并；服务稍后自动开始体检首批 ${'…'}`)
    } catch (e) {
      onErr(String((e as Error).message || e))
    } finally {
      setImporting(false)
    }
  }

  const importByPath = async () => {
    const p = path.trim()
    if (!p) return
    setImporting(true)
    try {
      const nonce = await sendCmd('import_path', { path: p })
      const r = await pollResult(nonce, 30000)
      if (!r) throw new Error('导入超时：服务可能未运行（设置 → 服务管理查看）')
      if (!r.ok) throw new Error(r.error || '导入失败')
      const s = r.summary as Record<string, number>
      onImportDone(`导入完成：解析 ${s.parsed} 条，新增 ${s.added}，更新 ${s.updated}，重复 ${s.duplicates}，无效 ${s.invalid}，跳过行 ${s.skippedLines}`)
      onChanged()
    } catch (e) {
      onErr(String((e as Error).message || e))
    } finally {
      setImporting(false)
    }
  }

  const startCheck = async (deadOnly: boolean) => {
    try {
      const nonce = await sendCmd(deadOnly ? 'recheck_dead' : 'check', {})
      const r = await pollResult(nonce, 15000)
      if (!r) throw new Error('命令超时：服务可能未运行')
      if (!r.ok) throw new Error(r.error || '启动失败')
      onImportDone(`检查运行已启动（队列 ${(r.summary as { queued?: number }).queued} 条）`)
      onChanged()
    } catch (e) {
      onErr(String((e as Error).message || e))
    }
  }

  const exportJson = async () => {
    const payload = records.map((r) => ({ title: r.title, url: r.url, folder: r.folder, status: r.status, httpStatus: r.httpStatus, category: core.classifyUrl(r.url), addedAt: r.addedAt, lastCheckedAt: r.lastCheckedAt }))
    const { copyText } = await import('./model')
    const r = await copyText(JSON.stringify(payload, null, 1))
    onImportDone(r === 'copied' ? `已复制 ${payload.length} 条 JSON 到剪贴板` : '已弹窗供手动复制（手机端）')
  }

  const exportCsv = async () => {
    const csv = core.toCsv(records)
    const { copyText } = await import('./model')
    const r = await copyText(csv.slice(0, 200000))
    onImportDone(r === 'copied' ? '已复制 CSV（前 20 万字符）到剪贴板' : '已弹窗供手动复制（手机端）')
  }

  const prog = run && run.queue.length ? Math.round((run.cursor / run.queue.length) * 100) : 0

  return (
    <div>
      <div style={S.panel}>
        <strong>📥 导入</strong>
        <div style={{ ...S.dim, margin: '6px 0' }}>
          浏览器书签管理器 → 导出书签（HTML），然后导入。导入后服务自动开始体检。
        </div>
        <div style={S.row}>
          <label style={{ ...S.btnAccent, display: 'inline-block' }}>
            {importing ? '导入中…' : '选文件导入'}
            <input type="file" accept=".html,.htm,text/html" style={{ display: 'none' }}
              disabled={importing} onChange={(e) => importFile(e.target.files?.[0])} />
          </label>
          <input style={S.input} placeholder="或输入导出文件绝对路径（桌面端）：C:\Users\me\Desktop\bookmarks.html"
            value={path} onChange={(e) => setPath(e.target.value)} />
          <button style={S.btn} disabled={importing || !path.trim()} onClick={importByPath}>按路径导入</button>
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <strong>🔍 体检</strong>
          <span style={{ flex: 1 }} />
          <button style={S.btn} disabled={busy} onClick={() => startCheck(true)}>只重查死链</button>
          <button style={S.btnAccent} disabled={busy} onClick={() => startCheck(false)}>开始体检一批</button>
        </div>
        {run ? (
          <div>
            <div style={S.dim}>
              运行 {run.id}（{run.type === 'auto' ? '自动' : run.type === 'recheck_dead' ? '死链重查' : '手动'}）·
              进度 {run.cursor}/{run.queue.length}（{prog}%）· 存活 {run.okCount} · 死 {run.deadCount}
            </div>
            <div style={S.bar}><div style={{ width: `${prog}%`, height: '100%', background: 'var(--p-accent, #4a7dff)' }} /></div>
            <div style={S.dim}>单条失败重试 ≤ 次数后诚实标记，不堵队列；中断可续（重启服务从断点继续）。</div>
          </div>
        ) : (
          <div style={{ ...S.dim, marginTop: 6 }}>
            当前无运行。批量 = 设置页「批量」；从未检查的优先，其次最久未查。
          </div>
        )}
      </div>

      {reports.length > 0 && (
        <div style={S.panel}>
          <strong>📊 最近运行报告</strong>
          {reports.slice(0, 3).map((rp) => (
            <div key={rp.id} style={{ ...S.dim, marginTop: 6 }}>
              {fmtTime(rp.finishedAt)} · {rp.type} · 查 {rp.checked}/{rp.total} · 存活 {rp.okCount} · 死 {rp.deadCount}
              {' · '}{Object.entries(rp.byStatus).map(([s, n]) => `${statusLabel(s)} ${n}`).join('，')}
            </div>
          ))}
          <div style={S.row}>
            <button style={{ ...S.btn, marginTop: 6 }} onClick={() => onOpenTab('library')}>去书签库看死链 →</button>
          </div>
        </div>
      )}

      <div style={S.panel}>
        <div style={S.row}>
          <strong>♻️ 去重</strong>
          <span style={{ flex: 1 }} />
          <span style={S.dim}>{dups.length} 组重复</span>
          <button style={S.btn} onClick={() => setShowDups(!showDups)}>{showDups ? '收起' : '展开'}</button>
        </div>
        {showDups && (
          <div style={{ marginTop: 6 }}>
            {dups.slice(0, 20).map((g) => (
              <div key={g.key} style={{ borderTop: '1px solid var(--p-border, rgba(128,128,128,.2))', padding: '6px 0' }}>
                <div style={{ ...S.dim, fontFamily: 'monospace' }}>{g.key.slice(0, 90)}</div>
                {g.items.map((r, i) => (
                  <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '2px 0' }}>
                    <span style={{ color: statusColor(r.status) }}>●</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {r.title || r.host}{r.folder ? `（${r.folder}）` : ''}
                    </span>
                    <span style={S.dim}>{i === 0 ? '保留' : '重复'}</span>
                    {i > 0 && <button style={S.btnDanger} disabled={busy} onClick={() => onRemove([r.id])}>删</button>}
                  </div>
                ))}
              </div>
            ))}
            {dups.length === 0 && <div style={S.dim}>没有重复（URL 规范化去跟踪参数后比对）。</div>}
          </div>
        )}
      </div>

      <div style={S.panel}>
        <strong>📤 导出</strong>
        <div style={{ ...S.row, marginTop: 8 }}>
          <button style={S.btn} disabled={!records.length} onClick={exportJson}>复制 JSON（{records.length} 条）</button>
          <button style={S.btn} disabled={!records.length} onClick={exportCsv}>复制 CSV</button>
        </div>
      </div>
    </div>
  )
}
