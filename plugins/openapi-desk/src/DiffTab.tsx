/**
 * DiffTab.tsx —— 对比页：任选两份合同 → breaking/告警/信息三级结构化报告
 */
import { useCallback, useState } from 'react'
import { METHOD_COLOR, sendCommand, type DiffReport, type SpecSummary } from './model'
import { Badge, C, Empty, Err, Field, SectionTitle, btnStyle, inputStyle } from './ui'

const KIND_LABEL: Record<string, string> = {
  'endpoint-removed': '端点移除',
  'endpoint-added': '端点新增',
  'deprecated-added': '标记废弃',
  'param-removed': '参数移除',
  'param-added': '参数新增',
  'param-required-tightened': '参数变必填',
  'param-type-changed': '参数类型变更',
  'param-enum-narrowed': '参数枚举收缩',
  'param-enum-widened': '参数枚举扩大',
  'body-added': '请求体新增',
  'body-removed': '请求体移除',
  'body-required-tightened': '请求体变必填',
  'body-content-type-changed': '请求体类型变化',
  'schema-field-removed': '字段移除',
  'schema-field-added': '字段新增',
  'schema-field-type-changed': '字段类型变更',
  'schema-required-added': '字段变必填',
  'response-removed': '响应码移除',
  'response-added': '响应码新增',
  'security-changed': '鉴权变化',
  'global-security-changed': '全局鉴权变化',
  'servers-changed': '服务器地址变化',
}

export default function DiffTab(props: { specs: SpecSummary[] }) {
  const { specs } = props
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [report, setReport] = useState<DiffReport | null>(null)

  const doDiff = useCallback(async () => {
    if (!idA || !idB) return
    setBusy(true)
    setErr('')
    try {
      const r = await sendCommand('diff', { specIdA: idA, specIdB: idB }, 60000)
      if (!r || !r.ok) { setErr((r && r.error) || '对比失败'); setReport(null) }
      else setReport(r.report)
    } catch (e) {
      setErr(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }, [idA, idB])

  if (specs.length < 2) {
    return <Empty>对比需要两份合同：把新旧两版 openapi 文件各导入一次（同名同版本重新导入会替换原条目，改名导入即可共存），就能看清这次升级会不会炸。</Empty>
  }

  const breaking = report ? report.changes.filter((c) => c.breaking) : []
  const others = report ? report.changes.filter((c) => !c.breaking) : []

  return (
    <div>
      <SectionTitle>选择两版合同</SectionTitle>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="旧版（A）">
            <select style={inputStyle} value={idA} onChange={(e) => setIdA(e.target.value)}>
              <option value="">选择…</option>
              {specs.map((s) => <option key={s.id} value={s.id}>{s.name}{s.version ? ` v${s.version}` : ''}（{s.importedAt.slice(5, 16).replace('T', ' ')}）</option>)}
            </select>
          </Field>
        </div>
        <span style={{ color: C.muted, paddingBottom: 10 }}>→</span>
        <div style={{ flex: 1 }}>
          <Field label="新版（B）">
            <select style={inputStyle} value={idB} onChange={(e) => setIdB(e.target.value)}>
              <option value="">选择…</option>
              {specs.map((s) => <option key={s.id} value={s.id}>{s.name}{s.version ? ` v${s.version}` : ''}（{s.importedAt.slice(5, 16).replace('T', ' ')}）</option>)}
            </select>
          </Field>
        </div>
        <button style={{ ...btnStyle('primary'), marginBottom: 8 }} disabled={busy || !idA || !idB || idA === idB} onClick={doDiff}>
          {busy ? '对比中…' : '对比'}
        </button>
      </div>
      <Err msg={err} />

      {report ? (
        <>
          <div style={{ border: `1px solid ${report.summary.breaking ? C.danger : C.ok}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              {report.a.name}{report.a.version ? ` v${report.a.version}` : ''} → {report.b.name}{report.b.version ? ` v${report.b.version}` : ''}
            </div>
            {report.summary.total === 0 ? (
              <div style={{ color: C.ok, fontSize: 12 }}>✓ 两版合同结构完全一致</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
                <Badge text={`破坏性 ${report.summary.breaking}`} color={C.danger} />
                <Badge text={`告警 ${report.summary.warn}`} color={C.warn} />
                <Badge text={`信息 ${report.summary.info}`} color="#58A6FF" />
                <span style={{ color: C.muted, fontSize: 11 }}>
                  {report.summary.breaking ? '有 breaking change——先升级调用方再切换' : '无 breaking change——升级对调用方透明'}
                </span>
              </div>
            )}
          </div>

          {breaking.length ? (
            <>
              <SectionTitle>破坏性变更（客户端会挂）</SectionTitle>
              {breaking.map((c, i) => <ChangeRow key={`b.${i}`} c={c} danger />)}
            </>
          ) : null}
          {others.length ? (
            <>
              <SectionTitle>其他变化</SectionTitle>
              {others.map((c, i) => <ChangeRow key={`o.${i}`} c={c} />)}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ChangeRow({ c, danger }: { c: DiffReport['changes'][number]; danger?: boolean }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${danger ? C.danger : c.severity === 'warn' ? C.warn : '#58A6FF'}`,
      borderRadius: 6, padding: '8px 10px', marginBottom: 6, fontSize: 12,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
        <Badge text={KIND_LABEL[c.kind] || c.kind} color={danger ? C.danger : c.severity === 'warn' ? C.warn : '#58A6FF'} />
        {c.method && c.path !== '(全局)' ? (
          <span>
            <span style={{ color: METHOD_COLOR[c.method.toUpperCase()] || C.text, fontWeight: 700, marginRight: 6 }}>{c.method.toUpperCase()}</span>
            <span style={{ fontFamily: 'Consolas, monospace' }}>{c.path}</span>
          </span>
        ) : (
          <span style={{ fontFamily: 'Consolas, monospace' }}>{c.path}</span>
        )}
      </div>
      <div style={{ lineHeight: 1.6 }}>{c.detail}</div>
      {c.expected || c.actual ? (
        <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
          {c.expected ? `原：${c.expected}  ` : ''}{c.actual ? `新：${c.actual}` : ''}
        </div>
      ) : null}
    </div>
  )
}
