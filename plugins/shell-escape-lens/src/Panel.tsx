/**
 * Shell 转义对照台面板：文本 → 三 shell 引用对照表 + 反向解析测试场。
 * 引擎复用 shared/escape-core.js（与 MCP 同一权威，esbuild 打包进 bundle，纯本地零外联）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/escape-core.js'

const CSS = `
.se-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.se-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.se-head b{font-size:13px}
.se-head .sub{color:#5C6678;font-size:11px}
.se-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.se-area{width:100%;min-height:110px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.se-area:focus{border-color:#4fd1a0}
.se-row{display:flex;gap:8px;align-items:center}
.se-input{flex:1;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:6px 10px;outline:none}
.se-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer}
.se-btn:disabled{opacity:.5;cursor:not-allowed}
.se-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.se-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.se-quote{padding:8px 12px;font:12px/1.7 ui-monospace,Consolas,monospace;word-break:break-all}
.se-quote .lbl{color:#8B94A9;margin-right:8px}
.se-caveat{padding:6px 12px;color:#f3b377;font-size:11.5px}
.se-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.se-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333}
.se-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;vertical-align:top}
.se-argv{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.8 ui-monospace,Consolas,monospace;white-space:pre-wrap;color:#8ce0b0}
.se-note{color:#5C6678;font-size:11px;line-height:1.6}
`

export default function ShellEscapeLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [text, setText] = useState('')
  const [line, setLine] = useState('')
  const [shell, setShell] = useState<'bash' | 'powershell' | 'cmd'>('bash')
  const [quoted, setQuoted] = useState<string | null>(null)
  const [parsed, setParsed] = useState<string | null>(null)

  const quoteResult = useMemo(() => {
    if (quoted === null) return null
    return core.quoteAll(quoted)
  }, [quoted])

  const parseResult = useMemo(() => {
    if (parsed === null) return null
    type ParseResult = { ok: boolean; argv?: string[]; error?: string }
    const parsers = (core as unknown as { PARSERS: Record<string, (l: string) => ParseResult> }).PARSERS
    const parser = parsers[shell]
    return parser(parsed)
  }, [parsed, shell])

  return (
    <div className="se-root">
      <style>{CSS}</style>
      <div className="se-head">
        <b>Shell 转义对照台</b>
        <span className="sub">bash/cmd/powershell 引用对照 · argv 还原 · bash round-trip 实测锚定</span>
      </div>
      <div className="se-body">
        <div className="se-label" style={{ color: '#8B94A9', fontSize: 11 }}>待引用文本</div>
        <textarea
          className="se-area"
          placeholder={'say $HOME `id` "quoted" | stop'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="se-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setQuoted(text)} disabled={!text.trim()}>对照</button>

        {quoteResult && (
          <div className="se-card">
            <h3>三 shell 安全引用对照</h3>
            <div className="se-quote"><span className="lbl">bash:</span>{quoteResult.bash}</div>
            <div className="se-quote"><span className="lbl">powershell:</span>{quoteResult.powershell}</div>
            <div className="se-quote"><span className="lbl">cmd:</span>{quoteResult.cmd}</div>
            {quoteResult.cmdCaveat && <div className="se-caveat">⚠ cmd: {quoteResult.cmdCaveat}</div>}
            {quoteResult.specials.length > 0 && (
              <table className="se-tbl">
                <thead><tr><th>字符</th><th>bash</th><th>powershell</th><th>cmd</th></tr></thead>
                <tbody>
                  {quoteResult.specials.map((sp, i) => (
                    <tr key={i}><td>{sp.char}</td><td>{sp.bash}</td><td>{sp.powershell}</td><td>{sp.cmd}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="se-label" style={{ color: '#8B94A9', fontSize: 11 }}>反向解析：命令行 → argv（看实际参数）</div>
        <div className="se-row">
          <input className="se-input" value={line} onChange={(e) => setLine(e.target.value)} placeholder='echo "hello world" plain' />
          <select className="se-input" style={{ width: 130 }} value={shell} onChange={(e) => setShell(e.target.value as typeof shell)}>
            <option value="bash">bash</option>
            <option value="powershell">powershell</option>
            <option value="cmd">cmd</option>
          </select>
          <button className="se-btn" onClick={() => setParsed(line)} disabled={!line.trim()}>解析</button>
        </div>
        {parseResult && (
          parseResult.ok
            ? <div className="se-argv">{(parseResult.argv ?? []).map((a, i) => `[${i}] ${a}`).join('\n')}</div>
            : <div className="se-verdict" style={{ background: '#2b1215', border: '1px solid #e03131', borderRadius: 8, padding: '8px 13px', color: '#f1a0a0' }}>{parseResult.error}</div>
        )}
        <div className="se-note">
          语义边界（如实）：bash 单引号 POSIX 安全策略（内部无转义，' 闭合续接）；powershell 单引号翻倍；cmd 内部双引号无干净转义（模糊区如实标注）；
          parse 为常用子集（变量/命令替换不展开，看字面参数）。bash 引用产物已用本机 bash round-trip 实测锚定（12 组危险样本全对齐）。
        </div>
      </div>
    </div>
  )
}
