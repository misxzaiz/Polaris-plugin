/**
 * 矩阵 Tab：问题键 × 语言矩阵（缺失/空值/疑似未翻译/占位符）+ 手工编辑 → 审阅应用 → 撤销。
 * 数据来自最近一次扫描（scan prop）；应用走 service（写前快照）。
 */
import { useMemo, useState } from 'react'
import type { PanelCtx } from './Panel'
import {
  apiApply, apiUndo, cellIssueCount, loadUndoIndex,
  type ApplyErr, type ApplyOk, type LocaleCell, type ScanResult, type ServiceMeta, type UndoEntry,
} from './model'

type Filter = 'all' | 'missing' | 'empty' | 'same' | 'placeholder'

interface Row {
  ns: string
  key: string
  baseValue: string
  kind: 'missing' | 'empty' | 'same' | 'placeholder'
  locale: string // 出问题的目标语言（矩阵行按 (locale, key) 一行一项）
  phDetail?: string
}

const KIND_LABEL: Record<Row['kind'], string> = {
  missing: '缺失',
  empty: '空值',
  same: '疑似未翻译',
  placeholder: '占位符',
}

export default function MatrixTab({ ctx, meta, scan, onScanDone }: {
  ctx: PanelCtx
  meta: ServiceMeta | null
  scan: ScanResult | null
  onScanDone: (s: ScanResult | null) => void
}) {
  const [ns, setNs] = useState<string>('')
  const [locale, setLocale] = useState<string>('')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({}) // `${locale}||${ns}||${key}` -> 译文
  const [result, setResult] = useState<ApplyOk | ApplyErr | null>(null)
  const [undoList, setUndoList] = useState<UndoEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const targetLocales = useMemo(() => (scan ? scan.locales.filter((l) => l !== scan.baseLocale) : []), [scan])

  const effectiveNs = ns || scan?.nsList[0] || ''
  const effectiveLocale = locale || targetLocales[0] || ''

  const rows: Row[] = useMemo(() => {
    if (!scan) return []
    const out: Row[] = []
    for (const n of scan.nsList) {
      if (effectiveNs && n !== effectiveNs) continue
      const entry = scan.matrix[n] as Record<string, LocaleCell | undefined>
      if (!entry || (entry as { _error?: string })._error) continue
      for (const loc of scan.locales) {
        if (loc === scan.baseLocale) continue
        if (effectiveLocale && loc !== effectiveLocale) continue
        const c = entry[loc]
        if (!c || c._parseError) continue
        const want: Array<'missing' | 'empty' | 'same' | 'placeholder'> = filter === 'all' ? ['missing', 'empty', 'same', 'placeholder'] : [filter]
        for (const kind of want) {
          const raw: Array<{ key: string; baseValue?: string; detail?: { missingInTarget?: string[]; extraInTarget?: string[]; positionalIssues?: string[] } }> | undefined =
            kind === 'missing' ? c.missing : kind === 'empty' ? c.emptyValues : kind === 'same' ? c.sameAsBase : c.placeholderIssues
          for (const it of raw ?? []) {
            out.push({
              ns: n, key: it.key, baseValue: it.baseValue ?? '', kind, locale: loc,
              phDetail: kind === 'placeholder' ? phText(it.detail) : undefined,
            })
          }
        }
      }
    }
    const q = query.trim().toLowerCase()
    const filtered = q ? out.filter((r) => r.key.toLowerCase().includes(q) || r.baseValue.toLowerCase().includes(q)) : out
    return filtered.slice(0, 500)
  }, [scan, effectiveNs, effectiveLocale, filter, query])

  const editKey = (r: Row) => `${r.locale}||${r.ns}||${r.key}`
  const pendingCount = Object.values(edits).filter((v) => v.trim()).length

  const applyEdits = async () => {
    if (!meta || !scan) return
    setBusy(true)
    setResult(null)
    try {
      // edits 按 (ns) 分片：translations 的键在本 ns 内唯一；跨 ns 冲突由服务端消歧报错兜底
      const byNs: Record<string, Record<string, string>> = {}
      for (const [k, v] of Object.entries(edits)) {
        if (!v.trim()) continue
        const [loc, n, key] = k.split('||')
        void loc
        if (!byNs[n]) byNs[n] = {}
        byNs[n][key] = v
      }
      let last: ApplyOk | ApplyErr | null = null
      for (const [n, translations] of Object.entries(byNs)) {
        last = await apiApply(meta, { dir: scan.root, locale: effectiveLocale, ns: n, translations })
        if (last.ok === false) break
      }
      setResult(last)
      if (last && last.ok) {
        setEdits({})
        setConfirming(false)
        // 应用后重扫验证闭环
        const { apiScan } = await import('./model')
        const fresh = await apiScan(meta, scan.root)
        onScanDone(fresh)
        setUndoList(await loadUndoIndexSafe(meta))
      }
    } catch (e) {
      setResult({ ok: false, errors: [{ key: '-', reason: String((e as Error).message || e) }] })
    } finally {
      setBusy(false)
    }
  }

  const undoLast = async () => {
    if (!meta) return
    setBusy(true)
    try {
      const list = await loadUndoIndexSafe(meta)
      setUndoList(list)
      if (!list.length) { setResult({ ok: false, errors: [{ key: '-', reason: '没有可撤销的批次' }] }); return }
      const r = await apiUndo(meta, list[0].batchId)
      const bad = r.results.filter((x) => !x.ok)
      setResult(bad.length
        ? { ok: false, errors: bad.map((b) => ({ key: b.file, reason: b.error || '恢复失败' })) }
        : { ok: true, message: `已撤销批次 ${list[0].batchId}` })
      const { apiScan } = await import('./model')
      onScanDone(await apiScan(meta, scan?.root || ''))
    } catch (e) {
      setResult({ ok: false, errors: [{ key: '-', reason: String((e as Error).message || e) }] })
    } finally {
      setBusy(false)
    }
  }

  if (!scan) {
    return <div style={{ padding: 16, opacity: 0.8 }}>先到「扫描」Tab 扫一个 locale 目录。</div>
  }
  if (!targetLocales.length) {
    return <div style={{ padding: 16, opacity: 0.8 }}>只识别到基准语言 {scan.baseLocale}，没有其他语言文件可比对。</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <select value={effectiveNs} onChange={(e) => setNs(e.target.value)} style={selStyle}>
          {scan.nsList.map((n) => <option key={n} value={n}>ns: {n || '（根）'}</option>)}
        </select>
        <select value={effectiveLocale} onChange={(e) => setLocale(e.target.value)} style={selStyle}>
          {targetLocales.map((l) => <option key={l} value={l}>语言: {l}</option>)}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={selStyle}>
          <option value="all">全部问题</option>
          <option value="missing">仅缺失</option>
          <option value="empty">仅空值</option>
          <option value="same">仅疑似未翻译</option>
          <option value="placeholder">仅占位符</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按键或文案过滤"
          style={{ ...selStyle, flex: 1, minWidth: 140 }}
        />
      </div>

      {rows.length === 0 && (
        <div style={{ padding: 16, border: '1px dashed var(--polaris-border, #3f3f46)', borderRadius: 8, opacity: 0.8 }}>
          {cellIssueCountAll(scan, effectiveNs, effectiveLocale) === 0
            ? `✅ ${effectiveLocale} 在 ns「${effectiveNs || '（根）'}」与基准 ${scan.baseLocale} 对齐。`
            : '当前过滤器下没有行（试试「全部问题」）。'}
        </div>
      )}

      {rows.map((r) => {
        const ek = editKey(r)
        return (
          <div key={`${r.locale}:${r.ns}:${r.kind}:${r.key}`} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--polaris-border, #27272a)', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: kindBg(r.kind), color: '#fff' }}>{KIND_LABEL[r.kind]}</span>
              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{r.key}</code>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4, whiteSpace: 'pre-wrap' }}>
              {scan.baseLocale}：{r.baseValue || '（空）'}
              {r.phDetail && <span style={{ color: '#f59e0b' }}> · {r.phDetail}</span>}
            </div>
            <input
              value={edits[ek] || ''}
              onChange={(e) => setEdits((prev) => ({ ...prev, [ek]: e.target.value }))}
              placeholder={`填写 ${r.locale} 译文后点下方「应用」…`}
              style={{ width: '100%', marginTop: 6, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--polaris-border, #3f3f46)', background: 'transparent', color: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
        )
      })}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={pendingCount === 0 || busy || !meta}
              style={{ ...btnPrimary, opacity: pendingCount === 0 || !meta ? 0.5 : 1 }}
            >
              应用 {pendingCount} 项变更
            </button>
          ) : (
            <>
              <span style={{ fontSize: 12, color: '#f59e0b' }}>
                将写入 {effectiveLocale}（写前自动快照，可撤销）。含注释文件需在设置说明中确认 stripComments。
              </span>
              <button onClick={() => void applyEdits()} disabled={busy} style={btnPrimary}>{busy ? '写入中…' : '确认写入'}</button>
              <button onClick={() => setConfirming(false)} disabled={busy} style={btnGhost}>取消</button>
            </>
          )}
          <button onClick={() => void undoLast()} disabled={busy || !meta} style={btnGhost}>撤销最近批次</button>
          {ctx.onSendToChat && rows.length > 0 && (
            <button
              onClick={() => ctx.onSendToChat?.([
                `请帮我翻译 ${scan.root} 的 ${effectiveLocale}（ns=${effectiveNs || '全部'}），共 ${rows.length} 个问题键（缺失/空值/疑似未翻译/占位符不一致）。`,
                `请调用 i18n_missing 获取工作表（dir="${scan.root}", locale="${effectiveLocale}"${effectiveNs ? `, ns="${effectiveNs}"` : ''}），`,
                `按术语表翻译全部条目后，经我确认用 i18n_apply 落盘。`,
              ].join(''))}
              style={btnGhost}
            >
              让 AI 翻译这些问题键
            </button>
          )}
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap',
          background: result.ok ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
          border: `1px solid ${result.ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
        }}>
          {result.ok
            ? `✅ ${result.message || `已写入${result.batchId ? `（batchId=${result.batchId}）` : ''}`}${result.applied ? '\n' + result.applied.map((a) => `[${a.ns}] ${a.file}：新增 ${a.insert} · 更新 ${a.update}`).join('\n') : ''}`
            : `❌ 未写盘：\n${result.errors.map((e) => `- ${e.key}: ${e.reason}`).join('\n')}${result.hint ? `\n${result.hint}` : ''}`}
        </div>
      )}

      {undoList.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
          最近批次：{undoList.slice(0, 5).map((u) => `${u.batchId}(${u.locale}, ${u.at.slice(5, 16).replace('T', ' ')})`).join(' · ')}
        </div>
      )}
    </div>
  )
}

async function loadUndoIndexSafe(meta: ServiceMeta): Promise<UndoEntry[]> {
  try { return await loadUndoIndex() } catch (_) { return [] }
}

function cellIssueCountAll(scan: ScanResult, ns: string, locale: string): number {
  const entry = scan.matrix[ns] as Record<string, LocaleCell | undefined> | undefined
  const c = entry && entry[locale]
  return cellIssueCount(c)
}

function phText(detail?: { missingInTarget?: string[]; extraInTarget?: string[]; positionalIssues?: string[] }): string {
  if (!detail) return ''
  const parts: string[] = []
  if (detail.missingInTarget?.length) parts.push(`缺少 ${detail.missingInTarget.join(' ')}`)
  if (detail.extraInTarget?.length) parts.push(`多出 ${detail.extraInTarget.join(' ')}`)
  if (detail.positionalIssues?.length) parts.push(detail.positionalIssues.join('; '))
  return parts.join('；')
}

function kindBg(kind: Row['kind']): string {
  return kind === 'missing' ? '#ef4444' : kind === 'empty' ? '#f59e0b' : kind === 'same' ? '#a855f7' : '#ec4899'
}

const selStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--polaris-border, #3f3f46)',
  background: 'transparent', color: 'inherit',
}
const btnPrimary: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: 'var(--polaris-accent, #6366f1)', color: '#fff',
}
const btnGhost: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 6, border: '1px solid var(--polaris-border, #3f3f46)',
  background: 'transparent', color: 'inherit', cursor: 'pointer',
}
