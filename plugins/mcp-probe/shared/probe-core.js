'use strict';
/**
 * probe-core.js —— MCP 调试台纯函数核心（无 IO，供面板/服务/单测三方共用）
 *
 * 职责边界：所有「判断与变换」收敛在这里；连接、spawn、HTTP 由 service/mcpclient.js 承担。
 * 本文件不 require 任何 node 内置模块，保持可被 esbuild 面板 bundle 与 node 测试直接加载。
 */

/** 短 id：前缀 + 时间基36 + 随机，够防碰撞且人类可读 */
function newId(prefix) {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix || 'id'}-${t}${r}`;
}

/** 稳定 stringify：键排序后序列化，供 schema 对比（JSON.stringify 键序不稳定会误报漂移） */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((v) => (v === undefined ? 'null' : stableStringify(v)));
    return `[${items.join(',')}]`;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${parts.join(',')}}`;
}

/* ============================== 表单推导 ============================== */

/**
 * JSON Schema → 自动表单字段模型。
 * 返回 { mode:'fields'|'json', fields:[{path,name,type,required,enum,default,description,placeholder}] }
 * 顶层非 object / 无 properties / 嵌套 object|array 时整体回退 JSON 编辑器（mode:'json'），
 * 保证「常用平铺参数有表单、复杂结构有兜底」，不追求完整 JSON Schema 实现。
 */
function deriveFormModel(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { mode: 'json', fields: [], placeholder: '{}' };
  }
  if (schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    return { mode: 'json', fields: [], placeholder: sampleJson(schema) };
  }
  const requiredSet = new Set(Array.isArray(schema.required) ? schema.required : []);
  const fields = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    const p = (prop && typeof prop === 'object' && !Array.isArray(prop)) ? prop : {};
    let type = typeof p.type === 'string' ? p.type : '';
    if (Array.isArray(p.type)) {
      const nonNull = p.type.filter((t) => t !== 'null');
      type = nonNull.length === 1 ? nonNull[0] : 'json';
    }
    if (!type && Array.isArray(p.enum) && p.enum.length) type = 'string';
    if (!type || type === 'object' || type === 'array' || type === 'null') type = 'json';
    const isEnum = Array.isArray(p.enum) && p.enum.length > 0;
    fields.push({
      name,
      path: name,
      type: isEnum ? 'enum' : type,
      required: requiredSet.has(name),
      enum: isEnum ? p.enum : undefined,
      default: p.default,
      description: typeof p.description === 'string' ? p.description : '',
      placeholder: type === 'json' ? sampleJson(p) : '',
    });
  }
  return { mode: 'fields', fields };
}

/** 为复杂类型生成一个可反序列化的示例 JSON（放 placeholder / 默认值） */
function sampleJson(schema) {
  if (!schema || typeof schema !== 'object') return '';
  if (schema.default !== undefined) {
    try { return JSON.stringify(schema.default, null, 2); } catch (_) { /* fallthrough */ }
  }
  if (Array.isArray(schema.enum) && schema.enum.length) {
    try { return JSON.stringify(schema.enum[0], null, 2); } catch (_) { /* fallthrough */ }
  }
  switch (schema.type) {
    case 'array': return '[]';
    case 'object': return '{}';
    case 'string': return '""';
    case 'number':
    case 'integer': return '0';
    case 'boolean': return 'false';
    default: return '';
  }
}

/* ============================== diff ============================== */

/**
 * 对比两份工具清单（[{name, description, inputSchema}]）。
 * 返回 { added:[name], removed:[name], changed:[{name, fields:['description'|'schema']}], unchangedCount }
 */
function diffToolsets(a, b) {
  const mapA = toolMap(a);
  const mapB = toolMap(b);
  const added = [];
  const removed = [];
  const changed = [];
  let unchangedCount = 0;
  for (const [name, ta] of mapA) {
    const tb = mapB.get(name);
    if (!tb) { removed.push(name); continue; }
    const fields = [];
    if ((ta.description || '') !== (tb.description || '')) fields.push('description');
    if (stableStringify(ta.inputSchema || null) !== stableStringify(tb.inputSchema || null)) fields.push('schema');
    if (fields.length) changed.push({ name, fields });
    else unchangedCount += 1;
  }
  for (const name of mapB.keys()) {
    if (!mapA.has(name)) added.push(name);
  }
  added.sort();
  removed.sort();
  changed.sort((x, y) => (x.name < y.name ? -1 : 1));
  return { added, removed, changed, unchangedCount };
}

