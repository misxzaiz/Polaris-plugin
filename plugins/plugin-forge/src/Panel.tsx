/**
 * 插件工坊面板：知识库 / 体检 / 脚手架 三 Tab。
 * 零服务插件：全部能力本地计算，唯一落 kv 的是脚手架默认值。
 */
import React, { useState } from 'react'
import KbTab from './KbTab'
import LintTab from './LintTab'
import ScaffoldTab from './ScaffoldTab'

type Tab = 'kb' | 'lint' | 'scaffold'

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: active ? 'var(--p-accent, #4a7dff)' : 'transparent',
  color: active ? '#fff' : 'inherit',
})

export default function PluginForgePanel(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('kb')

  return (
    <div style={{ padding: 16, fontFamily: 'inherit', fontSize: 13, color: 'var(--p-text, inherit)', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <strong style={{ fontSize: 15 }}>插件工坊</strong>
        <span style={{ fontSize: 11, color: 'var(--p-text-dim, #999)' }}>平台知识 · 清单体检 · 生产级脚手架</span>
        <span style={{ flex: 1 }} />
        <button style={tabBtn(tab === 'kb')} onClick={() => setTab('kb')}>知识库</button>
        <button style={tabBtn(tab === 'lint')} onClick={() => setTab('lint')}>体检</button>
        <button style={tabBtn(tab === 'scaffold')} onClick={() => setTab('scaffold')}>脚手架</button>
      </div>

      {tab === 'kb' && <KbTab />}
      {tab === 'lint' && <LintTab />}
      {tab === 'scaffold' && <ScaffoldTab onSendToChat={props.onSendToChat} />}
    </div>
  )
}
