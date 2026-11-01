/**
 * 桶与地址 Tab：桶的增删改 + 捕获地址展示 + 转发配置
 *
 * 桶 = 一条专属捕获路径 /hook/<secret>。地址同时给 127.0.0.1 与局域网 IP
 * （手机/IoT 直连），隧道（ngrok/natapp 等）把流量指到 127.0.0.1:<port> 即可。
 */
import { useState } from 'react'
import { validateForwardUrl } from '../../shared/core.js'
import {
  copyText, fmtTime, newSecretBrowser, saveSettings,
  type Bucket, type Settings,
} from '../model'
import type { PanelData, Toast } from '../Panel'

interface Props {
  data: PanelData
  running: boolean
  reload: () => Promise<PanelData>
  showToast: Toast
}

export default function BucketsTab({ data, running, reload, showToast }: Props) {
  const [editing, setEditing] = useState<string | null>(null) // 正在编辑的桶 id
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const settings: Settings | null = data.settings
  const port = data.meta?.port || 9869
  const lanIp = data.meta?.lanIp || ''

  if (!settings) {
    return <div style={{ color: '#71717a', fontSize: 12 }}>读取桶配置中…（服务首次上线会自动建默认桶）</div>
  }

  const persist = async (next: Settings, okMsg: string) => {
    setBusy(true)
    try {
      await saveSettings(next)
      showToast(okMsg, 'good')
      setEditing(null)
      setCreating(false)
      await reload()
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const updateBucket = (id: string, patch: Partial<Bucket>) => {
    if (!settings) return
    // forwardUrl 先验证再保存（服务端对非法 URL 是宽容纠正，这里提前拦住给明确报错）
    if (patch.forwardUrl !== undefined && patch.forwardUrl !== '') {
      const v = validateForwardUrl(patch.forwardUrl)
      if (!v.ok) { showToast(`转发地址未保存：${v.error}`, 'bad'); return }
    }
    const next: Settings = {
      ...settings,
      buckets: settings.buckets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }
    void persist(next, '桶配置已保存（约 5s 内生效）')
  }

  const createBucket = (id: string, name: string) => {
    const sid = id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
    if (!sid) { showToast('桶 ID 只能是小写字母/数字/连字符', 'bad'); return }
    if (settings.buckets.some((b) => b.id === sid)) { showToast(`桶 ID ${sid} 已存在`, 'bad'); return }
    if (settings.buckets.length >= 20) { showToast('桶数量已达上限（20）', 'bad'); return }
    const nb: Bucket = {
      id: sid, name: name.trim() || sid, secret: newSecretBrowser(),
      createdAt: Date.now(), responseMode: 'fixed', fixedStatus: 200, fixedBody: '', forwardUrl: '',
    }
    void persist({ ...settings, buckets: [...settings.buckets, nb] }, `桶 ${sid} 已创建`)
  }

  const deleteBucket = (id: string) => {
    if (!window.confirm(`删除桶 ${id} 不会删除其捕获留痕，但捕获地址立即失效且不可恢复。确认删除？`)) return
    void persist({ ...settings, buckets: settings.buckets.filter((b) => b.id !== id) }, `桶 ${id} 已删除`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#71717a', lineHeight: 1.7 }}>
        把捕获地址配到第三方回调 URL，或把内网穿透隧道（ngrok / natapp / cpolar…）指向
        <code style={{ color: '#93c5fd' }}> http://127.0.0.1:{port}</code>——隧道换域名时捕获器不动，只改隧道。
        <b style={{ color: '#d29922' }}> 数据只落本机。</b>
      </div>

      {settings.buckets.map((b) => (
        <div key={b.id} style={{ border: '1px solid #27272a', borderRadius: 8, padding: 10, background: '#131316' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ color: '#f4f4f5', fontSize: 13 }}>{b.name}</b>
            <span style={{ fontSize: 10, color: '#71717a' }}>[{b.id}]</span>
            <span style={{
              fontSize: 10, padding: '1px 8px', borderRadius: 8,
              background: b.responseMode === 'forward' ? 'rgba(88,166,255,.15)' : 'rgba(63,185,80,.12)',
              color: b.responseMode === 'forward' ? '#58a6ff' : '#3fb950',
            }}>{b.responseMode === 'forward' ? `转发 → ${b.forwardUrl || '（未配置！）'}` : `固定应答 ${b.fixedStatus}`}</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => setEditing(editing === b.id ? null : b.id)} style={btnGhost}>{editing === b.id ? '收起' : '编辑'}</button>
            <button onClick={() => { if (window.confirm(`确定删除桶「${b.name}」？`)) deleteBucket(b.id) }} style={btnDanger}>删除</button>
          </div>

          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <AddrRow label="本机" url={`http://127.0.0.1:${port}/hook/${b.secret}`} showToast={showToast} />
            {lanIp && <AddrRow label="局域网" url={`http://${lanIp}:${port}/hook/${b.secret}`} showToast={showToast} />}
            <div style={{ fontSize: 10, color: '#52525b' }}>secret 创建于 {fmtTime(b.createdAt)}，泄漏时可在编辑里重置</div>
          </div>

          {editing === b.id && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #27272a', paddingTop: 10 }}>
              <label style={labelStyle}>
                名称
                <input
                  defaultValue={b.name}
                  onBlur={(e) => { if (e.target.value.trim() && e.target.value !== b.name) updateBucket(b.id, { name: e.target.value.trim().slice(0, 30) }) }}
                  style={inputStyle}
                />
              </label>
              <div style={labelStyle}>
                应答模式
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    onClick={() => updateBucket(b.id, { responseMode: 'fixed' })}
                    style={modeBtn(b.responseMode === 'fixed')}
                  >固定应答（只捕获不转发）</button>
                  <button
                    onClick={() => updateBucket(b.id, { responseMode: 'forward' })}
                    style={modeBtn(b.responseMode === 'forward')}
                  >转发（捕获 + 转给本地应用）</button>
                </div>
              </div>
              {b.responseMode === 'forward' ? (
                <label style={labelStyle}>
                  转发地址（可指向本机应用，如 http://127.0.0.1:3000/api/pay/notify）
                  <input
                    defaultValue={b.forwardUrl}
                    placeholder="http://127.0.0.1:3000/api/pay/notify"
                    onBlur={(e) => { if (e.target.value !== b.forwardUrl) updateBucket(b.id, { forwardUrl: e.target.value.trim() }) }}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: 10, color: '#71717a' }}>转发失败时调用方收到 502（支付平台会自动重试，正好用来观察重试链路）</span>
                </label>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ ...labelStyle, width: 120 }}>
                    应答状态码
                    <input
                      defaultValue={String(b.fixedStatus)}
                      onBlur={(e) => {
                        const n = parseInt(e.target.value, 10)
                        if (Number.isInteger(n) && n >= 200 && n <= 599 && n !== b.fixedStatus) updateBucket(b.id, { fixedStatus: n })
                      }}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ ...labelStyle, flex: 1 }}>
                    应答体（空 = {"{"}"received":true{"}" }; 支付宝回调想答 success 就填 success）
                    <input
                      defaultValue={b.fixedBody}
                      onBlur={(e) => { if (e.target.value !== b.fixedBody) updateBucket(b.id, { fixedBody: e.target.value.slice(0, 4096) }) }}
                      style={inputStyle}
                    />
                  </label>
                </div>
              )}
              <div>
                <button
                  onClick={() => {
                    if (!window.confirm('重置 secret 后旧捕获地址立即失效（第三方/隧道需改用新地址）。确认？')) return
                    updateBucket(b.id, { secret: newSecretBrowser() })
                  }}
                  style={btnGhost}
                >重置 secret</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {creating ? (
        <CreateForm busy={busy} onCancel={() => setCreating(false)} onCreate={createBucket} />
      ) : (
        <button onClick={() => setCreating(true)} style={btnPrimary} disabled={!running}>＋ 新建捕获桶</button>
      )}
    </div>
  )
}

