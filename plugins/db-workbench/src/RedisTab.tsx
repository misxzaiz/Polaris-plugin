/**
 * RedisTab.tsx —— Redis 键浏览（SCAN 分页/TTL/类型/值预览）+ 白名单命令行
 */
import { useEffect, useState } from 'react'
import { SvcClient, type Profile } from './model'
import type { Toast } from './Panel'

interface KeyRow {
  key: string
  type: string
  ttl: number | null
  value: string | null
}

const TYPE_COLORS: Record<string, string> = {
  string: '#3FB950', hash: '#A371F7', list: '#58A6FF', set: '#D29922', zset: '#F0883E', stream: '#F85149', none: '#5C6678',
}

async function redisCall(svc: SvcClient, profileId: string, command: string, args: string[]): Promise<any> {
  const r = await svc.redis(profileId, command, args)
  if (!r.ok) throw new Error(r.error || '命令失败')
  return r.reply
}

/** 根据类型把值读成可展示字符串（只读命令） */
async function readValue(svc: SvcClient, profileId: string, key: string, type: string): Promise<string | null> {
  try {
    switch (type) {
      case 'string': {
        const v = await redisCall(svc, profileId, 'GET', [key])
        return v == null ? null : String(v)
      }
      case 'hash': {
        const v = await redisCall(svc, profileId, 'HGETALL', [key])
        if (Array.isArray(v)) {
          const pairs: string[] = []
          for (let i = 0; i < v.length; i += 2) pairs.push(`${v[i]} = ${v[i + 1]}`)
          return pairs.join('\n')
        }
        return JSON.stringify(v)
      }
      case 'list': return JSON.stringify(await redisCall(svc, profileId, 'LRANGE', [key, '0', '49']), null, 1)
      case 'set': {
        const v = await redisCall(svc, profileId, 'SMEMBERS', [key])
        return Array.isArray(v) ? v.slice(0, 50).join('\n') : JSON.stringify(v)
      }
      case 'zset': return JSON.stringify(await redisCall(svc, profileId, 'ZRANGE', [key, '0', '49', 'WITHSCORES']), null, 1)
      case 'stream': return JSON.stringify(await redisCall(svc, profileId, 'XRANGE', [key, '-', '+', 'COUNT', '10']), null, 1)
      default: return null
    }
  } catch (_) {
    return null
  }
}

