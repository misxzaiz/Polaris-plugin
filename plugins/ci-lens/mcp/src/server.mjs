#!/usr/bin/env node
/**
 * CI 体检台 MCP Server 源码（esbuild bundle → ../server.js，js-yaml 打入包内）。
 *
 * 协议数据只走 stdout，日志走 stderr（JSON-RPC 2024-11-05）。
 * 三工具（前缀 cil_）：
 *   cil_lint  体检一段配置文本（kind 缺省 auto 自动识别 Dockerfile/工作流）
 *   cil_scan  只读扫描目录下的 Dockerfile* 与 .github/workflows/*.yml|yaml 并逐个体检
 *   cil_rules 规则目录（含每条修复建议）
 *
 * 纯本地：不访问网络；scan 只读文件，不上报、不缓存任何内容。
 */
import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml'; // esbuild bundle 时打入 ../server.js（勿用 createRequire：CJS 输出无 import.meta.url）
import * as core from '../../shared/ci-core.js';

const SERVER_NAME = 'ci-lens';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const INPUT_CAP = 1024 * 1024;
const SCAN_FILE_CAP = 512 * 1024;
const SCAN_MAX_FILES_DEFAULT = 40;
const SCAN_MAX_FILES_MAX = 200;
const SCAN_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'target', '.venv', 'venv', '__pycache__', '.next']);

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}
function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

/**
 * YAML 解析（core 契约：返回解析产物；失败时抛错，core 会归一为 {line,message}）。
 * e.mark 是 0 基行号，core.lint 内部统一 +1 转 1 基。
 */
function parseWorkflowDoc(text) {
  try {
    return yaml.load(text, { schema: yaml.DEFAULT_SCHEMA });
  } catch (e) {
    const wrapped = new Error(e && e.message ? String(e.message).split('\n')[0] : '未知 YAML 错误');
    wrapped.mark = e && e.mark ? e.mark : null;
    throw wrapped;
  }
}

/** 体检一段文本，返回统一结果或 null（无法识别） */
function lintText(text, kind) {
  return core.lint(text, kind || 'auto', { parseYaml: parseWorkflowDoc });
}

/** 判断文件名是否是候选 Dockerfile */
function isDockerfileName(name) {
  return name === 'Dockerfile' || name === 'dockerfile' || /^Dockerfile\./.test(name) || /\.dockerfile$/i.test(name);
}

/** 递归收集体检目标（只读；跳过构建/依赖目录；上限护栏） */
function collectTargets(rootDir, maxFiles) {
  const targets = [];
  const walk = (dir, depth) => {
    if (targets.length >= maxFiles || depth > 8) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (targets.length >= maxFiles) return;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SCAN_SKIP_DIRS.has(ent.name)) continue;
        walk(full, depth + 1);
      } else if (ent.isFile()) {
        if (isDockerfileName(ent.name)) targets.push(full);
        else if (ent.name.endsWith('.yml') || ent.name.endsWith('.yaml')) {
          // workflows 目录约束：只认 .github/workflows 下的 YAML，避免误扫无关 yaml
          const norm = path.relative(rootDir, full).replace(/\\/g, '/');
          if (norm === '.github/workflows/' + ent.name || /^\.github\/workflows\//.test(norm)) targets.push(full);
        }
      }
    }
  };
  walk(rootDir, 0);
  return targets;
}

function doScan(dirArg, maxFilesArg) {
  const rootDir = path.resolve(String(dirArg || '').trim());
  let st;
  try { st = fs.statSync(rootDir); } catch { return err(`目录不存在或不可访问：${rootDir}`); }
  if (!st.isDirectory()) return err(`不是目录：${rootDir}`);
  const maxFiles = Math.min(Math.max(1, Number(maxFilesArg) || SCAN_MAX_FILES_DEFAULT), SCAN_MAX_FILES_MAX);
  const targets = collectTargets(rootDir, maxFiles);
  if (!targets.length) {
    return ok(`目录下未发现体检目标（Dockerfile* / .github/workflows/*.yml|yaml）：${rootDir}\n提示：确认路径正确；工作流必须位于 .github/workflows/ 下。`);
  }
  const sections = [];
  const totals = { files: 0, findings: 0, error: 0, warn: 0, info: 0, worstScore: 10 };
  for (const file of targets) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { sections.push(`**${file}** 读取失败：${e.message}`); continue; }
    if (raw.length > SCAN_FILE_CAP) { sections.push(`**${file}** 超过 512KB，跳过（请人工确认）`); continue; }
    const kindHint = isDockerfileName(path.basename(file)) ? 'dockerfile' : 'workflow';
    const r = core.lint(raw, kindHint, { parseYaml: parseWorkflowDoc });
    if (!r) continue;
    const rel = path.relative(rootDir, file).replace(/\\/g, '/') || path.basename(file);
    totals.files++; totals.findings += r.findings.length;
    totals.error += r.stats.error; totals.warn += r.stats.warn; totals.info += r.stats.info;
    if (r.score < totals.worstScore) totals.worstScore = r.score;
    sections.push(core.renderReport(r, rel));
  }
  const summary = [
    `### 目录体检汇总 —— ${rootDir}`,
    `体检文件 ${totals.files} 个 · 发现 ${totals.findings} 项（error ${totals.error} · warn ${totals.warn} · info ${totals.info}） · 最低评分 **${totals.worstScore}/10**`,
    '',
    ...sections,
  ];
  return ok(summary.join('\n\n'));
}

