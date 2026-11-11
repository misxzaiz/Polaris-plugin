/**
 * terminal-desk 纯逻辑核（零依赖 CJS；面板 esbuild 打包消费 + node 原生测试直测，
 * 与 MCP server 共享语义——同 exec-sandbox shared/core 先例）
 *
 * 会话表操作、脚本运行时状态、危险命令确认、插件配置 schema、
 * 旧内置终端脚本导入映射、自动运行触发裁决。所有函数保持纯函数语义，
 * 便于离线 node --test 覆盖；禁止在此文件触碰 window / DOM / IPC。
 */

'use strict';

const CUSTOM_COMMANDS_KEY = 'customCommands';
const HIDDEN_SCRIPTS_KEY = 'hiddenScriptIds';
const AUTO_RUN_KEY = 'autoRunRules';
const SESSION_NAMES_KEY = 'sessionNames';
const UI_STATE_KEY = 'uiState';
const LEGACY_MIGRATION_KEY = 'legacyMigration';

const AUTO_RUN_TRIGGERS = ['app_start', 'workspace_open', 'terminal_open'];
const SCRIPT_TABS = ['project', 'custom'];

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

/**
 * 宿主会话恢复合并：远端 cap.terminal list 为准，本地已有条目保留退出态等 UI 字段。
 * - 过滤 closed / 缺 id / 非对象
 * - 远端新增 → exitCode null 追加
 * - 本地孤立（宿主已关闭）→ 丢弃，避免残留「幽灵标签」
 * 返回 recoveredIds 供 UI 提示「已恢复 N 个宿主会话」。
 */
function mergeRecoveredSessions(local, remote) {
  const locals = Array.isArray(local) ? local : [];
  const remotes = (Array.isArray(remote) ? remote : []).filter(
    (s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id && !s.closed,
  );
  const remoteById = new Map(remotes.map((s) => [s.id, s]));
  const localIds = new Set(locals.map((s) => s.id));
  const kept = locals
    .filter((s) => remoteById.has(s.id))
    .map((s) => ({ ...s, name: remoteById.get(s.id).name || s.name }));
  const added = remotes
    .filter((s) => !localIds.has(s.id))
    .map((s) => ({
      id: s.id,
      name: typeof s.name === 'string' ? s.name : 'Terminal',
      exitCode: null,
      scriptId: typeof s.scriptId === 'string' ? s.scriptId : undefined,
      cwd: typeof s.cwd === 'string' ? s.cwd : null,
    }));
  return { sessions: [...kept, ...added], recoveredIds: added.map((s) => s.id) };
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
// 自定义命令 / 插件配置
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
 * createdAt 非数值归零——跨端 config.json 手编容错）。
 * 扩展字段与内置 TerminalScript 对齐（env/autoRun/autoRunTrigger/confirmBeforeAutoRun/
 * enabled/source/tags），缺省一律补安全默认值，保证渲染层无需到处判空。
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
      enabled: item.enabled !== false,
      autoRun: item.autoRun === true,
      autoRunTrigger: AUTO_RUN_TRIGGERS.includes(item.autoRunTrigger)
        ? item.autoRunTrigger
        : 'workspace_open',
      confirmBeforeAutoRun: item.confirmBeforeAutoRun === true,
      env:
        item.env && typeof item.env === 'object' && !Array.isArray(item.env)
          ? item.env
          : undefined,
      tags: Array.isArray(item.tags) ? item.tags.filter((t) => typeof t === 'string') : [],
    }));
}

function parseStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((x) => typeof x === 'string' && x);
}

function parseHiddenScriptIds(config) {
  if (!config || typeof config !== 'object') return [];
  return parseStringArray(config[HIDDEN_SCRIPTS_KEY]);
}

/**
 * 自动运行规则：{ [scriptId]: { enabled, trigger, confirm } }
 * 用于「项目脚本」（discover 出来、无自定义存储）；自定义命令的 autoRun 字段
 * 存在命令对象自身，由 autoRunCandidates 合并两处。
 */
function parseAutoRunRules(config) {
  if (!config || typeof config !== 'object') return {};
  const raw = config[AUTO_RUN_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, rule] of Object.entries(raw)) {
    if (!rule || typeof rule !== 'object') continue;
    out[id] = {
      enabled: rule.enabled === true,
      trigger: AUTO_RUN_TRIGGERS.includes(rule.trigger) ? rule.trigger : 'workspace_open',
      confirm: rule.confirm === true,
    };
  }
  return out;
}

