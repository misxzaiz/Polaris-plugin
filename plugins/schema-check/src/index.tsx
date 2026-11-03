/**
 * JSON Schema 校验器面板入口 —— 宿主面板挂载点（blob loader 模板一律占位符化，禁内联 import）
 */
import SchemaCheckPanel from './Panel'

export default function SchemaCheckEntry(props: { pluginId?: string; onSendToChat?: (m: string) => void }) {
  return <SchemaCheckPanel {...props} />
}
