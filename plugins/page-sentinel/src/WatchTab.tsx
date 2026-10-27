/**
 * 监控 Tab：目标卡片列表 + 新建/编辑表单（含试抓预览）
 */
import { useState } from 'react'
import {
  triggerCheck, saveTarget, removeTarget, testFetch, validateTarget, uid, loadEvents,
  timeAgo, inDelta, fmtInterval, modeLabel, conditionLabel, kvSet, K,
  MODE_OPTIONS, CONDITION_OPTIONS,
  type Snapshot, type TargetDef, type ExtractMode, type WatchCondition, type SentinelEvent, type DiffOp,
} from './model'

interface FormState {
  id: string | null
  name: string
  url: string
  mode: ExtractMode
  selector: string
  regex: string
  jsonPath: string
  intervalSec: number
  condition: WatchCondition
  keyword: string
  threshold: string
  headers: string
}

const INTERVAL_OPTIONS: { v: number; label: string }[] = [
  { v: 60, label: '每 1 分钟' },
  { v: 300, label: '每 5 分钟' },
  { v: 600, label: '每 10 分钟' },
  { v: 1800, label: '每 30 分钟' },
  { v: 3600, label: '每 1 小时' },
  { v: 21600, label: '每 6 小时' },
]

function emptyForm(): FormState {
  return {
    id: null, name: '', url: '', mode: 'text', selector: '', regex: '', jsonPath: '',
    intervalSec: 600, condition: 'any', keyword: '', threshold: '', headers: '',
  }
}

