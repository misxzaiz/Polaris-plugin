/**
 * 面板：TLS 证书调试台（解析 / 诊断 / 盯守 / 自检 四 Tab）
 * 数据面：cap.kv（盯守上次结果缓存）；字节面：127.0.0.1 直连自家服务。
 * 隐私口径：PEM 输入（含私钥）只经本页与本地服务内存流转，不落 kv（仅存解析输入快照供回显）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CertModel, ClMeta, Diagnosis, Finding, ParseResult, ProbeResult, SelftestResult, WatchData,
} from './model'
import {
  apiParse, apiProbe, apiSelftest, apiWatchAdd, apiWatchCheck, apiWatchList, apiWatchRemove,
  getMeta, loadLastParse, readTextFile, saveLastParse,
} from './model'

const css = `
.cl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cl-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cl-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.cl-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3ECFB2,#1E8F78);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;color:#06281F}
.cl-tt{flex:1;min-width:0}
.cl-tt b{font-size:15px;display:block}
.cl-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.cl-dot{width:8px;height:8px;border-radius:50%;background:#4a5160;flex-shrink:0}
.cl-dot.on{background:#3ECFB2;box-shadow:0 0 6px rgba(62,207,178,.6)}
.cl-dot.err{background:#E5484D}
.cl-tabs{display:flex;gap:4px;padding:0 16px 6px}
.cl-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer}
.cl-tab:hover{color:#E6EAF2}
.cl-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.cl-body{flex:1;overflow-y:auto;padding:0 0 24px}
.cl-body::-webkit-scrollbar{width:9px;height:9px}
.cl-body::-webkit-scrollbar-track{background:transparent}
.cl-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.cl-sec{display:flex;align-items:center;gap:8px;padding:8px 16px 4px;font-size:12.5px;font-weight:700}
.cl-sec .act{margin-left:auto;display:flex;gap:6px}
.cl-inp,.cl-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.cl-inp:focus,.cl-txa:focus{border-color:#3ECFB2}
.cl-inp{flex:1;min-width:80px}
.cl-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:11.5px}
.cl-btn{background:linear-gradient(135deg,#2FB39A,#1E8F78);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.cl-btn:hover{filter:brightness(1.1)}
.cl-btn:disabled{opacity:.5;cursor:default}
.cl-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.cl-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.cl-btn.danger{background:linear-gradient(135deg,#E5484D,#B03236)}
.cl-row{display:flex;gap:6px;align-items:center;padding:2px 16px;margin:3px 0;flex-wrap:wrap}
.cl-hint{color:#5B6478;font-size:11px;padding:0 16px;margin:2px 0}
.cl-meta{color:#8B95A7;font-size:11px;margin:4px 16px 2px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.cl-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all;font-family:Consolas,Menlo,monospace}
.cl-note{background:rgba(91,157,255,.08);border:1px solid rgba(91,157,255,.3);color:#9EC1FF;border-radius:9px;padding:7px 11px;font-size:11.5px;margin:6px 16px}
.cl-card{background:#12161F;border:1px solid #232A38;border-radius:11px;padding:10px 12px;margin:8px 16px}
.cl-card .hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cl-card .hd b{font-size:13px}
.cl-badge{font-size:10px;padding:2px 8px;border-radius:7px;font-weight:600;white-space:nowrap}
.cl-badge.expired{background:rgba(229,72,77,.18);color:#F2A0A3}
.cl-badge.crit{background:rgba(229,72,77,.18);color:#F2A0A3}
.cl-badge.warn{background:rgba(229,160,72,.15);color:#E5A048}
.cl-badge.info{background:rgba(91,157,255,.14);color:#9EC1FF}
.cl-badge.ok{background:rgba(62,207,178,.12);color:#7BDCC4}
.cl-kv{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:11.5px;margin-top:7px}
.cl-kv .k{color:#5B6478;white-space:nowrap}
.cl-kv .v{color:#C7CFDE;word-break:break-all;font-family:Consolas,Menlo,monospace;font-size:11px}
.cl-findings{margin-top:8px;border-top:1px solid #1E2530;padding-top:6px}
.cl-f{display:flex;gap:6px;font-size:11.5px;padding:2.5px 0;align-items:baseline}
.cl-f .ic{flex-shrink:0;font-weight:700}
.cl-f.crit .ic{color:#E5484D}
.cl-f.crit .t{color:#F2A0A3}
.cl-f.warn .ic{color:#E5A048}
.cl-f.warn .t{color:#E5C08A}
.cl-f.info .ic{color:#5B7AAB}
.cl-f.info .t{color:#9BA7BD}
.cl-f.ok .ic{color:#3ECFB2}
.cl-f.ok .t{color:#7BDCC4}
.cl-f .d{color:#5B6478;font-size:11px;display:block}
.cl-diag{background:rgba(229,72,77,.07);border:1px solid rgba(229,72,77,.3);border-radius:10px;padding:9px 11px;margin:7px 16px}
.cl-diag b{font-size:12.5px;color:#F2A0A3}
.cl-diag .cause{color:#C7CFDE;font-size:11.5px;margin-top:3px}
.cl-diag ol{margin:5px 0 0;padding-left:18px;color:#B9C2D4;font-size:11.5px}
.cl-diag ol li{margin:2px 0}
.cl-chip{background:#0E1219;border:1px solid #232A38;color:#8B95A7;font-size:11px;font-family:Consolas,Menlo,monospace;padding:3px 8px;border-radius:7px}
.cl-table{margin:6px 16px;border:1px solid #232A38;border-radius:10px;overflow:hidden}
.cl-tr{display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid #1E2530;font-size:12px}
.cl-tr:last-child{border-bottom:none}
.cl-tr .tgt{font-family:Consolas,Menlo,monospace;color:#E6EAF2;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cl-tr .cn{color:#5B6478;font-size:10.5px}
.cl-tr .btns{display:flex;gap:4px}
.cl-st-pass{color:#3ECFB2}
.cl-st-fail{color:#F2A0A3}
.cl-empty{color:#5B6478;font-size:12px;text-align:center;padding:20px 16px}
.cl-spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:cl-spin .8s linear infinite;vertical-align:-2px}
@keyframes cl-spin{to{transform:rotate(360deg)}}
.cl-chainpath{display:flex;align-items:center;gap:6px;margin:6px 16px;font-size:11px;color:#8B95A7;flex-wrap:wrap}
.cl-chainpath .node{background:#0E1219;border:1px solid #2C3547;border-radius:7px;padding:3px 9px;font-family:Consolas,Menlo,monospace;color:#C7CFDE;cursor:pointer}
.cl-chainpath .node:hover{border-color:#3ECFB2;color:#E6EAF2}
.cl-chainpath .arr{color:#3ECFB2}
`

function sevBadge(daysLeft: number | null): { cls: string, text: string } {
  if (daysLeft == null) return { cls: 'crit', text: '无法取得' }
  if (daysLeft < 0) return { cls: 'expired', text: `已过期 ${-daysLeft} 天` }
  if (daysLeft <= 7) return { cls: 'crit', text: `${daysLeft} 天到期` }
  if (daysLeft <= 30) return { cls: 'warn', text: `${daysLeft} 天到期` }
  if (daysLeft <= 90) return { cls: 'info', text: `${daysLeft} 天到期` }
  return { cls: 'ok', text: `${daysLeft} 天` }
}

const F_ICON: Record<string, string> = { crit: '✗', warn: '▲', info: 'ℹ', ok: '✓' }

function Findings({ items }: { items: Finding[] }) {
  const shown = items.filter((f) => f.severity !== 'ok' || f.id.startsWith('key.') || f.id.startsWith('sig.'))
  if (!shown.length) return null
  return (
    <div className="cl-findings">
      {shown.map((f) => (
        <div key={f.id + f.title} className={`cl-f ${f.severity}`}>
          <span className="ic">{F_ICON[f.severity] || '·'}</span>
          <span>
            <span className="t">{f.title}</span>
            {f.detail ? <span className="d">{f.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

function fmtDate(iso: string | null | undefined): string {
  return String(iso || '').replace('T', ' ').slice(0, 19) + ' UTC'
}

function CertCard({ c }: { c: CertModel }) {
  const badge = sevBadge(c.daysLeft)
  const sanAll = [...(c.san?.dns || []), ...(c.san?.ips || [])]
  return (
    <div className="cl-card">
      <div className="hd">
        <b>{c.cn || c.subjectText.slice(0, 40)}</b>
        {c.isCA ? <span className="cl-badge info">CA 证书</span> : null}
        {c.selfSigned ? <span className="cl-badge info">自签</span> : null}
        <span className={`cl-badge ${badge.cls}`}>{badge.text}</span>
        {c.findingsSeverity === 'crit' ? <span className="cl-badge crit">有 crit 问题</span> : c.findingsSeverity === 'warn' ? <span className="cl-badge warn">有警告</span> : null}
      </div>
      <div className="cl-kv">
        <span className="k">有效期</span><span className="v">{fmtDate(c.notBefore)} → {fmtDate(c.notAfter)}（签发跨度 {c.validityDays} 天）</span>
        <span className="k">SAN</span><span className="v">{sanAll.length ? sanAll.join('、') : '（无——现代客户端只看 SAN）'}</span>
        <span className="k">密钥</span><span className="v">{c.keyInfo.algo}{c.keyInfo.bits ? `-${c.keyInfo.bits}` : ''}{c.keyInfo.curve ? `（${c.keyInfo.curve}）` : ''}</span>
        <span className="k">签名</span><span className="v">{c.sigAlg || '未知'}</span>
        <span className="k">签发者</span><span className="v">{c.issuerText.replace(/\n/g, ' / ')}</span>
        <span className="k">指纹</span><span className="v" title="点击复制 SHA-256 指纹" style={{ cursor: 'pointer' }} onClick={() => navigator.clipboard?.writeText(c.sha256Fp)}>{c.sha256Fp}</span>
        {(c.extKeyUsage || []).length ? <span className="k">用途</span> : null}
        {(c.extKeyUsage || []).length ? <span className="v">{c.extKeyUsage.join(', ')}</span> : null}
      </div>
      <Findings items={c.findings || []} />
    </div>
  )
}

function DiagnosisCards({ items }: { items: Diagnosis[] }) {
  if (!items.length) return null
  return (
    <>
      {items.map((d, i) => (
        <div key={d.from + d.id + i} className="cl-diag">
          <b>[{d.severity}] {d.title}</b>
          {d.cause ? <div className="cause">{d.cause}</div> : null}
          {d.fixes.length ? <ol>{d.fixes.map((f, j) => <li key={j}>{f}</li>)}</ol> : null}
        </div>
      ))}
    </>
  )
}

export function Panel(_props: {
  pluginId?: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [meta, setMeta] = useState<ClMeta | null>(null)
  const [svcState, setSvcState] = useState<'off' | 'on' | 'err'>('off')
  const [tab, setTab] = useState<'parse' | 'probe' | 'watch' | 'selftest'>('parse')
  const [probeSeed, setProbeSeed] = useState('')

  useEffect(() => {
    let alive = true
    getMeta().then((m) => {
      if (!alive) return
      if (m) {
        setMeta(m)
        setSvcState('on')
      } else {
        setSvcState('err')
      }
    })
    return () => { alive = false }
  }, [])

  return (
    <div className="cl-root">
      <style>{css}</style>
      <div className="cl-top">
        <div className="cl-logo">🔒</div>
        <div className="cl-tt">
          <b>TLS 证书调试台</b>
          <small>{meta ? `service v${meta.version} · 127.0.0.1:${meta.port}` : '等待本地服务…'}</small>
        </div>
        <div className={`cl-dot ${svcState === 'on' ? 'on' : svcState === 'err' ? 'err' : ''}`} title={svcState === 'on' ? '服务在线' : '服务离线（安装后启动一次插件面板可重试）'} />
      </div>
      <div className="cl-tabs">
        {(['parse', 'probe', 'watch', 'selftest'] as const).map((t) => (
          <button key={t} className={`cl-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'parse' ? '证书解析' : t === 'probe' ? '连接诊断' : t === 'watch' ? '到期盯守' : '试金石'}
          </button>
        ))}
      </div>
      <div className="cl-body">
        {!meta ? (
          <div className="cl-empty">{svcState === 'err' ? '本地服务未就绪（cap.kv 桥降级或服务未启动）。请确认插件已启用，稍后重试。' : '连接本地服务中…'}</div>
        ) : tab === 'parse' ? <ParseTab meta={meta} /> : tab === 'probe' ? <ProbeTab meta={meta} seed={probeSeed} /> : tab === 'watch' ? <WatchTab meta={meta} onDiagnose={(t) => { setProbeSeed(t); setTab('probe') }} /> : <SelftestTab meta={meta} />}
      </div>
    </div>
  )
}

// ── 解析 Tab ────────────────────────────────────────────────────────────────
function ParseTab({ meta }: { meta: ClMeta }) {
  const [pem, setPem] = useState('')
  const [keyPem, setKeyPem] = useState('')
  const [host, setHost] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<ParseResult | null>(null)
  const [showKey, setShowKey] = useState(false)
  const loadedOnce = useRef(false)

  useEffect(() => {
    if (loadedOnce.current) return
    loadedOnce.current = true
    loadLastParse().then((v) => { if (v) setPem(v) })
  }, [])

  const doParse = useCallback(async () => {
    setBusy(true)
    setErr('')
    setRes(null)
    try {
      const r = await apiParse(meta, { pem, key: keyPem || undefined, host: host || undefined })
      setRes(r)
      saveLastParse(pem)
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta, pem, keyPem, host])

  const loadFile = useCallback(async (target: 'pem' | 'key') => {
    const path = window.prompt('证书文件绝对路径（如 C:\\nginx\\conf\\fullchain.pem）：')
    if (!path) return
    try {
      const text = await readTextFile(path)
      if (target === 'pem') setPem(text)
      else { setKeyPem(text); setShowKey(true) }
    } catch (e) {
      setErr(String((e as Error).message || e))
    }
  }, [])

  const order = res?.chain ? res.chain.ordered : res ? res.certs.map((_, i) => i) : []

  return (
    <>
      <div className="cl-sec">
        证书输入（PEM；整条链一起粘）
        <span className="act">
          <button className="cl-btn ghost mini" onClick={() => loadFile('pem')}>载入文件</button>
          <button className="cl-btn ghost mini" onClick={() => { setPem(''); setRes(null); setErr('') }}>清空</button>
        </span>
      </div>
      <div className="cl-row">
        <textarea className="cl-txa" rows={7} placeholder={'-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----\n（可多块：叶→中间→根；也接受公钥块；前后垃圾文本自动忽略）'} value={pem} onChange={(e) => setPem(e.target.value)} />
      </div>
      <div className="cl-row">
        <button className="cl-btn ghost mini" onClick={() => setShowKey(!showKey)}>{showKey ? '▾' : '▸'} 配对检查（可选私钥）</button>
        <input className="cl-inp" style={{ maxWidth: 220 }} placeholder="核对 SAN 的主机名/IP（可选）" value={host} onChange={(e) => setHost(e.target.value)} />
      </div>
      {showKey ? (
        <>
          <div className="cl-row">
            <textarea className="cl-txa" rows={4} placeholder={'-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n（只在内存比对即弃，不落盘不落日志）'} value={keyPem} onChange={(e) => setKeyPem(e.target.value)} />
          </div>
          <div className="cl-row">
            <button className="cl-btn ghost mini" onClick={() => loadFile('key')}>载入私钥文件</button>
            <button className="cl-btn ghost mini" onClick={() => setKeyPem('')}>清空私钥</button>
          </div>
        </>
      ) : null}
      <div className="cl-row">
        <button className="cl-btn" disabled={busy || !pem.trim()} onClick={doParse}>{busy ? <span className="cl-spin" /> : '🔍'} 解析并体检</button>
      </div>
      {err ? <div className="cl-err">{err}</div> : null}
      {res ? (
        <>
          <div className="cl-meta">
            证书 {res.kind.certs} 张{res.kind.pubkeys ? ` · 公钥 ${res.kind.pubkeys}` : ''}
            {res.chain && res.chain.issues.length ? ` · 链问题 ${res.chain.issues.length}` : ''}
          </div>
          {order.length > 1 ? (
            <div className="cl-chainpath">
              链序：
              {order.map((idx, i) => (
                <span key={idx} style={{ display: 'contents' }}>
                  {i > 0 ? <span className="arr">←</span> : null}
                  <span className="node">{res.certs[idx].cn || `#${idx + 1}`}</span>
                </span>
              ))}
              {res.chain?.rootFound ? <span className="cl-badge ok">自签根</span> : null}
            </div>
          ) : null}
          {order.map((idx) => <CertCard key={idx} c={res.certs[idx]} />)}
          <DiagnosisCards items={res.chainFindings.filter((f) => f.severity !== 'ok').map((f) => ({ from: 'chain', id: f.id, severity: f.severity as 'warn', title: f.title, cause: f.detail, fixes: f.fix ? [f.fix] : [] }))} />
          {res.keyMatch ? (
            <div className={`cl-note`}>
              {res.keyMatch.matched
                ? `✓ 私钥配对：匹配（${res.keyMatch.keyInfo ? `${res.keyMatch.keyInfo.algo}-${res.keyMatch.keyInfo.bits}` : ''}）`
                : `✗ 私钥配对：不匹配——${res.keyMatch.error}`}
            </div>
          ) : null}
          {(['csrNote', 'crlNote', 'encryptedKeyNote', 'privkeyNote'] as const).map((k) => (res[k] ? <div key={k} className="cl-note">ℹ {res[k]}</div> : null))}
          {res.errors.map((e, i) => <div key={i} className="cl-err">块 {e.index + 1}{e.label ? `（${e.label}）` : ''}：{e.error}</div>)}
        </>
      ) : null}
    </>
  )
}

// ── 诊断 Tab ────────────────────────────────────────────────────────────────
function ProbeTab({ meta, seed }: { meta: ClMeta, seed: string }) {
  const [target, setTarget] = useState('')
  const [sni, setSni] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<ProbeResult | null>(null)
  const historyRef = useRef<string[]>([])

  const doProbe = useCallback(async (t?: string) => {
    const tgt = (t ?? target).trim()
    if (!tgt) return
    if (t && !historyRef.current.includes(tgt)) historyRef.current = [tgt, ...historyRef.current].slice(0, 6)
    setBusy(true)
    setErr('')
    setRes(null)
    try {
      const r = await apiProbe(meta, { target: tgt, serverName: sni || undefined })
      setRes(r)
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta, target, sni])

  // 盯守页「诊断」按钮跳入：预填并自动探测
  useEffect(() => {
    if (seed) {
      setTarget(seed)
      doProbe(seed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  const order = res ? (res.chainAudit.ordered.length ? res.chainAudit.ordered : res.chain.map((_, i) => i)) : []

  return (
    <>
      <div className="cl-sec">目标（host:port，缺省 443；可探测内网/自签端点）</div>
      <div className="cl-row">
        <input
          className="cl-inp" placeholder="example.com 或 192.168.1.10:8443 或 [::1]:443"
          value={target} onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doProbe() }}
        />
        <button className="cl-btn" disabled={busy || !target.trim()} onClick={() => doProbe()}>{busy ? <span className="cl-spin" /> : '📡'} 探测</button>
      </div>
      <div className="cl-row">
        <input className="cl-inp" style={{ maxWidth: 220 }} placeholder="SNI/校验域名（可选，调试 CDN 路由）" value={sni} onChange={(e) => setSni(e.target.value)} />
        {historyRef.current.map((h) => (
          <button key={h} className="cl-chip" style={{ cursor: 'pointer' }} onClick={() => { setTarget(h); doProbe(h) }}>{h}</button>
        ))}
      </div>
      {err ? <div className="cl-err">{err}</div> : null}
      {res ? (
        <>
          <div className="cl-card">
            <div className="hd">
              <b>{res.target.host}:{res.target.port}</b>
              <span className={`cl-badge ${res.verified ? 'ok' : res.connected ? 'crit' : 'crit'}`}>{res.verified ? '✓ 信任链校验通过' : res.connected ? '✗ 校验失败（链已取得）' : '✗ 未完成握手'}</span>
              <span style={{ color: '#5B6478', fontSize: 11 }}>{res.ms}ms</span>
            </div>
            <div className="cl-kv">
              <span className="k">协商</span><span className="v">{res.relaxed ? `${res.relaxed.protocol} · ${res.relaxed.cipher?.name || '?'}${res.relaxed.alpn ? ` · ALPN ${res.relaxed.alpn}` : ''}` : '—'}</span>
              <span className="k">主机匹配</span><span className="v">{res.hostMatch.matched === true ? '✓ ' : res.hostMatch.matched === false ? '✗ ' : ''}{res.hostMatch.reason}</span>
              {res.strict.error ? <><span className="k">校验错误</span><span className="v">{res.strict.error.code}：{res.strict.error.message.slice(0, 120)}</span></> : null}
            </div>
          </div>
          <DiagnosisCards items={res.diagnosis} />
          {res.chain.length ? (
            <>
              <div className="cl-sec">实际收到的链（{res.chain.length} 级，叶在前）</div>
              {order.map((idx) => <CertCard key={idx} c={res.chain[idx]} />)}
            </>
          ) : null}
        </>
      ) : null}
    </>
  )
}

// ── 盯守 Tab ────────────────────────────────────────────────────────────────
function WatchTab({ meta, onDiagnose }: { meta: ClMeta, onDiagnose: (target: string) => void }) {
  const [data, setData] = useState<WatchData | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [degraded, setDegraded] = useState('')

  const refresh = useCallback(async () => {
    try {
      const d = await apiWatchList(meta)
      setData(d)
      setDegraded('')
    } catch (e) {
      setDegraded(`盯守清单依赖 cap.kv 桥：${String((e as Error).message || e).slice(0, 160)}`)
    }
  }, [meta])

  useEffect(() => { refresh() }, [refresh])

  const add = useCallback(async () => {
    if (!input.trim()) return
    setBusy(true)
    setErr('')
    try {
      const d = await apiWatchAdd(meta, { target: input.trim() })
      setData(d)
      setInput('')
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta, input])

  const remove = useCallback(async (target: string) => {
    setBusy(true)
    try {
      const d = await apiWatchRemove(meta, target)
      setData(d)
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta])

  const checkAll = useCallback(async () => {
    setBusy(true)
    setErr('')
    try {
      const d = await apiWatchCheck(meta)
      setData(d)
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta])

  const rows = data?.state?.results ? [...data.state.results].sort((a, b) => {
    const da = a.daysLeft == null ? -1e9 : a.daysLeft
    const db = b.daysLeft == null ? -1e9 : b.daysLeft
    return da - db
  }) : []

  return (
    <>
      <div className="cl-sec">
        端点清单（存 cap.kv；面板全检 + MCP cert_expiry_check 可复用）
        <span className="act">
          <button className="cl-btn mini" disabled={busy} onClick={checkAll}>{busy ? <span className="cl-spin" /> : '⟳'} 全部检查</button>
        </span>
      </div>
      <div className="cl-row">
        <input
          className="cl-inp" placeholder="添加端点：host:port（如 api.example.com:443）"
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <button className="cl-btn mini" disabled={busy || !input.trim()} onClick={add}>添加</button>
      </div>
      {degraded ? <div className="cl-note">ℹ {degraded}（解析与诊断不受影响）</div> : null}
      {err ? <div className="cl-err">{err}</div> : null}
      {data?.state?.checkedAt ? <div className="cl-meta">上次全检：{fmtDate(data.state.checkedAt)}</div> : null}
      {rows.length ? (
        <div className="cl-table">
          {rows.map((r, i) => {
            const badge = sevBadge(r.daysLeft)
            return (
              <div key={`${r.host}:${r.port}`} className="cl-tr">
                <span className={`cl-badge ${r.daysLeft == null ? 'crit' : badge.cls}`}>{r.daysLeft == null ? (r.errorCode || '失败') : badge.text}</span>
                <span className="tgt">{r.host}:{r.port}{r.label && r.label !== `${r.host}:${r.port}` ? ` · ${r.label}` : ''}</span>
                <span className="cn">{r.cn || ''}{r.daysLeft != null ? ` · ${fmtDate(r.notAfter).slice(0, 10)}` : ''}</span>
                <span className="btns">
                  <button className="cl-btn ghost mini" onClick={() => onDiagnose(`${r.host}:${r.port}`)} title="到诊断页探测">诊断</button>
                  <button className="cl-btn danger mini" onClick={() => remove(`${r.host}:${r.port}`)}>删除</button>
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="cl-empty">{data?.endpoints?.length ? '端点已就绪，点「全部检查」做首次巡检。' : '还没有盯守端点。添加 host:port 后一键全检，到期 ≤30 天黄色 / ≤7 天红色告警。'}</div>
      )}
      <div className="cl-hint">口径：全检是对每个端点做一次真实 TLS 握手取叶证书到期时间（并发 4，超时 8s/个）；结果落 cap.kv 供 MCP cert_expiry_check 复用。</div>
    </>
  )
}

// ── 自检 Tab ────────────────────────────────────────────────────────────────
function SelftestTab({ meta }: { meta: ClMeta }) {
  const [res, setRes] = useState<SelftestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = useCallback(async () => {
    setBusy(true)
    setErr('')
    try {
      setRes(await apiSelftest(meta))
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }, [meta])

  return (
    <>
      <div className="cl-sec">
        试金石（fixture 证书矩阵 + 本地 hermetic TLS 服务器全链路）
        <span className="act"><button className="cl-btn mini" disabled={busy} onClick={run}>{busy ? <span className="cl-spin" /> : '▶'} 运行自检</button></span>
      </div>
      {err ? <div className="cl-err">{err}</div> : null}
      {res ? (
        <>
          <div className="cl-meta">结果：<span className={res.fail === 0 ? 'cl-st-pass' : 'cl-st-fail'}>{res.pass}/{res.total} 通过{res.fail ? `（fail=${res.fail}）` : '，全部健康'}</span></div>
          <div className="cl-table">
            {res.results.map((r) => (
              <div key={r.name} className="cl-tr">
                <span className={r.pass ? 'cl-st-pass' : 'cl-st-fail'}>{r.pass ? '✓' : '✗'}</span>
                <span className="tgt">{r.name}</span>
                <span className="cn">{r.pass ? '' : r.detail || ''}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="cl-empty">自检覆盖：解析矩阵 / 链拼装 / 配对 / 错误映射 / 本地 TLS 服务器握手。服务异常时先跑这里定位。</div>
      )}
    </>
  )
}
