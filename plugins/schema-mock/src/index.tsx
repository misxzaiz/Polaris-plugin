/**
 * Mock 数据生成器面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import SchemaMockPanel from './Panel'

export default function SchemaMockEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <SchemaMockPanel {...props} />
}
