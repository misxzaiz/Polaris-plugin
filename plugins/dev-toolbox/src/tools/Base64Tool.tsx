// Base64 工具：编码（标准+URL-safe）/ 解码（容错 + UTF-8 合法性提示）
import { useMemo, useState } from 'react'
import { base64ToUtf8, utf8ToBase64 } from '../core'
import { Area, CopyBtn, Note, Out } from '../ui'

export function Base64Tool() {
  const [mode, setMode] = useState<'enc' | 'dec'>('enc')
  const [text, setText] = useState('')

  const enc = useMemo(() => (mode === 'enc' && text !== '' ? utf8ToBase64(text) : ''), [mode, text])
  const encUrl = useMemo(() => (mode === 'enc' && text !== '' ? utf8ToBase64(text, true) : ''), [mode, text])
  const dec = useMemo(() => {
    if (mode !== 'dec' || text.trim() === '') return null
    try {
      return base64ToUtf8(text)
    } catch (e) {
      return { error: (e as Error).message } as const
    }
  }, [mode, text])

  return (
    <div>
      <div className="dtb-tabs">
        <button className={`dtb-tab${mode === 'enc' ? ' dtb-tab-on' : ''}`} onClick={() => setMode('enc')}>
          编码
        </button>
        <button className={`dtb-tab${mode === 'dec' ? ' dtb-tab-on' : ''}`} onClick={() => setMode('dec')}>
          解码
        </button>
      </div>
      <Area
        value={text}
        onChange={setText}
        rows={5}
        placeholder={mode === 'enc' ? '输入文本（UTF-8，中文/emoji 安全）' : '粘贴 Base64（容忍空白、URL-safe 字符、缺失填充）'}
      />
      {mode === 'enc' ? (
        text === '' ? null : (
          <>
            <div className="dtb-cardhead">
              <b>标准 Base64</b>
              <CopyBtn text={enc} />
            </div>
            <Out text={enc} />
            <div className="dtb-cardhead">
              <b>URL-safe（-_，无填充）</b>
              <CopyBtn text={encUrl} />
            </div>
            <Out text={encUrl} />
          </>
        )
      ) : dec === null ? null : 'error' in dec ? (
        <Note kind="error">{dec.error}</Note>
      ) : (
        <>
          <div className="dtb-cardhead">
            <b>解码结果{dec.replacedChars > 0 ? <span className="dtb-dim">（{dec.byteLength} 字节）</span> : <span className="dtb-dim">（{dec.byteLength} 字节）</span>}</b>
            <CopyBtn text={dec.text} />
          </div>
          <Out text={dec.text} />
          {dec.replacedChars > 0 ? (
            <Note kind="warn">
              检测到 {dec.replacedChars} 个 U+FFFD 替换符：输入字节不是合法 UTF-8 文本（可能是二进制数据）。
            </Note>
          ) : null}
        </>
      )}
    </div>
  )
}
