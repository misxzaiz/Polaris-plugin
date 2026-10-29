/**
 * 设置 Tab：导出（CSV/JSON 剪贴板）+ 导入 JSON（粘贴解析、判重、逐条校验）+ 清空
 */
import { useState } from 'react'
import {
  toCsv, normalizeImport, kvSet, kvKeys, kvDel, K,
  type PanelData,
} from './model'
import type { Toast } from './Panel'

export default function SettingsTab({ data, reload, showToast }: {
  data: PanelData | null
  reload: () => Promise<PanelData | null>
  showToast: Toast
}) {
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)
  const [clearArmed, setClearArmed] = useState(false)

  if (!data) return <div className="gz-empty">载入中…</div>
  const count = data.works.length

  const exportCsv = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(data.works))
      showToast(`已复制 ${count} 条记录 CSV（可直接粘贴进 Excel）`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const exportJson = async () => {
    try {
      const dump = JSON.stringify({ exportedAt: Date.now(), works: data.works }, null, 2)
      await navigator.clipboard.writeText(dump)
      showToast(`已复制 ${count} 条记录 JSON`, 'good')
    } catch (e) {
      showToast(`导出失败：${(e as Error).message}`, 'bad')
    }
  }

  const doImport = async () => {
    if (busy) return
    let parsed: unknown
    try {
      parsed = JSON.parse(importText)
    } catch (e) {
      showToast(`JSON 解析失败：${(e as Error).message}`, 'bad')
      return
    }
    // 接受两种形态：记录数组，或 { works: [...] } 导出 dump
    const list: unknown = Array.isArray(parsed) ? parsed : (parsed as { works?: unknown })?.works
    if (!Array.isArray(list)) {
      showToast('导入内容需为记录数组或导出 dump（{works:[…]}）', 'bad')
      return
    }
    setBusy(true)
    try {
      const norm = normalizeImport(list, data.works)
      if (norm.error) { showToast(norm.error, 'bad'); return }
      for (const w of norm.accepted || []) {
        // eslint-disable-next-line no-await-in-loop
        await kvSet(K.work(w.id), w)
      }
      const rej = norm.rejected || []
      showToast(`导入 ${norm.accepted?.length || 0} 条${norm.duplicates ? `，判重跳过 ${norm.duplicates}` : ''}${rej.length ? `，拒绝 ${rej.length}（如：${rej[0].error}）` : ''}`, rej.length && !norm.accepted?.length ? 'bad' : 'good')
      setImportText('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    try {
      const keys = (await kvKeys()).filter((k) => k.startsWith('guanzhi.'))
      for (const k of keys) {
        // eslint-disable-next-line no-await-in-loop
        await kvDel(k)
      }
      await reload()
      showToast('已清空全部书影音账本数据')
    } catch (e) {
      showToast(`清空失败：${(e as Error).message}`, 'bad')
    }
  }

  return (
    <>
      <div className="gz-sec"><span className="gz-bar" />导出<span className="gz-hint">复制到剪贴板</span></div>
      <div className="gz-card">
        <div className="gz-card-b" style={{ display: 'flex', gap: 8 }}>
          <button className="gz-btn sm ghost" onClick={exportCsv}>复制 CSV（{count} 条）</button>
          <button className="gz-btn sm ghost" onClick={exportJson}>复制 JSON</button>
        </div>
      </div>

      <div className="gz-sec"><span className="gz-bar" />导入 JSON<span className="gz-hint">书影音账本导出格式；同体裁同名同年判重</span></div>
      <div className="gz-card">
        <div className="gz-card-b">
          <textarea
            className="gz-inp gz-ta"
            value={importText}
            placeholder='粘贴记录数组，如 [{"title":"三体","kind":"book","status":"done","rating":9.5}]'
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="gz-form-actions">
            <button className="gz-btn" disabled={busy || !importText.trim()} onClick={doImport}>解析并导入</button>
          </div>
        </div>
      </div>

      <div className="gz-sec"><span className="gz-bar" />数据<span className="gz-hint">纯本地 cap.kv · 不出设备</span></div>
      <div className="gz-card">
        <div className="gz-card-b">
          {clearArmed ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="gz-btn sm danger" onClick={async () => {
                if (window.confirm('再次确认：清空书影音账本全部数据？不可恢复。')) {
                  setClearArmed(false)
                  await clearAll()
                } else setClearArmed(false)
              }}>确认清空（{count} 条记录）</button>
              <button className="gz-btn sm ghost" onClick={() => setClearArmed(false)}>算了</button>
            </div>
          ) : (
            <button className="gz-btn sm danger" onClick={() => setClearArmed(true)}>清空全部数据</button>
          )}
          <small className="gz-sub" style={{ display: 'block', marginTop: 6 }}>
            账本与设置一并删除，不可恢复；建议先复制 JSON 备份。键空间 {K.workPrefix}* 与 {K.settings}。
          </small>
        </div>
      </div>
    </>
  )
}
