/**
 * SelftestTab —— 试金石自检：一键验证服务真实可用（临时探针路由打真请求，用后即删）
 * 报告持久化在 mck.selftest（面板打开即见最近一次结果，无需等轮询）。
 */
import { useState } from 'react'
import type { PanelData, Toast } from '../Panel'
import { baseUrl, getSelftestReport, sendCommand, type SelftestReport } from '../model'

const CHECK_INTRO: Array<{ id: string; why: string }> = [
  { id: '模板引擎', why: '{{int}}/{{cname}}/{{email}}/{{bool}} 真实渲染成合法 JSON' },
  { id: '路径参数', why: ':id 参数与 ?query 回显进响应体' },
  { id: '延迟注入', why: '600ms 延迟真实生效（实测 ≥450ms）' },
  { id: '错误注入', why: '100% 错误率 → 500 + 注入标记' },
  { id: 'POST体回显', why: '{{req.body.*}} 取中文请求体字段' },
  { id: '404诊断', why: '未匹配路径返回带 hint 的诊断体' },
  { id: 'CORS预检', why: 'OPTIONS 预检回显 Origin（浏览器跨域可用）' },
]

export default function SelftestTab({ data, running, reload, showToast }: { data: PanelData; running: boolean; reload: () => Promise<PanelData>; showToast: Toast }) {
  const [report, setReport] = useState<SelftestReport | null>(null)
  const [busy, setBusy] = useState(false)
  const shown = report || data.selftestReport || null

  const run = async () => {
    if (!running) { showToast('服务未运行，无法自检', 'bad'); return }
    setBusy(true)
    showToast('自检中（约 1-2 秒，临时路由打真请求）…', 'info')
    const r = await sendCommand<{ report?: SelftestReport }>('selftest', {}, 45000)
    setBusy(false)
    if (!r.ok) { showToast(r.error || '自检失败', 'bad'); await reload(); return }
    const fresh = await getSelftestReport()
    setReport(fresh)
    await reload()
    showToast(r.report && r.report.allGreen ? `自检全绿 ${r.report.passed}/${r.report.total}` : '自检有失败项，看下方明细', r.report && r.report.allGreen ? 'good' : 'bad')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ padding: 10, borderRadius: 8, background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.25)', fontSize: 12, color: '#93c5fd', lineHeight: 1.8 }}>
        试金石自检 = 临时挂 5 条探针路由，逐项向 <code>{baseUrl(data.meta)}</code> 发<b>真实 HTTP 请求</b>并断言响应，跑完即删。
        全绿说明：模板引擎 / 参数回显 / 延迟注入 / 错误注入 / 请求体回显 / 404 诊断 / CORS 预检 七项能力真实可用——
        不是「代码写完了」，是「现场跑通了」。
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={run} disabled={busy || !running} style={{
          padding: '6px 16px', fontSize: 12, borderRadius: 8, cursor: busy || !running ? 'wait' : 'pointer',
          background: 'rgba(59,130,246,.2)', border: '1px solid #3b82f6', color: '#93c5fd', minHeight: 30,
        }}>{busy ? '自检中…' : '▶ 运行自检'}</button>
        {shown && (
          <span style={{ fontSize: 11, color: '#71717a' }}>
            最近一次：{shown.allGreen ? '✅' : '❌'} {shown.passed}/{shown.total}（{new Date(shown.at).toLocaleTimeString()}）
          </span>
        )}
      </div>

      {shown && (
        <div style={{ padding: 10, borderRadius: 8, background: shown.allGreen ? 'rgba(63,185,80,.06)' : 'rgba(248,81,73,.06)', border: `1px solid ${shown.allGreen ? 'rgba(63,185,80,.35)' : 'rgba(248,81,73,.35)'}` }}>
          {shown.checks.map((c) => {
            const why = CHECK_INTRO.find((x) => c.item.includes(x.id))
            return (
              <div key={c.item} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ color: c.pass ? '#3fb950' : '#f85149' }}>{c.pass ? '✅' : '❌'}</span>
                <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{c.item}</span>
                <span style={{ color: '#71717a', fontSize: 11 }}>{c.detail}</span>
                {why && <span style={{ color: '#52525b', fontSize: 10 }}>({why.why})</span>}
                <span style={{ flex: 1 }} />
                <span style={{ color: '#52525b', fontSize: 10 }}>{c.ms}ms</span>
              </div>
            )
          })}
          <div style={{ marginTop: 6, fontSize: 11, color: '#71717a' }}>
            耗时 {shown.durationMs}ms · 报告已存本机（mck.selftest），AI 可经 mock_selftest 工具随时复查
          </div>
        </div>
      )}

      {!shown && (
        <div style={{ padding: 16, textAlign: 'center', color: '#71717a', fontSize: 12 }}>
          还没跑过自检。装好后先点一次「运行自检」，确认工具链真实可用再接入你的项目。
        </div>
      )}
    </div>
  )
}
