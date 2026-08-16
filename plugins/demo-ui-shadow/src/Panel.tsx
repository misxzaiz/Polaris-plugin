/**
 * Demo UI Shadow — Panel Component
 *
 * shadow 模式覆盖内置文件面板。显示一个自定义的"文件管理器"，
 * 标题带 [demo-shadow] 前缀，证明 shadow 覆盖生效。
 */

import { useState } from 'react'

interface FileItem {
  name: string
  type: 'file' | 'directory'
}

export default function DemoShadowPanel({ pluginId }: { pluginId: string }) {
  const [selected, setSelected] = useState<string | null>(null)

  // 模拟文件列表（真实场景应通过 IPC 读取工作区）
  const mockFiles: FileItem[] = [
    { name: 'src', type: 'directory' },
    { name: 'package.json', type: 'file' },
    { name: 'README.md', type: 'file' },
    { name: 'tsconfig.json', type: 'file' },
  ]

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', gap: 12, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ borderBottom: '1px solid var(--border-color, #3F3F46)', paddingBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #F8F8F8)' }}>
          📁 [demo-shadow] File Explorer
        </h3>
        <div style={{ fontSize: 11, color: 'var(--text-secondary, #8E8E93)', marginTop: 4 }}>
          Plugin: {pluginId} · 此面板通过 shadow 覆盖了内置文件面板
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {mockFiles.map((f) => (
          <div
            key={f.name}
            onClick={() => setSelected(f.name)}
            style={{
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              background: selected === f.name ? 'var(--list-active-selection-bg, #2D2D33)' : 'transparent',
              color: 'var(--text-primary, #F8F8F8)',
            }}
          >
            <span>{f.type === 'directory' ? '📁' : '📄'}</span>
            <span>{f.name}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-secondary, #8E8E93)', borderTop: '1px solid var(--border-color, #3F3F46)', paddingTop: 8 }}>
        ✅ Shadow 覆盖生效：原文件面板已隐藏，此面板替代显示。
        <br />
        卸载插件后恢复内置文件面板。
      </div>
    </div>
  )
}
