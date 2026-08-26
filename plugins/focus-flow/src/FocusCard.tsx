/**
 * 心流专注聊天卡片
 *
 * 渲染 MCP 工具结果：
 * - focus_start：开始专注
 * - focus_stop：完成专注
 * - focus_stats：统计
 * - focus_log：记录列表
 */

import { createElement } from 'react'

function parseData(data) {
  if (!data || typeof data !== 'object') return null
  if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
    try {
      return JSON.parse(data.content[0].text)
    } catch {
      return null
    }
  }
  return data
}

function fmtDuration(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export default function FocusCard(props) {
  const d = parseData(props.data)
  if (!d || typeof d !== 'object' || d.ok === false) {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
    }, d?.error || '心流状态未知')
  }

  // 开始专注
  if (d.type === 'start') {
    return createElement('div', {
      className: 'my-1 rounded border border-accent/40 bg-background-elevated p-2 font-mono text-xs'
    },
      createElement('div', { className: 'mb-1 text-text-muted' }, '🌊 开始专注'),
      createElement('div', { className: 'mb-1 text-text' }, d.task),
      createElement('div', { className: 'text-text-muted text-[11px]' }, `目标 ${d.goalMin} 分钟`)
    )
  }

  // 完成专注
  if (d.type === 'stop') {
    const s = d.session
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs'
    },
      createElement('div', { className: 'mb-1 text-text-muted' }, '✅ 完成专注'),
      createElement('div', { className: 'mb-1 text-text' }, s.task),
      createElement('div', { className: 'mb-1 text-text' },
        `${fmtDuration(s.durationMin)}` +
        (s.feel ? ` · 心流 ${'★'.repeat(s.feel)}${'☆'.repeat(5 - s.feel)}` : '')
      ),
      s.distraction ? createElement('div', { className: 'text-text-muted text-[11px]' }, `干扰: ${s.distraction}`) : null,
      s.note ? createElement('div', { className: 'text-text-muted text-[11px]' }, s.note) : null,
      d.streak ? createElement('div', { className: 'mt-1 text-text-muted text-[11px]' }, `🔥 连续专注 ${d.streak} 天`) : null
    )
  }

  // 统计
  if (d.type === 'stats') {
    const b = (label, value, sub) => createElement('div', { className: 'flex-1 text-center' },
      createElement('div', { className: 'text-text-muted text-[10px]' }, label),
      createElement('div', { className: 'text-sm font-bold text-text' }, value),
      sub ? createElement('div', { className: 'text-text-muted text-[10px]' }, sub) : null
    )
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs'
    },
      createElement('div', { className: 'mb-1.5 text-text-muted' },
        d.active ? `🔴 进行中：${d.active.task}（${fmtDuration(d.active.activeMin)}/${d.active.goalMin}m）` : '📊 专注统计'
      ),
      createElement('div', { className: 'flex gap-1' },
        b('今日', fmtDuration(d.today.min), `${d.today.sessions}次`),
        b('本周', fmtDuration(d.week.min), `${d.week.sessions}次`),
        b('累计', fmtDuration(d.total.min), `${d.total.sessions}次`),
        b('连续', `${d.streak}`, '天')
      )
    )
  }

  // 记录列表
  if (d.type === 'log') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated p-2 font-mono text-xs'
    },
      createElement('div', { className: 'mb-1 text-text-muted' }, `📜 最近 ${d.count} 条专注`),
      (d.sessions || []).slice(0, 8).map((s, i) =>
        createElement('div', { key: i, className: 'mb-1 flex items-center gap-2 text-text-secondary' },
          createElement('span', { className: 'shrink-0 text-text-muted text-[10px]' }, s.date.slice(5)),
          createElement('span', { className: 'min-w-0 flex-1 truncate' }, s.task),
          createElement('span', { className: 'shrink-0 font-bold text-text' }, fmtDuration(s.durationMin))
        )
      ),
      (d.sessions || []).length > 8 &&
        createElement('div', { className: 'text-text-muted text-[10px]' }, `... 还有 ${d.sessions.length - 8} 条`)
    )
  }

  return createElement('div', {
    className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
  }, '心流数据暂不可读')
}
