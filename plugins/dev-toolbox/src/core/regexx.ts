// 正则测试 —— JS 方言。注意 JS 正则 `.` 不匹配换行（要 s 标志），匹配一律按下标切分高亮，
// 全部结果作为数据返回，由 React 以文本节点渲染（杜绝把用户输入拼进 HTML）

export interface RegexMatchInfo {
  index: number
  end: number
  match: string
  /** 编号捕获组（1-based，下标 0 未用，保持 null 占位方便对齐 $1） */
  groups: (string | null)[]
  namedGroups: Record<string, string>
}

export interface RegexTestResult {
  ok: boolean
  error?: string
  flagsUsed: string
  matches: RegexMatchInfo[]
  /** matches 达到上限被截断 */
  truncated: boolean
  /** 高亮分段（isMatch=true 的段是匹配文本；零长匹配以 zeroLength 标记） */
  segments: Array<{ text: string; isMatch: boolean; zeroLength: boolean }>
}

const MAX_MATCHES = 500

function parseFlags(flags: string): { ok: true; flags: string } | { ok: false; error: string } {
  const valid = 'dgimsuvy'
  const seen = new Set<string>()
  for (const ch of flags) {
    if (!valid.includes(ch)) return { ok: false, error: `非法标志：${ch}（合法：${valid}）` }
    if (seen.has(ch)) return { ok: false, error: `标志重复：${ch}` }
    seen.add(ch)
  }
  return { ok: true, flags }
}

export function testRegex(pattern: string, flags: string, text: string): RegexTestResult {
  const empty: RegexTestResult = { ok: true, flagsUsed: '', matches: [], truncated: false, segments: [] }
  if (pattern === '') return { ...empty, error: '正则为空' }
  const f = parseFlags(flags)
  if (!f.ok) return { ...empty, ok: false, error: f.error }
  let re: RegExp
  try {
    re = new RegExp(pattern, f.flags)
  } catch (e) {
    return { ...empty, ok: false, error: `正则无法编译：${(e as Error).message}` }
  }
  const matches: RegexMatchInfo[] = []
  // 扫描始终全局化：让用户看到全部潜在匹配（替换预览仍按真实 flags 语义）
  const scan = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = scan.exec(text)) !== null) {
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      match: m[0],
      groups: m.slice(1),
      namedGroups: m.groups ? { ...m.groups } as Record<string, string> : {},
    })
    if (m[0].length === 0) scan.lastIndex++ // 零长匹配防死循环
    if (matches.length >= MAX_MATCHES) break
    if (++guard > 1_000_000) break // 极端保险
  }
  const truncated = matches.length >= MAX_MATCHES
  // 高亮分段（未全局时只高亮第一个匹配）
  const segments: RegexTestResult['segments'] = []
  let cursor = 0
  for (const match of matches) {
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), isMatch: false, zeroLength: false })
    segments.push({ text: match.match, isMatch: true, zeroLength: match.match.length === 0 })
    cursor = Math.max(cursor, match.end)
    if (match.end === match.index) cursor = match.index + 1 // 零长：至少前进一个字符避免重叠
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMatch: false, zeroLength: false })
  return { ok: true, flagsUsed: f.flags, matches, truncated, segments }
}

export interface ReplacePreviewResult {
  ok: boolean
  output: string
  error?: string
}

export function previewReplace(pattern: string, flags: string, text: string, replacement: string): ReplacePreviewResult {
  if (pattern === '') return { ok: false, output: '', error: '正则为空' }
  const f = parseFlags(flags)
  if (!f.ok) return { ok: false, output: '', error: f.error }
  try {
    const re = new RegExp(pattern, f.flags)
    return { ok: true, output: text.replace(re, replacement) }
  } catch (e) {
    return { ok: false, output: '', error: (e as Error).message }
  }
}
