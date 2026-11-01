/**
 * 档案 Tab：列表（掩码）+ 导入宿主档案 + 手动新增/编辑/删除
 * 完整 apiKey 只在新增/编辑表单中短暂出现，经 cmd 发给服务本地保存；
 * 面板列表与 kv 中的一切均为掩码形态。
 */
import { useState } from 'react'
import { sendCommand, fmtTime, type MaskedProfile, type Wire } from './model'

interface Props {
  profiles: MaskedProfile[]
  onRefresh: () => Promise<void>
  onImport: () => void
  importing?: boolean
}

const EMPTY_FORM: { id: string; name: string; baseUrl: string; apiKey: string; model: string; wire: Wire } = {
  id: '', name: '', baseUrl: '', apiKey: '', model: '', wire: 'openai-chat-completions',
}

export default function ProfilesTab({ profiles, onRefresh, onImport }: Props) {
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const startAdd = () => { setErr(''); setMsg(''); setForm({ ...EMPTY_FORM }) }
  const startEdit = (p: MaskedProfile) => {
    setErr(''); setMsg('')
    setForm({ id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: '', model: p.model, wire: p.wire })
  }

  const save = async () => {
    if (!form) return
    setBusy(true); setErr('')
    try {
      const payload: Record<string, unknown> = {
        id: form.id || undefined,
        name: form.name || form.baseUrl.replace(/^https?:\/\//, '').slice(0, 40),
        baseUrl: form.baseUrl,
        model: form.model,
        wire: form.wire,
      }
      if (form.apiKey) payload.apiKey = form.apiKey
      if (!form.id) payload.allowEmptyKey = form.apiKey === '' // 本地无鉴权端点（Ollama 默认无 key）
      const r = await sendCommand('profiles_upsert', { profile: payload }, 15000)
      if (!r || r.ok !== true) setErr((r && r.error) || '保存失败')
      else { setMsg(`已保存（key 掩码将显示于列表）${r.savedToFile === false ? '；注意：本地文件保存失败，服务重启后手动档案会丢' : ''}`); setForm(null) }
      await onRefresh()
    } catch (e) { setErr(String((e as Error).message || e)) }
    setBusy(false)
  }

  const del = async (p: MaskedProfile) => {
    if (!confirm(`删除档案「${p.name}」？此操作不可撤销（宿主导入档案重新导入即可恢复）。`)) return
    setBusy(true); setErr('')
    try {
      const r = await sendCommand('profiles_delete', { id: p.id, force: p.source === 'host' }, 15000)
      if (!r || r.ok !== true) setErr((r && r.error) || '删除失败')
      await onRefresh()
    } catch (e) { setErr(String((e as Error).message || e)) }
    setBusy(false)
  }

  const hostCount = profiles.filter((p) => p.source === 'host').length
  const manualCount = profiles.length - hostCount

  return (
    <>
      <div className="lp-sec">
        <span className="lp-bar" />端点档案
        <span className="lp-hint">key 全程掩码 · 完整 key 只存服务本地</span>
      </div>
      <div className="lp-card"><div className="lp-card-b" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="lp-btn" onClick={onImport} disabled={busy}>⟳ 导入宿主档案</button>
        <button className="lp-btn ghost" onClick={startAdd}>+ 手动添加端点</button>
        <span className="lp-sub">宿主 {hostCount} · 手动 {manualCount}</span>
      </div></div>
      {msg && <div className="lp-ok" style={{ padding: '0 16px 6px', fontSize: 11.5 }}>✓ {msg}</div>}
      {err && <div className="lp-err">{err}</div>}

      {form && (
        <div className="lp-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setForm(null) }}>
          <div className="lp-modal">
            <button className="lp-close" onClick={() => setForm(null)}>✕</button>
            <h4>{form.id ? '编辑档案' : '手动添加端点'}</h4>
            <div className="lp-fm">
              <label>名称</label>
              <input className="lp-inp" value={form.name} placeholder="如：DeepSeek 官方 / 本地 Ollama" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label>Base URL</label>
              <input className="lp-inp lp-mono" value={form.baseUrl} placeholder="https://api.deepseek.com（# 结尾=逐字使用）" onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
              <label>协议</label>
              <select className="lp-sel" style={{ width: '100%' }} value={form.wire} onChange={(e) => setForm({ ...form, wire: e.target.value as MaskedProfile['wire'] })}>
                <option value="openai-chat-completions">OpenAI Chat Completions（/v1/chat/completions）</option>
                <option value="anthropic-messages">Anthropic Messages（/v1/messages）</option>
              </select>
              <label>模型名</label>
              <input className="lp-inp lp-mono" value={form.model} placeholder="如 deepseek-chat / qwen2.5:7b" onChange={(e) => setForm({ ...form, model: e.target.value })} />
              <label>{form.id ? '新 Key' : 'API Key'}</label>
              <input className="lp-inp lp-mono" type="password" value={form.apiKey} placeholder={form.id ? '留空=不修改' : '本地无鉴权端点可留空'} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
              <div className="lp-fm-full lp-sub">Key 只保存在本机服务目录（与宿主 config.json 同信任域），报告/历史/AI 返回中只出现掩码（****后4位）。</div>
              <div className="lp-fm-full" style={{ textAlign: 'right' }}>
                <button className="lp-btn" onClick={save} disabled={busy || !form.baseUrl}>{busy ? '保存中…' : '保存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!profiles.length && <div className="lp-empty">暂无档案。点「导入宿主档案」读取 Polaris 已配置的模型供应商，或手动添加。</div>}
      {profiles.map((p) => (
        <div className="lp-card" key={p.id}>
          <div className="lp-row" style={{ borderTop: 'none' }}>
            <div className="lp-row-h">
              <b style={{ fontSize: 12.5 }}>{p.name}</b>
              <span className={`lp-badge ${p.source}`}>{p.source === 'host' ? '宿主' : '手动'}</span>
              <span className="lp-tag">{p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}</span>
              <span className="lp-tag lp-mono">{p.model || '无模型'}</span>
              <span className="lp-tag lp-mono">key {p.keyMask}</span>
              <span className="lp-hint">{fmtTime(p.importedAt)}</span>
            </div>
            <div className="lp-sub lp-mono" style={{ marginTop: 3, wordBreak: 'break-all' }}>{p.baseUrl}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <button className="lp-btn ghost sm" onClick={() => startEdit(p)}>编辑</button>
              <button className="lp-btn danger sm" disabled={busy} onClick={() => del(p)}>删除</button>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
