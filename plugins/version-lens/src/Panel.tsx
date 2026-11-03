/**
 * semver 版本范围调试台面板：范围 → 比较器展开解释 + 坑检测 + 逐版本判定表 + 排序视图。
 * 引擎复用 shared/version-core.js（与 MCP 同一权威；纯本地零外联零 kv）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/version-core.js'

const CSS = `
.vl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.vl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.vl-head b{font-size:13px}
.vl-head .sub{color:#5C6678;font-size:11px}
.vl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.vl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none}
.vl-input:focus{border-color:#4fd1a0}
.vl-area{width:100%;box-sizing:border-box;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.7 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none;resize:vertical}
.vl-area:focus{border-color:#4fd1a0}
.vl-chips{display:flex;gap:6px;flex-wrap:wrap}
.vl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.vl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.vl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.vl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.vl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.vl-set{padding:6px 0}
.vl-set .setraw{padding:2px 12px;color:#4fd1a0;font:12px ui-monospace,Consolas,monospace}
.vl-cmp{display:flex;gap:10px;padding:2px 12px;font:12px/1.8 ui-monospace,Consolas,monospace}
.vl-cmp .raw{color:#c9cede;min-width:150px;flex-shrink:0}
.vl-cmp .desc{color:#8B94A9}
.vl-warnitem{padding:4px 12px;font-size:11.5px;color:#f3b377}
.vl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.vl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.vl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.vl-tbl td.why{font-family:-apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#8B94A9}
.vl-ok{color:#4fd1a0}
.vl-bad{color:#f1a0a0}
.vl-gate{color:#f3b377}
.vl-note{color:#5C6678;font-size:11px;line-height:1.6;padding:2px 12px 8px}
.vl-sortline{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px}
.vl-sortchip{border:1px solid #2b3348;border-radius:6px;color:#c9cede;font:11px ui-monospace,Consolas,monospace;padding:2px 8px}
.vl-sortchip.pre{color:#f3b377}
.vl-sortchip.bad{color:#f1a0a0;border-style:dashed}
`

const RANGE_PRESETS = ['^1.2.3', '~0.2.3', '^0.0.3', '>=1.2.0 <1.3.0', '1.2.3 - 2.3', '^1.2.3-beta.2', '>=2.0.0 <2.0.0', '^1.2.3 || ^2.0.0', '>1.2']
const VERSION_PRESETS = ['1.2.2\n1.2.3\n1.9.9\n2.0.0\n2.0.0-alpha\n1.2.3-beta.4\n1.2.4-beta.1']

function judgeMark(row: { kind: string }) {
  if (row.kind === 'match') return <span className="vl-ok">✅ 匹配</span>
  if (row.kind === 'gate') return <span className="vl-gate">🚪 门控拦截</span>
  return <span className="vl-bad">❌ 不匹配</span>
}

export default function VersionLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void; initialRange?: string }) {
  const [rangeText, setRangeText] = useState((_props && _props.initialRange) || '^1.2.3')
  const [versionsText, setVersionsText] = useState(VERSION_PRESETS[0])

  const view = useMemo(() => {
    const parsed = core.parseRange(rangeText)
    if (!parsed.ok) return { parseError: parsed.error } as const
    const ex = core.explainRange(parsed)
    const versionList = versionsText.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0)
    const check = versionList.length > 0 ? core.buildCheckRows(rangeText, versionList) : null
    const sort = versionList.length > 0 ? core.sortVersions(versionList) : null
    return { parsed, ex, check, sort } as const
  }, [rangeText, versionsText])

  const hasCheck = 'check' in view && view.check && view.check.ok
  const checkRows = hasCheck ? (view.check as { ok: true; rows: any[] }).rows : []
  const sortData = 'sort' in view ? view.sort : null

  return (
    <div className="vl-root">
      <style>{CSS}</style>
      <div className="vl-head">
        <b>semver 版本范围调试台</b>
        <span className="sub">解释 npm 范围 · 逐版本判定 · 坑检测 · 判定引擎与 node-semver 差分对拍全等</span>
      </div>
      <div className="vl-body">
        <div>
          <div className="vl-chips" style={{ marginBottom: 6 }}>
            {RANGE_PRESETS.map((p) => (
              <span key={p} className="vl-chip" onClick={() => setRangeText(p)}>{p}</span>
            ))}
          </div>
          <input
            className="vl-input"
            value={rangeText}
            placeholder="npm semver 范围，如 ^1.2.3 / ~0.2.x / 1.2.3 - 2 || >=3 <4"
            onChange={(e) => setRangeText(e.target.value)}
          />
        </div>

        <div>
          <textarea
            className="vl-area"
            rows={5}
            value={versionsText}
            placeholder={'候选版本清单，每行一个，如：\n1.2.3\n1.2.3-beta.4\n2.0.0'}
            onChange={(e) => setVersionsText(e.target.value)}
          />
        </div>

        {'parseError' in view && <div className="vl-err">无法解析范围：{view.parseError}</div>}

        {'ex' in view && view.ex && (
          <div className="vl-card">
            <h3>范围解释（比较器展开）</h3>
            <div className="vl-set">
              {view.ex.sets.map((s: any, i: number) => (
                <div key={i} style={{ paddingBottom: i + 1 < view.ex.sets.length ? 8 : 0 }}>
                  <div className="setraw">{view.ex.sets.length > 1 ? `交集组 ${i + 1}：${s.raw}` : s.raw}</div>
                  {s.any && <div className="vl-cmp"><span className="desc">任意版本（无上下界）</span></div>}
                  {s.comparators.map((c: any, j: number) => (
                    <div key={j} className="vl-cmp">
                      <span className="raw">{c.raw}</span>
                      <span className="desc">{c.text}</span>
                    </div>
                  ))}
                  {s.empty && <div className="vl-warnitem">❌ 该组区间为空（下界不低于上界），永远不会匹配</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {'ex' in view && view.ex && view.ex.pitfalls.length > 0 && (
          <div className="vl-card">
            <h3>坑检测</h3>
            {view.ex.pitfalls.map((p: any, i: number) => (
              <div key={i} className="vl-warnitem">⚠️ {p.message}</div>
            ))}
          </div>
        )}

        {hasCheck && (
          <div className="vl-card">
            <h3>逐版本判定</h3>
            <table className="vl-tbl">
              <thead>
                <tr><th>版本</th><th>判定</th><th>说明</th></tr>
              </thead>
              <tbody>
                {checkRows.map((row: any, i: number) => (
                  <tr key={i}>
                    <td style={{ color: row.valid ? '#c9cede' : '#f1a0a0' }}>{row.valid ? row.version.raw : row.input}</td>
                    <td>{row.valid ? judgeMark(row) : <span className="vl-bad">❓ 无效</span>}</td>
                    <td className="why">{row.valid ? row.reason : row.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sortData && sortData.sorted.length > 0 && (
          <div className="vl-card">
            <h3>排序视图（升序；预发布先于同号正式版）</h3>
            <div className="vl-sortline">
              {sortData.sorted.map((it: any) => (
                <span key={it.index} className={`vl-sortchip${it.parsed.prerelease.length > 0 ? ' pre' : ''}`}>{it.raw}</span>
              ))}
              {sortData.invalid.map((iv: any, i: number) => (
                <span key={`bad${i}`} className="vl-sortchip bad" title={iv.error}>{iv.raw}</span>
              ))}
            </div>
          </div>
        )}

        <div className="vl-note">
          语义以 npm（node-semver 7）实际行为为准：预发布低于同号正式版；带预发布的版本只有范围显式包含同版本号预发布比较器时才被匹配（门控）；上界以「-0」精确排他。边界：不做 registry 网络查询、不做 loose 宽松解析（前导零等严格报错）、不支持 includePrerelease 变体。
        </div>
      </div>
    </div>
  )
}
