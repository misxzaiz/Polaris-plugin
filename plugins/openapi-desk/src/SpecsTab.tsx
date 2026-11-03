/**
 * SpecsTab.tsx —— 合同库：导入（粘贴/文件/URL）+ 列表管理
 */
import { useCallback, useRef, useState } from 'react'
import { sendCommand, type SpecSummary } from './model'
import { Badge, C, Empty, Err, Field, KeyValue, SectionTitle, btnStyle, inputStyle } from './ui'

type ImportMode = 'text' | 'url'

export default function SpecsTab(props: {
  specs: SpecSummary[]
  onChanged: () => void
  onOpenDebug: (specId: string) => void
}) {
  const { specs, onChanged, onOpenDebug } = props
  const [mode, setMode] = useState<ImportMode>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ specId: string; summaryText: string; hints: string[]; warning: string | null } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const doImport = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true)
    setErr('')
    setResult(null)
    try {
      const r = await sendCommand('spec_import', payload, 60000)
      if (!r || !r.ok) {
        setErr((r && r.error) || '导入失败（服务无响应？）')
      } else {
        const s = r.summary
        setResult({
          specId: r.specId,
          summaryText: `${s.name}${s.version ? ` v${s.version}` : ''} · ${s.specVersion} · ${s.endpointCount} 端点 / ${s.pathCount} 路径${s.serverUrls.length ? ` · ${s.serverUrls[0]}` : ''}`,
          hints: r.hints || [],
          warning: r.warning || null,
        })
        setText('')
        setUrl('')
        setName('')
        onChanged()
      }
    } catch (e) {
      setErr(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }, [onChanged])

  const onPickFile = useCallback(async (f: File | null) => {
    if (!f) return
    if (f.size > 4 * 1024 * 1024) {
      setErr(`文件 ${(f.size / 1024 / 1024).toFixed(1)}MB 超过 4MB 上限`)
      return
    }
    const content = await f.text()
    await doImport({ source: 'text', content, name: f.name.replace(/\.(yaml|yml|json)$/i, '') })
  }, [doImport])

  const doDelete = useCallback(async (id: string, nm: string) => {
    if (!window.confirm(`删除合同「${nm}」？其调试环境配置也会一并清除。`)) return
    setErr('')
    const r = await sendCommand('spec_delete', { specId: id }, 30000)
    if (!r || !r.ok) setErr((r && r.error) || '删除失败')
    else onChanged()
  }, [onChanged])

  return (
    <div>
      <SectionTitle>导入合同</SectionTitle>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button style={btnStyle(mode === 'text' ? 'primary' : 'ghost')} onClick={() => setMode('text')}>粘贴 / 文件</button>
        <button style={btnStyle(mode === 'url' ? 'primary' : 'ghost')} onClick={() => setMode('url')}>URL 拉取</button>
      </div>
      {mode === 'text' ? (
        <Field label="openapi.yaml / openapi.json 内容" hint="也可以直接把文件拖到下面的选择框">
          <textarea
            style={{ ...inputStyle, minHeight: 110, fontFamily: 'Consolas, monospace', resize: 'vertical' }}
            placeholder="粘贴 YAML 或 JSON…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      ) : (
        <Field label="合同 URL" hint="由本机服务拉取，天然无跨域限制">
          <input style={inputStyle} placeholder="https://…/openapi.json 或 http://127.0.0.1:3000/v3/api-docs"
            value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input style={{ ...inputStyle, flex: 1 }} placeholder="合同名（可留空，默认取 info.title）"
          value={name} onChange={(e) => setName(e.target.value)} />
        {mode === 'text' ? (
          <>
            <button style={btnStyle()} onClick={() => fileRef.current && fileRef.current.click()}>选文件…</button>
            <input ref={fileRef} type="file" accept=".yaml,.yml,.json,application/json,text/yaml"
              style={{ display: 'none' }} onChange={(e) => { onPickFile(e.target.files && e.target.files[0]); e.target.value = '' }} />
          </>
        ) : null}
        <button
          style={btnStyle('primary')}
          disabled={busy || (mode === 'text' ? !text.trim() : !url.trim())}
          onClick={() => doImport(mode === 'text' ? { source: 'text', content: text, name } : { source: 'url', url, name })}
        >{busy ? '导入中…' : '导入'}</button>
      </div>
      <Err msg={err} />
      {result ? (
        <div style={{ border: `1px solid ${C.ok}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
          <div style={{ color: C.ok, marginBottom: 4 }}>✓ 导入成功：{result.summaryText}</div>
          {result.warning ? <div style={{ color: C.warn, marginBottom: 4 }}>{result.warning}</div> : null}
          {result.hints.map((h, i) => (
            <div key={i} style={{ color: C.muted }}>{h}</div>
          ))}
          <button style={{ ...btnStyle(), marginTop: 6 }} onClick={() => onOpenDebug(result.specId)}>去调试这个合同 →</button>
        </div>
      ) : null}

      <SectionTitle extra={<span style={{ color: C.muted, fontSize: 11 }}>{specs.length} 份</span>}>合同库</SectionTitle>
      {!specs.length ? (
        <Empty>
          还没有合同。把后端的 openapi.yaml/json 拖进来（或给个 URL），就能：
          <br />· 浏览全部端点与参数，请求体自动生成示例
          <br />· 按合同直接调接口，响应与文档逐字段比对
          <br />· 新旧两版合同一比，breaking change 提前暴露
        </Empty>
      ) : (
        specs.map((s) => (
          <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
              {s.version ? <Badge text={`v${s.version}`} color={C.muted} /> : null}
              <Badge text={s.specVersion} color={C.accent} />
              {s.externalRefs > 0 ? <Badge text={`${s.externalRefs} 外部引用`} color={C.warn} /> : null}
              <span style={{ flex: 1 }} />
              <button style={btnStyle()} onClick={() => onOpenDebug(s.id)}>调试</button>
              <button style={btnStyle('danger')} onClick={() => doDelete(s.id, s.name)}>删除</button>
            </div>
            <div style={{ marginTop: 6 }}>
              <KeyValue rows={[
                ['端点', `${s.endpointCount} 个 / ${s.pathCount} 路径`],
                ['服务器', s.serverUrls.join('  |  ')],
                ['来源', `${s.source === 'url' ? 'URL 拉取' : '粘贴/文件'}${s.sourceDetail ? ` · ${s.sourceDetail}` : ''} · ${s.importedAt.slice(0, 16).replace('T', ' ')}`],
              ]} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}
