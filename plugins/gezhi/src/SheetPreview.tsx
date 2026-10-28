/**
 * 表格预览：只消费 layout() 输出的几何（列宽/格式/汇总行），HTML 近似还原 Excel 成品。
 * 明示「预览≈成品」：样式近似，但结构（列序/类型格式/汇总行/斑马）与成品一致。
 */
import { useMemo } from 'react'
import type { core as CoreNS } from './model'

function fmtPreview(v: unknown, col: CoreNS.LayoutColumn): { text: string, isFormula: boolean } {
  if (v == null || v === '') return { text: '', isFormula: false }
  if (typeof v === 'string' && v.startsWith('=')) return { text: v, isFormula: true }
  if (v instanceof Date) return { text: v.toISOString().slice(0, 10), isFormula: false }
  if (typeof v === 'number') {
    if (col.type === 'percent') return { text: `${(v * 100).toFixed(1)}%`, isFormula: false }
    if (col.type === 'money') return { text: v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), isFormula: false }
    if (col.type === 'int') return { text: String(Math.round(v)), isFormula: false }
    const s = String(v)
    return { text: s.length > 12 ? v.toPrecision(8) : s, isFormula: false }
  }
  return { text: String(v), isFormula: false }
}

export default function SheetPreview({ g, sheetIdx, maxRows = 8 }: {
  g: CoreNS.LayoutResult
  sheetIdx: number
  maxRows?: number
}) {
  const sh = g.sheets[sheetIdx]
  const t = g.themes

  const rows = useMemo(() => {
    const show = sh.rows.slice(0, maxRows)
    return show.map((r) => r.map((v, ci) => fmtPreview(v, sh.columns[ci])))
  }, [sh, maxRows])

  const more = sh.rows.length - rows.length

  return (
    <div style={{ borderRadius: 10, overflow: 'auto', border: `1px solid ${t.border}` }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5, background: '#fff', color: t.textColor }}>
        <tbody>
          {sh.caption && (
            <tr>
              <td colSpan={sh.colCount} style={{ padding: '6px 9px', fontWeight: 700, fontSize: 12, color: t.textColor, borderBottom: `1px solid ${t.border}` }}>
                {sh.caption}
              </td>
            </tr>
          )}
          <tr>
            {sh.columns.map((c, ci) => (
              <th key={ci} style={{
                background: t.headerFill, color: t.headerColor, fontWeight: 700,
                padding: '5px 9px', textAlign: 'center', whiteSpace: 'nowrap',
                border: `1px solid ${t.border}`, width: `${Math.min(100, (c.width / sh.columns.reduce((a, x) => a + x.width, 0)) * 100)}%`,
              }}>{c.h}</th>
            ))}
          </tr>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '4px 9px',
                  border: `1px solid ${t.border}`,
                  textAlign: cell.isFormula ? sh.columns[ci].align : (cell.text === '' ? 'left' : sh.columns[ci].align),
                  background: sh.zebra && ri % 2 === 1 ? t.zebraFill : '#fff',
                  whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
                  ...(cell.isFormula ? { color: t.subText, fontStyle: 'italic' } : {}),
                }}>{cell.text}</td>
              ))}
            </tr>
          ))}
          {sh.statsRows.map((st, si) => (
            <tr key={`s${si}`}>
              {st.cells.map((v, ci) => {
                const cell = fmtPreview(v, sh.columns[ci])
                return (
                  <td key={ci} style={{
                    padding: '4px 9px', border: `1px solid ${t.border}`, fontWeight: 700,
                    background: t.statsFill, color: t.textColor,
                    textAlign: cell.isFormula ? sh.columns[ci].align : 'left',
                    whiteSpace: 'nowrap',
                  }}>{cell.isFormula ? `${cell.text.slice(1)}` : cell.text}</td>
                )
              })}
            </tr>
          ))}
          {more > 0 && (
            <tr>
              <td colSpan={sh.colCount} style={{ padding: '4px 9px', color: t.subText, fontSize: 10.5, textAlign: 'center', border: `1px solid ${t.border}` }}>
                … 还有 {more} 行（成品全量包含）
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
