/**
 * 导入 Tab：拖拽/选文件 → 本地解析预览 → 确认入库 → 批次历史与撤销。
 * 解析全在浏览器本地完成（FileReader → core.parseBillFile），零上传零服务。
 */
import { useRef, useState } from 'react'
import * as core from '../shared/core'
import { confirmImport, forgetImport, previewImport, type ImportPreview } from './model'
import type { TabProps } from './Panel'

type Props = TabProps & { months: string[] }

function fmtYuan(fen: number): string {
  return core.fenToYuan(Math.round(Number(fen) || 0))
}

export default function ImportTab({ data, cache, reload, showToast }: Props) {
  const [over, setOver] = useState(false)
  const [password, setPassword] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [parseErr, setParseErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmForget, setConfirmForget] = useState<string | null>(null)
  const fileRef = useRef<File | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const parse = async (file: File, pw?: string) => {
    fileRef.current = file
    setParseErr('')
    setPreview(null)
    setBusy(true)
    try {
      const p = await previewImport(file, pw || undefined)
      setPreview(p)
    } catch (e) {
      setParseErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onFiles = (files: FileList | null) => {
    const f = files && files[0]
    if (!f) return
    void parse(f, password)
  }

  const doImport = async () => {
    const file = fileRef.current
    if (!file) return
    setBusy(true)
    try {
      const batch = await confirmImport(cache, file, password || undefined)
      setPreview(null)
      fileRef.current = null
      showToast(`已入库 ${batch.newCount} 笔${batch.dupCount ? `，跳过重复 ${batch.dupCount} 笔` : ''}`)
      await reload()
    } catch (e) {
      const msg = (e as Error).message
      setParseErr(msg)
      showToast(msg, true)
    } finally {
      setBusy(false)
    }
  }

  const doForget = async (importId: string) => {
    if (confirmForget !== importId) {
      setConfirmForget(importId)
      setTimeout(() => setConfirmForget((cur) => (cur === importId ? null : cur)), 4000)
      return
    }
    setConfirmForget(null)
    try {
      const n = await forgetImport(cache, importId)
      showToast(`已撤销该批次（移除 ${n} 笔）`)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  return (
    <div>
      <div
        className={`dz-drop ${over ? 'over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          onFiles(e.dataTransfer.files)
        }}
      >
        把微信 / 支付宝账单文件拖到这里，或点击选择文件<br />
        <span className="dz-sub">支持邮箱下载的 zip（加密需输解压密码）或已解压的 CSV · 解析在本机完成，不上传任何内容</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.csv,.txt"
        style={{ display: 'none' }}
        data-testid="dz-file-input"
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }}
      />

      <div className="dz-card">
        <div className="dz-card-b">
          <label className="dz-lbl" htmlFor="dz-pw">zip 解压密码（可选；微信账单密码在「微信支付」通知消息里）</label>
          <div className="dz-row">
            <input
              id="dz-pw"
              className="dz-inp dz-grow"
              type="password"
              placeholder="仅加密 zip 需要；密码只在本次导入的内存里用一次"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="dz-btn ghost" disabled={!fileRef.current || busy} onClick={() => { if (fileRef.current) void parse(fileRef.current, password) }}>
              用此密码重试
            </button>
          </div>
        </div>
      </div>

      {parseErr && <div className="dz-err">解析失败：{parseErr}</div>}
      {busy && <div className="dz-empty">解析中…（大文件可能要几秒）</div>}

      {preview && (
        <div className="dz-card">
          <div className="dz-sec"><span className="dz-bar" />导入预览<button className="dz-hint" onClick={() => { setPreview(null); fileRef.current = null }}>取消</button></div>
          <div className="dz-card-b">
            <div className="dz-row" style={{ marginBottom: 6 }}>
              <span className={`dz-tag ${preview.source === 'wechat' ? 'green' : 'blue'}`}>{preview.source === 'wechat' ? '微信账单' : '支付宝账单'}</span>
              <span className="dz-tag">{preview.rows} 笔</span>
              {preview.span && <span className="dz-tag">{preview.span}</span>}
              {preview.csvName && <span className="dz-tag dz-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview.csvName}</span>}
            </div>
            <div className="dz-grid">
              <div className="dz-stat"><small>收入</small><b className="dz-num" style={{ color: '#3FB950' }}>{fmtYuan(preview.inFen)}</b></div>
              <div className="dz-stat"><small>支出</small><b className="dz-num" style={{ color: '#F85149' }}>{fmtYuan(preview.outFen)}</b></div>
            </div>
            {preview.refundFen > 0 && <div className="dz-sub" style={{ marginTop: 6 }}>退款 {fmtYuan(preview.refundFen)} 元（单列口径，不计收支）</div>}
            <div style={{ marginTop: 10 }}>
              <button className="dz-btn gold" disabled={busy} onClick={() => void doImport()}>确认入库</button>
            </div>
          </div>
        </div>
      )}

      <div className="dz-sec"><span className="dz-bar" />导入历史<span className="dz-hint">导错可整批撤销</span></div>
      {(!data || data.imports.length === 0) ? (
        <div className="dz-empty">还没有导入记录。第一次用？看「规则」Tab 的三步指引。</div>
      ) : (
        data.imports.map((b) => (
          <div className="dz-card" key={b.id}>
            <div className="dz-card-b">
              <div className="dz-row">
                <span className={`dz-tag ${b.src === 'wechat' ? 'green' : 'blue'}`}>{b.src === 'wechat' ? '微信' : '支付宝'}</span>
                <span className="dz-grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                  {b.file.split(/[\\/]/).pop()}{b.dupCount ? `（跳过重复 ${b.dupCount}）` : ''}
                </span>
                <span className="dz-num" style={{ fontSize: 12 }}>{b.newCount} 笔</span>
              </div>
              <div className="dz-row" style={{ marginTop: 4 }}>
                <span className="dz-sub dz-grow">{b.span || '—'} · {b.at.slice(0, 16).replace('T', ' ')}</span>
                <button
                  className={`dz-btn sm ${confirmForget === b.id ? 'danger' : 'ghost'}`}
                  onClick={() => void doForget(b.id)}
                >
                  {confirmForget === b.id ? '确认撤销？' : '撤销'}
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
