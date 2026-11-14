/** cap 目录条目（capCatalogStore 从 cap.help index 解析而来；与宿主 capSlashCommand.ts 同形） */
export interface CapCatalogEntry {
  /** cap id，如 cap.kv */
  id: string
  /** 中文短名（describe.name），缺省回退 id 本身 */
  name: string
  /** 一句话说明（describe.summary） */
  summary: string
  /** 是否流式能力（同步总线转发不可调，注入块中标注） */
  streaming: boolean
  /** 原始 describe 对象（注入详情块用）；缺省 null */
  describe: Record<string, unknown> | null
}
