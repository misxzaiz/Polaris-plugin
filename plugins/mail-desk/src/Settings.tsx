/**
 * 设置页:SMTP 收信口配置 + 常见框架接入片段 + 自检 + 危险区(清空)
 */
import { useState } from 'react'
import { api, type DeskMeta, type SelftestReport } from './model'

const SNIPPETS: Array<{ name: string; code: string }> = [
  {
    name: 'Nodemailer / Node.js',
    code: `const transporter = nodemailer.createTransport({\n  host: '127.0.0.1',\n  port: 1025,\n  secure: false,\n  tls: { rejectUnauthorized: false },\n})`,
  },
  {
    name: 'Spring Boot (application.properties)',
    code: `spring.mail.host=127.0.0.1\nspring.mail.port=1025\nspring.mail.properties.mail.smtp.auth=false\nspring.mail.properties.mail.smtp.starttls.enable=false`,
  },
  {
    name: 'Django (settings.py)',
    code: `EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'\nEMAIL_HOST = '127.0.0.1'\nEMAIL_PORT = 1025\nEMAIL_USE_TLS = False`,
  },
  {
    name: 'Flask (app.config)',
    code: `app.config['MAIL_SERVER'] = '127.0.0.1'\napp.config['MAIL_PORT'] = 1025\napp.config['MAIL_USE_TLS'] = False`,
  },
  {
    name: 'Laravel (.env)',
    code: `MAIL_MAILER=smtp\nMAIL_HOST=127.0.0.1\nMAIL_PORT=1025\nMAIL_ENCRYPTION=null`,
  },
  {
    name: 'SMTP 通用(任意客户端)',
    code: `Host: 127.0.0.1\nPort: 1025\nEncryption: None / STARTTLS(如客户端强制)\nAuth: 无(catch-all 全收)`,
  },
]

export default function Settings(props: {
  meta: DeskMeta | null
  selftest: SelftestReport | null
  toast: (msg: string, kind?: 'good' | 'bad' | 'info') => void
  onChanged: () => void
}) {
  const { meta } = props
  const [port, setPort] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const [confirmingClear, setConfirmingClear] = useState(false)

  async function savePort() {
    const p = parseInt(port, 10)
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      props.toast('端口非法(1-65535)', 'bad')
      return
    }
    setBusy(true)
    try {
      const r = await api.setSmtpPort(p)
      props.toast(r.note || '已写入配置', 'good')
      setPort('')
      props.onChanged()
    } catch (e) {
      props.toast(`保存失败:${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  async function runSelftest() {
    setBusy(true)
    try {
      const r = await api.selftest()
      props.onChanged()
      props.toast(r.ok ? `自检通过(${r.elapsedMs}ms),收信链路正常` : `自检失败:${r.error || '未知'}`, r.ok ? 'good' : 'bad')
    } catch (e) {
      props.toast(`自检失败:${(e as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  async function clearAll() {
    if (!confirmingClear) { setConfirmingClear(true); return }
    setConfirmingClear(false)
    try {
      const r = await api.clear()
      props.toast(`已清空 ${r.cleared} 封`, 'good')
      props.onChanged()
    } catch (e) {
      props.toast(`清空失败:${(e as Error).message}`, 'bad')
    }
  }

  function copySnippet(code: string, name: string) {
    try {
      void navigator.clipboard.writeText(code)
      setCopied(name)
      window.setTimeout(() => setCopied(''), 1500)
    } catch (_) { /* 忽略 */ }
  }

  const label: React.CSSProperties = { fontSize: 11, color: '#71717a' }
  const input: React.CSSProperties = {
    fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid #3f3f46',
    background: '#18181b', color: '#e4e4e7', width: 110,
  }
  const btn: React.CSSProperties = {
    fontSize: 12, padding: '5px 14px', borderRadius: 6, border: '1px solid #3f3f46',
    background: 'rgba(88,101,242,.15)', color: '#a5b4fc', cursor: 'pointer',
  }

  return (
    <div style={{ padding: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 收信口 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>SMTP 收信口</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#d4d4d8' }}>
            当前:<code style={{ padding: '2px 6px', background: '#1c1c1f', borderRadius: 4 }}>127.0.0.1:{meta?.smtpPort ?? '…'}</code>
            <span style={{ marginLeft: 8, fontSize: 10, color: meta?.smtpListening ? '#3fb950' : '#f87171' }}>
              {meta?.smtpListening ? '监听中' : `未监听${meta?.smtpLastError ? `(${meta.smtpLastError})` : ''}`}
            </span>
          </span>
          <span style={label}>改端口(1-65535;改后 3s 内热更):</span>
          <input style={input} value={port} placeholder={String(meta?.smtpPort ?? 1025)} onChange={(e) => setPort(e.target.value)} />
          <button style={btn} disabled={busy} onClick={() => void savePort()}>保存</button>
        </div>
        <div style={{ fontSize: 11, color: '#52525b' }}>
          只绑 127.0.0.1,外部机器不可达;catch-all 全收不转发,代码里不存在外发路径;单封上限 5MB。
        </div>
      </section>

      {/* 自检 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>自检(试金石)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={btn} disabled={busy} onClick={() => void runSelftest()}>运行自检</button>
          {props.selftest && (
            <span style={{ fontSize: 11, color: props.selftest.ok ? '#3fb950' : '#f87171' }}>
              上次:{props.selftest.ok ? '通过' : `失败(${props.selftest.error || '未知'})`} · {props.selftest.at.replace('T', ' ').slice(0, 19)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#52525b' }}>向本机 SMTP 口发一封真信并断言收到,端到端验证收信链路。</div>
      </section>

      {/* 配置片段 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>把应用的邮件发到这里(配置片段)</div>
        {SNIPPETS.map((s) => (
          <div key={s.name} style={{ border: '1px solid #27272a', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', background: '#1c1c1f' }}>
              <span style={{ fontSize: 11, color: '#a1a1aa', flex: 1 }}>{s.name}</span>
              <button style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', cursor: 'pointer' }} onClick={() => copySnippet(s.code, s.name)}>
                {copied === s.name ? '已复制' : '复制'}
              </button>
            </div>
            <pre style={{ margin: 0, padding: 10, fontSize: 11, lineHeight: 1.5, color: '#a1a1aa', overflow: 'auto' }}>{s.code}</pre>
          </div>
        ))}
      </section>

      {/* 存储 */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>存储</div>
        {meta && (
          <div style={{ fontSize: 11, color: '#71717a', lineHeight: 1.8 }}>
            目录:<code style={{ padding: '1px 5px', background: '#1c1c1f', borderRadius: 4, wordBreak: 'break-all' }}>{meta.dir}</code><br />
            当前 {meta.count} 封 / {Math.round(meta.totalBytes / 1024)}KB;环形上限 {meta.limits?.maxMailCount ?? 500} 封 / {Math.round((meta.limits?.maxTotalBytes ?? 209715200) / 1024 / 1024)}MB,超出自动淘汰最旧。
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            style={{ ...btn, color: confirmingClear ? '#fecaca' : '#f87171', borderColor: '#7f1d1d', background: confirmingClear ? 'rgba(248,81,73,.25)' : 'rgba(248,81,73,.08)' }}
            onClick={() => void clearAll()}
          >
            {confirmingClear ? '再点一次确认清空全部邮件(不可逆)' : '清空收件箱'}
          </button>
        </div>
      </section>
    </div>
  )
}
