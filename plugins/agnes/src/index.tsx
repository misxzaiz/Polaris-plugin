/**
 * Agnes 插件入口（单一 bundle 分派，panel 与 chatCard 共用 dist/index.js）
 *
 * 宿主 pluginModuleLoader 按 mod.default 加载：
 *   - 面板：props.toolName 不存在 → AgnesPanel
 *   - 聊天卡片：props.toolName 存在（mcp__agnes__xxx）→ AgnesChatCard
 * 与 sim-paper-trading 的 src/index.tsx 同一模式。
 */

import AgnesPanel from './Panel'
import AgnesChatCard from './ChatCard'

export default function AgnesEntry(props: any) {
  if (props && props.toolName) return <AgnesChatCard {...props} />
  return <AgnesPanel {...props} />
}