function parseSessionNames(config) {
  if (!config || typeof config !== 'object') return {};
  const raw = config[SESSION_NAMES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, name] of Object.entries(raw)) {
    if (typeof name === 'string' && name.trim()) out[id] = name.trim().slice(0, 120);
  }
  return out;
}

/** UI 偏好（脚本中心折叠/当前页/专注模式）——持久化，避免重挂丢状态 */
function parseUiState(config) {
  const raw = config && typeof config === 'object' ? config[UI_STATE_KEY] : null;
  const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    scriptCenterCollapsed: state.scriptCenterCollapsed !== false,
    scriptTab: SCRIPT_TABS.includes(state.scriptTab) ? state.scriptTab : 'project',
    focusMode: state.focusMode === true,
  };
}

/** 单一配置解析入口：面板各组件只消费结构化结果，禁止各自读裸 config */
function parsePluginConfig(config) {
  return {
    customCommands: parseCustomCommands(config),
    hiddenScriptIds: parseHiddenScriptIds(config),
    autoRunRules: parseAutoRunRules(config),
    sessionNames: parseSessionNames(config),
    uiState: parseUiState(config),
    legacyMigration:
      config && typeof config === 'object' && typeof config[LEGACY_MIGRATION_KEY] === 'string'
        ? config[LEGACY_MIGRATION_KEY]
        : '',
  };
}

// ---------------------------------------------------------------------------
// 旧内置终端脚本导入（纯插件侧，不依赖宿主新增 cap）
// ---------------------------------------------------------------------------

/** 稳定短哈希（FNV-1a 变体）：给 legacy 命令生成幂等 id，避免重复导入 */
function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function normalizePath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * 从主仓 config.json 的 terminalScripts 结构导入：
 *   { [workspacePath]: { scripts: TerminalScript[], hiddenDiscoveredScriptIds?: string[] } }
 * - 只导入 source==='user'（或 id 以 user: 开头）的自定义命令；项目脚本由
 *   cap.terminal discover_scripts 重新发现，不落库，避免双份与陈旧。
 * - hiddenDiscoveredScriptIds 原样带出，供插件隐藏同名项目脚本。
 * - legacy id 由「工作区 + 原 id」稳定哈希生成，重复导入可幂等去重。
 * - workspacePath 为空时导入全部工作区；否则只导匹配工作区（Windows 路径归一）。
 * 入参可以是完整 config 对象，也可以直接是 terminalScripts 映射。
 */
