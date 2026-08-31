/**
 * Screen Sleep 面板 — Windows 极简熄屏
 *
 * 交互：
 *   面板加载 → 轮询 127.0.0.1:52311..52342 找到本地 HTTP 桥 → 取 /status
 *   点「熄灭屏幕」→ POST /off → 显示「已熄灭」
 *
 * 端点发现：本地 HTTP 桥是 MCP server 在 initialize 后启动的，面板可能
 * 先于它加载，所以用递增端口轮询发现。固定基端口 52311，避免读本地文件
 * （Tauri WebView 对 file:// 的同源限制）。
 *
 * 设计：单列居中，一个大按钮。熄屏后 UI 保持，动鼠标/按键唤回屏幕即可。
 */

import { createElement as h, useEffect, useState, useCallback } from 'react'

const BASE_PORT = 52311
const PORT_RANGE = 32 // 桥端口探测范围

// ── 端口发现 ──────────────────────────────────────────────────────────────

async function probePorts() {
  for (let p = BASE_PORT; p < BASE_PORT + PORT_RANGE; p++) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/status`, { method: 'GET', cache: 'no-cache' })
      if (r.ok) return p
    } catch { /* 端口未就绪 */ }
  }
  return null
}

// ── 主面板 ────────────────────────────────────────────────────────────────

export default function ScreenSleepPanel() {
  const [port, setPort] = useState(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [lastOff, setLastOff] = useState(null)
  const [nativeOk, setNativeOk] = useState(false)

  const discover = useCallback(async () => {
    const p = await probePorts()
    if (p && !port) setPort(p)
  }, [port, setPort])

  // 启动端口发现轮询
  useEffect(() => {
    discover()
    const id = setInterval(discover, 2000)
    return () => clearInterval(id)
  }, [discover])

  const fetchStatus = useCallback(async (p) => {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/status`, { cache: 'no-cache' })
      if (!r.ok) return
      const j = await r.json()
      if (j.ok) {
        setNativeOk(Boolean(j.nativeExists))
        setLastOff(j.lastOffAt || null)
      }
    } catch { /* 桥还未就绪 */ }
  }, [])

  // 找到端口后定期刷新状态
  useEffect(() => {
    if (!port) return
    fetchStatus(port)
    const id = setInterval(() => fetchStatus(port), 10000)
    return () => clearInterval(id)
  }, [port, fetchStatus])

  const handleOff = useCallback(async () => {
    if (!port || loading) return
    setLoading(true)
    setMsg('')
    try {
      const r = await fetch(`http://127.0.0.1:${port}/off`, { method: 'POST' })
      const j = await r.json()
      if (j.ok) {
        setMsg('屏幕已熄灭 · 动鼠标或按键可唤回')
        setLastOff(new Date().toISOString())
      } else {
        setMsg('熄屏失败：' + (j.error || '未知'))
      }
    } catch (e) {
      setMsg('无法连接本地服务：' + e.message)
    } finally {
      setLoading(false)
    }
  }, [port, loading])

  const statusLine = () => {
    if (!port) return '等待本地服务…'
    if (!nativeOk) return '⚠ 未找到熄屏程序'
    if (msg) return msg
    if (lastOff) {
      const d = new Date(lastOff)
      const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      return '上次熄屏 ' + t
    }
    return '就绪'
  }

  return h('div', { className: panelCls + ' flex h-full flex-col items-center justify-center bg-background font-mono text-text' },
    h('div', { className: 'mb-2 text-[11px] tracking-wider text-text-muted' }, '屏幕睡眠'),
    h('div', { className: 'mb-6 text-4xl' }, '🌑'),
    h('button', {
      className: btnCls + (loading ? ' loading' : '') + (!port || !nativeOk ? ' disabled' : ''),
      onClick: handleOff,
      disabled: loading || !port || !nativeOk,
    }, loading ? '熄屏中…' : '熄灭屏幕'),
    h('div', { className: 'mt-4 px-6 text-center text-[11px] text-text-muted' }, statusLine()),
    h('div', { className: 'mt-2 text-[10px] text-text-muted opacity-70' }, '移动鼠标或按任意键即可恢复'),
  )
}

const panelCls = 'px-4 select-none'
const btnCls = 'rounded-xl border border-border bg-background-elevated px-10 py-5 text-lg font-bold transition-all hover:border-accent hover:bg-background hover:text-text-active active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'