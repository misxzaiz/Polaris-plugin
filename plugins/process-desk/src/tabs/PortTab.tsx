/**
 * 端口占用 Tab：输入端口号 → netstat 行 + 进程归属，LISTENING 行置顶。
 * 空结果是有效结论（端口没人听），给出下一步指引而不是假装有问题。
 */
import { useCallback, useEffect, useState } from 'react'
import { apiPort, fmtBytes, type PortEntry } from '../model'
import type { Toast, KillRequest } from '../Panel'

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1px solid #3f3f46',
  background: '#25252b', color: '#e4e4e7', fontSize: 12, outline: 'none',
}

export default function PortTab({ base, showToast, askKill, refreshKey }: {
  base: string
  showToast: Toast
  askKill: (req: KillRequest) => void
  refreshKey: number
}) {
  const [port, setPort] = useState('')
  const [rows, setRows] = useState<PortEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(async () => {
    const p = Number(port.trim())
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      setErr('端口号必须是 1-65535 的整数')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const r = await apiPort(base, p)
      setRows(r.entries)
    } catch (e) {
      setErr((e as Error).message)
      setRows(null)
    } finally {
      setBusy(false)
    }
  }, [base, port])

  useEffect(() => {
    // refreshKey 变化 = 刚发生过 kill，重新查一次让结果反映现状
    if (refreshKey > 0 && rows && port) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const sorted = rows
    ? [...rows].sort((a, b) => (a.row.state === 'LISTENING' ? -1 : 0) - (b.row.state === 'LISTENING' ? -1 : 0))
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
          placeholder="输入端口号，如 9829"
          style={{ ...inputStyle, width: 180 }}
        />
        <button
          onClick={() => { void run() }}
          disabled={busy}
          style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
        >{busy ? '查询中…' : '谁占了这个端口？'}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#f85149' }}>{err}</div>}

      {sorted && (
        sorted.length === 0 ? (
          <div style={{ border: '1px solid #3f3f46', borderRadius: 10, padding: 14, fontSize: 12, color: '#3fb950' }}>
            端口 {port} 当前没有任何 TCP/UDP 连接记录——端口是空的。若服务仍报 EADDRINUSE，多半是刚断开的连接还在收尾（等几秒），或确认监听地址（0.0.0.0 vs 127.0.0.1）。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((e, i) => {
              const r = e.row
              const p = e.proc
              const listening = r.state === 'LISTENING'
              return (
                <div key={`${r.proto}-${r.local.addr}-${r.local.port}-${r.pid}-${i}`} style={{
                  border: `1px solid ${listening ? 'rgba(59,130,246,.4)' : '#3f3f46'}`,
                  borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
                  background: listening ? 'rgba(59,130,246,.06)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, padding: '1px 8px', borderRadius: 8,
                      background: listening ? 'rgba(59,130,246,.2)' : 'rgba(161,161,170,.15)',
                      color: listening ? '#93c5fd' : '#a1a1aa',
                    }}>{r.proto}{r.state ? ` · ${r.state}` : ' · UDP'}</span>
                    <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{r.local.addr}:{r.local.port}</span>
                    {r.foreign.addr && <span style={{ color: '#71717a' }}>← {r.foreign.addr}:{r.foreign.port}</span>}
                    <span style={{ color: '#71717a' }}>pid={r.pid}</span>
                  </div>
                  <div style={{ color: '#a1a1aa', wordBreak: 'break-all' }}>
                    {p ? `${p.name} · 内存 ${fmtBytes(p.ws)}${p.path ? ` · ${p.path}` : p.cmd ? ` · ${p.cmd}` : ''}` : '（进程详情获取失败，可能权限不足）'}
                  </div>
                  {listening && r.pid > 4 && (
                    <div>
                      <button
                        onClick={() => askKill({ pid: r.pid, name: p?.name })}
                        style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #7f1d1d', background: 'rgba(127,29,29,.25)', color: '#fca5a5', fontSize: 11, cursor: 'pointer' }}
                      >结束该进程</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {rows === null && !err && (
        <div style={{ fontSize: 11, color: '#71717a' }}>
          提示：EADDRINUSE 时输入报错里的端口号；也可以在对话里让 AI 直接查（「谁占了 9829」）。
        </div>
      )}
      {showToast ? null : null}
    </div>
  )
}
