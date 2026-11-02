/**
 * EndpointsTab.tsx —— 端点管理：列表 / 手动添加 / 宿主导入 / 拉模型
 */
import { useState } from 'react'
import type { MaskedEndpoint } from './model'
import { sendCommand } from './model'

const S = {
  card: { border: '1px solid #30363D', borderRadius: 8, padding: 10, marginBottom: 8, background: 'rgba(110,118,129,0.08)' },
  label: { display: 'block', fontSize: 12, color: '#8B949E', margin: '8px 0 4px' },
  input: {
    width: '100%', boxSizing: 'border-box' as const, background: '#0D1117', color: '#E6EDF3',
    border: '1px solid #30363D', borderRadius: 6, padding: '6px 8px', fontSize: 13,
  },
  btn: {
    background: '#21262D', color: '#E6EDF3', border: '1px solid #30363D', borderRadius: 6,
    padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  muted: { color: '#8B949E', fontSize: 12 },
  err: { color: '#FFA198', fontSize: 12, marginTop: 6 },
  okMsg: { color: '#7EE787', fontSize: 12, marginTop: 6 },
  tag: { fontSize: 11, border: '1px solid #30363D', borderRadius: 10, padding: '1px 8px', color: '#8B949E' },
}

interface Props {
  endpoints: MaskedEndpoint[]
  models: Record<string, string[]>
  onChanged: () => void
}

export default function EndpointsTab({ endpoints, models, onChanged }: Props) {
  const [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '', wire: 'openai-chat-completions' as MaskedEndpoint['wire'], pathOverride: '', allowEmptyKey: false })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [modelsOpen, setModelsOpen] = useState('')

  async function importHost() {
    setBusy('import'); setErr(''); setMsg('')
    try {
      const r = await sendCommand('import_host', {}, 20000)
      if (r.ok) { setMsg(`宿主导入完成：新增 ${r.imported} 条，共 ${r.total} 条`); onChanged() }
      else setErr(r.error || '导入失败')
    } finally { setBusy('') }
  }

  async function upsert() {
    setBusy('upsert'); setErr(''); setMsg('')
    try {
      const r = await sendCommand('endpoint_upsert', {
        endpoint: {
          name: form.name || '未命名', baseUrl: form.baseUrl.trim(), apiKey: form.apiKey,
          wire: form.wire, pathOverride: form.pathOverride,
        },
        allowEmptyKey: form.allowEmptyKey,
      }, 15000)
      if (r.ok) { setMsg(`已保存：${r.id}`); setForm({ ...form, name: '', baseUrl: '', apiKey: '', pathOverride: '' }); onChanged() }
      else setErr(r.error || '保存失败')
    } finally { setBusy('') }
  }

  async function del(id: string, source: string) {
    setBusy(`del-${id}`)
    try {
      const r = await sendCommand('endpoint_delete', { id, force: source === 'host' }, 15000)
      if (r.ok) onChanged()
      else setErr(r.error || '删除失败')
    } finally { setBusy('') }
  }

  async function fetchModels(id: string) {
    setBusy(`models-${id}`); setErr('')
    try {
      const r = await sendCommand('models', { endpointId: id }, 25000)
      if (r.ok) { setModelsOpen(id); onChanged() }
      else setErr(`拉模型失败：${r.error}`)
    } finally { setBusy('') }
  }

  return (
    <div>
      <div style={S.row}>
        <button onClick={importHost} disabled={!!busy} style={S.btn}>⟳ 导入宿主端点（零重录）</button>
        <span style={S.muted}>读取宿主已配置的模型供应商与 key 池（key 不出本机服务）</span>
      </div>

      <div style={{ ...S.card, marginTop: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>手动添加端点</div>
        <div style={S.row}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={S.label}>名称</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 本地 Ollama" style={S.input} />
          </div>
          <div style={{ flex: 2, minWidth: 260 }}>
            <label style={S.label}>baseUrl（带不带 /v1 都行，自动防重复拼接）</label>
            <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://127.0.0.1:11434 或 https://api.deepseek.com" style={S.input} />
          </div>
        </div>
        <div style={S.row}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={S.label}>apiKey（本地无鉴权端点可勾选「允许空 key」）</label>
            <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} type="password" style={S.input} />
          </div>
          <div style={{ minWidth: 150 }}>
            <label style={S.label}>协议</label>
            <select value={form.wire} onChange={(e) => setForm({ ...form, wire: e.target.value as MaskedEndpoint['wire'] })} style={S.input}>
              <option value="openai-chat-completions">OpenAI Chat Completions</option>
              <option value="anthropic-messages">Anthropic Messages</option>
            </select>
          </div>
        </div>
        <div style={S.row}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={S.label}>路径覆盖（可选；网关变体如 /v1/messages?beta=true）</label>
            <input value={form.pathOverride} onChange={(e) => setForm({ ...form, pathOverride: e.target.value })} style={S.input} />
          </div>
          <label style={{ ...S.label, marginTop: 18, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={form.allowEmptyKey} onChange={(e) => setForm({ ...form, allowEmptyKey: e.target.checked })} />
            允许空 key
          </label>
        </div>
        <button onClick={upsert} disabled={!!busy || !form.baseUrl.trim()} style={{ ...S.btn, marginTop: 10 }}>
          {busy === 'upsert' ? '保存中…' : '保存端点'}
        </button>
      </div>

      {msg ? <div style={S.okMsg}>{msg}</div> : null}
      {err ? <div style={S.err}>{err}</div> : null}

      <div style={{ marginTop: 14 }}>
        {endpoints.length === 0 ? <div style={S.muted}>暂无端点。点上方「导入宿主端点」或手动添加。</div> : null}
        {endpoints.map((e) => (
          <div key={e.id} style={S.card}>
            <div style={S.row}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</span>
              <span style={S.tag}>{e.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}</span>
              <span style={S.tag}>{e.source === 'host' ? '宿主导入' : '手动'}</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => fetchModels(e.id)} disabled={!!busy} style={S.btn}>
                {busy === `models-${e.id}` ? '拉取中…' : '拉模型'}
              </button>
              <button onClick={() => del(e.id, e.source)} disabled={!!busy} style={{ ...S.btn, color: '#F85149' }}>
                {busy === `del-${e.id}` ? '…' : '删除'}
              </button>
            </div>
            <div style={{ ...S.muted, marginTop: 4 }}>
              {e.baseUrl}{e.pathOverride ? ` · path=${e.pathOverride}` : ''} · key {e.keyMask}
            </div>
            {modelsOpen === e.id && models[e.id] ? (
              <div style={{ ...S.muted, marginTop: 6, maxHeight: 120, overflow: 'auto' }}>
                {models[e.id].length} 个模型：{models[e.id].join('、')}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
