/**
 * Markdown 结构检查器面板：markdown 输入 → 体检报告 + 标题树双视图。
 * 引擎复用 shared/md-core.js（与 MCP 同一权威，esbuild 打包进 bundle，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/md-core.js'

const CSS = `
.ml-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ml-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ml-head b{font-size:13px}
.ml-head .sub{color:#5C6678;font-size:11px}
.ml-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ml-area{width:100%;min-height:180px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.ml-area:focus{border-color:#4fd1a0}
.ml-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.ml-run:disabled{opacity:.5;cursor:not-allowed}
.ml-verdict{border-radius:8px;padding:8px 13px;font-size:12.5px;border:1px solid}
.ml-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.ml-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.ml-verdict b{font-size:13px}
.ml-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.ml-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.ml-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.ml-tbl .ln{text-align:right;color:#8B94A9;white-space:nowrap}
.ml-lv{border-radius:4px;padding:0 6px;font-size:10.5px}
.ml-lv.error{background:#2b1215;color:#f1a0a0}
.ml-lv.warn{background:#2b2413;color:#f3b377}
.ml-lv.info{background:#1a2030;color:#8B94A9}
.ml-tree{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.8 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#c9cede}
.ml-note{color:#5C6678;font-size:11px;line-height:1.6}
`

type View = 'findings' | 'outline'

export default function MarkdownLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [checked, setChecked] = useState<string | null>(null)
  const [view, setView] = useState<View>('findings')

  const result = useMemo(() => {
    if (checked === null) return null
    const r = core.lint(checked) as {
      findings: { line: number; rule: string; level: string; message: string }[]
      outline: { line: number; level: number; text: string; slug: string }[]
      stats: { lines: number; headings: number; errors: number; warns: number; infos: number }
    }
    return r
  }, [checked])

  return (
    <div className="ml-root">
      <style>{CSS}</style>
      <div className="ml-head">
        <b>Markdown 检查器</b>
        <span className="sub">结构体检 · 12 规则行级报告 · 围栏感知 · 纯本地</span>
      </div>
      <div className="ml-body">
        <textarea
          className="ml-area"
          placeholder={'# 标题\n\n## 章节\n\n[断链](#不存在)\n![无alt](x.png)\nTODO: ...'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="ml-run" onClick={() => setChecked(text)} disabled={!text.trim()}>检查</button>

        {result && (
          <>
            <div className={`ml-verdict ${result.stats.errors > 0 ? 'bad' : 'ok'}`}>
              <b>{result.stats.errors > 0 ? `❌ ${result.stats.errors} 处错误` : '✅ 无错误'}</b>
              {' · '}{result.stats.warns} 警告 · {result.stats.infos} 提示 · {result.stats.lines} 行 {result.stats.headings} 标题
            </div>
            <div className="sm-row" style={{ display: 'flex', gap: 6 }}>
              <button className="ml-run" style={{ padding: '4px 12px' }} onClick={() => setView('findings')}>发现（{result.findings.length}）</button>
              <button className="ml-run" style={{ padding: '4px 12px' }} onClick={() => setView('outline')}>标题树（{result.outline.length}）</button>
            </div>
            {view === 'findings' && result.findings.length > 0 && (
              <table className="ml-tbl">
                <thead><tr><th className="ln">行</th><th>级别</th><th>规则</th><th>说明</th></tr></thead>
                <tbody>
                  {result.findings.map((f, i) => (
                    <tr key={i}>
                      <td className="ln">{f.line}</td>
                      <td><span className={`ml-lv ${f.level}`}>{f.level}</span></td>
                      <td>{f.rule}</td>
                      <td>{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view === 'findings' && result.findings.length === 0 && (
              <div className="ml-verdict ok">未发现结构问题</div>
            )}
            {view === 'outline' && (
              <div className="ml-tree">{core.renderOutline(result.outline)}</div>
            )}
          </>
        )}
        <div className="ml-note">
          规则（12 条）：标题跳级/多 h1/首标题非 h1/锚点断链（GitHub slug，中文标题兼容）/空链接/裸 URL/图片无 alt/表格列数不齐/代码块无语言/重复标题/TODO 残留/行尾空白（硬换行双空格豁免）。
          代码块内伪 markdown 不误报（围栏状态感知）；不做链接网络可达性探测。
        </div>
      </div>
    </div>
  )
}
