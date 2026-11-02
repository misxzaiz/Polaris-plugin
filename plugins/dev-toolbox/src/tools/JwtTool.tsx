// JWT 解码工具：结构/claims/过期态 + HS* 验签；全部本地计算，不持久化输入
import { useMemo, useState } from 'react'
import { decodeJwt, verifyJwtHs, type JwtDecoded } from '../core'
import { Area, CopyBtn, L, Note, Out } from '../ui'

const prettyJson = (v: unknown) => JSON.stringify(v, null, 2)

function ClaimRow({ d, k }: { d: JwtDecoded; k: 'iat' | 'nbf' | 'exp' }) {
  const c = d[k]
  if (!c) return null
  const labels = { iat: 'iat 签发时间', nbf: 'nbf 生效时间', exp: 'exp 过期时间' } as const
  return (
    <L label={labels[k]}>
      <span>{c.isoUtc}</span>
      <span className="dtb-dim">（UTC · epoch {c.epoch}）</span>
    </L>
  )
}

export function JwtTool() {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [verify, setVerify] = useState<{ ok: boolean; detail: string } | null>(null)
  const [verifying, setVerifying] = useState(false)

  const decoded = useMemo<{ data?: JwtDecoded; error?: string }>(() => {
    if (token.trim() === '') return {}
    try {
      return { data: decodeJwt(token) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [token])

  const d = decoded.data

  const runVerify = async () => {
    setVerifying(true)
    try {
      setVerify(await verifyJwtHs(token, secret))
    } catch (e) {
      setVerify({ ok: false, detail: (e as Error).message })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div>
      <Area value={token} onChange={setToken} rows={4} placeholder="粘贴 JWT（header.payload.signature）——只在本地解码，不会联网也不会存储" />
      {decoded.error ? <Note kind="error">{decoded.error}</Note> : null}
      {d ? (
        <>
          <div className="dtb-badges">
            <span className={`dtb-badge dtb-badge-${d.expiryState === 'valid' ? 'ok' : d.expiryState === 'expired' ? 'bad' : 'dim'}`}>
              {d.expiryState === 'valid' ? '✓ 未过期' : d.expiryState === 'expired' ? '✗ 已过期' : '· 无过期声明'}
            </span>
            <span className="dtb-dim">{d.expiryDetail}</span>
            <span className="dtb-dim">alg: {String(d.header.alg ?? '未声明')}</span>
          </div>
          <div className="dtb-cards2">
            <div className="dtb-card">
              <div className="dtb-cardhead">
                <b>Header</b>
                <CopyBtn text={prettyJson(d.header)} />
              </div>
              <Out text={prettyJson(d.header)} />
            </div>
            <div className="dtb-card">
              <div className="dtb-cardhead">
                <b>Payload</b>
                <CopyBtn text={prettyJson(d.payload)} />
              </div>
              <Out text={prettyJson(d.payload)} />
            </div>
          </div>
          <div className="dtb-section">
            <b>时间声明</b>
            {d.iat || d.nbf || d.exp ? (
              <>
                <ClaimRow d={d} k="iat" />
                <ClaimRow d={d} k="nbf" />
                <ClaimRow d={d} k="exp" />
              </>
            ) : (
              <span className="dtb-dim">无 iat/nbf/exp 声明</span>
            )}
          </div>
          <div className="dtb-verify">
            <b>HS256/384/512 验签</b>
            <div className="dtb-row">
              <input
                className="dtb-input dtb-mono dtb-grow"
                type="password"
                value={secret}
                placeholder="共享密钥（secret）——仅本地使用，不存储"
                onChange={(e) => setSecret(e.target.value)}
              />
              <button className="dtb-btn" onClick={runVerify} disabled={verifying || token.trim() === ''}>
                {verifying ? '验签中…' : '验签'}
              </button>
            </div>
            {verify ? <Note kind={verify.ok ? 'ok' : 'error'}>{verify.detail}</Note> : null}
            <Note kind="info">
              仅支持 HMAC 系算法（HS256/384/512）；RS/ES 系需公钥，暂不支持。过期判断基于本机时钟。
            </Note>
          </div>
        </>
      ) : null}
    </div>
  )
}
