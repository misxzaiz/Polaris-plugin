/**
 * .gitignore 检查器面板：规则框 + 路径框 → 判定表。
 * 引擎复用 shared/gitignore-core.js（与 MCP 同一权威，esbuild 打包进 bundle，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/gitignore-core.js'

const CSS = `
.gl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.gl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.gl-head b{font-size:13px}
.gl-head .sub{color:#5C6678;font-size:11px}
.gl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.gl-cols{display:flex;gap:10px}
.gl-col{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.gl-col label{color:#8B94A9;font-size:11px}
.gl-area{width:100%;min-height:130px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.gl-area:focus{border-color:#4fd1a0}
.gl-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.gl-run:disabled{opacity:.5;cursor:not-allowed}
.gl-verdict{border-radius:8px;padding:8px 13px;font-size:12px;border:1px solid}
.gl-verdict.bad{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.gl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.gl-tbl{width:100%;border-collapse:collapse;font-size:12px}
.gl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:6px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.gl-tbl td{padding:6px 10px;border-bottom:1px solid #161c2a;vertical-align:top;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.gl-badge{border-radius:5px;padding:1px 8px;font-size:11px;white-space:nowrap}
.gl-badge.ig{background:#2b1215;color:#f1a0a0}
.gl-badge.keep{background:#12241a;color:#8ce0b0}
.gl-trap{color:#f3b377}
.gl-notes{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.gl-notes .n{padding:6px 12px;font-size:11.5px;color:#f3b377;border-bottom:1px solid #161c2a;line-height:1.6}
.gl-notes .n:last-child{border-bottom:none}
.gl-note{color:#5C6678;font-size:11px;line-height:1.6}
`

export default function GitignoreLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [giText, setGiText] = useState('')
  const [pathsText, setPathsText] = useState('')
  const [checked, setChecked] = useState<{ gi: string; paths: string[] } | null>(null)

  const result = useMemo(() => {
    if (!checked) return null
    const parsed = core.parseGitignore(checked.gi)
    const j = core.judgePaths(parsed, checked.paths)
    const traps = core.detectTraps(parsed)
    return { results: j.results, traps }
  }, [checked])

  const run = () => {
    const paths = pathsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    if (!giText.trim() || !paths.length) return
    setChecked({ gi: giText, paths })
  }

  return (
    <div className="gl-root">
      <style>{CSS}</style>
      <div className="gl-head">
        <b>.gitignore 检查器</b>
        <span className="sub">逐路径判定 · 命中行号 · 坑检测 · 纯本地</span>
      </div>
      <div className="gl-body">
        <div className="gl-cols">
          <div className="gl-col">
            <label>.gitignore 规则</label>
            <textarea
              className="gl-area"
              placeholder={'*.log\n!important.log\nbuild/\n/root.txt'}
              value={giText}
              onChange={(e) => setGiText(e.target.value)}
            />
          </div>
          <div className="gl-col">
            <label>待判定路径（每行一条，相对仓库根）</label>
            <textarea
              className="gl-area"
              placeholder={'debug.log\nimportant.log\nbuild/output.txt\nsub/root.txt'}
              value={pathsText}
              onChange={(e) => setPathsText(e.target.value)}
            />
          </div>
        </div>
        <button className="gl-run" onClick={run} disabled={!giText.trim() || !pathsText.trim()}>判定</button>

        {result && (
          <>
            {result.traps.length > 0 && (
              <div className="gl-notes">
                {result.traps.map((t, i) => <div className="n" key={i}>⚠ {t}</div>)}
              </div>
            )}
            <table className="gl-tbl">
              <thead><tr><th>判定</th><th>路径</th><th>原因</th></tr></thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td><span className={`gl-badge ${r.ignored ? 'ig' : 'keep'}`}>{r.ignored ? '忽略' : '保留'}</span></td>
                    <td>{r.path}</td>
                    <td className={r.trap ? 'gl-trap' : ''}>
                      {r.reason}
                      {r.trap && ' ⚠ 否定被父目录压住——git 不进入被忽略目录，否定规则无效'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {result && result.results.every((r) => !r.ignored) && (
          <div className="gl-verdict ok">全部路径均未被忽略</div>
        )}
        <div className="gl-note">
          语义边界（如实）：解析单一规则清单（不含嵌套 .gitignore / .git/info/exclude / 全局配置）；gitignore 官方语义常用子集——
          注释/否定(!)/锚定(/)/目录限定(/ 尾)/通配(* ? [...] 双星)；判定顺序=最后匹配规则胜出；<b>父目录被忽略后 git 不进入该目录，否定无法复活其中文件</b>（正确写法：用 <code>/*</code> 配否定，而非目录名整体忽略）。
          本实现语义已用本机 git check-ignore 实测对照锚定。
        </div>
      </div>
    </div>
  )
}
