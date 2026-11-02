// 颜色转换 —— HEX(#rgb/#rrggbb/#rrggbbaa) / rgb() / hsl() 三向互转 + 预览参数
// 全部为标准公式（HSL↔RGB 用 CSS 规范算法），输出供 UI 直接展示与 Swatch 着色

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Hsl {
  h: number
  s: number
  l: number
}

export interface ParsedColor {
  ok: boolean
  error?: string
  hex?: string
  rgb?: Rgb
  hsl?: Hsl
  cssRgb?: string
  cssHsl?: string
  /** 相对亮度（WCAG），用于给出黑/白对比文字色 */
  luminance?: number
  contrastText?: '#000000' | '#ffffff'
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360 / 360
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  if (sn === 0) {
    const v = Math.round(ln * 255)
    return { r: v, g: v, b: v }
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const hue = (t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return {
    r: Math.round(hue(hn + 1 / 3) * 255),
    g: Math.round(hue(hn) * 255),
    b: Math.round(hue(hn - 1 / 3) * 255),
  }
}

function relLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function parseColor(input: string): ParsedColor {
  const raw = input.trim().toLowerCase()
  if (raw === '') return { ok: false, error: '输入为空' }
  let rgb: Rgb | null = null
  const hexMatch = raw.match(/^#([0-9a-f]{3,8})$/)
  if (hexMatch) {
    const h = hexMatch[1]
    if (h.length === 3 || h.length === 4) {
      rgb = {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
      }
    } else if (h.length === 6 || h.length === 8) {
      rgb = {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      }
    } else {
      return { ok: false, error: `HEX 位数非法（3/4/6/8 位）：#${h}` }
    }
  } else {
    const rgbMatch = raw.match(/^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/)
    if (rgbMatch) {
      rgb = { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) }
    } else {
      const hslMatch = raw.match(/^hsla?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})%?\s*[,\s]\s*(\d{1,3})%?/)
      if (hslMatch) {
        const hsl = { h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) }
        rgb = hslToRgb(hsl)
        return buildResult(rgb, hsl)
      }
    }
  }
  if (!rgb) return { ok: false, error: '无法识别的颜色格式（支持 #rgb #rrggbb #rrggbbaa、rgb()、hsl()）' }
  if (rgb.r > 255 || rgb.g > 255 || rgb.b > 255) return { ok: false, error: 'RGB 分量须在 0-255' }
  return buildResult(rgb, rgbToHsl(rgb))
}

function buildResult(rgb: Rgb, hsl: Hsl): ParsedColor {
  const hex = `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  const luminance = relLuminance(rgb)
  return {
    ok: true,
    hex,
    rgb,
    hsl,
    cssRgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    cssHsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    luminance,
    contrastText: luminance > 0.35 ? '#000000' : '#ffffff',
  }
}
