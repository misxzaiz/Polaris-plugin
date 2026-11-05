#!/usr/bin/env node
/**
 * K8s 清单体检台 MCP Server 源码（esbuild bundle → ../server.js，js-yaml 打入包内）。
 *
 * 协议数据只走 stdout，日志走 stderr（JSON-RPC 2024-11-05）。
 * 四工具（前缀 k8s_）：
 *   k8s_lint     体检一段（多文档）K8s YAML 清单
 *   k8s_scan     只读扫描目录下的 *.yml|yaml（解析出 ≥1 个有效 k8s 文档才体检）
 *   k8s_rules    规则目录
 *   k8s_explain  按规则 id 解释单条规则
 *
 * 纯本地：不访问网络、不连集群；scan 只读文件，不上报、不缓存任何内容。
 */
import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml'; // esbuild bundle 时打入 ../server.js（勿用 createRequire：CJS 输出无 import.meta.url）
import * as core from '../../shared/k8s-core.js';

const SERVER_NAME = 'k8s-lens';
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

/** YAML 解析（core 契约：失败抛错，core 归一为 {line,message}；e.mark 0 基 → core +1） */
function parseYamlDoc(text) {
  try {
    return yaml.load(text, { schema: yaml.DEFAULT_SCHEMA });
  } catch (e) {
    const wrapped = new Error(e && e.message ? String(e.message).split('\n')[0] : '未知 YAML 错误');
    wrapped.mark = e && e.mark ? e.mark : null;
    throw wrapped;
  }
}

/** 递归收集体检目标（只读；跳过构建/依赖目录；文件数护栏） */
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
      } else if (ent.isFile() && (ent.name.endsWith('.yml') || ent.name.endsWith('.yaml'))) {
        targets.push(full);
      }
    }
  };
  walk(rootDir, 0);
  return targets;
}

/** 文件内容是否含 k8s 清单（任一 apiVersion+kind 组合；排除 Helm 模板文档由 core 逐文档判定） */
function looksLikeK8sManifest(raw) {
  return /(^|\n)\s*apiVersion\s*:/.test(raw) && /(^|\n)\s*kind\s*:/.test(raw);
}

function doScan(dirArg, maxFilesArg) {
  const rootDir = path.resolve(String(dirArg || '').trim());
  let st;
  try { st = fs.statSync(rootDir); } catch { return err(`目录不存在或不可访问：${rootDir}`); }
  if (!st.isDirectory()) return err(`不是目录：${rootDir}`);
  const maxFiles = Math.min(Math.max(1, Number(maxFilesArg) || SCAN_MAX_FILES_DEFAULT), SCAN_MAX_FILES_MAX);
  const targets = collectTargets(rootDir, maxFiles);
  if (!targets.length) {
    return ok(`目录下未发现 *.yml|yaml：${rootDir}`);
  }
  const sections = [];
  const totals = { files: 0, findings: 0, error: 0, warn: 0, info: 0, worstScore: 10, worstFile: '', skipped: 0 };
  for (const file of targets) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { sections.push(`**${file}** 读取失败：${e.message}`); continue; }
    if (raw.length > SCAN_FILE_CAP) { sections.push(`**${file}** 超过 512KB，跳过（请人工确认）`); continue; }
    if (!looksLikeK8sManifest(raw)) { totals.skipped++; continue; } // 非 k8s 清单（如 CI 工作流）不体检
    const r = core.lint(raw, { parseYaml: parseYamlDoc });
    totals.files++; totals.findings += r.findings.length;
    totals.error += r.stats.error; totals.warn += r.stats.warn; totals.info += r.stats.info;
    if (r.score < totals.worstScore) { totals.worstScore = r.score; totals.worstFile = file; }
    sections.push(core.renderReport(r, path.relative(rootDir, file).replace(/\\/g, '/') || path.basename(file)));
  }
  if (!totals.files) {
    return ok(`目录下 ${targets.length} 个 YAML 中没有 K8s 清单（需要同时含 apiVersion 与 kind）：${rootDir}`);
  }
  const summary = [
    `### K8s 清单目录体检汇总 —— ${rootDir}`,
    `体检 ${totals.files} 个清单文件 · 跳过非清单 YAML ${totals.skipped} 个 · 发现 ${totals.findings} 项（error ${totals.error} · warn ${totals.warn} · info ${totals.info}） · 最低评分 **${totals.worstScore}/10**${totals.worstFile ? `（${totals.worstFile}）` : ''}`,
    '',
    ...sections,
  ];
  return ok(summary.join('\n\n'));
}

const tools = [
  {
    name: 'k8s_lint',
    description: 'K8s 清单体检一段（可多文档 --- 分隔）YAML：返回行级发现（规则/严重级/行号）+ 中文修复建议 + 0-10 评分。覆盖：apply 即失败的结构错误（缺 apiVersion/kind/name、kind 与 apiVersion 错配、已移除的弃用 API 如 apps/v1beta1/extensions/v1beta1/policy/v1beta1、labels 值非字符串）、安全红线（privileged/hostNetwork/hostPID/hostIPC/hostPath/明文密钥）、可靠性（缺资源 limits、缺探针、latest 镜像、Job restartPolicy、cron 表达式）、跨资源一致性（selector 不匹配、ConfigMap/Secret/PVC 引用缺失、Service targetPort 对不上、Ingress 后端断链）。纯本地离线，不连集群。',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'K8s YAML 清单全文（多文档用 --- 分隔）' },
      },
      required: ['text'],
    },
    async call(args) {
      const text = args && args.text;
      if (typeof text !== 'string' || !text.trim()) return err('缺少 text（K8s YAML 清单文本，必填且非空）');
      if (text.length > INPUT_CAP) return err(`文本过大（${text.length} 字符 > 1MB），请分段体检`);
      if (core.detectKind(text) !== 'k8s' && !core.looksLikeHelm(text)) {
        return err('内容不像 K8s 清单（未发现 apiVersion+kind）。确认粘贴的是 Kubernetes 资源 YAML（Helm 模板可跳过本工具）。');
      }
      const r = core.lint(text, { parseYaml: parseYamlDoc });
      return ok(core.renderReport(r));
    },
  },
  {
    name: 'k8s_scan',
    description: '只读扫描一个本地目录：发现 *.yml|yaml 中含 K8s 清单的文件（需同时含 apiVersion+kind），逐文件体检并给汇总报告（逐文件评分 + 总计）。部署前对整个仓库/清单目录做安检。自动跳过非清单 YAML（CI 工作流等）、Helm 模板文档、.git/node_modules 等目录。只读不写、纯本地、不连集群。',
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
    name: 'k8s_rules',
    description: 'K8s 清单体检规则目录：列出全部内置规则（id、严重级、含义、修复建议）。用户问「检查什么」或需要总览时使用。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      return ok(core.ruleCatalog());
    },
  },
  {
    name: 'k8s_explain',
    description: '按规则 id 解释一条体检规则（含义 + 修复建议）。用户对某个 k8s_* 规则不理解时使用，如 k8s-deprecated-api、k8s-plaintext-secret。',
    inputSchema: {
      type: 'object',
      properties: {
        rule: { type: 'string', description: '规则 id，如 k8s-privileged' },
      },
      required: ['rule'],
    },
    async call(args) {
      const id = args && args.rule;
      if (typeof id !== 'string' || !id.trim()) return err('缺少 rule（规则 id，必填）');
      const text = core.explainRule(id.trim());
      if (!text) return err(`未知规则 id：${id}（用 k8s_rules 查看全部规则）`);
      return ok(text);
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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready（${core.RULE_COUNT} 条规则，纯本地离线）`);
