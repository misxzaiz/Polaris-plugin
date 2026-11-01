/**
 * 体检 Tab：选档案 → 发起体检 → 实时进度 → 报告卡（分数/分项/兼容提示）
 * 基准测试：显式 opt-in（真实花费），分档 TTFT/TPS。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  sendCommand, loadBenchReport, scoreColor, fmtMs, fmtTps, fmtTime,
  type MaskedProfile, type ServiceMeta, type SuiteReport, type BenchReport, type StepReport,
} from './model'

interface Props {
  profiles: MaskedProfile[]
  latest: SuiteReport | null
  meta: ServiceMeta | null
  onRefresh: () => Promise<void>
}

const STEP_ORDER = ['connect', 'chat', 'models', 'stream', 'tools']
const STEP_ICON: Record<string, string> = { connect: '🔌', chat: '💬', models: '📋', stream: '🌊', tools: '🛠' }

function stepLine(s: StepReport | undefined): { ic: string; tt: string; metric: string } {
  if (!s) return { ic: '·', tt: '未执行', metric: '' }
  if (s.skipped) return { ic: '⏭', tt: `${s.label} 跳过`, metric: s.detail || '' }
  if (s.ok === false) {
    const e = s.error || { code: '?', cn: '失败' }
    return { ic: '❌', tt: `${s.label}：${e.cn} [${e.code}]`, metric: e.hint || '' }
  }
  let metric = ''
  if (s.name === 'models') metric = `${s.count ?? 0} 个模型${s.hasTarget ? '，目标模型在列 ✓' : s.hasTarget === false ? '，目标模型不在列 ⚠' : ''}${(s.sample && s.sample.length) ? `（${s.sample.slice(0, 3).join(', ')}…）` : ''}`
  else if (s.name === 'stream') metric = `TTFT ${fmtMs(s.ttftMs)} · ${fmtTps(s.tps)} · 总 ${fmtMs(s.totalMs)}${s.stopReason ? ` · ${s.stopReason}` : ''}`
  else if (s.name === 'chat') metric = `${fmtMs(s.ms)}${s.finishReason ? ` · finish=${s.finishReason}` : ''}${s.content ? ` · 「${s.content.slice(0, 24)}」` : ''}`
  else if (s.name === 'tools') metric = s.toolCalled ? `已触发 ✓ ${s.detail || ''}` : `HTTP 成功但模型未发起工具调用${s.detail ? `（${s.detail}）` : ''}`
  else metric = `HTTP 已应答（${fmtMs(s.ms)}）`
  return { ic: '✓', tt: s.label, metric }
}

function SuiteReportCard({ rep }: { rep: SuiteReport }) {
  const score = rep.score ? rep.score.total : 0
  const verdict = rep.verdict
  const warns = useMemo(() => {
    const out: string[] = []
    for (const k of STEP_ORDER) {
      const st = rep.steps && rep.steps[k]
      for (const c of (st && st.compat) || []) out.push(c)
    }
    return out
  }, [rep])
  return (
    <div className="lp-card">
      <div className="lp-card-b">
        <div className="lp-row-h" style={{ borderTop: 'none', paddingTop: 0 }}>
          <b style={{ fontSize: 13 }}>{rep.profile.name}</b>
          <span className={`lp-badge ${verdict ? verdict.level : ''}`}>{verdict ? verdict.cn : '—'}</span>
          <span className="lp-tag">{rep.profile.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'}</span>
          <span className="lp-tag lp-mono">{rep.profile.model || '(无模型)'}</span>
          <span className="lp-hint lp-mono">{fmtTime(rep.finishedAt || rep.startedAt)}</span>
        </div>
        <div className="lp-sum">
          <div><b style={{ color: scoreColor(score) }}>{score}</b><small>健康分 /100</small></div>
          <div><b className="lp-num">{rep.steps.stream && rep.steps.stream.ok ? fmtMs(rep.steps.stream.ttftMs) : '—'}</b><small>首字 TTFT</small></div>
          <div><b className="lp-num">{rep.steps.stream && rep.steps.stream.ok ? fmtTps(rep.steps.stream.tps) : '—'}</b><small>生成速度</small></div>
          <div><b className="lp-num">{rep.steps.chat && rep.steps.chat.ok ? fmtMs(rep.steps.chat.ms) : '—'}</b><small>对话延迟</small></div>
        </div>
        {rep.fatal && <div className="lp-warn" style={{ marginBottom: 6 }}>✋ {rep.fatal.cn}{rep.fatal.hint ? `：${rep.fatal.hint}` : ''}</div>}
        <div>
          {STEP_ORDER.map((k) => {
            const s = rep.steps && rep.steps[k]
            const l = stepLine(s)
            return (
              <div className="lp-step" key={k}>
                <span className="lp-step-ic">{STEP_ICON[k]}{l.ic === '·' ? '' : ''}</span>
                <span className="lp-step-ic" style={{ width: 'auto' }}>{l.ic}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="lp-step-tt">{l.tt}</span>
                  {l.metric && <span className="lp-step-metric" style={{ display: 'block' }}>{l.metric}</span>}
                </div>
                {s && s.ms != null && !s.skipped ? <span className="lp-num lp-muted">{fmtMs(s.ms)}</span> : null}
              </div>
            )
          })}
        </div>
        {rep.urls && (
          <dl className="lp-kv" style={{ marginTop: 8 }}>
            <dt>解析终点</dt><dd className="lp-mono">{rep.urls.chat}</dd>
            <dt>模型表</dt><dd className="lp-mono">{rep.urls.models}</dd>
            {rep.urls.note ? <><dt>归一方式</dt><dd>{rep.urls.note}</dd></> : null}
          </dl>
        )}
        {warns.length > 0 && (
          <div className="lp-warn" style={{ marginTop: 8, fontSize: 10.5 }}>
            {warns.slice(0, 5).map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}

function BenchCard({ rep }: { rep: BenchReport }) {
  return (
    <div className="lp-card">
      <div className="lp-card-b">
        <div className="lp-row-h" style={{ borderTop: 'none', paddingTop: 0 }}>
          <b style={{ fontSize: 13 }}>基准 · {rep.profile.name}</b>
          <span className="lp-hint lp-mono">{fmtTime(rep.finishedAt)}</span>
        </div>
        {rep.bench.sizes.length === 0 && <div className="lp-empty">无数据</div>}
        {rep.bench.sizes.map((s, i) => (
          <div key={i} className="lp-step" style={{ borderTop: i ? undefined : 'none' }}>
            <span className="lp-step-ic">{s.ttftP50 == null ? '❌' : '📊'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="lp-step-tt">≈{s.tokens} tok 提示 × {s.rounds} 轮</span>
              <span className="lp-step-metric" style={{ display: 'block' }}>
                {s.ttftP50 != null
                  ? `TTFT P50 ${fmtMs(s.ttftP50)}（${fmtMs(s.ttftMin)}~${fmtMs(s.ttftMax)}） · TPS P50 ${s.tpsP50}（${s.tpsMin}~${s.tpsMax}） · 总 ${fmtMs(s.totalP50)}${s.errs ? ` · 失败 ${s.errs} 轮` : ''}`
                  : `失败：${(s.error && s.error.cn) || '?'}`}
              </span>
            </div>
          </div>
        ))}
        {(rep.bench.compat || []).map((c, i) => <div key={i} className="lp-warn">⚠ {c}</div>)}
      </div>
    </div>
  )
}

export default function ProbeTab({ profiles, latest, meta, onRefresh }: Props) {
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [benchOn, setBenchOn] = useState(false)
  const [benchSizes, setBenchSizes] = useState<number[]>([512])
  const [benchRounds, setBenchRounds] = useState(2)
  const [benchRep, setBenchRep] = useState<BenchReport | null>(null)
  const [benchBusy, setBenchBusy] = useState(false)

  useEffect(() => {
    if (!selected && profiles.length) setSelected(profiles[0].id)
  }, [profiles, selected])

  const running = !!(meta && meta.running)
  const profile = profiles.find((p) => p.id === selected) || null

  const runSuite = async () => {
    if (!profile || busy || running) return
    setBusy(true); setErr('')
    try {
      const r = await sendCommand('run_suite', { profileId: profile.id }, 120000)
      if (r && r.ok === false && r.error && !r.pending) setErr(r.error)
    } catch (e) { setErr(String((e as Error).message || e)) }
    await onRefresh()
    setBusy(false)
  }

  const runBench = async () => {
    if (!profile || benchBusy || running) return
    setBenchBusy(true); setErr('')
    try {
      const r = await sendCommand('run_bench', { profileId: profile.id, sizes: benchSizes, rounds: benchRounds }, 360000)
      if (r && r.runId) {
        const rep = await loadBenchReport(r.runId)
        if (rep) setBenchRep(rep)
      }
      if (r && r.ok === false && r.error && !r.pending) setErr(r.error)
    } catch (e) { setErr(String((e as Error).message || e)) }
    await onRefresh()
    setBenchBusy(false)
  }

  const toggleSize = (n: number) => {
    setBenchSizes((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)))
  }

  if (!profiles.length) {
    return (
      <div className="lp-empty">
        暂无档案。<br />请到「档案」页 <b>导入宿主档案</b>（读取 Polaris 已配置的模型供应商）<br />或手动添加 OpenAI / Anthropic 兼容端点。
      </div>
    )
  }

  return (
    <>
      <div className="lp-sec"><span className="lp-bar" />发起体检<span className="lp-hint">每步 ≤16 token，花费可忽略</span></div>
      <div className="lp-card"><div className="lp-card-b">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="lp-sel" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}（{p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'} · {p.model || '无模型'}）</option>
            ))}
          </select>
          <button className="lp-btn" disabled={busy || running} onClick={runSuite}>{busy || running ? '体检中…' : '开始体检'}</button>
        </div>
        {err && <div className="lp-err" style={{ paddingLeft: 0 }}>{err}</div>}
        <div className="lp-sub" style={{ marginTop: 6 }}>
          五步体检：连通性 → 对话（鉴权+生成）→ 模型表 → 流式（TTFT/TPS）→ 工具调用；失败步骤自动给出中文诊断。
        </div>
      </div></div>

      <div className="lp-sec"><span className="lp-bar" />基准测试<span className="lp-hint lp-warn">真实花费 · 显式发起</span></div>
      <div className="lp-card"><div className="lp-card-b">
        {!benchOn ? (
          <>
            <div className="lp-sub">对端点做多档提示词（64/512/2048 ≈token）流式基准，测 TTFT 与 TPS 分位数。会发送真实生成请求产生少量费用。</div>
            <button className="lp-btn ghost sm" style={{ marginTop: 8 }} onClick={() => setBenchOn(true)}>展开基准选项</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {[64, 512, 2048].map((n) => (
                <label key={n} style={{ fontSize: 11.5, color: '#8B95A7', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={benchSizes.includes(n)} onChange={() => toggleSize(n)} />≈{n} tok
                </label>
              ))}
              <select className="lp-sel" value={benchRounds} onChange={(e) => setBenchRounds(Number(e.target.value))}>
                {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} 轮/档</option>)}
              </select>
              <button className="lp-btn green" disabled={benchBusy || running || !benchSizes.length} onClick={runBench}>{benchBusy || running ? '基准中…' : `发送 ${benchSizes.length * benchRounds} 次请求`}</button>
              <button className="lp-btn ghost sm" onClick={() => setBenchOn(false)}>收起</button>
            </div>
            <div className="lp-sub" style={{ marginTop: 6 }}>预计 {benchSizes.length * benchRounds} 次流式请求，每次生成 ≤64 token；2048 档输入 token 计费更高，请注意供应商定价。</div>
          </>
        )}
      </div></div>

      {latest && (
        <>
          <div className="lp-sec"><span className="lp-bar" />最近体检报告<span className="lp-hint">runId {latest.runId}</span></div>
          <SuiteReportCard rep={latest} />
        </>
      )}
      {benchRep && (
        <>
          <div className="lp-sec"><span className="lp-bar" />最近基准报告</div>
          <BenchCard rep={benchRep} />
        </>
      )}
      {!latest && !benchRep && <div className="lp-empty">尚无报告。选择档案后点「开始体检」。</div>}
    </>
  )
}
