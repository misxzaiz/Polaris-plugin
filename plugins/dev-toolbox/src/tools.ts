// 工具注册表：面板侧 13 个工具的元数据（组件见 tools/）
import type { ComponentType } from 'react'
import { JwtTool } from './tools/JwtTool'
import { HashTool } from './tools/HashTool'
import { UuidTool } from './tools/UuidTool'
import { Base64Tool } from './tools/Base64Tool'
import { UrlTool } from './tools/UrlTool'
import { JsonTool } from './tools/JsonTool'
import { YamlTool } from './tools/YamlTool'
import { RegexTool } from './tools/RegexTool'
import { CaseTool } from './tools/CaseTool'
import { TimeTool } from './tools/TimeTool'
import { CronTool } from './tools/CronTool'
import { RadixTool } from './tools/RadixTool'
import { ColorTool } from './tools/ColorTool'

export type ToolCategory = 'token' | 'codec' | 'format' | 'text' | 'time' | 'misc'

export const CATEGORIES: Array<{ id: ToolCategory; label: string }> = [
  { id: 'token', label: '令牌与加密' },
  { id: 'codec', label: '编解码' },
  { id: 'format', label: '格式' },
  { id: 'text', label: '文本' },
  { id: 'time', label: '时间' },
  { id: 'misc', label: '数值与颜色' },
]

export interface ToolMeta {
  id: string
  name: string
  icon: string
  category: ToolCategory
  /** 搜索关键词（空格分隔，含中英文别名） */
  keywords: string
  desc: string
  component: ComponentType
}

export const TOOLS: ToolMeta[] = [
  { id: 'jwt', name: 'JWT 解码', icon: '🔑', category: 'token', component: JwtTool,
    keywords: 'jwt token 鉴权 验签 exp header payload hs256',
    desc: '解析 JWT 三段结构、过期状态，支持 HS256/384/512 验签' },
  { id: 'hash', name: '哈希计算', icon: '#️⃣', category: 'token', component: HashTool,
    keywords: 'hash md5 sha1 sha256 sha512 hmac 摘要 digest',
    desc: 'MD5 / SHA-1 / SHA-256 / 384 / 512 与 HMAC，一次全算' },
  { id: 'uuid', name: 'UUID 生成', icon: '🆔', category: 'token', component: UuidTool,
    keywords: 'uuid guid v4 v7 随机 唯一 id',
    desc: '密码学随机 v4 与带时间戳单调 v7，批量生成与解析' },
  { id: 'base64', name: 'Base64 编解码', icon: '🔤', category: 'codec', component: Base64Tool,
    keywords: 'base64 base64url 编码 解码 b64 atob btoa',
    desc: 'UTF-8 安全的 Base64 / Base64URL 编解码，含填充容错' },
  { id: 'url', name: 'URL 编解码与解析', icon: '🔗', category: 'codec', component: UrlTool,
    keywords: 'url uri encode decode query 参数 percent',
    desc: 'URL 编解码（严格/表单两种口径）与组件、参数拆解' },
  { id: 'json', name: 'JSON 格式化', icon: '🧾', category: 'format', component: JsonTool,
    keywords: 'json 格式化 校验 压缩 排序 美化 prettify',
    desc: '格式化 / 压缩 / 校验（错误定位行列）/ 深度键排序' },
  { id: 'yaml', name: 'YAML 与 JSON 互转', icon: '🔄', category: 'format', component: YamlTool,
    keywords: 'yaml json 转换 yml 配置',
    desc: '双向转换，明示 YAML 1.2 core schema 口径' },
  { id: 'regex', name: '正则测试', icon: '⛳', category: 'text', component: RegexTool,
    keywords: 'regex 正则 匹配 替换 捕获组 regexp',
    desc: '实时匹配高亮、捕获组表、替换预览（JS 方言）' },
  { id: 'case', name: '命名风格互转', icon: '🔠', category: 'text', component: CaseTool,
    keywords: 'case camel pascal snake kebab 命名 变量',
    desc: 'camelCase / snake_case / kebab-case 等十种风格一键互转' },
  { id: 'time', name: '时间戳转换', icon: '⏱️', category: 'time', component: TimeTool,
    keywords: 'timestamp unix epoch 时间戳 iso 时区 日期',
    desc: 'Unix 时间戳与日期互转，自动识别秒/毫秒/微秒' },
  { id: 'cron', name: 'Cron 解析', icon: '⏰', category: 'time', component: CronTool,
    keywords: 'cron 定时 计划任务 crontab 调度',
    desc: '字段拆解、中文描述、未来 5 次执行时间' },
  { id: 'radix', name: '进制转换', icon: '🔢', category: 'misc', component: RadixTool,
    keywords: 'radix binary hex octal 进制 二进制 十六进制 big int',
    desc: '2-36 任意进制互转，BigInt 支持超大整数' },
  { id: 'color', name: '颜色转换', icon: '🎨', category: 'misc', component: ColorTool,
    keywords: 'color hex rgb hsl 颜色 色值 css',
    desc: 'HEX / RGB / HSL 三向互转与对比度预览' },
]

export function searchTools(query: string): ToolMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return TOOLS
  return TOOLS.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q) ||
      t.keywords.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q),
  )
}

export function findTool(id: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.id === id)
}
