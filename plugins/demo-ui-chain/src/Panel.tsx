/**
 * Demo UI Chain — Panel Component
 *
 * chain 模式增强文件面板。不替换原面板，而是在原面板上方/下方叠加显示
 * Git blame 信息条。此组件作为独立面板渲染（chain 实际集成在 LeftPanel 层）。
 */

import { useState } from 'react'

export default function DemoChainPanel({ pluginId }: { pluginId: string }) {
  const [file] = useState('src/index.ts')

  // 模拟 Git blame 数据
  const blameEntries = [
    { line: 1, author: 'Alice', date: '2026-08-01', commit: 'a1b2c3d' },
    { line: 2, author: 'Bob', date: '2026-08-05', commit: 'e4f5g6h' },
    { line: 3, author: 'Alice', date: '2026-08-10', commit: 'i7j8k9l' },
  ]

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', gap: 12, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ borderBottom: '1px solid var(--border-color, #3F3F46)', paddingBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #F8F8F8)' }}>
          🔗 [demo-chain] Git Blame
        </h3>
        <div style={{ fontSize: 11, color: 'var(--text-secondary, #8E8E93)', marginTop: 4 }}>
          Plugin: {pluginId} · chain 增强模式（叠加在文件面板旁）
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary, #8E8E93)', padding: '4px 8px', background: 'var(--list-inactive-selection-bg, #25252B)', borderRadius: 4 }}>
        文件: {file}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {blameEntries.map((b) => (
          <div key={b.line} style={{
            padding: '6px 8px', fontSize: 12, fontFamily: 'monospace',
            display: 'flex', gap: 12, alignItems: 'center',
            borderBottom: '1px solid var(--border-color, #3F3F46)',
            color: 'var(--text-primary, #F8F8F8)',
          }}>
            <span style={{ color: 'var(--text-secondary, #8E8E93)', minWidth: 30 }}>L{b.line}</span>
            <span style={{ minWidth: 80 }}>{b.author}</span>
            <span style={{ color: 'var(--text-secondary, #8E8E93)', minWidth: 90 }}>{b.date}</span>
            <span style={{ color: '#569cd6' }}>{b.commit}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary, #8E8E93)', borderTop: '1px solid var(--border-color, #3F3F46)', paddingTop: 8 }}>
        ✅ chain 增强生效：此面板与内置文件面板并存，不替换原面板。
        <br />
        卸载插件后恢复单内置文件面板。
      </div>
    </div>
  )
}
