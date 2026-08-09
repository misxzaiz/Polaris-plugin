/**
 * Blender 3D 建模聊天卡片
 *
 * 渲染 MCP 工具结果：
 * - blender_generate_3d：模型生成结果 → 内嵌 iframe 预览
 * - blender_list_models：列出可用建模脚本
 *
 * data 格式：外部插件 MCP server 返回的 content[0].text 是 JSON 字符串
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

/**
 * 内嵌模型预览组件
 * 通过 iframe 加载 preview.html 预览 GLB 模型
 */
function ModelPreview({ modelUrl, previewUrl, parts, script }) {
  return createElement('div', {
    className: 'my-2 rounded-lg border border-border bg-background-elevated overflow-hidden'
  },
    // 模型信息头部
    createElement('div', {
      className: 'px-3 py-2 border-b border-border flex items-center justify-between'
    },
      createElement('div', { className: 'flex items-center gap-2' },
        createElement('span', { className: 'text-xs font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent' }, script),
        parts ? createElement('span', { className: 'text-[11px] text-text-muted' }, `${parts} 个部件`) : null,
      ),
      createElement('a', {
        href: modelUrl,
        target: '_blank',
        className: 'text-[11px] text-accent hover:underline',
      }, '下载 GLB')
    ),
    // 3D 预览 iframe
    createElement('div', {
      className: 'relative w-full',
      style: { height: '360px', background: '#1a1a2e' }
    },
      createElement('iframe', {
        src: previewUrl,
        className: 'w-full h-full border-0',
        style: { background: '#1a1a2e' },
        allow: 'autoplay',
        sandbox: 'allow-scripts allow-same-origin',
        loading: 'lazy',
      })
    ),
  )
}

export default function BlenderPreviewCard(props) {
  const d = parseData(props.data)
  if (!d || typeof d !== 'object') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
    }, '3D 建模结果加载中...')
  }

  // 错误
  if (d.type === 'error') {
    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono'
    },
      createElement('div', { className: 'text-red-400 font-bold mb-1' }, '⚠️ 建模出错'),
      createElement('div', { className: 'text-text-secondary whitespace-pre-wrap' }, d.message || '未知错误'),
    )
  }

  // 模型列表
  if (d.type === 'model_list') {
    const models = d.models || []
    if (models.length === 0) {
      return createElement('div', {
        className: 'my-1 rounded border border-border bg-background-elevated px-3 py-2 text-[11px] font-mono text-text-muted'
      }, '暂无可用建模脚本')
    }

    return createElement('div', {
      className: 'my-1 rounded border border-border bg-background-elevated overflow-hidden'
    },
      createElement('div', {
        className: 'px-3 py-1.5 border-b border-border text-xs font-medium text-text'
      }, `📐 可用建模脚本 (${models.length})`),
      createElement('div', { className: 'divide-y divide-border' },
        ...models.map((m, i) =>
          createElement('div', {
            key: i,
            className: 'px-3 py-2 text-[11px] font-mono'
          },
            createElement('div', { className: 'text-text font-medium' }, m.name),
            m.description ? createElement('div', { className: 'text-text-muted mt-0.5 text-[10px]' }, m.description) : null,
            m.params ? createElement('div', {
              className: 'text-text-muted text-[10px] mt-0.5'
            }, `参数: ${Object.keys(m.params).length} 个`) : null,
          )
        )
      )
    )
  }

  // 模型生成结果
  if (d.type === 'model_generated') {
    return createElement('div', {},
      // 简短文本提示
      createElement('div', {
        className: 'my-1 text-xs text-text-secondary'
      }, `✅ 模型已生成${d.parts ? ` (${d.parts} 个部件)` : ''}`),
      // 3D 预览
      d.previewUrl ? createElement(ModelPreview, {
        modelUrl: d.modelUrl,
        previewUrl: d.previewUrl,
        parts: d.parts,
        script: d.script,
      }) : null,
    )
  }

  return createElement('div', {
    className: 'my-1 rounded border border-border bg-background-elevated px-2 py-1.5 text-[11px] font-mono text-text-muted'
  }, '未知的 3D 建模结果')
}