#!/usr/bin/env node
/**
 * ZCode 方言适配器 — 通用适配器能力的参考实现
 * （spec: plans/plugin-adapter-capability-spec.md S3；映射表: plugin-system-zcode-compat-and-ai-ops-spec.md §2.2）
 *
 * 协议：行分隔 JSON-RPC 2.0 over stdio（与 Polaris 插件 MCP server 同型）。
 * 工具：
 *   discover(rootPath, workspacePath?) → { dialect:"zcode", candidates: [...], diagnostics }
 *   translate(manifest | manifestPath) → { schemaVersion:1, plugin: <Polaris manifest>, diagnostics }
 *
 * 设计红线（spec §0 全票一致项）：
 * - 适配器只有「翻译权」，产物必过宿主单源校验；idPrefix=zcode. 强制。
 * - 翻译是纯函数；不可表达的字段以 diagnostics 显式降级，绝不静默丢弃。
 * - 必填缺陷（无 mcpServers / 无 version / mcpServers 未声明 1.0.0 布局）→ 直接拒译并报诊断。
 */

'use strict'

const fs = require('fs')
const path = require('path')

const DIALECT = 'zcode'
const ID_PREFIX = 'zcode.'
const SCHEMA_VERSION = 1
const ZCODE_LAYOUT_DIR = '.zcode-plugin'
const ZCODE_LAYOUT_FILE = 'plugin.json'

/** 变量替换白名单：ZCode 路径变量 → Polaris 模板占位符（spec II §2.2） */
const VAR_MAP = [
  ['${ZCODE_PLUGIN_ROOT}', '{{pluginDir}}'],
  ['${ZCODE_PROJECT_DIR}', '{{workspacePath}}'],
]

function substituteVars(value) {
  if (typeof value !== 'string') return value
  let out = value
  for (const [from, to] of VAR_MAP) out = out.split(from).join(to)
  return out
}

function argsTemplate(args) {
  if (!Array.isArray(args)) return []
  return args.map((a) => substituteVars(a)).map(String)
}

