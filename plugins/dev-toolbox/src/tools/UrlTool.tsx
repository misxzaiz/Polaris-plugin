// URL 工具：编解码（严格/表单两种口径）+ 组件与参数拆解（重复参数全列出）
import { useMemo, useState } from 'react'
import { parseUrl, urlDecode, urlEncode } from '../core'
import { Area, CopyBtn, L, Note, Out } from '../ui'

export function UrlTool() {
  const [text, setText] = useState('')

  const enc = useMemo(() => (text === '' ? '' : urlEncode(text)), [text])
  const dec = useMemo(() => {
    if (text.trim() === '') return null
    try {
      return urlDecode(text)
    } catch (e) {
      return { error: (e as Error).message } as const
    }
  }, [text])
  const parts = useMemo(() => {
    if (text.trim() === '') return null
    return parseUrl(text)
  }, [text])

  return (
    <div>
      <Area value={text} onChange={setText} rows={4} placeholder="输入 URL 或任意文本：下方同时给出编码、解码与解析结果" />

      {enc !== '' ? (
        <>
          <div className="dtb-cardhead">
            <b>URL 编码（component 语义）</b>
            <CopyBtn text={enc} />
          </div>
          <Out text={enc} />
        </>
      ) : null}

      {dec && !('error' in dec) ? (
        <>
          <div className="dtb-cardhead">
            <b>URL 解码</b>
            <CopyBtn text={dec.text} />
          </div>
          <L label="严格解码（RFC 3986，+ 为字面加号）">
            <span className="dtb-mono">{dec.text}</span>
          </L>
          <L label="表单语义解码（+ 当空格）">
            <span className="dtb-mono">{dec.textForm}</span>
          </L>
          {dec.textForm !== dec.text ? <Note kind="info">两种口径结果不同：查询串里的 + 通常按表单语义处理。</Note> : null}
        </>
      ) : null}
      {dec && 'error' in dec ? <Note kind="error">{dec.error}</Note> : null}

      {parts && !parts.ok ? <Note kind="error">{parts.error}</Note> : null}
      {parts && parts.ok ? (
        <>
          <div className="dtb-section">
            <b>URL 组件</b>
            <L label="origin"><span className="dtb-mono">{parts.origin}</span></L>
            <L label="protocol"><span className="dtb-mono">{parts.protocol}</span></L>
            <L label="host:port"><span className="dtb-mono">{parts.hostname}{parts.port ? `:${parts.port}` : ''}</span></L>
            {parts.username ? <L label="auth"><span className="dtb-mono">{parts.username} / {parts.password}</span></L> : null}
            <L label="path">
              <span className="dtb-mono">{parts.pathname}</span>
              {parts.pathSegments && parts.pathSegments.length > 0 ? (
                <span className="dtb-dim">（{parts.pathSegments.length} 段：{parts.pathSegments.join(' / ')}）</span>
              ) : null}
            </L>
            <L label="search"><span className="dtb-mono">{parts.search || '（无）'}</span></L>
            <L label="hash"><span className="dtb-mono">{parts.hash || '（无）'}</span></L>
          </div>
          {parts.params && parts.params.length > 0 ? (
            <div className="dtb-section">
              <b>查询参数（{parts.params.length} 个名字）</b>
              <table className="dtb-table">
                <thead>
                  <tr><th>参数</th><th>值</th></tr>
                </thead>
                <tbody>
                  {parts.params.map((p) => (
                    <tr key={p.name}>
                      <td className="dtb-mono">{p.name}</td>
                      <td className="dtb-mono">
                        {p.values.map((v, i) => (
                          <div key={i}>
                            {v === '' ? <span className="dtb-dim">（空）</span> : v}
                            {p.values.length > 1 ? <span className="dtb-dim"> #{i + 1}</span> : null}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Note kind="info">同名参数全部列出（URLSearchParams.get 只返回第一个值，这里用 getAll 避免丢参）。</Note>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
