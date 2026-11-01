/**
 * 语言包 Tab：内置（随包离线）+ 可选（按需下载，唯一外网流量=模型文件本身）
 */
import { useCallback, useEffect, useState } from 'react'
import { opAction, core, type ServiceMeta, type LangInfo } from './model'

interface Props {
  meta: ServiceMeta | null
  onRefresh: () => Promise<void>
}

export default function LangsTab({ meta, onRefresh }: Props) {
  const [groups, setGroups] = useState<{ builtin: LangInfo[]; optional: LangInfo[]; cacheDir: string | null } | null>(null)
  const [downloading, setDownloading] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const reload = useCallback(async () => {
    if (!meta) return
    try {
      const r = await opAction(meta, 'langs')
      if (r.ok) setGroups(r as unknown as { builtin: LangInfo[]; optional: LangInfo[]; cacheDir: string | null })
    } catch { /* 服务未就绪 */ }
  }, [meta])

  useEffect(() => { reload() }, [reload])

  const download = useCallback(async (codes: string[]) => {
    if (!meta) return
    setErr(''); setNotice('')
    setDownloading(codes)
    try {
      const r = await opAction(meta, 'download_lang', { codes })
      const rep = (r as unknown as { ok: boolean; results?: { code: string; ok: boolean; error?: string; cached?: boolean }[] })
      if (!rep.ok) setErr('下载失败')
      else {
        for (const x of rep.results || []) {
          if (x.ok) setNotice((n) => `${n}${x.cached ? `${x.code} 已存在，免下载。` : `${x.code} 下载完成。`}`)
          else setErr((e) => `${e}${x.code}：${x.error}`)
        }
        await reload()
        await onRefresh()
      }
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setDownloading([])
    }
  }, [meta, reload, onRefresh])

  const row = (l: LangInfo, canDownload: boolean) => (
    <div key={l.code} className="ob-row">
      <div className="ob-row-h">
        <b style={{ fontSize: 12 }}>{l.name}</b>
        <span className="ob-tag ob-mono">{l.code}</span>
        {l.installed
          ? <span className="ob-badge good">已装</span>
          : (canDownload
            ? <button className="ob-btn ghost sm" disabled={downloading.includes(l.code)} onClick={() => download([l.code])}>
              {downloading.includes(l.code) ? '下载中…' : '下载'}
            </button>
            : <span className="ob-badge warn">待解压</span>)}
      </div>
    </div>
  )

  return (
    <div>
      <div className="ob-sec"><span className="ob-bar" />语言包
        <span className="ob-hint">tessdata_fast 档 · 下载仅含模型文件本身</span>
      </div>
      <div className="ob-card"><div className="ob-card-b">
        <div className="ob-sub">
          简体中文 + 英语随包内置、离线即用；其余语言首次使用需联网下载一次（缓存到本机应用数据目录，此后离线可用）。
          识别永远全本地执行——图像与文本数据不外发，下载的只有模型文件。
        </div>
        {err && <div className="ob-err">✗ {err}</div>}
        {notice && <div className="ob-sub ob-ok">{notice}</div>}
      </div></div>
      <div className="ob-card">
        {groups ? (
          <>
            {(groups.builtin || []).map((l) => row(l, false))}
            {(groups.optional || []).map((l) => row(l, true))}
            {groups.cacheDir && <div className="ob-row"><div className="ob-sub ob-mono">缓存目录：{groups.cacheDir}</div></div>}
          </>
        ) : <div className="ob-empty">服务未连接，无法读取语言包清单。</div>}
      </div>
      <div className="ob-card"><div className="ob-card-b">
        <div className="ob-sub">
          全部 {core.LANGS.length} 种语言均为 Tesseract 社区 fast 档模型（体积小速度快）；对识别质量要求高的整卷文档可拆半重试或提高扫描分辨率。手写体不在可靠识别范围内。
        </div>
      </div></div>
    </div>
  )
}
