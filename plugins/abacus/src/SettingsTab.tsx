/**
 * 设置 Tab：价目表编辑（核心）+ 数据源开关 + 汇率/扫描节奏 + 重扫与价目同步 + 口径说明
 */
import { useState } from 'react'
import type { PanelData, Prices, AbacusSettings } from './model'
import { DEFAULT_PRICES } from './model'

interface Ctx { data: PanelData; refresh: () => Promise<void>; showToast: (t: string, k?: 'good' | 'bad' | '') => void }

interface Props {
  ctx: Ctx
  busy: string
  onCmd: (op: 'rescan' | 'sync_prices', waitMs: number, doing: string) => Promise<void>
  onSaveSettings: (s: AbacusSettings) => Promise<void>
  defaults: AbacusSettings
}

function PriceEditor({ data, ctx }: { data: PanelData; ctx: Ctx }) {
  const [draft, setDraft] = useState<Prices>(() => JSON.parse(JSON.stringify(data.prices)) as Prices)
  const [dirty, setDirty] = useState(false)
  const [newModel, setNewModel] = useState('')

  const setField = (model: string, field: 'in' | 'cacheRead' | 'cacheWrite' | 'out', v: string) => {
    const next = { ...draft }
    const row = { ...(next[model] || { in: 0, cacheRead: 0, cacheWrite: 0, out: 0 }) }
    const n = Number(v)
    row[field] = v === '' ? 0 : (Number.isFinite(n) ? n : row[field])
    next[model] = row
    setDraft(next)
    setDirty(true)
  }

  const addModel = () => {
    const m = newModel.trim()
    if (!m || draft[m]) return
    setDraft({ ...draft, [m]: { in: 0, cacheRead: 0, cacheWrite: 0, out: 0, preset: false, source: 'manual' } })
    setNewModel('')
    setDirty(true)
  }

  const delModel = (m: string) => {
    const next = { ...draft }
    delete next[m]
    setDraft(next)
    setDirty(true)
  }

  const save = async () => {
    try {
      await ctx.refresh() // 先拿最新数据（避免覆盖 sync 结果）
      const { savePrices } = await import('./model')
      await savePrices(draft)
      setDirty(false)
      ctx.showToast('价目表已保存（服务 30s 内热加载并重算）', 'good')
    } catch (e) {
      ctx.showToast(e instanceof Error ? e.message : '保存失败', 'bad')
    }
  }

  const unpricedModels = new Set((data.models || []).filter((m) => m.priced === 0 && m.model !== '(未记录)').map((m) => m.model))
  const rows = Object.entries(draft).sort((a, b) => {
    const ua = unpricedModels.has(a[0]) ? 0 : 1
    const ub = unpricedModels.has(b[0]) ? 0 : 1
    return ua - ub || a[0].localeCompare(b[0])
  })

  return (
    <div className="ab-card">
      <div className="ab-card-b">
        <div className="ab-row" style={{ marginBottom: 8 }}>
          <input className="ab-inp" style={{ flex: 1, minWidth: 120 }} placeholder="新增模型名（与台账一致，如 sensenova-6.8-flash-lite）" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
          <button className="ab-btn ghost sm" onClick={addModel} disabled={!newModel.trim()}>＋添加</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ab-table">
            <thead>
              <tr>
                <th>模型</th>
                <th style={{ width: 64 }}>输入</th>
                <th style={{ width: 64 }}>缓存读</th>
                <th style={{ width: 64 }}>缓存写</th>
                <th style={{ width: 64 }}>输出</th>
                <th style={{ width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(([model, p]) => (
                <tr key={model}>
                  <td>
                    {model}
                    {unpricedModels.has(model) && <span className="ab-tag amber" style={{ marginLeft: 4 }}>台账在用</span>}
                    {p.preset && <span className="ab-tag" style={{ marginLeft: 4 }}>预设</span>}
                    {p.source === 'litellm' && <span className="ab-tag green" style={{ marginLeft: 4 }}>LiteLLM</span>}
                  </td>
                  {(['in', 'cacheRead', 'cacheWrite', 'out'] as const).map((f) => (
                    <td key={f}>
                      <input
                        className="ab-inp"
                        style={{ padding: '3px 6px', fontSize: 11, textAlign: 'right' }}
                        value={String(p[f] ?? 0)}
                        onChange={(e) => setField(model, f, e.target.value)}
                        inputMode="decimal"
                      />
                    </td>
                  ))}
                  <td><button className="ab-btn danger sm" onClick={() => delModel(model)} title="删除该价目">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ab-row" style={{ marginTop: 8 }}>
          <button className="ab-btn" onClick={save} disabled={!dirty}>{dirty ? '保存价目表' : '已保存'}</button>
          <span className="ab-sub">单位：USD / 百万 token。预设值为占位牌价，请按你的实际供应商账单修正。</span>
        </div>
      </div>
    </div>
  )
}

export default function SettingsTab({ ctx, busy, onCmd, onSaveSettings, defaults }: Props) {
  const { data } = ctx
  const s = data.settings
  const meta = data.meta
  const [fx, setFx] = useState(String(s.fxRate))
  const [autoMin, setAutoMin] = useState(String(s.autoRescanMin))
  const [sources, setSources] = useState({ ...s.sources })

  const persist = (nextSources: { zcode: boolean; claude: boolean; polaris: boolean }, nextFx: number, nextAuto: number) => {
    onSaveSettings({ ...s, sources: nextSources, fxRate: nextFx, autoRescanMin: nextAuto })
  }

  const toggleSource = (key: 'zcode' | 'claude' | 'polaris') => {
    const next = { ...sources, [key]: !sources[key] }
    setSources(next)
    persist(next, Number(fx) || defaults.fxRate, Number(autoMin) || defaults.autoRescanMin)
  }

  const applyNumbers = () => {
    persist(sources, Number(fx) || defaults.fxRate, Math.max(1, Number(autoMin) || defaults.autoRescanMin))
  }

  const srcInfo = (key: 'zcode' | 'claude' | 'polaris') => {
    const st = meta && meta.sources && meta.sources[key]
    if (!st) return '未扫描'
    if (key === 'zcode') return `${st.ok === true ? '正常' : st.ok === false ? '异常' : '待扫'}${st.sqlite === false ? ' · node:sqlite 不可用' : ''}`
    if (key === 'claude') return `${st.ok === true ? '正常' : '待扫'} · ${st.files ?? 0} 文件（本轮解析 ${st.scanned ?? 0}）`
    return `${st.ok === true ? '正常' : '待扫'} · ${st.files ?? 0} 会话文件（含 tokenUsage ${st.withTU ?? 0}）`
  }

  return (
    <div>
      <div className="ab-sec"><i className="ab-bar" />价目表<small className="ab-hint">USD / 百万 token</small></div>
      <PriceEditor data={data} ctx={ctx} />

      <div className="ab-sec"><i className="ab-bar" />数据源<small className="ab-hint">全部只读，关闭只影响采集范围</small></div>
      <div className="ab-card"><div className="ab-card-b">
        {(['zcode', 'claude', 'polaris'] as const).map((key) => (
          <div key={key} className="ab-insight info">
            <span className="ic">
              <button
                className={`ab-btn sm ${sources[key] ? '' : 'ghost'}`}
                style={sources[key] ? { background: '#2b4a35' } : {}}
                onClick={() => toggleSource(key)}
              >{sources[key] ? '开' : '关'}</button>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 12 }}>{key}</b>
              <small style={{ display: 'block', color: '#5C6678', fontSize: 10.5 }}>{srcInfo(key)}</small>
            </div>
          </div>
        ))}
      </div></div>

      <div className="ab-sec"><i className="ab-bar" />显示与节奏</div>
      <div className="ab-card"><div className="ab-card-b">
        <label className="ab-lbl">汇率 USD→CNY（仅显示折算）</label>
        <div className="ab-row">
          <input className="ab-inp" style={{ width: 100 }} value={fx} onChange={(e) => setFx(e.target.value)} inputMode="decimal" />
          <button className="ab-btn ghost sm" onClick={applyNumbers}>保存</button>
        </div>
        <label className="ab-lbl">自动增量扫描间隔（分钟）</label>
        <div className="ab-row">
          <input className="ab-inp" style={{ width: 100 }} value={autoMin} onChange={(e) => setAutoMin(e.target.value)} inputMode="numeric" />
          <button className="ab-btn ghost sm" onClick={applyNumbers}>保存</button>
        </div>
      </div></div>

      <div className="ab-sec"><i className="ab-bar" />操作</div>
      <div className="ab-card"><div className="ab-card-b">
        <div className="ab-row">
          <button className="ab-btn ghost" disabled={!!busy} onClick={() => onCmd('rescan', 180000, '全量重扫（首次较慢）')}>
            {busy === 'rescan' ? '重扫中…' : '立即全量重扫'}
          </button>
          <button className="ab-btn ghost" disabled={!!busy} onClick={() => onCmd('sync_prices', 60000, '同步 LiteLLM 价目')}>
            {busy === 'sync_prices' ? '同步中…' : '从 LiteLLM 同步价目'}
          </button>
        </div>
        <div className="ab-sub" style={{ marginTop: 8 }}>
          同步只针对你台账中出现过的模型，按其公开价目（USD）覆盖对应行；不会把整张社区价目表灌进来。
          这是本插件唯一的外网请求（服务进程发起、仅限配置的 https 公网 URL）。
        </div>
        {meta && meta.lastError ? <div className="ab-sub" style={{ color: '#FF8A9A', marginTop: 6 }}>最近异常：{meta.lastError}</div> : null}
      </div></div>

      <div className="ab-sec"><i className="ab-bar" />口径说明（为什么两边的「输入」不一样）</div>
      <div className="ab-card"><div className="ab-card-b ab-caliber">
        三种来源的 input_tokens 语义不同，AI 用量账在计价前已显式归一（详见 plans spec 与 README）：
        <br />• <code>zcode</code>：input <b>含</b>缓存读/写 → 全价输入 = input − cacheRead − cacheWrite
        <br />• <code>claude</code>：input <b>不含</b>缓存（Anthropic API 惯例）→ 全价输入 = input
        <br />• <code>polaris</code>：input <b>不含</b>缓存（宿主网关语义），costUsd 直接采用宿主网关结算值
        {meta && meta.caliber ? (
          <>
            <br />{Object.entries(meta.caliber).map(([k, v]) => <span key={k} style={{ display: 'block', marginTop: 4 }}><code>{k}</code> {v}</span>)}
          </>
        ) : null}
      </div></div>
    </div>
  )
}
