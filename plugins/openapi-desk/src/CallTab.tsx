/**
 * CallTab.tsx —— 调试页：端点选择 + 环境配置 + 参数表单 + 发送 + 合同校验报告 + 历史
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  METHOD_COLOR, SEVERITY_COLOR, fmtMs, fmtTime, sendCommand,
  type AuthDraft, type CallRecord, type EndpointDetail, type EnvView, type HistoryEntry, type SpecSummary,
} from './model'
import { Badge, C, Empty, Err, Field, KeyValue, SectionTitle, SeverityBadge, btnStyle, inputStyle } from './ui'

interface ParamRow { name: string; in: string; required: boolean; value: string }

const EMPTY_AUTH: AuthDraft = { type: '', token: '', username: '', password: '', name: 'X-Api-Key', in: 'header', value: '' }

export default function CallTab(props: {
  specs: SpecSummary[]
  activeSpecId: string
  setActiveSpecId: (id: string) => void
  envs: (EnvView & { specId: string })[]
  history: HistoryEntry[]
  onChanged: () => void
}) {
  const { specs, activeSpecId, setActiveSpecId, envs, history, onChanged } = props
  const [detail, setDetail] = useState<EndpointDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [paramRows, setParamRows] = useState<ParamRow[]>([])
  const [baseUrl, setBaseUrl] = useState('')
  const [auth, setAuth] = useState<AuthDraft>(EMPTY_AUTH)
  const [bodyText, setBodyText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [record, setRecord] = useState<CallRecord | null>(null)
  const [savedNote, setSavedNote] = useState('')

  const spec = specs.find((s) => s.id === activeSpecId) || null
  const env = envs.find((e) => e.specId === activeSpecId) || null

  /** 载入端点详情（spec 切换时载入第一个端点） */
  const loadEndpoint = useCallback(async (specId: string, endpointId?: string) => {
    setDetailLoading(true)
    setErr('')
    try {
      const r = await sendCommand('spec_get', { specId, endpointId }, 30000)
      if (!r || !r.ok) { setErr((r && r.error) || '端点读取失败'); setDetail(null); return }
      const ep: EndpointDetail = r.endpoint
      setDetail(ep)
      setParamRows(ep.parameters.map((p) => ({
        name: p.name, in: p.in, required: p.required,
        value: p.example != null && typeof p.example !== 'object' ? String(p.example) : '',
      })))
      setBodyText(ep.exampleBody ? ep.exampleBody.text : '')
      // 环境回填
      const e = envs.find((x) => x.specId === specId)
      setBaseUrl((e && e.baseUrl) || '')
      setAuth(e && e.auth ? {
        ...EMPTY_AUTH,
        type: (e.auth.type as AuthDraft['type']) || '',
        name: e.auth.name || 'X-Api-Key',
        in: (e.auth.in as AuthDraft['in']) || 'header',
        username: e.auth.username || '',
        token: '', value: '', password: '', // 掩码值不回填原文，需要用户重输（或用已保存的）
        ...(e.auth.tokenMask ? {} : {}),
      } : EMPTY_AUTH)
      setSavedNote(e && e.auth ? '已保存该合同的鉴权配置（发送时自动使用；在下方重新填写并保存可覆盖）' : '')
    } catch (e) {
      setErr(String((e as Error).message))
    } finally {
      setDetailLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpecId, envs])

  useEffect(() => {
    if (!activeSpecId || !specs.length) { setDetail(null); return }
    loadEndpoint(activeSpecId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpecId])

  const buildValues = useCallback(() => {
    const values: { path: Record<string, string>; query: Record<string, string>; header: Record<string, string> } = { path: {}, query: {}, header: {} }
    for (const r of paramRows) {
      if (r.value === '') continue
      values[r.in === 'path' ? 'path' : r.in === 'header' ? 'header' : 'query'][r.name] = r.value
    }
    return values
  }, [paramRows])

  const authPayload = useCallback(() => {
    if (!auth.type) return undefined
    if (auth.type === 'bearer') return { type: 'bearer', token: auth.token || undefined }
    if (auth.type === 'basic') return { type: 'basic', username: auth.username, password: auth.password }
    return { type: 'apiKey', in: auth.in, name: auth.name, value: auth.value }
  }, [auth])

  const hasAuthInput = auth.type === 'bearer' ? !!auth.token.trim()
    : auth.type === 'basic' ? !!auth.username
      : auth.type === 'apiKey' ? auth.value !== '' : false

  const doSend = useCallback(async () => {
    if (!spec || !detail) return
    setSending(true)
    setErr('')
    try {
      const r = await sendCommand('call', {
        specId: spec.id,
        endpointId: detail.id,
        values: buildValues(),
        bodyText: detail.hasRequestBody ? bodyText : undefined,
        baseUrl: baseUrl || undefined,
        auth: hasAuthInput ? authPayload() : undefined,
      }, 180000)
      if (!r || !r.ok) {
        setErr((r && r.error) || '发送失败（服务无响应？）')
        setRecord(null)
      } else {
        setRecord(r.record)
        onChanged()
      }
    } catch (e) {
      setErr(String((e as Error).message))
    } finally {
      setSending(false)
    }
  }, [spec, detail, buildValues, bodyText, baseUrl, hasAuthInput, authPayload, onChanged])

  const doSaveEnv = useCallback(async () => {
    if (!spec) return
    setSavedNote('')
    const r = await sendCommand('env_set', { specId: spec.id, env: { baseUrl: baseUrl || null, auth: hasAuthInput ? authPayload() : (auth.type ? authPayload() : null) } }, 30000)
    if (!r || !r.ok) setErr((r && r.error) || '环境保存失败')
    else {
      setSavedNote('已保存（鉴权值只存本机服务内存与本地档案文件，不出本机）')
      onChanged()
    }
  }, [spec, baseUrl, hasAuthInput, authPayload, auth.type, onChanged])

  const grouped = useMemo(() => {
    if (!detail) return { byIn: [] as { in: string; rows: ParamRow[] }[] }
    const order = ['path', 'query', 'header']
    return {
      byIn: order
        .map((loc) => ({ in: loc, rows: paramRows.filter((r) => r.in === loc) }))
        .filter((g) => g.rows.length),
    }
  }, [detail, paramRows])

  if (!specs.length) {
    return <Empty>先在「合同」页导入一份 openapi.yaml/json，这里就能按合同调试接口。</Empty>
  }

  return (
    <div>
      {/* 合同选择 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select style={{ ...inputStyle, flex: 1 }} value={activeSpecId} onChange={(e) => setActiveSpecId(e.target.value)}>
          {specs.map((s) => <option key={s.id} value={s.id}>{s.name}{s.version ? ` v${s.version}` : ''}（{s.endpointCount} 端点）</option>)}
        </select>
      </div>

      {/* 端点速选列表（选中高亮） */}
      {spec ? (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 10, maxHeight: 150, overflowY: 'auto' }}>
          <EndpointPicker specId={activeSpecId} selectedId={detail ? detail.id : ''} onPick={(id) => loadEndpoint(activeSpecId, id)} />
        </div>
      ) : null}

      <Err msg={err} />

      {detail ? (
        <>
          {/* 端点详情 */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: METHOD_COLOR[detail.method] || C.text, fontWeight: 700, fontSize: 12 }}>{detail.method.toUpperCase()}</span>
              <span style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}>{detail.path}</span>
              {detail.needsAuth ? <Badge text="需鉴权" color={C.warn} /> : null}
              {detail.deprecated ? <Badge text="已废弃" color={C.danger} /> : null}
              <span style={{ flex: 1 }} />
              <span style={{ color: C.muted, fontSize: 11 }}>响应码 {detail.responseCodes.join(' / ') || '—'}</span>
            </div>
            {detail.summary || detail.description ? (
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                {detail.summary}
                {detail.description ? (detail.summary ? '\n' : '') + detail.description.slice(0, 300) : ''}
              </div>
            ) : null}
          </div>

          {/* 服务器与鉴权 */}
          <SectionTitle extra={<button style={btnStyle()} onClick={doSaveEnv}>保存环境</button>}>服务器与鉴权</SectionTitle>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <Field label="Base URL" hint={`缺省：${spec ? spec.serverUrls[0] || '（合同未声明）' : '—'}`}>
                <input style={inputStyle} placeholder={(spec ? spec.serverUrls[0] : '') || 'http://127.0.0.1:8080'}
                  value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </Field>
            </div>
            <div style={{ width: 150 }}>
              <Field label="鉴权方式">
                <select style={inputStyle} value={auth.type} onChange={(e) => setAuth({ ...auth, type: e.target.value as AuthDraft['type'] })}>
                  <option value="">无</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="apiKey">API Key</option>
                  <option value="basic">Basic</option>
                </select>
              </Field>
            </div>
          </div>
          {auth.type === 'bearer' ? (
            <Field label="Token" hint={env && env.auth && env.auth.tokenMask ? `已保存：${env.auth.tokenMask}` : undefined}>
              <input style={inputStyle} type="password" placeholder="粘贴 token（只存本机）" value={auth.token} onChange={(e) => setAuth({ ...auth, token: e.target.value })} />
            </Field>
          ) : null}
          {auth.type === 'basic' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Field label="用户名"><input style={inputStyle} value={auth.username} onChange={(e) => setAuth({ ...auth, username: e.target.value })} /></Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="密码"><input style={inputStyle} type="password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></Field>
              </div>
            </div>
          ) : null}
          {auth.type === 'apiKey' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 110 }}>
                <Field label="位置">
                  <select style={inputStyle} value={auth.in} onChange={(e) => setAuth({ ...auth, in: e.target.value as AuthDraft['in'] })}>
                    <option value="header">header</option>
                    <option value="query">query</option>
                  </select>
                </Field>
              </div>
              <div style={{ width: 150 }}>
                <Field label="名称"><input style={inputStyle} value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} /></Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="值" hint={env && env.auth && env.auth.valueMask ? `已保存：${env.auth.valueMask}` : undefined}>
                  <input style={inputStyle} type="password" value={auth.value} onChange={(e) => setAuth({ ...auth, value: e.target.value })} />
                </Field>
              </div>
            </div>
          ) : null}
          {savedNote ? <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>{savedNote}</div> : null}

          {/* 参数 */}
          {grouped.byIn.length ? (
            <>
              <SectionTitle>参数</SectionTitle>
              {grouped.byIn.map((g) => (
                <div key={g.in} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{g.in === 'path' ? '路径参数' : g.in === 'query' ? 'Query 参数' : 'Header 参数'}</div>
                  {g.rows.map((r) => (
                    <div key={`${r.in}.${r.name}`} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12, minWidth: 110 }}>
                        {r.name}{r.required ? <span style={{ color: C.danger }}>*</span> : null}
                      </span>
                      <input
                        style={inputStyle}
                        placeholder={r.required ? '必填' : '可选'}
                        value={r.value}
                        onChange={(e) => setParamRows((rows) => rows.map((x) => (x.in === r.in && x.name === r.name ? { ...x, value: e.target.value } : x)))}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : null}

          {/* 请求体 */}
          {detail.hasRequestBody ? (
            <>
              <SectionTitle extra={<span style={{ color: C.muted, fontSize: 11 }}>按 schema 生成{detail.requestBodyRequired ? ' · 必填' : ' · 可选'}</span>}>
                请求体（{detail.exampleBody ? detail.exampleBody.mediaType : detail.requestBodyContentTypes[0] || 'application/json'}）
              </SectionTitle>
              <textarea
                style={{ ...inputStyle, minHeight: 120, fontFamily: 'Consolas, monospace', resize: 'vertical' }}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                spellCheck={false}
              />
            </>
          ) : null}

          <div style={{ margin: '12px 0' }}>
            <button style={{ ...btnStyle('primary'), fontSize: 13, padding: '7px 22px' }} disabled={sending || !detail} onClick={doSend}>
              {sending ? '发送中…' : `发送 ${detail.method.toUpperCase()} 请求`}
            </button>
          </div>

          {/* 响应 + 校验报告 */}
          {record ? <ResponseView record={record} /> : null}
        </>
      ) : (
        <Empty>选择一个端点开始调试。</Empty>
      )}

      {/* 历史 */}
      {history.length ? (
        <>
          <SectionTitle extra={<span style={{ color: C.muted, fontSize: 11 }}>最近 {history.length} 条</span>}>调用历史</SectionTitle>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 180, overflowY: 'auto' }}>
            {history.slice(0, 20).map((h) => (
              <div key={h.reqId} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                <span style={{ color: h.ok ? C.ok : C.danger }}>{h.ok ? '✓' : '❌'}</span>
                <span style={{ color: METHOD_COLOR[h.method] || C.text, minWidth: 46, fontWeight: 600 }}>{h.method}</span>
                <span style={{ fontFamily: 'Consolas, monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.path}</span>
                <span style={{ color: C.muted }}>{h.status || '—'}</span>
                <span style={{ color: C.muted, minWidth: 52, textAlign: 'right' }}>{fmtMs(h.ms)}</span>
                {h.drifts && h.drifts !== '0/0/0' ? <Badge text={`漂移 ${h.drifts}`} color={C.warn} /> : null}
                {h.viaAi ? <Badge text="AI" color={C.accent} /> : null}
                <span style={{ color: C.muted }}>{fmtTime(h.at)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** 端点速选列表：从服务拉全量端点（spec_get 无 endpointId） */
function EndpointPicker(props: { specId: string; selectedId: string; onPick: (id: string) => void }) {
  const { specId, selectedId, onPick } = props
  const [list, setList] = useState<{ id: string; method: string; path: string; summary: string; needsAuth: boolean }[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendCommand('spec_get', { specId }, 30000).then((r: any) => {
      if (!alive) return
      if (r && r.ok && Array.isArray(r.endpoints)) setList(r.endpoints)
      else setErr((r && r.error) || '端点列表读取失败')
    }).catch((e: Error) => alive && setErr(e.message))
    return () => { alive = false }
  }, [specId])

  if (err) return <div style={{ padding: 8, color: C.danger, fontSize: 11 }}>{err}</div>
  return (
    <div>
      {list.map((e) => (
        <div
          key={e.id}
          onClick={() => onPick(e.id)}
          style={{
            display: 'flex', gap: 8, alignItems: 'center', padding: '4px 10px', cursor: 'pointer',
            borderBottom: `1px solid ${C.border}`,
            background: e.id === selectedId ? 'rgba(31,111,235,0.15)' : 'transparent',
            fontSize: 11,
          }}
        >
          <span style={{ color: METHOD_COLOR[e.method] || C.text, fontWeight: 700, minWidth: 52 }}>{e.method.toUpperCase()}</span>
          <span style={{ fontFamily: 'Consolas, monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.path}</span>
          {e.needsAuth ? <span style={{ color: C.warn }}>🔒</span> : null}
          <span style={{ color: C.muted, maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.summary}</span>
        </div>
      ))}
    </div>
  )
}

/** 响应视图 + 合同校验报告 */
function ResponseView({ record }: { record: CallRecord }) {
  const [showRaw, setShowRaw] = useState(false)
  const v = record.validation
  const groups = v ? {
    breaking: v.drifts.filter((d) => d.severity === 'breaking'),
    warn: v.drifts.filter((d) => d.severity === 'warn'),
    info: v.drifts.filter((d) => d.severity === 'info'),
  } : null

  return (
    <>
      <SectionTitle>响应</SectionTitle>
      <div style={{ border: `1px solid ${record.ok ? C.ok : C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
        <KeyValue rows={[
          ['状态', `${record.ok ? '✓' : '❌'} HTTP ${record.status || '—'}${record.location ? ` → 重定向 ${record.location}` : ''} · ${fmtMs(record.ms)}`],
          ['URL', record.url],
          ['鉴权', record.authUsed ? `${record.authUsed.type}${record.authUsed.name ? ` (${record.authUsed.name})` : ''} ${record.authUsed.masked || ''}` : '未使用'],
          ['尺寸', `${record.respBytes} 字符${record.respBytes >= 65536 ? '（落库截断）' : ''}`],
        ]} />
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: C.muted, fontSize: 11 }}>响应头：{Object.entries(record.respHeaders).slice(0, 4).map(([k, val]) => `${k}: ${String(val).slice(0, 40)}`).join('  ·  ') || '—'}</span>
          <span style={{ flex: 1 }} />
          <button style={btnStyle()} onClick={() => setShowRaw(!showRaw)}>{showRaw ? '收起体' : '看响应体'}</button>
        </div>
        {showRaw ? (
          <pre style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
            padding: 10, fontSize: 11, fontFamily: 'Consolas, monospace',
            maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8,
          }}>{record.respText || '（空体）'}</pre>
        ) : null}
      </div>

      {v ? (
        <>
          <SectionTitle>合同校验</SectionTitle>
          {v.summary.total === 0 ? (
            <div style={{ border: `1px solid ${C.ok}`, borderRadius: 8, padding: '10px 12px', color: C.ok, fontSize: 12 }}>
              ✓ 响应与合同完全相符（状态码 {record.status} 在合同内，字段零漂移）
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                <Badge text={`破坏性 ${(groups ? groups.breaking : []).length}`} color={C.danger} />
                <Badge text={`告警 ${(groups ? groups.warn : []).length}`} color={C.warn} />
                <Badge text={`信息 ${(groups ? groups.info : []).length}`} color="#58A6FF" />
                <span style={{ flex: 1 }} />
                <span style={{ color: C.muted, fontSize: 11 }}>红=客户端会挂 黄=大概率有问题 蓝=合同过时提示</span>
              </div>
              {(['breaking', 'warn', 'info'] as const).map((sev) => (groups ? groups[sev] : []).map((d, i) => (
                <div key={`${sev}.${i}`} style={{
                  border: `1px solid ${C.border}`, borderLeft: `3px solid ${SEVERITY_COLOR[d.severity]}`,
                  borderRadius: 6, padding: '8px 10px', fontSize: 12,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <SeverityBadge severity={d.severity} />
                    <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 600 }}>{d.jsonPath}</span>
                    <span style={{ color: C.muted, fontSize: 11 }}>{d.kind}</span>
                  </div>
                  <div>期望：<span style={{ color: C.ok }}>{d.expected}</span></div>
                  <div>实际：<span style={{ color: SEVERITY_COLOR[d.severity] }}>{d.actual}</span></div>
                  {d.hint ? <div style={{ color: C.muted, marginTop: 2 }}>{d.hint}</div> : null}
                </div>
              )))}
            </div>
          )}
        </>
      ) : record.error ? (
        <div style={{ border: `1px solid ${C.danger}`, borderRadius: 8, padding: '10px 12px', color: '#FFA198', fontSize: 12 }}>
          网络层失败：{record.error}
        </div>
      ) : null}
    </>
  )
}
