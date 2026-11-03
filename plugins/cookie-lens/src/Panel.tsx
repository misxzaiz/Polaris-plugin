/**
 * Cookie & CORS 调试台面板：三页签（Set-Cookie 解析诊断 / Cookie→URL 匹配 / CORS 判定）。
 * 引擎复用 shared/cookie-core.js 与 shared/cors-core.js（与 MCP 同一权威，
 * 零 require node 内置——esbuild browser bundle 兼容，纯本地零外联）。
 *
 * 类型注记：shared core 是 CJS JS（allowJs 推断），ok 被推成 boolean 无法判别
 * 收窄（cron-lens 实证坑）——面板侧显式定义返回形状 + 访问前结构性非空检查。
 */
import { useMemo, useState } from 'react'
import * as cookies from '../shared/cookie-core.js'
import * as cors from '../shared/cors-core.js'

interface CookieFinding { level: string; code: string; message: string }
interface ScopeInfo { domain: string; path: string; secure: boolean; hostOnly: boolean }
interface SetCookieParsed {
  ok: boolean
  error?: string
  cookie?: {
    name: string
    value: string
    expires: { raw: string; time: number } | null
    maxAge: number | null
    domain: string | null
    path: string | null
    secure: boolean
    httpOnly: boolean
    sameSite: string | null
    partitioned: boolean
  }
  scope?: ScopeInfo
  findings?: CookieFinding[]
  verdict?: 'accepted' | 'rejected'
}
interface MatchResult { ok: boolean; error?: string; matches?: boolean; reasons?: string[] }
interface CorsCheck { item: string; status: string; detail: string }
interface CorsJudged {
  ok: boolean
  error?: string
  kind?: 'simple' | 'preflight'
  verdict?: 'pass' | 'fail'
  checks?: CorsCheck[]
  failReasons?: string[]
  hints?: string[]
}

