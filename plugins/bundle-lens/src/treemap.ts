/**
 * treemap.ts —— 面板侧 squarified treemap 布局（与 shared/core.js 同算法）
 * 服务返回面积数据（bytes），布局依赖容器像素尺寸，只能在渲染侧算。
 */

export interface TreemapItem { key: string; value: number }
export interface TreemapRect { key: string; value: number; x: number; y: number; w: number; h: number }

export function treemapLayout(items: TreemapItem[], x: number, y: number, w: number, h: number): TreemapRect[] {
  const sorted = items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((a, b) => a + b.value, 0)
  const out: TreemapRect[] = []
  if (total <= 0 || w <= 0 || h <= 0 || sorted.length === 0) return out
  const scale = (w * h) / total
  let cx = x
  let cy = y
  let cw = w
  let ch = h
  let i = 0
  const row: TreemapItem[] = []
  const worst = (r: TreemapItem[], side: number): number => {
    const s = r.reduce((a, b) => a + b.value, 0) * scale
    const max = Math.max(...r.map((it) => it.value * scale))
    const min = Math.min(...r.map((it) => it.value * scale))
    const s2 = s * s
    const side2 = side * side
    return Math.max((side2 * max) / s2, s2 / (side2 * min))
  }
  while (i < sorted.length) {
    const side = Math.min(cw, ch)
    row.push(sorted[i])
    while (i + 1 < sorted.length) {
      const next = [...row, sorted[i + 1]]
      if (worst(next, side) <= worst(row, side)) { row.push(sorted[i + 1]); i++ } else break
    }
    const rowSum = row.reduce((a, b) => a + b.value, 0) * scale
    const thick = rowSum / side
    let off = 0
    for (const it of row) {
      const len = (it.value * scale) / thick
      if (cw >= ch) out.push({ key: it.key, value: it.value, x: cx, y: cy + off, w: thick, h: len })
      else out.push({ key: it.key, value: it.value, x: cx + off, y: cy, w: len, h: thick })
      off += len
    }
    if (cw >= ch) { cx += thick; cw -= thick } else { cy += thick; ch -= thick }
    row.length = 0
    i++
  }
  return out
}
