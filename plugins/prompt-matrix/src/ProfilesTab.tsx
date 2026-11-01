/**
 * ProfilesTab —— 模型档案管理：宿主一键导入（掩码展示）+ 手动添加 + 删除。
 * 与 llm-probe 同款安全分层：完整 key 只在服务内存/本地文件，面板只见掩码。
 */
import { useState } from 'react'
import { sendCommand, type MaskedProfile } from './model'

export default function ProfilesTab({ profiles, onChanged }: {
  profiles: MaskedProfile[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [wire, setWire] = useState<'openai-chat-completions' | 'anthropic-messages'>('openai-chat-completions')
  const [allowEmpty, setAllowEmpty] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const importHost = async () => {
    setErr(''); setOkMsg(''); setBusy(true)
    try {
      const r = await sendCommand('import_host', {}, 20000)
      if (r.ok) setOkMsg(`导入完成：新增/更新 ${r.imported} 条，共 ${r.total} 条档案`)
      else setErr(r.error || '导入失败')
      onChanged()
    } finally { setBusy(false) }
  }

  const addManual = async () => {
    setErr(''); setOkMsg('')
    if (!baseUrl.trim()) { setErr('baseUrl 必填'); return }
    if (!apiKey.trim() && !allowEmpty) { setErr('apiKey 必填（本地无鉴权端点可勾选允许空 key）'); return }
    setBusy(true)
    try {
      const r = await sendCommand('profiles_upsert', {
        profile: { name: name || '手动档案', baseUrl, apiKey, model, wire },
        allowEmptyKey: allowEmpty,
      }, 15000)
      if (r.ok) {
        setOkMsg(`已添加档案 ${r.id}${r.savedToFile ? '' : '（⚠ 本地文件保存失败，重启后丢失）'}`)
        setName(''); setBaseUrl(''); setApiKey(''); setModel('')
        onChanged()
      } else setErr(r.error || '添加失败')
    } finally { setBusy(false) }
  }

  const del = async (p: MaskedProfile) => {
    const force = p.source === 'host' ? window.confirm('宿主导入档案：删除后重新导入宿主会再次出现，确认删除？') : window.confirm(`删除档案「${p.name}」？`)
    if (!force) return
    setBusy(true)
    try {
      const r = await sendCommand('profiles_delete', { id: p.id, force: true }, 15000)
      if (!r.ok) setErr(r.error || '删除失败')
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="pm-sec"><span className="pm-bar" />模型档案（{profiles.length}）<span className="pm-hint">完整 key 只存在服务本地文件，一切展示均掩码</span></div>
      <div style={{ padding: '0 16px 8px' }}>
        <button className="pm-btn green" disabled={busy} onClick={importHost}>⬇ 导入宿主已配置的供应商</button>
        <span className="pm-sub" style={{ marginLeft: 8 }}>宿主「模型服务」里配过的端点自动成为可评测档案，零重录</span>
      </div>
      {profiles.length ? (
        <div className="pm-card"><div className="pm-card-b" style={{ padding: 0 }}>
          <table className="pm-tbl">
            <thead><tr><th>名称</th><th>端点 / 模型</th><th>线路</th><th>key</th><th>来源</th><th></th></tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td className="pm-sub" style={{ maxWidth: 240, wordBreak: 'break-all' }}>{p.baseUrl}<br />{p.model || '（未设模型）'}</td>
                  <td className="pm-sub">{p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}</td>
                  <td className="pm-sub">{p.keyMask || '无'}</td>
                  <td><span className="pm-tag">{p.source === 'host' ? '宿主' : '手动'}</span></td>
                  <td><button className="pm-btn danger sm" onClick={() => del(p)}>删</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      ) : (
        <div className="pm-empty">还没有档案。点上方「导入宿主供应商」，或手动添加端点。</div>
      )}

      <div className="pm-sec"><span className="pm-bar" />手动添加档案</div>
      <div className="pm-card"><div className="pm-card-b">
        <div className="pm-row" style={{ marginBottom: 7 }}>
          <input className="pm-inp" style={{ width: 150 }} placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="pm-inp" style={{ flex: 1, minWidth: 180 }} placeholder="baseUrl（如 https://api.deepseek.com 或 http://127.0.0.1:11434）"
            value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="pm-row" style={{ marginBottom: 7 }}>
          <input className="pm-inp" style={{ flex: 1, minWidth: 160 }} placeholder="apiKey（sk-…，只存服务本地文件）" value={apiKey}
            onChange={(e) => setApiKey(e.target.value)} />
          <input className="pm-inp" style={{ width: 170 }} placeholder="模型名（如 deepseek-chat）" value={model}
            onChange={(e) => setModel(e.target.value)} />
          <select className="pm-sel" value={wire} onChange={(e) => setWire(e.target.value as typeof wire)}>
            <option value="openai-chat-completions">OpenAI 兼容</option>
            <option value="anthropic-messages">Anthropic Messages</option>
          </select>
        </div>
        <label style={{ fontSize: 11.5, color: '#8B95A7', display: 'flex', gap: 5, alignItems: 'center', marginBottom: 8 }}>
          <input type="checkbox" checked={allowEmpty} onChange={(e) => setAllowEmpty(e.target.checked)} />
          允许空 key（Ollama / vLLM / LM Studio 等本地端点）
        </label>
        <button className="pm-btn" disabled={busy} onClick={addManual}>+ 添加档案</button>
        {err ? <div className="pm-err">{err}</div> : null}
        {okMsg ? <div className="pm-ok">{okMsg}</div> : null}
      </div></div>
    </div>
  )
}
