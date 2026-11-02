/**
 * 邮件调试台面板:收件箱列表 + 详情抽屉 + 设置;数据面全经宿主 cap.http 转发。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Detail from './Detail'
import SettingsTab from './Settings'
import {
  api, invalidateSvc, readSvc, type DeskMeta, type MailDetailData, type MailSummary, type SelftestReport,
} from './model'
import { restartService, autostartServices } from './host'
import { SERVICE_ID, PLUGIN_ID } from './model'

export type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

const POLL_MS = 3000

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}
function fmtTime(s: MailSummary): string {
  const iso = s.date || new Date(s.receivedAt).toISOString()
  return iso.replace('T', ' ').slice(0, 19)
}

export default function Panel() {
  const [tab, setTab] = useState<'inbox' | 'settings'>('inbox')
  const [meta, setMeta] = useState<DeskMeta | null>(null)
  const [selftest, setSelftest] = useState<SelftestReport | null>(null)
  const [mails, setMails] = useState<MailSummary[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<MailDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const queryRef = useRef('')
  queryRef.current = query

  const showToast: Toast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const reload = useCallback(async () => {
    try {
      const [m, st, list] = await Promise.all([
        api.meta().catch(() => null),
        api.selftestLast().then((r) => r.last).catch(() => null),
        api.list(queryRef.current).catch(() => ({ items: [], total: 0 })),
      ])
      setMeta(m)
      setSelftest(st)
      setMails(list.items)
      setTotal(list.total)
      setLoaded(true)
    } catch (_) {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reload()
    const timer = setInterval(() => { void reload() }, POLL_MS)
    return () => clearInterval(timer)
  }, [reload])

  // 搜索防抖(300ms)
  useEffect(() => {
    const t = window.setTimeout(() => { void reload() }, 300)
    return () => window.clearTimeout(t)
  }, [query, reload])

  // 选中详情加载
  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(''); return }
    let alive = true
    setDetailLoading(true)
    setDetailError('')
    api.detail(selectedId)
      .then((d) => { if (alive) setDetail(d) })
      .catch((e) => { if (alive) { setDetail(null); setDetailError((e as Error).message) } })
      .finally(() => { if (alive) setDetailLoading(false) })
    return () => { alive = false }
  }, [selectedId])

  const running = !!(meta && meta.smtpListening)
  const selected = mails.find((m) => m.id === selectedId) || null

  async function restart() {
    try {
      invalidateSvc()
      await restartService(PLUGIN_ID, SERVICE_ID)
      showToast('已请求重启服务', 'good')
    } catch (e) {
      if (!String((e as Error).message).includes('not registered')) {
        showToast(`重启失败:${(e as Error).message}`, 'bad')
        return
      }
      try {
        await autostartServices()
        showToast('热安装场景已触发重扫(autostart)', 'info')
      } catch (e2) {
        showToast(`自救失败:${(e2 as Error).message}`, 'bad')
      }
    }
  }

  const btn: React.CSSProperties = {
    fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #3f3f46',
    background: 'transparent', color: '#a1a1aa', cursor: 'pointer',
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', gap: 10, color: '#d4d4d8' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f4f4f5' }}>✉ 邮件调试台</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 8,
          background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
          color: running ? '#3fb950' : '#f85149',
        }}>{running ? `SMTP 127.0.0.1:${meta?.smtpPort}` : 'SMTP 未监听'}</span>
        {meta && (
          <span style={{ fontSize: 10, color: '#52525b' }}>
            收件箱 {meta.count} 封 / {fmtBytes(meta.totalBytes)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {(['inbox', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: 'none',
              background: tab === t ? 'rgba(88,101,242,.2)' : 'transparent',
              color: tab === t ? '#a5b4fc' : '#71717a',
            }}
          >{t === 'inbox' ? '收件箱' : '设置'}</button>
        ))}
        <button style={btn} onClick={() => { void readSvc(true); void reload() }}>刷新</button>
        <button style={btn} onClick={() => { void restart() }}>重启服务</button>
      </div>

      {loaded && !meta && (
        <div style={{ padding: 12, border: '1px solid rgba(248,81,73,.3)', borderRadius: 8, background: 'rgba(248,81,73,.06)', fontSize: 12, color: '#f87171' }}>
          服务未就绪(读不到 mdk.service)。服务可能在启动中;若刚安装插件,可点「重启服务」或到 设置→插件 查看服务状态。
        </div>
      )}

      {tab === 'inbox' ? (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
          {/* 列表 */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 300, borderRight: '1px solid #27272a' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 0 8px 0' }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜主题 / 发件人 / 收件人 / 正文…"
                style={{
                  flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 6,
                  border: '1px solid #3f3f46', background: '#18181b', color: '#e4e4e7',
                }}
              />
              <span style={{ fontSize: 10, color: '#52525b', whiteSpace: 'nowrap' }}>{total} 封</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mails.length === 0 && (
                <div style={{ padding: 20, color: '#52525b', fontSize: 12, lineHeight: 1.9 }}>
                  {query ? '没有匹配的邮件。' : (
                    <>
                      收件箱为空。开始使用:<br />
                      1. 把应用的 SMTP host/port 指到 <code style={{ color: '#a1a1aa' }}>127.0.0.1:{meta?.smtpPort ?? 1025}</code>(配置片段在「设置」页)<br />
                      2. 应用发测试邮件 → 本面板实时可见<br />
                      3. 或在对话里让 AI 调 mail_list / mail_get 读邮件、提验证码
                    </>
                  )}
                </div>
              )}
              {mails.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    border: selectedId === m.id ? '1px solid rgba(88,101,242,.5)' : '1px solid transparent',
                    background: selectedId === m.id ? 'rgba(88,101,242,.12)' : '#161618',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e4e4e7', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.subject}
                    </span>
                    {m.attachments.length > 0 && <span title={`${m.attachments.length} 个附件`}>📎</span>}
                    <span style={{ fontSize: 10, color: '#52525b', whiteSpace: 'nowrap' }}>{fmtTime(m)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10, color: '#71717a', overflow: 'hidden' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.fromText || '(未知)'}</span>
                    <span style={{ color: '#3f3f46' }}>→</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.toText || '(未指定)'}</span>
                    <span style={{ marginLeft: 'auto', color: '#52525b', whiteSpace: 'nowrap' }}>{fmtBytes(m.sizeBytes)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          {/* 详情 */}
          {selected ? (
            <Detail
              mail={selected}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              onClose={() => setSelectedId('')}
              onDeleted={() => { setSelectedId(''); void reload() }}
              toast={showToast}
            />
          ) : (
            <div style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46', fontSize: 12 }}>
              选择一封邮件查看
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <SettingsTab meta={meta} selftest={selftest} toast={showToast} onChanged={() => { invalidateSvc(); void reload() }} />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', borderRadius: 8, fontSize: 12, zIndex: 50,
          background: toast.kind === 'good' ? 'rgba(63,185,80,.15)' : toast.kind === 'bad' ? 'rgba(248,81,73,.15)' : 'rgba(88,101,242,.15)',
          color: toast.kind === 'good' ? '#3fb950' : toast.kind === 'bad' ? '#f87171' : '#a5b4fc',
          border: `1px solid ${toast.kind === 'good' ? 'rgba(63,185,80,.4)' : toast.kind === 'bad' ? 'rgba(248,81,73,.4)' : 'rgba(88,101,242,.4)'}`,
          maxWidth: 480,
        }}>{toast.msg}</div>
      )}
    </div>
  )
}
