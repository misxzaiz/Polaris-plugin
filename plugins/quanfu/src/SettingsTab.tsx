/**
 * 设置 Tab：提醒参数 + 数据（导出/导入/清空）+ 关于
 */
import { useRef, useState } from 'react'
import { exportAll, importAll, saveSettings } from './model'
import type { TabProps } from './Panel'

export default function SettingsTab({ data, reload, showToast, onSendToChat }: TabProps) {
  const [warnDays, setWarnDays] = useState('')
  const [rpWarn, setRpWarn] = useState('')
  const [driftWarn, setDriftWarn] = useState('')
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  if (!data) return <div className="qf-empty">载入中…</div>
  const s = data.settings

  const save = async () => {
    setBusy(true)
    try {
      await saveSettings({
        warnDays: warnDays === '' ? s.warnDays : +warnDays,
        repricingWarnDays: rpWarn === '' ? s.repricingWarnDays : +rpWarn,
        driftWarn: driftWarn === '' ? s.driftWarn : +driftWarn,
      })
      setWarnDays(''); setRpWarn(''); setDriftWarn('')
      await reload()
      showToast('设置已保存')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const doExport = () => {
    const json = exportAll(data)
    try {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `quanfu-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
      showToast('已导出（浏览器下载）')
    } catch {
      // 下载受限时回退：把 JSON 复制进导入框，用户手工拷走
      setImportText(json)
      showToast('下载不可用，JSON 已放入下方文本框，请手动复制保存')
    }
  }

  const doImport = async (text: string) => {
    setBusy(true)
    try {
      const r = await importAll(text)
      setImportText('')
      await reload()
      showToast(`导入完成：贷款 ${r.loans} 笔、事件 ${r.events} 条`)
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    if (!window.confirm('清空泉府全部数据（贷款/事件/设置）？不可恢复。建议先导出备份。')) return
    setBusy(true)
    try {
      const { kvKeys, kvDel } = await import('./host')
      const keys = await kvKeys()
      for (const k of keys.filter((k) => k.startsWith('quanfu.'))) await kvDel(k)
      await reload()
      showToast('已清空')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="qf-card">
        <div className="qf-card-b">
          <b style={{ fontSize: 12.5 }}>提醒参数</b>
          <div className="qf-row" style={{ gap: 8, marginTop: 6 }}>
            <div className="qf-grow">
              <label className="qf-lbl" style={{ marginTop: 0 }}>扣款临近（天）</label>
              <input className="qf-inp qf-num" inputMode="numeric" value={warnDays} onChange={(e) => setWarnDays(e.target.value)} placeholder={String(s.warnDays)} />
            </div>
            <div className="qf-grow">
              <label className="qf-lbl" style={{ marginTop: 0 }}>重定价临近（天）</label>
              <input className="qf-inp qf-num" inputMode="numeric" value={rpWarn} onChange={(e) => setRpWarn(e.target.value)} placeholder={String(s.repricingWarnDays)} />
            </div>
            <div className="qf-grow">
              <label className="qf-lbl" style={{ marginTop: 0 }}>对账漂移提示（元）</label>
              <input className="qf-inp qf-num" inputMode="numeric" value={driftWarn} onChange={(e) => setDriftWarn(e.target.value)} placeholder={String(s.driftWarn)} />
            </div>
          </div>
          <div className="qf-row" style={{ marginTop: 10 }}>
            <button className="qf-btn gold qf-grow" disabled={busy} onClick={save}>保存设置</button>
          </div>
        </div>
      </div>

      <div className="qf-card">
        <div className="qf-card-b">
          <b style={{ fontSize: 12.5 }}>数据（仅存本机）</b>
          <div className="qf-row" style={{ gap: 8, marginTop: 8 }}>
            <button className="qf-btn ghost qf-grow" disabled={busy} onClick={doExport}>导出 JSON</button>
            <button className="qf-btn ghost qf-grow" disabled={busy} onClick={() => fileRef.current?.click()}>从文件导入</button>
          </div>
          <input
            ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files && e.target.files[0]
              if (!f) return
              const text = await f.text()
              e.target.value = ''
              await doImport(text)
            }}
          />
          <label className="qf-lbl">或把导出 JSON 粘贴到这里导入（合并判重）</label>
          <textarea
            className="qf-inp" rows={3} value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"kind":"quanfu-export",...}'
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 10.5 }}
          />
          <div className="qf-row" style={{ gap: 8, marginTop: 8 }}>
            <button className="qf-btn qf-grow" disabled={busy || !importText.trim()} onClick={() => doImport(importText)}>导入</button>
            <button className="qf-btn danger" disabled={busy} onClick={clearAll}>清空全部数据</button>
          </div>
        </div>
      </div>

      <div className="qf-card">
        <div className="qf-card-b qf-sub">
          <b style={{ color: '#E6EAF2' }}>关于泉府</b><br />
          《周礼·地官》泉府掌市之征布与赊贷——泉者钱也，古之官办借贷机构；今之家庭负债台账。<br />
          · 数据：cap.kv 纯本地存储，无服务进程、零外网请求、零账号。<br />
          · 引擎：等额本息/等额本金/先息后本标准公式，事件分段重放（利率变更、提前还款、对账点），逐期分级舍入。<br />
          · 边界：不构成金融建议；不算违约金（各行合同不同）；不抓取 LPR（利率一律以你的合同为准手工记录）。
          {onSendToChat && (
            <div style={{ marginTop: 8 }}>
              <button className="qf-btn ghost sm" onClick={() => onSendToChat('我想聊聊我的房贷还款计划（泉府已有我的贷款台账）。')}>和 AI 聊聊还款计划</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
