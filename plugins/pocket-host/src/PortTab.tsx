/**
 * 端口 Tab：TCP 监听端口 → 占用进程；Polaris 自身端口高亮；按端口释放（推荐路径）
 *
 * 按 port 结束时，后台服务在执行瞬间会重新解析端口归属（防 PID 复用误杀）。
 */
import { useMemo, useState } from 'react'
import { bridgePort, killBy, type PanelData, type PortRow } from './model'
import type { Toast } from './Panel'

export default function PortTab({ data, showToast, reload }: {
  data: PanelData | null
  showToast: Toast
  reload: () => Promise<PanelData | null>
}) {
  const [filter, setFilter] = useState('')
  const [confirmRow, setConfirmRow] = useState<PortRow | null>(null)
  const [busy, setBusy] = useState(false)
  const hostPort = bridgePort(data?.meta ?? null)

  const list = useMemo(() => {
    const rows = data?.snap?.ports?.list ?? []
    const f = filter.trim()
    if (!f) return rows
    if (/^\d+$/.test(f)) return rows.filter((r) => String(r.port).startsWith(f))
    const fl = f.toLowerCase()
    return rows.filter((r) => (r.name || '').toLowerCase().includes(fl))
  }, [data, filter])

  const doRelease = async (row: PortRow) => {
    setBusy(true)
    try {
      const r = await killBy({ port: row.port, reason: '面板释放端口' })
      if (r.ok) {
        const names = (r.results || []).map((x) => `${x.name || '?'} (PID ${x.pid})`).join('、')
        showToast(`端口 ${row.port} 已释放：${names || '完成'}`)
      } else {
        showToast(r.error || '释放失败', true)
      }
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
      setConfirmRow(null)
      reload()
    }
  }

  return (
    <div>
      <div style={{ padding: '6px 16px 10px' }}>
        <input
          className="ph-inp"
          placeholder="按端口号或进程名过滤（如 9829 / node）"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="ph-card">
        <div className="ph-sec"><i className="ph-bar" />监听端口<small className="ph-hint">{(data?.snap?.ports?.list ?? []).length}{data?.snap?.ports?.count && data.snap.ports.count > data.snap.ports.list.length ? ` / 共 ${data.snap.ports.count}` : ''}</small></div>
        {list.length === 0 && (
          <div className="ph-empty">
            {data?.snap ? (filter ? `没有匹配「${filter}」的监听端口。` : '快照中没有端口数据（服务慢采样尚未完成）。') : '暂无快照：请先在「设置」启动后台服务。'}
          </div>
        )}
        {list.map((row) => (
          <div key={`${row.port}-${row.pid}`} className={`ph-row ${row.port === hostPort ? 'hl' : ''}`}>
            <span className="ph-row-n">
              :{row.port}
              <small>{row.name || '未知'}</small>
            </span>
            <span className="ph-row-v">PID {row.pid}</span>
            {row.port === hostPort && <span className="ph-tag" style={{ color: '#79C0FF', borderColor: '#1f4472' }}>Polaris</span>}
            <button className="ph-btn danger sm" disabled={busy} onClick={() => setConfirmRow(row)}>释放</button>
          </div>
        ))}
        {confirmRow && (
          <div className="ph-confirm">
            <b>释放端口 {confirmRow.port}？将强制结束当前占用它的 {confirmRow.name || '进程'}（执行时重新解析归属）。</b>
            <button className="ph-btn danger sm" disabled={busy} onClick={() => doRelease(confirmRow)}>确认释放</button>
            <button className="ph-btn ghost sm" disabled={busy} onClick={() => setConfirmRow(null)}>取消</button>
          </div>
        )}
      </div>
      <div className="ph-sub" style={{ padding: '0 18px 8px' }}>
        蓝色高亮是 Polaris 自身端口（释放它们会让 Polaris 掉线，服务端也会拒绝 Polaris 核心进程）。
        释放走「按端口结束」：执行瞬间重新解析占用者，避免 PID 复用误杀。
      </div>
    </div>
  )
}
