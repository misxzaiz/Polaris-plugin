/**
 * Panel.tsx —— 行数透视台主组件
 *
 * 「当前项目」自动跟随：挂载即订阅 onWorkspaceChanged（polaris-git 同款契约），
 * 切换工作区自动重扫；手动输入路径可覆盖（存 cap.kv loclens.settings）。
 * 数据面：读 loclens.meta → 127.0.0.1 直连服务 /api/stats，2s 轮询保实时。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, invalidateMeta, loadSettings, restartService, saveSettings, SERVICE_ID, PLUGIN_ID } from './model'
import type { ModuleRow, StatsPayload, Settings } from './model'
import { currentWorkspacePath, onWorkspaceChanged } from './host'
import { fmtCount } from './coreBridge'

const POLL_MS = 2000
const ROOT_FILES_BUCKET = '(根文件)'

// 面板样式：内联注入 + .ll-* 前缀 scoping（repo-lens 同款做法），
// 颜色全部走宿主主题 CSS 变量（--c-*），跟随深浅主题。
const STYLE = `
.ll-wrap{display:flex;flex-direction:column;height:100%;min-height:0;color:rgb(var(--c-text-primary));background:rgb(var(--c-bg-base));font-size:12px;overflow:hidden}
.ll-head{padding:10px 10px 6px;border-bottom:1px solid rgb(var(--c-border)/.08);display:flex;flex-direction:column;gap:6px}
.ll-title-row{display:flex;align-items:center;gap:6px}
.ll-title{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-badge{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid rgb(var(--c-border)/.2);color:rgb(var(--c-text-secondary));white-space:nowrap}
.ll-badge-live{color:rgb(34 197 94);border-color:rgb(34 197 94/.4)}
.ll-badge-scan{color:rgb(234 179 8);border-color:rgb(234 179 8/.4)}
.ll-badge-err{color:rgb(239 68 68);border-color:rgb(239 68 68/.4)}
.ll-path-row{display:flex;gap:4px;align-items:center}
.ll-inp{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;padding:4px 6px;border-radius:4px;border:1px solid rgb(var(--c-border)/.15);background:rgb(var(--c-bg-base));color:rgb(var(--c-text-primary));outline:none}
.ll-inp:focus{border-color:rgb(59 130 246/.6)}
.ll-btn{border:1px solid rgb(var(--c-border)/.2);background:rgb(var(--c-bg-soft,var(--c-bg-base)));color:rgb(var(--c-text-primary));border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;white-space:nowrap}
.ll-btn:hover{border-color:rgb(59 130 246/.5)}
.ll-btn:disabled{opacity:.5;cursor:default}
.ll-hint{font-size:10px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-body{flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:10px}
.ll-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ll-card{border:1px solid rgb(var(--c-border)/.1);border-radius:6px;padding:6px 8px;background:rgb(var(--c-bg-soft,transparent))}
.ll-card-num{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.ll-card-label{font-size:10px;color:rgb(var(--c-text-secondary));margin-top:1px}
.ll-sec-title{font-size:11px;font-weight:600;color:rgb(var(--c-text-secondary));margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.ll-bar-row{display:flex;flex-direction:column;gap:2px;padding:4px 0}
.ll-bar-row-click{cursor:pointer}
.ll-bar-row-click:hover .ll-bar-name{color:rgb(59 130 246)}
.ll-bar-top{display:flex;align-items:baseline;gap:6px}
.ll-bar-name{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-bar-files{font-size:10px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));white-space:nowrap}
.ll-bar-val{font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.ll-bar-track{height:4px;border-radius:2px;background:rgb(var(--c-border)/.12);overflow:hidden}
.ll-bar-fill{height:100%;border-radius:2px;background:rgb(59 130 246/.75);min-width:2px}
.ll-chips{display:flex;flex-wrap:wrap;gap:4px}
.ll-chip{font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid rgb(var(--c-border)/.15);color:rgb(var(--c-text-secondary));white-space:nowrap}
.ll-chip b{color:rgb(var(--c-text-primary));font-weight:600}
.ll-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));text-align:center;padding:20px}
.ll-err{font-size:11px;color:rgb(239 68 68);padding:6px 8px;border:1px solid rgb(239 68 68/.3);border-radius:4px;word-break:break-all}
.ll-foot{padding:4px 10px 8px;font-size:10px;color:rgb(var(--c-text-tertiary,var(--c-text-secondary)));display:flex;justify-content:space-between;gap:8px}
`

type Source = { kind: 'workspace'; path: string } | { kind: 'manual'; path: string } | { kind: 'none' }

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

function fmtBytes(n: number): string {
  const v = Number(n) || 0
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
  return v + ' B'
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 5) return '刚刚'
  if (s < 60) return `${s} 秒前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  return `${Math.floor(m / 60)} 小时前`
}

export default function Panel(): JSX.Element {
  const [source, setSource] = useState<Source>({ kind: 'none' })
  const [input, setInput] = useState('')
  const [settings, setSettings] = useState<Settings>({})
  const [data, setData] = useState<StatsPayload | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pollRef = useRef<number | null>(null)
  const sourceRef = useRef<Source>(source)
  sourceRef.current = source

  // ── 初始化：读设置 + 订阅工作区 ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    let manualMode = false // 本轮会话里用户是否手动指定过路径
    void loadSettings().then((s) => {
      if (cancelled) return
      setSettings(s)
      if (s.manualRoot) {
        // 上次手动指定的目录：优先沿用（用户显式选择过的）
        manualMode = true
        setSource({ kind: 'manual', path: s.manualRoot })
        setInput(s.manualRoot)
      }
    })
    const unsub = onWorkspaceChanged((wsPath) => {
      if (cancelled || manualMode) return
      if (wsPath) {
        setSource({ kind: 'workspace', path: wsPath })
      } else if (sourceRef.current.kind === 'none') {
        setSource({ kind: 'none' })
      }
    })
    return () => { cancelled = true; unsub() }
  }, [])

  // ── 数据轮询 ────────────────────────────────────────────────────────────
  const root = source.kind === 'none' ? '' : source.path

  const refresh = useCallback(async (forceRescan: boolean) => {
    const cur = sourceRef.current
    if (cur.kind === 'none' || !cur.path) return
    setBusy(true)
    try {
      const payload = forceRescan ? await api.rescan(cur.path) : await api.stats(cur.path)
      setData(payload as StatsPayload)
      setScanning(!!(payload as { scanning?: boolean }).scanning)
      setError(null)
      // 服务重启后 meta 可能变化
      if (forceRescan) invalidateMeta()
    } catch (e) {
      const msg = (e as Error).message || String(e)
      setError(msg)
      // meta 失效自救：清缓存下轮重读；连续失败时尝试重启服务
      invalidateMeta()
      if (msg.includes('服务未注册')) {
        void restartService(PLUGIN_ID, SERVICE_ID).catch(() => { /* 重启失败静默，下轮再试 */ })
      }
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!root) { setData(null); setError(null); return }
    void refresh(false)
    pollRef.current = window.setInterval(() => { void refresh(false) }, POLL_MS)
    return () => { if (pollRef.current != null) window.clearInterval(pollRef.current) }
  }, [root, refresh])

  // ── 手动路径提交 ────────────────────────────────────────────────────────
  const submitManual = useCallback(async () => {
    const p = input.trim()
    if (!p) return
    const next: Settings = { ...settings, manualRoot: p, recentPaths: [p, ...(settings.recentPaths || []).filter((x) => x !== p)].slice(0, 8) }
    setSettings(next)
    void saveSettings(next).catch(() => { /* 设置保存失败不阻塞浏览 */ })
    setSource({ kind: 'manual', path: p })
  }, [input, settings])

  const followWorkspace = useCallback(() => {
    const ws = currentWorkspacePath()
    if (!ws) return
    const next: Settings = { ...settings, manualRoot: '' }
    setSettings(next)
    void saveSettings(next).catch(() => { /* 忽略 */ })
    setSource({ kind: 'workspace', path: ws })
  }, [settings])

  // ── 展示数据 ────────────────────────────────────────────────────────────
  const stats = data?.stats
  const maxLines = useMemo(() => (stats?.modules || []).reduce((m, r) => Math.max(m, r.lines), 0), [stats])
  const totalLines = stats?.totals.lines || 0

  const moduleName = useCallback((name: string) => (name === ROOT_FILES_BUCKET ? '（根文件）' : name), [])

  const barRows: ModuleRow[] = stats?.modules || []

  return (
    <div className="ll-wrap">
      <style>{STYLE}</style>
      <div className="ll-head">
        <div className="ll-title-row">
          <span className="ll-title">行数透视台</span>
          {error
            ? <span className="ll-badge ll-badge-err">服务异常</span>
            : scanning
              ? <span className="ll-badge ll-badge-scan">扫描中…</span>
              : data
                ? <span className="ll-badge ll-badge-live">{data.live ? '实时' : '快照'}</span>
                : null}
        </div>
        <div className="ll-path-row">
          <input
            className="ll-inp"
            value={input}
            placeholder={root || '输入项目根目录绝对路径，或切换到当前项目'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitManual() }}
            list="ll-recent-paths"
          />
          <datalist id="ll-recent-paths">
            {(settings.recentPaths || []).map((p) => <option key={p} value={p} />)}
          </datalist>
          <button className="ll-btn" onClick={() => void submitManual()} disabled={!input.trim() || busy}>扫描</button>
          <button className="ll-btn" onClick={followWorkspace} disabled={!currentWorkspacePath()} title="回到当前项目">当前项目</button>
          <button className="ll-btn" onClick={() => void refresh(true)} disabled={!root || busy}>刷新</button>
        </div>
        {root ? <div className="ll-hint" title={root}>项目：{basename(root)} · {root}</div> : null}
      </div>

      {!root ? (
        <div className="ll-empty">
          <div>尚未选择项目</div>
          <div style={{ fontSize: 11 }}>点击「当前项目」自动统计当前工作区，<br />或输入项目根目录绝对路径后按回车。</div>
        </div>
      ) : error ? (
        <div className="ll-body"><div className="ll-err">{error}</div></div>
      ) : !stats ? (
        <div className="ll-empty"><div>{scanning ? '正在扫描…' : '加载中…'}</div></div>
      ) : (
        <div className="ll-body">
          {stats.truncated ? <div className="ll-err">文件数或内容量超出上限，结果已截断（仅统计部分）。</div> : null}

          <div className="ll-cards">
            <div className="ll-card">
              <div className="ll-card-num">{fmtCount(totalLines)}</div>
              <div className="ll-card-label">总行数</div>
            </div>
            <div className="ll-card">
              <div className="ll-card-num">{fmtCount(stats.totals.files)}</div>
              <div className="ll-card-label">文本文件</div>
            </div>
            <div className="ll-card">
              <div className="ll-card-num">{fmtCount(stats.totals.nonEmptyLines)}</div>
              <div className="ll-card-label">非空行</div>
            </div>
          </div>

          <div>
            <div className="ll-sec-title"><span>模块行数</span><span>{barRows.length} 个目录</span></div>
            {barRows.map((m) => (
              <div key={m.name} className="ll-bar-row ll-bar-row-click" title={`${moduleName(m.name)}：${m.lines} 行 / ${m.files} 文件 / ${fmtBytes(m.bytes)}`}>
                <div className="ll-bar-top">
                  <span className="ll-bar-name">{moduleName(m.name)}</span>
                  <span className="ll-bar-files">{m.files} 文件</span>
                  <span className="ll-bar-val">{fmtCount(m.lines)}</span>
                </div>
                <div className="ll-bar-track">
                  <div className="ll-bar-fill" style={{ width: `${maxLines > 0 ? Math.max(2, Math.round((m.lines / maxLines) * 100)) : 2}%` }} />
                </div>
              </div>
            ))}
            {barRows.length === 0 ? <div className="ll-hint">没有可统计的文本文件（全是忽略目录/二进制？）</div> : null}
          </div>

          {(stats.languages || []).length > 0 ? (
            <div>
              <div className="ll-sec-title"><span>语言分布</span><span>Top {stats.languages.length}</span></div>
              <div className="ll-chips">
                {stats.languages.map((l) => (
                  <span key={l.name} className="ll-chip">{l.name} <b>{fmtCount(l.lines)}</b></span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {root && stats ? (
        <div className="ll-foot">
          <span>{timeAgo(stats.scannedAt)}更新 · 全量 {stats.durationMs}ms</span>
          <span>{data?.live ? '监听中' : '未监听'}{stats.skippedBinary ? ` · 跳过二进制 ${stats.skippedBinary}` : ''}</span>
        </div>
      ) : null}
    </div>
  )
}
