'use strict';
/**
 * store.js —— cap.kv 键空间数据层（键空间契约见 README「存储契约」节）
 *
 * 读写分离（每键空间一个所有者，防双写者竞争）：
 *   aisched.task.<id>    任务定义（MCP server / 面板写；服务只读）
 *   aisched.state.<id>   运行态 lastRunAt/lastRunStatus/runCount/retryCount
 *                        （服务单写；nextRunAt 由「触发变更的一方」随写随算——
 *                        CRUD 时 MCP/面板算，触发/回收时服务算，等价主仓
 *                        update_task/update_task_status 的 next_run_at 内嵌语义）
 *   aisched.hist.<n>     执行历史块（服务单写，25 条/块）+ aisched.hist.idx 索引
 *   aisched.cmd.run.<n>  手动执行命令信箱（面板写，服务先删后做消费）
 *   aisched.result.<n>   命令回执（服务写，面板轮询）
 *   aisched.settings     服务设置（面板写，服务 30s 热更）
 *   aisched.meta         服务心跳（服务单写）
 *   aisched.lease        服务租约 TTL（多实例防双跑）
 */
const {
  calculateNextRun, recalcNextOnUpdate, recalcNextOnStatus, isDue,
} = require('../shared/engine');

const PREFIX_TASK = 'aisched.task.';
const PREFIX_STATE = 'aisched.state.';
const PREFIX_HIST = 'aisched.hist.';
const HIST_IDX = 'aisched.hist.idx';
const PREFIX_CMD = 'aisched.cmd.run.';
const PREFIX_PROTO_CMD = 'aisched.cmd.proto.';
const PREFIX_RESULT = 'aisched.result.';
const KEY_SETTINGS = 'aisched.settings';
const KEY_META = 'aisched.meta';
const KEY_LEASE = 'aisched.lease';
const HIST_CHUNK = 25;

const HIST_RETENTION_BLOCKS = 40; // 40 块 × 25 条 = 1000 条历史上限

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 默认任务定义（等价主仓 CreateTaskParams::default 展开，camelCase） */
function normalizeTask(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(t.id || genId('task')),
    name: String(t.name || '').trim(),
    enabled: t.enabled !== false,
    triggerType: ['once', 'cron', 'interval', 'after_completion'].includes(t.triggerType) ? t.triggerType : 'once',
    triggerValue: String(t.triggerValue || '').trim(),
    engineId: String(t.engineId || '').trim(),
    prompt: String(t.prompt || ''),
    workDir: t.workDir || null,
    description: t.description || null,
    workspacePath: t.workspacePath || null,
    workspaceName: t.workspaceName || null,
    mode: t.mode === 'protocol' ? 'protocol' : 'simple',
    category: t.category || 'other',
    mission: t.mission || null,
    taskPath: t.taskPath || null,
    templateId: t.templateId || null,
    templateParams: t.templateParams || null,
    maxRuns: t.maxRuns === undefined || t.maxRuns === null ? null : Number(t.maxRuns),
    maxRetries: t.maxRetries === undefined || t.maxRetries === null ? null : Number(t.maxRetries),
    retryInterval: t.retryInterval || null,
    timeoutMinutes: t.timeoutMinutes === undefined || t.timeoutMinutes === null ? null : Number(t.timeoutMinutes),
    group: t.group || null,
    notifyOnComplete: t.notifyOnComplete !== false,
    executorType: String(t.executorType || ''),
    executorParams: t.executorParams || null,
    createdAt: Number(t.createdAt) || Math.floor(Date.now() / 1000),
    updatedAt: Number(t.updatedAt) || Math.floor(Date.now() / 1000),
    unsupportedExecutor: !!t.unsupportedExecutor,
  };
}

/** 合并视图：任务定义 + 运行态 → 主仓 ScheduledTask 形状（AI/面板消费） */
function mergeView(task, state) {
  const s = state || {};
  return {
    ...task,
    lastRunAt: s.lastRunAt !== undefined ? s.lastRunAt : null,
    lastRunStatus: s.lastRunStatus !== undefined ? s.lastRunStatus : null,
    nextRunAt: s.nextRunAt !== undefined ? s.nextRunAt : null,
    runCount: s.runCount || 0,
    retryCount: s.retryCount || 0,
    lastError: s.lastError || null,
    lastSessionId: s.lastSessionId || null,
  };
}