const tools = [
  {
    name: 'cil_lint',
    description: 'CI 配置体检一段文本：自动识别 Dockerfile 或 GitHub Actions 工作流，返回行级发现（规则/严重级/行号）+ 中文修复建议 + 0-10 评分。基础镜像未钉版本、apt/apk 缓存卫生、curl|sh、多 CMD、needs 环、runs-on 拼写、${{ 未闭合、secrets.github_token 大小写、pull_request_target 危险组合等约 37 条规则。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Dockerfile 或 workflow YAML 全文' },
        kind: { type: 'string', enum: ['auto', 'dockerfile', 'workflow'], description: '配置类型，缺省 auto 自动识别；识别失败时显式指定' },
      },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少 text（Dockerfile 或 workflow YAML 文本，必填且非空）');
      if (text.length > INPUT_CAP) return err(`文本过大（${text.length} 字符 > 1MB），请分段体检`);
      const kind = args.kind || 'auto';
      if (kind !== 'auto' && kind !== 'dockerfile' && kind !== 'workflow') return err(`kind 只支持 auto/dockerfile/workflow，收到：${kind}`);
      const r = lintText(text, kind);
      if (!r) {
        const detected = core.detectKind(text);
        return err(`无法识别配置类型（自动识别结果：${detected}）。请显式传 kind=dockerfile 或 kind=workflow；仍失败则确认内容是否为 Dockerfile/workflow YAML。`);
      }
      return ok(core.renderReport(r));
    },
  },
  {
    name: 'cil_scan',
    description: '只读扫描一个本地目录：发现 Dockerfile*（含 Dockerfile.dev、*.dockerfile）与 .github/workflows/*.yml|yaml，逐个体检并给汇总报告（逐文件评分 + 总计）。push 前对整个仓库做 CI 配置安检。只读不写、纯本地。',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: '要体检的目录绝对路径（或相对路径）' },
        maxFiles: { type: 'number', description: '最多体检文件数，缺省 40，上限 200' },
      },
      required: ['dir'],
    },
    async call(args) {
      if (!args || typeof args.dir !== 'string' || !args.dir.trim()) return err('缺少 dir（目录路径，必填）');
      return doScan(args.dir, args.maxFiles);
    },
  },
  {
    name: 'cil_rules',
    description: 'CI 体检规则目录：列出 Dockerfile / 工作流全部内置规则（id、严重级、修复建议）。用户问「你们检查什么」或需要解释某条规则时使用。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['all', 'dockerfile', 'workflow'], description: '缺省 all' },
      },
    },
    async call(args) {
      const kind = args && args.kind ? args.kind : 'all';
      if (!['all', 'dockerfile', 'workflow'].includes(kind)) return err(`kind 只支持 all/dockerfile/workflow，收到：${kind}`);
      return ok(core.ruleCatalog(kind));
    },
  },
];

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

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
    try { msg = JSON.parse(line); } catch (_) { continue; }
    handleMessage(msg).catch((e) => {
      log('error', `handleMessage: ${e.message}`);
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e.message } });
    });
  }
});

async function handleMessage(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0', id: msg.id,
      result: { tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) },
    });
    return;
  }
  if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: '2.0', id: msg.id, result: err(`未知工具：${name}`) });
      return;
    }
    try {
      const result = await tool.call(args);
      send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (e) {
      log('error', `tool ${name}: ${e.message}`);
      send({ jsonrpc: '2.0', id: msg.id, result: err(`执行失败：${e.message}`) });
    }
    return;
  }
  if (msg.id !== undefined) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } });
  }
}

process.on('uncaughtException', (e) => log('error', `uncaught: ${e.stack || e.message}`));
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（Dockerfile ${core.DOCKER_RULES.length} 条 + 工作流 ${core.WORKFLOW_RULES.length} 条规则，纯本地）`);
