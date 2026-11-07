/**
 * AI 声明核验台 面板（cl-* 前缀）
 * 流程：粘贴 AI 回答 → 本地提取声明（纯函数即时）→ 选仓库根 → 核验（服务 fs/exec 实证）→ 裁决卡片+证据
 * 数据面：cap.kv claim-lens.*（根历史）；字节面：127.0.0.1:<meta.port>/api/*（token 鉴权）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as core from '../shared/claim-core.js'
import type { Claim, ClaimLensMeta, Report, VerifiedClaim } from './model'
import { apiSelftest, apiVerify, getMeta, loadSettings, saveRoot } from './model'

const css = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cl-body::-webkit-scrollbar{width:9px;height:9px}
.cl-body::-webkit-scrollbar-track{background:transparent}
.cl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#6C9EF8,#2D5BD7);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.cl-tt{flex:1;min-width:0}
.cl-tt b{font-size:15px;display:block}
.cl-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.cl-cols{display:flex;gap:10px;padding:0 16px;align-items:flex-start}
.cl-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.cl-card{background:#151A24;border:1px solid #232A38;border-radius:12px;padding:11px 13px}
.cl-sec{display:flex;align-items:center;gap:8px;padding:2px 0 6px;font-size:13px;font-weight:700}
.cl-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#6C9EF8,#2D5BD7);flex-shrink:0}
.cl-lbl{font-size:11px;color:#8B95A7;min-width:56px}
.cl-inp,.cl-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.cl-inp:focus,.cl-txa:focus{border-color:#6C9EF8}
.cl-inp{flex:1;min-width:100px}
.cl-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:12px}
.cl-btn{background:linear-gradient(135deg,#4E7FE8,#2D5BD7);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.cl-btn:hover{filter:brightness(1.1)}
.cl-btn:disabled{opacity:.5;cursor:default}
.cl-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.cl-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.cl-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0}
.cl-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;border-radius:7px;padding:2px 8px;background:#1C2330;color:#B9C2D4}
.cl-chip.v-verified{background:rgba(62,207,178,.14);color:#7BDCC4}
.cl-chip.v-refuted{background:rgba(229,72,77,.14);color:#F2A0A3}
.cl-chip.v-partial{background:rgba(240,180,70,.14);color:#F0C674}
.cl-chip.v-unverifiable{background:rgba(140,150,170,.14);color:#9AA5B8}
.cl-claim{border:1px solid #232A38;border-radius:10px;padding:8px 10px;margin:6px 0;background:#10141C}
.cl-claim.verdict-verified{border-color:rgba(62,207,178,.45)}
.cl-claim.verdict-refuted{border-color:rgba(229,72,77,.45)}
.cl-claim.verdict-partial{border-color:rgba(240,180,70,.4)}
.cl-claim.verdict-unverifiable{border-color:#2A3140}
.cl-quote{color:#8B95A7;font-size:11px;margin-top:3px;font-family:Consolas,Menlo,monospace;word-break:break-all}
.cl-ev{margin:4px 0 0;padding-left:10px;border-left:2px solid #232A38;color:#B9C2D4;font-size:11.5px;word-break:break-all;font-family:Consolas,Menlo,monospace}
.cl-hint{color:#8B95A7;font-size:11px;margin-top:4px}
.cl-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all}
.cl-empty{color:#5A6478;font-size:12px;padding:14px 2px;text-align:center}
.cl-pre{background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:9px 11px;font-family:Consolas,Menlo,monospace;font-size:11.5px;white-space:pre-wrap;word-break:break-all;max-height:180px;overflow-y:auto;margin:6px 0}
.cl-target{font-family:Consolas,Menlo,monospace;font-size:12px;word-break:break-all;color:#E6EAF2}
.cl-file{color:#8B95A7;font-size:11px;font-family:Consolas,Menlo,monospace}
.cl-hist{position:relative;flex:1;min-width:160px;display:flex}
.cl-hist .cl-inp{border-radius:8px 0 0 8px}
.cl-histbtn{background:#1C2330;border:1px solid #232A38;border-left:none;color:#8B95A7;border-radius:0 8px 8px 0;padding:0 8px;cursor:pointer;font-size:11px}
.cl-menu{position:absolute;top:100%;left:0;right:0;z-index:40;background:#151A24;border:1px solid #2A3140;border-radius:8px;overflow:hidden;max-height:180px;overflow-y:auto}
.cl-menu div{padding:6px 10px;font-size:11.5px;cursor:pointer;font-family:Consolas,Menlo,monospace;word-break:break-all}
.cl-menu div:hover{background:#1C2330}
`

const TYPE_LABEL: Record<string, string> = {
  file: '文件', symbol: '符号', package: '依赖', cli: '命令', config: '配置', version: '版本',
}

const VERDICT_TEXT: Record<string, string> = {
  verified: '✓ 已证实', refuted: '✗ 已证伪', partial: '◐ 部分核实', unverifiable: '? 无法核验',
}

function claimLabel(c: Claim): string {
  const flags = c.flags && c.flags.length ? ` ${c.flags.join(' ')}` : ''
  const sub = c.subcmd && c.subcmd.length ? ` ${c.subcmd.join(' ')}` : ''
  const cons = c.constraint ? ` ≥${c.constraint}` : ''
  const file = c.file ? ` @${c.file}` : ''
  return `${c.target}${sub}${flags}${cons}${file}`
}

export default function ClaimLensPanel(_props: {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [meta, setMeta] = useState<ClaimLensMeta | null>(null)
  const [roots, setRoots] = useState<string[]>([])
  const [root, setRoot] = useState('')
  const [histOpen, setHistOpen] = useState(false)
  const [text, setText] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [selftest, setSelftest] = useState<{ pass: number, fail: number } | null>(null)

  useEffect(() => {
    void (async () => {
      const [m, s] = await Promise.all([getMeta(), loadSettings()])
      setMeta(m)
      if (s.roots.length) { setRoots(s.roots); setRoot((r) => r || s.roots[0]) }
    })()
  }, [])

  const extracted = useMemo(() => (text.trim() ? core.extractClaims(text).claims : []), [text])
  const exByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of extracted) m[c.type] = (m[c.type] || 0) + 1
    return m
  }, [extracted])

  const runVerify = useCallback(async () => {
    if (!meta || !text.trim() || !root.trim()) return
    setBusy(true); setErr(''); setSelftest(null)
    try {
      const r = await apiVerify(meta, text, root.trim())
      setReport(r.report)
      void saveRoot(roots, root.trim())
        .then(() => setRoots((prev) => [root.trim(), ...prev.filter((x) => x !== root.trim())].slice(0, 8)))
        .catch(() => { /* 历史保存失败不影响 */ })
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta, text, root, roots])

  const runSelftestOnce = useCallback(async () => {
    if (!meta) return
    setBusy(true); setErr('')
    try {
      const r = await apiSelftest(meta)
      setSelftest({ pass: r.pass, fail: r.fail })
      if (r.fail > 0) setErr(`试金石 ${r.fail} 条未过：${r.items.filter((i) => !i.ok).map((i) => i.name).join('、')}`)
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta])

  const claims = report?.claims || []

  return (
    <div className="cl-root">
      <style>{css}</style>
      <div className="cl-top">
        <div className="cl-logo">⚖</div>
        <div className="cl-tt">
          <b>AI 声明核验台</b>
          <small>{meta ? `服务在线 :${meta.port} · 声明对照本地实证，证据随行` : '服务未连接 · 等待宿主拉起（首开面板触发 discover）'}</small>
        </div>
        <button className="cl-btn ghost mini" onClick={() => void runSelftestOnce()} disabled={busy || !meta}>试金石</button>
      </div>

      <div className="cl-body">
        <div className="cl-cols">
          {/* 左：输入 */}
          <div className="cl-col" style={{ flex: 1.15 }}>
            <div className="cl-card">
              <div className="cl-sec"><span className="cl-bar" />仓库根</div>
              <div className="cl-row">
                <div className="cl-hist">
                  <input
                    className="cl-inp"
                    value={root}
                    placeholder="D:\\space\\base\\Polaris-plugin 之类的绝对路径"
                    onChange={(e) => setRoot(e.target.value)}
                  />
                  <button className="cl-histbtn" onClick={() => setHistOpen((v) => !v)} title="历史">▾</button>
                  {histOpen && (
                    <div className="cl-menu">
                      {roots.length === 0 && <div style={{ color: '#5A6478' }}>暂无历史</div>}
                      {roots.map((r) => (
                        <div key={r} onClick={() => { setRoot(r); setHistOpen(false) }}>{r}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="cl-sec" style={{ paddingTop: 8 }}><span className="cl-bar" />AI 回答原文</div>
              <textarea
                className="cl-txa"
                rows={12}
                value={text}
                placeholder={'粘贴 AI 的回答/完成报告，例如：\n已完成登录模块，改动在 `src/auth.ts`（入口 `parseSession()`），依赖 `zod`，需要 Node >= 18…'}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="cl-row">
                <button className="cl-btn" onClick={() => void runVerify()} disabled={busy || !meta || !text.trim() || !root.trim()}>
                  {busy ? '核验中…' : '提取并核验'}
                </button>
                {extracted.length > 0 && (
                  <span className="cl-row" style={{ gap: 4 }}>
                    {Object.entries(exByType).map(([t, n]) => (
                      <span key={t} className="cl-chip">{TYPE_LABEL[t] || t} {n}</span>
                    ))}
                  </span>
                )}
              </div>
              <div className="cl-hint">提取在本地完成（零外联）；核验由本机服务对照仓库实证。exec 仅白名单 --help/--version 探测，fs 全只读。</div>
            </div>
            {selftest && (
              <div className="cl-card">
                <div className="cl-sec"><span className="cl-bar" />试金石</div>
                <div className="cl-row"><span className="cl-chip v-verified">{selftest.pass} 通过</span>{selftest.fail > 0 && <span className="cl-chip v-refuted">{selftest.fail} 未过</span>}</div>
              </div>
            )}
          </div>

          {/* 右：裁决 */}
          <div className="cl-col" style={{ flex: 1 }}>
            {report ? (
              <div className="cl-card">
                <div className="cl-sec"><span className="cl-bar" />核验报告</div>
                <div className="cl-row">
                  <span className="cl-chip v-verified">✓ {report.summary.verified}</span>
                  <span className="cl-chip v-refuted">✗ {report.summary.refuted}</span>
                  <span className="cl-chip v-partial">◐ {report.summary.partial}</span>
                  <span className="cl-chip v-unverifiable">? {report.summary.unverifiable}</span>
                </div>
                <div className="cl-hint">{report.root} · {report.gitStatusNote} · {report.scannedAt.slice(11, 19)}</div>
                <div style={{ marginTop: 6 }}>
                  {claims.map((c: VerifiedClaim) => (
                    <div key={c.id} className={`cl-claim verdict-${c.verdict}`}>
                      <div className="cl-row" style={{ marginBottom: 2 }}>
                        <span className={`cl-chip v-${c.verdict}`}>{VERDICT_TEXT[c.verdict]}</span>
                        <span className="cl-chip">{TYPE_LABEL[c.type] || c.type}</span>
                        <span className="cl-target">#{c.id} {claimLabel(c)}</span>
                      </div>
                      {c.quote && <div className="cl-quote">原文「{c.quote.length > 110 ? c.quote.slice(0, 107) + '…' : c.quote}」</div>}
                      {(c.evidence || []).map((ev, i) => <div key={i} className="cl-ev">{ev}</div>)}
                      {c.hint && <div className="cl-hint">↳ {c.hint}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="cl-card">
                <div className="cl-sec"><span className="cl-bar" />核验报告</div>
                <div className="cl-empty">{extracted.length > 0 ? `已提取 ${extracted.length} 条声明，点「提取并核验」对照仓库实证` : '粘贴 AI 回答后开始；五类声明：文件 / 符号 / 依赖 / 命令 / 配置'}</div>
                {extracted.length > 0 && (
                  <div className="cl-pre">{extracted.map((c) => `#${c.id} [${TYPE_LABEL[c.type] || c.type}] ${claimLabel(c)}`).join('\n')}</div>
                )}
              </div>
            )}
          </div>
        </div>
        {err && <div className="cl-err">{err}</div>}
      </div>
    </div>
  )
}
