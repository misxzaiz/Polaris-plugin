// dev-toolbox MCP server（stdio JSON-RPC，零依赖）
// 工具实现一律复用 dist/core.cjs（与面板同一份纯函数核心，单一真相；node ≥18 自带 globalThis.crypto）
// 纪律：协议数据只走 stdout；日志一律 stderr；isError 放在 result 内（MCP 规范）
'use strict'

const path = require('node:path')
const core = require(path.join(__dirname, '..', 'dist', 'core.cjs'))

const SERVER_NAME = 'dev-toolbox'
const SERVER_VERSION = '0.1.0'
const PROTOCOL_VERSION = '2024-11-05'

function ok(text) {
  return { content: [{ type: 'text', text }], isError: false }
}
function err(text) {
  return { content: [{ type: 'text', text }], isError: true }
}
const jsonOut = (v) => ok(JSON.stringify(v, null, 2))

// ---------- 工具实现（参数校验在 call 内，错误走 isError） ----------
const tools = [
  {
    name: 'hash_text',
    description:
      '计算文本的哈希摘要（md5/sha1/sha256/sha384/sha512，可选 HMAC）。当需要哈希值、摘要、签名比对时必须调用本工具——语言模型无法自行计算哈希，凭空给出的哈希值一定是错的。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要计算哈希的文本（UTF-8）' },
        algorithm: { type: 'string', enum: ['md5', 'sha1', 'sha256', 'sha384', 'sha512'], description: '默认 sha256' },
        hmacSecret: { type: 'string', description: '可选 HMAC 密钥；提供后计算 HMAC（不支持 md5）' },
      },
      required: ['text'],
    },
    async call(args) {
      const text = String(args.text ?? '')
      const algorithm = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'].includes(args.algorithm) ? args.algorithm : 'sha256'
      const hex = await core.hashText(algorithm, text, args.hmacSecret)
      return jsonOut({ algorithm, hmac: args.hmacSecret !== undefined && args.hmacSecret !== '', hex })
    },
  },
  {
    name: 'uuid_generate',
    description:
      '生成 UUID。需要唯一标识符、随机 id、测试数据时使用——不要自己编造 UUID（无法保证唯一性与格式），必须调用本工具。v7 按时间有序可排序。',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '生成数量，1-500，默认 1' },
        version: { type: 'string', enum: ['v4', 'v7'], description: '默认 v4' },
      },
    },
    async call(args) {
      const count = Number(args.count) || 1
      const version = args.version === 'v7' ? 'v7' : 'v4'
      const list = core.generateUuids(count, version)
      return jsonOut({ version, count: list.length, uuids: list })
    },
  },
  {
    name: 'base64_encode',
    description: '把文本编码为 Base64（UTF-8 安全，中文/生僻字无乱码）。可选 URL-safe 变体。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        urlSafe: { type: 'boolean', description: 'true 时输出 URL-safe（-_、无填充）' },
      },
      required: ['text'],
    },
    async call(args) {
      const urlSafe = args.urlSafe === true
      return jsonOut({ urlSafe, base64: core.utf8ToBase64(String(args.text ?? ''), urlSafe) })
    },
  },
  {
    name: 'base64_decode',
    description:
      '把 Base64 解码为文本。容忍空白/URL-safe 字符/缺失填充；字节不是合法 UTF-8 时会明确报告替换符数量而不是静默乱码。',
    inputSchema: { type: 'object', properties: { base64: { type: 'string' } }, required: ['base64'] },
    async call(args) {
      const r = core.base64ToUtf8(String(args.base64 ?? ''))
      return jsonOut({
        text: r.text,
        byteLength: r.byteLength,
        invalidUtf8Replacements: r.replacedChars,
        note: r.replacedChars > 0 ? '输入字节不是合法 UTF-8 文本（可能是二进制数据），结果含 U+FFFD 替换符' : undefined,
      })
    },
  },
  {
    name: 'jwt_decode',
    description:
      '解码 JWT（不验证签名）：返回 header/payload 结构化内容、iat/nbf/exp 的时间语义与过期状态。分析令牌、排查鉴权问题时使用。',
    inputSchema: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] },
    async call(args) {
      const d = core.decodeJwt(String(args.token ?? ''))
      return jsonOut({
        header: d.header,
        payload: d.payload,
        time: {
          iat: d.iat ? d.iat.isoUtc : undefined,
          nbf: d.nbf ? d.nbf.isoUtc : undefined,
          exp: d.exp ? d.exp.isoUtc : undefined,
          expiryState: d.expiryState,
          expiryDetail: d.expiryDetail,
        },
        note: '仅解码未验签；如需验签请用面板的 HS256/384/512 验签（需共享密钥）',
      })
    },
  },
  {
    name: 'cron_next_runs',
    description:
      '解析 cron 表达式（5 段标准或 6 段含秒），返回字段拆解、中文描述与未来 N 次执行时间（本地时区）。涉及定时任务/计划表达式时使用，不要自己心算执行时间。',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '如 "*/5 * * * *" 或 "30 8 * * 1-5"' },
        count: { type: 'number', description: '返回未来执行次数，1-20，默认 5' },
      },
      required: ['expression'],
    },
    async call(args) {
      const info = core.analyzeCron(String(args.expression ?? ''), Number(args.count) || 5)
      if (!info.ok) return err(`表达式无法解析：${info.error}`)
      return jsonOut({
        hasSeconds: info.hasSeconds,
        fields: info.fields,
        description: info.description || undefined,
        nextRuns: info.next,
      })
    },
  },
  {
    name: 'timestamp_to_iso',
    description: '把 Unix 时间戳转成 ISO/本地时间与相对时间。自动识别秒/毫秒/微秒/纳秒（可强制指定单位）。',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string', description: '时间戳数字（字符串形式，支持负数）' },
        unit: { type: 'string', enum: ['auto', 's', 'ms'], description: '默认 auto' },
      },
      required: ['value'],
    },
    async call(args) {
      const info = core.analyzeTimestamp(String(args.value ?? ''), args.unit === 's' || args.unit === 'ms' ? args.unit : 'auto')
      if (!info.ok) return err(info.error || '无法解析')
      return jsonOut({
        unit: info.unit,
        epochMs: info.epochMs,
        isoUtc: info.isoUtc,
        localReadable: info.localReadable,
        weekday: info.weekday,
        relative: info.relative,
      })
    },
  },
  {
    name: 'iso_to_timestamp',
    description: '把 ISO 8601 / 常见日期文本转成 Unix 秒与毫秒时间戳。',
    inputSchema: { type: 'object', properties: { iso: { type: 'string', description: '如 2026-11-03T08:30:00Z' } }, required: ['iso'] },
    async call(args) {
      const ms = new Date(String(args.iso ?? '')).getTime()
      if (Number.isNaN(ms)) return err(`无法识别的日期：${String(args.iso)}`)
      return jsonOut({ epochSeconds: Math.floor(ms / 1000), epochMillis: ms, isoUtc: new Date(ms).toISOString() })
    },
  },
  {
    name: 'yaml_convert',
    description:
      'YAML 与 JSON 双向转换。写 YAML 缩进不可靠、或要把 YAML 配置转成结构化数据时使用。默认 schema 为 YAML 1.2 core（yes/no 是字符串不是布尔）。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        direction: { type: 'string', enum: ['yaml2json', 'json2yaml'], description: '默认 yaml2json' },
      },
      required: ['text'],
    },
    async call(args) {
      const direction = args.direction === 'json2yaml' ? 'json2yaml' : 'yaml2json'
      const r = direction === 'yaml2json' ? core.yamlToJson(String(args.text ?? '')) : core.jsonToYaml(String(args.text ?? ''))
      if (!r.ok) return err(r.error || '转换失败')
      return jsonOut({ direction, output: r.output })
    },
  },
  {
    name: 'regex_test',
    description:
      '在给定文本上执行 JS 正则并返回匹配明细（位置/捕获组/命名组）。写完正则后必须先在真实样例上验证再答复——正则行为容易被想当然。',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则源文本（不带斜杠）' },
        flags: { type: 'string', description: '如 g、i、s，默认空' },
        text: { type: 'string', description: '测试文本' },
      },
      required: ['pattern', 'text'],
    },
    async call(args) {
      const r = core.testRegex(String(args.pattern ?? ''), String(args.flags ?? ''), String(args.text ?? ''))
      if (!r.ok) return err(r.error || '正则无法编译')
      return jsonOut({
        matchCount: r.matches.length,
        truncated: r.truncated,
        matches: r.matches.slice(0, 50).map((m) => ({
          index: m.index,
          match: m.match,
          groups: m.groups.filter((g) => g !== null),
          namedGroups: Object.keys(m.namedGroups).length > 0 ? m.namedGroups : undefined,
        })),
        note: r.truncated ? '匹配数达上限 500，已截断' : undefined,
      })
    },
  },
  {
    name: 'url_parse',
    description: '解析 URL：组件拆解 + 查询参数表（同名参数全部列出）。分析链接、提取参数时使用。',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async call(args) {
      const p = core.parseUrl(String(args.url ?? ''))
      if (!p.ok) return err(p.error || '无法解析')
      return jsonOut({
        origin: p.origin,
        protocol: p.protocol,
        hostname: p.hostname,
        port: p.port || undefined,
        pathname: p.pathname,
        search: p.search || undefined,
        hash: p.hash || undefined,
        params: (p.params ?? []).map((x) => ({ name: x.name, values: x.values })),
      })
    },
  },
]

// ---------- stdio JSON-RPC 骨架（与 house 模板一致：按行分隔 JSON） ----------
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => {
  buf += c
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (line) handleLine(line)
  }
})
process.stdin.on('end', () => process.exit(0))

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
}
function respondErr(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
}

function handleLine(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    })
    return
  }
  if (msg.method === 'notifications/initialized') return
  if (msg.method === 'tools/list') {
    respond(msg.id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    })
    return
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name
    const args = (msg.params && msg.params.arguments) || {}
    const tool = tools.find((t) => t.name === name)
    if (!tool) {
      respondErr(msg.id, -32602, `未知工具：${name}`)
      return
    }
    Promise.resolve()
      .then(() => tool.call(args))
      .then((r) => respond(msg.id, r))
      .catch((e) => respond(msg.id, err(`工具执行异常：${(e && e.message) || e}`)))
    return
  }
  if (msg.method === 'ping') {
    respond(msg.id, {})
    return
  }
}

process.stderr.write(`[${SERVER_NAME}] mcp server ready v${SERVER_VERSION}\n`)
