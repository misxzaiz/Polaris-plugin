/**
 * 设置 Tab：简历版本库 / 参数 / 数据（CSV 导出导入、JSON 备份还原）。
 * 公司库不单列管理（公司随投递建档/删投递时空公司可在数据页清理）。
 */
import { useRef, useState } from 'react'
import * as core from '../shared/core.js'
import {
  applyBackup, applyImport, deleteResumeWithRefs, downloadText,
  saveResume, saveSettings,
  type Resume, type WenData,
} from './model'

function ResumeRow({ r, apps, appsCount, reload, toast }: {
  r: Resume
  apps: WenData['apps']
  appsCount: number
  reload: () => Promise<WenData | null>
  toast: (m: string, bad?: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(r.label)
  const [content, setContent] = useState(r.content)
  const [note, setNote] = useState(r.note)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await saveResume({ label: r.label, content, note }, r) // label 不允许改（保护引用）
      toast('简历版本已保存')
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  const del = async () => {
    try {
      const n = await deleteResumeWithRefs(r, apps)
      toast(`已删除（解除 ${n} 条引用）`)
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #1c2230' }}>
      <div className="wj-row">
        <span className="wj-tag purple">{r.label}</span>
        <span className="wj-sub">{r.content ? `${r.content.length} 字` : '无正文'} · 被 {appsCount} 条投递引用</span>
        <span style={{ flex: 1 }} />
        <button className="wj-btn sm ghost" onClick={() => setOpen(!open)}>{open ? '收起' : '编辑'}</button>
      </div>
      {open ? (
        <div style={{ marginTop: 8 }}>
          <span className="wj-lbl">正文（纯文本 / Markdown，选填）</span>
          <textarea className="wj-inp" style={{ minHeight: 120 }} value={content} onChange={(e) => setContent(e.target.value)} />
          <span className="wj-lbl">备注（这版改了什么）</span>
          <input className="wj-inp" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="wj-row" style={{ justifyContent: 'flex-end', marginTop: 6, gap: 6 }}>
            <button className="wj-btn sm danger" disabled={busy} onClick={del}>删除</button>
            <button className="wj-btn sm" disabled={busy} onClick={save}>保存</button>
          </div>
          <div className="wj-sub" style={{ marginTop: 4 }}>版本名不可改（投递引用按名绑定）；要新版本请「新增版本」。</div>
        </div>
      ) : null}
    </div>
  )
}

export default function SettingsTab({ data, reload, toast }: {
  data: WenData
  reload: () => Promise<WenData | null>
  toast: (m: string, bad?: boolean) => void
}) {
  const [followUpDays, setFollowUpDays] = useState(String(data.settings.followUpDays))
  const [remindLeadHours, setRemindLeadHours] = useState(String(data.settings.remindLeadHours))
  const [newLabel, setNewLabel] = useState('')
  const [csvPreview, setCsvPreview] = useState<null | { created: number; skipped: number; warns: string[]; apply: () => Promise<void> }>(null)
  const [busy, setBusy] = useState(false)
  const csvInputRef = useRef<HTMLInputElement | null>(null)
  const jsonInputRef = useRef<HTMLInputElement | null>(null)

  const saveParams = async () => {
    try {
      await saveSettings({ followUpDays: Number(followUpDays) || 5, remindLeadHours: Number(remindLeadHours) || 24 }, data.settings)
      toast('参数已保存')
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const addResume = async () => {
    if (!newLabel.trim()) { toast('给版本起个名', true); return }
    try {
      await saveResume({ label: newLabel.trim() }, null)
      setNewLabel('')
      toast('简历版本已建')
      await reload()
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const exportCsv = () => {
    const csv = core.exportCSV(data.apps, data.events, data.resumes, data.offers)
    downloadText(`wenjin-投递台账-${core.fmtDate(Date.now())}.csv`, csv, 'text/csv;charset=utf-8')
    toast(`已导出 ${data.apps.length} 条投递`)
  }
  const exportJson = () => {
    const json = JSON.stringify(core.exportAll(data), null, 2)
    downloadText(`wenjin-backup-${core.fmtDate(Date.now())}.json`, json, 'application/json')
    toast('JSON 备份已下载')
  }

  const onCsvFile = async (file: File) => {
    try {
      const text = await file.text()
      const result = core.importCSV(text, data.apps, Date.now())
      if (!result.created) {
        toast(`没有可导入的新投递（跳过 ${result.skipped} 条重复）`, true)
        return
      }
      setCsvPreview({
        created: result.created, skipped: result.skipped, warns: result.warns,
        apply: async () => {
          await applyImport(result)
          setCsvPreview(null)
          toast(`已导入 ${result.created} 条`)
          await reload()
        },
      })
    } catch (e) {
      toast((e as Error).message, true)
    }
  }

  const onJsonFile = async (file: File) => {
    setBusy(true)
    try {
      const parsed = JSON.parse(await file.text())
      if (parsed && parsed.kind === 'wenjin-backup') {
        const n = await applyBackup(parsed)
        toast(`备份还原完成，写入 ${n} 条`)
        await reload()
      } else if (parsed && (parsed.apps || parsed.companies)) {
        const n = await applyBackup(parsed)
        toast(`已写入 ${n} 条（识别为原始数据）`)
        await reload()
      } else {
        toast('不是求职台账的备份文件', true)
      }
    } catch (e) {
      toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const emptyCompanies = data.companies.filter((c) => !data.apps.some((a) => a.companyId === c.id))

  return (
    <div className="wj-page">
      <div className="wj-sec">
        <span className="wj-bar" />简历版本库
        <span className="wj-hint">投递时标注版本，漏斗才能归因</span>
      </div>
      <div className="wj-card"><div className="wj-card-b">
        {data.resumes.length === 0 ? <div className="wj-sub" style={{ paddingBottom: 6 }}>还没有版本。建「版本A」开始，按投递标注积累回复率。</div> : null}
        {data.resumes.map((r) => (
          <ResumeRow
            key={r.id} r={r} apps={data.apps} appsCount={data.apps.filter((a) => a.resumeId === r.id).length}
            reload={reload} toast={toast}
          />
        ))}
        <div className="wj-row" style={{ marginTop: 8 }}>
          <input className="wj-inp wj-grow" placeholder="新版本名，如「版本B-突出量化」" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <button className="wj-btn sm" onClick={addResume}>新增</button>
        </div>
      </div></div>

      <div className="wj-sec"><span className="wj-bar" />参数</div>
      <div className="wj-card"><div className="wj-card-b">
        <div className="wj-grid2">
          <div>
            <span className="wj-lbl">跟进阈值（天无进展就点名）</span>
            <input className="wj-inp" value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value)} />
          </div>
          <div>
            <span className="wj-lbl">提醒提前量（小时）</span>
            <input className="wj-inp" value={remindLeadHours} onChange={(e) => setRemindLeadHours(e.target.value)} />
          </div>
        </div>
        <div className="wj-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="wj-btn sm" onClick={saveParams}>保存参数</button>
        </div>
      </div></div>

      <div className="wj-sec"><span className="wj-bar" />数据</div>
      <div className="wj-card"><div className="wj-card-b">
        <div className="wj-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="wj-btn sm ghost" onClick={exportCsv}>导出 CSV（Excel 可开）</button>
          <button className="wj-btn sm ghost" onClick={exportJson}>导出 JSON 备份</button>
          <button className="wj-btn sm ghost" onClick={() => csvInputRef.current?.click()}>从 CSV 导入</button>
          <button className="wj-btn sm ghost" disabled={busy} onClick={() => jsonInputRef.current?.click()}>还原 JSON 备份</button>
        </div>
        <input
          ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onCsvFile(f); e.target.value = '' }}
        />
        <input
          ref={jsonInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onJsonFile(f); e.target.value = '' }}
        />
        {csvPreview ? (
          <div style={{ marginTop: 8, background: '#12151c', border: '1px solid #2a2f3a', borderRadius: 8, padding: 10 }}>
            <b style={{ fontSize: 12 }}>导入预览</b>
            <div className="wj-sub" style={{ marginTop: 4 }}>
              新建 {csvPreview.created} 条 · 跳过重复 {csvPreview.skipped} 条
              {csvPreview.warns.length ? `；${csvPreview.warns.length} 条降级警告（未知渠道→其他、未知状态→已投）` : ''}
            </div>
            {csvPreview.warns.slice(0, 5).map((w, i) => <div className="wj-sub" key={i} style={{ color: '#E3B341' }}>· {w}</div>)}
            <div className="wj-row" style={{ justifyContent: 'flex-end', marginTop: 6, gap: 6 }}>
              <button className="wj-btn sm ghost" onClick={() => setCsvPreview(null)}>取消</button>
              <button className="wj-btn sm ok" onClick={csvPreview.apply}>确认导入</button>
            </div>
          </div>
        ) : null}
        <div className="wj-sub" style={{ marginTop: 8 }}>
          台账共 {data.apps.length} 投递 / {data.events.length} 事件 / {data.offers.length} offer / {data.companies.length} 公司
          {emptyCompanies.length ? `（${emptyCompanies.length} 家空公司随下次全量清理）` : ''}。
          全部保存在本机（cap.kv），不发送到任何服务器。
        </div>
      </div></div>

      <div className="wj-sec"><span className="wj-bar" />关于</div>
      <div className="wj-card"><div className="wj-card-b wj-sub">
        <b>求职台账</b>——使子路求职台账。津者，渡口也；求职就是找渡口，每一份投递都值得有账可查。<br />
        只做记录、派生与提醒：不抓取招聘平台、不自动投递、不承诺「ATS 通过率」。<br />
        跟进提醒与 offer 对比基于你自己的记录，不构成职业建议。
      </div></div>
    </div>
  )
}