function toolMap(list) {
  const map = new Map();
  for (const t of Array.isArray(list) ? list : []) {
    if (t && typeof t.name === 'string') map.set(t.name, t);
  }
  return map;
}

/* ============================== 体检（schema 卫生） ============================== */

/**
 * 工具清单卫生检查。绝不执行工具调用——体检只看元数据。
 * 返回 issues: [{ tool, level:'error'|'warn', msg }]
 */
function assessToolset(tools) {
  const issues = [];
  const list = Array.isArray(tools) ? tools : [];
  const seen = new Map();
  for (const t of list) {
    const name = t && typeof t.name === 'string' ? t.name : '';
    if (!name) {
      issues.push({ tool: '(未知名工具)', level: 'error', msg: '工具缺少 name 或 name 非字符串' });
      continue;
    }
    if (seen.has(name)) {
      issues.push({ tool: name, level: 'error', msg: `工具重名（第 ${seen.get(name) + 1}、${list.indexOf(t) + 1} 项同名）` });
    } else {
      seen.set(name, list.indexOf(t));
    }
    const desc = typeof t.description === 'string' ? t.description.trim() : '';
    if (!desc) {
      issues.push({ tool: name, level: 'warn', msg: '缺少 description——模型只能靠工具名猜用途，建议补「适用：用户说…」触发语' });
    } else if (desc.length < 8) {
      issues.push({ tool: name, level: 'warn', msg: `description 过短（${desc.length} 字符）——模型难以判断何时选用` });
    }
    const schema = t.inputSchema;
    if (schema === undefined || schema === null) {
      issues.push({ tool: name, level: 'warn', msg: '缺少 inputSchema——客户端无法生成参数表单，模型只能盲传' });
    } else if (typeof schema !== 'object' || Array.isArray(schema)) {
      issues.push({ tool: name, level: 'error', msg: 'inputSchema 不是对象（应为 JSON Schema object）' });
    } else if (schema.type !== 'object' && !(schema.properties && typeof schema.properties === 'object') && !schema.$ref) {
      issues.push({ tool: name, level: 'warn', msg: 'inputSchema 缺少 type:"object" 且无 properties——多数客户端按空参数处理' });
    }
  }
  return issues;
}

/* ============================== SSE 解析 ============================== */

/**
 * 解析 SSE 文本片段为消息数组（MCP streamable HTTP 响应体）。
 * 宽松实现：事件以空行分隔；data: 多行拼接；忽略注释/ event:/id:/retry: 字段。
 * 每条 data 尝试 JSON.parse，失败保留为 { raw } —— 调试台要如实呈现服务器说了什么。
 */
function parseSseMessages(text) {
  const out = [];
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const events = normalized.split('\n\n');
  for (const evt of events) {
    const dataLines = [];
    for (const line of evt.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).startsWith(' ') ? line.slice(6) : line.slice(5));
      }
      // event:/id:/retry: 忽略（调试台只关心 data 载荷）
    }
    if (!dataLines.length) continue;
    const data = dataLines.join('\n');
    try {
      out.push(JSON.parse(data));
    } catch (_) {
      out.push({ raw: data });
    }
  }
  return out;
}

/* ============================== spawn 计划（win32 引命令） ============================== */

/** win32 下必须经 cmd.exe 的命令名（.cmd shim，spawn 直启会 ENOENT） */
const CMD_SHIMS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'uvx', 'bunx', 'pnmx', 'tnpx']);

/**
 * 生成 spawn 计划。
 * - 非 win32：直接 spawn。
 * - win32：显式 .cmd/.bat 后缀或常见包管理器 shim 名 → 经 cmd.exe /d /s /c；
 *   其余（node.exe、python 等）直接 spawn，ENOENT 由调用方降级重试一次 cmd 计划。
 * 返回 { mode:'direct', file, args } | { mode:'shell', commandline }
 */
function buildSpawnPlan(command, args, platform) {
  const cmd = String(command || '').trim();
  const argList = (Array.isArray(args) ? args : []).map((a) => String(a));
  if (!cmd) return { mode: 'direct', file: '', args: argList };
  if (platform !== 'win32') return { mode: 'direct', file: cmd, args: argList };
  const base = cmd.split(/[\\/]/).pop().toLowerCase();
  if (base.endsWith('.cmd') || base.endsWith('.bat')) {
    return { mode: 'shell', commandline: joinWinCommandline(cmd, argList) };
  }
  const stem = base.replace(/\.(exe|com)$/, '');
  if (CMD_SHIMS.has(stem)) {
    return { mode: 'shell', commandline: joinWinCommandline(cmd, argList) };
  }
  return { mode: 'direct', file: cmd, args: argList };
}

