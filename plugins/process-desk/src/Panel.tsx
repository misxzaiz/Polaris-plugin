/**
 * 进程透视台面板：Tab 组装 + 心跳徽章 + kill 两阶段确认弹窗
 *
 * 数据面：pdesk.meta 心跳（3s 轮询）渲染服务状态；活体诊断全部直连
 * 自家服务 HTTP（127.0.0.1）。kill 走 arm→弹窗确认→fire 两阶段，
 * 护栏决策在服务端（shared/core.js 单源），弹窗只做诚实呈现。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isPolarisProc } from '../shared/core.js'
import {
  apiKillArm, apiKillFire, fmtBytes, fmtStarted, getMeta,
  serviceStart, type PdeskMeta, type ProcInfo,
} from './model'
import PortTab from './tabs/PortTab'
import FileLockTab from './tabs/FileLockTab'
import ProcTab from './tabs/ProcTab'
import AuditTab from './tabs/AuditTab'

export type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const META_FRESH_MS = 90 * 1000

const TABS: Array<{ id: string; label: string }> = [
  { id: 'port', label: '端口占用' },
  { id: 'lock', label: '文件占用' },
  { id: 'proc', label: '进程全景' },
  { id: 'audit', label: '审计' },
]

export interface KillRequest { pid: number; name?: string }

interface KillModalState {
  arm: Awaited<ReturnType<typeof apiKillArm>>
  treeKill: boolean
  allowProtected: boolean
  busy: boolean
  error: string | null
}

export default function Panel({ pluginId }: { pluginId: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState('port')
  const [meta, setMeta] = useState<PdeskMeta | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const [killState, setKillState] = useState<KillModalState | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast: Toast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3600)
  }, [])

  const reload = useCallback(async () => {
    try {
      const m = await getMeta()
      setMeta(m)
    } catch (_) {
      setMeta(null)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => { void reload() }, 3000)
    return () => clearInterval(timer)
  }, [reload])

  const metaFresh = !!(meta && meta.lastTickAt && Date.now() - meta.lastTickAt < META_FRESH_MS)
  const running = metaFresh && !!meta?.port
  const base = running && meta ? `http://127.0.0.1:${meta.port}` : ''

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  /** kill 流入口：arm 成功则弹确认窗；失败直接 toast 诚实原因 */
  const askKill = useCallback(async (req: KillRequest) => {
    if (!base) return
    try {
      const arm = await apiKillArm(base, req.pid)
      if (!arm.ok) {
        showToast(`无法发起：${arm.error || '未知原因'}`, 'bad')
        return
      }
      setKillState({ arm, treeKill: false, allowProtected: false, busy: false, error: null })
    } catch (e) {
      showToast(`发起失败：${(e as Error).message}`, 'bad')
    }
  }, [base, showToast])

  const fireKill = useCallback(async () => {
    if (!killState || !base) return
    setKillState((s) => (s ? { ...s, busy: true, error: null } : s))
    try {
      const r = await apiKillFire(
        base,
        (killState.arm.proc as ProcInfo).pid,
        killState.arm.token as string,
        killState.treeKill,
        killState.allowProtected,
      )
      showToast(`已结束 ${r.killed.name}（pid=${r.killed.pid}）${r.treeKill ? '，含子进程树' : ''}`, 'good')
      setKillState(null)
      bumpRefresh()
    } catch (e) {
      const msg = (e as Error).message
      const needProtected = msg.includes('Polaris 自家进程') || msg.includes('二次确认')
      setKillState((s) => (s ? { ...s, busy: false, error: msg, allowProtected: needProtected ? true : s.allowProtected } : s))
    }
  }, [killState, base, showToast, bumpRefresh])

  const startService = useCallback(async () => {
    try {
      await serviceStart()
      showToast('已发起服务启动，稍候几秒', 'info')
    } catch (e) {
      showToast(`启动失败：${(e as Error).message}`, 'bad')
    }
  }, [showToast])

  const armProc = killState?.arm.proc || null
  const polarisFlag = !!(armProc && isPolarisProc(armProc.name, armProc.path))
  const needProtected = !!(killState?.arm.needAllowProtected || polarisFlag)

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, color: '#d4d4d8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>🔍 进程透视台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? '服务运行中' : loaded ? '服务离线' : '连接中…'}</span>
        {meta?.platform && meta.platform !== 'win32' && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(210,153,34,.15)', color: '#d29922' }}>仅支持 Windows</span>
        )}
        {running && (meta?.totalKills ?? 0) > 0 && (
          <span style={{ fontSize: 10, color: '#71717a' }}>累计结束 {meta?.totalKills} 个进程</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
              border: '1px solid', minHeight: 32,
              borderColor: tab === t.id ? '#3b82f6' : '#3f3f46',
              background: tab === t.id ? 'rgba(59,130,246,.15)' : 'transparent',
              color: tab === t.id ? '#93c5fd' : '#a1a1aa',
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!running ? (
          <div style={{
            border: '1px solid #3f3f46', borderRadius: 10, padding: 16, fontSize: 12, color: '#a1a1aa',
            display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
          }}>
            <div>服务未上线（没有心跳）。本插件全部诊断都在本机完成：服务是普通 Node 进程，由宿主拉起。</div>
            <button
              onClick={() => { void startService() }}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #3b82f6', background: 'rgba(59,130,246,.15)', color: '#93c5fd', fontSize: 12, cursor: 'pointer' }}
            >启动服务</button>
            <div style={{ fontSize: 11, color: '#71717a' }}>若反复启动失败，到 设置→插件 看服务日志（可能是 Node 未安装或端口冲突）。</div>
          </div>
        ) : (
          <>
            {tab === 'port' && <PortTab base={base} showToast={showToast} askKill={askKill} refreshKey={refreshKey} />}
            {tab === 'lock' && <FileLockTab base={base} showToast={showToast} askKill={askKill} refreshKey={refreshKey} />}
            {tab === 'proc' && <ProcTab base={base} showToast={showToast} askKill={askKill} refreshKey={refreshKey} />}
            {tab === 'audit' && <AuditTab base={base} showToast={showToast} refreshKey={refreshKey} bumpRefresh={bumpRefresh} />}
          </>
        )}
      </div>

      <div style={{ fontSize: 10, color: '#52525b' }}>
        {pluginId} · {running ? `服务 v${meta?.version} · pid ${meta?.pid} · 端口 ${meta?.port}` : '诊断数据不出本机'}
      </div>

      {killState && armProc && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 98,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => { if (!killState.busy) setKillState(null) }}>
          <div
            style={{
              background: '#1c1c1f', border: '1px solid #52525b', borderRadius: 12, padding: 16,
              width: 'min(480px, 92vw)', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, color: '#f85149' }}>确认结束进程</div>
            <div style={{ color: '#e4e4e7' }}>
              <b>{armProc.name}</b>（pid={armProc.pid}）· 内存 {fmtBytes(armProc.ws)} · 启动 {fmtStarted(armProc.started)}
            </div>
            {(armProc.path || armProc.cmd) && (
              <div style={{ color: '#a1a1aa', wordBreak: 'break-all', maxHeight: 64, overflowY: 'auto', fontSize: 11 }}>
                {armProc.path || armProc.cmd}
              </div>
            )}
            {(killState.arm.warnings || []).map((w, i) => (
              <div key={i} style={{ color: '#d29922', fontSize: 11 }}>⚠ {w}</div>
            ))}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#a1a1aa' }}>
              <input type="checkbox" checked={killState.treeKill} onChange={(e) => setKillState((s) => (s ? { ...s, treeKill: e.target.checked } : s))} />
              连子进程树一起结束（treeKill）
            </label>
            {needProtected && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#d29922' }}>
                <input type="checkbox" checked={killState.allowProtected} onChange={(e) => setKillState((s) => (s ? { ...s, allowProtected: e.target.checked } : s))} />
                这是 Polaris 僵尸/多余实例，我确认要结束（allowProtected）
              </label>
            )}
            {killState.error && <div style={{ color: '#f85149' }}>失败：{killState.error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setKillState(null)}
                disabled={killState.busy}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', fontSize: 12, cursor: 'pointer' }}
              >取消</button>
              <button
                onClick={() => { void fireKill() }}
                disabled={killState.busy || (needProtected && !killState.allowProtected)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, cursor: 'pointer',
                  background: '#7f1d1d', color: '#fecaca', opacity: killState.busy || (needProtected && !killState.allowProtected) ? 0.5 : 1,
                }}
              >{killState.busy ? '执行中…' : '结束进程'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          background: toast.kind === 'bad' ? '#7f1d1d' : toast.kind === 'good' ? '#14532d' : '#27272a',
          color: '#f4f4f5', fontSize: 12, padding: '8px 14px', borderRadius: 8, zIndex: 99,
          maxWidth: '80vw', boxShadow: '0 4px 14px rgba(0,0,0,.4)',
        }}>{toast.msg}</div>
      )}
    </div>
  )
}
