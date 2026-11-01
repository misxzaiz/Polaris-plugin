/**
 * SettingsTab —— 默认执行参数 / 评判档案 / 计价估算 / 数据自检。
 */
import { useState } from 'react'
import { sendCommand, type MaskedProfile, type PmSettings } from './model'

export default function SettingsTab({ profiles, settings, onChanged }: {
  profiles: MaskedProfile[]
  settings: PmSettings | null
  onChanged: () => void
}) {
  const [concurrency, setConcurrency] = useState(String(settings?.concurrency ?? 3))
  const [cellTimeoutMs, setCellTimeoutMs] = useState(String(settings?.cellTimeoutMs ?? 60000))
  const [retries, setRetries] = useState(String(settings?.retries ?? 1))
  const [judgeProfileId, setJudgeProfileId] = useState(settings?.judgeProfileId || '')
  const [judgeUserTemplate, setJudgeUserTemplate] = useState(settings?.judgeUserTemplate || '')
  const [priceIn, setPriceIn] = useState(String(settings?.priceIn ?? 0))
  const [priceOut, setPriceOut] = useState(String(settings?.priceOut ?? 0))
  const [okMsg, setOkMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setErr(''); setOkMsg(''); setBusy(true)
    try {
      const r = await sendCommand('settings_set', {
        concurrency: Number(concurrency),
        cellTimeoutMs: Number(cellTimeoutMs),
        retries: Number(retries),
        judgeProfileId,
        judgeUserTemplate,
        priceIn: Number(priceIn) || 0,
        priceOut: Number(priceOut) || 0,
      }, 15000)
      if (r.ok) { setOkMsg('设置已保存（立即生效）'); onChanged() } else setErr(r.error || '保存失败')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="pm-sec"><span className="pm-bar" />执行默认值<span className="pm-hint">「运行」页可按次覆盖</span></div>
      <div className="pm-card"><div className="pm-card-b">
        <div className="pm-row" style={{ marginBottom: 8 }}>
          <span className="pm-sub">并发</span>
          <select className="pm-sel" value={concurrency} onChange={(e) => setConcurrency(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="pm-sub">单格超时</span>
          <select className="pm-sel" value={cellTimeoutMs} onChange={(e) => setCellTimeoutMs(e.target.value)}>
            {[30000, 60000, 90000, 120000, 180000].map((n) => <option key={n} value={n}>{n / 1000}s</option>)}
          </select>
          <span className="pm-sub">失败重试</span>
          <select className="pm-sel" value={retries} onChange={(e) => setRetries(e.target.value)}>
            {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="pm-row" style={{ marginBottom: 8 }}>
          <span className="pm-sub">默认评判档案</span>
          <select className="pm-sel" style={{ flex: 1, minWidth: 180 }} value={judgeProfileId} onChange={(e) => setJudgeProfileId(e.target.value)}>
            <option value="">（不评判）</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.model}）</option>)}
          </select>
        </div>
        <textarea className="pm-ta" rows={3} placeholder="评判提示词模板（可选；可用 {{output}} 与样本变量；留空用内置严格评测员模板）"
          value={judgeUserTemplate} onChange={(e) => setJudgeUserTemplate(e.target.value)} />
        <div className="pm-row" style={{ marginTop: 8 }}>
          <span className="pm-sub">计价估算（每百万 token 单价，$；0=不估算）</span>
          <input className="pm-inp" style={{ width: 90 }} value={priceIn} onChange={(e) => setPriceIn(e.target.value)} title="输入单价" />
          <span className="pm-sub">/</span>
          <input className="pm-inp" style={{ width: 90 }} value={priceOut} onChange={(e) => setPriceOut(e.target.value)} title="输出单价" />
        </div>
        <div className="pm-sub" style={{ marginTop: 6 }}>
          例：DeepSeek-chat 输入 0.27 / 输出 1.1（以供应商现价为准）。填了之后结果页会按实际 usage 估算每次运行花费。
        </div>
        <div style={{ marginTop: 9 }}>
          <button className="pm-btn" disabled={busy} onClick={save}>保存设置</button>
        </div>
        {err ? <div className="pm-err">{err}</div> : null}
        {okMsg ? <div className="pm-ok">{okMsg}</div> : null}
      </div></div>

      <div className="pm-sec"><span className="pm-bar" />关于</div>
      <div className="pm-card"><div className="pm-card-b pm-sub">
        <div>· 数据集 × 变体批量执行：一切请求由后台服务发出，面板/AI 不直接携带 key。</div>
        <div>· 结果分层：全文落 <code>{'{appConfigDir}'}/prompt-matrix/runs/</code>，kv 只存瘦身投影（重开面板历史可复现）。</div>
        <div>· 成本护栏：发起前显式预估格子数并确认；失败重试只针对限流/5xx/网络错误；无任何定时任务。</div>
        <div>· 隐私：数据集与结果不出本机；AI 经 MCP 读到的结果与面板同源（pmtx.* 键空间）。</div>
      </div></div>
    </div>
  )
}
