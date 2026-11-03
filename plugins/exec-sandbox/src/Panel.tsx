/**
 * 执行沙箱面板：活跃工作区列表 + 手动销毁。
 *
 * 计算逻辑复用 shared/sandbox-core.js（与 MCP 同一权威，esbuild 打包进
 * bundle）；本文件只做宿主能力 IO 与渲染。
 * 通道：window.__POLARIS_HOST_INVOKE__ → router_dispatch → cap.kv（watchtower 同款）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as core from '../shared/sandbox-core.js'

type HostInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke
}

interface WorkspaceMeta {
  v: number
  workspaceId: string
  label: string
  dir: string
  createdAt: number
  expiresAt: number
  lastActivityAt: number
}

interface Row extends WorkspaceMeta {
  dirExists: boolean
}

async function hostInvoke(): Promise<HostInvoke> {
  const fn = (window as unknown as HostGlobals).__POLARIS_HOST_INVOKE__
  if (!fn) throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）')
  return fn
}

async function kvGet<T>(key: string): Promise<T | null> {
  const invoke = await hostInvoke()
  const res = await invoke<{ msgId: string; ok: boolean; result?: { value?: unknown } | null; error?: string | null }>(
    'router_dispatch',
    { req: { target: 'cap.kv', payload: { action: 'get', key } } },
  )
  if (!res.ok) throw new Error(res.error || 'cap.kv 调用失败')
  return ((res.result?.value ?? null) as T | null)
}

async function kvKeys(): Promise<string[]> {
  const invoke = await hostInvoke()
  const res = await invoke<{ msgId: string; ok: boolean; result?: { keys?: string[] }; error?: string | null }>(
    'router_dispatch',
    { req: { target: 'cap.kv', payload: { action: 'list' } } },
  )
  if (!res.ok) throw new Error(res.error || 'cap.kv 调用失败')
  return res.result?.keys ?? []
}

async function kvDel(key: string): Promise<void> {
  const invoke = await hostInvoke()
  const res = await invoke<{ msgId: string; ok: boolean; error?: string | null }>(
    'router_dispatch',
    { req: { target: 'cap.kv', payload: { action: 'delete', key } } },
  )
  if (!res.ok) throw new Error(res.error || 'cap.kv 调用失败')
}

/** 目录存在性无法经面板 invoke 直查（无 fs 通道）——以 kv 元数据为准，目录列显示"见 MCP list"。 */
async function loadRows(): Promise<Row[]> {
  const keys = await kvKeys()
  const rows: Row[] = []
  const now = Date.now()
  for (const k of keys) {
    if (!k.startsWith(core.KV_PREFIX)) continue
    // eslint-disable-next-line no-await-in-loop
    const meta = core.normalizeWorkspace(await kvGet<Record<string, unknown>>(k))
    if (meta) rows.push({ ...meta, dirExists: !core.isExpired(meta, now) })
  }
  rows.sort((a, b) => b.createdAt - a.createdAt)
  return rows
}

function fmtTs(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + 'Z'
}

function timeLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now()
  if (ms <= 0) return '已过期'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h${m}m` : `${m}m`
}

const CSS = `
.es-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.es-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.es-head b{font-size:13px}
.es-head .sub{color:#5C6678;font-size:11px}
.es-refresh{margin-left:auto;background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer}
.es-body{flex:1;overflow:auto;padding:6px 10px}
.es-tbl{width:100%;border-collapse:collapse;font-size:12px}
.es-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:7px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.es-tbl td{padding:8px 10px;border-bottom:1px solid #161c2a;vertical-align:top}
.es-tbl tr:last-child td{border-bottom:none}
.es-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.es-id{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#9f9aF0}
.es-label{color:#8B94A9;font-size:10.5px;margin-top:2px}
.es-empty{color:#5C6678;padding:24px 10px;text-align:center;font-size:12px}
.es-btn{background:#3d2b2b;border:1px solid #6b3a3a;color:#f1a5a5;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer}
.es-btn:hover{background:#4d3434}
.es-about{font-size:11.5px;color:#8B94A9;line-height:1.7;padding:12px 10px;border-top:1px solid #1c2333}
.es-about b{color:#E6E9F2}
.es-toast{position:absolute;right:12px;bottom:12px;background:#252a36;border:1px solid #3a4358;border-radius:8px;padding:8px 14px;font-size:12px;color:#E6E9F2;box-shadow:0 4px 16px rgba(0,0,0,.4)}
`

export default function ExecSandboxPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toastFn = useCallback((text: string) => {
    setToast(text)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const refresh = useCallback(() => {
    setError(null)
    loadRows()
      .then((r) => setRows(r))
      .catch((e: Error) => setError(e.message || String(e)))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const destroy = useCallback(async (row: Row) => {
    if (!window.confirm(`销毁工作区 ${row.workspaceId}？（目录递归删除，不可恢复）`)) return
    setBusy(row.workspaceId)
    try {
      await kvDel(core.wsKey(row.workspaceId))
      // 目录删除经 MCP execsandbox_destroy（面板无 fs 通道）——kv 元数据清即可，
      // 残目录由 TTL/系统回收兜底；提示用户可用 MCP 工具彻底删除。
      toastFn(`已清除 ${row.workspaceId} 元数据（目录删除可经 MCP execsandbox_destroy）`)
      refresh()
    } catch (e) {
      toastFn(`销毁失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }, [refresh, toastFn])

  return (
    <div className="es-root">
      <style>{CSS}</style>
      <div className="es-head">
        <b>执行沙箱</b>
        <span className="sub">AI 代码执行的一次性隔离工作区（24h 自动过期）</span>
        <button className="es-refresh" onClick={refresh}>刷新</button>
      </div>
      <div className="es-body">
        {error && <div className="es-empty">加载失败：{error}</div>}
        {!error && rows && rows.length === 0 && (
          <div className="es-empty">
            暂无活跃工作区。
            <br />AI 会话中说「给我一个隔离工作区跑段代码」即会创建。
          </div>
        )}
        {!error && rows && rows.length > 0 && (
          <table className="es-tbl">
            <thead>
              <tr>
                <th>工作区</th>
                <th>创建时间</th>
                <th className="num">剩余</th>
                <th>目录状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workspaceId}>
                  <td>
                    <span className="es-id">{r.workspaceId}</span>
                    {r.label && <div className="es-label">{r.label}</div>}
                  </td>
                  <td>{fmtTs(r.createdAt)}</td>
                  <td className="num">{timeLeft(r.expiresAt)}</td>
                  <td>{r.dirExists ? '活跃' : '已过期（待惰性清理）'}</td>
                  <td className="num">
                    <button className="es-btn" disabled={busy === r.workspaceId} onClick={() => destroy(r)}>
                      {busy === r.workspaceId ? '销毁中…' : '销毁'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="es-about">
        <b>隔离语义（如实）</b>：目录隔离 + 24h TTL + 根边界校验 + exec/destroy 双确认闸；<b>非进程级沙箱</b>（exec 与宿主同权限级）。
        文件落系统临时目录，销毁即删；面板销毁只清元数据，彻底删目录请让 AI 调 <b>execsandbox_destroy</b>（confirm 双闸）。
      </div>
      {toast && <div className="es-toast">{toast}</div>}
    </div>
  )
}
