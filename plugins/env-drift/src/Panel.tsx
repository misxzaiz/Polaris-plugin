/**
 * .env 漂移检查器面板：双文本框对比测试场（example vs actual）。
 * 解析/diff/报告引擎复用 shared/env-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle，纯本地零外联——actual 值原文不离开本机，报告按脱敏红线渲染）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/env-core.js'

const CSS = `
.ed-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.ed-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ed-head b{font-size:13px}
.ed-head .sub{color:#5C6678;font-size:11px}
.ed-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.ed-cols{display:flex;gap:10px}
.ed-col{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.ed-col label{color:#8B94A9;font-size:11px}
.ed-area{width:100%;min-height:150px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.ed-area:focus{border-color:#4fd1a0}
.ed-run{align-self:flex-start;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 18px;font-size:12px;cursor:pointer}
.ed-run:disabled{opacity:.5;cursor:not-allowed}
.ed-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.ed-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.ed-verdict.drift{background:#2b2413;border-color:#e8590c;color:#f3b377}
.ed-verdict b{font-size:13px}
.ed-report{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#c9cede}
.ed-note{color:#5C6678;font-size:11px;line-height:1.6}
`

export default function EnvDriftPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [example, setExample] = useState('')
  const [actual, setActual] = useState('')
  const [checked, setChecked] = useState<{ ex: string; ac: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const result = useMemo(() => {
    if (!checked) return null
    try {
      const ex = core.parseEnv(checked.ex)
      const ac = core.parseEnv(checked.ac)
      const report = core.renderReport(ex, ac, { example: ex, actual: ac })
      const d = core.diffEnv(ex, ac)
      return { report, ok: d.summary.ok && d.summary.extra === 0 && d.summary.emptyInActual === 0 }
    } catch (e) {
      setError(String((e as Error).message || e))
      return null
    }
  }, [checked])

  const run = () => {
    setError(null)
    setChecked({ ex: example, ac: actual })
  }

  return (
    <div className="ed-root">
      <style>{CSS}</style>
      <div className="ed-head">
        <b>.env 漂移检查器</b>
        <span className="sub">example vs 实际 .env · 值脱敏 · 纯本地</span>
      </div>
      <div className="ed-body">
        <div className="ed-cols">
          <div className="ed-col">
            <label>.env.example（占位符语义，值可显示）</label>
            <textarea
              className="ed-area"
              placeholder={'API_KEY=placeholder\nDB_URL=postgres://localhost/app'}
              value={example}
              onChange={(e) => setExample(e.target.value)}
            />
          </div>
          <div className="ed-col">
            <label>实际 .env（值原文不进报告）</label>
            <textarea
              className="ed-area"
              placeholder={'API_KEY=sk-真实密钥\nDB_URL=postgres://prod/app'}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </div>
        </div>
        <button className="ed-run" onClick={run} disabled={!example.trim() || !actual.trim()}>对比</button>
        {error && <div className="ed-verdict drift"><b>解析失败</b>：{error}</div>}
        {result && (
          <>
            <div className={`ed-verdict ${result.ok ? 'ok' : 'drift'}`}>
              <b>{result.ok ? '✅ 无漂移' : '⚠️ 发现漂移'}</b>
              {result.ok ? ' example 与实际键位一致' : ' 见下方明细'}
            </div>
            <div className="ed-report">{result.report}</div>
          </>
        )}
        <div className="ed-note">
          对比维度：缺失键（部署会缺配置）/ 多余键（建议回填 example）/ 值差异（脱敏——报告只判「不同」，绝不展示实际值原文）/ 实际空值键 / 重复键 / 格式错误行。
          解析支持：引号值、export 前缀、行内注释（# 前须有空格）、空值；不做 ${'{VAR}'} 插值展开（原样保留）。
        </div>
      </div>
    </div>
  )
}
