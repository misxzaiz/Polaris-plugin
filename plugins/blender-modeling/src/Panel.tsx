/**
 * Blender 3D 建模面板
 *
 * 功能规划：
 * - 已生成模型列表（历史记录）
 * - 快速建模入口（一键生成常见模型）
 * - Blender 连接状态
 * - 模型文件管理
 *
 * Phase 1：占位面板，展示基本信息和操作入口
 */
import { createElement, useState, useEffect } from 'react'

function BlenderPanel({ pluginId, onSendToChat }) {
  const [blenderFound, setBlenderFound] = useState(null) // null = 检查中, true/false
  const [recentModels, setRecentModels] = useState([])
  const [serverStatus, setServerStatus] = useState('checking')

  useEffect(() => {
    // 检查 Blender 是否可用
    checkBlender()
    // 加载已生成模型列表
    loadRecentModels()
  }, [])

  async function checkBlender() {
    try {
      const res = await fetch('/api/system/which?name=blender')
      const data = await res.json()
      setBlenderFound(data.found || false)
    } catch {
      // 在 Polarish 前端无法直接检查系统命令，由 MCP server 运行时报告
      setBlenderFound(null)
    }
    setServerStatus('ready')
  }

  function loadRecentModels() {
    // Phase 1: 占位，后续通过 MCP server 查询
    setRecentModels([])
  }

  function handleQuickModel(scriptName) {
    if (onSendToChat) {
      onSendToChat(`/blender ${scriptName}`)
    }
  }

  return createElement('div', {
    className: 'flex flex-col h-full overflow-hidden'
  },
    // 头部
    createElement('div', {
      className: 'px-4 py-3 border-b border-border shrink-0'
    },
      createElement('h2', { className: 'text-sm font-bold text-text' }, '3D 建模'),
      createElement('p', { className: 'text-xs text-text-muted mt-0.5' }, 'AI 驱动的 Blender 建模工具'),
    ),

    // 状态
    createElement('div', {
      className: 'px-4 py-2 border-b border-border shrink-0'
    },
      createElement('div', { className: 'flex items-center gap-2 text-xs' },
        serverStatus === 'checking'
          ? createElement('span', { className: 'text-text-muted' }, '检查 Blender 连接...')
          : createElement('span', { className: 'text-text-muted' },
              'MCP Server: ',
              createElement('span', { className: 'text-green-400' }, '✅ 在线'),
            ),
      ),
      createElement('div', { className: 'flex items-center gap-2 text-xs mt-1' },
        blenderFound === null
          ? createElement('span', { className: 'text-text-muted' }, 'Blender: 未检测')
          : blenderFound
            ? createElement('span', { className: 'text-green-400' }, '✅ Blender 已就绪')
            : createElement('span', { className: 'text-yellow-400' }, '⚠️ Blender 未安装或不在 PATH'),
      ),
    ),

    // 快速建模
    createElement('div', {
      className: 'flex-1 overflow-y-auto px-4 py-3'
    },
      createElement('h3', { className: 'text-xs font-medium text-text-muted mb-2' }, '快速建模'),

      // 木鱼
      createElement('button', {
        onClick: () => handleQuickModel('muyu'),
        className: 'w-full text-left px-3 py-2 rounded-lg border border-border bg-background-elevated hover:bg-accent/5 transition-colors mb-2'
      },
        createElement('div', { className: 'text-xs font-medium text-text' }, '🪵 木鱼'),
        createElement('div', { className: 'text-[10px] text-text-muted mt-0.5' }, '传统木鱼法器，含底座、木鱼槌'),
      ),

      // Q 版角色（预留）
      createElement('button', {
        onClick: () => handleQuickModel('qbox_character'),
        className: 'w-full text-left px-3 py-2 rounded-lg border border-border bg-background-elevated hover:bg-accent/5 transition-colors mb-2 opacity-50 cursor-not-allowed'
      },
        createElement('div', { className: 'text-xs font-medium text-text' }, '🧸 Q 版角色'),
        createElement('div', { className: 'text-[10px] text-text-muted mt-0.5' }, '噜噜风格卡通角色（开发中）'),
      ),

      // 分隔
      createElement('div', { className: 'my-3 border-t border-border' }),

      // 使用说明
      createElement('h3', { className: 'text-xs font-medium text-text-muted mb-2' }, '使用方式'),
      createElement('div', { className: 'text-[10px] text-text-muted space-y-1' },
        createElement('p', {}, '在聊天中通过 AI 对话建模：'),
        createElement('p', {}, '• "帮我建一个木鱼"'),
        createElement('p', {}, '• "生成一个圆润的木头鱼，颜色深一点"'),
        createElement('p', {}, '• "换一个木纹纹理"'),
        createElement('p', { className: 'mt-2 italic' }, 'AI 会自动调用 Blender 并展示预览'),
      ),

      // 历史模型（Phase 2）
      recentModels.length > 0 && createElement('div', { className: 'mt-4' },
        createElement('h3', { className: 'text-xs font-medium text-text-muted mb-2' }, '最近模型'),
        createElement('div', { className: 'space-y-1' },
          ...recentModels.map((m, i) =>
            createElement('div', { key: i, className: 'text-xs text-text-muted' }, m.name)
          )
        ),
      ),
    ),
  )
}

export default BlenderPanel