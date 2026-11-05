/**
 * K8s 清单体检台面板：粘贴（多文档）K8s YAML → 行级发现 + 评分 + 规则目录。
 * 引擎复用 shared/k8s-core.js（与 MCP 同一权威）；js-yaml esbuild 打包，纯本地零外联。
 */
import { useMemo, useState } from 'react'
// @ts-expect-error js-yaml 无类型入口（esbuild 打包进 bundle）
import { load as yamlLoad } from 'js-yaml'
import * as core from '../shared/k8s-core.js'

const CSS = `
.kl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.kl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.kl-head b{font-size:13px}
.kl-head .sub{color:#5C6678;font-size:11px}
.kl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.kl-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.kl-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.kl-btn:disabled{opacity:.5;cursor:not-allowed}
.kl-tab{background:#161c2a;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.kl-tab.on{background:#1d3a2f;border-color:#2f9e44;color:#8ce0b0}
.kl-area{width:100%;min-height:220px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none;box-sizing:border-box}
.kl-area:focus{border-color:#4fd1a0}
.kl-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.kl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.kl-verdict.mid{background:#2b2413;border-color:#d19a3d;color:#f3c477}
.kl-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.kl-verdict b{font-size:14px}
.kl-score{font:600 18px/1 ui-monospace,Consolas,monospace}
.kl-doc{font-size:11.5px;color:#8B94A9;margin:4px 0 2px}
.kl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.kl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.kl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.kl-tbl .ln{text-align:right;color:#8B94A9;white-space:nowrap}
.kl-lv{border-radius:4px;padding:0 6px;font-size:10.5px}
.kl-lv.error{background:#2b1215;color:#f1a0a0}
.kl-lv.warn{background:#2b2413;color:#f3b377}
.kl-lv.info{background:#1a2030;color:#8B94A9}
.kl-fix{color:#8B94A9;font-family:inherit}
.kl-rules{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font-size:12px;line-height:1.9;color:#c9cede;white-space:pre-wrap}
.kl-note{color:#5C6678;font-size:11px;line-height:1.6}
.kl-empty{color:#5C6678;font-size:12px;text-align:center;padding:16px 0}
`

type Level = 'error' | 'warn' | 'info'
interface Finding { rule: string; level: Level; line: number; path: string; message: string; fix: string; docIndex: number }
interface DocInfo { index: number; startLine: number; endLine: number; kind: string | null; name: string | null; apiVersion: string | null; helm?: boolean; error?: boolean }
interface LintResult {
  kind: 'k8s'
  docs: DocInfo[]
  findings: Finding[]
  stats: { docs: number; rules: number; error: number; warn: number; info: number; helmDocs: number }
  score: number
  grade: string
}
type View = 'report' | 'rules'

const SAMPLE = `apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: legacy-shop
  labels:
    app: shop
    version: 2
spec:
  selector:
    matchLabels:
      app: shop
  template:
    metadata:
      labels:
        app: shop
    spec:
      hostPID: true
      containers:
        - name: web
          image: nginx:latest
          securityContext:
            privileged: true
          env:
            - name: DB_PASSWORD
              value: hunter2-prod
          resources:
            limits:
              cpu: "2"
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: shop-svc
spec:
  selector:
    app: shop
  ports:
    - port: 80
      targetPort: 3000
`

function verdictClass(score: number): string {
  if (score >= 8.5) return 'ok'
  if (score >= 5) return 'mid'
  return 'bad'
}

