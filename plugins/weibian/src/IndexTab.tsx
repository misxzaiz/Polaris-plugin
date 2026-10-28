/**
 * 索引 Tab：根目录管理（probe 建议 + 校验）+ 扫描进度 + 统计 + 参数 + 重建 + 安全说明
 */
import { useCallback, useEffect, useState } from 'react'
import {
  apiProbe, apiProgress, apiReindex, loadSettings, normalizeSettings, saveSettings,
  ServiceUnavailableError,
  type ProbeResp, type WeibianSettings, type WeibianStats,
} from './model'

function fmtBytes(n: number): string {
  const v = Number(n) || 0
  if (v < 1024) return v + ' B'
  if (v < 1048576) return (v / 1024).toFixed(1) + ' KB'
  if (v < 1073741824) return (v / 1048576).toFixed(1) + ' MB'
  return (v / 1073741824).toFixed(2) + ' GB'
}

export default function IndexTab({ stats, onStats }: { stats: WeibianStats | null, onStats: (s: WeibianStats | null) => void }) {
  const [settings, setSettings] = useState<WeibianSettings | null>(null)
  const [newRoot, setNewRoot] = useState('')
  const [probe, setProbe] = useState<ProbeResp | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRebuild, setConfirmRebuild] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setSettings(await loadSettings())
    } catch (e) {
      setErr('设置读取失败：' + String((e as Error).message || e))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 进 Tab 即探测常用目录（桌面/文档/下载/主目录），不必先填路径
  useEffect(() => {
    let alive = true
    apiProbe().then((r) => { if (alive) setProbe(r) }).catch(() => { /* 服务未就绪时静默 */ })
    return () => { alive = false }
  }, [])

  // 扫描中轮询 /api/progress（拿 pending/errors 实时值）
  useEffect(() => {
    if (!stats || !stats.scanning) return
    let alive = true
    const t = setInterval(async () => {
      try {
        const p = await apiProgress()
        if (alive && p.ok) onStats(p)
      } catch (_) { /* 服务忙时静默 */ }
    }, 1500)
    return () => { alive = false; clearInterval(t) }
  }, [stats, onStats])

  const persist = useCallback(async (next: WeibianSettings) => {
    setBusy(true)
    setErr('')
    try {
      await saveSettings(next)
      setSettings(next)
      setMsg('已保存，服务将在 30s 内自动对账（或点「立即重扫」）')
    } catch (e) {
      setErr('保存失败：' + String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [])

  const addRoot = useCallback(async (p: string) => {
    const path = p.trim()
    if (!path) return
    const cur = settings || normalizeSettings(null)
    if (cur.roots.some((r) => r.toLowerCase() === path.replace(/[\\/]+$/, '').toLowerCase())) {
      setErr('该目录已在列表中')
      return
    }
    await persist({ ...cur, roots: [...cur.roots, path.replace(/[\\/]+$/, '')] })
    setNewRoot('')
    setProbe(null)
  }, [settings, persist])

  const removeRoot = useCallback(async (p: string) => {
    const cur = settings
    if (!cur) return
    await persist({ ...cur, roots: cur.roots.filter((r) => r !== p) })
  }, [settings, persist])

  const checkPath = useCallback(async () => {
    setErr('')
    try {
      const r = await apiProbe(newRoot.trim() || undefined)
      setProbe(r)
      if (r.checked && !r.checked.exists) setErr('路径不存在，请检查盘符与拼写')
      else if (r.checked && !r.checked.isDir) setErr('这是一个文件——韦编按文件夹收录（索引其所在文件夹即可）')
      else if (r.checked && r.checked.isDir) await addRoot(r.checked.path)
    } catch (e) {
      setErr(e instanceof ServiceUnavailableError ? e.message : String((e as Error).message || e))
    }
  }, [newRoot, addRoot])

  const doReindex = useCallback(async (all: boolean) => {
    setBusy(true)
    setErr('')
    try {
      await apiReindex(all)
      setMsg(all ? '已清空索引，开始全量重建（进度见下方）' : '已触发增量重扫')
      setConfirmRebuild(false)
    } catch (e) {
      setErr(e instanceof ServiceUnavailableError ? e.message : String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [])

  const patch = (k: keyof WeibianSettings, v: unknown) => {
    if (!settings) return
    const next = { ...settings, [k]: v } as WeibianSettings
    setSettings(next)
  }

  if (!settings) {
    return <div><div className="wb-empty">{err || '设置载入中…'}</div></div>
  }

  const progressPct = stats && stats.scanning && stats.pending >= 0
    ? Math.min(96, Math.max(4, 100 - (stats.pending / Math.max(1, stats.pending + 40)) * 100))
    : 0

  return (
    <div>
      <div className="wb-sec"><i className="wb-bar" />扫描状态
        <button className="wb-btn ghost sm" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => doReindex(false)}>立即重扫</button>
        <button className="wb-btn danger sm" disabled={busy} onClick={() => setConfirmRebuild(true)}>清空重建</button>
      </div>
      {confirmRebuild && (
        <div className="wb-alert bad">
          清空重建将删除现有索引并全部重新提取（大目录要几分钟）。确定？
          <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
            <button className="wb-btn danger sm" disabled={busy} onClick={() => doReindex(true)}>确定，清空重建</button>
            <button className="wb-btn ghost sm" onClick={() => setConfirmRebuild(false)}>取消</button>
          </div>
        </div>
      )}
      {stats && stats.scanning && (
        <>
          <div className="wb-progress"><i style={{ width: `${progressPct}%` }} /></div>
          <div className="wb-sub" style={{ padding: '0 18px 6px' }}>扫描中：待处理 {stats.pending} · 本次已提取 {stats.byExt ? Object.entries(stats.byExt).reduce((a, [k, n]) => a + (k === 'pdf' || k === 'docx' ? 0 : 0) + n, 0) : 0} 文档</div>
        </>
      )}
      {stats && (
        <div className="wb-card"><div className="wb-card-b">
          <div className="wb-kv">
            <div><b>{stats.docs}</b><small>已索引文档</small></div>
            <div><b>{stats.tokens.toLocaleString()}</b><small>词项</small></div>
            <div><b>{fmtBytes(stats.bytes)}</b><small>源文件体积</small></div>
            <div><b>{stats.lastScanMs ? (stats.lastScanMs / 1000).toFixed(1) + 's' : '—'}</b><small>上次扫描耗时</small></div>
          </div>
          <div className="wb-sub" style={{ marginTop: 6 }}>
            {stats.capped && <span style={{ color: '#F2B263' }}>已达文档上限 {stats.maxDocs}（可在下方调大）。</span>}
            {stats.degraded && <span style={{ color: '#F2B263' }}>宿主桥暂不可达（搜索不受影响）。</span>}
            {Object.keys(stats.byExt).length > 0 && (
              '构成：' + Object.entries(stats.byExt).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' · ')
            )}
          </div>
          {stats.errors && stats.errors.length > 0 && (
            <div className="wb-sub" style={{ color: '#F2B263', marginTop: 4 }}>
              最近问题：{stats.errors.slice(-3).map((e) => `${e.path.split(/[\\/]/).pop()}（${e.reason}）`).join('；')}
            </div>
          )}
        </div></div>
      )}

      <div className="wb-sec"><i className="wb-bar" />索引目录<span className="wb-hint">只收录这里列出的文件夹</span></div>
      <div style={{ padding: '0 18px 4px', display: 'flex', gap: 8 }}>
        <input
          className="wb-inp"
          placeholder="输入文件夹绝对路径，如 D:\\notes 或 C:\\Users\\你\\Documents"
          value={newRoot}
          onChange={(e) => setNewRoot(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') checkPath() }}
        />
        <button className="wb-btn" disabled={busy || !newRoot.trim()} onClick={checkPath}>添加</button>
      </div>
      {probe && probe.suggestions.length > 0 && (
        <div className="wb-chiprow">
          <span className="wb-sub">常用：</span>
          {probe.suggestions.filter((s) => !settings.roots.some((r) => r.toLowerCase() === s.path.toLowerCase())).map((s) => (
            <button key={s.path} className="wb-chip" onClick={() => addRoot(s.path)}>+ {s.label}</button>
          ))}
        </div>
      )}
      {settings.roots.length === 0 && (
        <div className="wb-empty">还没有收录任何文件夹。<br />点上面输入框旁「添加」校验路径，或从「常用」一键加入。</div>
      )}
      {settings.roots.map((r) => (
        <div key={r} className="wb-item" style={{ cursor: 'default' }}>
          <div className="wb-item-head">
            <b style={{ whiteSpace: 'normal' }}>{r}</b>
            <button className="wb-btn ghost sm" onClick={() => removeRoot(r)}>移除</button>
          </div>
        </div>
      ))}

      <div className="wb-sec"><i className="wb-bar" />参数</div>
      <div className="wb-card"><div className="wb-card-b">
        <div className="wb-row">
          <div className="grow">
            <span className="wb-lbl">文档上限（防止失控）</span>
            <input className="wb-inp" type="number" min={50} max={20000} value={settings.maxDocs}
              onChange={(e) => patch('maxDocs', parseInt(e.target.value, 10) || 5000)} />
          </div>
          <div className="grow">
            <span className="wb-lbl">单文件上限 MB</span>
            <input className="wb-inp" type="number" min={1} max={200} value={settings.maxFileMB}
              onChange={(e) => patch('maxFileMB', parseInt(e.target.value, 10) || 20)} />
          </div>
        </div>
        <span className="wb-lbl">额外排除的目录名（逗号分隔，作用任意层级）</span>
        <input className="wb-inp" value={settings.extraExcludes.join(', ')}
          placeholder="如：隐私, 归档不用"
          onChange={(e) => patch('extraExcludes', e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean))} />
        <div className="wb-row" style={{ marginTop: 8 }}>
          <label className="wb-sub" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.includeHidden} onChange={(e) => patch('includeHidden', e.target.checked)} /> 收录隐藏目录（. 开头）
          </label>
          <label className="wb-sub" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.enabled} onChange={(e) => patch('enabled', e.target.checked)} /> 启用自动扫描
          </label>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button className="wb-btn" disabled={busy} onClick={() => settings && persist(settings)}>保存参数</button>
          <span className="wb-sub" style={{ alignSelf: 'center' }}>默认排除：node_modules / .git / target / dist / build / AppData 等构建与系统目录</span>
        </div>
      </div></div>

      {msg && <div className="wb-ok">{msg}</div>}
      {err && <div className="wb-alert bad">{err}</div>}

      <div className="wb-alert warn">
        <b>隐私口径</b>：索引与正文只存本机数据根（weibian-index/），全程零外网请求（本插件未申请 network 权限）；
        服务只读你的文件、永不修改或删除；「读取原文」只允许索引目录内的路径。
        手机端检索走局域网直连（token 鉴权），不用公网。
      </div>
    </div>
  )
}
