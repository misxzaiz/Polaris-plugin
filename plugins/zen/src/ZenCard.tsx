/**
 * 禅房聊天卡片
 *
 * 渲染 MCP 工具结果：
 * - knock_fish：小僧表情 + 敲击次数
 * - draw_fortune：签文卡片
 * - open_book：答案之书翻页
 *
 * data 格式：外部插件 MCP server 返回的 content[0].text 是 JSON 字符串，
 * 需要从中解析出结构化数据。
 */

import { createElement } from 'react'

function parseData(data) {
  if (!data || typeof data !== 'object') return null
  // 外部插件：data = { content: [{ type: 'text', text: '{"type":"fortune",...}' }] }
  if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
    try {
      return JSON.parse(data.content[0].text)
    } catch {
      return null
    }
  }
  // 兼容：直接传入结构化数据
  return data
}

const LUCK_COLORS = {
  '大吉': 'text-pink-400',
  '中吉': 'text-amber-400',
  '吉': 'text-green-400',
  '小吉': 'text-cyan-400',
  '末吉': 'text-text-muted',
  '凶': 'text-red-400',
  '大凶': 'text-red-500',
}

export function ZenCard(props) {
  const d = parseData(props.data)
  if (!d || typeof d !== 'object') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
    }, '小僧没说话')
  }

  // 木鱼
  if (d.type === 'knock') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs text-text-secondary'
    },
      createElement('div', { className: 'mb-1 text-text-muted' }, '( ^_^ ) ˇˇ'),
      d.message ? createElement('div', { className: 'mb-1 text-text' }, d.message) : null,
      d.count != null ? createElement('div', { className: 'text-text-muted text-[11px]' }, `敲了 ${d.count} 下`) : null
    )
  }

  // 抽签
  if (d.type === 'fortune') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs'
    },
      d.luck ? createElement('div', {
        className: `mb-1 font-bold text-sm ${LUCK_COLORS[d.luck] || 'text-text'}`
      }, d.luck) : null,
      d.text ? createElement('div', { className: 'mb-1 text-text leading-relaxed' }, d.text) : null,
      d.book ? createElement('div', { className: 'text-text-muted text-[11px] italic' }, '-- ' + d.book) : null
    )
  }

  // 答案之书
  if (d.type === 'book') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs'
    },
      d.question ? createElement('div', {
        className: 'mb-1 text-text-muted text-[11px] italic'
      }, '「' + d.question + '」') : null,
      d.answer ? createElement('div', { className: 'mb-1 text-text leading-relaxed' }, d.answer) : null,
      d.followUp ? createElement('div', { className: 'mt-1 h-px bg-border' }) : null,
      d.followUp ? createElement('div', { className: 'mt-1 text-text-muted text-[11px]' }, d.followUp) : null
    )
  }

  return createElement('div', {
    className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
  }, '小僧递给你一张纸条，但你读不懂')
}