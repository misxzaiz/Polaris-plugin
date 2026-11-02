// 哈希工具：一次计算全部算法 + 可选 HMAC；大输入限长防 UI 卡顿
import { useEffect, useState } from 'react'
import { hashText } from '../core'
import { Area, CopyBtn, Note } from '../ui'

const ALGOS = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'] as const
const MAX_INPUT = 100_000

type Digests = Partial<Record<(typeof ALGOS)[number], string>>

export function HashTool() {
  const [text, setText] = useState('')
  const [secret, setSecret] = useState('')
  const [digests, setDigests] = useState<Digests>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const input = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) : text
  const truncated = text.length > MAX_INPUT

  useEffect(() => {
    let alive = true
    if (input === '') {
      setDigests({})
      setError(null)
      return
    }
    setBusy(true)
    const hmac = secret !== ''
    Promise.all(
      ALGOS.map(async (alg) => {
        if (hmac && alg === 'md5') return [alg, '（HMAC 不支持 MD5）'] as const
        try {
          return [alg, await hashText(alg, input, hmac ? secret : undefined)] as const
        } catch (e) {
          return [alg, `错误：${(e as Error).message}`] as const
        }
      }),
    )
      .then((pairs) => {
        if (!alive) return
        const next: Digests = {}
        for (const [k, v] of pairs) next[k] = v
        setDigests(next)
        setError(null)
      })
      .catch((e: unknown) => {
        if (alive) setError((e as Error).message)
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [input, secret])

  const algoLabel: Record<string, string> = {
    md5: 'MD5',
    sha1: 'SHA-1',
    sha256: 'SHA-256',
    sha384: 'SHA-384',
    sha512: 'SHA-512',
  }

  return (
    <div>
      <Area value={text} onChange={setText} rows={5} placeholder="输入要计算哈希的文本（UTF-8）" />
      {truncated ? <Note kind="warn">输入超过 {MAX_INPUT} 字符，仅计算前 {MAX_INPUT} 字符</Note> : null}
      <div className="dtb-row dtb-mt8">
        <input
          className="dtb-input dtb-mono dtb-grow"
          type="password"
          value={secret}
          placeholder="HMAC 密钥（可选，填入后上方变为对应 HMAC 值）"
          onChange={(e) => setSecret(e.target.value)}
        />
      </div>
      {error ? <Note kind="error">{error}</Note> : null}
      <div className="dtb-hashlist">
        {ALGOS.map((alg) => (
          <div className="dtb-hashrow" key={alg}>
            <span className="dtb-hashalg">{secret ? 'HMAC-' : ''}{algoLabel[alg]}</span>
            <span className="dtb-hashval dtb-mono">{digests[alg] ?? (busy ? '计算中…' : '—')}</span>
            {digests[alg] ? <CopyBtn text={digests[alg]!} /> : null}
          </div>
        ))}
      </div>
      <Note kind="info">MD5/SHA-1 仅用于兼容旧协议，不具备防碰撞安全性。全部本地计算。</Note>
    </div>
  )
}
