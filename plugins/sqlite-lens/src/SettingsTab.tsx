/**
 * 设置 Tab：服务状态（端口/降级原因/手动启停）+ 雷达根目录管理 +
 * 安全开关（写前备份）+ 键空间契约说明 + 库清单管理。
 */
import { useCallback, useState } from 'react'
import {
  svcFetch, withSvc, serviceAction, fmtBytes, timeAgo,
  type MetaReply, type ServiceMeta, type LibEntry,
} from './model'

export default function SettingsTab({ reply, meta, onChanged, onError }: {
  reply: MetaReply | null; meta: ServiceMeta | null
  onChanged: () => void; onError: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [newRoot, setNewRoot] = useState('')
  const [autoBackup, setAutoBackup] = useState(reply?.settings?.autoBackup ?? true)

  const saveSettings = useCallback(async (patch: Record<string, unknown>) => {
    setBusy(true)
    try {
      await withSvc((m) => svcFetch(m, '/api/settings', { settings: patch }))
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [onChanged, onError])

  const svcOp = useCallback(async (op: 'start' | 'stop' | 'restart') => {
    setBusy(true)
    try {
      await serviceAction(op)
      await new Promise((r) => setTimeout(r, 1200))
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [onChanged, onError])

  const addRoot = useCallback(async () => {
    const p = newRoot.trim()
    if (!p) return
    const roots = [...(reply?.settings?.radarRoots || [])]
    if (!roots.includes(p)) roots.push(p)
    setNewRoot('')
    await saveSettings({ radarRoots: roots })
  }, [newRoot, reply, saveSettings])

  const removeRoot = useCallback(async (root: string) => {
    const roots = (reply?.settings?.radarRoots || []).filter((r) => r !== root)
    await saveSettings({ radarRoots: roots })
  }, [reply, saveSettings])

  const removeLib = useCallback(async (dbId: string) => {
    try {
      await withSvc((m) => svcFetch(m, '/api/libs_remove', { dbId }))
      onChanged()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }, [onChanged, onError])

  const libs: LibEntry[] = reply?.libs || []
  const settings = reply?.settings

  return (
    <div>
      <div className="sl-sec"><span className="sl-bar" />服务<span className="sl-hint">127.0.0.1 本机监听 + token，零外网</span></div>
      <div className="sl-card">
        <div className="sl-card-b">
          <div className="sl-kv"><span className="k">状态</span><span className="v">
            {meta ? (meta.degraded ? `⚠ 降级：${meta.degraded}` : `运行中 · v${meta.version}`) : '未运行（面板会每 5 秒探测）'}
          </span></div>
          {meta ? <div className="sl-kv"><span className="k">地址</span><span className="v">127.0.0.1:{meta.port}（token 已入库，重启不换）</span></div> : null}
          {meta ? <div className="sl-kv"><span className="k">已运行</span><span className="v">{timeAgo(meta.startedAt)}</span></div> : null}
          <div className="sl-row" style={{ marginTop: 8 }}>
            <button className="sl-btn sm" disabled={busy} onClick={() => svcOp('restart')}>重启服务</button>
            <button className="sl-btn sm" disabled={busy} onClick={() => svcOp('stop')}>停止</button>
            <button className="sl-btn sm" disabled={busy} onClick={() => svcOp('start')}>启动</button>
          </div>
          <div className="sl-sub" style={{ marginTop: 8 }}>
            引擎：node:sqlite（node ≥ 22.5 内置，零 npm 依赖）。浏览连接永久只读；写走两步确认 + 写前自动备份。
          </div>
        </div>
      </div>

      <div className="sl-sec"><span className="sl-bar" />安全开关</div>
      <div className="sl-card">
        <div className="sl-card-b">
          <label className="sl-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={autoBackup} onChange={(e) => { setAutoBackup(e.target.checked); saveSettings({ autoBackup: e.target.checked }) }} />
            <span>写前自动整库备份（每个文件每次服务生命周期备一次，存数据根 sqlite-lens/backups/）</span>
          </label>
          <div className="sl-sub" style={{ marginTop: 6 }}>关闭后写操作不再先备份——除非你清楚自己在做什么，建议保持开启。</div>
        </div>
      </div>

      <div className="sl-sec"><span className="sl-bar" />雷达根目录<span className="sl-hint">库雷达额外扫描的目录</span></div>
      <div className="sl-card">
        <div className="sl-card-b">
          <div className="sl-row">
            <input className="sl-inp sl-grow sl-mono" placeholder="如 D:\\space\\projects" value={newRoot} onChange={(e) => setNewRoot(e.target.value)} />
            <button className="sl-btn sm" disabled={busy} onClick={addRoot}>添加</button>
          </div>
          {(settings?.radarRoots || []).length === 0
            ? <div className="sl-sub" style={{ marginTop: 6 }}>未添加——雷达默认扫用户目录/下载/文档/AppData 常见位置</div>
            : (settings?.radarRoots || []).map((r) => (
              <div key={r} className="sl-row" style={{ marginTop: 6 }}>
                <span className="sl-grow sl-mono" style={{ fontSize: 11.5 }}>{r}</span>
                <button className="sl-btn sm" onClick={() => removeRoot(r)}>移除</button>
              </div>
            ))}
        </div>
      </div>

      <div className="sl-sec"><span className="sl-bar" />已打开的库<span className="sl-hint">{libs.length} 个（跨端共享清单）</span></div>
      {libs.length === 0 ? <div className="sl-empty">暂无</div> : libs.map((l) => (
        <div key={l.dbId} className="sl-card">
          <div className="sl-card-b">
            <div className="sl-row">
              <span className="sl-grow" style={{ overflow: 'hidden' }}>
                <div className="sl-mono" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.path}>{l.path}</div>
                <div className="sl-sub">{fmtBytes(l.sizeBytes)} · {l.tables.length} 表 · 最近打开 {timeAgo(l.lastOpenedAt)}{l.knownAs ? ` · ${l.knownAs}` : ''}</div>
              </span>
              <button className="sl-btn sm" onClick={() => removeLib(l.dbId)}>从清单移除</button>
            </div>
          </div>
        </div>
      ))}

      <div className="sl-sec"><span className="sl-bar" />键空间契约</div>
      <div className="sl-card">
        <div className="sl-card-b sl-sub">
          cap.kv 前缀 <code>sqltl.</code>：meta（心跳/端口/token）/ settings / libs（清单）/ qhist（查询历史 50）/ audit（写审计 100）/ pending.*（两步写待确认单，10 分钟 TTL，过期清扫）。服务是这些键的唯一写者；面板与 MCP 只读 meta 并调服务 HTTP。
        </div>
      </div>
    </div>
  )
}
