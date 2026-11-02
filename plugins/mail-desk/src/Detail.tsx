/**
 * 邮件详情抽屉:HTML 沙箱预览(scripts 全禁+远程图默认阻断)/纯文本/原始报文/
 * 附件下载;验证码 chips 一键复制;「发给 AI」把正文送进当前会话。
 */
import { useMemo, useState } from 'react'
import { api, type MailSummary, type MailDetailData } from './model'
import { filterRemoteResources } from '../shared/core'
import { sendToChat } from './host'

type SubTab = 'html' | 'text' | 'raw' | 'attach'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

function fmtTime(s: MailSummary): string {
  const iso = s.date || new Date(s.receivedAt).toISOString()
  return iso.replace('T', ' ').slice(0, 19)
}

export default function Detail(props: {
  mail: MailSummary
  detail: MailDetailData | null
  loading: boolean
  error: string
  onClose: () => void
  onDeleted: () => void
  toast: (msg: string, kind?: 'good' | 'bad' | 'info') => void
}) {
  const { mail, detail, loading, error } = props
  const [sub, setSub] = useState<SubTab>(mail.hasHtml ? 'html' : 'text')
  const [allowRemote, setAllowRemote] = useState(false)
  const [rawText, setRawText] = useState<string | null>(null)
  const [rawTruncated, setRawTruncated] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    if (!detail || !detail.html) return { html: '', blocked: 0 }
    return filterRemoteResources(detail.html, allowRemote)
  }, [detail, allowRemote])

  async function loadRaw() {
    if (rawText != null) return
    try {
      const r = await api.raw(mail.id)
      setRawText(r.raw)
      setRawTruncated(r.truncated)
    } catch (e) {
      props.toast(`原文读取失败:${(e as Error).message}`, 'bad')
      setRawText('(读取失败)')
    }
  }

  function switchSub(t: SubTab) {
    setSub(t)
    if (t === 'raw') void loadRaw()
  }

  async function downloadAttachment(idx: number, filename: string) {
    try {
      const a = await api.attachment(mail.id, idx)
      const bin = atob(a.dataB64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: a.contentType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url
      el.download = filename || 'attachment'
      el.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      props.toast(`已下载 ${filename}`, 'good')
    } catch (e) {
      props.toast(`附件下载失败:${(e as Error).message}`, 'bad')
    }
  }

  function copy(text: string) {
    try {
      void navigator.clipboard.writeText(text)
      props.toast('已复制', 'good')
    } catch (_) {
      props.toast('复制失败', 'bad')
    }
  }

  function sendToAI() {
    if (!detail) return
    const parts: string[] = [`帮我分析这封测试邮件:\n主题:${mail.subject}\n发件人:${mail.fromText}`]
    if (detail.codes && detail.codes.length) parts.push(`疑似验证码:${detail.codes.join(', ')}`)
    if (detail.text) parts.push(`正文:\n${detail.text.slice(0, 2000)}`)
    else if (detail.html) parts.push('(正文是 HTML 版,面板可预览)')
    const okSend = sendToChat(parts.join('\n'))
    props.toast(okSend ? '已发送到当前会话' : '发送失败:宿主未提供 sendToChat 桥', okSend ? 'good' : 'bad')
  }

  async function deleteMail() {
    if (deleting) return
    setDeleting(true)
    try {
      await api.remove(mail.id)
      props.toast('已删除', 'good')
      props.onDeleted()
    } catch (e) {
      props.toast(`删除失败:${(e as Error).message}`, 'bad')
      setDeleting(false)
    }
  }

  const btnStyle: React.CSSProperties = {
    fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #3f3f46',
    background: 'transparent', color: '#a1a1aa', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #27272a', minWidth: 320, flex: 1.4 }}>
      {/* 头部 */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mail.subject}
          </span>
          <button style={btnStyle} onClick={sendToAI}>发给 AI</button>
          <button style={{ ...btnStyle, color: '#f87171', borderColor: '#7f1d1d' }} onClick={deleteMail}>{deleting ? '…' : '删除'}</button>
          <button style={btnStyle} onClick={props.onClose}>关闭</button>
        </div>
        <div style={{ fontSize: 11, color: '#71717a', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>来自 {mail.fromText || '(未知)'}</span>
          <span>到 {mail.toText || '(未指定)'}</span>
          <span>{fmtTime(mail)}</span>
          <span>{fmtBytes(mail.sizeBytes)}</span>
        </div>
        {detail && detail.codes && detail.codes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#d29922' }}>疑似验证码:</span>
            {detail.codes.map((c) => (
              <button
                key={c}
                onClick={() => copy(c)}
                style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: 1.5, padding: '2px 10px', borderRadius: 6,
                  background: 'rgba(210,153,34,.15)', color: '#d29922', border: '1px solid rgba(210,153,34,.35)', cursor: 'pointer',
                }}
                title="点击复制"
              >{c}</button>
            ))}
          </div>
        )}
        {/* 子 Tab */}
        <div style={{ display: 'flex', gap: 2 }}>
          {([['html', 'HTML 预览'], ['text', '纯文本'], ['raw', '原始报文'], ['attach', `附件${mail.attachments.length ? `(${mail.attachments.length})` : ''} `]] as Array<[SubTab, string]>).map(([id, label]) => (
            <button
              key={id}
              onClick={() => switchSub(id)}
              style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                border: 'none',
                background: sub === id ? 'rgba(88,101,242,.2)' : 'transparent',
                color: sub === id ? '#a5b4fc' : '#71717a',
              }}
            >{label.trim()}</button>
          ))}
          {sub === 'html' && filtered.blocked > 0 && (
            <button
              onClick={() => setAllowRemote(!allowRemote)}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #3f3f46', background: 'transparent', color: allowRemote ? '#d29922' : '#a1a1aa', marginLeft: 'auto' }}
            >{allowRemote ? '已允许远程图(再点恢复阻断)' : `${filtered.blocked} 个远程资源已阻断·放行`}</button>
          )}
        </div>
      </div>
      {/* 内容区 */}
      <div style={{ flex: 1, overflow: 'auto', background: '#131316' }}>
        {loading && <div style={{ padding: 16, color: '#71717a', fontSize: 12 }}>加载中…</div>}
        {error && <div style={{ padding: 16, color: '#f87171', fontSize: 12 }}>{error}</div>}
        {!loading && !error && detail && sub === 'html' && (
          detail.html ? (
            <iframe
              title="邮件 HTML 预览"
              sandbox=""
              srcDoc={filtered.html}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            />
          ) : (
            <div style={{ padding: 16, color: '#52525b', fontSize: 12 }}>这封邮件没有 HTML 部分</div>
          )
        )}
        {!loading && !error && detail && sub === 'text' && (
          <pre style={{ margin: 0, padding: 12, fontSize: 12, lineHeight: 1.6, color: '#d4d4d8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
            {detail.text || '(无纯文本部分)'}
          </pre>
        )}
        {!loading && !error && sub === 'raw' && (
          <pre style={{ margin: 0, padding: 12, fontSize: 11, lineHeight: 1.5, color: '#a1a1aa', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {rawText == null ? '加载中…' : rawText}
            {rawTruncated ? '\n…(原文过长已截断;完整原文在服务存储目录)' : ''}
          </pre>
        )}
        {!loading && !error && sub === 'attach' && (
          mail.attachments.length ? (
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {mail.attachments.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#1c1c1f' }}>
                  <span style={{ fontSize: 12, color: '#d4d4d8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</span>
                  <span style={{ fontSize: 10, color: '#52525b' }}>{a.contentType}</span>
                  <span style={{ fontSize: 10, color: '#52525b' }}>{fmtBytes(a.size)}</span>
                  <button style={btnStyle} onClick={() => void downloadAttachment(i, a.filename)}>下载</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 16, color: '#52525b', fontSize: 12 }}>无附件</div>
          )
        )}
      </div>
    </div>
  )
}
