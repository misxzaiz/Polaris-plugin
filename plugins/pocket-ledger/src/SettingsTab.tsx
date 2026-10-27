/**
 * 设置 Tab：分类管理（增删自定义分类）+ 不参与汇总分类 + 分类/总预算 + 导出全部 JSON + 清空
 */
import { useState } from 'react'
import {
  saveSettings, kvKeys, kvDel, kvGet, K, fmtMoney,
  type LedgerSettings, type PanelData,
} from './model'

type Toast = (msg: string, kind?: 'bad' | 'good') => void

export default function SettingsTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: (m?: string) => Promise<PanelData | null>
  showToast: Toast
}) {
  const [newCat, setNewCat] = useState('')
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense')
  const [draftBudgets, setDraftBudgets] = useState<Record<string, string> | null>(null)
  const [draftTotal, setDraftTotal] = useState<string | null>(null)

  if (!data) return <div className="pl-empty">载入中…</div>
  const s = data.settings
  const sym = s.currencySymbol
  const budgets = draftBudgets ?? Object.fromEntries(
    Object.entries(s.budgets || {}).map(([k, v]) => [k, String(v)]),
  )
  const total = draftTotal ?? (s.monthlyTotalBudget != null ? String(s.monthlyTotalBudget) : '')

  const persistBudgets = async (nextBudgets: Record<string, number>, nextTotal: number | null) => {
    await saveSettings({ ...s, budgets: nextBudgets, monthlyTotalBudget: nextTotal })
    await reload()
    showToast('预算已保存（AI 记账也会即时生效）', 'good')
  }

  const commitBudgets = () => {
    const next: Record<string, number> = {}
    for (const [k, v] of Object.entries(budgets)) {
      const n = Number(v)
      if (v !== '' && Number.isFinite(n) && n > 0) next[k] = n
    }
    const t = total.trim() === '' ? null : Number(total)
    void persistBudgets(next, t != null && Number.isFinite(t) && t > 0 ? t : null)
  }

  const addCategory = async () => {
    const name = newCat.trim()
    if (!name) return
    if (newCatType === 'expense') {
      if (s.categories.includes(name)) { showToast('分类已存在', 'bad'); return }
      await saveSettings({ ...s, categories: [...s.categories, name] })
    } else {
      if (s.incomeCategories.includes(name)) { showToast('分类已存在', 'bad'); return }
      await saveSettings({ ...s, incomeCategories: [...s.incomeCategories, name] })
    }
    setNewCat('')
    await reload()
    showToast(`已添加分类「${name}」`, 'good')
  }

  const removeCategory = async (name: string, isIncome: boolean) => {
    const builtin = [...(isIncome ? ['工资', '理财', '红包', '退款', '其他收入'] : ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '人情', '其他'])]
    if (builtin.includes(name)) { showToast('内置分类不可删除', 'bad'); return }
    const exclude = (s.excludeFromStats || []).filter((c) => c !== name)
    if (isIncome) await saveSettings({ ...s, incomeCategories: s.incomeCategories.filter((c) => c !== name), excludeFromStats: exclude })
    else {
      const budgets2 = { ...(s.budgets || {}) }
      delete budgets2[name]
      await saveSettings({ ...s, categories: s.categories.filter((c) => c !== name), budgets: budgets2, excludeFromStats: exclude })
    }
    await reload()
    showToast(`已删除分类「${name}」`)
  }

  /** 切换某分类"不参与汇总"（收入/支出通用；工资典型） */
  const toggleExclude = async (name: string) => {
    const cur = s.excludeFromStats || []
    const next = cur.includes(name) ? cur.filter((c) => c !== name) : [...cur, name]
    await saveSettings({ ...s, excludeFromStats: next })
    await reload()
    showToast(next.includes(name) ? `「${name}」已设为不参与汇总（账单照记，统计排除）` : `「${name}」已恢复参与汇总`, 'good')
  }

  const exportAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith(K.dayPrefix)).sort()
      const dump: { exportedAt: number; settings: LedgerSettings; days: Record<string, unknown> } = {
        exportedAt: Date.now(), settings: s, days: {},
      }
      for (const k of keys) {
        // eslint-disable-next-line no-await-in-loop
        dump.days[k.slice(K.dayPrefix.length)] = await kvGet(k)
      }
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2))
      showToast(`已复制 ${keys.length} 天账目 JSON 到剪贴板`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const clearAll = async () => {
    if (!window.confirm('清空口袋账本全部数据（账单+设置+附件）？不可恢复，建议先导出。')) return
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('ledger.'))
      await Promise.all(keys.map((k) => kvDel(k)))
      await reload()
      showToast('已清空全部账本数据')
    } catch (e) {
      showToast(`清空失败：${(e as Error).message}`, 'bad')
    }
  }

  const excluded = s.excludeFromStats || []
  const excludeChip = (c: string, isIncome: boolean) => (
    <span key={c} className={`pl-chip ${excluded.includes(c) ? 'on' : ''}`} onClick={() => toggleExclude(c)} title="点击切换：账单照记、明细照见，但统计/结余/排行不计入">
      {excluded.includes(c) ? '⊘ ' : ''}{c}
    </span>
  )

  return (
    <div>
      <div className="pl-sec"><i className="pl-bar" />支出分类<span className="pl-hint">{s.categories.length} 个</span></div>
      <div className="pl-card">
        <div className="pl-card-b">
          <div className="pl-row">
            {s.categories.map((c) => (
              <span key={c} className="pl-chip" style={{ paddingRight: 6 }}>
                {c}
                <button
                  onClick={() => removeCategory(c, false)}
                  style={{ background: 'none', border: 'none', color: '#5C6678', cursor: 'pointer', padding: '0 2px', fontSize: 11 }}
                >×</button>
              </span>
            ))}
          </div>
          <div className="pl-row" style={{ marginTop: 10 }}>
            <input className="pl-inp" style={{ maxWidth: 140 }} value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新分类名" />
            <button className="pl-btn sm" onClick={addCategory}>添加{newCatType === 'income' ? '收入类' : '支出类'}</button>
            <button className={`pl-chip ${newCatType === 'income' ? 'on' : ''}`} onClick={() => setNewCatType(newCatType === 'income' ? 'expense' : 'income')}>
              {newCatType === 'income' ? '收 → 支' : '支 → 收'}
            </button>
          </div>
          <div className="pl-sub" style={{ marginTop: 8 }}>收入分类：{s.incomeCategories.join(' / ')}</div>
        </div>
      </div>

      <div className="pl-sec"><i className="pl-bar" />不参与汇总<span className="pl-hint">点击切换，如工资</span></div>
      <div className="pl-card">
        <div className="pl-card-b">
          <div className="pl-sub" style={{ marginBottom: 8 }}>设为"不参与汇总"的分类，账单照记、明细照见，但统计/结余/分类排行/逐日趋势全部不计入（避免工资虚高结余）。</div>
          <div className="pl-row">
            {s.categories.map((c) => excludeChip(c, false))}
            {s.incomeCategories.map((c) => excludeChip(c, true))}
          </div>
        </div>
      </div>

      <div className="pl-sec"><i className="pl-bar" />月预算<span className="pl-hint">AI 记账会即时提醒</span></div>
      <div className="pl-card">
        <div className="pl-card-b" style={{ padding: 0 }}>
          {s.categories.map((c) => (
            <div className="pl-field" key={c}>
              <div className="pl-field-l"><b>{c}</b><small>月预算（留空不限制）</small></div>
              <input
                className="pl-num" inputMode="decimal" placeholder="不限"
                value={budgets[c] ?? ''}
                onChange={(e) => setDraftBudgets({ ...budgets, [c]: e.target.value })}
              />
            </div>
          ))}
          <div className="pl-field">
            <div className="pl-field-l"><b>月度总预算</b><small>所有支出合计的上限</small></div>
            <input
              className="pl-num" inputMode="decimal" placeholder="不限"
              value={total}
              onChange={(e) => setDraftTotal(e.target.value)}
            />
          </div>
          <div className="pl-actions" style={{ padding: '10px 13px' }}>
            <button className="pl-btn sm" onClick={commitBudgets}>保存预算</button>
            <span className="pl-sub">示例：餐饮 2000 = 每月餐饮到 {fmtMoney(2000, sym)} 提醒</span>
          </div>
        </div>
      </div>

      <div className="pl-sec"><i className="pl-bar" />数据</div>
      <div className="pl-card">
        <div className="pl-card-b">
          <div className="pl-state pl-sub">账本完全存于本机（cap.kv ledger.*），不出设备；AI 与面板读写同一份。</div>
          <div className="pl-actions">
            <button className="pl-btn sm ghost" onClick={exportAll}>导出全部 JSON</button>
            <button className="pl-btn sm danger" onClick={clearAll}>清空账本</button>
          </div>
        </div>
      </div>

      <div className="pl-sec"><i className="pl-bar" />关于</div>
      <div className="pl-card">
        <div className="pl-card-b pl-sub">
          口袋账本 pocket-ledger v0.2.0 —— 对话式记账：聊天里说"午饭 35"就入账，"上月咖啡花了多少"就能查。
          <br />· 零后台服务、零网络请求，纯本地账本（插件规范推荐的无状态模式）；
          <br />· 支持"不参与汇总"分类（如工资）与附件（小票/截图，点开才取，默认不拉图）；
          <br />· 面板与 AI（MCP）走同一套计算核心，口径永远一致；
          <br />· 桌面与手机 Web 经 cap.kv 看到同一本账；双端同时记账的合并按账单 id 幂等去重。
        </div>
      </div>
    </div>
  )
}
