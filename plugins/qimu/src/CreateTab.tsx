/**
 * 创作 Tab：大纲 DSL 编辑器 + 主题选择 + 实时几何预览 + 本地构建下载
 * 预览与成品同源：core.layout() 的几何盒直接映射为 HTML 绝对定位元素；
 * 图表/表格用 HTML 近似呈现（明示：原生图表以 PowerPoint/WPS 渲染为准）。
 */
import { useMemo, useState } from 'react'
import type { Tab, Toast, TabProps } from './Panel'
import {
  THEMES, THEME_KEYS, CAPS, normalizeDeck, layout, parseOutline, buildAndDownload,
  registerLocalBuild, cssColor,
  type Deck, type ThemeToken, type GeoPage, type GeoBox,
} from './model'

const DEFAULT_DSL = `@title 年度经营汇报
@subtitle 2026 全年总结与 2027 规划
@author 经营管理部
@theme midnight

# 第一部分 | 全年回顾

## 核心成果
- 营收同比增长 32%，超额完成年度目标
- 新客户::新签 120 家，KA 18 家，续约率 91%
- 交付::三个大版本按期上线，故障率下降 45%

## 增长归因
[L] 做深存量
- KA 续约与增购
- 交付效率提升
[R] 做大增量
- 渠道下沉
- 海外试点启动

# 第二部分 | 数据透视

%bar|季度收入（万元）|Q1,Q2,Q3,Q4|收入:820,910,1050,1218|利润:171,193,226,268

|区域,收入(万),同比,达成
|华东,1842,+31%,108%
|华北,1105,+22%,96%
|华南,986,+40%,112%

> 质量是最好的增长策略——省下的返工时间，就是最大的利润空间。| Q4 复盘共识

=== 谢谢观看 · 欢迎交流`

