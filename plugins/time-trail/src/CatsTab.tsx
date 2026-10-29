/**
 * 分类 Tab：七类图例 + 用户规则管理（exact/prefix）+ 未分类应用快归 + AI 归类
 *
 * timetrail.cats 写者：面板与 MCP（都是用户代理，最后写胜出；服务不写此键）。
 * 分类是读取时套用的视图——规则改动对全部历史即时生效，无需重算。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  aggregateDays, displayName, fmtDur, isKnownApp, loadDays, loadCats, saveCats,
  CATEGORIES, CAT_IDS, type CatRule, type PanelData,
} from './model'
import type { Toast } from './Panel'

export default function CatsTab({ pluginId, data, reload, showToast, onSendToChat }: {
  pluginId: string
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [rules, setRules] = useState<CatRule[]>([])
  const [unknown, setUnknown] = useState<{ app: string; sec: number }[] | null>(null)
  const [newMatch, setNewMatch] = useState('')
  const [newKind, setNewKind] = useState<'exact' | 'prefix'>('exact')
  const [newCat, setNewCat] = useState('dev')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadCats().then(setRules).catch(() => {})
  }, [])

  const refreshUnknown = useCallback(async () => {
    try {
      const [days, currentRules] = await Promise.all([loadDays(7), loadCats()])
      const agg = aggregateDays(days, currentRules)
      const list = Object.entries(agg.byApp)
        .filter(([app]) => !isKnownApp(app, currentRules))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([app, sec]) => ({ app, sec }))
      setUnknown(list)
    } catch (e) {
      showToast(`加载未分类清单失败：${(e as Error).message}`, true)
    }
  }, [showToast])

  useEffect(() => { refreshUnknown() }, [refreshUnknown])

  const persist = useCallback(async (next: CatRule[]) => {
    setBusy(true)
    try {
      await saveCats(next)
      setRules(next)
      await Promise.all([reload(), refreshUnknown()])
      showToast('规则已保存，历史即时生效')
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, true)
    } finally {
      setBusy(false)
    }
  }, [reload, refreshUnknown, showToast])

  const addRule = useCallback(async () => {
    const match = newMatch.trim().toLowerCase()
    if (!match) { showToast('请输入进程名（如 code）', true); return }
    if (rules.some((r) => r.kind === newKind && r.match === match)) {
      showToast('规则已存在', true)
      return
    }
    await persist([...rules, { match, kind: newKind, cat: newCat }])
    setNewMatch('')
  }, [newMatch, newKind, newCat, rules, persist, showToast])

  const quickAssign = useCallback(async (app: string, cat: string) => {
    await persist([...rules.filter((r) => !(r.kind === 'exact' && r.match === app)), { match: app, kind: 'exact', cat }])
  }, [rules, persist])

  const aiClassify = useCallback(() => {
    if (!unknown || !unknown.length) return
    const list = unknown.slice(0, 20).map((u) => `${u.app}（${displayName(u.app)}，${fmtDur(u.sec)}）`).join('、')
    const msg = `请用 timetrail_apps(unknownOnly=true) 和 timetrail_set_categories 帮我把时间统计里这些未分类应用归类（七类：dev/create/meet/browse/media/play/other）：${list}。归类时给出你的理由。`
    if (onSendToChat) {
      onSendToChat(msg)
      showToast('已发送到聊天，等 AI 归类')
    } else {
      showToast('宿主不支持发送到聊天', true)
    }
  }, [unknown, onSendToChat, showToast])

  const countsByCat = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rules) m[r.cat] = (m[r.cat] || 0) + 1
    return m
  }, [rules])

  return (
    <>
      <div className="tt-card">
        <div className="tt-card-h">七类 <small>内置规则自动覆盖常见应用</small></div>
        <div className="tt-card-b">
          {CAT_IDS.map((cat) => {
            const meta = CATEGORIES[cat]
            return (
              <div className="tt-catrow" key={cat}>
                <span className="sw" style={{ background: meta.color }} />
                <span>{meta.emoji}</span>
                <span className="nm">{meta.label}<span style={{ color: '#5C6678', fontSize: 10 }}>（{cat}）</span></span>
                <span className="tt-sub">{countsByCat[cat] ? `自定义 ${countsByCat[cat]} 条` : ''}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">未分类应用 <small>最近 7 天</small></div>
        <div className="tt-card-b">
          {unknown === null && <div className="tt-empty">加载中…</div>}
          {unknown && unknown.length === 0 && <div className="tt-empty">最近 7 天没有未分类应用 🎉</div>}
          {unknown && unknown.length > 0 && (
            <>
              {unknown.map((u) => (
                <div className="tt-rule" key={u.app}>
                  <span className="m" title={u.app}>{displayName(u.app)}<span style={{ color: '#5C6678' }}>（{u.app}）</span></span>
                  <span className="k">{fmtDur(u.sec)}</span>
                  <select
                    className="tt-sel"
                    value=""
                    disabled={busy}
                    onChange={(e) => { if (e.target.value) quickAssign(u.app, e.target.value) }}
                  >
                    <option value="">归入…</option>
                    {CAT_IDS.map((cat) => <option key={cat} value={cat}>{CATEGORIES[cat].emoji} {CATEGORIES[cat].label}</option>)}
                  </select>
                </div>
              ))}
              <div className="tt-addrow">
                <button className="tt-btn ghost" disabled={busy || !onSendToChat} onClick={aiClassify}>
                  🤖 让 AI 批量归类
                </button>
                <button className="tt-btn ghost" disabled={busy} onClick={() => refreshUnknown()}>刷新</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="tt-card">
        <div className="tt-card-h">自定义规则 <small>{rules.length} 条</small></div>
        <div className="tt-card-b">
          {rules.length === 0 && <div className="tt-empty">暂无自定义规则</div>}
          {rules.map((r, i) => (
            <div className="tt-rule" key={`${r.kind}:${r.match}`}>
              <span className="m">{r.match}</span>
              <span className="k">{r.kind === 'prefix' ? '前缀' : '精确'}</span>
              <select
                className="tt-sel"
                value={r.cat}
                disabled={busy}
                onChange={(e) => {
                  const next = [...rules]
                  next[i] = { ...r, cat: e.target.value }
                  persist(next)
                }}
              >
                {CAT_IDS.map((cat) => <option key={cat} value={cat}>{CATEGORIES[cat].emoji} {CATEGORIES[cat].label}</option>)}
              </select>
              <button
                className="tt-btn danger sm"
                disabled={busy}
                onClick={() => persist(rules.filter((_, j) => j !== i))}
              >删</button>
            </div>
          ))}
          <div className="tt-addrow">
            <input
              className="tt-inp"
              placeholder="进程名（code / idea64*用前缀）"
              value={newMatch}
              onChange={(e) => setNewMatch(e.target.value)}
            />
            <select className="tt-sel" value={newKind} onChange={(e) => setNewKind(e.target.value as 'exact' | 'prefix')}>
              <option value="exact">精确</option>
              <option value="prefix">前缀</option>
            </select>
            <select className="tt-sel" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              {CAT_IDS.map((cat) => <option key={cat} value={cat}>{CATEGORIES[cat].label}</option>)}
            </select>
            <button className="tt-btn sm" disabled={busy} onClick={addRule}>添加</button>
          </div>
          <div className="tt-sub" style={{ paddingTop: 6 }}>
            规则匹配小写进程名；「前缀」匹配以输入开头的任意应用（如 minecraft* 系列启动器）。改动对全部历史生效。
          </div>
        </div>
      </div>
    </>
  )
}
