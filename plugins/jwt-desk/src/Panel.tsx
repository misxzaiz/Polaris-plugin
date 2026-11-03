/**
 * JWT 调试台面板：解码 / 验签 / 审计 / 签发。
 * 核心复用 shared/jwt-core.js（与 MCP 同一权威）；密码学走 shared/jwt-crypto-web.js
 * （globalThis.crypto.subtle，浏览器与 node 都内置）——纯本地执行，token 不出本机。
 */
import { useState } from 'react'
import * as coreNs from '../shared/jwt-core.js'
import * as webCrypto from '../shared/jwt-crypto-web.js'

// core 是零依赖 JS（checkJs:false 下 TS 推断无法窄化 ok 联合），JS-interop 标准做法
const core = coreNs as any

type Finding = { id: string; level: 'high' | 'caution' | 'info'; title: string; detail: string }
type PanelState =
  | { kind: 'error'; message: string }
  | { kind: 'decode'; header: string; payload: string; sigInfo: string; claims: Array<{ k: string; zh: string; v: string }> }
  | { kind: 'verify'; verified: boolean; alg: string; reason: string | null; clock: string[]; findings: Finding[]; counts: { high: number; caution: number; info: number } }
  | { kind: 'audit'; findings: Finding[]; counts: { high: number; caution: number; info: number }; clockLine: string }
  | { kind: 'sign'; token: string; meta: string }

const CSS = `
.jd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.jd-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.jd-head b{font-size:13px}
.jd-head .sub{color:#5C6678;font-size:11px}
.jd-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.jd-tabs{display:flex;gap:6px;flex-wrap:wrap}
.jd-tab{background:#20263A;border:1px solid #2b3348;color:#8B94A9;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}
.jd-tab.on{background:#2b3348;color:#E6EAF2;border-color:#3a4358}
.jd-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.jd-input{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12.5px/1.5 ui-monospace,Consolas,monospace;padding:7px 10px;outline:none}
.jd-input:focus{border-color:#4fa3f1}
.jd-grow{flex:1;min-width:200px}
.jd-narrow{width:170px}
.jd-area{width:100%;min-height:92px;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.6 ui-monospace,Consolas,monospace;padding:10px;resize:vertical;outline:none}
.jd-area:focus{border-color:#4fa3f1}
.jd-btn{background:#2b3348;border:1px solid #3a4358;color:#E6EAF2;border-radius:6px;padding:5px 16px;font-size:12px;cursor:pointer}
.jd-btn:disabled{opacity:.45;cursor:default}
.jd-err{background:#2b1215;border:1px solid #e03131;color:#f1a0a0;border-radius:8px;padding:8px 12px;font-size:12px}
.jd-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.jd-verdict.pass{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.jd-verdict.fail{background:#2b1215;border-color:#e03131;color:#f1a0a0}
.jd-verdict b{font-size:13px}
.jd-json{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px;font:12px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#c9cede}
.jd-finds{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.jd-finding{padding:7px 10px;border-bottom:1px solid #161c2a;font-size:11.5px}
.jd-finding:last-child{border-bottom:none}
.jd-lv{display:inline-block;border-radius:4px;padding:0 6px;margin-right:6px;font-size:10.5px}
.jd-lv.high{background:#3d1418;color:#f1a0a0}
.jd-lv.caution{background:#332512;color:#f3b377}
.jd-lv.info{background:#1a2333;color:#9aa8c7}
.jd-finding .det{color:#8B94A9;margin-top:2px;word-break:break-all}
.jd-note{color:#5C6678;font-size:11px;line-height:1.6}
.jd-claims{border:1px solid #1c2333;border-radius:8px;overflow:hidden;font-size:11.5px}
.jd-claims .row{display:flex;gap:8px;padding:4px 10px;border-bottom:1px solid #161c2a;font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.jd-claims .row:last-child{border-bottom:none}
.jd-claims .k{color:#9f9af0;min-width:150px;white-space:nowrap}
.jd-claims .zh{color:#5C6678;min-width:130px;white-space:nowrap}
.jd-claims .v{color:#c9cede;flex:1}
.jd-clock{font:11px/1.7 ui-monospace,Consolas,monospace;color:#9aa3b8}
.jd-select{background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font-size:12px;padding:6px 8px;outline:none}
`