function fromTarget(t: TargetDef): FormState {
  return {
    id: t.id, name: t.name, url: t.url, mode: t.mode,
    selector: t.selector || '', regex: t.regex || '', jsonPath: t.jsonPath || '',
    intervalSec: t.intervalSec, condition: t.condition,
    keyword: t.keyword || '', threshold: t.threshold !== undefined ? String(t.threshold) : '',
    headers: t.headers ? Object.entries(t.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '',
  }
}

function buildTarget(f: FormState): TargetDef {
  const headers: Record<string, string> = {}
  for (const line of f.headers.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) {
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim()
      if (k && v) headers[k] = v
    }
  }
  return {
    id: f.id || uid(),
    name: f.name.trim() || f.url.trim(),
    url: f.url.trim(),
    mode: f.mode,
    selector: f.mode === 'selector' ? f.selector.trim() : undefined,
    regex: f.mode === 'regex' ? f.regex.trim() : undefined,
    jsonPath: f.mode === 'json' ? f.jsonPath.trim() : undefined,
    headers: Object.keys(headers).length ? headers : undefined,
    intervalSec: Math.max(30, Math.floor(f.intervalSec) || 600),
    condition: f.condition,
    keyword: (f.condition === 'contains' || f.condition === 'notContains') ? f.keyword.trim() : undefined,
    threshold: (f.condition === 'lt' || f.condition === 'gt') ? Number(f.threshold) : undefined,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const MODE_FIELD: Record<ExtractMode, { label: string; key: 'selector' | 'regex' | 'jsonPath' | null; placeholder: string } | null> = {
  text: null,
  selector: { label: 'CSS 选择器', key: 'selector', placeholder: '.price 或 a.item@href' },
  regex: { label: '正则表达式', key: 'regex', placeholder: '价格[^0-9]*([0-9.]+)  （捕获组1优先）' },
  json: { label: 'JSON 路径', key: 'jsonPath', placeholder: 'data.items[0].price' },
  headers: null,
}

export default function WatchTab({ snap, reload, showToast, markRead, goFeed }: {
  snap: Snapshot | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
  markRead: () => Promise<void>
  goFeed: () => void
}) {
  const [form, setForm] = useState<FormState | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedDiff, setExpandedDiff] = useState<{ summary: string; diff: DiffOp[]; at: number } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testOut, setTestOut] = useState('')

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))

  const save = async () => {
    if (!form) return
    const t = buildTarget(form)
    const bad = validateTarget(t)
    if (bad) { showToast(bad, true); return }
    try {
      await saveTarget(t)
      await triggerCheck(t.id)
      setForm(null)
      await reload()
      showToast(`已保存「${t.name}」，正在首查…`)
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    }
  }

  const doTest = async () => {
    if (!form) return
    const t = buildTarget(form)
    const bad = validateTarget(t)
    if (bad) { showToast(bad, true); return }
    setTesting(true)
    setTestOut('抓取中…（后台服务原生请求，最长 30 秒）')
    const r = await testFetch({ url: t.url, mode: t.mode, selector: t.selector, regex: t.regex, jsonPath: t.jsonPath })
    setTesting(false)
    setTestOut(r.ok
      ? `✓ 抓取成功（HTTP ${r.status}，${r.elapsedMs}ms），抽取内容预览：\n${(r.text || '(空)').slice(0, 500)}`
      : `✗ ${r.error}`)
  }

  const checkNow = async (id: string) => {
    setBusyId(id)
    try {
      await triggerCheck(id)
      showToast('已触发检查，几秒后刷新可见结果')
      setTimeout(() => { reload(); setBusyId(null) }, 2500)
    } catch (e) {
      showToast(`触发失败：${(e as Error).message}`, true)
      setBusyId(null)
    }
  }

  const togglePause = async (t: TargetDef) => {
    try {
      await saveTarget({ ...t, enabled: !t.enabled })
      await reload()
      showToast(t.enabled ? `已暂停「${t.name}」` : `已恢复「${t.name}」`)
    } catch (e) {
      showToast(`操作失败：${(e as Error).message}`, true)
    }
  }

  const del = async (t: TargetDef) => {
    if (!window.confirm(`删除监控「${t.name}」？其历史事件与快照将一并删除。`)) return
    try {
      await removeTarget(t.id)
      await reload()
      showToast(`已删除「${t.name}」`)
    } catch (e) {
      showToast(`删除失败：${(e as Error).message}`, true)
    }
  }

  const expandDiff = async (t: TargetDef) => {
    if (expanded === t.id) { setExpanded(null); setExpandedDiff(null); return }
    setExpanded(t.id)
    setExpandedDiff(null)
    try {
      const evs: SentinelEvent[] = await loadEvents(1, t.id)
      const ev = evs[0]
      setExpandedDiff(ev && ev.diff && ev.diff.length
        ? { summary: ev.summary, diff: ev.diff, at: ev.at }
        : { summary: '最近一次事件无行级差异（或尚无事件）', diff: [], at: ev?.at || 0 })
    } catch {
      setExpandedDiff({ summary: '事件读取失败', diff: [], at: 0 })
    }
  }

  const checkAll = async () => {
    if (!snap) return
    const ids = snap.rows.filter((r) => r.target.enabled && !snap.settings.pausedAll).map((r) => r.target.id)
    try {
      await Promise.all(ids.map((id) => triggerCheck(id)))
      showToast(`已触发 ${ids.length} 个目标的检查`)
      setTimeout(() => reload(), 2500)
    } catch (e) {
      showToast(`触发失败：${(e as Error).message}`, true)
    }
  }

  const pauseAll = async () => {
    if (!snap) return
    await kvSet(K.settings, { ...snap.settings, pausedAll: !snap.settings.pausedAll })
    await reload()
    showToast(snap.settings.pausedAll ? '已恢复全局调度' : '已全局暂停调度')
  }

  const rows = snap?.rows ?? []

  return (
    <div>
      <div className="ps-sec">
        <i className="ps-bar" />
        监控目标
        <span className="ps-hint">
          {snap?.settings.pausedAll ? '全局已暂停' : `${rows.filter((r) => r.target.enabled).length}/${rows.length} 运行中`}
        </span>
      </div>

      <div className="ps-row" style={{ padding: '0 16px 10px' }}>
        <button className="ps-btn" onClick={() => { setForm(emptyForm()); setTestOut('') }}>＋ 新建监控</button>
        <button className="ps-btn ghost" disabled={!rows.length} onClick={checkAll}>全部检查</button>
        <button className="ps-btn ghost" disabled={!rows.length} onClick={pauseAll}>
          {snap?.settings.pausedAll ? '恢复全局' : '全局暂停'}
        </button>
        {rows.some((r) => r.state?.lastChangeAt) && (
          <button className="ps-btn ghost" onClick={() => { markRead(); goFeed() }}>看动态 →</button>
        )}
      </div>

      {form && (
        <div className="ps-card">
          <div className="ps-card-b">
            <b>{form.id ? '编辑监控' : '新建监控'}</b>
            <label className="ps-lbl">名称</label>
            <input className="ps-inp" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="如：3080 显卡库存 / 某文档更新" />
            <label className="ps-lbl">URL</label>
            <input className="ps-inp" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" />
            <label className="ps-lbl">抓取模式</label>
            <select className="ps-sel" value={form.mode} onChange={(e) => set({ mode: e.target.value as ExtractMode })}>
              {MODE_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label} —— {m.hint}</option>)}
            </select>
            {MODE_FIELD[form.mode] && (
              <>
                <label className="ps-lbl">{MODE_FIELD[form.mode]!.label}</label>
                <input
                  className="ps-inp"
                  value={form[MODE_FIELD[form.mode]!.key as 'selector' | 'regex' | 'jsonPath']}
                  onChange={(e) => set({ [MODE_FIELD[form.mode]!.key as 'selector' | 'regex' | 'jsonPath']: e.target.value } as Partial<FormState>)}
                  placeholder={MODE_FIELD[form.mode]!.placeholder}
                />
              </>
            )}
            <label className="ps-lbl">告警条件</label>
            <select className="ps-sel" value={form.condition} onChange={(e) => set({ condition: e.target.value as WatchCondition })}>
              {CONDITION_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {(form.condition === 'contains' || form.condition === 'notContains') && (
              <>
                <label className="ps-lbl">关键词（大小写不敏感）</label>
                <input className="ps-inp" value={form.keyword} onChange={(e) => set({ keyword: e.target.value })} placeholder="如：现货 / v1.0 / 报名截止" />
              </>
            )}
            {(form.condition === 'lt' || form.condition === 'gt') && (
              <>
                <label className="ps-lbl">数值阈值（取抽取文本中的第一个数字比较）</label>
                <input className="ps-inp" value={form.threshold} onChange={(e) => set({ threshold: e.target.value })} placeholder="如：5000" />
              </>
            )}
            <label className="ps-lbl">检查间隔</label>
            <select className="ps-sel" value={form.intervalSec} onChange={(e) => set({ intervalSec: Number(e.target.value) })}>
              {INTERVAL_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
            <label className="ps-lbl" style={{ cursor: 'pointer' }} onClick={() => set({ headers: form.headers === '' ? 'User-Agent: …\nCookie: …' : '' })}>
              高级：自定义请求头（点击{form.headers ? '收起' : '展开'}）
            </label>
            {form.headers !== '' && (
              <textarea
                className="ps-inp" rows={3}
                value={form.headers}
                onChange={(e) => set({ headers: e.target.value })}
                placeholder={'每行一条，格式 Header-Name: value\n如：Cookie: xxx=yyy'}
              />
            )}
            <div className="ps-actions">
              <button className="ps-btn ghost" disabled={testing} onClick={doTest}>{testing ? <span className="ps-spin" /> : null} 试抓预览</button>
              <button className="ps-btn" onClick={save}>保存并首查</button>
              <button className="ps-btn ghost" onClick={() => { setForm(null); setTestOut('') }}>取消</button>
            </div>
            {testOut && <pre className="ps-diff" style={{ whiteSpace: 'pre-wrap' }}>{testOut}</pre>}
          </div>
        </div>
      )}

      {!rows.length && !form && (
        <div className="ps-empty">
          还没有监控目标。<br />
          点「＋ 新建监控」盯一个网页的价格 / 库存 / 更新；<br />
          也可以直接在聊天里让 AI 帮你加监控。
        </div>
      )}

      {rows.map(({ target: t, state: st }) => {
        const err = st?.status === 'error'
        const paused = !t.enabled || !!snap?.settings.pausedAll
        const dotCls = paused ? 'stale' : err ? 'down' : 'ok'
        return (
          <div className="ps-card" key={t.id}>
            <div className="ps-card-b">
              <div className="ps-row" style={{ flexWrap: 'nowrap' }}>
                <i className={`ps-dot ${dotCls}`} style={{ marginTop: 5 }} />
                <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</b>
                {paused && <span className="ps-badge-txt" style={{ background: '#2a2417', color: '#D29922', borderColor: '#3d3519' }}>已暂停</span>}
                {err && <span className="ps-badge-txt" style={{ background: '#2d1a1e', color: '#F85149', borderColor: '#54262c' }}>出错</span>}
              </div>
              <div className="ps-url">{t.url}</div>
              <div className="ps-row" style={{ marginTop: 6 }}>
                <span className="ps-tag">{modeLabel(t.mode, t)}</span>
                <span className="ps-tag">{conditionLabel(t)}</span>
                <span className="ps-tag">{fmtInterval(t.intervalSec)}</span>
              </div>
              <div className="ps-state">
                <span className="ps-kv">上次检查 <b>{timeAgo(st?.lastCheckedAt)}</b></span>
                {!paused && <span className="ps-kv">· 下次 <b>{inDelta(st?.nextCheckAt)}</b></span>}
                {!!st?.checkCount && <span className="ps-kv">· 已查 <b>{st.checkCount}</b> 次{st.errorCount ? `（错 ${st.errorCount}）` : ''}</span>}
              </div>
              {err && st?.lastError && <div className="ps-sub" style={{ color: '#F85149', marginTop: 4 }}>{st.lastError}</div>}
              {!err && st?.lastEventSummary && (
                <div className="ps-sub" style={{ marginTop: 4 }}>⏱ {st.lastEventSummary}（{timeAgo(st?.lastChangeAt)}）</div>
              )}
              {expanded === t.id && (
                <div className="ps-diff" style={{ whiteSpace: 'pre-wrap' }}>
                  {expandedDiff
                    ? (expandedDiff.diff.length
                      ? expandedDiff.diff.map((d, i) => (
                        <div key={i} className={`ps-dl ${d.kind === '+' ? 'add' : d.kind === '-' ? 'del' : d.kind === '…' ? 'fold' : 'ctx'}`}>
                          {d.kind === '±' ? '≈ ' : d.kind}{d.kind !== ' ' ? '' : ' '}{d.text}
                        </div>
                      ))
                      : `（${expandedDiff.summary}）`)
                    : '读取中…'}
                </div>
              )}
              <div className="ps-actions">
                <button className="ps-btn sm" disabled={busyId === t.id || paused} onClick={() => checkNow(t.id)}>
                  {busyId === t.id ? <span className="ps-spin" /> : null} 立即检查
                </button>
                <button className="ps-btn sm ghost" onClick={() => expandDiff(t)}>{expanded === t.id ? '收起差异' : '最近差异'}</button>
                <button className="ps-btn sm ghost" onClick={() => togglePause(t)}>{t.enabled ? '暂停' : '恢复'}</button>
                <button className="ps-btn sm ghost" onClick={() => { setForm(fromTarget(t)); setTestOut(''); window.scrollTo(0, 0) }}>编辑</button>
                <button className="ps-btn sm danger" onClick={() => del(t)}>删除</button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
