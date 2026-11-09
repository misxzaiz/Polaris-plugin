/**
 * terminal-desk 纯逻辑核（零依赖 CJS；面板 esbuild 打包消费 + node 原生测试直测，
 * 与 MCP server 共享语义——同 exec-sandbox shared/core 先例）
 *
 * 会话表操作、脚本运行时状态、危险命令确认、自定义命令持久化 schema。
 * 语义对齐内置终端（主仓 src/stores/terminalStore.ts），拆除阶段后本模块是唯一权威。
 */

'use strict';

const CUSTOM_COMMANDS_KEY = 'customCommands';

// ---------------------------------------------------------------------------
// 会话表
// ---------------------------------------------------------------------------

function upsertSession(sessions, meta) {
  const idx = sessions.findIndex((s) => s.id === meta.id);
  if (idx === -1) return [...sessions, meta];
  const next = [...sessions];
  next[idx] = { ...next[idx], ...meta };
  return next;
}

function markExited(sessions, sessionId, exitCode) {
  return sessions.map((s) => (s.id === sessionId ? { ...s, exitCode } : s));
}

function removeSession(sessions, sessionId) {
  return sessions.filter((s) => s.id !== sessionId);
}

/** 自动会话名：Terminal N（与内置一致，N = 现有数量 + 1） */
function nextSessionName(sessions) {
  return `Terminal ${sessions.length + 1}`;
}

// ---------------------------------------------------------------------------
// 危险命令确认
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS = [
  'rm -rf',
  'del /s',
  'rmdir /s',
  'git clean -fd',
  'git clean -fdx',
  'format ',
];

function isDangerousCommand(command) {
  const normalized = String(command).toLowerCase();
  return DANGEROUS_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/** 脚本是否需要确认（返回确认文案；空串 = 直接放行） */
function confirmMessageFor(command) {
  return isDangerousCommand(command) ? `命令可能具有破坏性，确认执行：${command}?` : '';
}

// ---------------------------------------------------------------------------
// 自定义命令
// ---------------------------------------------------------------------------

function isCustomScript(script) {
  return !!script && String(script.id).startsWith('user:');
}

function makeCustomCommand(name, command, cwd) {
  const trimmed = String(command || '').trim();
  return {
    id: `user:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || '').trim() || trimmed.slice(0, 40),
    command: trimmed,
    cwd: cwd || undefined,
    createdAt: Date.now(),
  };
}

/**
 * 解析插件配置里的自定义命令清单：脏数据防御（非对象/缺字段丢弃；
 * createdAt 非数值归零——跨端 config.json 手编容错）
 */
function parseCustomCommands(config) {
  if (!config || typeof config !== 'object') return [];
  const raw = config[CUSTOM_COMMANDS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item) =>
        !!item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.command === 'string' &&
        typeof item.name === 'string',
    )
    .map((item) => ({
      ...item,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0,
    }));
}

// ---------------------------------------------------------------------------
// 脚本运行时状态
// ---------------------------------------------------------------------------

function setRuntime(runtimes, scriptId, patch) {
  const prev = runtimes[scriptId] || { status: 'running', lastRunAt: 0 };
  return {
    ...runtimes,
    [scriptId]: { ...prev, ...patch, lastRunAt: patch.lastRunAt ?? Date.now() },
  };
}

module.exports = {
  CUSTOM_COMMANDS_KEY,
  DANGEROUS_PATTERNS,
  upsertSession,
  markExited,
  removeSession,
  nextSessionName,
  isDangerousCommand,
  confirmMessageFor,
  isCustomScript,
  makeCustomCommand,
  parseCustomCommands,
  setRuntime,
};
