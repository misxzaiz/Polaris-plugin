#!/usr/bin/env node
'use strict';
/**
 * 执行沙箱 MCP Server —— AI 工具层（零依赖 stdio，JSON-RPC 2024-11-05）
 *
 * 协议数据只走 stdout，日志走 stderr。参数：node server.js {{appConfigDir}}
 * 纯逻辑见 shared/sandbox-core.js（单一权威）；cap.kv 桥见 service/kvclient.js
 * （task-runner 验证过的样板复制）。
 *
 * 五工具（前缀 execsandbox_）：
 *   create  创建一次性隔离工作区（返回 workspaceId 与目录）
 *   write   在工作区内写文件（严格根边界校验）
 *   exec    在工作区 cwd 执行命令（confirm 双闸；超时树杀；输出截尾 8KB）
 *   list    列活跃工作区（惰性清理过期项）
 *   destroy 销毁工作区（confirm 双闸；递归删目录；根边界校验）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../shared/sandbox-core');
const { createKvClient } = require('../service/kvclient');

const SERVER_NAME = 'exec-sandbox';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

const APP_CONFIG_DIR = process.argv[2] || '';

function log(level, msg) {
  process.stderr.write(`[${SERVER_NAME}:${level}] ${new Date().toISOString()} ${msg}\n`);
}

const kv = createKvClient({ appConfigDir: APP_CONFIG_DIR, log: (l, m) => log(l, m) });

// 沙箱根（node 侧组装；env EXEC_SANDBOX_ROOT 仅测试注入用）：
//   os.tmpdir()/polaris-exec-sandbox/<workspaceId>/
const ROOT = process.env.EXEC_SANDBOX_ROOT && typeof process.env.EXEC_SANDBOX_ROOT === 'string'
  ? path.resolve(process.env.EXEC_SANDBOX_ROOT)
  : path.join(os.tmpdir(), core.TMP_ROOT_NAME);

function workspaceDir(root, id) { return path.join(root, id); }

/** 写路径校验：resolve 后必须严格位于 root/<id> 内（整段前缀比对防撞名） */
function resolveSafeWritePath(root, workspaceId, relPath) {
  const wsDir = path.resolve(workspaceDir(root, workspaceId));
  if (!relPath || typeof relPath !== 'string') return { ok: false, error: '缺少写入路径' };
  const target = path.resolve(wsDir, relPath);
  if (target !== wsDir && !core.isInsideRoot(wsDir, target)) {
    return { ok: false, error: `路径越界：${relPath} 不在工作区内` };
  }
  return { ok: true, target };
}

function ok(text) { return { content: [{ type: 'text', text }], isError: false }; }
function err(text) { return { content: [{ type: 'text', text }], isError: true }; }

// ── 工作区元数据 IO ────────────────────────────────────────────────────────

async function loadMeta(workspaceId) {
  const raw = await kv.kvGet(core.wsKey(workspaceId)).catch(() => null);
  return core.normalizeWorkspace(raw);
}

async function saveMeta(meta) {
  await kv.kvSet(core.wsKey(meta.workspaceId), meta);
  return meta;
}

/** 惰性清理：过期工作区删元数据 + 删目录（目录已不存在则静默） */
async function sweepExpired() {
  const keys = await kv.kvKeys().catch(() => []);
  const now = Date.now();
  const swept = [];
  for (const k of keys) {
    if (!k.startsWith(core.KV_PREFIX)) continue;
    // eslint-disable-next-line no-await-in-loop
    const meta = core.normalizeWorkspace(await kv.kvGet(k).catch(() => null));
    if (!meta || !core.isExpired(meta, now)) continue;
    // eslint-disable-next-line no-await-in-loop
    await destroyDir(meta).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await kv.kvDel(k).catch(() => {});
    swept.push(meta.workspaceId);
  }
  return swept;
}

function destroyDir(meta) {
  // rm 退避重试：刚 exec 超时树杀就 destroy 时，被杀进程的目录句柄在 Windows
  // 上需秒级释放（实测 kill 后 ~1-3s 内 rm 持续 EPERM，进程已死也如此），
  // 故重试窗口拉到 ~3.4s；仍失败则如实报"暂时占用"。
  return new Promise((resolve) => {
    if (!meta || !meta.dir) return resolve(false);
    const dir = path.resolve(meta.dir);
    // 根边界：只允许删沙箱根下的目录（防元数据被篡改后误删别处）
    if (!core.isInsideRoot(ROOT, dir) || dir === path.resolve(ROOT)) {
      return resolve(false);
    }
    const RETRIES = 8;
    const attempt = (n) => {
      fs.rm(dir, { recursive: true, force: true }, (e) => {
        if (!e) return resolve(true);
        if (n < RETRIES - 1) return setTimeout(() => attempt(n + 1), 400);
        resolve(false);
      });
    };
    attempt(0);
  });
}