export default function K8sLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<string | null>(null)
  const [view, setView] = useState<View>('report')

  const result = useMemo<LintResult | null>(() => {
    if (checked === null || !checked.trim()) return null
    try {
      return (core as any).lint(checked, {
        parseYaml: (t: string) => yamlLoad(t),
      }) as LintResult
    } catch (e) {
      return null
    }
  }, [checked])

  const looksK8s = useMemo(() => (text.trim() ? (core as any).detectKind(text) as string : ''), [text])

  const run = () => setChecked(text)
  const loadSample = () => { setText(SAMPLE); setChecked(null) }
  const clear = () => { setText(''); setChecked(null) }

  const s = result ? result.stats : null

  return (
    <div className="kl-root">
      <style>{CSS}</style>
      <div className="kl-head">
        <b>K8s 清单体检台</b>
        <span className="sub">{(core as any).RULE_COUNT} 条规则 · 行级报告 · 跨资源一致性 · 纯本地离线</span>
      </div>
      <div className="kl-body">
        <textarea
          className="kl-area"
          placeholder={'粘贴 Kubernetes 清单 YAML（多文档用 --- 分隔），apply 前体检一遍……\n\napiVersion: apps/v1beta1   ← 已移除的 API 会报 error\nkind: Deployment\nmetadata:\n  name: my-app\n  labels:\n    version: 1              ← label 值不是字符串会报 error\n...\n\n对整个目录体检请直接在对话里说「用 K8s 清单体检台扫描 <目录>」'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="kl-row">
          <button className="kl-btn" onClick={run} disabled={!text.trim()}>体检</button>
          <button className="kl-btn" style={{ padding: '4px 12px' }} onClick={loadSample}>示例清单</button>
          <button className="kl-btn" style={{ padding: '4px 12px' }} onClick={clear}>清空</button>
          <span className="kl-note">{looksK8s === 'unknown' ? '⚠️ 未发现 apiVersion+kind，可能不是 K8s 清单' : ''}</span>
        </div>

        {result && s && (
          <>
            <div className={`kl-verdict ${verdictClass(result.score)}`}>
              <span className="kl-score">{result.score}</span>
              <b>{result.grade}</b>
              <span>{s.error > 0 ? `❌ ${s.error} error` : '✅ 无 error'} · ⚠️ {s.warn} warn · 💡 {s.info} info</span>
              <span className="cl-note kl-note">{s.docs} 个文档 · 规则 {s.rules} 条{s.helmDocs ? ` · Helm 跳过 ${s.helmDocs}` : ''}</span>
            </div>
            <div className="kl-row">
              <button className={`kl-tab ${view === 'report' ? 'on' : ''}`} onClick={() => setView('report')}>发现（{result.findings.length}）</button>
              <button className={`kl-tab ${view === 'rules' ? 'on' : ''}`} onClick={() => setView('rules')}>规则目录</button>
            </div>
            {view === 'report' && (
              result.findings.length === 0 ? (
                <div className="kl-empty">✅ {s.rules} 条规则扫描完毕，零发现。</div>
              ) : (
                <div>
                  {result.docs.map((d) => {
                    const fs2 = result.findings.filter((f) => f.docIndex === d.index)
                    if (!fs2.length) return null
                    const label = d.helm ? 'Helm 模板（跳过）' : d.error ? 'YAML 解析失败' : `${d.kind || '未知'}${d.name ? '/' + d.name : ''}${d.apiVersion ? ' · ' + d.apiVersion : ''}`
                    return (
                      <div key={d.index}>
                        <div className="kl-doc">文档 {d.index + 1}（行 {d.startLine}-{d.endLine}）：{label}</div>
                        <table className="kl-tbl">
                          <thead><tr><th className="ln">行</th><th>级别</th><th>规则</th><th>说明与修复</th></tr></thead>
                          <tbody>
                            {fs2.map((f, i) => (
                              <tr key={i}>
                                <td className="ln">{f.line}</td>
                                <td><span className={`kl-lv ${f.level}`}>{f.level}</span></td>
                                <td>{f.rule}</td>
                                <td>{f.message}{f.fix ? <div className="kl-fix">→ {f.fix}</div> : null}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              )
            )}
            {view === 'rules' && (
              <div className="kl-rules">{(core as any).ruleCatalog()}</div>
            )}
          </>
        )}

        {!result && (
          <div className="kl-note">
            用法：粘贴清单 → 体检。error = apply 会失败或安全红线；warn = 高度可疑/断链风险；info = 最佳实践。
            弃用 API（apps/v1beta1 等）、privileged/hostPath/明文密钥、缺探针/limits、selector 与 Service 断链都会被检出。
            对整个目录体检请直接对 AI 说「用 K8s 清单体检台扫描 &lt;目录&gt;」（MCP k8s_scan，只读）。
          </div>
        )}
      </div>
    </div>
  )
}