function slugify(input, fallback) {
  const slug = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

/**
 * 翻译单份 ZCode manifest → Polaris manifest 草稿（不含 source/installPath/
 * builtin 等宿主 designated 字段 —— 由宿主盖戳，spec §3.3）。
 * 返回 { plugin?, diagnostics: string[] }；plugin 缺失 = 拒译（宿主按 errors 处理）。
 */
function translate(manifest) {
  const diagnostics = []

  if (!manifest || typeof manifest !== 'object') {
    return { diagnostics: ['translate: manifest 必须是对象'] }
  }
  const name = typeof manifest.name === 'string' ? manifest.name : undefined
  const version = typeof manifest.version === 'string' ? manifest.version : undefined
  if (!name || !version) {
    return {
      diagnostics: [
        `translate: 缺少 ${!name ? '"name" ' : ''}${!version ? '"version"' : ''}（Polaris 侧必填）`,
      ],
    }
  }
  if (!manifest.mcpServers || typeof manifest.mcpServers !== 'object') {
    return {
      diagnostics: [
        'translate: 缺少 "mcpServers"（Polaris 需要至少一个 stdio MCP server 才可安装）',
      ],
    }
  }

  // mcpServers：stdin JSON-RPC 两家同构；args/env/cwd 做变量替换。
  const mcpServers = []
  for (const [serverId, server] of Object.entries(manifest.mcpServers)) {
    if (!server || typeof server !== 'object') {
      diagnostics.push(`mcpServers[${serverId}] 不是对象，已显式跳过`)
      continue
    }
    if (String(server.type) !== 'stdio') {
      diagnostics.push(
        `mcpServers[${serverId}].type="${server.type}" 不是 stdio（L1 仅支持 stdio），已显式跳过`,
      )
      continue
    }
    if (typeof server.command !== 'string' || !server.command) {
      diagnostics.push(`mcpServers[${serverId}].command 缺失，已显式跳过`)
      continue
    }
    if (server.cwd) {
      // Polaris mcpServers 贡献暂无 cwd 字段（models/plugin.rs PluginMcpServerManifestContribution）
      diagnostics.push(`mcpServers[${serverId}].cwd 暂不支持保留（L1），降级：进程工作目录为宿主默认`)
    }
    if (server.env && Object.keys(server.env).length > 0) {
      // env 中的 ${ZCODE_PLUGIN_DATA} 等注水依赖宿主 env 注水（阶段 2.5），L1 显式降级
      diagnostics.push(
        `mcpServers[${serverId}].env（${Object.keys(server.env).join(', ')}）暂不支持透传（待宿主 env 注水），已显式降级`,
      )
    }
    mcpServers.push({
      id: serverId,
      transport: 'stdio',
      command: server.command,
      argsTemplate: argsTemplate(server.args),
    })
  }
  if (mcpServers.length === 0) {
    return {
      diagnostics: ['translate: 无可用的 stdio mcpServers，拒译（避免装成功但静默无后端）'],
    }
  }

  // ui.surfaces → contributes.views（activityBar；panelType 前缀方言命名空间防全局冲突）
  const surfaces = Array.isArray(manifest.ui && manifest.ui.surfaces) ? manifest.ui.surfaces : []
  const views = surfaces
    .filter((s) => s && typeof s.id === 'string' && s.id)
    .map((surface, index) => {
      if (surface.resourceUri) {
        // L1 不渲染 MCP Apps 沙箱页；保留诊断，resourceUri 由宿主存 compat 字段（L2 前置）
        diagnostics.push(
          `ui.surfaces[${surface.id}].resourceUri 暂不支持页面渲染（L2 沙箱），L1 仅注册入口`,
        )
      }
      const title = surface.title && typeof surface.title === 'object' ? surface.title : {}
      const viewSlug = slugify(surface.id, `surface${index}`)
      return {
        id: `zc:${slugify(manifest.name, 'plugin')}:${viewSlug}`,
        area: 'activityBar',
        panelType: `zc:${slugify(manifest.name, 'plugin')}:${viewSlug}`,
        icon: 'Bot',
        labelKey: `zc:view:${slugify(manifest.name, 'plugin')}:${viewSlug}`,
        labelDefault: title.en || title['zh-CN'] || name,
        order: index,
      }
    })

  if (manifest.userConfig) {
    diagnostics.push(
      'userConfig 暂不支持（L2：宿主管配置 + 表单渲染），相关 `${user_config.*}` 引用需作者手动处理',
    )
  }

  const plugin = {
    // 宿主会在 admit 阶段强制校验该前缀（spec §3.1 idPrefix）
    id: ID_PREFIX + slugify(manifest.name || manifest.id, 'unknown'),
    name,
    version,
    description: typeof manifest.description === 'string' ? manifest.description : undefined,
    contributes: {
      mcpServers,
      // views 为空数组时省略，让宿主按「仅工具型插件」处理
      ...(views.length > 0 ? { views } : {}),
    },
    permissions: { workspaceRead: true, aiToolAccess: true },
    // compat 元数据：供宿主 L2 兼容层与诊断展示（可被 deny_unknown_fields 场合安全剥离）
    compat: {
      dialect: DIALECT,
      language: 'zcode',
      surfaces: surfaces.map((s) => ({ id: s.id, resourceUri: s.resourceUri })).filter(Boolean),
    },
  }

  return { schemaVersion: SCHEMA_VERSION, plugin, diagnostics }
}

/** discover：扫描 rootPath 下 .zcode-plugin/plugin.json（一层深度内，逗号分隔遍历规则如下） */
function discover(rootPath) {
  const diagnostics = []
  const candidates = []
  if (!rootPath || typeof rootPath !== 'string') {
    return { schemaVersion: SCHEMA_VERSION, dialect: DIALECT, candidates, diagnostics: ['rootPath 为空'] }
  }
  const root = path.resolve(rootPath)
  let entries = []
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch (e) {
    return {
      schemaVersion: SCHEMA_VERSION,
      dialect: DIALECT,
      candidates,
      diagnostics: [`rootPath 不可读: ${e.message}`],
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(root, entry.name, ZCODE_LAYOUT_DIR, ZCODE_LAYOUT_FILE)
    if (!fs.existsSync(manifestPath)) continue
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch (e) {
      diagnostics.push(`discover: ${manifestPath} 解析失败: ${e.message}`)
      continue
    }
    candidates.push({ path: entry.name, manifestPath, manifest })
  }
  return { schemaVersion: SCHEMA_VERSION, dialect: DIALECT, candidates, diagnostics }
}

/* ---------- 行分隔 JSON-RPC 2.0 over stdio（与 Polaris 插件 MCP server 同型） ---------- */

const tools = [
  {
    name: 'discover',
    description:
      '扫描指定 rootPath（一层深度）内的 .zcode-plugin/plugin.json 布局，返回 ZCode 方言插件候选清单',
    inputSchema: {
      type: 'object',
      required: ['rootPath'],
      properties: {
        rootPath: { type: 'string', description: '扫描根目录（绝对路径）' },
      },
    },
  },
  {
    name: 'translate',
    description: '把一份 ZCode manifest 翻译为 Polaris manifest 草稿（产物必过宿主单源校验）',
    inputSchema: {
      type: 'object',
      properties: {
        manifestPath: { type: 'string', description: 'ZCode plugin.json 路径（与 manifest 二选一）' },
      },
    },
  },
]

const handlers = {
  discover,
  translate,
  initialize() {
    return { protocolVersion: '2.0.0', capabilities: { tools: {} } }
  },
  'tools/list'(args) {
    return { tools }
  },
  'tools/call'(args) {
    const toolName = args.name
    const toolArgs = args.arguments || {}
    const handler = handlers[toolName]
    if (!handler) return { content: [{ type: 'text', text: `未知工具: ${toolName}` }], isError: true }
    let output
    if (toolName === 'translate') {
      let manifest = toolArgs.manifest
      if (!manifest && toolArgs.manifestPath) {
        try {
          manifest = JSON.parse(fs.readFileSync(toolArgs.manifestPath, 'utf8'))
        } catch (e) {
          return {
            content: [{ type: 'text', text: `translate: 读文件失败 ${e.message}` }],
            isError: true,
          }
        }
      }
      output = translate(manifest)
      // 主入参是 manifest 对象或路径；输出原文返回（schemaVersion + plugin + diagnostics）
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        isError: !output.plugin,
      }
    }
    if (toolName === 'discover') {
      output = discover(toolArgs.rootPath)
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] }
    }
    return { content: [{ type: 'text', text: `未知工具: ${toolName}` }], isError: true }
  },
}

function respond(msg) {
  const handler = handlers[msg.method]
  if (!handler) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `未知方法: ${msg.method}` },
    }
  }
  try {
    const result = handler(msg.params || {})
    return { jsonrpc: '2.0', id: msg.id, result }
  } catch (e) {
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: String(e.message || e) } }
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch (e) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: '解析错误' } }) + '\n')
      continue
    }
    process.stdout.write(JSON.stringify(respond(msg)) + '\n')
  }
})
process.stdin.resume()
