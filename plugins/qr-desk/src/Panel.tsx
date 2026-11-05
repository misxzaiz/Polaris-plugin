/**
 * 面板外壳：头部 + 四 Tab（生成 / 解码 / 批量 / 体检）
 * 数据面：cap.kv qr-desk.*；字节面：127.0.0.1 直连自家服务（见 model.ts）。
 * 安全口径：解码结果（可能含密码/2FA secret）只在本页展示，不落 kv 不进历史。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BatchJob, DecodeResult, GenerateResult, InspectResult, QrMeta, QrSettings, SelftestResult,
} from './model'
import {
  apiBatchStart, apiDecode, apiGenerate, apiInspect, apiJob, apiSelftest,
  getMeta, loadSettings, saveSettings,
} from './model'

const css = `
.qd-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.qd-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.qd-body{flex:1;overflow-y:auto;padding:0 0 24px}
.qd-body::-webkit-scrollbar{width:9px;height:9px}
.qd-body::-webkit-scrollbar-track{background:transparent}
.qd-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}
.qd-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.qd-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3ECFB2,#177E69);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.qd-tt{flex:1;min-width:0}
.qd-tt b{font-size:15px;display:block}
.qd-tt small{color:#8B95A7;font-size:10.5px;display:block;margin-top:1px}
.qd-tabs{display:flex;gap:4px}
.qd-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer}
.qd-tab:hover{color:#E6EAF2}
.qd-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qd-sec{display:flex;align-items:center;gap:8px;padding:10px 18px 4px;font-size:13px;font-weight:700}
.qd-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3ECFB2,#177E69);flex-shrink:0}
.qd-card{margin:6px 16px;padding:12px 14px;background:#151A24;border:1px solid #232A38;border-radius:12px}
.qd-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}
.qd-lbl{font-size:11px;color:#8B95A7;min-width:52px}
.qd-inp,.qd-sel,.qd-txa{background:#0E1219;border:1px solid #232A38;color:#E6EAF2;border-radius:8px;padding:6px 9px;font-size:12.5px;outline:none;font-family:inherit}
.qd-inp:focus,.qd-txa:focus,.qd-sel:focus{border-color:#3ECFB2}
.qd-inp{flex:1;min-width:120px}
.qd-txa{width:100%;resize:vertical;font-family:Consolas,Menlo,monospace;font-size:12px}
.qd-btn{background:linear-gradient(135deg,#2FA88E,#177E69);border:none;color:#fff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.qd-btn:hover{filter:brightness(1.1)}
.qd-btn:disabled{opacity:.5;cursor:default}
.qd-btn.ghost{background:#1C2330;color:#B9C2D4;font-weight:500}
.qd-btn.mini{padding:3px 9px;font-size:11px;border-radius:7px}
.qd-err{background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.4);color:#F2A0A3;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px;white-space:pre-wrap;word-break:break-all}
.qd-ok{background:rgba(62,207,178,.1);border:1px solid rgba(62,207,178,.35);color:#7BDCC4;border-radius:9px;padding:8px 11px;font-size:12px;margin:6px 16px}
.qd-prev{display:flex;justify-content:center;padding:14px;background:#fff;border-radius:12px;margin:8px 16px}
.qd-prev svg{width:min(300px,80vw);height:auto;display:block}
.qd-meta{color:#8B95A7;font-size:11px;margin:2px 18px 8px;display:flex;gap:12px;flex-wrap:wrap}
.qd-pre{background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:9px 11px;font-family:Consolas,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow-y:auto;margin:6px 0}
.qd-kv{margin:4px 0}
.qd-kv .k{color:#7BDCC4;font-size:11.5px}
.qd-kv .v{color:#E6EAF2;font-size:12px;word-break:break-all}
.qd-kv .sub{margin-left:12px;border-left:1px solid #232A38;padding-left:9px;margin-top:2px}
.qd-code{display:flex;align-items:center;gap:14px;margin:8px 0}
.qd-code b{font-family:Consolas,Menlo,monospace;font-size:30px;letter-spacing:7px;color:#3ECFB2}
.qd-code small{color:#8B95A7;font-size:11px}
.qd-drop{margin:6px 16px;border:2px dashed #2C3547;border-radius:14px;padding:26px 14px;text-align:center;color:#8B95A7;font-size:12.5px;cursor:pointer;transition:border-color .15s}
.qd-drop.hot{border-color:#3ECFB2;color:#7BDCC4;background:rgba(62,207,178,.05)}
.qd-prog{height:7px;border-radius:4px;background:#1C2330;overflow:hidden;margin:8px 0}
.qd-prog>i{display:block;height:100%;background:linear-gradient(90deg,#2FA88E,#3ECFB2);transition:width .2s}
.qd-files{max-height:180px;overflow-y:auto;font-size:11px;color:#9BA5B8;font-family:Consolas,Menlo,monospace}
.qd-files div{padding:1.5px 0;word-break:break-all}
.qd-chk{display:flex;align-items:center;gap:7px;padding:4px 0;font-size:12.5px}
.qd-chk .st{width:16px;text-align:center;flex-shrink:0}
.qd-chk.ok .st{color:#3ECFB2}
.qd-chk.bad .st{color:#E5484D}
.qd-chk .dt{color:#8B95A7;font-size:11px;margin-left:6px}
.qd-seg{display:inline-flex;background:#0E1219;border:1px solid #232A38;border-radius:9px;padding:2px;gap:2px}
.qd-seg button{background:transparent;border:none;color:#8B95A7;font-size:11.5px;padding:4px 11px;border-radius:7px;cursor:pointer}
.qd-seg button.on{background:#1C2330;color:#E6EAF2;font-weight:600}
.qd-toast{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:#1C2330;border:1px solid #2C3547;color:#E6EAF2;padding:8px 16px;border-radius:10px;font-size:12px;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:86%}
.qd-toast.bad{border-color:rgba(229,72,77,.5)}
.qd-hint{color:#66708A;font-size:11px;margin:2px 18px 6px}
.qd-offline{margin:6px 16px;background:rgba(232,163,61,.1);border:1px solid rgba(232,163,61,.4);color:#E8C08A;border-radius:10px;padding:10px 12px;font-size:12px;display:flex;align-items:center;gap:10px;justify-content:space-between}
`

type Tab = 'gen' | 'dec' | 'batch' | 'check'

interface PanelProps {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}

export default function QrDeskPanel(props: PanelProps) {
  const [tab, setTab] = useState<Tab>('gen')
  const [meta, setMeta] = useState<QrMeta | null>(null)
  const [settings, setSettings] = useState<QrSettings>({ outDir: '' })
  const [toast, setToast] = useState<{ msg: string, bad?: boolean } | null>(null)
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const reloadMeta = useCallback(async () => {
    setMeta(await getMeta())
  }, [])

  useEffect(() => {
    void (async () => {
      await reloadMeta()
      setSettings(await loadSettings())
    })()
  }, [reloadMeta])

  const saveOutDir = useCallback(async (dir: string) => {
    const next = { outDir: dir }
    setSettings(next)
    try { await saveSettings(next) } catch (_) { showToast('默认目录保存失败（桥降级），本次仍可用', true) }
  }, [showToast])

  const ctx = { meta, settings, saveOutDir, showToast, onSendToChat: props.onSendToChat, reloadMeta }

  return (
    <div className="qd-root">
      <style>{css}</style>
      <div className="qd-top">
        <div className="qd-logo">▦</div>
        <div className="qd-tt">
          <b>二维码工作台</b>
          <small>{meta ? `服务在线 :${meta.port} · 生成/解码/迁移码，密钥不出本机` : '服务未连接 · 等待宿主拉起'}</small>
        </div>
        <div className="qd-tabs">
          {([['gen', '生成'], ['dec', '解码'], ['batch', '批量'], ['check', '体检']] as Array<[Tab, string]>).map(([k, label]) => (
            <button key={k} className={`qd-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="qd-body">
        {tab === 'gen' && <GenTab {...ctx} />}
        {tab === 'dec' && <DecTab {...ctx} />}
        {tab === 'batch' && <BatchTab {...ctx} />}
        {tab === 'check' && <CheckTab {...ctx} />}
      </div>

      {toast && <div className={`qd-toast${toast.bad ? ' bad' : ''}`}>{toast.msg}</div>}
    </div>
  )
}

interface TabCtx {
  meta: QrMeta | null
  settings: QrSettings
  saveOutDir: (dir: string) => Promise<void>
  showToast: (msg: string, bad?: boolean) => void
  onSendToChat?: (message: string) => void | Promise<void>
  reloadMeta: () => Promise<void>
}

function OfflineBanner({ reloadMeta }: { reloadMeta: () => Promise<void> }) {
  return (
    <div className="qd-offline">
      <span>服务未就绪：请确认插件服务已启动（设置 → 插件 → 二维码工作台）。刚装好时可稍候几秒再试。</span>
      <button className="qd-btn mini ghost" onClick={() => void reloadMeta()}>重试</button>
    </div>
  )
}

// ── 生成 ────────────────────────────────────────────────────────────────────
type GenType = 'text' | 'url' | 'wifi' | 'vcard' | 'otpauth'

function GenTab({ meta, settings, saveOutDir, showToast, reloadMeta }: TabCtx) {
  const [type, setType] = useState<GenType>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('https://')
  const [wifi, setWifi] = useState({ ssid: '', password: '', encryption: 'WPA', hidden: false })
  const [vc, setVc] = useState({ name: '', last: '', first: '', org: '', tel: '', email: '', url: '', note: '' })
  const [otp, setOtp] = useState({ otpType: 'totp', label: '', issuer: '', secret: '', algorithm: 'SHA1', digits: '6', period: '30', counter: '0' })
  const [ecl, setEcl] = useState('M')
  const [margin, setMargin] = useState('4')
  const [scale, setScale] = useState('8')
  const [outDir, setOutDir] = useState(settings.outDir)
  const [fileName, setFileName] = useState('qr')
  const [withSvg, setWithSvg] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [preview, setPreview] = useState<InspectResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setOutDir(settings.outDir) }, [settings.outDir])

  const buildTemplate = (): Record<string, unknown> => {
    if (type === 'text') return { type: 'text', fields: { text } }
    if (type === 'url') return { type: 'url', fields: { url } }
    if (type === 'wifi') return { type: 'wifi', fields: { ...wifi } }
    if (type === 'vcard') return { type: 'vcard', fields: { ...vc } }
    return { type: 'otpauth', fields: { ...otp, digits: Number(otp.digits), period: Number(otp.period), counter: Number(otp.counter) } }
  }

  const run = async () => {
    if (!meta) return
    setBusy(true); setErr(''); setPreview(null)
    try {
      const body: Record<string, unknown> = { template: buildTemplate(), ecl, margin: Number(margin), scale: Number(scale) }
      if (outDir.trim()) body.save = { outDir: outDir.trim(), fileName: fileName || 'qr', withSvg }
      const r = await apiGenerate(meta, body)
      setResult(r)
      if (r.payload.startsWith('otpauth://')) {
        try { setPreview(await apiInspect(meta, r.payload)) } catch (_) { /* 解读失败不影响主结果 */ }
      }
      if (r.savedTo) showToast(`已保存 ${r.savedTo.length} 个文件`)
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div>
      {!meta && <OfflineBanner reloadMeta={reloadMeta} />}
      <div className="qd-sec"><span className="qd-bar" />类型</div>
      <div className="qd-card">
        <div className="qd-row">
          <div className="qd-seg">
            {([['text', '文本'], ['url', 'URL'], ['wifi', 'WiFi'], ['vcard', '名片'], ['otpauth', 'OTP']] as Array<[GenType, string]>).map(([k, l]) => (
              <button key={k} className={type === k ? 'on' : ''} onClick={() => { setType(k); setResult(null); setPreview(null); setErr('') }}>{l}</button>
            ))}
          </div>
        </div>
        {type === 'text' && (
          <div className="qd-row"><textarea className="qd-txa" rows={3} placeholder="任意文本（自动按 UTF-8 编码，超容量会提示）" value={text} onChange={(e) => setText(e.target.value)} /></div>
        )}
        {type === 'url' && (
          <div className="qd-row"><span className="qd-lbl">网址</span><input className="qd-inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
        )}
        {type === 'wifi' && (
          <>
            <div className="qd-row"><span className="qd-lbl">SSID</span><input className="qd-inp" value={wifi.ssid} onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })} placeholder="WiFi 名称（;,:&quot;\ 会自动转义）" /></div>
            <div className="qd-row"><span className="qd-lbl">密码</span><input className="qd-inp" value={wifi.password} onChange={(e) => setWifi({ ...wifi, password: e.target.value })} /></div>
            <div className="qd-row">
              <span className="qd-lbl">加密</span>
              <select className="qd-sel" value={wifi.encryption} onChange={(e) => setWifi({ ...wifi, encryption: e.target.value })}>
                <option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">开放（无密码）</option>
              </select>
              <label className="qd-chk"><input type="checkbox" checked={wifi.hidden} onChange={(e) => setWifi({ ...wifi, hidden: e.target.checked })} />隐藏网络</label>
            </div>
          </>
        )}
        {type === 'vcard' && (
          <>
            <div className="qd-row"><span className="qd-lbl">姓名*</span><input className="qd-inp" value={vc.name} onChange={(e) => setVc({ ...vc, name: e.target.value })} /></div>
            <div className="qd-row"><span className="qd-lbl">姓/名</span><input className="qd-inp" value={vc.last} onChange={(e) => setVc({ ...vc, last: e.target.value })} placeholder="姓" /><input className="qd-inp" value={vc.first} onChange={(e) => setVc({ ...vc, first: e.target.value })} placeholder="名" /></div>
            <div className="qd-row"><span className="qd-lbl">电话</span><input className="qd-inp" value={vc.tel} onChange={(e) => setVc({ ...vc, tel: e.target.value })} /></div>
            <div className="qd-row"><span className="qd-lbl">邮箱</span><input className="qd-inp" value={vc.email} onChange={(e) => setVc({ ...vc, email: e.target.value })} /></div>
            <div className="qd-row"><span className="qd-lbl">组织</span><input className="qd-inp" value={vc.org} onChange={(e) => setVc({ ...vc, org: e.target.value })} /></div>
            <div className="qd-row"><span className="qd-lbl">备注</span><input className="qd-inp" value={vc.note} onChange={(e) => setVc({ ...vc, note: e.target.value })} /></div>
          </>
        )}
        {type === 'otpauth' && (
          <>
            <div className="qd-row">
              <span className="qd-lbl">类型</span>
              <select className="qd-sel" value={otp.otpType} onChange={(e) => setOtp({ ...otp, otpType: e.target.value })}><option value="totp">TOTP（时间）</option><option value="hotp">HOTP（计数）</option></select>
              <span className="qd-lbl">算法</span>
              <select className="qd-sel" value={otp.algorithm} onChange={(e) => setOtp({ ...otp, algorithm: e.target.value })}><option>SHA1</option><option>SHA256</option><option>SHA512</option></select>
            </div>
            <div className="qd-row"><span className="qd-lbl">标签</span><input className="qd-inp" value={otp.label} onChange={(e) => setOtp({ ...otp, label: e.target.value })} placeholder="GitHub:alice 或 alice" /></div>
            <div className="qd-row"><span className="qd-lbl">密钥</span><input className="qd-inp" value={otp.secret} onChange={(e) => setOtp({ ...otp, secret: e.target.value })} placeholder="Base32，如 JBSWY3DPEHPK3PXP" /></div>
            <div className="qd-row">
              <span className="qd-lbl">位数</span>
              <select className="qd-sel" value={otp.digits} onChange={(e) => setOtp({ ...otp, digits: e.target.value })}><option value="6">6</option><option value="8">8</option></select>
              {otp.otpType === 'totp'
                ? <><span className="qd-lbl">周期</span><input className="qd-inp" style={{ maxWidth: 90 }} value={otp.period} onChange={(e) => setOtp({ ...otp, period: e.target.value })} /></>
                : <><span className="qd-lbl">计数</span><input className="qd-inp" style={{ maxWidth: 90 }} value={otp.counter} onChange={(e) => setOtp({ ...otp, counter: e.target.value })} /></>}
            </div>
          </>
        )}
      </div>

      <div className="qd-sec"><span className="qd-bar" />参数</div>
      <div className="qd-card">
        <div className="qd-row">
          <span className="qd-lbl">纠错</span>
          <select className="qd-sel" value={ecl} onChange={(e) => setEcl(e.target.value)}><option value="L">L（7%）</option><option value="M">M（15%）</option><option value="Q">Q（25%）</option><option value="H">H（30%）</option></select>
          <span className="qd-lbl">静区</span><input className="qd-inp" style={{ maxWidth: 70 }} value={margin} onChange={(e) => setMargin(e.target.value)} />
          <span className="qd-lbl">像素</span><input className="qd-inp" style={{ maxWidth: 70 }} value={scale} onChange={(e) => setScale(e.target.value)} title="PNG 每模块像素" />
        </div>
        <div className="qd-row">
          <span className="qd-lbl">目录</span><input className="qd-inp" value={outDir} onChange={(e) => setOutDir(e.target.value)} placeholder="可选：PNG 落盘目录（绝对路径），留空只预览" />
          <button className="qd-btn mini ghost" onClick={() => void saveOutDir(outDir.trim())} disabled={!outDir.trim()}>存为默认</button>
        </div>
        {outDir.trim() !== '' && (
          <div className="qd-row">
            <span className="qd-lbl">文件名</span><input className="qd-inp" style={{ maxWidth: 160 }} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            <label className="qd-chk"><input type="checkbox" checked={withSvg} onChange={(e) => setWithSvg(e.target.checked)} />同时存 SVG</label>
          </div>
        )}
        <div className="qd-row">
          <button className="qd-btn" onClick={() => void run()} disabled={busy || !meta}>{busy ? '生成中…' : '生成二维码'}</button>
        </div>
      </div>

      {err && <div className="qd-err">{err}</div>}
      {result && (
        <>
          <div className="qd-prev" dangerouslySetInnerHTML={{ __html: result.svg }} />
          <div className="qd-meta">
            <span>模块 {result.meta.modules}×{result.meta.modules}</span>
            <span>载荷 {result.meta.bytes} 字节</span>
            <span>纠错 {result.meta.ecl}</span>
            <span>PNG {result.meta.pixelSize}px</span>
            {result.savedTo && <span>已存 {result.savedTo.length} 个文件</span>}
          </div>
          {result.savedTo && <div className="qd-ok">已落盘：{result.savedTo.join('、')}</div>}
          <div className="qd-sec"><span className="qd-bar" />载荷</div>
          <div className="qd-card">
            <div className="qd-pre">{result.payload}</div>
            <CopyBtn text={result.payload} showToast={showToast} label="复制载荷" />
          </div>
          {preview && preview.preview && (
            <div className="qd-card">
              <div className="qd-code">
                <b>{preview.preview.code}</b>
                <small>{preview.preview.kind === 'totp' ? `每 ${preview.preview.period}s 刷新` : `计数 ${preview.preview.counter}`}</small>
              </div>
              <div className="qd-hint">扫码后验证器 App 应显示同一数字</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CopyBtn({ text, showToast, label }: { text: string, showToast: (m: string, b?: boolean) => void, label: string }) {
  return (
    <button
      className="qd-btn mini ghost"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => showToast('已复制')).catch(() => showToast('复制失败', true))
      }}
    >{label}</button>
  )
}

// ── 解码 ────────────────────────────────────────────────────────────────────
function DecTab({ meta, showToast, onSendToChat, reloadMeta }: TabCtx) {
  const [result, setResult] = useState<DecodeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [imgPath, setImgPath] = useState('')
  const [hot, setHot] = useState(false)

  const decodeBytes = useCallback(async (bytes: ArrayBuffer) => {
    if (!meta) return
    setBusy(true); setErr(''); setResult(null)
    try {
      const base64 = arrayBufferToBase64(bytes)
      setResult(await apiDecode(meta, { imageBase64: base64 }))
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }, [meta])

  // 粘贴图片（截图即贴即解）
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const items = ev.clipboardData?.items
      if (!items) return
      for (const it of Array.from(items)) {
        if (it.type === 'image/png' || it.type === 'image/jpeg') {
          const f = it.getAsFile()
          if (f) { void f.arrayBuffer().then(decodeBytes); ev.preventDefault(); return }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [decodeBytes])

  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault(); setHot(false)
    const f = ev.dataTransfer.files?.[0]
    if (f) void f.arrayBuffer().then(decodeBytes)
  }

  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) void f.arrayBuffer().then(decodeBytes)
    }
    input.click()
  }

  const decodePath = async () => {
    if (!meta || !imgPath.trim()) return
    setBusy(true); setErr(''); setResult(null)
    try { setResult(await apiDecode(meta, { imagePath: imgPath.trim() })) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div>
      {!meta && <OfflineBanner reloadMeta={reloadMeta} />}
      <div
        className={`qd-drop${hot ? ' hot' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setHot(true) }}
        onDragLeave={() => setHot(false)}
        onDrop={onDrop}
        onClick={pickFile}
        role="button"
        tabIndex={0}
      >
        {busy ? '解码中…' : '拖图片到这里 / 点击选择 / 直接 Ctrl+V 粘贴截图'}
        <div className="qd-hint">支持 PNG / JPEG ≤10MB ≤4096×4096，自动反色检测</div>
      </div>
      <div className="qd-card">
        <div className="qd-row">
          <span className="qd-lbl">路径</span>
          <input className="qd-inp" value={imgPath} onChange={(e) => setImgPath(e.target.value)} placeholder="或输入图片绝对路径（与 MCP qr_decode 相同入口）" />
          <button className="qd-btn mini" onClick={() => void decodePath()} disabled={busy || !imgPath.trim()}>解码</button>
        </div>
      </div>

      {err && <div className="qd-err">{err}</div>}
      {result && !result.found && <div className="qd-ok">{result.message || '未找到二维码'}</div>}
      {result?.found && (
        <>
          <div className="qd-sec"><span className="qd-bar" />载荷</div>
          <div className="qd-card">
            <div className="qd-pre">{result.payload}</div>
            <div className="qd-row">
              <CopyBtn text={result.payload || ''} showToast={showToast} label="复制载荷" />
              {onSendToChat && (
                <button className="qd-btn mini ghost" onClick={() => void onSendToChat(`我解码了一个二维码（${result.format} ${result.width}×${result.height}），载荷：\n\n${result.payload}\n\n请帮我解读这段内容。`)}>发到对话</button>
              )}
              <span className="qd-meta" style={{ margin: 0 }}>{result.format} {result.width}×{result.height}</span>
            </div>
          </div>
          {result.inspected && (
            <>
              <div className="qd-sec"><span className="qd-bar" />解读</div>
              <div className="qd-card"><KvValue value={result.inspected} /></div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** 解读结果的递归渲染（跳过空值） */
function KvValue({ value, depth = 0 }: { value: unknown, depth?: number }) {
  if (value == null || value === '') return null
  if (Array.isArray(value)) {
    if (!value.length) return null
    return <div className="qd-kv sub">{value.map((v, i) => <div key={i}><KvValue value={v} depth={depth + 1} /></div>)}</div>
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== '')
    if (!entries.length) return null
    return (
      <div className="qd-kv sub">
        {entries.map(([k, v]) => (
          <div key={k} className="qd-kv">
            <span className="k">{k}: </span>
            <KvValue value={v} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }
  if (depth === 0) return <div className="v">{String(value)}</div>
  return <span className="v">{String(value)}</span>
}

// ── 批量 ────────────────────────────────────────────────────────────────────
function BatchTab({ meta, settings, saveOutDir, showToast, reloadMeta }: TabCtx) {
  const [mode, setMode] = useState<'csv' | 'json'>('csv')
  const [csv, setCsv] = useState('ssid,pass\n客厅,pw-123\n卧室,pw-456')
  const [rowsJson, setRowsJson] = useState('[{"name":"张三","tel":"+8613800000000"}]')
  const [tplType, setTplType] = useState('wifi')
  const [fieldsJson, setFieldsJson] = useState('{\n  "ssid": "{ssid}",\n  "password": "{pass}",\n  "encryption": "WPA"\n}')
  const [outDir, setOutDir] = useState(settings.outDir)
  const [fileBase, setFileBase] = useState('qr')
  const [nameCol, setNameCol] = useState('')
  const [job, setJob] = useState<BatchJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const stopPoll = useRef(false)

  useEffect(() => { setOutDir(settings.outDir) }, [settings.outDir])
  useEffect(() => () => { stopPoll.current = true }, [])

  const poll = useCallback(async (jobId: string) => {
    if (!meta) return
    stopPoll.current = false
    for (;;) {
      if (stopPoll.current) return
      try {
        const j = await apiJob(meta, jobId)
        setJob(j)
        if (j.status !== 'running') {
          if (j.status === 'done') showToast(`批量完成：${j.done}/${j.total}`)
          else showToast(`批量失败：${j.error || '未知错误'}`, true)
          return
        }
      } catch (e) {
        setErr((e as Error).message)
        return
      }
      await new Promise((r) => setTimeout(r, 350))
    }
  }, [meta, showToast])

  const start = async () => {
    if (!meta) return
    setBusy(true); setErr(''); setJob(null)
    try {
      const body: Record<string, unknown> = {
        template: { type: tplType, fields: JSON.parse(fieldsJson) },
        outDir: outDir.trim(), fileBase, nameCol,
      }
      if (mode === 'csv') body.csv = csv
      else body.rows = JSON.parse(rowsJson)
      const r = await apiBatchStart(meta, body)
      await poll(r.jobId)
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div>
      {!meta && <OfflineBanner reloadMeta={reloadMeta} />}
      <div className="qd-sec"><span className="qd-bar" />行数据</div>
      <div className="qd-card">
        <div className="qd-row">
          <div className="qd-seg">
            <button className={mode === 'csv' ? 'on' : ''} onClick={() => { setMode('csv'); setTplType('wifi'); setFieldsJson('{\n  "ssid": "{ssid}",\n  "password": "{pass}",\n  "encryption": "WPA"\n}') }}>CSV</button>
            <button className={mode === 'json' ? 'on' : ''} onClick={() => { setMode('json'); setTplType('vcard'); setFieldsJson('{\n  "name": "{name}",\n  "tel": "{tel}"\n}') }}>JSON</button>
          </div>
        </div>
        {mode === 'csv'
          ? <textarea className="qd-txa" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} />
          : <textarea className="qd-txa" rows={5} value={rowsJson} onChange={(e) => setRowsJson(e.target.value)} />}
        <div className="qd-hint">首行表头；fields 里用 {'{列名}'} 引用每行的值</div>
      </div>

      <div className="qd-sec"><span className="qd-bar" />模板</div>
      <div className="qd-card">
        <div className="qd-row">
          <span className="qd-lbl">类型</span>
          <select className="qd-sel" value={tplType} onChange={(e) => setTplType(e.target.value)}>
            <option value="text">text</option><option value="url">url</option><option value="wifi">wifi</option><option value="vcard">vcard</option><option value="otpauth">otpauth</option>
          </select>
        </div>
        <div className="qd-row"><textarea className="qd-txa" rows={5} value={fieldsJson} onChange={(e) => setFieldsJson(e.target.value)} /></div>
      </div>

      <div className="qd-sec"><span className="qd-bar" />输出</div>
      <div className="qd-card">
        <div className="qd-row">
          <span className="qd-lbl">目录</span><input className="qd-inp" value={outDir} onChange={(e) => setOutDir(e.target.value)} placeholder="绝对路径（必填）" />
          <button className="qd-btn mini ghost" onClick={() => void saveOutDir(outDir.trim())} disabled={!outDir.trim()}>存为默认</button>
        </div>
        <div className="qd-row">
          <span className="qd-lbl">前缀</span><input className="qd-inp" style={{ maxWidth: 140 }} value={fileBase} onChange={(e) => setFileBase(e.target.value)} />
          <span className="qd-lbl">名列</span><input className="qd-inp" style={{ maxWidth: 140 }} value={nameCol} onChange={(e) => setNameCol(e.target.value)} placeholder="可选：用作文件名的列" />
        </div>
        <div className="qd-row"><button className="qd-btn" onClick={() => void start()} disabled={busy || !meta || !outDir.trim()}>{busy ? '执行中…' : '开始批量生成'}</button></div>
        <div className="qd-hint">同名文件自动 -2 递增，永不覆盖；≤500 行</div>
      </div>

      {err && <div className="qd-err">{err}</div>}
      {job && (
        <div className="qd-card">
          <div className="qd-row"><b>{job.status === 'running' ? '进行中' : job.status === 'done' ? '完成' : '失败'}</b><span className="qd-meta" style={{ margin: 0 }}>{job.done}/{job.total}</span></div>
          <div className="qd-prog"><i style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%` }} /></div>
          {job.error && <div className="qd-err" style={{ margin: 0 }}>{job.error}</div>}
          {job.files.length > 0 && (
            <div className="qd-files">
              {job.files.map((f) => <div key={f.file}>{f.file}（{formatSize(f.bytes)}）</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatSize(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`
}

// ── 体检 ────────────────────────────────────────────────────────────────────
function CheckTab({ meta, showToast, reloadMeta }: TabCtx) {
  const [result, setResult] = useState<SelftestResult | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!meta) return
    setBusy(true)
    try { setResult(await apiSelftest(meta)) }
    catch (e) { showToast((e as Error).message, true) }
    finally { setBusy(false) }
  }

  return (
    <div>
      {!meta && <OfflineBanner reloadMeta={reloadMeta} />}
      <div className="qd-sec"><span className="qd-bar" />试金石自检</div>
      <div className="qd-card">
        <div className="qd-row">
          <button className="qd-btn" onClick={() => void run()} disabled={busy || !meta}>{busy ? '运行中…' : '运行 12 项自检'}</button>
          {result && <span className="qd-meta" style={{ margin: 0 }}>通过 {result.pass}/{result.items.length}{result.fail ? `，失败 ${result.fail}` : ''}</span>}
        </div>
        <div className="qd-hint">RFC 4226/6238 OTP 金标 · WiFi/vCard/迁移码 round-trip · 生成→PNG→解码闭环 · 护栏拒绝 · CSV/批量命名</div>
        {result && (
          <div className="qd-kv" style={{ marginTop: 8 }}>
            {result.items.map((it) => (
              <div key={it.name} className={`qd-chk ${it.ok ? 'ok' : 'bad'}`}>
                <span className="st">{it.ok ? '✓' : '✗'}</span>
                <span>{it.name}</span>
                {!it.ok && <span className="dt">{it.detail}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="qd-sec"><span className="qd-bar" />隐私口径</div>
      <div className="qd-card">
        <div className="qd-hint" style={{ fontSize: 12, lineHeight: 1.7 }}>
          全程本地计算零外联；解码结果与生成载荷不落 kv、不进日志；kv 仅存「默认输出目录」一项设置。
          密钥类载荷（WiFi 密码 / 2FA secret / 迁移码）只在你主动生成或解码时存在于内存与服务响应里。
        </div>
      </div>
    </div>
  )
}
