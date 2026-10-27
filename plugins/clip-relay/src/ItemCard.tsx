/**
 * 条目卡：链接（标题+摘要+URL，enrich 状态）与文本两种形态 + 复制/打开/置顶/删除
 */
import { useState } from 'react'
import {
  copyText, openUrl, removeItem, setPinned, timeStr,
  type RelayItem,
} from './model'
import type { Toast } from './Panel'
import type { CopyRequest } from './Panel'

export default function ItemCard({ item, isNew, reload, showToast, requestCopy }: {
  item: RelayItem
  isNew: boolean
  reload: () => Promise<unknown>
  showToast: Toast
  requestCopy: (req: CopyRequest) => void
}) {
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const onCopy = async () => {
    const r = await copyText(item.text)
    if (r === 'ok') showToast('已复制')
    else requestCopy({ text: item.text })
  }

  const onTogglePin = async () => {
    setBusy(true)
    try {
      await setPinned(item.id, !item.pinned)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    setBusy(true)
    try {
      await removeItem(item.id)
      await reload()
      showToast('已删除')
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const onOpen = () => {
    if (!openUrl(item.url || item.text)) {
      requestCopy({ text: item.url || item.text })
      showToast('无法在面板内打开，已弹出手动复制', true)
    }
  }

  const long = item.text.length > 300
  const bodyText = expanded || !long ? item.text : `${item.text.slice(0, 300)}…`

  return (
    <div className="cr-card">
      <div className="cr-card-h">
        <span className="cr-kind">{item.kind === 'url' ? '🔗' : '📝'}</span>
        <span className="cr-from">{item.from}</span>
        <span className="cr-time">{timeStr(item.createdAt || 0)}</span>
        {isNew && <span className="cr-new">新</span>}
        <span style={{ flex: 1 }} />
        <button className="cr-icon" title={item.pinned ? '取消置顶' : '置顶'} disabled={busy} onClick={onTogglePin}>
          {item.pinned ? '📌' : '📍'}
        </button>
        <button className="cr-icon" title="删除" disabled={busy} onClick={onDelete}>🗑</button>
      </div>
      {item.kind === 'url' ? (
        <button className="cr-linkbody" onClick={onOpen}>
          <b>{item.title || item.text}</b>
          {item.desc && <span className="cr-desc">{item.desc}</span>}
          <span className="cr-url">{item.url}</span>
        </button>
      ) : (
        <div className={`cr-textbody ${expanded ? 'open' : ''}`} onClick={() => long && setExpanded(!expanded)}>
          {bodyText}
        </div>
      )}
      <div className="cr-card-a">
        <button className="cr-btn ghost sm" disabled={busy} onClick={onCopy}>复制</button>
        {item.kind === 'url' && <button className="cr-btn ghost sm" disabled={busy} onClick={onOpen}>打开</button>}
        {item.enriched && item.enrichFail && (
          <span className="cr-fail" title={item.enrichFail}>标题抓取失败</span>
        )}
        {item.kind === 'url' && item.enriched && !item.enrichFail && item.title && (
          <span className="cr-fail" style={{ color: '#3FB950' }}>已抓取标题</span>
        )}
        {item.kind === 'url' && !item.enriched && (
          <span className="cr-fail">抓取标题中…</span>
        )}
      </div>
    </div>
  )
}
