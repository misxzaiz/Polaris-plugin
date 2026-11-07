/**
 * 脱敏 Tab：粘贴/拖文件 → 本地实时脱敏 → 复制/下载/发送到 AI
 *
 * 粘贴流在面板本地执行（mask-core 已打进 bundle，数据不出本机进程）；
 * 台账增量经 debounce 落本机 kv（panel-session owner）。所有模式默认 partial。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as core from '../shared/mask-core.js'
import { maskLocal, type LoadedLedger, type MaskSettings } from './model'
import type { Toast } from './Panel'

const MAX_INPUT = 1024 * 1024
const PERSIST_DEBOUNCE_MS = 1200

interface Props {
  settings: MaskSettings
  salt: string
  ledger: LoadedLedger | null
  onSendToChat?: (m: string) => void | Promise<void>
  showToast: (text: string, kind?: 'ok' | 'bad') => void
  onPersist: (entries: (core.LedgerEntry & { fp: string })[]) => Promise<void>
  onLedgerChanged: () => void
  onSettingsChange: (s: MaskSettings) => Promise<void>
  onChanged: () => void
}

export default function MaskTab({ settings, salt, ledger, onSendToChat, showToast, onPersist, onLedgerChanged, onSettingsChange, onChanged }: Props) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<core.MaskResult | null>(null)
  const [dropOn, setDropOn] = useState(false)
  const [persistTimer] = useRef({ v: undefined as number | undefined }).current
  const ledgerMap = useMemo(() => ledger?.map ?? new Map<string, core.LedgerEntry>(), [ledger])

  const runMask = useCallback((text: string) => {
    if (!text.trim()) { setResult(null); return }
    try {
      const r = maskLocal(text, settings, salt || 'nosalt', ledgerMap)
      setResult(r)
      if (r.newEntries.length) {
        // 合并进内存台账 + debounce 落 kv
        for (const e of r.newEntries) ledgerMap.set(e.fp, { type: e.type, original: e.original, out: e.out, mode: e.mode, seq: e.seq, count: e.count, firstAt: e.firstAt })
        window.clearTimeout(persistTimer)
        persistTimer.v = window.setTimeout(() => {
          void onPersist(r.newEntries).then(() => onLedgerChanged())
        }, PERSIST_DEBOUNCE_MS)
      }
    } catch (e) {
      showToast(`脱敏失败：${String((e as Error).message || e)}`, 'bad')
    }
  }, [settings, salt, ledgerMap, onPersist, onLedgerChanged, showToast, persistTimer])

  // 输入防抖 400ms 自动脱敏
  useEffect(() => {
    const t = setTimeout(() => runMask(input), 400)
    return () => clearTimeout(t)
  }, [input, runMask])

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDropOn(false)
    const f = e.dataTransfer.files && e.dataTransfer.files[0]
    if (!f) return
    if (f.size > MAX_INPUT) { showToast(`文件 ${Math.round(f.size / 1024)}KB 超过 1MB 面板上限，请拆分或用「文件」页走服务`, 'bad'); return }
    try {
      const text = await f.text()
      setInput(text.slice(0, MAX_INPUT))
      showToast(`已读入 ${f.name}`)
    } catch (_) {
      showToast('文件读取失败', 'bad')
    }
  }, [showToast])

  const copyOut = useCallback(async () => {
    if (!result) return
    try { await navigator.clipboard.writeText(result.output); showToast('已复制脱敏结果') }
    catch (_) { showToast('复制失败（剪贴板不可用）', 'bad') }
  }, [result, showToast])

  const downloadOut = useCallback(() => {
    if (!result) return
    const blob = new Blob([result.output], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `masked-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [result])

  const sendToChat = useCallback(async () => {
    if (!result || !result.output.trim()) return
    if (!onSendToChat) { showToast('宿主不支持发送到会话', 'bad'); return }
    if (result.output.length > 200 * 1024) { showToast('脱敏结果超 200KB，请用复制/下载', 'bad'); return }
    try {
      await onSendToChat(`【已脱敏数据｜同原值同假名，映射台账在本机】\n\n${result.output}`)
      showToast('已发送到当前 AI 会话')
    } catch (e) {
      showToast(`发送失败：${String((e as Error).message || e)}`, 'bad')
    }
  }, [result, onSendToChat, showToast])

  const stats = result?.stats ?? {}
  const total = Object.values(stats).reduce((a, b) => a + b, 0)
  const typeOn = (t: string) => !(settings.types[t] && settings.types[t].on === false)
  const toggleType = useCallback((t: string) => {
    const cur = settings.types[t] || { on: true, mode: (core.TYPES[t]?.defaultMode || 'partial') as core.MaskMode }
    const next = { ...settings, types: { ...settings.types, [t]: { ...cur, on: !typeOn(t) } } }
    void onSettingsChange(next) // 提升到面板状态 + 落 kv，即时驱动重算
  }, [settings, onSettingsChange])

  const hitsShown = (result?.hits || []).slice(0, 60)
  const hitOverflow = (result?.hits.length || 0) - hitsShown.length

  return (
    <>
      <div className="dm-sec"><span className="dm-bar" />粘贴或拖入数据<span className="dm-hint">全本地执行 · 零上传</span></div>
      <div className="dm-card"><div className="dm-card-b">
        <div className="dm-io">
          <div>
            <div className="dm-lab"><span>原始数据（仅本面板可见）</span></div>
            <textarea
              className="dm-ta"
              placeholder={'粘贴日志 / JSON / CSV / SQL / 文本…\n例如：{"姓名":"张三","phone":"13800138000"}\n或直接把文件拖进这里'}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
              onDragOver={(e) => { e.preventDefault(); setDropOn(true) }}
              onDragLeave={() => setDropOn(false)}
              onDrop={(e) => void onDrop(e)}
            />
            <div className={`dm-drop ${dropOn ? 'on' : ''}`}>拖文件到上面即读入（≤1MB；大文件走「文件」页服务）</div>
          </div>
          <div>
            <div className="dm-lab"><span>脱敏结果（可直接外发）</span><span>{result ? `${total} 处已处理` : ''}</span></div>
            <div className="dm-out">{result ? result.output : <span style={{ color: '#4d5566' }}>脱敏结果将出现在这里</span>}</div>
          </div>
        </div>

        {Object.keys(stats).length > 0 && (
          <div className="dm-chips">
            {Object.entries(stats).map(([t, n]) => {
              const tt = core.TYPES[t]
              if (!tt) return null
              const needConfirm = tt.confirm
              return (
                <span key={t} className={`dm-chip ${typeOn(t) ? '' : 'off'}`}
                  title={`${tt.label}：点一下开/关该类型`}
                  onClick={() => toggleType(t)}>
                  {tt.label} <b>{n}</b>{needConfirm && <span className="cf">需复核</span>}
                </span>
              )
            })}
          </div>
        )}
        {result?.truncated && <div className="dm-err" style={{ paddingLeft: 0 }}>输入超过 1MB 已截断，只处理了前 1MB。</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="dm-btn" disabled={!result} onClick={() => void copyOut()}>复制脱敏结果</button>
          <button className="dm-btn ghost" disabled={!result} onClick={downloadOut}>下载 .txt</button>
          <button className="dm-btn ghost" disabled={!result || !onSendToChat} onClick={() => void sendToChat()}>发送到 AI 会话</button>
          <button className="dm-btn ghost" disabled={!input} onClick={() => { setInput(''); setResult(null) }}>清空</button>
        </div>
      </div></div>

      {hitsShown.length > 0 && (
        <>
          <div className="dm-sec"><span className="dm-bar" />命中明细<span className="dm-hint">预览已掩码；完整原值只在你本机</span></div>
          <div className="dm-card">
            {hitsShown.map((h, i) => (
              <div key={i} className="dm-hit">
                <span className="dm-hit-t">{core.TYPES[h.type]?.label || h.type}</span>
                <span className="dm-hit-k">{h.key || (h.mode === 'partial' ? '打码' : h.mode === 'fake' ? '假名' : '标签')}</span>
                <span className="dm-hit-p">{h.preview}{h.confirm ? ' ⚠' : ''}</span>
              </div>
            ))}
            {hitOverflow > 0 && <div className="dm-sub" style={{ padding: '6px 13px' }}>…还有 {hitOverflow} 处未展示（已全部处理）</div>}
          </div>
        </>
      )}

      <div className="dm-sec"><span className="dm-bar" />怎么用</div>
      <div className="dm-card"><div className="dm-card-b">
        <div className="dm-sub">
          · 把要发给 AI / 同事 / 贴工单的数据先贴进来 → 复制脱敏结果再发；<br />
          · 「发送到 AI 会话」直接把脱敏后文本发进当前 Polaris 会话，AI 拿到的只有假名；<br />
          · 同一个手机号/姓名在所有批次里得到同一个假名（确定性映射），AI 分析多份数据时关联性不散架；<br />
          · 需要看回来时在「台账」页还原（partial 打码天然不可还原）；<br />
          · 电脑上的文件整份脱敏用「文件」页，或直接对 AI 说「把这份数据脱敏后分析」。
        </div>
      </div></div>
    </>
  )
}
