/**
 * 快传 Tab：扫码入口（QR 本地渲染）+ 手动上传/下载 + 投递区清单
 *
 * 上传/下载/删除走 127.0.0.1 直连自家服务（localhost 免混合内容、CORS 由服务放行）；
 * 失败时诚实给替代路径（AI drop_send / 手机直接访问）。清单与状态来自 cap.kv 投影。
 */
import { useMemo, useRef, useState } from 'react'
import qrcode from '../shared/qr.js'
import {
  copyText, deleteItem, downloadItem, fmtBytes, icoFor, serviceBase,
  serviceStart, ttlLabel, uploadFile,
  type DropItem, type DropSettings,
} from './model'
import type { Toast } from './Panel'

export interface PanelData {
  meta: import('./model').DropMeta | null
  items: DropItem[]
  settings: DropSettings | null
  loaded: boolean
}

/** 文本 → QR 模块矩阵路径（vendored qrcode-generator，M 级纠错，自动版本） */
function qrPath(text: string): { count: number; path: string } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`
    }
  }
  return { count: n, path: d }
}

const FROM_BADGE: Record<string, { label: string; color: string }> = {
  phone: { label: '手机', color: '#93c5fd' },
  desktop: { label: '面板', color: '#6ee7a0' },
  ai: { label: 'AI', color: '#fbbf24' },
}

export default function DropTab({ data, reload, showToast, running }: {
  data: PanelData
  reload: () => Promise<PanelData>
  showToast: Toast
  running: boolean
}) {
  const [busy, setBusy] = useState('')
  const [prog, setProg] = useState<{ name: string; pct: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const meta = data.meta
  const settings = data.settings
  const pin = settings?.pin || ''
  const lanUrl = meta?.lanUrl || ''
  const joinUrl = lanUrl && pin ? `${lanUrl}/?pin=${pin}` : ''

  const qr = useMemo(() => {
    if (!joinUrl || joinUrl.length > 512) return null
    try { return qrPath(joinUrl) } catch (_) { return null }
  }, [joinUrl])

  const doUpload = async (files: FileList | null) => {
    if (!files || !files.length || busy) return
    setBusy('upload')
    const base = serviceBase(meta)
    try {
      for (const file of Array.from(files)) {
        setProg({ name: file.name, pct: 0 })
        try {
          await uploadFile(base, pin, file, (pct) => setProg({ name: file.name, pct }))
          showToast(`已投递 ${file.name}`, 'good')
        } catch (e) {
          showToast(`「${file.name}」上传失败：${(e as Error).message}。替代路径：对 AI 说「把 ${file.name} 传到我手机」（drop_send）`, 'bad')
          break // 网络路径不可用，后续大概率同样失败
        }
      }
      setProg(null)
      await reload()
    } finally {
      setBusy('')
    }
  }

  const doDownload = async (it: DropItem) => {
    if (busy) return
    setBusy(`dl-${it.id}`)
    try {
      await downloadItem(serviceBase(meta), pin, it)
      showToast(`已下载 ${it.name}`, 'good')
    } catch (e) {
      const link = lanUrl ? `${lanUrl}/f/${it.id}?pin=${pin}&dl=1` : ''
      showToast(`下载失败：${(e as Error).message}${link ? '。可在手机浏览器打开同一局域网地址下载' : ''}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const doDelete = async (it: DropItem) => {
    if (busy) return
    if (!window.confirm(`删除「${it.name}」？（手机端也将不可见）`)) return
    setBusy(`del-${it.id}`)
    try {
      await deleteItem(serviceBase(meta), pin, it.id)
      showToast('已删除', 'good')
      await reload()
    } catch (e) {
      showToast(`删除失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const doStart = async () => {
    if (busy) return
    setBusy('start')
    try {
      await serviceStart()
      showToast('启动指令已下发，等几秒…', 'good')
      setTimeout(() => { void reload() }, 2500)
    } catch (e) {
      showToast(`启动失败：${(e as Error).message}`, 'bad')
    } finally {
      setBusy('')
    }
  }

  const doCopy = async (text: string, what: string) => {
    const ok = await copyText(text)
    showToast(ok ? `已复制${what}` : '复制失败（浏览器限制），请手动选择文本复制', ok ? 'good' : 'bad')
  }

  if (!data.loaded) return <div style={{ color: '#71717a', fontSize: 12 }}>载入中…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!running && (
        <div style={{ background: 'rgba(248,81,73,.08)', border: '1px solid rgba(248,81,73,.35)', borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 1.6 }}>
          <b style={{ color: '#f85149' }}>服务未运行</b>——手机扫码与文件收发都不可用。
          {meta?.lastTickAt ? '心跳已过期（服务可能被停止或崩溃）。' : '尚未收到服务心跳。'}
          <button
            onClick={doStart}
            disabled={busy === 'start'}
            style={{ marginLeft: 8, padding: '4px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #3f3f46', background: '#27272a', color: '#e4e4e7', cursor: 'pointer' }}
          >{busy === 'start' ? '启动中…' : '启动服务'}</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: 12, alignItems: 'flex-start' }}>
        {qr ? (
          <svg
            width={112} height={112} viewBox={`0 0 ${qr.count + 8} ${qr.count + 8}`}
            shapeRendering="crispEdges" style={{ background: '#fff', borderRadius: 8, flex: 'none' }}
          >
            <path d={qr.path} fill="#111" />
          </svg>
        ) : (
          <div style={{ width: 112, height: 112, borderRadius: 8, background: '#27272a', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#71717a', textAlign: 'center', padding: 8 }}>
            {running ? '等待 PIN 与局域网地址…' : '服务离线'}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ color: '#f4f4f5', fontWeight: 600 }}>手机扫码即用</div>
          <div style={{ color: '#a1a1aa', wordBreak: 'break-all' }}>
            {joinUrl || '等待服务心跳…'}
          </div>
          <div style={{ color: '#71717a', fontSize: 11 }}>
            同一 Wi-Fi 下手机浏览器打开即可传文件（无需装 App）；PIN 是访问门禁。
          </div>
          {joinUrl && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <button onClick={() => doCopy(joinUrl, '访问链接')} style={btnGhost()}>复制链接</button>
              {meta?.lanUrls && meta.lanUrls.length > 1 && (
                <button onClick={() => doCopy(meta.lanUrls!.join('\n'), '全部地址')} style={btnGhost()}>备用地址</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => { void doUpload(e.target.files); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy || !running} style={btnPrimary()}>
          {busy === 'upload' ? '上传中…' : '📤 上传文件到手机'}
        </button>
        {prog && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prog.name} {prog.pct}%</div>
            <div style={{ height: 5, background: '#27272a', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${prog.pct}%`, background: '#3b82f6', transition: 'width .15s' }} />
            </div>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 6 }}>
          投递区（{data.items.length}{meta ? ` · 占用 ${fmtBytes(meta.storeBytes)}` : ''}）——手机与面板看到的是同一份
        </div>
        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, padding: 4 }}>
          {data.items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#71717a', lineHeight: 1.8 }}>
              投递区是空的。<br />
              手机扫码上传 · 面板点上方按钮投递 · 或对 AI 说「把 xx 文件传到我手机」
            </div>
          ) : data.items.slice().sort((a, b) => b.at - a.at).map((it) => {
            const badge = FROM_BADGE[it.from] || { label: it.from, color: '#a1a1aa' }
            return (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px', borderBottom: '1px solid #1f1f23' }}>
                <span style={{ fontSize: 18, flex: 'none' }}>{icoFor(it.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.name}
                    <span style={{ fontSize: 10, color: badge.color, marginLeft: 6 }}>· {badge.label}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#71717a' }}>
                    {fmtBytes(it.size)} · {ttlLabel(it.expiresAt) ? `剩 ${ttlLabel(it.expiresAt)}` : '即将清理'}{it.note ? ` · ${it.note}` : ''}
                  </div>
                </div>
                <button onClick={() => doDownload(it)} disabled={!!busy} style={btnGhost()}>下载</button>
                <button onClick={() => doDelete(it)} disabled={!!busy} style={{ ...btnGhost(), color: '#f87171' }}>删</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function btnPrimary(): React.CSSProperties {
  return {
    padding: '8px 14px', fontSize: 12, borderRadius: 8, border: 'none',
    background: '#3b82f6', color: '#fff', cursor: 'pointer', minHeight: 36,
  }
}
function btnGhost(): React.CSSProperties {
  return {
    padding: '5px 10px', fontSize: 11, borderRadius: 7, border: '1px solid #3f3f46',
    background: '#27272a', color: '#d4d4d8', cursor: 'pointer',
  }
}
