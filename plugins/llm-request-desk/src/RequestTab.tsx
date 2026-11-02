/**
 * RequestTab.tsx —— 请求构造器：双协议表单 / 原始 JSON / 发送 / 变异重放
 */
import { useMemo, useState } from 'react'
import type { Draft, MaskedEndpoint, ReqRecord, Wire } from './model'
import { sendCommand, fmtMs } from './model'
import ResponseView from './ResponseView'

const S = {
  label: { display: 'block', fontSize: 12, color: '#8B949E', margin: '10px 0 4px' },
  input: {
    width: '100%', boxSizing: 'border-box' as const, background: '#0D1117', color: '#E6EDF3',
    border: '1px solid #30363D', borderRadius: 6, padding: '6px 8px', fontSize: 13,
  },
  btn: {
    background: '#21262D', color: '#E6EDF3', border: '1px solid #30363D', borderRadius: 6,
    padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  },
  primary: {
    background: '#1F6FEB', color: '#fff', border: '1px solid #1F6FEB', borderRadius: 6,
    padding: '7px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  card: { border: '1px solid #30363D', borderRadius: 8, padding: 10, background: 'rgba(110,118,129,0.08)' },
  msgRow: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' },
  err: { color: '#FFA198', fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap' as const },
  note: { color: '#8B949E', fontSize: 12 },
}

interface Props {
  endpoints: MaskedEndpoint[]
  models: Record<string, string[]>
  onEndpointsChanged: () => void
  initialRawBody?: Record<string, unknown> | null
}

export default function RequestTab({ endpoints, models, onEndpointsChanged, initialRawBody }: Props) {
  const [endpointId, setEndpointId] = useState('')
  const [model, setModel] = useState('')
  const [system, setSystem] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'user', content: '你好，请介绍一下你自己' },
  ])
  const [maxTokens, setMaxTokens] = useState('1024')
  const [temperature, setTemperature] = useState('')
  const [topP, setTopP] = useState('')
  const [stream, setStream] = useState(true)
  const [extraText, setExtraText] = useState('')
  const [rawMode, setRawMode] = useState(!!initialRawBody)
  const [rawText, setRawText] = useState(initialRawBody ? JSON.stringify(initialRawBody, null, 2) : '')
  const [sending, setSending] = useState(false)
  const [record, setRecord] = useState<ReqRecord | null>(null)
  const [err, setErr] = useState('')
  const [mutatorBusy, setMutatorBusy] = useState('')

  const wire: Wire = endpoints.find((e) => e.id === endpointId)?.wire || 'openai-chat-completions'
  const modelList = useMemo(() => models[endpointId] || [], [models, endpointId])

  function updateMsg(i: number, patch: Partial<{ role: 'user' | 'assistant'; content: string }>) {
    setMessages((arr) => arr.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  }

  function buildDraft(): Draft | null {
    if (rawMode) {
      try {
        const raw = JSON.parse(rawText)
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          setErr('原始请求体必须是 JSON 对象')
          return null
        }
        return { model: '', system: '', messages: [], stream: false, rawBody: raw }
      } catch (e) {
        setErr(`原始请求体 JSON 解析失败：${(e as Error).message}`)
        return null
      }
    }
    let extra: Record<string, unknown> | undefined
    if (extraText.trim()) {
      try {
        extra = JSON.parse(extraText)
      } catch (e) {
        setErr(`附加字段 JSON 解析失败：${(e as Error).message}`)
        return null
      }
    }
    const d: Draft = {
      model: model.trim(),
      system: system.trim(),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream,
    }
    if (maxTokens.trim()) d.maxTokens = Number(maxTokens)
    if (temperature.trim()) d.temperature = Number(temperature)
    if (topP.trim()) d.topP = Number(topP)
    if (extra) d.extra = extra
    return d
  }

  async function send(force = false) {
    const ep = endpointId || (endpoints[0] && endpoints[0].id) || ''
    if (!ep) { setErr('没有可用端点：先到「端点」页导入或手动添加'); return }
    if (!endpointId) setEndpointId(ep)
    const draft = buildDraft()
    if (!draft) return
    setErr('')
    setSending(true)
    setRecord(null)
    try {
      const r = await sendCommand('send', { endpointId: ep, draft, force, cap: { maxTokensMax: 32768 } })
      if (r.ok) setRecord(r.record)
      else if (r.precheck && !r.force) {
        setErr(`预检拦截（未发送，不消耗额度）：\n${(r.precheck.errors || []).map((x: string) => `❌ ${x}`).join('\n')}${(r.precheck.warnings || []).length ? `\n⚠ ${(r.precheck.warnings as string[]).join('\n⚠ ')}` : ''}\n（确要强制发送可点「强制发送」）`)
      } else setErr(r.error || '发送失败')
    } finally {
      setSending(false)
    }
  }

  /** 变异：目标 = 原始 JSON 模式当前体 → 最近一次记录体 → 最近响应体 */
  async function mutate(mutatorId: string) {
    let body: Record<string, unknown> | null = null
    if (rawMode && rawText.trim()) {
      try { body = JSON.parse(rawText) } catch (_) { body = null }
    }
    if (!body && record) body = record.body
    if (!body) { setErr('没有可变异的请求体：先发送一次，或粘贴原始请求体 JSON'); return }
    setMutatorBusy(mutatorId)
    try {
      const r = await sendCommand('mutate', { body, mutatorId }, 20000)
      if (r.ok) {
        setRawMode(true)
        setRawText(JSON.stringify(r.body, null, 2))
        setErr(`已应用变异「${r.mutator.label}」到原始请求体（${r.mutator.note}）——检查后点发送`)
      } else setErr(`变异失败：${r.error}`)
    } finally {
      setMutatorBusy('')
    }
  }

  async function loadLatestBody() {
    const r = await sendCommand('get_state', {}, 15000)
    if (r.ok && r.latest && r.latest.body) {
      setRawMode(true)
      setRawText(JSON.stringify(r.latest.body, null, 2))
      setErr('已载入最近一次请求体到原始 JSON 模式')
    } else setErr('暂无历史请求可载入')
  }

  const ep = endpoints.find((e) => e.id === (endpointId || (endpoints[0] && endpoints[0].id)))

  return (
    <div>
      {/* 端点选择 */}
      <label style={S.label}>端点</label>
      <div style={S.row}>
        <select
          value={endpointId || (endpoints[0] && endpoints[0].id) || ''}
          onChange={(e) => setEndpointId(e.target.value)}
          style={{ ...S.input, maxWidth: 360 }}
        >
          {endpoints.length === 0 ? <option value="">（无端点——先到「端点」页添加）</option> : null}
          {endpoints.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}（{e.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}）· {e.baseUrl}
            </option>
          ))}
        </select>
        {ep ? <span style={S.note}>key {ep.keyMask}</span> : null}
      </div>

      {/* 模式切换 */}
      <div style={{ ...S.row, marginTop: 12 }}>
        <button
          onClick={() => setRawMode(!rawMode)}
          style={{ ...S.btn, background: rawMode ? '#1F6FEB' : '#21262D', color: rawMode ? '#fff' : '#E6EDF3' }}
        >
          {rawMode ? '原始 JSON 模式（点此切回表单）' : '表单模式（点此切原始 JSON）'}
        </button>
        <button onClick={loadLatestBody} style={S.btn}>载入最近请求体</button>
      </div>

      {rawMode ? (
        <div>
          <label style={S.label}>原始请求体（原样透传，可放任意非标字段做实验）</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            spellCheck={false}
            style={{ ...S.input, fontFamily: 'Consolas, Monaco, monospace', fontSize: 12 }}
          />
        </div>
      ) : (
        <div>
          <label style={S.label}>model</label>
          <div style={S.row}>
            <input
              list="llmdesk-models"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={wire === 'anthropic-messages' ? '如 claude-sonnet-4-20250514' : '如 deepseek-chat'}
              style={{ ...S.input, maxWidth: 320 }}
            />
            <datalist id="llmdesk-models">
              {modelList.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>

          <label style={S.label}>system{wire === 'openai-chat-completions' ? '（OpenAI 协议自动并入 messages 首条）' : ''}</label>
          <textarea value={system} onChange={(e) => setSystem(e.target.value)} rows={2} style={S.input} />

          <label style={S.label}>messages（Anthropic 协议要求以 user 结尾）</label>
          {messages.map((m, i) => (
            <div key={i} style={S.msgRow}>
              <select
                value={m.role}
                onChange={(e) => updateMsg(i, { role: e.target.value as 'user' | 'assistant' })}
                style={{ ...S.input, width: 110, flex: 'none' }}
              >
                <option value="user">user</option>
                <option value="assistant">assistant</option>
              </select>
              <textarea
                value={m.content}
                onChange={(e) => updateMsg(i, { content: e.target.value })}
                rows={2}
                style={{ ...S.input, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button onClick={() => i > 0 && setMessages((a) => { const c = [...a]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c })} style={{ ...S.btn, padding: '1px 8px' }} disabled={i === 0}>↑</button>
                <button onClick={() => i < messages.length - 1 && setMessages((a) => { const c = [...a]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c })} style={{ ...S.btn, padding: '1px 8px' }} disabled={i === messages.length - 1}>↓</button>
              </div>
              <button onClick={() => setMessages((a) => a.filter((_, j) => j !== i))} style={{ ...S.btn, padding: '2px 8px', color: '#F85149' }}>✕</button>
            </div>
          ))}
          <button
            onClick={() => setMessages((a) => [...a, { role: a.length && a[a.length - 1].role === 'user' ? 'assistant' : 'user', content: '' }])}
            style={S.btn}
          >
            + 添加消息
          </button>

          <div style={{ ...S.row, marginTop: 12 }}>
            <div>
              <label style={S.label}>max_tokens{wire === 'anthropic-messages' ? '（Anthropic 必填）' : ''}</label>
              <input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} style={{ ...S.input, width: 110 }} />
            </div>
            <div>
              <label style={S.label}>temperature</label>
              <input value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="留空不传" style={{ ...S.input, width: 110 }} />
            </div>
            <div>
              <label style={S.label}>top_p</label>
              <input value={topP} onChange={(e) => setTopP(e.target.value)} placeholder="留空不传" style={{ ...S.input, width: 110 }} />
            </div>
            <div>
              <label style={S.label}>stream</label>
              <button onClick={() => setStream(!stream)} style={{ ...S.btn, background: stream ? '#1F6FEB' : '#21262D', color: stream ? '#fff' : '#E6EDF3' }}>
                {stream ? '开' : '关'}
              </button>
            </div>
          </div>

          <label style={S.label}>附加字段 extra（JSON，透传到顶层：thinking / response_format / reasoning_effort 等实验字段）</label>
          <input value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder='如 {"thinking":{"type":"adaptive"}}' style={{ ...S.input, fontFamily: 'Consolas, monospace', fontSize: 12 }} />
        </div>
      )}

      {/* 变异器 */}
      <div style={{ ...S.row, marginTop: 12 }}>
        <span style={S.note}>变异重放：</span>
        {(wire === 'anthropic-messages'
          ? ['append-empty-user', 'drop-trailing-assistant', 'standard-fields', 'minimal', 'halve-messages', 'lower-max-tokens', 'no-stream', 'no-tools']
          : ['standard-fields', 'minimal', 'halve-messages', 'lower-max-tokens', 'no-stream', 'no-tools', 'convert-system']
        ).map((id) => (
          <button key={id} onClick={() => mutate(id)} disabled={!!mutatorBusy} style={{ ...S.btn, opacity: mutatorBusy === id ? 0.5 : 1 }}>
            {mutatorBusy === id ? '…' : mutatorLabel(id)}
          </button>
        ))}
      </div>

      {/* 发送 */}
      <div style={{ ...S.row, marginTop: 14 }}>
        <button onClick={() => send(false)} disabled={sending || !endpoints.length} style={S.primary}>
          {sending ? '发送中…' : '▶ 发送请求'}
        </button>
        {sending ? <button onClick={async () => { await sendCommand('cancel', {}, 8000); }} style={S.btn}>取消</button> : null}
        {err && !sending ? <button onClick={() => send(true)} style={{ ...S.btn, color: '#FFA198' }}>强制发送（跳过预检）</button> : null}
      </div>
      {err ? <div style={S.err}>{err}</div> : null}

      {/* 响应 */}
      {record ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...S.note, marginBottom: 6 }}>
            reqId={record.reqId} · {record.ok ? '成功' : '失败'} · {fmtMs(record.ms)}
          </div>
          <ResponseView record={record} />
        </div>
      ) : null}
    </div>
  )
}

function mutatorLabel(id: string): string {
  const map: Record<string, string> = {
    'append-empty-user': '补空 user 结尾',
    'drop-trailing-assistant': '去末尾 assistant',
    'standard-fields': '裁剪标准字段',
    minimal: '最小请求',
    'halve-messages': '减半 messages',
    'lower-max-tokens': 'max_tokens→256',
    'no-stream': '关 stream',
    'no-tools': '去 tools',
    'convert-system': 'system 换写法',
  }
  return map[id] || id
}
