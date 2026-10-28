/**
 * 设置 Tab：成员管理 + 参数（宽限期/提醒天数）+ 导出/导入 + 口径边界说明。
 */
import { useRef, useState } from 'react'
import * as core from '../shared/core'
import type { Settings } from '../shared/core'
import { deleteMember, exportAll, importAll, saveMember, saveSettings, type JinkuiData } from './model'
import type { TabProps } from './Panel'
import { RELATION_CN } from './ui'

export default function SettingsTab({ data, reload, showToast }: TabProps) {
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('self')
  const [birthYear, setBirthYear] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  if (!data) return <div className="jk-empty">加载中…</div>

  const addMember = async () => {
    if (!name.trim()) {
      showToast('成员名字必填', true)
      return
    }
    try {
      await saveMember({ name, relation, birthYear: birthYear || undefined }, null)
      showToast(`已建成员：${name}`)
      setName('')
      setBirthYear('')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const doDelete = async (id: string) => {
    try {
      await deleteMember(id, data)
      showToast('已删除成员')
      setConfirmDel(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const updateSettings = async (patch: Partial<Settings>) => {
    try {
      await saveSettings(core.normalizeSettings({ ...data.settings, ...patch }))
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  const download = () => {
    const blob = new Blob([exportAll(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jinkui-export-${core.dayKey(Date.now())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (json: string) => {
    try {
      const r = await importAll(json)
      showToast(`导入完成：成员 ${r.members}、保单 ${r.policies}、流水 ${r.events}`)
      setImportText('')
      setShowImport(false)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <>
      <div className="jk-sec"><span className="jk-bar" />家庭成员<span className="jk-hint">保单的被保险人档案</span></div>
      <div className="jk-card"><div className="jk-card-b">
        {!data.members.length && <div className="jk-sub">还没有成员。先建「本人」，家人按需添加；对话里建保单时未知名字也会自动建档。</div>}
        {data.members.map((m) => (
          <div key={m.id} className="jk-row" style={{ padding: '3px 0' }}>
            <span className="jk-grow">
              <b style={{ fontSize: 12 }}>{m.name}</b>
              <span className="jk-tag" style={{ marginLeft: 6 }}>{RELATION_CN[m.relation] || m.relation}</span>
              {m.birthYear != null && <span className="jk-sub"> {m.birthYear} 年生</span>}
            </span>
            {confirmDel === m.id
              ? <button className="jk-btn danger sm" onClick={() => doDelete(m.id)}>确认删</button>
              : <button className="jk-btn ghost sm" onClick={() => setConfirmDel(m.id)}>删</button>}
          </div>
        ))}
        <div className="jk-grid" style={{ marginTop: 8 }}>
          <input className="jk-inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="名字，如 妻子" />
          <select className="jk-sel" value={relation} onChange={(e) => setRelation(e.target.value)}>
            {core.RELATIONS.map((r) => <option key={r} value={r}>{RELATION_CN[r]}</option>)}
          </select>
        </div>
        <div className="jk-row" style={{ marginTop: 6 }}>
          <input className="jk-inp" style={{ width: 120 }} type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="出生年（选填）" />
          <button className="jk-btn green sm" onClick={addMember}>+ 建成员</button>
        </div>
      </div></div>

      <div className="jk-sec"><span className="jk-bar" />提醒参数</div>
      <div className="jk-card"><div className="jk-card-b">
        <div className="jk-kv">
          <span>黄榜提前天数<span className="jk-sub">（缴费/满期提前多少天进黄榜）</span></span>
          <input className="jk-inp" style={{ width: 76 }} type="number" value={data.settings.warnDays}
            onChange={(e) => updateSettings({ warnDays: Math.floor(Number(e.target.value)) || 30 })} />
        </div>
        <div className="jk-kv">
          <span>宽限期天数<span className="jk-sub">（长期险法定 60 天，一般无需改）</span></span>
          <input className="jk-inp" style={{ width: 76 }} type="number" value={data.settings.graceDays}
            onChange={(e) => updateSettings({ graceDays: Math.floor(Number(e.target.value)) || 60 })} />
        </div>
        <div className="jk-sub" style={{ marginTop: 6 }}>
          口径：长期险缴费逾期后 {data.settings.graceDays} 天内为宽限期（保障仍有效），其后 2 年为中止期（出险不赔、可复效）；
          一年期短险到期即满期、无宽限期。
        </div>
      </div></div>

      <div className="jk-sec"><span className="jk-bar" />导出 / 导入</div>
      <div className="jk-card"><div className="jk-card-b">
        <div className="jk-row" style={{ gap: 6 }}>
          <button className="jk-btn green sm" onClick={download}>导出 JSON</button>
          <button className="jk-btn ghost sm" onClick={() => setShowImport(!showImport)}>导入 JSON</button>
          {showImport && <button className="jk-btn ghost sm" onClick={() => fileRef.current?.click()}>从文件选择</button>}
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0]
              if (!f) return
              const reader = new FileReader()
              reader.onload = () => doImport(String(reader.result || ''))
              reader.readAsText(f)
              e.target.value = ''
            }} />
        </div>
        {showImport && (
          <>
            <textarea className="jk-inp" style={{ marginTop: 8, minHeight: 84 }} value={importText}
              onChange={(e) => setImportText(e.target.value)} placeholder="粘贴 jinkui-export JSON（同 id/同 occKey 跳过，不覆盖现有数据）" />
            <button className="jk-btn green sm" style={{ marginTop: 6 }} disabled={!importText.trim()} onClick={() => doImport(importText)}>执行导入</button>
          </>
        )}
      </div></div>

      <div className="jk-sec"><span className="jk-bar" />口径与边界</div>
      <div className="jk-card"><div className="jk-card-b jk-sub" style={{ lineHeight: 1.8 }}>
        · 金匮是「家庭保单台账」：记录、缴费提醒、宽限期/中止期状态投影、四大件覆盖透视。<br />
        · 不做产品推荐、不做保费对比、不构成投保/退保建议；退保通常只退现金价值，决定前与保司确认。<br />
        · 状态为台账口径投影：与保司实际宽限/复效条款有出入时以合同为准。<br />
        · 纯本地存储（cap.kv），零账号零上传；「电子保单位置」只登记路径描述，不存文件本体。
      </div></div>
    </>
  )
}
