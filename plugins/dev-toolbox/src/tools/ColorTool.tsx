// 颜色转换：HEX/RGB/HSL 三向 + 色块预览（含对比文字色）
import { useMemo, useState } from 'react'
import { parseColor } from '../core'
import { CopyBtn, Input, Note } from '../ui'

export function ColorTool() {
  const [text, setText] = useState('')
  const c = useMemo(() => (text.trim() === '' ? null : parseColor(text)), [text])

  return (
    <div>
      <Input value={text} onChange={setText} placeholder="#0369a1 / rgb(3,105,161) / hsl(199,96%,32%)" mono />
      {c && !c.ok ? <Note kind="error">{c.error}</Note> : null}
      {c && c.ok ? (
        <>
          <div
            className="dtb-swatch"
            style={{ background: c.cssRgb, color: c.contrastText }}
          >
            Aa 渲染预览
          </div>
          <div className="dtb-caselist">
            {[
              ['HEX', c.hex ?? ''],
              ['RGB', c.cssRgb ?? ''],
              ['HSL', c.cssHsl ?? ''],
            ].map(([label, value]) => (
              <div className="dtb-caserow" key={label}>
                <span className="dtb-casealg">{label}</span>
                <span className="dtb-mono dtb-caseval">{value}</span>
                <CopyBtn text={value} />
              </div>
            ))}
          </div>
          <p className="dtb-dim">
            RGB {c.rgb!.r}, {c.rgb!.g}, {c.rgb!.b} · HSL {c.hsl!.h}°, {c.hsl!.s}%, {c.hsl!.l}% · 相对亮度{' '}
            {c.luminance!.toFixed(3)}（对比文字色 {c.contrastText}）
          </p>
        </>
      ) : null}
      <Note kind="info">支持 #rgb #rrggbb #rrggbbaa、rgb()/rgba()、hsl()/hsla()；HSL 往返允许 ±1 的 8-bit 量化漂移。</Note>
    </div>
  )
}
