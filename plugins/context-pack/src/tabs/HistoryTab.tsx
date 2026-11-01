/**
 * HistoryTab —— 包历史：cpk.idx 投影（服务维护最近 10 条，含 MCP 发起的包）
 */
import { useCallback, useEffect, useState } from 'react'
import { getIdx, sendCommand, fmtBytes, fmtTime, type IdxEntry } from '../model'

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

export default function HistoryTab({ showToast, onGoTab }: { showToast: Toast; onGoTab: (t: string) => void }) {
  const [packs, setPacks] = useState<IdxEntry[] | null>(null)

  const reload = useCallback(async () => {
    const idx = await getIdx()
    setPacks(idx ? idx.packs : [])
  }, [])

  useEffect(() => {
    void reload()
    const t = setInterval(() => { void reload() }, 5000)
    return () => clearInterval(t)
  }, [reload])

  const onCleanup = async () => {
    const r = await sendCommand<{ removed?: { scans: number; packs: number; files: number } }>('cleanup', {}, 20000)
    if (r.ok) {
      showToast(`已清理：扫描 ${r.removed?.scans ?? 0} · 包 ${r.removed?.packs ?? 0} · 文件 ${r.removed?.files ?? 0}`, 'good')
      void reload()
    } else {
      showToast(r.error || '清理失败', 'bad')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#a1a1aa' }}>最近打包（含 AI 经 MCP 发起的；最多保留 10 条）</span>
        <button onClick={() => void onCleanup()} style={{
          marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #3f3f46',
          background: '#27272a', color: '#d4d4d8', fontSize: 11, cursor: 'pointer',
        }}>清理旧包</button>
      </div>
      {packs === null && <div style={{ fontSize: 12, color: '#71717a' }}>读取中…</div>}
      {packs && packs.length === 0 && (
        <div style={{ fontSize: 12, color: '#71717a', lineHeight: 1.8 }}>
          还没有打包记录。去 <span onClick={() => onGoTab('pack')} style={{ color: '#93c5fd', cursor: 'pointer' }}>打包</span> 页生成第一个上下文包。
        </div>
      )}
      {packs && packs.map((p) => (
        <div key={p.id} style={{
          padding: 10, borderRadius: 8, border: '1px solid #27272a', background: '#131316',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, padding: '1px 8px', borderRadius: 8,
              background: p.state === 'done' ? 'rgba(63,185,80,.15)' : p.state === 'error' ? 'rgba(248,81,73,.15)' : 'rgba(59,130,246,.15)',
              color: p.state === 'done' ? '#3fb950' : p.state === 'error' ? '#f85149' : '#93c5fd',
            }}>{p.state === 'done' ? '完成' : p.state === 'error' ? '失败' : '进行中'}</span>
            <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 8, background: 'rgba(59,130,246,.12)', color: '#93c5fd' }}>
              {p.origin === 'mcp' ? 'AI 发起' : '面板'}
            </span>
            <span style={{ fontSize: 11, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 120 }} title={p.path}>
              {p.path}
            </span>
            <span style={{ fontSize: 10, color: '#71717a' }}>{fmtTime(p.finishedAt || p.startedAt)}</span>
          </div>
          {p.state === 'done' && (
            <div style={{ fontSize: 10, color: '#71717a', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{p.files} 文件 · ~{p.tokens} tokens · {fmtBytes(p.fileBytes)}</span>
              <span style={{ wordBreak: 'break-all' }}>{p.file}</span>
            </div>
          )}
          {p.state === 'error' && <div style={{ fontSize: 10, color: '#f85149' }}>{(p as unknown as { error?: string }).error || '失败'}</div>}
        </div>
      ))}
    </div>
  )
}
