/**
 * Personal Hub 插件入口（宿主 pluginModuleLoader 按 mod.default 加载）
 */

import PersonalHubPanel from './panel'

export default function PersonalHubEntry() {
  return <PersonalHubPanel />
}
