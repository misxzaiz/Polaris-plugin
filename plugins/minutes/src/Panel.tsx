import { useState, useEffect, useRef } from 'react'

/**
 * Minutes Craft Panel
 * 粘贴转写/笔记 → 选模板 → 结构化预览 → 编辑 → 导出/复制 Markdown。
 * MCP 工具通过 onSendToChat 触发，或直接本地调结构化（内联简化版）。
 */

const TEMPLATES = [
  { type: 'meeting', label: '会议纪要' },
  { type: 'weekly', label: '周报' },
  { type: 'standup', label: '站会' },
]

const SKELETONS: Record<string, string> = {
  meeting: `# 会议纪要\n\n**日期**: ${new Date().toISOString().slice(0, 10)}\n**参会**: \n\n## 议题\n1. \n\n## 讨论要点\n- \n\n## 决议\n- \n\n## 待办事项\n- [ ]  (@)\n\n## 下次会议\n- `,
  weekly: `# 周报\n\n**周期**: ${new Date().toISOString().slice(0, 10)}\n**负责人**: \n\n## 本周完成\n- \n\n## 下周计划\n- \n\n## 风险与阻塞\n- 无\n\n## 数据指标\n- `,
  standup: `# 每日站会\n\n**日期**: ${new Date().toISOString().slice(0, 10)}\n\n## 昨日完成\n- \n\n## 今日计划\n- \n\n## 阻塞\n- 无`,
}

export default function MinutesPanel({ pluginId, onSendToChat }: {
  pluginId: string
  onSendToChat?: (msg: string) => void
}) {
  const [input, setInput] = useState('')
  const [type, setType] = useState('meeting')
  const [output, setOutput] = useState(SKELETONS.meeting)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const applyTemplate = (t: string) => {
    setType(t)
    setOutput(SKELETONS[t] || SKELETONS.meeting)
    setActiveTab('edit')
  }

  const structureLocal = () => {
    // 本地简化版：AI 调用 structure_minutes 时会得到更精准结果
    if (!input.trim()) { setOutput(SKELETONS[type]); return }
    const lines = input.split(/\r?\n|。|\.|；|;|！|!|\?|？/).map(s => s.trim()).filter(s => s.length > 2)
    const decisions = lines.filter(s => /决定|同意|确认|通过|决议|敲定|确定/.test(s))
    const actions = lines.filter(s => /负责|完成|跟进|处理|对接|安排|提交|发送|更新|修复|确认|推动|准备/i.test(s))
    if (type === 'meeting') {
      setOutput(`# 会议纪要\n\n**日期**: ${new Date().toISOString().slice(0, 10)}\n**参会**: \n\n## 议题\n${lines.slice(0, 3).map(l => `1. ${l}`).join('\n')}\n\n## 讨论要点\n${lines.slice(0, 4).map(l => `- ${l}`).join('\n')}\n\n## 决议\n${decisions.length ? decisions.map(l => `- ${l}`).join('\n') : '- （待补充）'}\n\n## 待办事项\n${actions.length ? actions.map(l => `- [ ] ${l.replace(/@([^\s,，。]+)/g, '')} @${(l.match(/@([^\s,，。]+)/) || [])[1] || ''}`).join('\n') : '- [ ] （待补充） (@)'}\n\n## 下次会议\n- 待定`)
    } else if (type === 'weekly') {
      setOutput(`# 周报\n\n**周期**: ${new Date().toISOString().slice(0, 10)}\n**负责人**: \n\n## 本周完成\n${lines.slice(0, 4).map(l => `- ${l}`).join('\n')}\n\n## 下周计划\n${lines.slice(2, 6).map(l => `- ${l}`).join('\n')}\n\n## 风险与阻塞\n${lines.filter(l => /风险|阻塞|问题|担心|延期/.test(l)).map(l => `- ${l}`).join('\n') || '- 无'}\n\n## 数据指标\n- `)
    } else {
      setOutput(`# 每日站会\n\n**日期**: ${new Date().toISOString().slice(0, 10)}\n\n## 昨日完成\n${lines.slice(0, 3).map(l => `- ${l}`).join('\n')}\n\n## 今日计划\n${lines.slice(2, 5).map(l => `- ${l}`).join('\n')}\n\n## 阻塞\n${lines.filter(l => /阻塞|卡|等|依赖|需要/.test(l)).map(l => `- ${l}`).join('\n') || '- 无'}`)
    }
    setActiveTab('edit')
  }

  const copy = () => {
    navigator.clipboard?.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const exportMd = () => {
    const blob = new Blob([output], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${type}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
  }

  const askAI = () => {
    if (!input.trim()) return
    onSendToChat?.(`请用 minutes-craft 的 structure_minutes 工具，按「${type}」模板结构化以下内容，并在卡片中渲染：\n\n${input}`)
  }

  // 简易 Markdown 预览（不引入外部库）
  const renderMd = (md: string) => {
    return md
      .replace(/^# (.+)$/gm, '<h1 style="font-size:15px;margin:8px 0 4px">$1</h1>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:13px;margin:10px 0 4px;color:#B4B4B8">$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- \[ \] (.+)$/gm, '<div style="margin-left:8px">☐ $1</div>')
      .replace(/^- (.+)$/gm, '<div style="margin-left:8px">• $1</div>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1A1A1F', color: '#F8F8F8', fontSize: 13 }}>
      {/* 模板栏 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: '1px solid #3F3F46', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#8E8E93' }}>模板:</span>
        {TEMPLATES.map(t => (
          <button key={t.type} onClick={() => applyTemplate(t.type)} style={type === t.type ? activeChip : chip}>{t.label}</button>
        ))}
      </div>

      {/* 输入区 */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #3F3F46' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="粘贴会议转写/笔记原文…（或直接在下方编辑模板）"
          style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid #3F3F46', background: '#25252B', color: '#F8F8F8', fontSize: 12, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={structureLocal} style={btnStyle}>本地结构化</button>
          <button onClick={askAI} disabled={!input.trim()} style={{ ...btnStyle, opacity: input.trim() ? 1 : 0.4 }}>AI 精炼</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setActiveTab('edit')} style={activeTab === 'edit' ? activeChip : chip}>编辑</button>
          <button onClick={() => setActiveTab('preview')} style={activeTab === 'preview' ? activeChip : chip}>预览</button>
        </div>
      </div>

      {/* 输出区 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'edit' ? (
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            spellCheck={false}
            style={{ flex: 1, padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 12, background: '#1F1F24', color: '#F8F8F8', border: 'none', resize: 'none', outline: 'none', lineHeight: 1.5 }}
          />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }} dangerouslySetInnerHTML={{ __html: renderMd(output) }} />
        )}
      </div>

      {/* 底部操作 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid #3F3F46' }}>
        <button onClick={copy} style={btnStyle}>{copied ? '✓ 已复制' : '复制'}</button>
        <button onClick={exportMd} style={btnStyle}>导出 .md</button>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #3F3F46', background: '#2D2D33', color: '#F8F8F8', fontSize: 11, cursor: 'pointer' }
const chip: React.CSSProperties = { padding: '2px 8px', borderRadius: 10, border: '1px solid #3F3F46', background: 'transparent', color: '#B4B4B8', fontSize: 10, cursor: 'pointer' }
const activeChip: React.CSSProperties = { ...chip, background: '#3B82F622', color: '#3B82F6', borderColor: '#3B82F6' }
