/**
 * 防注入检查器面板：文本粘贴测试场 + 规则清单。
 * 检测引擎复用 shared/injection-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle，纯本地零外联——文本不出本机）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/injection-core.js'

const CSS = `
.pg-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.pg-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pg-head b{font-size:13px}
.pg-head .sub{color:#5C6678;font-size:11px}
.pg-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.pg-tabs{display:flex;gap:6px}
.pg-tab{background:#20263A;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.pg-tab.on{background:#2b3348;color:#E6EAF2;border-color:#3a4358}
.pg-area{width:100%;min-height:160px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.pg-area:focus{border-color:#4fd1a0}
.pg-meta{display:flex;gap:12px;color:#5C6678;font-size:11px}
.pg-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.pg-verdict.clean{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.pg-verdict.suspicious{background:#2b2413;border-color:#e8590c;color:#f3b377}
.pg-verdict.dangerous{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.pg-verdict b{font-size:13px}
.pg-finds{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.pg-finds table{width:100%;border-collapse:collapse;font-size:11.5px}
.pg-finds th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:6px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.pg-finds td{padding:7px 10px;border-bottom:1px solid #161c2a;vertical-align:top}
.pg-finds tr:last-child td{border-bottom:none}
.pg-prev{font-family:ui-monospace,Consolas,monospace;color:#c9cede;word-break:break-all}
.pg-rule{padding:7px 10px;border-bottom:1px solid #161c2a;font-size:11.5px;display:flex;gap:8px;align-items:baseline}
.pg-rule:last-child{border-bottom:none}
.pg-w{color:#9f9aF0;font-family:ui-monospace,Consolas,monospace;white-space:nowrap}
.pg-note{color:#5C6678;font-size:11px;line-height:1.6}
`

type Tab = 'test' | 'rules'

export default function PromptGuardPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('test')
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<string | null>(null)

  const result = useMemo(() => (checked !== null ? core.checkText(checked) : null), [checked])

  const run = () => setChecked(text)
  const rules = useMemo(() => core.listRules(), [])

  return (
    <div className="pg-root">
      <style>{CSS}</style>
      <div className="pg-head">
        <b>防注入检查器</b>
        <span className="sub">Prompt injection 风险检测 · 纯本地 · 文本不出本机</span>
      </div>
      <div className="pg-body">
        <div className="pg-tabs">
          <button className={`pg-tab ${tab === 'test' ? 'on' : ''}`} onClick={() => setTab('test')}>检测</button>
          <button className={`pg-tab ${tab === 'rules' ? 'on' : ''}`} onClick={() => setTab('rules')}>规则（{rules.length}）</button>
        </div>

        {tab === 'test' && (
          <>
            <textarea
              className="pg-area"
              placeholder="粘贴待检文本：网页抓取内容 / 文件内容 / 任何将喂给 AI 的外部文本……"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="pg-meta">
              <span>{text.length} 字符</span>
              <span>规则 {rules.length} 条</span>
              <span>纯本地正则+启发式，无模型调用</span>
            </div>
            <button
              className="pg-tab on"
              style={{ alignSelf: 'flex-start', padding: '6px 18px' }}
              onClick={run}
              disabled={!text.trim()}
            >
              检测
            </button>
            {result && (
              <>
                <div className={`pg-verdict ${result.level}`}>
                  <b>{core.levelLabel(result.level)}</b>（{result.level}）· 风险分 {result.score}
                  {' · '}命中 {result.findings.length} 条规则
                  {result.level === 'dangerous' && ' —— 建议不要直接喂给主对话模型'}
                </div>
                {result.findings.length > 0 && (
                  <div className="pg-finds">
                    <table>
                      <thead>
                        <tr><th>类别</th><th>规则</th><th className="num">权重×次数</th><th>命中片段（脱敏截断）</th></tr>
                      </thead>
                      <tbody>
                        {result.findings.map((f) => (
                          <tr key={f.ruleId}>
                            <td>{f.category}</td>
                            <td>{f.ruleId}</td>
                            <td className="num">{f.weight}×{f.count}</td>
                            <td className="pg-prev">{f.preview}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <div className="pg-note">
              局限（如实）：纯规则+启发式能拦常见已知模式，不能替代语义级判断；分数高≠必然攻击，分数低≠绝对安全。高风险来源（网页/陌生文件）建议结合人工复核。
            </div>
          </>
        )}

        {tab === 'rules' && (
          <div className="pg-finds">
            {rules.map((r) => (
              <div className="pg-rule" key={r.id}>
                <span className="pg-w">w{r.weight}</span>
                <span><b>{r.id}</b>（{r.category}）—— {r.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
