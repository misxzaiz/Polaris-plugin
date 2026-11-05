/**
 * 文件魔数透视台面板：路径输入 → 类型识别 + dump 视图。
 * 引擎复用 shared/hex-core.js（与 MCP 同一权威，esbuild 打包进 bundle，纯本地只读）。
 * 面板侧经宿主 invoke 读文件头（__POLARIS_HOST_INVOKE__ → get_file_content）。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/hex-core.js'

const CSS = `
.hl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.hl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hl-head b{font-size:13px}
.hl-head .sub{color:#5C6678;font-size:11px}
.hl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.hl-row{display:flex;gap:8px}
.hl-input{flex:1;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#E6EAF2;font:12px ui-monospace,Consolas,monospace;padding:7px 10px;outline:none}
.hl-input:focus{border-color:#4fd1a0}
.hl-btn{background:#2b3348;border:1px solid #3a4358;color:#D5DBE8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer}
.hl-btn:disabled{opacity:.5;cursor:not-allowed}
.hl-verdict{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid}
.hl-verdict.bad{background:#2b2413;border-color:#e8590c;color:#f3b377}
.hl-verdict.ok{background:#12241a;border-color:#2f9e44;color:#8ce0b0}
.hl-dump{background:#161c2a;border:1px solid #2b3348;border-radius:8px;padding:10px 13px;font:11.5px/1.7 ui-monospace,Consolas,monospace;white-space:pre;overflow-x:auto;color:#c9cede}
.hl-note{color:#5C6678;font-size:11px;line-height:1.6}
`

type InspectResult = {
  filename: string; size: number; readBytes: number; entropy: number
  hits: { name: string; matchedAt: number }[]; isTextLike: boolean
  extWarning: string | null; headDump: string
}

export default function HexLensPanel(_props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  const [path, setPath] = useState('')
  const [result, setResult] = useState<InspectResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const summary = useMemo(() => {
    if (!result) return null
    return { entropy: result.entropy, high: result.entropy > 7.2 }
  }, [result])

  const inspect = async () => {
    setError(null)
    setBusy(true)
    try {
      const invoke = (window as unknown as { __POLARIS_HOST_INVOKE__?: <T>(c: string, a?: Record<string, unknown>) => Promise<T> }).__POLARIS_HOST_INVOKE__
      if (!invoke) throw new Error('宿主 invoke 不可用（请更新 Polaris 主应用）')
      const res = await invoke<{ ok: boolean; result?: { value?: unknown } | null; error?: string | null }>('router_dispatch', {
        req: { target: 'cap.fs', payload: { action: 'get_file_content', path } },
      })
      if (!res.ok) throw new Error(res.error || '读取失败（宿主权限或路径不存在）')
      // base64 解码为字节（cap.fs 文件内容通道）
      const content = String((res.result as { value?: string; content?: string })?.value ?? (res.result as { content?: string })?.content ?? '')
      let bytes: Uint8Array
      if (/^[A-Za-z0-9+/=\r\n]+$/.test(content.slice(0, 64)) && content.length % 4 === 0) {
        const bin = atob(content.replace(/\s+/g, ''))
        bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      } else {
        bytes = Uint8Array.from(content, (c) => c.charCodeAt(0) & 0xff)
      }
      const hits = core.identifyMagic(bytes)
      setResult({
        filename: path.split(/[\\/]/).pop() ?? path,
        size: bytes.length,
        readBytes: bytes.length,
        entropy: core.shannonEntropy(bytes),
        hits,
        isTextLike: false,
        extWarning: core.extConsistency(hits, path).warning,
        headDump: core.hexDump(core.slice(bytes, 0, 256)),
      })
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hl-root">
      <style>{CSS}</style>
      <div className="hl-head">
        <b>文件魔数透视台</b>
        <span className="sub">魔数识别 · hex dump · 熵 · 纯本地只读</span>
      </div>
      <div className="hl-body">
        <div className="hl-row">
          <input className="hl-input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="文件路径（如 D:\data\photo.jpg）" />
          <button className="hl-btn" onClick={inspect} disabled={!path.trim() || busy}>{busy ? '读取中…' : '检查'}</button>
        </div>
        {error && <div className="hl-verdict bad">{error}</div>}
        {result && summary && (
          <>
            <div className={`hl-verdict ${result.extWarning ? 'bad' : 'ok'}`}>
              {result.hits.length ? `识别：${result.hits.map((h) => h.name).join('；')}` : '无已知魔数签名'}
              {' · '}熵 {summary.entropy}/8.00{summary.high ? '（高熵：已压缩或加密特征）' : ''}
              {result.extWarning && <div>⚠ {result.extWarning}</div>}
            </div>
            <div className="hl-dump">{result.headDump}</div>
          </>
        )}
        <div className="hl-note">
          魔数表 20+ 格式（PNG/JPEG/PDF/ZIP/GZIP/ELF/PE/Mach-O/Java class/WebP/MP4/SQLite 等）。
          扩展名与实际类型不符会警告（伪装扩展名检测——不判恶意只报不一致）；高熵提示已压缩/加密（非判定）。
          面板经宿主通道读取（受宿主文件权限约束）；AI 工具 hexlens_inspect/dump 走 MCP 直读（只读头 4KB/16KB 切片）。
        </div>
      </div>
    </div>
  )
}
