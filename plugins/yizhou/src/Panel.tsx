/**
 * 双语阅读面板：书架（库）+ 阅读器（双语/译文/原文三态）
 *
 * 数据源：cap.kv yz.* 键空间（经宿主 invoke → router_dispatch）。
 * 面板零外网、零服务进程——正文与译文由 MCP 进程（AI 对话流）写入，面板只读 art 块；
 * 面板写：阅读进度（yz.pos.<id>）、外观设置（yz.settings）、书架删除（yz.idx 重写 +
 * art 块清理）。idx 的写者因此有两个（MCP 登记/存译文、面板删文）——同一用户低并发、
 * 读并改写窗口毫秒级，与 maian 面板/MCP 双写成员键同一风险档，键空间契约如实注明。
 *
 * 轮询：可见时每 5s（书架读 idx 单键；阅读器重读分块并按译文指纹去重渲染），
 * 后台/隐藏时自动暂停。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as core from '../shared/core'
import {
  DEFAULT_SETTINGS, fmtDate, loadArticle, loadLibrary, loadPos, loadSettings,
  metaLine, savePos, saveSettings, type IdxEntry, type ReaderPos, type Seg, type Settings,
} from './model'
import { capDispatch, getHostInvoke } from './host'

const css = `
.yz-root{position:relative;font:13px/1.6 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.yz-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.yz-body{flex:1;overflow-y:auto;padding:0 0 28px}
.yz-body::-webkit-scrollbar{width:9px;height:9px}
.yz-body::-webkit-scrollbar-track{background:transparent}
.yz-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.yz-page{max-width:720px;margin:0 auto;padding:0 16px}

/* 头部 */
.yz-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;background:linear-gradient(180deg,#10141C 78%,rgba(16,20,28,0))}
.yz-top-in{max-width:720px;margin:0 auto;display:flex;align-items:center;gap:10px}
.yz-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#4EA8DE,#3FB6A8);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.yz-tt{flex:1;min-width:0}
.yz-tt b{font-size:15px}
.yz-tt span{display:block;font-size:11px;color:#8A93A6;margin-top:1px}
.yz-count{font-size:11px;color:#8A93A6;border:1px solid #2a3040;border-radius:999px;padding:2px 9px;flex-shrink:0}

/* 书架 */
.yz-search{width:100%;background:#161B26;border:1px solid #232936;border-radius:10px;color:#E6EAF2;padding:8px 12px;font-size:13px;outline:none;margin-bottom:12px}
.yz-search:focus{border-color:#33507a}
.yz-card{background:#161B26;border:1px solid #232936;border-radius:12px;padding:12px 14px;margin-bottom:10px;cursor:pointer;transition:border-color .15s}
.yz-card:hover{border-color:#33507a}
.yz-card-t{font-size:14px;font-weight:600;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.yz-card-m{font-size:11.5px;color:#8A93A6;margin-top:5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.yz-card-date{margin-left:auto}
.yz-bar{height:4px;background:#232936;border-radius:2px;margin-top:9px;overflow:hidden}
.yz-bar-in{height:100%;border-radius:2px;background:linear-gradient(90deg,#4EA8DE,#3FB6A8);transition:width .3s}
.yz-bar-full{background:#3FB6A8}
.yz-del{background:none;border:none;color:#5d6877;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:6px;flex-shrink:0}
.yz-del:hover{color:#F87171;background:#241a1e}
.yz-del.confirm{color:#F87171;font-weight:600}

/* 空态 */
.yz-empty{text-align:center;padding:52px 20px 20px;color:#8A93A6}
.yz-empty-g{font-size:44px;margin-bottom:10px;filter:saturate(.85)}
.yz-empty h3{color:#E6EAF2;font-size:15px;margin:0 0 14px}
.yz-steps{text-align:left;max-width:430px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
.yz-step{background:#161B26;border:1px solid #232936;border-radius:10px;padding:10px 13px;font-size:12.5px;line-height:1.55}
.yz-step b{color:#4EA8DE;margin-right:6px}
.yz-cmd{font-family:ui-monospace,Consolas,monospace;background:#10151f;border:1px solid #232936;border-radius:8px;padding:8px 11px;margin:10px auto 0;max-width:460px;font-size:12px;color:#9fd0ef;cursor:pointer;text-align:left}
.yz-cmd:hover{border-color:#33507a}
.yz-hint{font-size:11px;color:#5d6877;margin-top:12px}

/* 阅读器顶栏 */
.yz-rbar{position:sticky;top:0;z-index:21;background:#10141C;border-bottom:1px solid #1d2330;padding:8px 12px;display:flex;align-items:center;gap:8px}
.yz-back{background:none;border:none;color:#8A93A6;cursor:pointer;font-size:13px;padding:5px 8px;border-radius:8px;flex-shrink:0}
.yz-back:hover{color:#E6EAF2;background:#161B26}
.yz-rtitle{flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yz-seg{display:flex;background:#161B26;border:1px solid #232936;border-radius:9px;padding:2px;flex-shrink:0}
.yz-seg button{background:none;border:none;color:#8A93A6;font-size:11.5px;padding:4px 10px;border-radius:7px;cursor:pointer}
.yz-seg button.on{background:#24304a;color:#CFE4FF}
.yz-fbtn{background:#161B26;border:1px solid #232936;color:#8A93A6;border-radius:8px;font-size:12px;padding:4px 9px;cursor:pointer;flex-shrink:0}
.yz-fbtn:hover{color:#E6EAF2;border-color:#33507a}

/* 阅读区 */
.yz-rbody{padding:18px 0 40px}
.yz-banner{max-width:720px;margin:0 auto 16px;padding:0 16px}
.yz-banner-in{background:#1d2330;border:1px solid #2c3a55;border-radius:10px;padding:9px 13px;font-size:12.5px;color:#cfe0f5;display:flex;align-items:center;gap:9px;min-width:0}
.yz-banner-cmd{font-family:ui-monospace,Consolas,monospace;color:#9fd0ef;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yz-blk{margin:0 0 18px}
.yz-src{color:#828da1;font-size:.86em;white-space:pre-wrap;word-break:break-word}
.yz-dst{color:#E8ECF4;white-space:pre-wrap;word-break:break-word;margin-top:5px}
.yz-blk.h .yz-dst,.yz-blk.h .yz-src{font-weight:700;line-height:1.4}
.yz-blk.li .yz-dst,.yz-blk.li .yz-src{display:block;padding-left:14px;position:relative}
.yz-blk.li .yz-src::before,.yz-blk.li .yz-dst::before{content:'·';color:#4EA8DE;font-weight:700;position:absolute;left:2px}
.yz-blk.quote{border-left:3px solid #2c3a55;padding-left:11px}
.yz-blk.code .yz-src,.yz-blk.code .yz-dst{font-family:ui-monospace,Consolas,monospace;font-size:.82em;background:#10151f;border:1px solid #1d2330;border-radius:9px;padding:10px 12px;overflow-x:auto;white-space:pre;margin-top:0}
.yz-missing{color:#56617a;font-size:.9em;border:1px dashed #2a3346;border-radius:8px;padding:4px 10px;display:inline-block;margin-top:5px}

/* 底部信息条 */
.yz-foot{max-width:720px;margin:8px auto 0;padding:0 16px;font-size:11px;color:#56617a;text-align:center}
.yz-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#24304a;color:#CFE4FF;border:1px solid #33507a;border-radius:10px;padding:8px 16px;font-size:12.5px;z-index:99;box-shadow:0 6px 24px rgba(0,0,0,.45)}
.yz-err{max-width:720px;margin:30px auto;padding:0 16px}
.yz-err-in{background:#241a1e;border:1px solid #5a2a33;color:#f3b8bf;border-radius:10px;padding:12px 14px;font-size:12.5px;line-height:1.6}
`

const MODE_LABEL: Record<string, string> = { bilingual: '双语', dst: '译文', src: '原文' }
const POLL_MS = 5000
const POS_SAVE_DEBOUNCE_MS = 800
const HEADING_PX = [17, 16, 15, 14, 13.5, 13]

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch (_) { return false }
}

/** 阅读块：一个段（src/dst 按 mode 与翻译状态渲染；标记前缀由 CSS 视觉替代） */
function Block(props: {
  seg: Seg
  mode: Settings['mode']
  scale: number
  complete: boolean
  registerEl: (i: number, el: HTMLDivElement | null) => void
}) {
  const { seg, mode, scale, complete, registerEl } = props
  const srcInfo = core.classifyBlock(seg.src)
  const dstInfo = seg.dst ? core.classifyBlock(seg.dst) : null
  const isCode = srcInfo.kind === 'code'
  const showSrc = mode === 'bilingual' || mode === 'src'
  const showDst = mode === 'bilingual' || mode === 'dst'
  const headStyle = srcInfo.kind === 'h'
    ? { fontSize: fontPx(scale, HEADING_PX[Math.min(5, (srcInfo.level || 1) - 1)]) }
    : undefined
  return (
    <div
      className={`yz-blk ${srcInfo.kind}`}
      data-i={seg.i}
      ref={(el) => registerEl(seg.i, el)}
      style={{ fontSize: fontPx(scale, 14) }}
    >
      {showSrc && <div className="yz-src" style={headStyle}>{isCode ? seg.src : srcInfo.body}</div>}
      {showDst && (seg.dst && dstInfo
        ? <div className="yz-dst" style={headStyle}>{isCode ? seg.dst : dstInfo.body}</div>
        : (!complete && !core.isCodeSeg(seg.src) && showDst
          ? <span className="yz-missing">未翻译</span>
          : null))}
    </div>
  )
}
function fontPx(scale: number, base: number) { return Math.round(base * scale) }

/** 书架视图 */
function Library(props: {
  entries: IdxEntry[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  err: string
}) {
  const { entries, onOpen, onDelete, err } = props
  const [q, setQ] = useState('')
  const [confirmId, setConfirmId] = useState('')
  const kw = q.trim().toLowerCase()
  const list = useMemo(() => (kw
    ? entries.filter((e) => `${e.title} ${e.site} ${e.url}`.toLowerCase().includes(kw))
    : entries), [entries, kw])

  return (
    <>
      <div className="yz-top">
        <div className="yz-top-in">
          <div className="yz-logo">译</div>
          <div className="yz-tt"><b>双语阅读</b><span>双语沉浸阅读 · 对话即入口</span></div>
          <div className="yz-count">{entries.length} 篇</div>
        </div>
      </div>
      <div className="yz-body">
        <div className="yz-page">
          {err ? <div className="yz-err" style={{ margin: '14px auto' }}><div className="yz-err-in">{err}</div></div> : null}
          {entries.length > 0 && (
            <input
              className="yz-search"
              placeholder="搜索标题 / 站点…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          {list.map((e) => {
            const pct = e.segCount ? Math.round(((e.translated || 0) / e.segCount) * 100) : 0
            return (
              <div key={e.id} className="yz-card" onClick={() => onOpen(e.id)}>
                <div className="yz-card-t">{e.title}</div>
                <div className="yz-card-m">
                  <span>{metaLine(e)}</span>
                  {e.truncated ? <span style={{ color: '#d9a441' }}>截断</span> : null}
                  <span className="yz-card-date">{fmtDate(e.addedAt)}</span>
                  <button
                    className={`yz-del${confirmId === e.id ? ' confirm' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      if (confirmId === e.id) { onDelete(e.id); setConfirmId('') } else setConfirmId(e.id)
                    }}
                  >{confirmId === e.id ? '确认删除' : '删'}</button>
                </div>
                <div className="yz-bar">
                  <div className={`yz-bar-in${pct >= 100 ? ' yz-bar-full' : ''}`} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            )
          })}
          {entries.length === 0 && !err && (
            <div className="yz-empty">
              <div className="yz-empty-g">⛵</div>
              <h3>把外文网页摆渡成双语读物</h3>
              <div className="yz-steps">
                <div className="yz-step"><b>1</b>对 AI 说一句话（点击复制）：</div>
                <div
                  className="yz-cmd"
                  onClick={() => { copyText('帮我把这篇翻译成中英对照：') }}
                >
                  帮我把这篇翻译成中英对照：&lt;粘贴链接&gt;
                </div>
                <div className="yz-step"><b>2</b>AI 抓取、分段、逐批翻译（可断点续译）。</div>
                <div className="yz-step"><b>3</b>回到这里阅读——双语对照、三端同步、译文可被 AI 引用。</div>
              </div>
              <div className="yz-hint">仅支持公网 http(s) 网页；JS 动态页可能抓不到正文（会如实报错）</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** 阅读器视图 */
function Reader(props: {
  entry: IdxEntry
  onBack: () => void
}) {
  const { entry, onBack } = props
  const [segs, setSegs] = useState<Seg[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const elMap = useRef<Map<number, HTMLDivElement>>(new Map())
  const posRef = useRef<ReaderPos | null>(null)
  const restoredRef = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const fpRef = useRef('')

  const complete = segs.length > 0 && segs.every((s) => s.dst || core.isCodeSeg(s.src))

  const registerEl = useCallback((i: number, el: HTMLDivElement | null) => {
    if (el) elMap.current.set(i, el)
    else elMap.current.delete(i)
  }, [])

  const showToast = useCallback((label: string) => {
    setToast(label)
    window.setTimeout(() => setToast(''), 1800)
  }, [])

  // 初始装载：设置 + 进度 + 段落
  useEffect(() => {
    let alive = true
    restoredRef.current = false
    ;(async () => {
      const [s, pos] = await Promise.all([loadSettings(), loadPos(entry.id)])
      if (!alive) return
      setSettings(s)
      posRef.current = pos
      const arr = await loadArticle(entry.id, entry.segCount)
      if (!alive) return
      setSegs(arr)
      setLoading(false)
      fpRef.current = fpOf(arr)
    })()
    return () => { alive = false }
  }, [entry.id, entry.segCount])

  // 轮询：AI 在对话里续译后，这里刷新（译文指纹变化才重渲染）
  useEffect(() => {
    const t = window.setInterval(async () => {
      if (document.visibilityState !== 'visible' || loading) return
      const arr = await loadArticle(entry.id, entry.segCount)
      const fp = fpOf(arr)
      if (fp !== fpRef.current) {
        fpRef.current = fp
        setSegs(arr)
      }
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [entry.id, entry.segCount, loading])

  // 恢复阅读位置（首渲染后一次）
  useEffect(() => {
    if (loading || restoredRef.current) return
    restoredRef.current = true
    const pos = posRef.current
    const body = bodyRef.current
    if (!pos || !body || !pos.segIdx) return
    requestAnimationFrame(() => {
      const el = elMap.current.get(pos.segIdx)
      if (el) body.scrollTo({ top: Math.max(0, el.offsetTop - 70) })
    })
  }, [loading, segs.length])

  // 滚动 → 进度保存（去抖）
  const onScroll = useCallback(() => {
    const body = bodyRef.current
    if (!body || loading) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const sc = body.scrollTop
      const max = body.scrollHeight - body.clientHeight
      const pct = max > 0 ? Math.round((sc / max) * 100) : 100
      let segIdx = 0
      for (const [i, el] of elMap.current) {
        if (el.offsetTop <= sc + 90 && i > segIdx) segIdx = i
      }
      const next: ReaderPos = { segIdx, pct, at: new Date().toISOString() }
      posRef.current = next
      savePos(entry.id, next).catch(() => {})
    }, POS_SAVE_DEBOUNCE_MS)
  }, [entry.id, loading])

  const applySettings = useCallback((next: Settings) => {
    setSettings(next)
    saveSettings(next).catch(() => {})
  }, [])

  const remain = segs.filter((s) => !s.dst && !core.isCodeSeg(s.src)).length
  const exportMd = useMemo(() => (segs.length
    ? core.bilingualMarkdown(entry, segs, settings.mode === 'src' ? 'src' : 'bilingual')
    : ''), [entry, segs, settings.mode])

  return (
    <>
      <div className="yz-rbar">
        <button className="yz-back" onClick={onBack}>‹ 书架</button>
        <div className="yz-rtitle" title={entry.title}>{entry.title}</div>
        <div className="yz-seg">
          {(['bilingual', 'dst', 'src'] as const).map((m) => (
            <button key={m} className={settings.mode === m ? 'on' : ''} onClick={() => applySettings({ ...settings, mode: m })}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <button className="yz-fbtn" title="减小字号" onClick={() => applySettings({ ...settings, fontScale: Math.max(0.8, Math.round((settings.fontScale - 0.1) * 10) / 10) })}>A-</button>
        <button className="yz-fbtn" title="增大字号" onClick={() => applySettings({ ...settings, fontScale: Math.min(1.6, Math.round((settings.fontScale + 0.1) * 10) / 10) })}>A+</button>
        <button className="yz-fbtn" title="复制当前形态的 Markdown" onClick={() => { copyText(exportMd).then((ok2) => showToast(ok2 ? '已复制 Markdown' : '剪贴板不可用')) }}>复制</button>
      </div>
      <div className="yz-body" ref={bodyRef} onScroll={onScroll}>
        {remain > 0 && (
          <div className="yz-banner">
            <div className="yz-banner-in">
              <span style={{ flexShrink: 0 }}>还剩 {remain} 段未译，对 AI 说</span>
              <span
                className="yz-banner-cmd"
                onClick={() => { copyText(`继续翻译《${entry.title}》`).then((ok2) => showToast(ok2 ? '已复制指令' : '剪贴板不可用')) }}
                title="点击复制"
              >
                「继续翻译《{entry.title}》」
              </span>
            </div>
          </div>
        )}
        <div className="yz-page">
          <div className="yz-rbody">
            {segs.map((s) => (
              <Block key={s.i} seg={s} mode={settings.mode} scale={settings.fontScale} complete={complete} registerEl={registerEl} />
            ))}
            {!loading && !segs.length && (
              <div className="yz-empty"><div className="yz-empty-g">🛶</div><h3>段落为空</h3><div className="yz-hint">数据可能被清理，可让 AI 重新抓取该 URL</div></div>
            )}
          </div>
          <div className="yz-foot">
            {entry.site} · {fmtDate(entry.addedAt)} · {segs.length} 段 · 译 {segs.length ? core.progressPct(segs) : 0}%
            {entry.truncated ? ' · 原文超长已截断' : ''}
          </div>
        </div>
      </div>
      {toast ? <div className="yz-toast">{toast}</div> : null}
    </>
  )
}

function fpOf(arr: Seg[]) { return `${core.translatedCount(arr)}/${arr.length}` }

/** 最近一次书架快照（onDelete 用它拿 segCount 决定清理范围；refresh 时更新） */
const lastEntries = new Map<string, IdxEntry>()

export default function YizhouPanel() {
  const [entries, setEntries] = useState<IdxEntry[]>([])
  const [openId, setOpenId] = useState('')
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)

  // 宿主通道可用性（缺失时给出可行动的错误）
  useEffect(() => {
    try { getHostInvoke(); setReady(true) } catch (e) { setErr((e as Error).message) }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const list = await loadLibrary()
      lastEntries.clear()
      for (const e of list) lastEntries.set(e.id, e)
      setEntries(list)
      setErr('')
    } catch (e) {
      setErr(`加载书架失败：${(e as Error).message}`)
    }
  }, [])

  // 可见时轮询（书架单键读）；打开阅读器时暂停书架刷新（阅读器有自己的轮询）
  useEffect(() => {
    if (!ready) return
    refresh()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !openId) refresh()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [ready, refresh, openId])

  const entry = useMemo(() => entries.find((e) => e.id === openId) || null, [entries, openId])

  /** 书架删除：清理该文全部 art 块 + pos + 重写 idx（与 MCP 删除同款语义，幂等） */
  const onDelete = useCallback(async (id: string) => {
    const cur = lastEntries.get(id)
    const segCount = cur ? cur.segCount : 0
    const n = core.chunkCount(Math.max(0, segCount)) + 1
    const keys: string[] = [`yz.pos.${id}`]
    for (let c = 0; c < n; c++) keys.push(`yz.art.${id}.p.${c}`)
    await Promise.all(keys.map((k) => capDispatch('cap.kv', { action: 'delete', key: k }).catch(() => {})))
    // idx 读并改写（双写者契约见文件头注释）；空库时整键删除（与 MCP 同款卫生）
    const idx = await loadLibrary()
    const rest = idx.filter((e) => e.id !== id)
    if (rest.length) await capDispatch('cap.kv', { action: 'set', key: 'yz.idx', value: rest }).catch(() => {})
    else await capDispatch('cap.kv', { action: 'delete', key: 'yz.idx' }).catch(() => {})
    await refresh()
  }, [refresh])

  return (
    <div className="yz-root">
      <style>{css}</style>
      {err && !entries.length && !openId ? (
        <div className="yz-err"><div className="yz-err-in">{err}</div></div>
      ) : entry ? (
        <Reader entry={entry} onBack={() => setOpenId('')} />
      ) : (
        <Library entries={entries} onOpen={setOpenId} onDelete={onDelete} err={err} />
      )}
    </div>
  )
}