function CreateForm({ busy, onCancel, onCreate }: { busy: boolean; onCancel: () => void; onCreate: (id: string, name: string) => void }) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  return (
    <div style={{ border: '1px solid #3b82f6', borderRadius: 8, padding: 10, background: 'rgba(59,130,246,.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ ...labelStyle, flex: 1, minWidth: 140 }}>
          桶 ID（小写字母/数字/连字符，如 pay）
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="pay" style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, flex: 1, minWidth: 140 }}>
          显示名
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="支付回调" style={inputStyle} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onCreate(id, name)} disabled={busy} style={btnPrimary}>创建</button>
        <button onClick={onCancel} style={btnGhost}>取消</button>
      </div>
    </div>
  )
}

function AddrRow({ label, url, showToast }: { label: string; url: string; showToast: Toast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
      <span style={{ color: '#52525b', width: 44 }}>{label}</span>
      <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e4e4e7', background: '#09090b', padding: '4px 8px', borderRadius: 6, border: '1px solid #27272a' }}>{url}</code>
      <button onClick={() => { void copyText(url).then((ok) => showToast(ok ? '已复制捕获地址' : '复制失败', ok ? 'good' : 'bad')) }} style={btnGhost}>复制</button>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: '#a1a1aa', display: 'flex', flexDirection: 'column', gap: 4 }
const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #3f3f46',
  background: '#18181b', color: '#d4d4d8', minHeight: 28,
}
const modeBtn = (active: boolean): React.CSSProperties => ({
  fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 28, flex: 1,
  border: `1px solid ${active ? '#3b82f6' : '#3f3f46'}`,
  background: active ? 'rgba(59,130,246,.15)' : 'transparent',
  color: active ? '#93c5fd' : '#a1a1aa',
})
const btnPrimary: React.CSSProperties = {
  fontSize: 12, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', minHeight: 32,
  border: '1px solid #3b82f6', background: 'rgba(59,130,246,.18)', color: '#93c5fd',
}
const btnGhost: React.CSSProperties = {
  fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 26,
  border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa',
}
const btnDanger: React.CSSProperties = {
  fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', minHeight: 26,
  border: '1px solid rgba(248,81,73,.5)', background: 'rgba(248,81,73,.08)', color: '#f85149',
}
