/**
 * CI 体检台面板：Dockerfile / GitHub Actions 工作流双模式测试场。
 * 引擎复用 shared/ci-core.js（与 MCP 同一权威）；workflow 解析用 js-yaml（esbuild 打包，纯本地）。
 */
import { useMemo, useState } from 'react'
// @ts-expect-error js-yaml 无类型入口（esbuild 打包进 bundle）
import { load as yamlLoad } from 'js-yaml'
import * as core from '../shared/ci-core.js'

const CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.cl-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cl-tab{background:#161c2a;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.cl-tab.on{background:#1d3a2f;border-color:#2f9e44;color:#8ce0b0}
.cl-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.cl-btn:disabled{opacity:.5;cursor:not-allowed}
.cl-area{width:100%;min-height:200px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none;box-sizing:border-box}
.cl-area:focus{border-color:#4fd1a0}
.cl-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.cl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.cl-verdict.mid{background:#2b2413;border-color:#d19a3d;color:#f3c477}
.cl-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.cl-verdict b{font-size:14px}
.cl-score{font:600 18px/1 ui-monospace,Consolas,monospace}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.cl-tbl .ln{text-align:right;color:#8B94A9;white-space:nowrap}
.cl-lv{border-radius:4px;padding:0 6px;font-size:10.5px}
.cl-lv.error{background:#2b1215;color:#f1a0a0}
.cl-lv.warn{background:#2b2413;color:#f3b377}
.cl-lv.info{background:#1a2030;color:#8B94A9}
.cl-fix{color:#8B94A9;font-family:inherit}
.cl-rules{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font-size:12px;line-height:1.9;color:#c9cede}
.cl-rules code{color:#7fd4ff;background:#10141f;border-radius:3px;padding:0 4px;font-size:10.5px}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-empty{color:#5C6678;font-size:12px;text-align:center;padding:16px 0}
`

type Level = 'error' | 'warn' | 'info'
interface Finding { rule: string; level: Level; line: number | null; message: string; fix: string }
interface LintResult {
  kind: 'dockerfile' | 'workflow'
  findings: Finding[]
  stats: { lines?: number; instructions?: number; stages?: number; rules: number; error: number; warn: number; info: number }
  score: number
  grade: string
}
type KindOpt = 'auto' | 'dockerfile' | 'workflow'
type View = 'report' | 'rules'

const SAMPLE_DOCKERFILE = `FROM node
WORKDIR app
RUN apt-get update && apt-get install -y git curl
RUN curl -fsSL https://example.com/install.sh | sh
CMD echo hi
`
const SAMPLE_WORKFLOW = `name: CI
on:
  pul_request:
  push:
jobs:
  build:
    needs: [test]
    runs-on: ubunty-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo \${{ steps.nope.outputs.x }} \${{ secrets.github_token }}
  test:
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
`

function verdictClass(score: number): string {
  if (score >= 8.5) return 'ok'
  if (score >= 5) return 'mid'
  return 'bad'
}

export default function CiLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<KindOpt>('auto')
  const [checked, setChecked] = useState<{ text: string; kind: KindOpt } | null>(null)
  const [view, setView] = useState<View>('report')

  const result = useMemo<LintResult | null>(() => {
    if (checked === null || !checked.text.trim()) return null
    const r = (core as any).lint(checked.text, checked.kind, {
      // core 契约：parseYaml 返回 doc、失败抛错（core 统一归一为 {line,message}）
      parseYaml: (t: string) => yamlLoad(t),
    }) as LintResult | null
    return r
  }, [checked])

  const detected = useMemo(() => (text.trim() ? (core as any).detectKind(text) as string : ''), [text])

  const run = () => setChecked({ text, kind })
  const loadSample = (k: 'dockerfile' | 'workflow') => {
    setText(k === 'dockerfile' ? SAMPLE_DOCKERFILE : SAMPLE_WORKFLOW)
    setChecked(null)
  }

  const errCount = result ? result.stats.error : 0
  const warnCount = result ? result.stats.warn : 0
  const infoCount = result ? result.stats.info : 0

  return (
    <div className="cl-root">
      <style>{CSS}</style>
      <div className="cl-head">
        <b>CI 体检台</b>
        <span className="sub">Dockerfile 20 条 + 工作流 26 条规则 · 行级报告 · 评分 · 纯本地</span>
      </div>
      <div className="cl-body">
        <div className="cl-row">
          <button className={`cl-tab ${kind === 'auto' ? 'on' : ''}`} onClick={() => { setKind('auto'); setChecked(null) }}>自动识别</button>
          <button className={`cl-tab ${kind === 'dockerfile' ? 'on' : ''}`} onClick={() => { setKind('dockerfile'); setChecked(null) }}>Dockerfile</button>
          <button className={`cl-tab ${kind === 'workflow' ? 'on' : ''}`} onClick={() => { setKind('workflow'); setChecked(null) }}>工作流 YAML</button>
          <span className="cl-note">{text.trim() && detected !== '' ? `识别：${detected === 'dockerfile' ? 'Dockerfile' : detected === 'workflow' ? '工作流' : '无法识别'}` : ''}</span>
        </div>
        <textarea
          className="cl-area"
          placeholder={'粘贴 Dockerfile 或 GitHub Actions 工作流 YAML，push 前体检一遍……\nFROM node            ← 未钉版本会报 warn\n\njobs:\n  build:\n    runs-on: ubunty-latest   ← 拼写错误会报 warn'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="cl-row">
          <button className="cl-btn" onClick={run} disabled={!text.trim()}>体检</button>
          <button className="cl-btn" style={{ padding: '4px 12px' }} onClick={() => loadSample('dockerfile')}>示例 Dockerfile</button>
          <button className="cl-btn" style={{ padding: '4px 12px' }} onClick={() => loadSample('workflow')}>示例工作流</button>
          <button className="cl-btn" style={{ padding: '4px 12px' }} onClick={() => { setText(''); setChecked(null) }}>清空</button>
        </div>

        {result && (
          <>
            <div className={`cl-verdict ${verdictClass(result.score)}`}>
              <span className="cl-score">{result.score}</span>
              <b>{result.grade}</b>
              <span>{errCount > 0 ? `❌ ${errCount} error` : '✅ 无 error'} · ⚠️ {warnCount} warn · 💡 {infoCount} info</span>
              <span className="cl-note">{result.kind === 'dockerfile' ? `Dockerfile · ${result.stats.instructions} 条指令 · ${result.stats.stages} 阶段 · ${result.stats.lines} 行` : `工作流 · ${result.stats.lines} 行`} · 规则 {result.stats.rules} 条</span>
            </div>
            <div className="cl-row">
              <button className="cl-btn" style={{ padding: '4px 12px' }} onClick={() => setView('report')}>发现（{result.findings.length}）</button>
              <button className="cl-btn" style={{ padding: '4px 12px' }} onClick={() => setView('rules')}>规则目录</button>
            </div>
            {view === 'report' && (
              result.findings.length === 0 ? (
                <div className="cl-empty">✅ {result.stats.rules} 条规则扫描完毕，零发现。</div>
              ) : (
                <table className="cl-tbl">
                  <thead><tr><th className="ln">行</th><th>级别</th><th>规则</th><th>说明与修复</th></tr></thead>
                  <tbody>
                    {result.findings.map((f, i) => (
                      <tr key={i}>
                        <td className="ln">{f.line ?? '—'}</td>
                        <td><span className={`cl-lv ${f.level}`}>{f.level}</span></td>
                        <td>{f.rule}</td>
                        <td>{f.message}{f.fix ? <div className="cl-fix">→ {f.fix}</div> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {view === 'rules' && (
              <div className="cl-rules">
                {(core as any).ruleCatalog(result.kind).split('\n').map((l: string, i: number) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </>
        )}

        {!result && (
          <div className="cl-note">
            用法：粘贴配置 → 体检。error 会导致 CI 失败或构建错误；warn 是高度可疑/安全风险；info 是最佳实践。
            对整个仓库体检请直接在对话里说「用 CI 体检台扫描 &lt;目录&gt;」（MCP cil_scan，只读）。
          </div>
        )}
      </div>
    </div>
  )
}
