/**
 * 知识库 Tab：搜索 + 主题列表 + 正文阅读。
 * 搜索逻辑走 shared/forge-core（与 MCP forge_search 同口径）。
 */
import React, { useMemo, useState } from 'react'
import { KB_META, type TopicMeta } from './model'
import { KB_BODIES } from './kbBodies'
import { searchTopics, snippetFor } from '../shared/forge-core'

const S = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 10, height: '100%' },
  search: {
    width: '100%', boxSizing: 'border-box' as const, padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--p-border, rgba(128,128,128,.3))',
    background: 'transparent', color: 'inherit', fontSize: 13,
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 6, overflowY: 'auto' as const },
  card: {
    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
    background: 'var(--p-panel, rgba(128,128,128,.08))',
  },
  title: { fontWeight: 600, fontSize: 13 },
  summary: { fontSize: 12, color: 'var(--p-text-dim, #999)', marginTop: 2, lineHeight: 1.5 },
  body: {
    padding: 14, borderRadius: 10, background: 'var(--p-panel, rgba(128,128,128,.08))',
    whiteSpace: 'pre-wrap' as const, fontSize: 12.5, lineHeight: 1.75, overflowY: 'auto' as const,
  },
  tag: {
    display: 'inline-block', margin: '4px 6px 0 0', padding: '1px 8px', borderRadius: 999,
    fontSize: 11, background: 'var(--p-chip, rgba(128,128,128,.15))',
  },
}

export default function KbTab() {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const results = useMemo(() => {
    if (!query.trim()) return null
    return searchTopics(KB_META.topics, KB_BODIES, query)
  }, [query])

  const openBody = openId ? KB_BODIES[openId] || '' : ''

  if (openId) {
    const meta = KB_META.topics.find((t) => t.id === openId)
    return (
      <div style={S.wrap}>
        <div>
          <button
            onClick={() => setOpenId(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--p-accent, #4a7dff)', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >← 返回列表</button>
          <strong style={{ marginLeft: 10 }}>{meta?.title}</strong>
        </div>
        <div style={S.body}>{openBody}</div>
      </div>
    )
  }

  const list: Array<{ meta: TopicMeta; snippet?: string }> = results
    ? results.map((r) => ({ meta: r.meta, snippet: snippetFor(KB_BODIES[r.meta.id] || '', query) }))
    : KB_META.topics.map((t) => ({ meta: t }))

  return (
    <div style={S.wrap}>
      <input
        style={S.search}
        placeholder="搜索平台知识（如：跨域 / 单写者 / 冒烟 / 图标白名单 / 发布）…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div style={{ fontSize: 12, color: 'var(--p-text-dim, #999)' }}>
        {KB_META.topics.length} 个主题 · 数据版本 {KB_META.updatedAt} · 全部结论代码级核实，与官方文档冲突处已标注
      </div>
      <div style={S.list}>
        {list.map(({ meta, snippet }) => (
          <div key={meta.id} style={S.card} onClick={() => setOpenId(meta.id)}>
            <div style={S.title}>{meta.title}</div>
            <div style={S.summary}>{snippet || meta.summary}</div>
            <div>{meta.tags.slice(0, 6).map((t) => <span key={t} style={S.tag}>{t}</span>)}</div>
          </div>
        ))}
        {list.length === 0 && (
          <div style={{ color: 'var(--p-text-dim, #999)', padding: 12 }}>没有匹配「{query}」的主题。试试：跨域、冒烟、发布、单写者。</div>
        )}
      </div>
    </div>
  )
}
