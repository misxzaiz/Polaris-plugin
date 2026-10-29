/**
 * 书签体检面板（Tab 组装 + 全局数据加载）
 *
 * 数据流：面板只读（records/run/meta/reports 轮询），一切写走命令键；
 * 外网链接体检由后台服务原生 fetch（跨域根治点）。
 */
import React from 'react'
import type { DigRecord, Meta, RunState, Settings } from './model'
import {
  K, kvDel, loadMeta, loadReports, loadRun, loadSettings, pollResult, readAllRecords,
  sendCmd, statusColor,
} from './model'
import OverviewTab from './OverviewTab'
import LibraryTab from './LibraryTab'
import CheckTab from './CheckTab'
import SettingsTab from './SettingsTab'

type Tab = 'overview' | 'library' | 'check' | 'settings'

const SERVICE_ID = 'dig-service'

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 13px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: active ? 'var(--p-accent, #4a7dff)' : 'transparent',
  color: active ? '#fff' : 'inherit',
})

export default function BookmarkDigPanel(props: { pluginId: string; onSendToChat?: (m: string) => void | Promise<void> }) {
  const [tab, setTab] = React.useState<Tab>('overview')
  const [records, setRecords] = React.useState<DigRecord[]>([])
  const [meta, setMeta] = React.useState<Meta | null>(null)
  const [run, setRun] = React.useState<RunState | null>(null)
  const [reports, setReports] = React.useState<Awaited<ReturnType<typeof loadReports>>>([])
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  const [err, setErr] = React.useState('')
  const [lastResurfaced, setLastResurfaced] = React.useState<DigRecord | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      const [recs, m, r, rps, s] = await Promise.all([
        readAllRecords(), loadMeta(), loadRun(), loadReports(), loadSettings(),
      ])
      setRecords(recs)
      setMeta(m)
      setRun(r)
      setReports(rps)
      setSettings(s)
      setErr('')
    } catch (e) {
      setErr(String((e as Error).message || e))
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [refresh])

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const doResurface = (r: DigRecord) => {
    setLastResurfaced(r)
    withBusy(async () => {
      const nonce = await sendCmd('visit', { id: r.id })
      pollResult(nonce, 15000).catch(() => {})
    })
  }

  const doVisit = (r: DigRecord) => {
    withBusy(async () => {
      const nonce = await sendCmd('visit', { id: r.id })
      const res = await pollResult(nonce, 15000)
      if (res && !res.ok) setErr(res.error || '标记失败')
      else setMsg('已记录重访')
      refresh()
    })
  }

  const doRecheck = (ids: string[]) => {
    // 单条/少量重查：临时起一个「只查这些」的运行——通过 check 命令 + limit 不够精确，
    // 这里走 check 命令语义外的一条捷径：直接调用 recheck_dead 不合适；
    // 用 check 但服务端 planCheckQueue 不支持指定 ids → 最朴素的正确做法：
    // 把这些 id 立即重置为未检查并不支持（单写者）——退化为提示走「检查」页。
    // 但单条重查是高频需求 → 服务支持 cmd.recheck_ids。见 service consumeCommands。
    withBusy(async () => {
      const nonce = await sendCmd('recheck_ids', { ids })
      const res = await pollResult(nonce, 15000)
      if (!res) setErr('命令超时：服务可能未运行（设置 → 服务管理）')
      else if (!res.ok) setErr(res.error || '启动失败')
      else setMsg(`已加入重查队列（${(res.summary as { queued?: number }).queued ?? ids.length} 条）`)
      refresh()
    })
  }

  const doRemove = (ids: string[]) => {
    withBusy(async () => {
      const nonce = await sendCmd('remove', { ids, confirm: true })
      const res = await pollResult(nonce, 15000)
      if (!res) setErr('命令超时：服务可能未运行')
      else if (!res.ok) setErr(res.error || '删除失败')
      else setMsg(`已删除 ${(res.summary as { removed?: number }).removed ?? ids.length} 条`)
      refresh()
    })
  }

  void K; void kvDel; void statusColor // 备用：保持 import 面向未来扩展

  return (
    <div style={{ padding: 16, fontFamily: 'inherit', fontSize: 13, color: 'var(--p-text, inherit)', maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' as const }}>
        <strong style={{ fontSize: 15 }}>📖 书签体检</strong>
        {run && <span style={{ padding: '2px 10px', borderRadius: 999, background: 'var(--p-accent, #4a7dff)', color: '#fff', fontSize: 11 }}>
          检查中 {run.cursor}/{run.queue.length}
        </span>}
        <span style={{ flex: 1 }} />
        <button style={tabBtn(tab === 'overview')} onClick={() => setTab('overview')}>概览</button>
        <button style={tabBtn(tab === 'library')} onClick={() => setTab('library')}>书签库</button>
        <button style={tabBtn(tab === 'check')} onClick={() => setTab('check')}>检查</button>
        <button style={tabBtn(tab === 'settings')} onClick={() => setTab('settings')}>设置</button>
      </div>

      {err && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(220,80,80,.12)', marginBottom: 10 }}>
        {err}<span style={{ marginLeft: 8, cursor: 'pointer', opacity: 0.7 }} onClick={() => setErr('')}>✕</span>
      </div>}
      {msg && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(58,167,109,.12)', marginBottom: 10 }}>
        {msg}<span style={{ marginLeft: 8, cursor: 'pointer', opacity: 0.7 }} onClick={() => setMsg('')}>✕</span>
      </div>}

      {tab === 'overview' && (
        <OverviewTab
          records={records} meta={meta} settings={settings}
          lastResurfaced={lastResurfaced} onResurface={doResurface}
          onStartRecheckDead={() => {
            withBusy(async () => {
              const nonce = await sendCmd('recheck_dead', {})
              const res = await pollResult(nonce, 15000)
              if (!res) setErr('命令超时：服务可能未运行')
              else if (!res.ok) setErr(res.error || '启动失败')
              else setMsg(`死链重查已启动（${(res.summary as { queued?: number }).queued ?? 0} 条）`)
              refresh()
            })
          }}
          busy={busy}
        />
      )}
      {tab === 'library' && (
        <LibraryTab records={records} busy={busy} onRecheck={doRecheck} onVisit={doVisit} onRemove={doRemove} />
      )}
      {tab === 'check' && (
        <CheckTab
          records={records} run={run} reports={reports} busy={busy} pluginId={props.pluginId}
          onImportDone={(m) => { setMsg(m); refresh() }} onErr={setErr} onChanged={refresh}
          onOpenTab={(t) => setTab(t)} onRemove={doRemove}
        />
      )}
      {tab === 'settings' && (
        <SettingsTab
          pluginId={props.pluginId} serviceId={SERVICE_ID}
          settings={settings} meta={meta} records={records} busy={busy}
          onSettingsSaved={refresh} onErr={setErr} onInfo={setMsg} onChanged={refresh}
        />
      )}
    </div>
  )
}
