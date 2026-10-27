/**
 * 设置 Tab：每日限额 + 牌组管理 + 导入/导出/清空 + AI 制卡指南 + 关于。
 */
import { useState } from 'react'
import {
  copyText, deleteDeck, ensureDeck, importFromJson, saveSettings, toCsv, toJsonExport, wipeAll,
  type Snapshot,
} from './model'

type Toast = (msg: string, kind?: 'bad' | 'good') => void

const AI_GUIDE = [
  '在 Polaris 聊天里对 AI 说一句话即可制卡/复习，常用句式：',
  '· 「把这段内容做成卡片，放进「Rust 所有权」牌组」',
  '· 「https://… 这篇文章提炼 15 张卡」（AI 会先抓正文再制卡）',
  '· 「出 10 张英语词汇卡：abandon / terse / pragmatic …」',
  '· 「今天该复习什么？」→ AI 出题，你口头作答，AI 帮你评分',
  '· 「记忆熔炉现在什么情况？」→ 到期/留存/连击一览',
].join('\n')

export default function SettingsTab({ snap, reload, showToast }: {
  snap: Snapshot | null
  reload: () => Promise<Snapshot | null>
  showToast: Toast
}) {
  const [draftNew, setDraftNew] = useState<string | null>(null)
  const [draftReview, setDraftReview] = useState<string | null>(null)
  const [newDeckName, setNewDeckName] = useState('')
  const [importText, setImportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!snap) return <div className="mf-empty">载入中…</div>
  const s = snap.settings
  const draftNewVal = draftNew ?? String(s.dailyNewLimit)
  const draftReviewVal = draftReview ?? String(s.dailyReviewLimit)

  const saveLimits = async () => {
    const n = Math.max(0, Math.round(Number(draftNewVal) || 0))
    const r = Math.max(0, Math.round(Number(draftReviewVal) || 0))
    await saveSettings({ ...s, dailyNewLimit: n, dailyReviewLimit: r })
    await reload()
    showToast('每日限额已保存', 'good')
  }

  const addDeck = async () => {
    const name = newDeckName.trim()
    if (!name) return
    await ensureDeck(name)
    setNewDeckName('')
    await reload()
    showToast(`牌组「${name}」已就绪`, 'good')
  }

  const removeDeck = async (id: string, name: string) => {
    if (!window.confirm(`删除牌组「${name}」？（仅允许删除空牌组）`)) return
    const r = await deleteDeck(id)
    if (!r.ok) { showToast(r.error || '删除失败', 'bad'); return }
    await reload()
    showToast('牌组已删除', 'good')
  }

  const exportJson = async () => {
    try {
      await copyText(JSON.stringify(toJsonExport(snap.cards, snap.decks, snap.settings, snap.meta), null, 2))
      showToast(`已复制 ${snap.cards.length} 张卡 JSON 到剪贴板`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const exportCsv = async () => {
    try {
      await copyText(toCsv(snap.cards, snap.decks))
      showToast(`已复制 ${snap.cards.length} 张卡 CSV 到剪贴板`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const doImport = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await importFromJson(importText)
      setImportText('')
      setImportOpen(false)
      await reload()
      showToast(`导入 ${r.imported} 张${r.failed ? `，失败 ${r.failed} 张（${r.problems[0] || ''}）` : ''}`, r.failed ? 'bad' : 'good')
    } catch (e) {
      showToast(`导入失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    if (!window.confirm('清空记忆熔炉全部数据（卡片+牌组+设置+连击）？不可恢复，建议先导出。')) return
    try {
      const n = await wipeAll()
      await reload()
      showToast(`已清空 ${n} 个数据键`)
    } catch (e) {
      showToast(`清空失败：${(e as Error).message}`, 'bad')
    }
  }

  return (
    <div>
      <div className="mf-sec"><i className="mf-bar" />每日限额<span className="mf-hint">AI 制卡与面板共用</span></div>
      <div className="mf-card">
        <div className="mf-card-b" style={{ padding: 0 }}>
          <div className="mf-field">
            <div className="mf-field-l"><b>新卡上限</b><small>每天最多学几张新卡（0 = 停发新卡）</small></div>
            <input className="mf-num" inputMode="numeric" value={draftNewVal} onChange={(e) => setDraftNew(e.target.value)} />
          </div>
          <div className="mf-field">
            <div className="mf-field-l"><b>复习上限</b><small>每天最多复习几张（0 = 不设上限，到期全出）</small></div>
            <input className="mf-num" inputMode="numeric" value={draftReviewVal} onChange={(e) => setDraftReview(e.target.value)} />
          </div>
          <div className="mf-actions" style={{ padding: '10px 13px' }}>
            <button className="mf-btn sm" onClick={() => void saveLimits()}>保存限额</button>
            <span className="mf-sub">今日已：新 {snap.stats.today.newCards} / 复习 {snap.stats.today.reviews}</span>
          </div>
        </div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />牌组<span className="mf-hint">{snap.decks.length} 个</span></div>
      <div className="mf-card">
        <div className="mf-card-b" style={{ padding: 0 }}>
          {snap.stats.byDeck.filter((d) => d.total > 0).map((d) => (
            <div className="mf-field" key={d.id}>
              <div className="mf-field-l"><b>{d.name}</b><small>{d.total} 张 · 到期 {d.due} · 新 {d.fresh}</small></div>
              {d.id !== 'default' && (
                <button className="mf-btn sm danger" onClick={() => void removeDeck(d.id, d.name)}>删除</button>
              )}
            </div>
          ))}
          {snap.decks.length === 0 && <div className="mf-field"><span className="mf-sub">还没有牌组（导入卡片时写牌组名会自动创建）</span></div>}
          <div className="mf-actions" style={{ padding: '10px 13px' }}>
            <input className="mf-inp" style={{ maxWidth: 160 }} value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} placeholder="新牌组名" />
            <button className="mf-btn sm" disabled={!newDeckName.trim()} onClick={() => void addDeck()}>创建</button>
          </div>
        </div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />数据<span className="mf-hint">只存本机 cap.kv，不出设备</span></div>
      <div className="mf-card">
        <div className="mf-card-b">
          <div className="mf-actions">
            <button className="mf-btn sm ghost" onClick={() => void exportJson()}>导出 JSON（剪贴板）</button>
            <button className="mf-btn sm ghost" onClick={() => void exportCsv()}>导出 CSV（剪贴板）</button>
            <button className="mf-btn sm ghost" onClick={() => setImportOpen(!importOpen)}>导入 JSON</button>
            <button className="mf-btn sm danger" onClick={() => void clearAll()}>清空全部</button>
          </div>
          {importOpen && (
            <div style={{ marginTop: 9 }}>
              <textarea
                className="mf-txa"
                style={{ minHeight: 90 }}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='粘贴导出的 JSON（含 cards 数组）；也支持 {cards:[{front,back,deckName?,tags?}]} 简式'
              />
              <div className="mf-actions">
                <button className="mf-btn sm" disabled={!importText.trim() || busy} onClick={() => void doImport()}>导入</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />AI 制卡指南</div>
      <div className="mf-card">
        <div className="mf-card-b mf-sub" style={{ whiteSpace: 'pre-wrap' }}>{AI_GUIDE}</div>
      </div>

      <div className="mf-sec"><i className="mf-bar" />关于</div>
      <div className="mf-card">
        <div className="mf-card-b mf-sub">
          记忆熔炉 memoryforge v0.1.0 —— 把读过的、聊过的、学过的，炼成记得住的。
          <br />· AI 对话式制卡（MCP 工具）+ 面板 SM-2 间隔重复复习；
          <br />· 面板与 AI 走同一计算核心（shared/srs-core），调度口径永远一致；
          <br />· 网页抓取由 MCP 进程原生执行，绕开浏览器同源限制（面板零跨域请求）；
          <br />· 数据在 cap.kv memoryforge.*，桌面与手机 Web 同步同一副牌。
        </div>
      </div>
    </div>
  )
}
