/**
 * 摘录 Tab：全部金句（时间倒序），可复制、跳原文、删除。
 */
import { delQuote, timeAgo, type AmberData } from './model'

export default function QuotesTab({ data, reload, showToast, openItem }: {
  data: AmberData | null
  reload: () => Promise<unknown>
  showToast: (msg: string, bad?: boolean) => void
  openItem: (id: string) => void
}) {
  const quotes = data?.quotes ?? []
  const itemMap = new Map((data?.items ?? []).map((a) => [a.id, a]))

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制')
    } catch (_) {
      // 非安全上下文（手机 LAN http）没有 navigator.clipboard——回退手动复制
      window.prompt('手动复制（全选）：', text)
    }
  }

  const remove = async (qid: string) => {
    if (!window.confirm('删除这条摘录？')) return
    try {
      await delQuote(qid)
      await reload()
      showToast('已删除')
    } catch (e) {
      showToast(`删除失败：${(e as Error).message}`, true)
    }
  }

  return (
    <div>
      <div className="am-sec"><i className="am-bar" />金句摘录<span className="am-hint">共 {quotes.length} 条</span></div>
      {quotes.length === 0 ? (
        <div className="am-empty">
          还没有摘录。<br />打开任意一条琥珀，选中一段正文点「✂ 摘录选中文字」；<br />聊天里也可以让 AI 用 amber_quote 帮你摘。
        </div>
      ) : (
        <div className="am-card" style={{ padding: 0 }}>
          {quotes.map((q) => {
            const item = itemMap.get(q.itemId)
            return (
              <div key={q.qid} className="am-art" style={{ cursor: 'default' }}>
                <div className="am-art-main">
                  <div style={{ fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    「{q.text}」
                  </div>
                  {q.note && <div className="am-sub" style={{ marginTop: 4 }}>—— {q.note}</div>}
                  <div className="am-art-m">
                    <span style={{ cursor: 'pointer', color: '#58A6FF' }} onClick={() => openItem(q.itemId)}>
                      {q.itemTitle || item?.title || q.itemHost || q.itemId} ↗
                    </span>
                    <span>·</span>
                    <span>{timeAgo(q.createdAt)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button className="am-btn sm ghost" onClick={() => copy(q.text)}>复制</button>
                  <button className="am-btn sm danger" onClick={() => remove(q.qid)}>删</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