/** 单页预览：几何盒 → HTML 绝对定位 */
function SlideView({ page, theme, width, pageNum }: { page: GeoPage; theme: ThemeToken; width: number; pageNum: number }) {
  const scale = width / 13.333
  const height = Math.round(7.5 * scale)
  const fontOf = (b: GeoBox) => (b.fontKey ? (theme as unknown as Record<string, string>)[b.fontKey] || theme.bodyFont : theme.bodyFont)
  const resolve = (token?: string) => cssColor(theme, token)
  return (
    <div className="qm-slide" style={{ width, height, background: theme.dark ? `#${theme.bg}` : `#${theme.bg}` }}>
      {page.boxes.map((b, i) => {
        const st: React.CSSProperties = { left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale }
        if (b.k === 'rect') {
          return (
            <div key={i} style={{
              ...st, background: resolve(b.fill), opacity: b.transparency != null ? 1 - b.transparency / 100 : 1,
              borderRadius: b.shape === 'ellipse' ? '50%' : Math.max(1, scale * 0.03),
            }} />
          )
        }
        if (b.k === 'text') {
          return (
            <div key={i} style={{
              ...st, color: b.transparency != null ? resolve(b.color) : resolve(b.color),
              opacity: b.transparency != null ? 1 - b.transparency / 100 : 1,
              fontSize: (b.fontSize || 12) * scale, lineHeight: 1.32, fontWeight: b.bold ? 700 : 400,
              fontFamily: fontOf(b), textAlign: (b.align as 'left' | 'center' | 'right') || 'left',
              display: 'flex', flexDirection: 'column', justifyContent: b.valign === 'middle' ? 'center' : 'flex-start',
            }}>{b.text}</div>
          )
        }
        if (b.k === 'chart') {
          const c = b.chart!
          const colors = (b.colors || []).map((t) => `#${theme[t as keyof ThemeToken] || t}`)
          if (c.kind === 'pie') {
            const total = c.series[0].values.reduce((s2, v) => s2 + v, 0) || 1
            let acc = 0
            const stops = c.series[0].values.map((v, j) => {
              const from = (acc / total) * 100
              acc += v
              const to = (acc / total) * 100
              return `${colors[j % colors.length]} ${from}% ${to}%`
            }).join(', ')
            return (
              <div key={i} style={{ ...st, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ width: height * 0.52, height: height * 0.52, borderRadius: '50%', background: `conic-gradient(${stops})` }} />
                <div style={{ position: 'static', fontSize: Math.max(7, 9 * scale), color: resolve('sub') }}>
                  {c.labels.map((l, j) => (
                    <div key={j} style={{ position: 'static', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i style={{ position: 'static', width: 6, height: 6, borderRadius: 2, background: colors[j % colors.length] }} />{l}
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          const max = Math.max(...c.series.flatMap((sr) => sr.values), 1)
          return (
            <div key={i} style={{ ...st, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: `0 ${4 * scale}px`, borderBottom: `1px solid ${resolve('hairline')}` }}>
              {c.labels.map((label, li) => (
                <div key={li} style={{ position: 'static', display: 'flex', alignItems: 'flex-end', gap: 2, height: '86%', minWidth: 8 }}>
                  {c.series.map((sr, si) => (
                    <div key={si} title={label} style={{
                      position: 'static', width: Math.max(4, 26 / c.series.length * scale), height: `${(sr.values[li] / max) * 100}%`,
                      background: colors[si % colors.length], borderRadius: '2px 2px 0 0', opacity: 0.92,
                    }} />
                  ))}
                </div>
              ))}
            </div>
          )
        }
        if (b.k === 'table') {
          const tb = b.table!
          return (
            <div key={i} style={{ ...st, display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', display: 'flex', background: resolve(b.headerFill), height: (b.rowH || 0.6) * scale }}>
                {tb.head.map((h, j) => (
                  <div key={j} style={{ position: 'static', flex: 1, color: `#${b.onAccent}`, fontSize: Math.max(6, 11 * scale), fontWeight: 700, padding: `${3 * scale}px ${4 * scale}px`, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>{h}</div>
                ))}
              </div>
              {tb.rows.map((row, ri) => (
                <div key={ri} style={{ position: 'relative', display: 'flex', background: resolve(ri % 2 === 1 ? b.zebra : 'bgAlt'), height: (b.rowH || 0.6) * scale, borderTop: `1px solid ${resolve(b.hairline)}` }}>
                  {row.map((cell, ci) => (
                    <div key={ci} style={{ position: 'static', flex: 1, color: resolve('text'), fontSize: Math.max(6, 10.5 * scale), padding: `${3 * scale}px ${4 * scale}px`, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>{cell}</div>
                  ))}
                </div>
              ))}
            </div>
          )
        }
        return null
      })}
      <div style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 7, color: resolve('sub'), opacity: 0.7 }}>{pageNum}</div>
    </div>
  )
}

const DSL_HELP = `语法：@theme/@title/@subtitle/@author 设元信息 · # 章节页（|副注） · ## 内容页
- 要点（小标题::说明 可选） · [L]/[R] 双栏 · > 引言（|署名）
%bar|标题|标签1,标签2|系列A:1,2 图表（bar/line/pie） · |表头,行… 表格 · === 结束语`

export default function CreateTab({ settings, reload, showToast, goTab }: TabProps & { goTab: (t: Tab) => void }) {
  const [dsl, setDsl] = useState(DEFAULT_DSL)
  const [building, setBuilding] = useState(false)

  const parsed = useMemo(() => parseOutline(dsl), [dsl])
  const built = useMemo(() => {
    if (!parsed.spec) return { error: parsed.errors?.join('\n') || '', deck: null as Deck | null, warnings: [] as string[], geo: null }
    const r = normalizeDeck(parsed.spec)
    if (r.error || !r.deck) return { error: r.error || '', deck: null, warnings: [], geo: null }
    return { error: '', deck: r.deck, warnings: r.warnings || [], geo: layout(r.deck) }
  }, [parsed])

  const activeTheme = THEMES[built.deck?.theme || settings?.theme || 'midnight'] || THEMES.midnight

  const build = async () => {
    if (!built.deck) return
    setBuilding(true)
    try {
      const r = await buildAndDownload(built.deck)
      if (!r.ok) { showToast(`构建失败：${r.error}`, 'bad'); return }
      await registerLocalBuild(built.deck, r.file!)
      await reload()
      showToast(`已构建 ${built.deck.slides.length} 页 · ${r.file}（浏览器下载）`, 'good')
    } finally {
      setBuilding(false)
    }
  }

  const themeOfDeck = built.deck?.theme || settings?.theme || 'midnight'

  const pickTheme = (k: string) => {
    // 把 @theme 行替换/插入到顶部
    const lines = dsl.split(/\r?\n/)
    const idx = lines.findIndex((l) => l.trim().startsWith('@theme'))
    if (idx >= 0) lines[idx] = `@theme ${k}`
    else lines.unshift(`@theme ${k}`)
    setDsl(lines.join('\n'))
  }

  return (
    <>
      <div className="qm-sec"><i className="qm-bar" />主题<span className="qm-hint">预览与成品同源（同一布局引擎）</span></div>
      <div className="qm-card"><div className="qm-card-b">
        <div className="qm-row">
          {THEME_KEYS.map((k) => {
            const t = THEMES[k]
            return (
              <button key={k} className={`qm-theme-chip ${themeOfDeck === k ? 'on' : ''}`} onClick={() => pickTheme(k)}>
                <span className="qm-dot" style={{ background: `#${t.accent}`, boxShadow: `inset 0 0 0 2px #${t.bg}` }} />
                {t.label}{t.dark ? '' : ' · 浅'}
              </button>
            )
          })}
        </div>
      </div></div>

      <div className="qm-sec"><i className="qm-bar" />大纲<span className="qm-hint">对话里让 AI 走 ppt_build 可落盘桌面；这里本地构建走浏览器下载</span></div>
      <div className="qm-card"><div className="qm-card-b">
        <textarea
          className="qm-textarea"
          value={dsl}
          spellCheck={false}
          onChange={(e) => setDsl(e.target.value)}
          placeholder={DSL_HELP}
        />
        <div className="qm-sub" style={{ marginTop: 6 }}>{DSL_HELP}</div>
        {built.error && <div className="qm-err">⚠️ 大纲问题（逐行修正即可，解析不中断）：{'\n'}{built.error}</div>}
        {!built.error && built.warnings.length > 0 && <div className="qm-err" style={{ borderColor: '#54401E', color: '#F2C063', background: '#2A2114' }}>{built.warnings.join('；')}</div>}
        {!built.error && built.deck && (
          <div className="qm-row" style={{ marginTop: 10 }}>
            <button className="qm-btn" disabled={building} onClick={() => void build()}>
              {building ? '构建中…' : `⬇ 构建并下载 PPTX（${built.deck.slides.length} 页）`}
            </button>
            <span className="qm-sub">共 {built.deck.slides.length} 页 · {activeTheme.label} · 容量护栏：要点 ≤{CAPS.bulletsCount}/页、图表 ≤{CAPS.chartLabels} 类别</span>
          </div>
        )}
      </div></div>

      <div className="qm-sec"><i className="qm-bar" />预览<span className="qm-hint">同一几何模型；原生图表在 PowerPoint/WPS 中渲染更精细</span></div>
      <div className="qm-card"><div className="qm-card-b">
        {!built.geo && <div className="qm-empty">修正大纲问题后，这里会出现逐页预览</div>}
        {built.geo && (
          <div className="qm-pages">
            {built.geo.pages.map((p, i) => (
              <div key={i}>
                <SlideView page={p} theme={activeTheme} width={252} pageNum={i + 1} />
                <div style={{ textAlign: 'center', fontSize: 9.5, color: '#5C6678', marginTop: 3 }}>
                  {i + 1} · {{ cover: '封面', section: '章节', bullets: '要点', two: '双栏', quote: '引言', chart: '图表', table: '表格', end: '结尾' }[p.type] || p.type}
                </div>
              </div>
            ))}
          </div>
        )}
      </div></div>

      <div style={{ textAlign: 'center', padding: '2px 0 10px' }}>
        <button className="qm-btn ghost sm" onClick={() => goTab('works')}>查看已生成的作品 →</button>
      </div>
    </>
  )
}
