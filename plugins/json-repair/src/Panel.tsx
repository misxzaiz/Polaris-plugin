/**
 * LLM JSON 修复器面板：坏 JSON 输入 → 修复 + 修改点清单。
 * 引擎复用 shared/repair-core.js（与 MCP 同一权威，esbuild 打包进 bundle，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/repair-core.js'

const CSS = `
.jr-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.jr-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.jr-head b{font-size:13px}
.jr-head .sub{color:#5C6678;font-size:11px}
.jr-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.jr-label{color:#8B94A9;font-size:11px}
.jr-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.jr-area:focus{border-color:#4fd1a0}
.jr-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.jr-run:disabled{opacity:.5;cursor:not-allowed}
.jr-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.jr-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.jr-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.jr-verdict b{font-size:13px}
.jr-out{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede}
.jr-fixes{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.jr-fixes table{width:100%;border-collapse:collapse;font-size:11.5px}
.jr-fixes th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.jr-fixes td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace}
.jr-note{color:#5C6678;font-size:11px;line-height:1.6}
`

export default function JsonRepairPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<string | null>(null)

  const result = useMemo(() => {
    if (checked === null) return null
    return core.repair(checked)
  }, [checked])

  return (
    <div className="jr-root">
      <style>{CSS}</style>
      <div className="jr-head">
        <b>JSON 修复器</b>
        <span className="sub">LLM 输出坏 JSON 清洗 · 逐处修改点报告 · 纯本地</span>
      </div>
      <div className="jr-body">
        <div className="jr-label">待修复文本（LLM 输出的坏 JSON）</div>
        <textarea
          className="jr-area"
          placeholder={'```json\n{\'name\': \'app\', \'tags\': [\'a\',],}\n```'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="jr-run" onClick={() => setChecked(text)} disabled={!text.trim()}>修复</button>

        {result && !result.ok && (
          <div className="jr-verdict bad">
            <b>无法修复</b>：{result.error}
            <div style={{ marginTop: 4, fontSize: 11 }}>策略式修复不保证覆盖任意坏 JSON；可人工检查后分段修复。</div>
          </div>
        )}

        {result && result.ok && (
          <>
            <div className={`jr-verdict ${result.changed ? 'ok' : 'ok'}`}>
              <b>{result.changed ? `✅ 修复完成（${result.fixes.length} 处修改）` : '✅ 输入已是合法 JSON（零修改）'}</b>
            </div>
            {result.fixes.length > 0 && (
              <div className="jr-fixes">
                <table>
                  <thead><tr><th>位置</th><th>修复类型</th><th>摘录</th></tr></thead>
                  <tbody>
                    {result.fixes.map((f, i) => (
                      <tr key={i}><td>{f.pos}</td><td>{f.typeLabel}</td><td>{f.excerpt}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="jr-label">修复后 JSON（可继续用 schema-check 按 schema 校验）</div>
            <div className="jr-out">{result.json}</div>
          </>
        )}
        <div className="jr-note">
          支持策略：markdown 围栏剥离 / 装饰文本剥离 / 注释剥离 / 单引号转双 / 尾逗号剥离 / 字符串内控制字符转义 / NaN·Infinity·None·undefined → null / 裸词键加引号 / 未闭合括号·引号补全。
          <b>不保证修复任意坏 JSON</b>（不可修时如实报错）；修复的是语法合法性，值语义不保证——建议修复后用 schema-check 按 schema 校验。
        </div>
      </div>
    </div>
  )
}
