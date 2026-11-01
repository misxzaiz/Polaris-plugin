/**
 * DatasetsTab —— 数据集管理：JSONL 编辑（本地实时解析校验）+ 保存/删除/复用。
 * 解析/校验用 shared/matrix-core 同一实现——面板看到的即服务执行时看到的。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/matrix-core'
import { sendCommand, kvGet, type DatasetHead } from './model'

const SAMPLE = `# 每行一个样本对象；# 开头为注释行
# 形态一：显式 vars
{"vars": {"text": "人工智能正在改变世界"}}
# 形态二：顶层键直接作为变量
{"text": "今天天气怎么样？", "lang": "英语"}
# 形态三：带期望检查器（运行后逐格自动验证）
{"vars": {"text": "1+1等于几？只回答数字"}, "expect": [{"type": "equals", "value": "2"}]}
# 检查器类型：contains / not_contains / regex / json_valid / equals / min_length / max_length
{"vars": {"text": "输出一个 JSON：{\\"city\\": \\"北京\\"} 的城市名"}, "expect": [{"type": "json_valid"}]}
{"vars": {"text": "写一句关于海的比喻"}, "expect": [{"type": "min_length", "value": 10}, {"type": "not_contains", "value": ["抱歉"]}]}
`

export default function DatasetsTab({ datasets, onChanged }: {
  datasets: DatasetHead[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [jsonl, setJsonl] = useState('')
  const [editId, setEditId] = useState('')
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => (jsonl.trim() ? core.parseDataset(jsonl) : null), [jsonl])

  const save = async () => {
    setErr(''); setOkMsg('')
    if (!name.trim() && !editId) { setErr('给数据集起个名字'); return }
    if (!parsed || !parsed.samples.length) { setErr('没有有效样本（右侧预览区看具体错误行）'); return }
    setBusy(true)
    try {
      const r = await sendCommand<{ count: number, errors: { line: number, msg: string }[] }>('datasets_upsert', { id: editId || undefined, name: name || '未命名数据集', jsonl }, 15000)
      if (r.ok) {
        setOkMsg(`已保存：${r.count} 条有效样本${r.errors && r.errors.length ? `（${r.errors.length} 行格式错误保留原文）` : ''}`)
        if (!editId) { setName(''); setJsonl('') }
        setEditId('')
        onChanged()
      } else setErr(r.error || '保存失败')
    } finally { setBusy(false) }
  }

  const del = async (id: string) => {
    if (!window.confirm('删除该数据集？')) return
    setBusy(true)
    try {
      const r = await sendCommand('datasets_delete', { id }, 15000)
      if (!r.ok) setErr(r.error || '删除失败')
      else {
        if (editId === id) { setEditId(''); setJsonl(''); setName('') }
        onChanged()
      }
    } finally { setBusy(false) }
  }

  const edit = async (d: DatasetHead) => {
    setErr(''); setOkMsg('')
    const full = await kvGet<{ id: string, name: string, jsonl: string }>(`pmtx.dataset.${d.id}`)
    if (full && full.jsonl != null) {
      setEditId(d.id)
      setName(full.name)
      setJsonl(full.jsonl)
    } else {
      setErr('数据集全文读取失败')
    }
  }

  return (
    <div>
      <div className="pm-sec"><span className="pm-bar" />{editId ? `编辑数据集（${editId}）` : '新建数据集'}<span className="pm-hint">{'JSONL：一行一个样本，{{变量}} 在模板里插值'}</span></div>
      <div className="pm-card"><div className="pm-card-b">
        <div className="pm-row" style={{ marginBottom: 8 }}>
          <input className="pm-inp" style={{ width: 200 }} placeholder="数据集名称" value={name}
            onChange={(e) => setName(e.target.value)} />
          {editId ? <button className="pm-btn ghost sm" onClick={() => { setEditId(''); setName(''); setJsonl('') }}>取消编辑</button> : null}
        </div>
        <textarea className="pm-ta" rows={9} value={jsonl}
          placeholder={SAMPLE}
          onChange={(e) => setJsonl(e.target.value)} />
        {parsed ? (
          <div style={{ marginTop: 8 }}>
            <span className="pm-pill ok" style={{ marginRight: 6 }}>有效样本 {parsed.samples.length}</span>
            {parsed.errors.length ? <span className="pm-pill bad">错误行 {parsed.errors.length}</span> : null}
            {parsed.errors.length ? (
              <div className="pm-warn" style={{ marginTop: 6 }}>
                {parsed.errors.slice(0, 5).map((x, i) => <div key={i}>{x.line ? `第 ${x.line} 行：` : ''}{x.msg}</div>)}
              </div>
            ) : null}
            {parsed.samples.length && parsed.samples.some((s) => s.checks.length) ? (
              <div className="pm-sub" style={{ marginTop: 5 }}>
                含检查器样本 {parsed.samples.filter((s) => s.checks.length).length} 条——运行后逐格自动验证
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ marginTop: 9 }}>
          <button className="pm-btn" disabled={busy} onClick={save}>{editId ? '保存修改' : '保存数据集'}</button>
        </div>
        {err ? <div className="pm-err">{err}</div> : null}
        {okMsg ? <div className="pm-ok">{okMsg}</div> : null}
      </div></div>

      <div className="pm-sec"><span className="pm-bar" />已保存（{datasets.length}）</div>
      {datasets.length ? (
        <div className="pm-card"><div className="pm-card-b" style={{ padding: 0 }}>
          <table className="pm-tbl">
            <thead><tr><th>名称</th><th>样本</th><th>更新</th><th style={{ width: 110 }}></th></tr></thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.name}</b><div className="pm-sub">{d.id}</div></td>
                  <td>{d.count}{d.errCount ? <span className="pm-pill warn" style={{ marginLeft: 5 }}>{d.errCount} 错误行</span> : null}</td>
                  <td className="pm-sub">{String(d.updatedAt || '').replace('T', ' ').slice(0, 16)}</td>
                  <td>
                    <button className="pm-btn ghost sm" style={{ marginRight: 5 }} onClick={() => edit(d)}>编辑</button>
                    <button className="pm-btn danger sm" onClick={() => del(d.id)}>删</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      ) : (
        <div className="pm-empty">还没有数据集。用上方编辑器创建，或在「运行」页临时粘贴 JSONL。</div>
      )}
    </div>
  )
}
