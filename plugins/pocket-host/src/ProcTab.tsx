/**
 * 进程 Tab：按内存排序的进程表 + 名字过滤 + 结束进程（两段确认）
 *
 * kill 走命令键投递（hostmon.cmd.kill.*），执行者是后台服务：
 * 它会用 guardKill 拒绝系统进程/自身/父进程/Polaris 核心。
 */
import { useMemo, useState } from 'react'
import { killBy, type PanelData, type ProcRow } from './model'
import type { Toast } from './Panel'

export default function ProcTab({ data, showToast, reload }: {
  data: PanelData | null
  showToast: Toast
  reload: () => Promise<PanelData | null>
}) {
  const [filter, setFilter] = useState('')
  const [confirmRow, setConfirmRow] = useState<ProcRow | null>(null)
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => {
    const rows = data?.snap?.procs?.list ?? []
    const f = filter.trim().toLowerCase()
    return f ? rows.filter((r) => r.name.toLowerCase().includes(f)) : rows
  }, [data, filter])

  const snapStale = !data?.snap || Date.now() - (data.snap.procs?.at || 0) > 40 * 1000

  const doKill = async (row: ProcRow) => {
    setBusy(true)
    try {
      const r = await killBy({ pid: row.pid, reason: '面板手动结束' })
      if (r.ok) showToast(`已结束 ${row.name} (PID ${row.pid})`)
      else showToast(r.error || (r.results || []).map((x) => x.error || `${x.name || '?'} 失败`).join('；') || '结束失败', true)
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
          placeholder="按进程名过滤（如 node、chrome）"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="ph-card">
        <div className="ph-sec"><i className="ph-bar" />进程（按内存）<small className="ph-hint">快照 Top{(data?.snap?.procs?.list ?? []).length}{data?.snap?.procs?.count ? ` / 全机 ${data.snap.procs.count}` : ''}</small></div>
        {snapStale && (data?.snap ?? null) && (
          <div className="ph-sub" style={{ padding: '0 13px 8px' }}>进程表是慢采样（约 15s 一轮），刚启动的进程稍后才出现。</div>
        )}
        {list.length === 0 && (
          <div className="ph-empty">
            {data?.snap ? (filter ? `没有名字含「${filter}」的进程（快照只含内存 Top25）。` : '快照中没有进程数据（服务慢采样尚未完成）。') : '暂无快照：请先在「设置」启动后台服务。'}
          </div>
        )}
        {list.map((row) => (
          <div key={row.pid} className="ph-row">
            <span className="ph-row-n">
              {row.name}
              <small>PID {row.pid}</small>
            </span>
            <span className="ph-row-v">{row.memMb} MB</span>
            <button className="ph-btn danger sm" disabled={busy} onClick={() => setConfirmRow(row)}>结束</button>
          </div>
        ))}
        {confirmRow && (
          <div className="ph-confirm">
            <b>结束 {confirmRow.name} (PID {confirmRow.pid})？该进程将被强制终止（含子进程）。</b>
            <button className="ph-btn danger sm" disabled={busy} onClick={() => doKill(confirmRow)}>确认结束</button>
            <button className="ph-btn ghost sm" disabled={busy} onClick={() => setConfirmRow(null)}>取消</button>
          </div>
        )}
      </div>
      <div className="ph-sub" style={{ padding: '0 18px 8px' }}>
        列表只含内存 Top25；找不到目标时用「端口」Tab 按端口定位，或问 AI（host_processes 支持过滤）。
      </div>
    </div>
  )
}
