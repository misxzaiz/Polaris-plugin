/**
 * 设置 Tab：服务管理（自举 start）+ 体检设置 + 数据管理（清空）。
 */
import React from 'react'
import type { DigRecord, Settings } from './model'
import { K, kvDel, kvKeys, listServiceStatus, loadSettings, saveSettings, sendCmd, pollResult, serviceAction, fmtTime, type Meta } from './model'

interface Props {
  pluginId: string
  serviceId: string
  settings: Settings | null
  meta: Meta | null
  records: DigRecord[]
  busy: boolean
  onSettingsSaved: () => void
  onErr: (msg: string) => void
  onInfo: (msg: string) => void
  onChanged: () => void
}

const S = {
  panel: { padding: '12px 14px', borderRadius: 10, background: 'var(--p-panel, rgba(128,128,128,.08))', marginBottom: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' as const, marginBottom: 8 },
  label: { fontSize: 12.5, color: 'var(--p-text-dim, #999)', minWidth: 90 },
  input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--p-border, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit', fontSize: 12.5, width: 90 },
  btn: { padding: '5px 12px', borderRadius: 8, border: '1px solid var(--p-border, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12.5 },
  btnDanger: { padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(220,80,80,.4)', background: 'transparent', color: '#d9564a', cursor: 'pointer', fontSize: 12.5 },
}

export default function SettingsTab({ pluginId, serviceId, settings, meta, records, busy, onSettingsSaved, onErr, onInfo, onChanged }: Props) {
  const [svc, setSvc] = React.useState<string>('')
  const [confirmWipe, setConfirmWipe] = React.useState(false)
  const [draft, setDraft] = React.useState<Settings | null>(settings)

  React.useEffect(() => { setDraft(settings) }, [settings])

  const refreshSvc = React.useCallback(async () => {
    try {
      const all = await listServiceStatus()
      const mine = all.find((s) => s.pluginId === pluginId && s.serviceId === serviceId)
      setSvc(mine ? String(mine.status || JSON.stringify(mine)) : '未注册')
    } catch (e) {
      setSvc(`查询失败：${String((e as Error).message || e)}`)
    }
  }, [pluginId, serviceId])

  React.useEffect(() => {
    refreshSvc()
    const t = setInterval(refreshSvc, 15000)
    return () => clearInterval(t)
  }, [refreshSvc])

  const act = async (a: 'start' | 'stop' | 'restart') => {
    try {
      await serviceAction(a, pluginId, serviceId)
      onInfo(`服务 ${a} 已提交`)
      setTimeout(refreshSvc, 2000)
    } catch (e) {
      onErr(String((e as Error).message || e))
    }
  }

  const save = async () => {
    if (!draft) return
    try {
      await saveSettings(draft)
      onSettingsSaved()
      onInfo('设置已保存（服务约 30 秒内热生效）')
    } catch (e) {
      onErr(String((e as Error).message || e))
    }
  }

  const wipe = async () => {
    try {
      const nonce = await sendCmd('wipe', { confirm: true })
      const r = await pollResult(nonce, 30000)
      if (!r) throw new Error('清空超时：服务可能未运行')
      if (!r.ok) throw new Error(r.error || '清空失败')
      onInfo(`已清空 ${(r.summary as { wiped?: number }).wiped ?? 0} 条记录`)
      setConfirmWipe(false)
      onChanged()
    } catch (e) {
      onErr(String((e as Error).message || e))
    }
  }

  const svcAlive = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 90 * 1000)

  return (
    <div>
      <div style={S.panel}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <strong>🛠 服务管理</strong>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: svcAlive ? '#3aa76d' : '#d9a13b' }}>
            {meta ? (svcAlive ? `心跳正常（${fmtTime(meta.lastTickAt)}）` : '心跳过期') : '尚无心跳'}
            {svc ? ` · manager: ${svc}` : ''}
          </span>
        </div>
        <div style={S.row}>
          <button style={S.btn} disabled={busy} onClick={() => act('start')}>启动</button>
          <button style={S.btn} disabled={busy} onClick={() => act('restart')}>重启</button>
          <button style={S.btn} disabled={busy} onClick={() => act('stop')}>停止</button>
          <button style={S.btn} disabled={busy} onClick={() => refreshSvc()}>刷新状态</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)' }}>
          服务日志：<code>%APPDATA%/Polaris/bookmark-dig.log</code>（512KB 轮转）。启动失败时先看日志尾部。
        </div>
      </div>

      {draft && (
        <div style={S.panel}>
          <strong>⚙️ 体检设置</strong>
          <div style={{ height: 8 }} />
          <div style={S.row}>
            <span style={S.label}>批量（条/次）</span>
            <input type="number" min={20} max={2000} style={S.input} value={draft.batchSize}
              onChange={(e) => setDraft({ ...draft, batchSize: Number(e.target.value) })} />
            <span style={S.label}>并发</span>
            <input type="number" min={1} max={12} style={S.input} value={draft.concurrency}
              onChange={(e) => setDraft({ ...draft, concurrency: Number(e.target.value) })} />
          </div>
          <div style={S.row}>
            <span style={S.label}>单条超时(ms)</span>
            <input type="number" min={3000} max={30000} step={1000} style={S.input} value={draft.timeoutMs}
              onChange={(e) => setDraft({ ...draft, timeoutMs: Number(e.target.value) })} />
            <span style={S.label}>重查周期(天)</span>
            <input type="number" min={0} max={365} style={S.input} value={draft.recheckDays}
              onChange={(e) => setDraft({ ...draft, recheckDays: Number(e.target.value) })} />
          </div>
          <div style={S.row}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={draft.autoCheckOnImport}
                onChange={(e) => setDraft({ ...draft, autoCheckOnImport: e.target.checked })} />
              <span style={{ fontSize: 12.5 }}>导入后自动开始体检</span>
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={draft.checkEnabled}
                onChange={(e) => setDraft({ ...draft, checkEnabled: e.target.checked })} />
              <span style={{ fontSize: 12.5 }}>允许检查运行（取消勾选 = 暂停）</span>
            </label>
          </div>
          <button style={S.btn} disabled={busy} onClick={save}>保存设置</button>
        </div>
      )}

      <div style={S.panel}>
        <strong>🗑 数据管理</strong>
        <div style={{ fontSize: 12.5, color: 'var(--p-text-dim, #999)', margin: '6px 0' }}>
          书签数据在 cap.kv 的 <code>{'bmd.rec.*'}</code> 分块（当前 {records.length} 条）。清空不可恢复（建议先导出）。
        </div>
        {!confirmWipe ? (
          <button style={S.btnDanger} disabled={busy || !records.length} onClick={() => setConfirmWipe(true)}>清空全部书签…</button>
        ) : (
          <div style={S.row}>
            <span style={{ fontSize: 12.5, color: '#d9564a' }}>确定清空全部 {records.length} 条？不可恢复。</span>
            <button style={S.btnDanger} disabled={busy} onClick={wipe}>确认清空</button>
            <button style={S.btn} onClick={() => setConfirmWipe(false)}>取消</button>
          </div>
        )}
      </div>
    </div>
  )
}
