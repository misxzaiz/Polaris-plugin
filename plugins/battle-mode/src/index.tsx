/**
 * Battle Mode 插件入口
 *
 * 宿主 pluginModuleLoader 按 mod.default 加载。当前 MVP 只有一个面板，
 * 无 chatCard / MCP server，直接渲染 Panel。
 */

import BattleModePanel from './Panel'

export default function BattleModeEntry(props: any) {
  return <BattleModePanel {...props} />
}