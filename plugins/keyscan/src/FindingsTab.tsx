/**
 * 发现 Tab：最近(或指定)扫描的发现明细，客户端过滤/搜索/忽略误报。
 * 数据全掩码（前4后2）；「查看文件」交给用户自己去，面板不读文件。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadFindings, loadIgnore, loadScanRecord, saveIgnore,
  type Finding, type IgnoreEntry, type LatestSummary, type ScanRecord, type ServiceMeta, type Sev,
} from './model'

const SEVS: (Sev | 'all')[] = ['all', 'critical', 'high', 'medium']
const SEV_CN: Record<string, string> = { all: '全部', critical: '🔴 严重', high: '🟠 高危', medium: '🟡 中危' }
const PAGE = 50

interface Props {
  head: { meta: ServiceMeta | null; latest: LatestSummary | null }
}

export default function FindingsTab({ head }: Props) {
  const [scanId, setScanId] = useState('')
  const [record, setRecord] = useState<ScanRecord | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [ignore, setIgnore] = useState<IgnoreEntry[]>([])
  const [sev, setSev] = useState<Sev | 'all'>('all')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [running, setRunning] = useState(false)

  // 默认跟随最近扫描；meta.scanning 变化时自动切到进行中的扫描
  useEffect(() => {
    const mid = head.meta?.scanning?.id
    if (mid) { setScanId(mid); setRunning(true) }
    else {
      setRunning(false)
      setScanId((cur) => (cur && head.meta?.scanning ? cur : (head.latest?.id ?? cur)))
    }
  }, [head.meta?.scanning?.id, head.latest?.id])

  const load = useCallback(async (id: string) => {
    if (!id) { setRecord(null); setFindings([]); return }
    setLoading(true); setErr('')
    try {
      const [rec, list, ig] = await Promise.all([loadScanRecord(id), loadFindings(id), loadIgnore()])
      setRecord(rec)
      setFindings(list)
      setIgnore(ig)
      if (!rec) setErr(`扫描记录 ${id} 不存在（可能已被清理，只保留最近 5 份）。`)
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (scanId) void load(scanId)
    else { setRecord(null); setFindings([]) }
  }, [scanId, load])

  // 进行中的扫描：3s 轻轮询进度
  useEffect(() => {
    if (!running || !scanId) return
    const t = setInterval(() => void load(scanId), 3000)
    return () => clearInterval(t)
  }, [running, scanId, load])

  const filtered = useMemo(() => {
    let list = findings
    if (sev !== 'all') list = list.filter((f) => f.sev === sev)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter((f) => (f.occurrences[0]?.file ?? '').toLowerCase().includes(s) || f.ctx.toLowerCase().includes(s) || f.rule.includes(s))
    }
    return list
  }, [findings, sev, search])

  const ignoreFp = useCallback(async (fp: string) => {
    const next = [...ignore, { fp, note: '面板标记误报', at: Date.now() }]
    setIgnore(next)
    await saveIgnore(next)
    setFindings((cur) => cur.filter((f) => f.fp !== fp))
  }, [ignore])

  const unignoreFp = useCallback(async (fp: string) => {
    const next = ignore.filter((x) => x.fp !== fp)
    setIgnore(next)
    await saveIgnore(next)
    void load(scanId)
  }, [ignore, scanId])

  const ignoredSet = useMemo(() => new Set(ignore.map((x) => x.fp)), [ignore])

  const c = record?.counts
  const nw = record?.new

  return (
    <>
      <div className="ks-sec">
        <span className="ks-bar" />发现明细
        <span className="ks-hint">{record?.status === 'running' ? '扫描进行中…' : record ? `${filtered.length}/${findings.length} 条` : ''}</span>
      </div>

      <div className="ks-card"><div className="ks-card-b">
        {record && (
          <div className="ks-sub" style={{ marginBottom: 8 }}>
            {record.root} · {record.status === 'running'
              ? <span className="ks-pulse">已遍历 {record.progress?.files ?? 0} 文件，候选 {record.progress?.findings ?? 0}</span>
              : <>文件 {record.files ?? '?'} · 用时 {Math.round((record.durationMs ?? 0) / 1000)}s{record.truncated ? ` · ⚠ 截断（${record.truncatedReason}）` : ''}{record.ignoredCount ? ` · 忽略表滤掉 ${record.ignoredCount} 条` : ''}</>}
          </div>
        )}
        {c && record?.status === 'done' && (
          <div className="ks-sum">
            <div><b className="ks-crit">{c.critical}</b><small>🔴 严重</small></div>
            <div><b className="ks-high">{c.high}</b><small>🟠 高危</small></div>
            <div><b className="ks-med">{c.medium}</b><small>🟡 中危</small></div>
            <div><b className={(nw?.newCount ?? 0) > 0 ? 'ks-new' : ''}>{nw?.newCount ?? 0}</b><small>新增</small></div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {SEVS.map((s) => (
            <button key={s} className={`ks-tab ${sev === s ? 'on' : ''}`} style={{ background: sev === s ? '#1C2330' : 'transparent' }} onClick={() => setSev(s)}>
              {SEV_CN[s]}
            </button>
          ))}
        </div>
        <input className="ks-inp" placeholder="按文件路径 / 上下文 / 规则名过滤…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {record?.status === 'failed' && <div className="ks-err" style={{ paddingLeft: 0, marginTop: 6 }}>扫描失败：{record.error}</div>}
        {err && <div className="ks-err" style={{ paddingLeft: 0, marginTop: 6 }}>{err}</div>}
        {loading && <div className="ks-sub" style={{ marginTop: 6 }}>加载中…</div>}
      </div></div>

      {!record && !loading && (
        <div className="ks-card"><div className="ks-empty">
          还没有可看的扫描。<br />去「扫描」Tab 发起一次，或对 AI 说「帮我扫一下某目录」。
        </div></div>
      )}

      {filtered.slice(0, limit).map((f) => {
        const rule = f.rule
        const occ0 = f.occurrences[0]
        return (
          <div className="ks-card" style={{ margin: '0 16px 8px' }} key={f.fp}>
            <div className="ks-row" style={{ border: 'none' }}>
              <div className="ks-row-h">
                <span className={`ks-sev ${f.sev}`}>{SEV_CN[f.sev] ?? f.sev}</span>
                <b style={{ fontSize: 12 }}>{rule}</b>
                {f.count > 1 && <span className="ks-tag">出现 {f.count} 次</span>}
                <span className="ks-muted" style={{ marginLeft: 'auto', fontSize: 9.5 }}>指纹 {f.fp}</span>
              </div>
              <div className="ks-row-file ks-mono" style={{ marginTop: 4 }}>
                {occ0?.file}:{occ0?.line}
                {f.count > 1 && f.occurrences.slice(1, 3).map((o, i) => ` · ${o.file}:${o.line}`)}
                {f.count > 3 ? ` 等 ${f.count} 处` : ''}
              </div>
              <div className="ks-ctx">{f.ctx}</div>
              <div className="ks-sub" style={{ marginTop: 5 }}>
                预览 <span className="ks-mono">{f.preview}</span>（完整值在被扫文件里）
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                {ignoredSet.has(f.fp)
                  ? <button className="ks-btn ghost sm" onClick={() => void unignoreFp(f.fp)}>已忽略 · 恢复报告</button>
                  : <button className="ks-btn ghost sm" onClick={() => void ignoreFp(f.fp)}>误报，忽略这条</button>}
              </div>
            </div>
          </div>
        )
      })}

      {filtered.length > limit && (
        <div style={{ textAlign: 'center', paddingBottom: 10 }}>
          <button className="ks-btn ghost sm" onClick={() => setLimit((l) => l + PAGE)}>加载更多（剩 {filtered.length - limit} 条）</button>
        </div>
      )}
      {record?.status === 'done' && filtered.length === 0 && findings.length > 0 && (
        <div className="ks-empty">过滤后 0 条——放宽严重度/搜索条件试试。</div>
      )}
      {record?.status === 'done' && findings.length === 0 && (
        <div className="ks-card"><div className="ks-empty">这次扫描没有发现疑似密钥 🎉<br />保持习惯：每次 push 前扫一遍。</div></div>
      )}
    </>
  )
}
