'use strict';
/**
 * version-lens MCP server（stdio JSON-RPC 2.0）
 * stdout 只输出协议 JSON 行；一切日志走 stderr（platform-constraints 纪律）。
 * 三工具：version_lens_explain / version_lens_check / version_lens_sort
 */
const core = require('../shared/version-core.js');

const SERVER_INFO = { name: 'version-lens', version: '0.1.0' };

const TOOLS = [
  {
    name: 'version_lens_explain',
    description:
      '解析 npm semver 版本范围并给出中文逐部分解释与坑检测：比较器展开（插入符/波浪线/通配/部分版本跳段语义）、每个交集组的上下界、坑列表（0.x 插入符锁定次版本、0.0.x 锁定补丁、预发布门控、>1.2 跳段、空交集组、=1.2 并非精确等于、构建元数据被忽略）。输入 range 字符串。',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'npm semver 范围，如 "^1.2.3"、"~0.2.x"、"1.2.3 - 2 || >=3 <4.0.0-0"' },
      },
      required: ['range'],
    },
  },
  {
    name: 'version_lens_check',
    description:
      '给定 semver 范围与候选版本清单，逐版本判定「匹配/不匹配 + 中文原因」：匹配时给出放行的交集组，不匹配时给出首个拒绝它的比较器；被预发布门控拦下（版本落区间内但带 -beta/-rc 后缀且范围未显式声明同版本预发布）时单独说明。这是排查「为什么这个版本装不上」的工具。',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'npm semver 范围' },
        versions: { type: 'array', items: { type: 'string' }, description: '候选版本列表，每项一个完整版本号如 "1.2.3-beta.4"' },
      },
      required: ['range', 'versions'],
    },
  },
  {
    name: 'version_lens_sort',
    description:
      'semver 版本列表排序（升序，预发布先于正式版、数字标识符按数值、构建元数据忽略），并保留相等版本的原始顺序。无效版本单独列出并给原因。',
    inputSchema: {
      type: 'object',
      properties: {
        versions: { type: 'array', items: { type: 'string' }, description: '版本列表' },
      },
      required: ['versions'],
    },
  },
];

// ---------- 工具实现 ----------
function fmtPitfalls(list) {
  if (!list || list.length === 0) return '';
  return list.map((p) => `- ⚠️ ${p.message}`).join('\n');
}

function toolExplain(args) {
  const range = String(args.range == null ? '' : args.range);
  const parsed = core.parseRange(range);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, text: `❌ 无法解析范围「${range}」：${parsed.error}` };
  }
  const ex = core.explainRange(parsed);
  const lines = [];
  lines.push(`# 范围解析：\`${range}\``);
  ex.sets.forEach((s, i) => {
    lines.push('');
    if (ex.sets.length > 1) lines.push(`## 交集组 ${i + 1}：\`${s.raw}\``);
    else lines.push(`## 交集组：\`${s.raw}\``);
    if (s.any) {
      lines.push('- 任意版本（*）：无上下界限制');
    } else if (s.comparators.length === 0) {
      lines.push('- （空）');
    } else {
      for (const c of s.comparators) lines.push(`- \`${c.raw}\` —— ${c.text}`);
      if (s.empty) lines.push('- ❌ 该组区间为空（下界不低于上界），永远不会匹配');
    }
  });
  const pits = fmtPitfalls(parsed.pitfalls);
  if (pits) {
    lines.push('');
    lines.push('## 坑检测');
    lines.push(pits);
  }
  return { ok: true, structured: ex, text: lines.join('\n') };
}

function toolCheck(args) {
  const range = String(args.range == null ? '' : args.range);
  const versions = Array.isArray(args.versions) ? args.versions.map(String) : [];
  if (versions.length === 0) return { ok: false, error: 'versions 不能为空', text: '❌ versions 不能为空' };
  const r = core.buildCheckRows(range, versions);
  if (!r.ok) return { ok: false, error: r.error, text: `❌ 无法解析范围「${range}」：${r.error}` };

  const lines = [`# 逐版本判定：\`${range}\``, ''];
  lines.push('| 版本 | 判定 | 说明 |');
  lines.push('|---|---|---|');
  for (const row of r.rows) {
    if (!row.valid) {
      lines.push(`| ${row.input} | ❓ 无效 | ${row.error} |`);
      continue;
    }
    const mark = row.kind === 'match' ? '✅ 匹配' : (row.kind === 'gate' ? '🚪 门控拦截' : '❌ 不匹配');
    lines.push(`| ${row.version.raw} | ${mark} | ${row.reason} |`);
  }
  const pits = fmtPitfalls(r.pitfalls);
  if (pits) {
    lines.push('');
    lines.push('## 范围本身的坑');
    lines.push(pits);
  }
  return { ok: true, structured: { rows: r.rows }, text: lines.join('\n') };
}

function toolSort(args) {
  const versions = Array.isArray(args.versions) ? args.versions.map(String) : [];
  if (versions.length === 0) return { ok: false, error: 'versions 不能为空', text: '❌ versions 不能为空' };
  const r = core.sortVersions(versions);
  const lines = ['# 排序结果（升序）', ''];
  r.sorted.forEach((it, i) => {
    lines.push(`${i + 1}. \`${it.raw}\`${it.parsed.prerelease.length > 0 ? '（预发布）' : ''}`);
  });
  if (r.invalid.length > 0) {
    lines.push('');
    lines.push('## 无效版本');
    for (const inv of r.invalid) lines.push(`- \`${inv.raw}\` —— ${inv.error}`);
  }
  return { ok: true, structured: r, text: lines.join('\n') };
}

const HANDLERS = {
  version_lens_explain: toolExplain,
  version_lens_check: toolCheck,
  version_lens_sort: toolSort,
};

// ---------- JSON-RPC 骨架 ----------
function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) {
      process.stderr.write(`[version-lens] 非 JSON 行忽略: ${e.message}\n`);
      continue;
    }
    if (msg.id === undefined) continue; // 通知（notifications/initialized 等）不回包
    if (msg.method === 'initialize') {
      reply(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    } else if (msg.method === 'tools/list') {
      reply(msg.id, { tools: TOOLS });
    } else if (msg.method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      const fn = HANDLERS[name];
      if (!fn) {
        reply(msg.id, { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true });
        continue;
      }
      try {
        const r = fn(args);
        reply(msg.id, { content: [{ type: 'text', text: r.text }], isError: !r.ok });
      } catch (e) {
        reply(msg.id, { content: [{ type: 'text', text: `工具执行异常：${e && e.message}` }], isError: true });
      }
    } else {
      replyError(msg.id, -32601, `方法不存在：${msg.method}`);
    }
  }
});
process.stdin.on('end', () => process.exit(0));
