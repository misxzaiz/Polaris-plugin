/**
 * ngrok-manager 面板
 *
 * 移动优先响应式布局:窄屏单列 + 底部拇指操作栏 + 设置 bottom-sheet。
 * 通过 fetch 调本机管理器(127.0.0.1:<port>,端口从 .port 读或默认 9870)。
 *
 * 运行环境:宿主 webview,React 由 pluginModuleLoader shim 注入。
 * 样式:内联 <style> + CSS 变量,clamp() 流式,env(safe-area-inset-*) 适配。
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ============================================================================
// 类型
// ============================================================================
interface Tunnel { id: string; name: string; port: number; domain: string | null; publicUrl: string | null; status: string; startedAt: number }
interface LogLine { t?: string; lvl?: string; msg?: string; obj?: string; name?: string; url?: string; addr?: string; err?: string }
interface PluginConfig { ngrokPath: string; defaultDomain: string; mgrPort: number }
interface Health {
  status: string; uptime: number; ngrokPath: string; ngrokReady: boolean; authTokenReady: boolean; authTokenPath: string; tunnelCount: number
}

// ============================================================================
// 管理器客户端
// ============================================================================
const DEFAULT_PORT = 9870

async function readMgrPort(): Promise<number> {
  // .port 由后端服务写,但前端无直接 fs;优先健康探 9870,失败则递增
  return DEFAULT_PORT
}

async function mgrFetch(path: string, opts?: RequestInit, port?: number) {
  const p = port || DEFAULT_PORT
  const res = await fetch(`http://127.0.0.1:${p}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

// ============================================================================
// 样式
// ============================================================================
const STYLES = `
:root{
  --bg:#16161a;--bg-2:#1e1e24;--bg-3:#26262e;--bg-4:#2e2e38;--bg-5:#36363f;
  --border:#34343f;--text:#ececf0;--text-2:#9a9aa6;--text-3:#65656f;
  --accent:#5b8cff;--accent-bg:rgba(91,140,255,.12);
  --green:#34c759;--green-bg:rgba(52,199,89,.12);
  --yellow:#ffcc00;--yellow-bg:rgba(255,204,0,.12);
  --orange:#ff9f0a;--orange-bg:rgba(255,159,10,.14);
  --red:#ff453a;--red-bg:rgba(255,69,58,.12);
  --r:10px;--rs:7px;
  --mono:'SF Mono','JetBrains Mono','Cascadia Code',Consolas,monospace;
  --pad:clamp(12px,4vw,18px);--gap:clamp(10px,3vw,14px);
  --fs:clamp(12px,3.6vw,13px);--fs-url:clamp(11px,3.4vw,13px);--fs-t:clamp(13px,4vw,15px);
  --bh:clamp(36px,11vw,40px);
}
.ngm-root{all:initial}
.ngm-root *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
.ngm-root{
  background:var(--bg);color:var(--text);font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
  font-size:var(--fs);line-height:1.5;display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden;-webkit-font-smoothing:antialiased;
}
.ngm-topbar{display:flex;align-items:center;gap:8px;padding:calc(var(--pad)*.7) var(--pad);border-bottom:1px solid var(--border);background:var(--bg-2);flex-shrink:0;position:relative}
.ngm-brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:var(--fs-t);min-width:0}
.ngm-logo{width:26px;height:26px;border-radius:7px;flex-shrink:0;background:linear-gradient(135deg,var(--accent),#7aa3ff);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 8px rgba(91,140,255,.4)}
.ngm-logo svg{width:15px;height:15px}
.ngm-ver{font-size:9px;color:var(--text-3);font-weight:500;background:var(--bg-4);padding:1px 5px;border-radius:4px;margin-left:2px}
.ngm-stat{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--text-2);white-space:nowrap}
.ngm-stat .d{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.ngm-stat.ok .d{background:var(--green);box-shadow:0 0 6px var(--green)}
.ngm-stat.warn .d{background:var(--orange);box-shadow:0 0 6px var(--orange)}
.ngm-stat.muted .d{background:var(--text-3)}
.ngm-stat.err .d{background:var(--red)}
.ngm-spacer{flex:1}
.ngm-iconbtn{background:transparent;border:1px solid transparent;color:var(--text-2);width:34px;height:34px;border-radius:8px;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;font-size:15px}
.ngm-iconbtn:hover,.ngm-iconbtn:active{background:var(--bg-4);color:var(--text);border-color:var(--border)}
.ngm-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:var(--pad);padding-bottom:calc(var(--pad) + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:var(--gap)}
.ngm-body::-webkit-scrollbar{width:6px}
.ngm-body::-webkit-scrollbar-thumb{background:var(--bg-4);border-radius:3px}
.ngm-card{background:var(--bg-2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.ngm-cardhead{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.5px}
.ngm-cardhead .h{margin-left:auto;font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);font-size:11px}
.ngm-cardbody{padding:14px}
.ngm-field{margin-bottom:12px}
.ngm-field:last-child{margin-bottom:0}
.ngm-field>label{display:block;font-size:11px;color:var(--text-2);margin-bottom:6px;font-weight:500}
.ngm-field>label .rq{color:var(--red)}
.ngm-input{width:100%;padding:0 12px;height:var(--bh);background:var(--bg-3);border:1px solid var(--border);border-radius:var(--rs);color:var(--text);font-size:13px;font-family:var(--mono);outline:none;transition:border-color .15s}
.ngm-input:focus{border-color:var(--accent);background:var(--bg-4)}
.ngm-input::placeholder{color:var(--text-3)}
.ngm-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.ngm-chips::-webkit-scrollbar{display:none}
.ngm-chip{flex-shrink:0;height:var(--bh);padding:0 12px;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--rs);color:var(--text-2);font-size:12px;font-family:var(--mono);cursor:pointer;display:inline-flex;align-items:center;transition:all .15s}
.ngm-chip:active{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}
.ngm-seg{display:flex;background:var(--bg-3);border:1px solid var(--border);border-radius:var(--rs);padding:3px;gap:2px}
.ngm-seg button{flex:1;background:transparent;border:none;color:var(--text-2);padding:0 10px;height:calc(var(--bh) - 6px);font-size:12px;border-radius:5px;cursor:pointer;transition:all .15s;font-weight:500}
.ngm-seg button.active{background:var(--accent);color:#fff;box-shadow:0 1px 4px rgba(91,140,255,.4)}
.ngm-btn{height:var(--bh);padding:0 16px;border:none;border-radius:var(--rs);cursor:pointer;font-size:13px;font-weight:600;transition:all .15s;display:inline-flex;align-items:center;justify-content:center;gap:6px;-webkit-user-select:none;user-select:none}
.ngm-btn.p{background:var(--accent);color:#fff}
.ngm-btn.p:active{background:#4a78f0;transform:scale(.98)}
.ngm-btn.p:disabled{background:var(--bg-4);color:var(--text-3);cursor:not-allowed}
.ngm-btn.g{background:var(--bg-3);color:var(--text);border:1px solid var(--border)}
.ngm-btn.g:active{background:var(--bg-4)}
.ngm-btn.g:disabled{color:var(--text-3);cursor:not-allowed;opacity:.5}
.ngm-btn.d{background:var(--red-bg);color:var(--red);border:1px solid rgba(255,69,58,.3)}
.ngm-btn.d:active{background:rgba(255,69,58,.2)}
.ngm-btn.d:disabled{opacity:.4;cursor:not-allowed}
.ngm-btn.w{background:var(--orange);color:#fff}
.ngm-btn.w:active{background:#e68f00;transform:scale(.98)}
.ngm-btn.w:disabled{background:var(--bg-4);color:var(--text-3)}
.ngm-btn.sm{height:32px;padding:0 10px;font-size:11px}
.ngm-btn.blk{width:100%}
.ngm-btn.ico{flex:1}
.ngm-pendingbar{margin:0 var(--pad);padding:10px 12px;border-radius:var(--rs);background:var(--orange-bg);border:1px solid rgba(255,159,10,.3);font-size:12px;color:var(--orange);display:flex;align-items:center;gap:10px;animation:ngm-slide .25s ease}
.ngm-pendingbar.hide{display:none}
.ngm-pendingbar .acts{margin-left:auto;display:flex;gap:6px;flex-shrink:0}
@keyframes ngm-slide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.ngm-empty{padding:40px 16px;text-align:center;color:var(--text-3);font-size:12px}
.ngm-empty .ill{width:56px;height:56px;margin:0 auto 12px;border-radius:14px;background:var(--bg-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-3)}
.ngm-empty .ill svg{width:26px;height:26px}
.ngm-tunnel{border-bottom:1px solid var(--border);padding:14px;position:relative;animation:ngm-fade .3s ease}
.ngm-tunnel:last-child{border-bottom:none}
.ngm-tunnel::before{content:'';position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 2px 2px 0}
.ngm-tunnel.s-running::before{background:var(--green)}
.ngm-tunnel.s-starting::before{background:var(--yellow)}
.ngm-tunnel.s-stopping::before,.ngm-tunnel.s-error::before,.ngm-tunnel.s-stopped::before{background:var(--red)}
@keyframes ngm-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.ngm-th{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ngm-tnm{font-family:var(--mono);font-size:11px;color:var(--text-3);flex-shrink:0}
.ngm-turl{flex:1;min-width:0;font-family:var(--mono);font-size:var(--fs-url);color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.ngm-turl:active{opacity:.7}
.ngm-turl.ph{color:var(--text-3);font-style:italic}
.ngm-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;letter-spacing:.3px;flex-shrink:0}
.ngm-pill .d{width:6px;height:6px;border-radius:50%}
.ngm-pill.live{background:var(--green-bg);color:var(--green)}
.ngm-pill.live .d{background:var(--green);animation:ngm-pulse 1.5s infinite}
.ngm-pill.starting{background:var(--yellow-bg);color:var(--yellow)}
.ngm-pill.starting .d{background:var(--yellow);animation:ngm-pulse 1s infinite}
.ngm-pill.stopping,.ngm-pill.error,.ngm-pill.stopped{background:var(--red-bg);color:var(--red)}
.ngm-pill.stopping .d,.ngm-pill.error .d,.ngm-pill.stopped .d{background:var(--red)}
.ngm-pill.plain{background:var(--bg-4);color:var(--text-2)}
@keyframes ngm-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.ngm-tmeta{display:flex;gap:12px;font-size:11px;color:var(--text-2);margin-bottom:10px;flex-wrap:wrap}
.ngm-tmeta .k{color:var(--text-3);margin-right:4px}
.ngm-tacts{display:flex;gap:6px}
.ngm-tacts .ngm-btn{flex:1;height:34px;font-size:12px}
.ngm-ptunnel{border-bottom:1px solid var(--border);padding:10px 14px;display:flex;align-items:center;gap:8px}
.ngm-ptunnel:last-child{border-bottom:none}
.ngm-ptunnel .pp{font-size:10px;padding:3px 7px;border-radius:5px;font-weight:600;flex-shrink:0}
.ngm-ptunnel .pa{background:var(--orange-bg);color:var(--orange)}
.ngm-ptunnel .pr{background:var(--red-bg);color:var(--red)}
.ngm-ptunnel .pi{flex:1;min-width:0;font-size:12px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ngm-ptunnel .pi .pn{font-family:var(--mono);color:var(--text)}
.ngm-logs{background:#0c0c10;color:#b0b0b8;font-family:var(--mono);font-size:11px;padding:10px 12px;max-height:200px;overflow-y:auto;line-height:1.65}
.ngm-logs::-webkit-scrollbar{width:5px}
.ngm-logs::-webkit-scrollbar-thumb{background:#2a2a33}
.ngm-logline{white-space:pre-wrap;word-break:break-all}
.ngm-logline.info{color:#8ab4f8}
.ngm-logline.warn{color:#ffcc00}
.ngm-logline.error{color:#ff6b6b}
.ngm-logline.url{color:var(--green);font-weight:600}
.ngm-bottombar{flex-shrink:0;border-top:1px solid var(--border);background:var(--bg-2);padding:10px var(--pad) calc(10px + env(safe-area-inset-bottom,0px));display:flex;gap:8px;align-items:center}
.ngm-bottombar .ci{font-size:11px;color:var(--text-3);flex:1;min-width:0}
.ngm-bottombar .ci b{color:var(--text);font-size:13px}
.ngm-bottombar.hide{display:none}
.ngm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:50;display:none}
.ngm-overlay.show{display:block}
.ngm-sheet{position:absolute;left:0;right:0;bottom:0;max-height:88vh;max-height:88dvh;background:var(--bg-2);border-top-left-radius:16px;border-top-right-radius:16px;border-top:1px solid var(--border);box-shadow:0 -8px 32px rgba(0,0,0,.4);transform:translateY(100%);transition:transform .28s cubic-bezier(.32,.72,0,1);display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px)}
.ngm-overlay.show .ngm-sheet{transform:translateY(0)}
@media(min-width:720px){.ngm-overlay{align-items:center;justify-content:center}.ngm-sheet{position:relative;left:auto;right:auto;bottom:auto;max-width:460px;width:100%;border-radius:14px}}
.ngm-grip{width:36px;height:4px;background:var(--bg-5);border-radius:2px;margin:8px auto 0;flex-shrink:0}
.ngm-sheethead{display:flex;align-items:center;padding:12px 16px;gap:8px;font-weight:600;font-size:14px;flex-shrink:0}
.ngm-sheetbody{padding:4px 16px 16px;overflow-y:auto;flex:1}
.ngm-sheetfoot{padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0}
.ngm-toastwrap{position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:100%;max-width:360px;padding:0 12px}
.ngm-toast{background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.28);animation:ngm-toast .25s ease;width:100%;text-align:center}
.ngm-toast.ok{border-left:3px solid var(--green)}
.ngm-toast.err{border-left:3px solid var(--red)}
.ngm-toast.info{border-left:3px solid var(--accent)}
.ngm-toast.warn{border-left:3px solid var(--orange)}
@keyframes ngm-toast{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.ngm-details summary{cursor:pointer;user-select:none;list-style:none}
.ngm-details summary::-webkit-details-marker{display:none}
.ngm-chev{transition:transform .2s;display:inline-block}
.ngm-details[open] summary .ngm-chev{transform:rotate(90deg)}
.ngm-hintbox{font-size:11px;color:var(--text-3);padding:10px 12px;background:var(--bg-3);border-radius:var(--rs);border-left:2px solid var(--accent);line-height:1.6}
.ngm-hintbox b{color:var(--text-2)}
.ngm-preflight{margin:0 var(--pad);padding:12px 14px;border-radius:var(--rs);background:var(--red-bg);border:1px solid rgba(255,69,58,.3);font-size:12px;color:var(--red);display:flex;flex-direction:column;gap:8px}
.ngm-preflight.hide{display:none}
.ngm-preflight .pt-title{font-weight:600;display:flex;align-items:center;gap:6px}
.ngm-preflight .pt-item{display:flex;align-items:flex-start;gap:8px;font-size:11px;color:var(--text-2)}
.ngm-preflight .pt-item .ic{flex-shrink:0;font-size:13px}
.ngm-preflight .pt-item.ok .ic{color:var(--green)}
.ngm-preflight .pt-item.fail .ic{color:var(--red)}
.ngm-preflight .pt-item .tx{flex:1;min-width:0}
.ngm-preflight .pt-item .tx code{font-family:var(--mono);font-size:10px;background:var(--bg-3);padding:1px 5px;border-radius:3px;color:var(--text)}
.ngm-preflight .pt-actions{display:flex;gap:6px;margin-top:4px}
`

// ============================================================================
// 组件
// ============================================================================
export default function NgrokManagerPanel({ pluginId: _pluginId }: { pluginId: string }) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [pending, setPending] = useState<{ id: string; op: 'add' | 'remove'; port?: number; domain?: string | null; name?: string; targetId?: string }[]>([])
  const [logs, setLogs] = useState<LogLine[]>([])
  const [mode, setMode] = useState<'random' | 'fixed'>('random')
  const [portInput, setPortInput] = useState('')
  const [domainInput, setDomainInput] = useState('dominant-ant-formerly.ngrok-free.app')
  const [health, setHealth] = useState<Health | null>(null)
  const [applying, setApplying] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [cfg, setCfg] = useState<PluginConfig>({ ngrokPath: 'ngrok', defaultDomain: 'dominant-ant-formerly.ngrok-free.app', mgrPort: 9870 })
  const [mgrPort, setMgrPort] = useState(DEFAULT_PORT)
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: string }[]>([])
  const seqRef = useRef(1)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // ---- toast ----
  const toast = useCallback((msg: string, type = 'info') => {
    const id = 'ts' + (seqRef.current++)
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800)
  }, [])

  // ---- 健康检查 + 端口发现 ----
  useEffect(() => {
    let cancelled = false
    async function probe() {
      // 尝试 9870..9875 找管理器
      for (let p = DEFAULT_PORT; p <= DEFAULT_PORT + 5; p++) {
        try {
          const res = await fetch(`http://127.0.0.1:${p}/__health`, { signal: AbortSignal.timeout(1500) })
          if (res.ok) {
            const data = await res.json()
            if (!cancelled) { setMgrPort(p); setHealth(data); return }
          }
        } catch { /* continue */ }
      }
      if (!cancelled) setHealth(null)
    }
    probe()
    const t = setInterval(probe, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // ---- 拉隧道 + 日志 ----
  useEffect(() => {
    if (!health) return
    let cancelled = false
    async function pull() {
      try {
        const [tr, lg] = await Promise.all([
          mgrFetch('/tunnels', undefined, mgrPort),
          mgrFetch('/logs?limit=80', undefined, mgrPort),
        ])
        if (!cancelled) {
          setTunnels(tr.data || [])
          setLogs(lg.data || [])
        }
      } catch { /* 管理器未就绪 */ }
    }
    pull()
    const t = setInterval(pull, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [health, mgrPort])

  // ---- 拉配置 ----
  useEffect(() => {
    mgrFetch('/config', undefined, mgrPort).then(r => { if (r.data) { setCfg(r.data); if (r.data.defaultDomain) setDomainInput(r.data.defaultDomain) } }).catch(() => {})
  }, [mgrPort])

  // ---- 日志自动滚底 ----
  useEffect(() => { logsEndRef.current?.scrollIntoView({ block: 'end' }) }, [logs])

  // ---- 时长刷新 ----
  const [, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t) }, [])

  // ---- actions ----
  function addPending() {
    const port = parseInt(portInput, 10)
    if (!port || port < 1 || port > 65535) return toast('请输入合法端口(1-65535)', 'err')
    if (pending.some(p => p.op === 'add' && p.port === port)) return toast('待应用已有端口 ' + port, 'err')
    if (tunnels.some(t => t.port === port)) return toast('运行中已有端口 ' + port, 'err')
    const domain = mode === 'fixed' ? domainInput.trim() : null
    if (mode === 'fixed' && !domain) return toast('请填写保留域名', 'err')
    if (domain && (pending.some(p => p.domain === domain) || tunnels.some(t => t.domain === domain))) return toast('域名 ' + domain + ' 已被占用', 'err')
    setPending(p => [...p, { id: 'p' + (seqRef.current++), op: 'add', port, domain }])
    setPortInput('')
    toast('已加入: ' + port + (domain ? ' · ' + domain : ' 随机'), 'info')
  }
  function removePending(id: string) { setPending(p => p.filter(x => x.id !== id)) }
  function stopTunnel(id: string) {
    const t = tunnels.find(x => x.id === id); if (!t) return
    setPending(p => [...p, { id: 'p' + (seqRef.current++), op: 'remove', targetId: id, port: t.port, name: t.name }])
    toast(t.name + ' 标记停止,待应用', 'warn')
  }
  async function applyPending() {
    if (!pending.length || applying) return
    setApplying(true)
    try {
      // 顺序应用:add 先,remove 后(各自触发重启)
      for (const p of pending) {
        if (p.op === 'add') {
          const r = await mgrFetch('/tunnels', { method: 'POST', body: JSON.stringify({ port: p.port, domain: p.domain }) }, mgrPort)
          if (r.status >= 400) { toast('启动 ' + p.port + ' 失败: ' + (r.data?.error || ''), 'err'); break }
        } else if (p.op === 'remove' && p.targetId) {
          const r = await mgrFetch('/tunnels/' + p.targetId, { method: 'DELETE' }, mgrPort)
          if (r.status >= 400) { toast('停止失败: ' + (r.data?.error || ''), 'err'); break }
        }
      }
      setPending([])
      toast('已应用变更', 'ok')
    } catch (e) { toast('应用失败: ' + (e as Error).message, 'err') }
    finally { setApplying(false) }
  }
  function discardPending() { setPending([]); toast('已放弃待应用', 'info') }
  function stopAll() {
    tunnels.forEach(t => setPending(p => [...p, { id: 'p' + (seqRef.current++), op: 'remove', targetId: t.id, port: t.port, name: t.name }]))
  }
  function copyUrl(url: string) { navigator.clipboard?.writeText(url).then(() => toast('已复制: ' + url, 'ok')) }
  function openUrl(url: string) {
    // Tauri shell.open 优先,否则 window.open
    const w = window as any
    if (w.__TAURI__?.shell?.open) w.__TAURI__.shell.open(url)
    else if (w.__TAURI_INTERNALS__?.invoke) w.__TAURI_INTERNALS__.invoke('plugin:shell|open', { path: url }).catch(() => window.open(url, '_blank'))
    else window.open(url, '_blank')
    toast('打开浏览器: ' + url, 'info')
  }
  async function saveSettings(next: PluginConfig) {
    const r = await mgrFetch('/config', { method: 'PUT', body: JSON.stringify(next) }, mgrPort)
    if (r.data) { setCfg(r.data); if (r.data.defaultDomain) setDomainInput(r.data.defaultDomain) }
    setShowSettings(false)
    toast('设置已保存', 'ok')
  }

  // ---- helpers ----
  function fmtDur(ms: number) { const s = Math.floor(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); return m + 'm' + (s % 60) + 's' }
  const nowIso = () => new Date().toISOString()

  const procStat = applying ? 'warn' : (health && tunnels.length > 0 ? 'ok' : (health ? 'muted' : 'err'))
  const procText = applying ? '重启中…' : (health && tunnels.length > 0 ? `运行中 · ${tunnels.length} 隧道` : (health ? '未运行' : '管理器未启动'))
  const preflightOk = health?.ngrokReady && health?.authTokenReady
  const showPreflight = health && !preflightOk

  return (
    <div className="ngm-root">
      <style>{STYLES}</style>

      {/* topbar */}
      <div className="ngm-topbar">
        <div className="ngm-brand">
          <span className="ngm-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M3 12h4l3-9 4 18 3-9h4" /></svg>
          </span>
          <span>ngrok</span>
          <span className="ngm-ver">v2</span>
        </div>
        <span className={`ngm-stat ${procStat}`}><span className="d"></span><span>{procText}</span></span>
        <span className="ngm-spacer"></span>
        <button className="ngm-iconbtn" title="刷新" onClick={() => { setTick(x => x + 1) }}>↻</button>
        <button className="ngm-iconbtn" title="设置" onClick={() => setShowSettings(true)}>⚙</button>
      </div>

      {/* preflight (前置条件不满足) */}
      <div className={`ngm-preflight ${showPreflight ? '' : 'hide'}`}>
        <div className="pt-title">⚠ 前置条件未就绪</div>
        <div className={`pt-item ${health?.ngrokReady ? 'ok' : 'fail'}`}>
          <span className="ic">{health?.ngrokReady ? '✓' : '✗'}</span>
          <span className="tx">ngrok 可执行文件 {health?.ngrokReady ? `(${health.ngrokPath})` : '未找到'}。请先在电脑安装 ngrok:<code>https://ngrok.com/download</code>,或在设置中配置 ngrok.exe 绝对路径。</span>
        </div>
        <div className={`pt-item ${health?.authTokenReady ? 'ok' : 'fail'}`}>
          <span className="ic">{health?.authTokenReady ? '✓' : '✗'}</span>
          <span className="tx">authtoken {health?.authTokenReady ? `已配置(${health.authTokenPath})` : '未配置'}。从 <code>https://dashboard.ngrok.com/get-started/your-authtoken</code> 获取,运行:<code>ngrok config add-authtoken &lt;token&gt;</code></span>
        </div>
        <div className="pt-actions">
          <button className="ngm-btn g sm" onClick={() => setShowSettings(true)}>打开设置</button>
        </div>
      </div>

      {/* pending inline bar */}
      <div className={`ngm-pendingbar ${pending.length ? '' : 'hide'}`}>
        <span>● 待应用 {pending.length} 项{applying ? ' (应用中…)' : ''}</span>
        <span style={{ fontSize: 10, opacity: .65, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>应用将重启 ngrok,中断 ~2-3s</span>
        <div className="acts">
          <button className="ngm-btn g sm" onClick={discardPending}>放弃</button>
          <button className="ngm-btn w sm" disabled={applying} onClick={applyPending}>应用</button>
        </div>
      </div>

      {/* body */}
      <div className="ngm-body">
        {/* add form */}
        <div className="ngm-card">
          <div className="ngm-cardhead">添加隧道<span className="h">批量加入 · 一次应用</span></div>
          <div className="ngm-cardbody">
            <div className="ngm-field">
              <label>本地端口 <span className="rq">*</span></label>
              <input className="ngm-input" placeholder="9820" inputMode="numeric" value={portInput} onChange={e => setPortInput(e.target.value)} />
              <div className="ngm-chips" style={{ marginTop: 8 }}>
                {['3000', '8080', '9820', '5173', '4173'].map(p => (
                  <button key={p} className="ngm-chip" onClick={() => setPortInput(p)}>:{p}</button>
                ))}
              </div>
            </div>
            <div className="ngm-field">
              <label>域名模式</label>
              <div className="ngm-seg">
                <button className={mode === 'random' ? 'active' : ''} onClick={() => setMode('random')}>随机</button>
                <button className={mode === 'fixed' ? 'active' : ''} onClick={() => setMode('fixed')}>固定域名</button>
              </div>
            </div>
            {mode === 'fixed' && (
              <div className="ngm-field">
                <label>保留域名</label>
                <input className="ngm-input" value={domainInput} onChange={e => setDomainInput(e.target.value)} />
              </div>
            )}
            <button className="ngm-btn g blk" onClick={addPending} disabled={!health || !preflightOk}>
              <span style={{ fontSize: 16, lineHeight: 0 }}>＋</span>&nbsp;加入待应用
            </button>
          </div>
        </div>

        {/* pending list */}
        {pending.length > 0 && (
          <div className="ngm-card">
            <div className="ngm-cardhead">待应用<span className="h">{pending.length} 项</span></div>
            <div>
              {pending.map(p => (
                <div key={p.id} className="ngm-ptunnel">
                  <span className={`pp ${p.op === 'add' ? 'pa' : 'pr'}`}>{p.op === 'add' ? '＋' : '－'}</span>
                  <span className="pi">
                    {p.op === 'add'
                      ? <><span className="pn">:{p.port}</span> {p.domain ? '· ' + p.domain : '· 随机'}</>
                      : <>停止 <span className="pn">{p.name}</span> :{p.port}</>}
                  </span>
                  <button className="ngm-iconbtn" style={{ width: 28, height: 28 }} onClick={() => removePending(p.id)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* running tunnels */}
        <div className="ngm-card">
          <div className="ngm-cardhead">运行中隧道<span className="h">{tunnels.length} 条</span></div>
          <div>
            {tunnels.length === 0 ? (
              <div className="ngm-empty">
                <div className="ill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 12h4l3-9 4 18 3-9h4" /></svg></div>
                尚无运行中的隧道<br /><span style={{ fontSize: 11, opacity: .7 }}>{!health ? '管理器未启动' : !preflightOk ? '前置条件未就绪' : '添加隧道后点击"应用"'}</span>
              </div>
            ) : tunnels.map(t => {
              const pill = t.status === 'running' ? <span className="ngm-pill live"><span className="d"></span>RUNNING</span>
                : t.status === 'starting' ? <span className="ngm-pill starting"><span className="d"></span>STARTING</span>
                  : <span className="ngm-pill error"><span className="d"></span>{(t.status || 'ERROR').toUpperCase()}</span>
              const dur = t.status === 'running' ? fmtDur(Date.now() - t.startedAt) : '-'
              const canAct = t.status === 'running' || t.status === 'starting'
              return (
                <div key={t.id} className={`ngm-tunnel s-${t.status}`}>
                  <div className="ngm-th">
                    <span className="ngm-tnm">{t.name}</span>
                    <span className={`ngm-turl ${t.publicUrl ? '' : 'ph'}`} onClick={() => t.publicUrl && copyUrl(t.publicUrl!)}>{t.publicUrl || '等待分配 URL…'}</span>
                    {pill}
                  </div>
                  <div className="ngm-tmeta">
                    <span><span className="k">本地</span>localhost:{t.port}</span>
                    <span><span className="k">时长</span>{dur}</span>
                    <span className="ngm-pill plain">{t.domain ? '固定' : '随机'}</span>
                  </div>
                  <div className="ngm-tacts">
                    <button className="ngm-btn g" disabled={!t.publicUrl} onClick={() => t.publicUrl && copyUrl(t.publicUrl!)}>复制</button>
                    <button className="ngm-btn g" disabled={!t.publicUrl} onClick={() => t.publicUrl && openUrl(t.publicUrl!)}>打开</button>
                    <button className="ngm-btn d" disabled={!canAct} onClick={() => stopTunnel(t.id)}>停止</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* logs */}
        <div className="ngm-card">
          <details className="ngm-details">
            <summary>
              <div className="ngm-cardhead" style={{ padding: 0, border: 'none' }}>
                <span className="ngm-chev">▸</span> 日志<span className="h">{logs.length} 行</span>
              </div>
            </summary>
            <div className="ngm-logs">
              {logs.length === 0 ? <div className="ngm-logline info">// 启动隧道后此处显示 ngrok JSON 日志</div>
                : logs.slice(-60).map((l, i) => {
                  const cls = l.lvl === 'eror' || l.lvl === 'error' ? 'error' : l.lvl === 'warn' ? 'warn' : l.url ? 'url' : 'info'
                  return <div key={i} className={`ngm-logline ${cls}`}>{l.t || nowIso()} {l.lvl}{l.obj ? ' [' + l.obj + ']' : ''}{l.name ? ' ' + l.name : ''} {l.msg || ''}{l.addr ? '  addr=' + l.addr : ''}{l.url ? '  url=' + l.url : ''}</div>
                })}
              <div ref={logsEndRef} />
            </div>
          </details>
        </div>

        <div className="ngm-hintbox">
          💡 <b>多隧道原理</b>:free 计划限制 session 数=1,单进程内可启多条隧道共享 session、各自独立 URL。增删需重启进程,期间所有隧道短暂中断,故采用"批量编辑 + 一次应用"。
        </div>
      </div>

      {/* bottom action bar */}
      <div className={`ngm-bottombar ${pending.length ? '' : 'hide'}`}>
        <div className="ci">待应用 <b>{pending.length}</b> 项 · 应用将重启 ngrok</div>
        <button className="ngm-btn g sm" onClick={discardPending}>放弃</button>
        <button className="ngm-btn w" style={{ minWidth: 96 }} disabled={applying} onClick={applyPending}>{applying ? '应用中…' : '应用变更'}</button>
      </div>

      {/* settings bottom sheet */}
      <div className={`ngm-overlay ${showSettings ? 'show' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}>
        <SettingsSheet cfg={cfg} onSave={saveSettings} onClose={() => setShowSettings(false)} />
      </div>

      {/* toasts */}
      <div className="ngm-toastwrap">
        {toasts.map(t => <div key={t.id} className={`ngm-toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </div>
  )
}

// ============================================================================
// Settings bottom sheet
// ============================================================================
function SettingsSheet({ cfg, onSave, onClose }: { cfg: PluginConfig; onSave: (c: PluginConfig) => void; onClose: () => void }) {
  const [form, setForm] = useState<PluginConfig>({ ...cfg })
  return (
    <div className="ngm-sheet">
      <div className="ngm-grip"></div>
      <div className="ngm-sheethead">⚙ 设置</div>
      <div className="ngm-sheetbody">
        <div className="ngm-field">
          <label>ngrok.exe 路径</label>
          <input className="ngm-input" value={form.ngrokPath} onChange={e => setForm({ ...form, ngrokPath: e.target.value })} placeholder="ngrok (PATH) 或绝对路径" />
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>默认从 PATH 查找 <code>ngrok</code>;填绝对路径如 <code>D:\app\ngrok-v3-stable-windows-amd64\ngrok.exe</code></div>
        </div>
        <div className="ngm-field">
          <label>默认保留域名</label>
          <input className="ngm-input" value={form.defaultDomain} onChange={e => setForm({ ...form, defaultDomain: e.target.value })} />
        </div>
        <div className="ngm-field">
          <label>管理器端口</label>
          <input className="ngm-input" inputMode="numeric" value={String(form.mgrPort)} onChange={e => setForm({ ...form, mgrPort: parseInt(e.target.value, 10) || 9870 })} />
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>被占用时自动 +1,实际端口写入 .port</div>
        </div>
        <div className="ngm-field">
          <label>authtoken</label>
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.7 }}>
            插件不存储凭证。需先在电脑运行:<br />
            <code style={{ fontFamily: 'var(--mono)', background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 3 }}>ngrok config add-authtoken &lt;token&gt;</code><br />
            从 <code style={{ fontFamily: 'var(--mono)', background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 3 }}>dashboard.ngrok.com/get-started/your-authtoken</code> 获取
          </div>
        </div>
      </div>
      <div className="ngm-sheetfoot">
        <button className="ngm-btn g ico" onClick={onClose}>取消</button>
        <button className="ngm-btn p ico" onClick={() => onSave(form)}>保存</button>
      </div>
    </div>
  )
}