/**
 * @param kv kvclient 实例（kvGet/kvSet/kvDel/kvKeys）
 */
function createStore(kv) {
  // ── 任务定义 ────────────────────────────────────────────────
  async function getTask(id) {
    const raw = await kv.kvGet(PREFIX_TASK + id);
    return raw ? normalizeTask(raw) : null;
  }

  async function putTask(task) {
    await kv.kvSet(PREFIX_TASK + task.id, task);
    return task;
  }

  async function deleteTask(id) {
    const t = await getTask(id);
    if (!t) return null;
    await kv.kvDel(PREFIX_TASK + id);
    await kv.kvDel(PREFIX_STATE + id).catch(() => {});
    return t;
  }

  async function listTasks() {
    const keys = await kv.kvKeys();
    const ids = keys
      .filter((k) => k.startsWith(PREFIX_TASK))
      .map((k) => k.slice(PREFIX_TASK.length));
    const tasks = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const t = await getTask(id);
      if (t) tasks.push(t);
    }
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    return tasks;
  }

  // ── 运行态 ──────────────────────────────────────────────────
  async function getState(id) {
    return kv.kvGet(PREFIX_STATE + id);
  }

  async function setState(id, state) {
    await kv.kvSet(PREFIX_STATE + id, state);
    return state;
  }

  /** 创建任务：算初始 nextRunAt（等价主仓 create_task） */
  async function createTask(params) {
    const now = Math.floor(Date.now() / 1000);
    const task = normalizeTask({ ...params, id: params && params.id, createdAt: now, updatedAt: now });
    await putTask(task);
    await setState(task.id, {
      lastRunAt: null, lastRunStatus: null, runCount: 0, retryCount: 0,
      nextRunAt: calculateNextRun(task.triggerType, task.triggerValue, now),
    });
    return mergeView(task, await getState(task.id));
  }

  /** 更新任务（等价主仓 update_task 的重算规则） */
  async function updateTask(id, updates) {
    const task = await getTask(id);
    if (!task) throw new Error(`任务不存在: ${id}`);
    const now = Math.floor(Date.now() / 1000);
    const merged = normalizeTask({ ...task, ...updates, id: task.id, createdAt: task.createdAt, updatedAt: now });
    await putTask(merged);
    const state = (await getState(id)) || { lastRunAt: null, lastRunStatus: null, runCount: 0, retryCount: 0 };
    const explicitNext = updates && Object.prototype.hasOwnProperty.call(updates, 'nextRunAt') ? updates.nextRunAt : undefined;
    state.nextRunAt = recalcNextOnUpdate(merged, now, explicitNext);
    await setState(id, state);
    return mergeView(merged, state);
  }

  /** 触发置 Running（等价主仓 daemon update_next_run_time） */
  async function markRunning(id) {
    const task = await getTask(id);
    if (!task) throw new Error(`任务不存在: ${id}`);
    const now = Math.floor(Date.now() / 1000);
    const state = (await getState(id)) || {};
    state.lastRunAt = now;
    state.lastRunStatus = 'running';
    state.runCount = (state.runCount || 0) + 1;
    // AfterCompletion → null 锁防重复；其余 now+interval（金标 update_next_run_time）
    state.nextRunAt = task.triggerType === 'after_completion' ? null : calculateNextRun(task.triggerType, task.triggerValue, now);
    await setState(id, state);
    return state;
  }

  /** 终态回收（等价主仓 update_task_status / 前端 updateRunStatus 回写命令） */
  async function markStatus(id, status, extra) {
    const task = await getTask(id);
    if (!task) throw new Error(`任务不存在: ${id}`);
    const now = Math.floor(Date.now() / 1000);
    const state = (await getState(id)) || {};
    state.lastRunAt = extra && extra.runAt ? extra.runAt : now;
    state.lastRunStatus = status;
    if (extra && extra.error) state.lastError = String(extra.error).slice(0, 500); else if (status === 'success') state.lastError = null;
    if (extra && extra.sessionId) state.lastSessionId = extra.sessionId;
    state.nextRunAt = recalcNextOnStatus(task, now, status);
    // 重试：失败且有 maxRetries → 立即重排（等价主仓 retry 语义：failed 非 Running 解锁后由 nextRunAt 驱动）
    if (status === 'failed' && task.maxRetries && task.retryInterval
      && (state.retryCount || 0) < task.maxRetries) {
      const secs = calculateNextRun('interval', task.retryInterval, now);
      if (secs !== null) { state.nextRunAt = secs; state.retryCount = (state.retryCount || 0) + 1; }
    } else if (status === 'success') {
      state.retryCount = 0;
    }
    await setState(id, state);
    return state;
  }

  /** Running 卡死自愈（金标 daemon：超时重置 Failed 允许重触发） */
  async function healStale(task, now) {
    await appendHist({
      id: genId('hist'), taskId: task.id, taskName: task.name, trigger: 'self-heal',
      status: 'failed', summary: `Running 卡死超过 ${task.timeoutMinutes || 30} 分钟，自愈重置为 Failed`,
      startedAt: now, durationMs: 0,
    });
    return markStatus(task.id, 'failed', { runAt: task.lastRunAt, error: 'stale running (self-healed)' });
  }

  /** 合并视图列表（list_tasks 契约） */
  async function listTaskViews() {
    const tasks = await listTasks();
    const out = [];
    for (const t of tasks) {
      // eslint-disable-next-line no-await-in-loop
      out.push(mergeView(t, await getState(t.id)));
    }
    return out;
  }

  // ── 历史块（服务单写）────────────────────────────────────────
  async function appendHist(entry) {
    const idx = (await kv.kvGet(HIST_IDX)) || { count: 0 };
    const n = Math.floor(idx.count / HIST_CHUNK);
    const key = PREFIX_HIST + n;
    const chunk = (await kv.kvGet(key)) || [];
    chunk.unshift({ ...entry, seq: idx.count });
    if (chunk.length > HIST_CHUNK) chunk.length = HIST_CHUNK;
    await kv.kvSet(key, chunk);
    idx.count += 1;
    // 淘汰最老块（保留 HIST_RETENTION_BLOCKS 块）
    const oldest = Math.floor((idx.count - 1) / HIST_CHUNK) - HIST_RETENTION_BLOCKS + 1;
    if (oldest >= 0) await kv.kvDel(PREFIX_HIST + oldest).catch(() => {});
    await kv.kvSet(HIST_IDX, idx);
    return entry;
  }

  async function listHist(limit) {
    const idx = (await kv.kvGet(HIST_IDX)) || { count: 0 };
    const max = Math.min(limit || 100, idx.count);
    const out = [];
    let n = Math.floor((idx.count - 1) / HIST_CHUNK);
    while (out.length < max && n >= 0) {
      // eslint-disable-next-line no-await-in-loop
      const chunk = (await kv.kvGet(PREFIX_HIST + n)) || [];
      for (const e of chunk) {
        if (out.length < max) out.push(e);
      }
      n -= 1;
    }
    return out;
  }

  // ── 命令信箱（先删后做）─────────────────────────────────────
  async function consumeRunCommands() {
    const keys = await kv.kvKeys();
    const cmds = keys.filter((k) => k.startsWith(PREFIX_CMD));
    const out = [];
    for (const key of cmds) {
      // eslint-disable-next-line no-await-in-loop
      const cmd = await kv.kvGet(key);
      await kv.kvDel(key); // 先删：拿到的任务命令不会因服务重启重复执行
      if (cmd && cmd.taskId) out.push(cmd);
    }
    return out;
  }

  /** 协议文档命令信箱（面板 fs 语义统一下沉服务，先删后做） */
  async function consumeProtoCommands() {
    const keys = await kv.kvKeys();
    const cmds = keys.filter((k) => k.startsWith(PREFIX_PROTO_CMD));
    const out = [];
    for (const key of cmds) {
      // eslint-disable-next-line no-await-in-loop
      const cmd = await kv.kvGet(key);
      await kv.kvDel(key);
      if (cmd && cmd.nonce && cmd.op) out.push(cmd);
    }
    return out;
  }

  async function putResult(nonce, result) {
    await kv.kvSet(PREFIX_RESULT + nonce, { ...result, doneAt: Math.floor(Date.now() / 1000) });
  }

  // ── 提示词模板 / 协议模板（面板单写者；服务与 executors 只读）────────────
  async function listTemplates() {
    const keys = await kv.kvKeys();
    const ids = keys.filter((k) => k.startsWith('aisched.tmpl.')).map((k) => k.slice('aisched.tmpl.'.length));
    const out = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const t = await kv.kvGet(`aisched.tmpl.${id}`);
      if (t && typeof t === 'object') out.push(t);
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return out;
  }
  async function getTemplate(id) {
    return kv.kvGet(`aisched.tmpl.${id}`);
  }
  async function putTemplate(tmpl) {
    await kv.kvSet(`aisched.tmpl.${tmpl.id}`, tmpl);
    return tmpl;
  }
  async function deleteTemplate(id) {
    const t = await getTemplate(id);
    await kv.kvDel(`aisched.tmpl.${id}`);
    return t;
  }

  async function listCustomProtocolTemplates() {
    const keys = await kv.kvKeys();
    const ids = keys.filter((k) => k.startsWith('aisched.ptmpl.')).map((k) => k.slice('aisched.ptmpl.'.length));
    const out = [];
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const t = await kv.kvGet(`aisched.ptmpl.${id}`);
      if (t && typeof t === 'object') out.push(t);
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return out;
  }
  async function putProtocolTemplate(tmpl) {
    await kv.kvSet(`aisched.ptmpl.${tmpl.id}`, tmpl);
    return tmpl;
  }
  async function deleteProtocolTemplate(id) {
    await kv.kvDel(`aisched.ptmpl.${id}`);
    return id;
  }

  // ── 设置 / 心跳 / 租约 ──────────────────────────────────────
  async function getSettings() {
    const s = await kv.kvGet(KEY_SETTINGS);
    return normalizeSettings(s);
  }
  async function putSettings(patch) {
    const cur = await getSettings();
    const next = normalizeSettings({ ...cur, ...patch });
    await kv.kvSet(KEY_SETTINGS, next);
    return next;
  }
  async function putMeta(meta) {
    await kv.kvSet(KEY_META, { ...meta, beatAt: Math.floor(Date.now() / 1000) });
  }
  async function tryAcquireLease(holder, ttlSec) {
    const cur = await kv.kvGet(KEY_LEASE);
    const now = Math.floor(Date.now() / 1000);
    if (cur && cur.holder !== holder && cur.expiresAt > now) return false;
    await kv.kvSet(KEY_LEASE, { holder, expiresAt: now + ttlSec });
    return true;
  }

  return {
    genId, normalizeTask, mergeView,
    getTask, putTask, deleteTask, listTasks, listTaskViews, createTask, updateTask,
    markRunning, markStatus, healStale, getState, setState,
    appendHist, listHist,
    consumeRunCommands, consumeProtoCommands, putResult,
    listTemplates, getTemplate, putTemplate, deleteTemplate,
    listCustomProtocolTemplates, putProtocolTemplate, deleteProtocolTemplate,
    getSettings, putSettings, putMeta, tryAcquireLease,
    KEYS: { PREFIX_TASK, PREFIX_STATE, PREFIX_HIST, HIST_IDX, PREFIX_CMD, PREFIX_PROTO_CMD, PREFIX_RESULT, KEY_SETTINGS, KEY_META, KEY_LEASE },
  };
}

function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    // 触发后 AI 会话是否带 MCP 工具（主仓 start_chat options.enableMcpTools 默认 true）
    enableMcpTools: s.enableMcpTools !== false,
    // 服务 tick 间隔（秒），下限 2
    tickSeconds: Math.max(2, Number(s.tickSeconds) || 5),
    migratedAt: s.migratedAt || null,
    migratedCount: s.migratedCount || 0,
  };
}

module.exports = {
  createStore, normalizeTask, mergeView, normalizeSettings, genId, isDue,
  KEYS: {
    PREFIX_TASK, PREFIX_STATE, PREFIX_HIST, HIST_IDX, PREFIX_CMD, PREFIX_PROTO_CMD, PREFIX_RESULT,
    KEY_SETTINGS, KEY_META, KEY_LEASE, HIST_CHUNK,
  },
};