// ── 五工具 ─────────────────────────────────────────────────────────────────

const tools = [
  {
    name: 'execsandbox_create',
    description: '创建一次性隔离执行工作区（24h 自动过期）。返回 workspaceId 与目录路径，后续 write/exec/destroy 用它引用。适用「我要跑段代码但不想污染当前目录」「给我一个临时工作目录」。零确认。',
    inputSchema: {
      type: 'object',
      properties: { label: { type: 'string', description: '用途标签（可选，≤100 字）' } },
    },
    async call(args) {
      await sweepExpired();
      const id = core.makeWorkspaceId();
      const dir = workspaceDir(ROOT, id);
      await fs.promises.mkdir(dir, { recursive: true });
      const meta = core.newWorkspaceMeta(id, dir, args && args.label);
      await saveMeta(meta);
      return ok(`工作区已创建\nworkspaceId: ${id}\n目录: ${dir}\n过期: ${new Date(meta.expiresAt).toISOString()}（24h，销毁即删目录）`);
    },
  },
  {
    name: 'execsandbox_write',
    description: '在隔离工作区内写文件（UTF-8）。路径相对工作区根，越界（../ / 绝对路径 / 盘符）一律拒绝。适用「把脚本写进沙箱再执行」。零确认。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '工作区 id（execsandbox_create 返回）' },
        path: { type: 'string', description: '相对工作区根的文件路径（如 src/main.js）' },
        content: { type: 'string', description: '文件内容（UTF-8 文本）' },
      },
      required: ['workspaceId', 'path', 'content'],
    },
    async call(args) {
      const meta = await loadMeta(args.workspaceId);
      if (!meta) return err(`工作区不存在或已过期：${args.workspaceId}（execsandbox_list 可查）`);
      const chk = resolveSafeWritePath(ROOT, meta.workspaceId, args.path);
      if (!chk.ok) return err(chk.error);
      await fs.promises.mkdir(path.dirname(chk.target), { recursive: true });
      await fs.promises.writeFile(chk.target, String(args.content), 'utf8'); // 公约：Node fs + UTF-8 无 BOM
      await saveMeta(core.touchMeta(meta));
      return ok(`已写入 ${args.path}（${Buffer.byteLength(String(args.content))} 字节）`);
    },
  },
  {
    name: 'execsandbox_exec',
    description: '在隔离工作区 cwd 执行命令（Windows cmd；超时默认 120s 上限，超时树杀；输出截尾 8KB）。危险闸：需 confirm:true。退出码非 0 时 isError 提示，输出仍完整返回供分析。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '工作区 id' },
        command: { type: 'string', description: '要执行的命令行（cmd 语法）' },
        timeoutSec: { type: 'integer', description: '超时秒数（1-120，缺省 120）' },
        confirm: { type: 'boolean', description: '必须显式 true 才执行' },
      },
      required: ['workspaceId', 'command'],
    },
    async call(args) {
      if (!core.requireConfirm(args)) {
        return err('exec 属命令执行操作，需 confirm:true 显式确认（防误触发）');
      }
      const meta = await loadMeta(args.workspaceId);
      if (!meta) return err(`工作区不存在或已过期：${args.workspaceId}`);
      const timeoutMs = core.clampTimeoutSec(args.timeoutSec);
      const startedAt = Date.now();
      const result = await new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const shellExe = isWin ? 'cmd.exe' : '/bin/sh';
        const cmdArgs = isWin ? ['/d', '/s', '/c', String(args.command)] : ['-c', String(args.command)];
        const child = spawn(shellExe, cmdArgs, { cwd: meta.dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let errText = '';
        let timedOut = false;
        let settled = false;
        const timer = setTimeout(() => {
          timedOut = true;
          settled = true;
          clearTimeout(timer);
          // 先 resolve（超时即结果已定），清理异步——不等 close：
          // 实测先 child.kill() 杀掉 cmd 后 taskkill /PID 找不到已死进程，
          // 孙进程（ping 等）存活持 stdio 管道，close 事件永不触发（30s 级悬挂）。
          if (isWin && child.pid) {
            try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch (_) { /* best-effort */ }
          }
          try { child.kill(); } catch (_) { /* ignore */ }
          resolve({ code: -1, timedOut: true, out, errText, durationMs: Date.now() - startedAt });
        }, timeoutMs);
        const finish = (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ code, timedOut: false, out, errText, durationMs: Date.now() - startedAt });
        };
        child.stdout.on('data', (c) => { if (out.length < core.OUTPUT_TAIL * 2) out += String(c); });
        child.stderr.on('data', (c) => { if (errText.length < core.OUTPUT_TAIL) errText += String(c); });
        child.on('error', (e) => { errText += `\n[spawn] ${e.message}`; finish(-1); });
        child.on('close', (code) => finish(code == null ? -1 : code));
      });
      await saveMeta(core.touchMeta(meta));
      const outTail = core.tailBytes(result.out, core.OUTPUT_TAIL);
      const errTail = result.errText ? `\n[stderr]\n${core.tailBytes(result.errText, core.OUTPUT_TAIL)}` : '';
      if (result.timedOut) {
        return err(`超时（>${timeoutMs}ms）已树杀。部分输出：\n${outTail}${errTail}`);
      }
      const head = `退出码 ${result.code} · ${result.durationMs}ms`;
      if (result.code !== 0) return err(`${head}\n${outTail}${errTail}`);
      return ok(`${head}\n${outTail}${errTail}`);
    },
  },
  {
    name: 'execsandbox_list',
    description: '列活跃工作区（id/标签/创建时间/过期时间/是否仍存在目录）。顺带惰性清理已过期项。零确认。',
    inputSchema: { type: 'object', properties: {} },
    async call() {
      const swept = await sweepExpired();
      const keys = await kv.kvKeys().catch(() => []);
      const metas = [];
      for (const k of keys) {
        if (!k.startsWith(core.KV_PREFIX)) continue;
        // eslint-disable-next-line no-await-in-loop
        const meta = core.normalizeWorkspace(await kv.kvGet(k).catch(() => null));
        if (meta) {
          let exists = false;
          try { exists = fs.existsSync(meta.dir); } catch (_) { /* ignore */ }
          metas.push({ ...meta, dirExists: exists });
        }
      }
      metas.sort((a, b) => b.createdAt - a.createdAt);
      if (!metas.length) {
        return ok(`暂无活跃工作区${swept.length ? `（本轮清理过期 ${swept.length} 个）` : ''}。execsandbox_create 可新建。`);
      }
      const lines = metas.map((m) =>
        `- ${m.workspaceId}${m.label ? `（${m.label}）` : ''} | 创建 ${new Date(m.createdAt).toISOString().slice(0, 16)}Z | 过期 ${new Date(m.expiresAt).toISOString().slice(0, 16)}Z | 目录${m.dirExists ? '存在' : '已消失'}${m.dirExists ? '' : '（可 destroy 清元数据）'}`,
      );
      return ok(`活跃工作区 ${metas.length} 个${swept.length ? `（本轮清理过期 ${swept.length} 个）` : ''}：\n${lines.join('\n')}`);
    },
  },
  {
    name: 'execsandbox_destroy',
    description: '销毁工作区：递归删除目录 + 清元数据（不可恢复）。危险闸：需 confirm:true。根边界校验：只允许删沙箱根下的目录。',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: '工作区 id' },
        confirm: { type: 'boolean', description: '必须显式 true 才销毁' },
      },
      required: ['workspaceId'],
    },
    async call(args) {
      if (!core.requireConfirm(args)) {
        return err('destroy 属不可恢复删除操作，需 confirm:true 显式确认');
      }
      const meta = await loadMeta(args.workspaceId);
      if (!meta) return err(`工作区不存在：${args.workspaceId}（可能已过期被清理）`);
      const removed = await destroyDir(meta);
      await kv.kvDel(core.wsKey(meta.workspaceId)).catch(() => {});
      // removed=false 有两种可能：目录本不存在，或 Windows 被杀进程句柄秒级
      // 释放延迟导致 rm 窗口内 EPERM——tmpdir 下残目录无数据风险，如实告知。
      const note = removed
        ? '目录已删除'
        : `目录暂未删净（${fs.existsSync(meta.dir) ? '被系统句柄占用，将随 TTL/系统回收' : '本不存在'}）；元数据已清`;
      return ok(`工作区 ${meta.workspaceId} 已销毁（${note}）`);
    },
  },
];

// ── stdio JSON-RPC 接线 ────────────────────────────────────────────────────

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
log('info', `MCP server ${SERVER_NAME} v${SERVER_VERSION} ready (root=${ROOT}, appConfigDir=${APP_CONFIG_DIR || '(none)'})`);