type Tab = 'decode' | 'verify' | 'audit' | 'sign'

const TAB_ZH: Record<Tab, string> = { decode: '解码', verify: '验签', audit: '审计', sign: '签发' }
const SIGN_ALGS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512']
const LV_CLS: Record<string, string> = { high: 'high', caution: 'caution', info: 'info' }

/** 密钥自适应：PEM → 公私钥 PEM 双发；{...} → JWK；其余 → HS secret（core 按算法族取用） */
function buildMaterial(keyInput: string): any {
  const k = keyInput.trim()
  if (!k) return {}
  if (k.startsWith('-----BEGIN')) return { publicKeyPem: k, privateKeyPem: k }
  if (k.startsWith('{')) {
    try {
      const j = JSON.parse(k)
      return { publicKeyJwk: j, privateKeyJwk: j }
    } catch { return { secret: k } }
  }
  return { secret: k }
}

function isAsym(alg: string): boolean {
  return !!core.ALGS[alg] && core.ALGS[alg].family !== 'hmac'
}

function auditOf(header: any, payload: any, nowMs: number) {
  return core.analyzeClaims(header, payload, nowMs) as { findings: Finding[]; counts: { high: number; caution: number; info: number } }
}

function nowMsFromInput(s: string): number {
  const t = s.trim()
  if (!t) return Date.now()
  if (/^\d+$/.test(t)) return Number(t)
  const p = Date.parse(t)
  if (!Number.isFinite(p)) throw new Error('审计时刻无法解析（支持 epoch 毫秒或 ISO 字符串）')
  return p
}