const CSS = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-head b{font-size:13px}
.cl-head .sub{color:#5C6678;font-size:11px}
.cl-tabs{display:flex;gap:4px;padding:8px 13px 0}
.cl-tab{background:#161c2a;border:1px solid #2b3348;border-bottom:none;border-radius:8px 8px 0 0;color:#8B94A9;font-size:12px;padding:6px 14px;cursor:pointer}
.cl-tab.on{color:#E6EAF2;background:#1a2030;border-color:#3a4358}
.cl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px;border-top:1px solid #1c2333}
.cl-input{width:100%;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:8px 10px;outline:none}
textarea.cl-input{resize:vertical;min-height:64px}
.cl-input:focus{border-color:#4fd1a0}
.cl-btn{background:#1f2940;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font-size:12px;padding:6px 18px;cursor:pointer}
.cl-btn:hover{border-color:#4fd1a0}
.cl-lbl{font-size:11px;color:#8B94A9;margin-bottom:3px;display:block}
.cl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.cl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.cl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.cl-rows{font:12px/1.9 ui-monospace,Consolas,monospace}
.cl-rows .r{display:flex;gap:10px;padding:2px 12px}
.cl-rows .k{color:#8B94A9;min-width:100px}
.cl-rows .v{color:#c9cede;word-break:break-all}
.cl-verdict{border-radius:8px;padding:9px 13px;font-size:12.5px;font-weight:600}
.cl-verdict.ok{border:1px solid #2f9e6e;background:#12271d;color:#69db7c}
.cl-verdict.bad{border:1px solid #e03131;background:#2b1215;color:#ff8787}
.cl-f{border-radius:6px;padding:6px 11px;font-size:11.5px;line-height:1.55}
.cl-f.error{border:1px solid #e03131;background:#2b1215;color:#ffa8a8}
.cl-f.warn{border:1px solid #f08c00;background:#2b1d0e;color:#ffc078}
.cl-f.info{border:1px solid #1c2333;background:#161c2a;color:#8B94A9}
.cl-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
.cl-tbl th{text-align:left;color:#8B94A9;font-weight:600;font-size:10.5px;padding:5px 10px;border-bottom:1px solid #1c2333;white-space:nowrap}
.cl-tbl td{padding:5px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all;vertical-align:top}
.cl-note{color:#5C6678;font-size:11px;line-height:1.6}
.cl-badge{display:inline-block;border-radius:4px;padding:0 6px;font-size:10.5px;font-weight:700}
`

const TABS = [
  { id: 'setcookie', label: 'Set-Cookie 解析' },
  { id: 'match', label: 'Cookie→URL 匹配' },
  { id: 'cors', label: 'CORS 判定' },
] as const

/** "Name: value" 多行文本 → 头列表（面板输入归一；空行与无冒号行忽略）。 */
function parseHeaderText(text: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const i = t.indexOf(':')
    if (i <= 0) continue
    out.push({ name: t.slice(0, i).trim(), value: t.slice(i + 1).trim() })
  }
  return out
}

function Findings({ findings }: { findings: CookieFinding[] }) {
  if (!findings.length) return <div className="cl-f info">诊断：无异常</div>
  return (
    <>
      {findings.map((f, i) => (
        <div className={`cl-f ${f.level}`} key={i}>
          <b>{f.level === 'error' ? '拒收' : f.level === 'warn' ? '警告' : '说明'}</b> · {f.code} —— {f.message}
        </div>
      ))}
    </>
  )
}

export default function CookieLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('setcookie')

  // ── 页签 1：Set-Cookie ──
  const [scText, setScText] = useState('')
  const [scUrl, setScUrl] = useState('')
  const [scGo, setScGo] = useState(0)
  const sc = useMemo(() => {
    if (!scGo) return null
    return cookies.parseSetCookie(scText, scUrl) as SetCookieParsed
  }, [scGo]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 页签 2：匹配（复用页签 1 的解析产物 + 目标 URL）──
  const [matchUrl, setMatchUrl] = useState('')
  const [matchGo, setMatchGo] = useState(0)
  const match = useMemo(() => {
    if (!matchGo || !sc || !sc.ok || !sc.scope) return null
    return cookies.cookieMatchesUrl({ scope: sc.scope }, matchUrl) as MatchResult
  }, [matchGo]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 页签 3：CORS ──
  const [origin, setOrigin] = useState('')
  const [method, setMethod] = useState('GET')
  const [reqH, setReqH] = useState('')
  const [resH, setResH] = useState('')
  const [creds, setCreds] = useState(false)
  const [corsGo, setCorsGo] = useState(0)
  const corsResult = useMemo(() => {
    if (!corsGo) return null
    return cors.judgeCors({
      origin, method,
      requestHeaders: parseHeaderText(reqH),
      responseHeaders: parseHeaderText(resH),
      withCredentials: creds,
    }) as CorsJudged
  }, [corsGo]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cl-root">
      <style>{CSS}</style>
      <div className="cl-head">
        <b>Cookie &amp; CORS 调试台</b>
        <span className="sub">RFC 6265 语义 · 拒收判定 · 纯本地零外联</span>
      </div>
      <div className="cl-tabs">
        {TABS.map((t) => (
          <button className={`cl-tab${tab === t.id ? ' on' : ''}`} key={t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="cl-body">
        {tab === 'setcookie' && (
          <>
            <div>
              <span className="cl-lbl">Set-Cookie 值（不含 "Set-Cookie:" 前缀也行）</span>
              <input className="cl-input" placeholder="sid=abc123; Path=/; Domain=.example.com; Secure; HttpOnly; SameSite=None" value={scText} onChange={(e) => setScText(e.target.value)} />
            </div>
            <div>
              <span className="cl-lbl">接收该响应头的 URL（判定 Domain/Path/Secure 语义必需）</span>
              <input className="cl-input" placeholder="https://api.example.com/v1/login" value={scUrl} onChange={(e) => setScUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setScGo(scGo + 1) }} />
            </div>
            <div><button className="cl-btn" onClick={() => setScGo(scGo + 1)}>解析诊断</button></div>
            {sc && !sc.ok && <div className="cl-err">{sc.error}</div>}
            {sc && sc.ok && sc.cookie && sc.scope && sc.findings && (
              <>
                <div className={`cl-verdict ${sc.verdict === 'accepted' ? 'ok' : 'bad'}`}>
                  {sc.verdict === 'accepted' ? '✓ 浏览器会接受这条 cookie' : '✗ 浏览器将拒收这条 cookie'}
                </div>
                <div className="cl-card">
                  <h3>结构与生效范围</h3>
                  <div className="cl-rows">
                    <div className="r"><span className="k">name / value</span><span className="v">{sc.cookie.name} = {sc.cookie.value === '' ? '(空)' : sc.cookie.value}</span></div>
                    {sc.cookie.domain && <div className="r"><span className="k">Domain</span><span className="v">{sc.cookie.domain}</span></div>}
                    {sc.cookie.path && <div className="r"><span className="k">Path</span><span className="v">{sc.cookie.path}</span></div>}
                    {sc.cookie.maxAge !== null && <div className="r"><span className="k">Max-Age</span><span className="v">{sc.cookie.maxAge}</span></div>}
                    {sc.cookie.expires && <div className="r"><span className="k">Expires</span><span className="v">{sc.cookie.expires.raw}</span></div>}
                    <div className="r"><span className="k">标志位</span><span className="v">{[sc.cookie.secure && 'Secure', sc.cookie.httpOnly && 'HttpOnly', sc.cookie.sameSite && `SameSite=${sc.cookie.sameSite}`, sc.cookie.partitioned && 'Partitioned'].filter(Boolean).join(' ') || '(无)'}</span></div>
                    <div className="r"><span className="k">生效范围</span><span className="v">domain:{sc.scope.domain}{sc.scope.hostOnly ? '(hostOnly)' : ''} · path:{sc.scope.path} · secure:{String(sc.scope.secure)}</span></div>
                  </div>
                </div>
                <Findings findings={sc.findings} />
              </>
            )}
            <div className="cl-note">
              拒收级判定：SameSite=None 无 Secure、__Host-/__Secure- 前缀违规、Domain 非 host 父域、名称含非法字符。localhost 按 trustworthy origin 豁免 Secure 明文限制。纯本地判定，不发请求。
            </div>
          </>
        )}

        {tab === 'match' && (
          <>
            <div>
              <span className="cl-lbl">先在「Set-Cookie 解析」页签解析一条 cookie（生效范围以此为准）</span>
              {!sc || !sc.ok || !sc.scope ? <div className="cl-f warn">尚无有效解析结果——先去第一页签解析一条 Set-Cookie</div> : (
                <div className="cl-rows">
                  <div className="r"><span className="k">cookie</span><span className="v">{sc.cookie ? `${sc.cookie.name}=${sc.cookie.value}` : ''}</span></div>
                  <div className="r"><span className="k">生效范围</span><span className="v">domain:{sc.scope.domain}{sc.scope.hostOnly ? '(hostOnly)' : ''} · path:{sc.scope.path} · secure:{String(sc.scope.secure)}</span></div>
                </div>
              )}
            </div>
            <div>
              <span className="cl-lbl">目标 URL（这个请求会带上该 cookie 吗？）</span>
              <input className="cl-input" placeholder="https://api.example.com/v1/orders" value={matchUrl} onChange={(e) => setMatchUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setMatchGo(matchGo + 1) }} />
            </div>
            <div><button className="cl-btn" disabled={!sc || !sc.ok} onClick={() => setMatchGo(matchGo + 1)}>判定匹配</button></div>
            {match && !match.ok && <div className="cl-err">{match.error}</div>}
            {match && match.ok && match.reasons && (
              <div className={`cl-verdict ${match.matches ? 'ok' : 'bad'}`}>
                {match.matches ? '✓ 该请求会携带这条 cookie' : '✗ 不会携带：' + match.reasons.join('；')}
              </div>
            )}
            <div className="cl-note">
              匹配 = domain-match（host 是 Domain 及其子域）+ path-match（请求路径在 Path 目录下）+ Secure 通道判定。Domain=.example.com 可发到子域；hostOnly（未写 Domain）只发回精确 host。
            </div>
          </>
        )}

        {tab === 'cors' && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span className="cl-lbl">Origin（发起页来源）</span>
                <input className="cl-input" placeholder="https://app.example.com" value={origin} onChange={(e) => setOrigin(e.target.value)} />
              </div>
              <div style={{ width: 120 }}>
                <span className="cl-lbl">Method</span>
                <input className="cl-input" value={method} onChange={(e) => setMethod(e.target.value)} />
              </div>
              <div style={{ width: 150 }}>
                <span className="cl-lbl">withCredentials</span>
                <button className="cl-btn" style={{ width: '100%' }} onClick={() => setCreds(!creds)}>{creds ? 'true（带凭证）' : 'false'}</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span className="cl-lbl">请求头（Name: value，每行一条）</span>
                <textarea className="cl-input" placeholder={'Authorization: Bearer xxx\nContent-Type: application/json'} value={reqH} onChange={(e) => setReqH(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <span className="cl-lbl">响应头（服务端 CORS 相关应答）</span>
                <textarea className="cl-input" placeholder={'Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST\r\nAccess-Control-Allow-Headers: Content-Type'} value={resH} onChange={(e) => setResH(e.target.value)} />
              </div>
            </div>
            <div><button className="cl-btn" onClick={() => setCorsGo(corsGo + 1)}>判定</button></div>
            {corsResult && !corsResult.ok && <div className="cl-err">{corsResult.error}</div>}
            {corsResult && corsResult.ok && corsResult.checks && corsResult.hints && (
              <>
                <div className={`cl-verdict ${corsResult.verdict === 'pass' ? 'ok' : 'bad'}`}>
                  {corsResult.verdict === 'pass' ? `✓ 通过（${corsResult.kind === 'preflight' ? '预检语义' : '简单请求语义'}）` : '✗ 失败——浏览器将拦截'}
                </div>
                <div className="cl-card">
                  <h3>检查明细</h3>
                  <table className="cl-tbl">
                    <tbody>
                      {corsResult.checks.map((c, i) => (
                        <tr key={i}>
                          <td style={{ width: 40 }}><span className={`cl-badge`} style={c.status === 'pass' ? { background: '#12271d', color: '#69db7c' } : c.status === 'fail' ? { background: '#2b1215', color: '#ff8787' } : c.status === 'warn' ? { background: '#2b1d0e', color: '#ffc078' } : { background: '#1a2030', color: '#8B94A9' }}>{c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : c.status === 'warn' ? '!' : '·'}</span></td>
                          <td style={{ width: 200 }}>{c.item}</td>
                          <td>{c.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="cl-card">
                  <h3>修复建议</h3>
                  <div style={{ padding: '6px 12px' }}>
                    {corsResult.hints.map((h, i) => <div className="cl-f info" key={i} style={{ marginBottom: 4 }}>→ {h}</div>)}
                  </div>
                </div>
              </>
            )}
            <div className="cl-note">
              语义基准：Fetch Standard。credentials 下 ACAO=* 与 ACAH/ACAM 的 * 都不再通配；重复 ACAO 按失败处理不合并；Authorization 非安全头必触发预检。纯本地推演，不发请求。
            </div>
          </>
        )}
      </div>
    </div>
  )
}
