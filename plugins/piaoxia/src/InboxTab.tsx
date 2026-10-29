/**
 * InboxTab —— 收票台：拖拽 PDF/XML + 目录路径扫描 + 三色结果（新增/重复/失败）。
 * 服务负责解析与归档；入账与判重由面板对照本地 kv 判定（单一写路径）。
 */
import { useCallback, useRef, useState } from 'react'
import * as core from '../shared/core'
import type { PanelCtx } from './Panel'
import type { CollectOutcome } from './model'
import { collectFiles, commitCollect, probeService } from './model'

type Phase = 'idle' | 'reading' | 'parsing' | 'done' | 'error'

export default function InboxTab({ ctx }: { ctx: PanelCtx }) {
  const [over, setOver] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [dir, setDir] = useState('')
  const [outcomes, setOutcomes] = useState<CollectOutcome[] | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const run = useCallback(async (files: File[], dirPath: string) => {
    if (!ctx.data.meta) {
      ctx.toast('解析服务未就绪（等待宿主拉起 piaoxia 服务），稍候再试；也可以直接对 AI 说「把 XX 目录的发票收进来」', true)
      return
    }
    const bad = files.filter((f) => /\.(ofd|zip|rar|7z|jpg|jpeg|png)$/i.test(f.name))
    if (bad.length) {
      ctx.toast('不支持 ' + bad.map((f) => f.name).join('、') + '：OFD/图片/压缩包暂不解析（发票保险库不做 OCR），请从税务局下载 PDF 或 XML 版式', true)
    }
    const good = files.filter((f) => /\.(pdf|xml)$/i.test(f.name))
    if (!good.length && !dirPath.trim()) return
    setPhase(good.length && !dirPath.trim() ? 'reading' : 'parsing')
    setErrorMsg('')
    setOutcomes(null)
    try {
      let serviceHint = ''
      try { serviceHint = (await probeService(ctx.data.meta)).archiveDir || '' } catch (_) { /* 探测失败不阻塞 */ }
      void serviceHint
      const outs = await collectFiles(ctx.data.meta, good, dirPath, ctx.data.invoices, (done, total) => {
        setProgress({ done, total })
        setPhase(total > 1 ? 'reading' : 'parsing')
      })
      setPhase('parsing')
      const saved = await commitCollect(outs)
      setOutcomes(outs)
      setPhase('done')
      await ctx.reload()
      const fails = outs.filter((o) => o.kind === 'fail').length
      ctx.toast(`收票完成：入账 ${saved} 张，重复 ${outs.filter((o) => o.kind === 'dup').length} 个，失败 ${fails} 个`)
    } catch (e) {
      setPhase('error')
      setErrorMsg(String((e as Error).message))
    }
  }, [ctx])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) void run(files, '')
  }, [run])

  const busy = phase === 'reading' || phase === 'parsing'

  const added = (outcomes || []).filter((o) => o.kind === 'added')
  const dups = (outcomes || []).filter((o) => o.kind === 'dup')
  const fails = (outcomes || []).filter((o) => o.kind === 'fail')

  return (
    <div>
      {!ctx.data.meta && (
        <div className="px-infobox">
          解析服务尚未就绪（启用插件后宿主会自动拉起，一般几秒内完成）。等待期间你可以直接在 AI 对话里说
          「把 C:\Users\我\Downloads 里的发票收进来」——AI 走 MCP 通道，不依赖本面板。
        </div>
      )}
      <div
        className={'px-drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <div className="big">{busy ? '解析中…' : '把电子发票拖到这里'}</div>
        <div>支持 数电票 PDF / 数电票 XML（自动解析 20 位发票号码并判重）· 点击选择文件</div>
        <div className="px-dim" style={{ marginTop: 4 }}>
          扫描件/纸质票不做 OCR → 请到「票册」手动录入；OFD 暂不支持
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = ''
          if (files.length) void run(files, '')
        }}
      />

      <div className="px-card" style={{ marginTop: 12 }}>
        <h3>目录扫描 <span className="px-hint">整个文件夹一键收票（递归子目录，跳过隐藏目录）</span></h3>
        <div className="px-row">
          <input
            className="px-input" style={{ flex: 1, minWidth: 240 }}
            placeholder="例如 C:\Users\你\Downloads"
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && dir.trim()) void run([], dir) }}
          />
          <button className="px-btn primary" disabled={busy || !dir.trim()} onClick={() => void run([], dir)}>扫描并收票</button>
        </div>
        {busy && progress.total > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="px-bar"><i style={{ width: Math.round((progress.done / Math.max(1, progress.total)) * 100) + '%' }} /></div>
            <div className="px-dim" style={{ marginTop: 4, fontSize: 11 }}>{progress.done}/{progress.total} 已读取</div>
          </div>
        )}
        {phase === 'error' && <div className="px-warnbox" style={{ marginTop: 10 }}>{errorMsg}</div>}
      </div>

      {outcomes && (
        <div className="px-card">
          <h3>本次收票结果</h3>
          {added.length > 0 && (
            <table className="px-table">
              <thead><tr><th>新增入账</th><th>号码</th><th>销方</th><th>金额</th><th>分类</th><th>提示</th></tr></thead>
              <tbody>
                {added.map((o, i) => (
                  <tr key={i}>
                    <td className="px-ok">{o.result.invoice?.number || '（无号码）'}</td>
                    <td>{o.result.invoice?.date}</td>
                    <td>{o.result.invoice?.seller.name || <span className="px-dim">未识别</span>}</td>
                    <td>¥{o.result.invoice?.total.toFixed(2)}</td>
                    <td>{o.result.invoice && core.CATEGORIES[o.result.invoice.category]}</td>
                    <td className="px-warn">{o.result.warnings.join('；')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {dups.length > 0 && (
            <table className="px-table" style={{ marginTop: 10 }}>
              <thead><tr><th>重复跳过</th><th>已在账状态</th><th>说明</th></tr></thead>
              <tbody>
                {dups.map((o, i) => (
                  <tr key={i}>
                    <td>{o.result.name}</td>
                    <td><span className={'px-tag ' + (o.existing?.status || 'pending')}>{o.existing && core.STATUSES[o.existing.status]}</span></td>
                    <td className="px-dim">发票号码 {o.existing?.number || '？'} 已在账（¥{o.existing?.total.toFixed(2)}），账面未改动{o.result.archivedPath ? '，本次原件已补挂归档' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {fails.length > 0 && (
            <table className="px-table" style={{ marginTop: 10 }}>
              <thead><tr><th>失败</th><th>原因</th></tr></thead>
              <tbody>
                {fails.map((o, i) => (
                  <tr key={i}>
                    <td>{o.result.name}</td>
                    <td className="px-err">{o.result.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
