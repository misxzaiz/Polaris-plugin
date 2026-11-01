/**
 * 扫描 Tab：目标目录 + 开始扫描 + 进度 + 完成摘要
 * 命令链：写 keyscan.cmd.scan.<nonce> → 服务读载荷删键互斥消费 → 轮询扫描记录。
 */
import { useCallback, useEffect, useState } from 'react'
import { kvGet, kvSet, requestScan, saveSettings, type LatestSummary, type ScanSettings, type ServiceMeta } from './model'

const LAST_ROOT_KEY = 'keyscan.ui.lastRoot' // 面板本地 UI 偏好（也在契约表登记）

interface Props {
  head: { meta: ServiceMeta | null; latest: LatestSummary | null }
  onChanged: () => void
  onGoFindings: () => void
}

export default function ScanTab({ head, onChanged, onGoFindings }: Props) {
  const [root, setRoot] = useState('')
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    kvGet<string>(LAST_ROOT_KEY).then((v) => { if (v) setRoot(v) })
    // settings.root 作为默认建议（首次使用引导）
    kvSet('keyscan.ui.loaded', true).catch(() => {})
  }, [])

  const start = useCallback(async () => {
    if (busy) return
    setBusy(true); setErr(''); setResult(null); setTick('')
    void kvSet(LAST_ROOT_KEY, root.trim())
    try {
      const out = await requestScan(root, (info) => setTick(info))
      if (out.ok) {
        const c = out.counts ?? { critical: 0, high: 0, medium: 0 }
        const nw = out.new ?? { newCount: 0, newCritical: 0, newHigh: 0 }
        setResult(
          `发现 ${out.findingCount ?? 0} 处疑似密钥（🔴${c.critical} 🟠${c.high} 🟡${c.medium}）` +
          `，新增 ${nw.newCount}（🔴${nw.newCritical} 🟠${nw.newHigh}）` +
          `，文件 ${out.files ?? 0} 个，用时 ${Math.round((out.durationMs ?? 0) / 1000)}s` +
          (out.truncated ? '（已达上限，未扫全）' : ''),
        )
        onChanged()
      } else {
        setErr(out.error || '扫描失败')
      }
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false); setTick('')
    }
  }, [busy, root, onChanged])

  const saveDefaultRoot = useCallback(async () => {
    const s: ScanSettings = {}
    try {
      const cur = await import('./model').then((m) => m.kvGet<ScanSettings>('keyscan.settings'))
      Object.assign(s, cur ?? {})
    } catch (_) { /* 忽略读取失败 */ }
    s.root = root.trim()
    await saveSettings(s)
    setTick('已设为默认扫描根（设置里可改）')
  }, [root])

  const scanning = head.meta?.scanning

  return (
    <>
      <div className="ks-sec"><span className="ks-bar" />发起扫描<span className="ks-hint">只读 · 零外网 · 报告全掩码</span></div>
      <div className="ks-card"><div className="ks-card-b">
        <input
          className="ks-inp ks-mono"
          placeholder="要扫描的目录绝对路径，如 D:\\work\\my-project"
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void start() }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
          <button className="ks-btn" disabled={busy || !root.trim()} onClick={() => void start()}>
            {busy ? '扫描中…' : '开始扫描'}
          </button>
          <button className="ks-btn ghost" disabled={busy || !root.trim()} onClick={() => void saveDefaultRoot()}>设为默认</button>
        </div>
        {tick && <div className="ks-sub" style={{ marginTop: 8 }}>{tick}</div>}
        {err && <div className="ks-err" style={{ paddingLeft: 0, marginTop: 6 }}>{err}</div>}
        {scanning && (
          <div className="ks-sub" style={{ marginTop: 8 }}>
            <span className="ks-pulse">● 服务正在扫描：{scanning.root}</span>
          </div>
        )}
      </div></div>

      {result && (
        <>
          <div className="ks-sec"><span className="ks-bar" />扫描结果</div>
          <div className="ks-card"><div className="ks-card-b">
            <div className="ks-sub" style={{ fontSize: 11.5, color: '#C9D1D9' }}>{result}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="ks-btn ghost" onClick={onGoFindings}>查看发现明细 →</button>
            </div>
          </div></div>
        </>
      )}

      <div className="ks-sec"><span className="ks-bar" />最近一次扫描</div>
      <SummaryCard latest={head.latest} meta={head.meta} onGoFindings={onGoFindings} />

      <div className="ks-sec"><span className="ks-bar" />怎么用</div>
      <div className="ks-card"><div className="ks-card-b">
        <div className="ks-sub">
          · push / 发布前，把项目目录丢进来扫一遍；<br />
          · 接手陌生仓库先扫一遍再装依赖跑代码；<br />
          · 开「历史」Tab 看两次扫描之间的<strong className="ks-new">新增泄露</strong>；<br />
          · 或直接对 AI 说「帮我扫一下 D:\\work\\xxx 有没有泄露密钥」。
        </div>
      </div></div>
    </>
  )
}

function SummaryCard({ latest, meta, onGoFindings }: { latest: LatestSummary | null; meta: ServiceMeta | null; onGoFindings: () => void }) {
  if (!latest) {
    return (
      <div className="ks-card"><div className="ks-empty">
        还没有扫描记录。<br />填上面路径点「开始扫描」，或对 AI 说「帮我扫一下某目录有没有泄露密钥」。
      </div></div>
    )
  }
  const c = latest.counts ?? { critical: 0, high: 0, medium: 0 }
  const nw = latest.new ?? { newCount: 0, newCritical: 0, newHigh: 0 }
  return (
    <div className="ks-card"><div className="ks-card-b">
      <div className="ks-sum">
        <div><b className="ks-crit">{c.critical}</b><small>🔴 严重</small></div>
        <div><b className="ks-high">{c.high}</b><small>🟠 高危</small></div>
        <div><b className="ks-med">{c.medium}</b><small>🟡 中危</small></div>
        <div><b className={nw.newCount > 0 ? 'ks-new' : ''}>{nw.newCount}</b><small>新增 vs 基线</small></div>
      </div>
      <div className="ks-sub">
        {latest.root} · {new Date(latest.at).toLocaleString()} · {latest.files ?? '?'} 文件 · {Math.round((latest.durationMs ?? 0) / 1000)}s
        {meta?.degraded ? ' · ⚠ 桥降级' : ''}
      </div>
      {(latest.findingCount ?? 0) > 0 && (
        <div style={{ marginTop: 9 }}>
          <button className="ks-btn ghost sm" onClick={onGoFindings}>查看发现明细 →</button>
        </div>
      )}
    </div></div>
  )
}
