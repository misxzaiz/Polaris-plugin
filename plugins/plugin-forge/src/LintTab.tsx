/**
 * 体检 Tab：粘贴/上传 plugin.json → 实测规则体检报告。
 * 规则引擎在 shared/forge-core（与 MCP forge_lint 同口径）。
 */
import React, { useMemo, useState } from 'react'
import { lintManifest } from '../shared/forge-core'

interface Issue { rule: string; msg: string; fix: string }

const S = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  area: {
    width: '100%', boxSizing: 'border-box' as const, minHeight: 180, padding: 10,
    borderRadius: 8, border: '1px solid var(--p-border, rgba(128,128,128,.3))',
    background: 'transparent', color: 'inherit', fontSize: 12, fontFamily: 'monospace',
  },
  btn: {
    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'var(--p-accent, #4a7dff)', color: '#fff', alignSelf: 'flex-start' as const,
  },
  group: { padding: '10px 12px', borderRadius: 8 },
  issueRule: { fontFamily: 'monospace', fontSize: 11, opacity: 0.75 },
}

function IssueList({ kind, issues }: { kind: 'error' | 'warn' | 'info'; issues: Issue[] }) {
  if (!issues.length) return null
  const bg = kind === 'error' ? 'rgba(220,70,70,.12)' : kind === 'warn' ? 'rgba(230,170,40,.12)' : 'var(--p-panel, rgba(128,128,128,.08))'
  const icon = kind === 'error' ? '✗' : kind === 'warn' ? '⚠' : 'ℹ'
  const label = kind === 'error' ? '错误（会被拒/必炸）' : kind === 'warn' ? '警告（踩过坑的）' : '提示'
  return (
    <div style={{ ...S.group, background: bg }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{icon} {label}（{issues.length}）</div>
      {issues.map((it, i) => (
        <div key={i} style={{ marginBottom: 8, lineHeight: 1.6 }}>
          <div><span style={S.issueRule}>[{it.rule}]</span> {it.msg}</div>
          <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)' }}>→ {it.fix}</div>
        </div>
      ))}
    </div>
  )
}

export default function LintTab() {
  const [text, setText] = useState('')
  const [ran, setRan] = useState(false)

  const report = useMemo(() => (ran ? lintManifest(text) : null), [ran, text])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setText(await f.text())
    setRan(true)
  }

  return (
    <div style={S.wrap}>
      <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)' }}>
        粘贴 plugin.json 内容（或选文件）→ 按 20+ 条实测规则体检：必填项、图标 18 白名单、服务健康检查、MCP 声明、发布 URL @tag 陷阱……
      </div>
      <input type="file" accept=".json,application/json" onChange={(e) => onFile(e.target.files?.[0])} />
      <textarea
        style={S.area}
        placeholder={'{\n  "id": "my-plugin",\n  "name": "我的插件",\n  "version": "0.1.0",\n  ...\n}'}
        value={text}
        onChange={(e) => { setText(e.target.value); setRan(false) }}
      />
      <button style={S.btn} onClick={() => setRan(true)} disabled={!text.trim()}>开始体检</button>
      {report && (
        <div>
          <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>
            {report.ok ? '✅ 通过（无错误）' : '❌ 有错误，修完再发'} · 共检查 {report.checked} 项 ·
            错误 {report.errors.length} / 警告 {report.warns.length} / 提示 {report.infos.length}
          </div>
          <IssueList kind="error" issues={report.errors} />
          <IssueList kind="warn" issues={report.warns} />
          <IssueList kind="info" issues={report.infos} />
        </div>
      )}
    </div>
  )
}