export default function JwtDeskPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('decode')
  const [token, setToken] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [nowInput, setNowInput] = useState('')
  const [payloadText, setPayloadText] = useState('{\n  "sub": "user-1",\n  "scope": "read"\n}')
  const [expiresSec, setExpiresSec] = useState('3600')
  const [state, setState] = useState<PanelState | null>(null)
  const [busy, setBusy] = useState(false)
  const [signAlg, setSignAlg] = useState('HS256')

  async function run() {
    if (tab === 'sign') { await runSign(); return }
    if (!token.trim()) { setState({ kind: 'error', message: '缺少 token' }); return }
    if (tab === 'decode') { runDecode(); return }
    if (tab === 'audit') { runAudit(); return }
    await runVerify()
  }

  function runDecode() {
    const p = core.parseToken(token)
    if (!p.ok) { setState({ kind: 'error', message: String(p.error) }); return }
    const claims = Object.keys(p.payload).map((k: string) => {
      const zh = (core.CLAIM_ZH as Record<string, string>)[k] || ''
      let v = JSON.stringify(p.payload[k])
      if ((k === 'exp' || k === 'iat' || k === 'nbf') && typeof p.payload[k] === 'number') v += `（${new Date(p.payload[k] * 1000).toISOString()}）`
      return { k, zh, v }
    })
    setState({
      kind: 'decode',
      header: JSON.stringify(p.header, null, 2),
      payload: JSON.stringify(p.payload, null, 2),
      sigInfo: `signature：${p.signature.length} 字节（base64url ${p.signatureB64.length} 字符），前 16 字节 hex：${core.bytesToHex(p.signature, 16)}${p.signature.length > 16 ? '…' : ''}`,
      claims,
    })
  }

  function runAudit() {
    const p = core.parseToken(token)
    if (!p.ok) { setState({ kind: 'error', message: String(p.error) }); return }
    let nowMs: number
    try { nowMs = nowMsFromInput(nowInput) } catch (e: any) { setState({ kind: 'error', message: e.message }); return }
    const a = auditOf(p.header, p.payload, nowMs)
    const clock = core.tokenClock(p.payload, nowMs)
    const bits: string[] = []
    if (clock.expired === true) bits.push(`已过期（exp=${clock.expIso}，超时 ${core.humanizeMs(-clock.remainingMs)}）`)
    else if (clock.expired === false) bits.push(`未过期（exp=${clock.expIso}，剩余 ${core.humanizeMs(clock.remainingMs)}）`)
    else bits.push('无 exp，无法判过期')
    setState({ kind: 'audit', findings: a.findings, counts: a.counts, clockLine: `审计时刻 ${new Date(nowMs).toISOString()} · ${bits.join('；')}` })
  }

  async function runVerify() {
    const p = core.parseToken(token)
    if (!p.ok) { setState({ kind: 'error', message: String(p.error) }); return }
    let nowMs: number
    try { nowMs = nowMsFromInput(nowInput) } catch (e: any) { setState({ kind: 'error', message: e.message }); return }
    setBusy(true)
    try {
      const material = buildMaterial(keyInput)
      const r = await core.verifyToken(token, material, webCrypto)
      if (!r.ok) { setState({ kind: 'error', message: String(r.error) }); return }
      const a = auditOf(r.parsed.header, r.parsed.payload, nowMs)
      const clock = core.tokenClock(r.parsed.payload, nowMs)
      const bits: string[] = []
      if (clock.expired === true) bits.push(`已过期（exp=${clock.expIso}，超时 ${core.humanizeMs(-clock.remainingMs)}）`)
      else if (clock.expired === false) bits.push(`未过期（exp=${clock.expIso}，剩余 ${core.humanizeMs(clock.remainingMs)}）`)
      if (clock.notYet === true) bits.push(`尚未生效（nbf=${clock.nbfIso}）`)
      if (clock.iatIso) bits.push(`签发于 ${clock.iatIso}`)
      setState({ kind: 'verify', verified: !!r.verified, alg: r.alg || '?', reason: r.reason || null, clock: bits, findings: a.findings, counts: a.counts })
    } catch (e: any) {
      setState({ kind: 'error', message: `验签执行失败：${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  async function runSign() {
    const alg = signAlg
    if (!keyInput.trim() && !isAsym(alg)) { setState({ kind: 'error', message: '缺少密钥（HS* 填字符串 secret）' }); return }
    if (isAsym(alg) && !keyInput.trim()) { setState({ kind: 'error', message: '缺少私钥（RS*/PS*/ES* 粘贴 PEM 私钥或 JWK）' }); return }
    let payloadObj: any
    try { payloadObj = JSON.parse(payloadText) } catch (e: any) { setState({ kind: 'error', message: `payload 不是合法 JSON：${e.message}` }); return }
    const material = buildMaterial(keyInput)
    const opts: any = {}
    const es = Number(expiresSec)
    if (expiresSec.trim() !== '' && Number.isFinite(es)) opts.expiresInSeconds = es
    setBusy(true)
    try {
      const r = await core.signToken(alg, material, payloadObj, opts, webCrypto)
      if (!r.ok) { setState({ kind: 'error', message: String(r.error) }); return }
      setState({ kind: 'sign', token: r.token, meta: `alg=${r.header.alg} · exp=${r.payload.exp !== undefined ? new Date(r.payload.exp * 1000).toISOString() : '未设置'} · iat=${new Date(r.payload.iat * 1000).toISOString()}` })
    } catch (e: any) {
      setState({ kind: 'error', message: `签发执行失败：${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  const hasToken = !!token.trim()
  const canRun = tab === 'sign' ? true : hasToken

  return (
    <div className="jd-root">
      <style>{CSS}</style>
      <div className="jd-head">
        <b>JWT 调试台</b>
        <span className="sub">解码 · 验签 · 审计 · 签发 · HS256/RS256/PS256/ES256（384·512 同档）· 纯本地 · token 不出本机</span>
      </div>
      <div className="jd-body">
        <div className="jd-tabs">
          {(['decode', 'verify', 'audit', 'sign'] as Tab[]).map((t) => (
            <button key={t} className={`jd-tab ${tab === t ? 'on' : ''}`} onClick={() => { setTab(t); setState(null) }}>
              {TAB_ZH[t]}
            </button>
          ))}
        </div>

        <textarea
          className="jd-area"
          placeholder="粘贴 JWT（header.payload.signature 三段）……"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />

        {(tab === 'verify' || tab === 'sign') && (
          <input
            className="jd-input jd-grow"
            placeholder={tab === 'verify' ? '密钥：HS* 填字符串 secret；RS*/PS*/ES* 粘贴 PEM/JWK 公钥' : '密钥：HS* 填字符串 secret；RS*/PS*/ES* 粘贴 PEM/JWK 私钥'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
        )}

        {tab === 'audit' && (
          <input
            className="jd-input jd-narrow"
            placeholder="审计时刻（留空=现在）"
            value={nowInput}
            onChange={(e) => setNowInput(e.target.value)}
          />
        )}

        {tab === 'sign' && (
          <>
            <div className="jd-row">
              <select className="jd-select" value={signAlg} onChange={(e) => setSignAlg(e.target.value)}>
                {SIGN_ALGS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input
                className="jd-input jd-narrow"
                placeholder="有效期秒（留空不设 exp）"
                value={expiresSec}
                onChange={(e) => setExpiresSec(e.target.value)}
              />
            </div>
            <textarea
              className="jd-area"
              placeholder='payload claims（JSON 对象）'
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
            />
          </>
        )}

        <div className="jd-row">
          <button className="jd-btn" disabled={!canRun || busy} onClick={run}>
            {busy ? '执行中…' : tab === 'sign' ? '签发' : '执行'}
          </button>
          {tab === 'verify' && <span className="jd-note">HS256/384/512 用对称密钥；RS/PS/ES 用 PEM 或 JWK 公钥（自适应识别）。</span>}
          {tab === 'sign' && <span className="jd-note">签发仅用于联调测试——勿将测试密钥用于生产。</span>}
        </div>

        {state && state.kind === 'error' && <div className="jd-err">✖ {state.message}</div>}

        {state && state.kind === 'decode' && (
          <>
            <div className="jd-json">① Header{'\n'}{state.header}</div>
            <div className="jd-json">② Payload{'\n'}{state.payload}</div>
            <div className="jd-json">③ {state.sigInfo}</div>
            <div className="jd-claims">
              {state.claims.map((c: any) => (
                <div className="row" key={c.k}>
                  <span className="k">{c.k}</span>
                  <span className="zh">{c.zh}</span>
                  <span className="v">{c.v}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {state && state.kind === 'verify' && (
          <>
            <div className={`jd-verdict ${state.verified ? 'pass' : 'fail'}`}>
              <b>{state.verified ? '✔ 验签通过' : '✖ 验签不通过'}</b>（alg={state.alg}）
              {state.reason && <div className="jd-note" style={{ color: 'inherit' }}>{state.reason}</div>}
            </div>
            {state.clock.length > 0 && <div className="jd-clock">时钟视角：{state.clock.join('；')}</div>}
            <FindingsBlock findings={state.findings} counts={state.counts} />
          </>
        )}

        {state && state.kind === 'audit' && (
          <>
            <div className="jd-clock">{state.clockLine}</div>
            <FindingsBlock findings={state.findings} counts={state.counts} />
          </>
        )}

        {state && state.kind === 'sign' && (
          <>
            <div className="jd-clock">{state.meta}</div>
            <textarea className="jd-area" readOnly value={state.token} onFocus={(e) => e.currentTarget.select()} />
          </>
        )}

        {tab === 'audit' && !state && (
          <div className="jd-note">审计 = 对 header/payload 的已知风险模式检查（alg=none、过期、未来 iat、超长有效期、jku/x5u 外链、payload 带疑似凭证等），逐条中文说明。不验证签名——验签请切「验签」页。</div>
        )}
      </div>
    </div>
  )
}

function FindingsBlock({ findings, counts }: { findings: Finding[]; counts: { high: number; caution: number; info: number } }) {
  if (!findings || findings.length === 0) {
    return <div className="jd-note">审计发现 0 条——未命中已知风险模式（不代表绝对安全）。</div>
  }
  return (
    <div className="jd-finds">
      <div className="jd-note" style={{ padding: '6px 10px', borderBottom: '1px solid #161c2a' }}>
        审计发现 {findings.length} 条（高危 {counts.high} / 需注意 {counts.caution} / 提示 {counts.info}）
      </div>
      {findings.map((f, i) => (
        <div className="jd-finding" key={i}>
          <span className={`jd-lv ${LV_CLS[f.level]}`}>{(core.LEVEL_LABELS as Record<string, string>)[f.level]}</span>
          {f.title}
          <div className="det">{f.detail}</div>
        </div>
      ))}
    </div>
  )
}