function parseLegacyTerminalScripts(raw, workspacePath) {
  if (!raw || typeof raw !== 'object') return { commands: [], hiddenScriptIds: [] };
  const source = raw.terminalScripts && typeof raw.terminalScripts === 'object' ? raw.terminalScripts : raw;
  const wanted = normalizePath(workspacePath);
  const commands = [];
  const hidden = new Set();

  for (const [wsPath, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    if (wanted && normalizePath(wsPath) !== wanted) continue;
    for (const id of parseStringArray(entry.hiddenDiscoveredScriptIds)) hidden.add(id);
    const scripts = Array.isArray(entry.scripts) ? entry.scripts : [];
    for (const s of scripts) {
      if (!s || typeof s !== 'object' || typeof s.command !== 'string' || !s.command.trim()) continue;
      const isUser =
        s.source === 'user' || (typeof s.id === 'string' && s.id.startsWith('user:'));
      if (!isUser) continue;
      const originalId = typeof s.id === 'string' && s.id ? s.id : s.command;
      commands.push({
        id: `legacy:${stableHash(`${normalizePath(wsPath)}|${originalId}`)}`,
        name: String(s.name || '').trim() || s.command.trim().slice(0, 40),
        command: s.command.trim(),
        cwd: typeof s.cwd === 'string' && s.cwd ? s.cwd : undefined,
        env: s.env && typeof s.env === 'object' && !Array.isArray(s.env) ? s.env : undefined,
        tags: Array.isArray(s.tags) ? s.tags.filter((t) => typeof t === 'string') : [],
        source: 'legacy',
        enabled: s.enabled !== false,
        autoRun: s.autoRun === true,
        autoRunTrigger: AUTO_RUN_TRIGGERS.includes(s.autoRunTrigger)
          ? s.autoRunTrigger
          : 'workspace_open',
        confirmBeforeAutoRun: s.confirmBeforeAutoRun === true,
        createdAt: typeof s.createdAt === 'number' ? s.createdAt : 0,
      });
    }
  }
  return { commands, hiddenScriptIds: [...hidden] };
}

/** 合并导入结果到既有清单（按 id 幂等）；返回新数组与新增数量 */
function mergeImportedCommands(existing, imported) {
  const list = Array.isArray(existing) ? existing : [];
  const seen = new Set(list.map((c) => c.id));
  const added = (Array.isArray(imported) ? imported : []).filter((c) => {
    if (!c || typeof c.id !== 'string' || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return { commands: [...list, ...added], addedCount: added.length };
}

function mergeHiddenIds(existing, imported) {
  const set = new Set(parseStringArray(existing));
  for (const id of parseStringArray(imported)) set.add(id);
  return [...set];
}

// ---------------------------------------------------------------------------
// 脚本运行时 / 最近脚本 / 自动运行
// ---------------------------------------------------------------------------

function setRuntime(runtimes, scriptId, patch) {
  const prev = runtimes[scriptId] || { status: 'running', lastRunAt: 0 };
  return {
    ...runtimes,
    [scriptId]: { ...prev, ...patch, lastRunAt: patch.lastRunAt ?? Date.now() },
  };
}

/** 快速运行条选中的脚本：运行中优先，其次最近运行，最后第一个启用项（对齐内置） */
function selectRecentScript(scripts, runtimes) {
  const list = Array.isArray(scripts) ? scripts : [];
  const rt = runtimes && typeof runtimes === 'object' ? runtimes : {};
  const running = list.find((s) => rt[s.id]?.status === 'running');
  if (running) return running;
  const sorted = [...list].sort((a, b) => (rt[b.id]?.lastRunAt ?? 0) - (rt[a.id]?.lastRunAt ?? 0));
  return sorted[0] ?? null;
}

/**
 * 自动运行裁决：合并「自定义命令自带 autoRun」与「项目脚本规则表」。
 * seenKeys 由调用方持久化（本次挂载 + 工作区 + 触发点），防止重复触发。
 * 返回 [{ id, trigger, needsConfirm }]，不含副作用。
 */
function autoRunCandidates(commands, rules, trigger, workspacePath, seenKeys) {
  if (!AUTO_RUN_TRIGGERS.includes(trigger)) return [];
  const seen = seenKeys instanceof Set ? seenKeys : new Set(Array.isArray(seenKeys) ? seenKeys : []);
  const candidates = [];
  const visit = (id, enabled, ruleTrigger, confirm) => {
    if (!enabled || !id || ruleTrigger !== trigger) return;
    const key = `${trigger}|${normalizePath(workspacePath)}|${id}`;
    if (seen.has(key)) return;
    candidates.push({ id, trigger, key, needsConfirm: confirm === true });
  };
  for (const c of Array.isArray(commands) ? commands : []) {
    if (c.enabled === false) continue;
    visit(c.id, c.autoRun, c.autoRunTrigger, c.confirmBeforeAutoRun);
  }
  const ruleMap = rules && typeof rules === 'object' ? rules : {};
  for (const [id, rule] of Object.entries(ruleMap)) {
    visit(id, rule?.enabled, rule?.trigger, rule?.confirm);
  }
  return candidates;
}

/** 主题 id → 是否浅色（内置仅判 'light'；此处兼容自定义浅色主题命名） */
function isLightThemeId(themeId) {
  return /(^|[-_])light([-_]|$)/i.test(String(themeId || ''));
}

module.exports = {
  CUSTOM_COMMANDS_KEY,
  HIDDEN_SCRIPTS_KEY,
  AUTO_RUN_KEY,
  SESSION_NAMES_KEY,
  UI_STATE_KEY,
  LEGACY_MIGRATION_KEY,
  AUTO_RUN_TRIGGERS,
  DANGEROUS_PATTERNS,
  upsertSession,
  markExited,
  removeSession,
  nextSessionName,
  mergeRecoveredSessions,
  isDangerousCommand,
  confirmMessageFor,
  isCustomScript,
  makeCustomCommand,
  parseCustomCommands,
  parseStringArray,
  parseHiddenScriptIds,
  parseAutoRunRules,
  parseSessionNames,
  parseUiState,
  parsePluginConfig,
  stableHash,
  normalizePath,
  parseLegacyTerminalScripts,
  mergeImportedCommands,
  mergeHiddenIds,
  setRuntime,
  selectRecentScript,
  autoRunCandidates,
  isLightThemeId,
};