/** cmd.exe 命令行拼接：含空格/特殊字符的参数加双引号，内部双引号转义为 \" */
function quoteWinArg(s) {
  const str = String(s);
  if (str === '') return '""';
  if (/^[A-Za-z0-9_\-.,:=/\\@%+]+$/.test(str)) return str;
  return `"${str.replace(/"/g, '\\"')}"`;
}

function joinWinCommandline(command, args) {
  return [command, ...args].map(quoteWinArg).join(' ');
}

/* ============================== Claude 式配置解析 ============================== */

/**
 * 解析一个 MCP 配置 JSON 文本 → 档案候选。
 * 兼容三种形态：
 *   1. { mcpServers: { name: {command,args,env} | {type:'http'|'sse'|'stdio',...} } }
 *   2. 顶层直接就是 name→server 映射（部分工具导出格式）
 *   3. Claude Code settings.json（mcpServers 可能嵌在顶层，本函数只认 mcpServers 键或映射形态）
 * 返回 { servers:[candidate], skipped:[{name, reason}] }
 * candidate: { key, name, transport:'stdio'|'http', command, args, env, url, headers, legacy }
 */
function parseClaudeConfig(text, sourcePath) {
  const result = { servers: [], skipped: [] };
  let root;
  try {
    root = JSON.parse(String(text || ''));
  } catch (e) {
    result.skipped.push({ name: '(整文件)', reason: `JSON 解析失败: ${e.message}` });
    return result;
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    result.skipped.push({ name: '(整文件)', reason: '顶层不是 JSON 对象' });
    return result;
  }
  const map = root.mcpServers && typeof root.mcpServers === 'object' && !Array.isArray(root.mcpServers)
    ? root.mcpServers
    : root;
  for (const [name, raw] of Object.entries(map)) {
    const cand = normalizeServerEntry(name, raw, sourcePath);
    if (cand.error) result.skipped.push({ name, reason: cand.error });
    else result.servers.push(cand);
  }
  return result;
}

function normalizeServerEntry(name, raw, sourcePath) {
  const key = `${sourcePath || 'manual'}#${name}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: '条目不是对象' };
  }
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : '';
  if (typeof raw.url === 'string' && raw.url) {
    if (raw.command || raw.args) return { error: '同时含 url 与 command，无法判断传输类型' };
    const transport = 'http';
    const legacy = type === 'sse';
    if (!/^https?:\/\//i.test(raw.url)) return { error: `url 非法（仅支持 http/https）: ${raw.url}` };
    return {
      key, name, transport, legacy,
      url: raw.url,
      headers: plainObject(raw.headers),
      command: '', args: [], env: {},
    };
  }
  if (typeof raw.command === 'string' && raw.command.trim()) {
    return {
      key, name, transport: 'stdio', legacy: false,
      command: raw.command.trim(),
      args: Array.isArray(raw.args) ? raw.args.map(String) : [],
      env: plainObject(raw.env),
      url: '', headers: {},
    };
  }
  return { error: type ? `type "${type}" 条目缺少 url/command` : '条目缺少 url 与 command' };
}

function plainObject(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      out[k] = String(val);
    }
  }
  return out;
}

/* ============================== 脱敏与容量 ============================== */

const SECRET_KEY_RE = /(token|secret|password|passwd|api[-_]?key|apikey|authorization|credential|cookie|session[-_]?id)/i;

function isSecretKey(k) {
  return SECRET_KEY_RE.test(String(k || ''));
}

/** 浅层脱敏：仅处理第一层的键值对（headers/env/扁平对象）；非对象原样返回 */
function redactValue(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = isSecretKey(k) && typeof v === 'string' && v ? '******' : v;
  }
  return out;
}

/** 列表封顶（历史/快照/体检报告的持久化上限），超出从尾部裁剪 */
function capList(list, max) {
  const arr = Array.isArray(list) ? list : [];
  return arr.length <= max ? arr : arr.slice(0, max);
}

module.exports = {
  newId,
  stableStringify,
  deriveFormModel,
  sampleJson,
  diffToolsets,
  assessToolset,
  parseSseMessages,
  CMD_SHIMS,
  buildSpawnPlan,
  quoteWinArg,
  parseClaudeConfig,
  isSecretKey,
  redactValue,
  capList,
};