export default function RedisTab({ svc, profiles, selectedId, setSelectedId, showToast, pickProfile }: {
  svc: SvcClient
  profiles: Profile[]
  selectedId: string
  setSelectedId: (id: string) => void
  showToast: Toast
  pickProfile: () => Promise<Profile | null>
}) {
  const redisTypes = profiles.filter((p) => p.type === 'redis')
  const [profileId, setProfileId] = useState(selectedId || (redisTypes[0] && redisTypes[0].id) || '')
  const [pattern, setPattern] = useState('*')
  const [cursor, setCursor] = useState('0')
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [scanning, setScanning] = useState(false)
  const [cmd, setCmd] = useState('INFO')
  const [cmdArgs, setCmdArgs] = useState('')
  const [cmdOut, setCmdOut] = useState('')
  const [dbsize, setDbsize] = useState<number | null>(null)

  useEffect(() => {
    if (selectedId) {
      const p = profiles.find((x) => x.id === selectedId)
      if (p && p.type === 'redis' && p.id !== profileId) setProfileId(p.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const profile = redisTypes.find((p) => p.id === profileId) || null

  const scan = async (startCursor: string) => {
    if (!profile) { showToast('先创建 Redis 连接', true); return }
    setScanning(true)
    try {
      const args = ['0'.repeat(0) + startCursor, 'MATCH', pattern, 'COUNT', '200']
      const reply = await redisCall(svc, profile.id, 'SCAN', args)
      const nextCursor = Array.isArray(reply) ? String(reply[0]) : '0'
      const names = Array.isArray(reply) && Array.isArray(reply[1]) ? reply[1].map(String) : []
      const rows: KeyRow[] = []
      for (const k of names.slice(0, 60)) {
        let type = 'none'
        try { type = String(await redisCall(svc, profile.id, 'TYPE', [k]) || 'none') } catch (_) { /* 单键失败不断链 */ }
        let ttl: number | null = null
        try { ttl = Number(await redisCall(svc, profile.id, 'TTL', [k])) } catch (_) { /* 同上 */ }
        rows.push({ key: k, type, ttl, value: null })
      }
      setCursor(nextCursor)
      setKeys(nextCursor === '0' ? rows : keys.concat(rows))
      if (nextCursor === '0' && rows.length === 0) showToast('无匹配键')
    } catch (e: any) {
      showToast(e.message || 'SCAN 失败', true)
    } finally {
      setScanning(false)
    }
  }

  const expand = async (row: KeyRow) => {
    if (!profile || row.value != null) return
    const v = await readValue(svc, profile.id, row.key, row.type)
    setKeys((ks) => ks.map((k) => (k.key === row.key ? { ...k, value: v } : k)))
  }

  const refreshSize = async () => {
    if (!profile) return
    try {
      const n = Number(await redisCall(svc, profile.id, 'DBSIZE', []))
      setDbsize(Number.isFinite(n) ? n : null)
    } catch (_) { setDbsize(null) }
  }

  useEffect(() => { if (profile) void refreshSize() }, [profileId]) // eslint-disable-line react-hooks/exhaustive-deps

  const runCmd = async () => {
    if (!profile) return
    const args = cmdArgs.trim() ? cmdArgs.trim().split(/\s+/) : []
    try {
      const reply = await redisCall(svc, profile.id, cmd.trim(), args)
      let text: string
      if (typeof reply === 'string') text = reply
      else if (reply == null) text = '(nil)'
      else if (typeof reply === 'object') {
        text = JSON.stringify(reply, null, 2)
        // INFO 原文是带 # 分节的长文本，原样展示
        if (typeof (reply as any) === 'object' && Object.keys(reply as any).length === 0) text = '(空)'
      } else text = String(reply)
      setCmdOut(text.length > 8000 ? text.slice(0, 8000) + '…[截断]' : text)
      void refreshSize()
    } catch (e: any) {
      setCmdOut(`✗ ${e.message}`)
    }
  }

  if (!redisTypes.length) {
    return <div className="dbw-empty">还没有 Redis 连接。<br />先在「连接」里创建（类型选 Redis）。</div>
  }

  return (
    <div>
      <div className="dbw-sec">
        <div className="dbw-bar" />
        Redis 浏览
        {dbsize != null && <span className="dbw-hint">DBSIZE {dbsize}</span>}
      </div>

      <div className="dbw-card">
        <div className="dbw-card-b">
          <div className="dbw-row">
            <select className="dbw-sel" value={profileId} onChange={(e) => { setProfileId(e.target.value); setSelectedId(e.target.value); setKeys([]); setCursor('0') }} style={{ minWidth: 130 }}>
              {redisTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input className="dbw-inp" style={{ maxWidth: 190 }} value={pattern} placeholder="匹配模式 cache:*"
              onChange={(e) => setPattern(e.target.value)} />
            <button className="dbw-btn sm" disabled={scanning} onClick={() => { setKeys([]); setCursor('0'); void scan('0') }}>
              {scanning ? '扫描中…' : 'SCAN'}
            </button>
            {cursor !== '0' && (
              <button className="dbw-btn ghost sm" disabled={scanning} onClick={() => void scan(cursor)}>
                更多（游标 {cursor.slice(0, 8)}…）
              </button>
            )}
          </div>
          <div className="dbw-sub" style={{ marginTop: 5 }}>SCAN 强制带 COUNT 防大库阻塞；展开键读取 TTL 与值（只读命令）。</div>
        </div>
      </div>

      {keys.length > 0 && (
        <div className="dbw-card">
          <div className="dbw-tree" style={{ padding: '6px 4px', maxHeight: 300, overflowY: 'auto' }}>
            {keys.map((k) => (
              <div key={k.key} className="dbw-tree-i" onClick={() => void expand(k)} title="点击读取值">
                <span className="dbw-tag" style={{ color: TYPE_COLORS[k.type] || '#8B95A7', minWidth: 42, textAlign: 'center' }}>{k.type}</span>
                <span style={{ fontFamily: 'Consolas,Menlo,monospace', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{k.key}</span>
                {k.ttl != null && k.ttl >= 0 && <span className={`dbw-tag ${k.ttl === -1 ? 'g' : k.ttl < 60 ? 'r' : 'y'}`}>{k.ttl === -1 ? '永不过期' : `${k.ttl}s`}</span>}
              </div>
            ))}
          </div>
          {keys.some((k) => k.value != null) && (
            <div style={{ padding: '8px 13px', borderTop: '1px solid #1d2330' }}>
              {keys.filter((k) => k.value != null).slice(-1).map((k) => (
                <div key={k.key}>
                  <div className="dbw-sub" style={{ marginBottom: 3 }}>{k.key} 的值：</div>
                  <pre style={{ margin: 0, background: '#0D1117', border: '1px solid #2a2f3a', borderRadius: 8, padding: 8, fontSize: 11, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{k.value}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="dbw-sec"><div className="dbw-bar" />命令</div>
      <div className="dbw-card">
        <div className="dbw-card-b">
          <div className="dbw-row">
            <input className="dbw-inp" style={{ maxWidth: 130, fontFamily: 'Consolas,monospace' }} value={cmd}
              placeholder="GET" onChange={(e) => setCmd(e.target.value.toUpperCase())} />
            <input className="dbw-inp" style={{ flex: 1, fontFamily: 'Consolas,monospace' }} value={cmdArgs}
              placeholder="参数（空格分隔），如 mykey 或 0 MATCH a:* COUNT 100"
              onChange={(e) => setCmdArgs(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void runCmd() }} />
            <button className="dbw-btn" onClick={() => void runCmd()}>执行</button>
          </div>
          <div className="dbw-sub" style={{ marginTop: 5 }}>
            只读命令直接放行；写命令需要连接开启 allowWrite；FLUSHALL/CONFIG 等服务器级命令永久拒绝。
          </div>
          {cmdOut && (
            <pre style={{ margin: '8px 0 0', background: '#0D1117', border: '1px solid #2a2f3a', borderRadius: 8, padding: 9, fontSize: 11, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: cmdOut.startsWith('✗') ? '#F85149' : '#c9d1d9' }}>{cmdOut}</pre>
          )}
        </div>
      </div>
    </div>
  )
}
