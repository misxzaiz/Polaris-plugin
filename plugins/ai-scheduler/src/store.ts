// 搬迁自主仓 src/stores/schedulerStore.ts + services/tauri 的 Scheduler 域通道（2026-11 Scheduler 域插件化迁移）
// 面板零网络：一切经宿主 invoke → router_dispatch(cap.kv)。
// 键空间契约 = plugins/ai-scheduler/service/store.js KEYS（权威）：
//   aisched.task.<id> / aisched.state.<id> / aisched.hist.<n> + aisched.hist.idx
//   aisched.cmd.run.<nonce> / aisched.cmd.proto.<nonce> / aisched.result.<nonce>
//   aisched.tmpl.<id> / aisched.ptmpl.<id> / aisched.meta
// 读写分离：任务定义/模板 = 面板写；运行态/历史/心跳 = 服务单写（面板只读）；
// 手动执行与协议文档操作 = 命令信箱（先删后做）→ 轮询回执。
import { useSyncExternalStore } from 'react';
import { getHostInvoke } from './host';
import { calculateNextRun, recalcNextOnUpdate } from '../shared/engine';
import { builtinTemplates } from '../shared/builtin-templates';
import type {
  ScheduledTask, CreateTaskParams, PromptTemplate, CreateTemplateParams,
  ProtocolTemplate, CreateProtocolTemplateParams, TaskCategory,
  HistEntry, ServiceMeta, ProtocolDocuments,
} from './types';

// ── cap 通道 ────────────────────────────────────────────────────────────────

async function capDispatch<T = Record<string, unknown>>(target: string, payload: Record<string, unknown>): Promise<T> {
  const res = await getHostInvoke()<{ ok: boolean; result?: T; error?: string }>('router_dispatch', { req: { target, payload } });
  if (!res.ok) throw new Error(res.error || `${target} 调用失败`);
  return (res.result ?? {}) as T;
}

export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const r = await capDispatch<{ value?: unknown }>('cap.kv', { action: 'get', key }).catch(() => null);
  return ((r && r.value) ?? null) as T | null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await capDispatch('cap.kv', { action: 'set', key, value });
}

export async function kvDel(key: string): Promise<void> {
  await capDispatch('cap.kv', { action: 'delete', key }).catch(() => {});
}

export async function kvKeys(): Promise<string[]> {
  const r = await capDispatch<{ keys?: string[] }>('cap.kv', { action: 'list' }).catch(() => null);
  return r && Array.isArray(r.keys) ? r.keys : [];
}

// ── 键空间（与 service/store.js KEYS 一致，README 存储契约为权威）────────────
export const K = {
  taskPrefix: 'aisched.task.',
  statePrefix: 'aisched.state.',
  histIdx: 'aisched.hist.idx',
  histPrefix: 'aisched.hist.',
  cmdRunPrefix: 'aisched.cmd.run.',
  cmdProtoPrefix: 'aisched.cmd.proto.',
  resultPrefix: 'aisched.result.',
  meta: 'aisched.meta',
  tmplPrefix: 'aisched.tmpl.',
  ptmplPrefix: 'aisched.ptmpl.',
};

const HIST_CHUNK = 25; // 与 service/store.js 一致
const HIST_POLL_LIMIT = 200; // 面板最多拉最近 200 条历史

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── 任务归一化（镜像 service/store.js normalizeTask）─────────────────────────
export function normalizeTask(raw: unknown): ScheduledTask {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: String(t.id || genId('task')),
    name: String(t.name || '').trim(),
    enabled: t.enabled !== false,
    triggerType: (['once', 'cron', 'interval', 'after_completion'].includes(t.triggerType as string) ? t.triggerType : 'once') as ScheduledTask['triggerType'],
    triggerValue: String(t.triggerValue || '').trim(),
    engineId: String(t.engineId || '').trim(),
    prompt: String(t.prompt || ''),
    workDir: (t.workDir ?? null) as string | null,
    description: (t.description ?? null) as string | null,
    workspacePath: (t.workspacePath ?? null) as string | null,
    workspaceName: (t.workspaceName ?? null) as string | null,
    mode: t.mode === 'protocol' ? 'protocol' : 'simple',
    category: (t.category || 'other') as TaskCategory,
    mission: (t.mission ?? null) as string | null,
    taskPath: (t.taskPath ?? null) as string | null,
    templateId: (t.templateId ?? null) as string | null,
    templateParams: (t.templateParams ?? null) as Record<string, string> | null,
    maxRuns: t.maxRuns === undefined || t.maxRuns === null ? null : Number(t.maxRuns),
    maxRetries: t.maxRetries === undefined || t.maxRetries === null ? null : Number(t.maxRetries),
    retryInterval: (t.retryInterval ?? null) as string | null,
    timeoutMinutes: t.timeoutMinutes === undefined || t.timeoutMinutes === null ? null : Number(t.timeoutMinutes),
    group: (t.group ?? null) as string | null,
    notifyOnComplete: t.notifyOnComplete !== false,
    executorType: String(t.executorType || ''),
    executorParams: (t.executorParams ?? null) as Record<string, unknown> | null,
    createdAt: Number(t.createdAt) || Math.floor(Date.now() / 1000),
    updatedAt: Number(t.updatedAt) || Math.floor(Date.now() / 1000),
    unsupportedExecutor: !!t.unsupportedExecutor,
  };
}

/** mergeView：任务定义 + 运行态 → ScheduledTask 形状（镜像 service/store.js mergeView） */
function mergeView(task: ScheduledTask, state: Record<string, unknown> | null): ScheduledTask {
  const s = state || {};
  return {
    ...task,
    lastRunAt: s.lastRunAt !== undefined ? (s.lastRunAt as number | null) : null,
    lastRunStatus: s.lastRunStatus !== undefined ? (s.lastRunStatus as ScheduledTask['lastRunStatus']) : null,
    nextRunAt: s.nextRunAt !== undefined ? (s.nextRunAt as number | null) : null,
    runCount: (s.runCount as number) || 0,
    retryCount: (s.retryCount as number) || 0,
    lastError: (s.lastError as string | null) || null,
    lastSessionId: (s.lastSessionId as string | null) || null,
  };
}

// ── 协议模板归一化（builtin 的 params 用 paramType 字段，面板统一为 type）──────
function normalizeProtocolTemplate(raw: unknown, builtin: boolean): ProtocolTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const cfg = (t.protocolConfig && typeof t.protocolConfig === 'object' ? t.protocolConfig : {}) as Record<string, unknown>;
  const rawParams = Array.isArray(t.params) ? t.params : [];
  const params = rawParams.map((p) => {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    return {
      key: String(o.key || ''),
      label: String(o.label || ''),
      type: ((o.type || o.paramType || 'text') as ProtocolTemplate['params'][number]['type']),
      required: !!o.required,
      defaultValue: o.defaultValue === undefined || o.defaultValue === null ? undefined : String(o.defaultValue),
      placeholder: o.placeholder === undefined || o.placeholder === null ? undefined : String(o.placeholder),
      options: Array.isArray(o.options) ? (o.options as ProtocolTemplate['params'][number]['options']) : undefined,
    };
  });
  return {
    id: String(t.id || ''),
    name: String(t.name || ''),
    description: t.description === undefined || t.description === null ? undefined : String(t.description),
    category: (t.category || 'custom') as TaskCategory,
    builtin,
    protocolConfig: {
      missionTemplate: String(cfg.missionTemplate || ''),
      executionRules: cfg.executionRules === undefined || cfg.executionRules === null ? undefined : String(cfg.executionRules),
      memoryRules: cfg.memoryRules === undefined || cfg.memoryRules === null ? undefined : String(cfg.memoryRules),
      customSections: Array.isArray(cfg.customSections) ? (cfg.customSections as ProtocolTemplate['protocolConfig']['customSections']) : undefined,
    },
    promptTemplate: t.promptTemplate === undefined || t.promptTemplate === null ? undefined : String(t.promptTemplate),
    params,
    defaultTriggerType: t.defaultTriggerType as ProtocolTemplate['defaultTriggerType'],
    defaultTriggerValue: t.defaultTriggerValue === undefined || t.defaultTriggerValue === null ? undefined : String(t.defaultTriggerValue),
    defaultEngineId: t.defaultEngineId === undefined || t.defaultEngineId === null ? undefined : String(t.defaultEngineId),
    defaultMaxRuns: t.defaultMaxRuns === undefined || t.defaultMaxRuns === null ? undefined : Number(t.defaultMaxRuns),
    defaultTimeoutMinutes: t.defaultTimeoutMinutes === undefined || t.defaultTimeoutMinutes === null ? undefined : Number(t.defaultTimeoutMinutes),
    enabled: t.enabled !== false,
    createdAt: Number(t.createdAt) || 0,
    updatedAt: Number(t.updatedAt) || 0,
  };
}

function normalizePromptTemplate(raw: unknown): PromptTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (!t.id) return null;
  return {
    id: String(t.id),
    name: String(t.name || ''),
    description: t.description === undefined || t.description === null ? undefined : String(t.description),
    content: String(t.content || ''),
    enabled: t.enabled !== false,
    createdAt: Number(t.createdAt) || 0,
    updatedAt: Number(t.updatedAt) || 0,
  };
}

// ── 协议文档命令信箱（fs 语义统一下沉服务进程）───────────────────────────────
export type ProtoOp =
  | 'readAll' | 'updateProtocol' | 'updateSupplement' | 'updateMemoryIndex' | 'updateMemoryTasks'
  | 'clearSupplement' | 'backupSupplement' | 'backupDocument' | 'extractUserContent'
  | 'hasSupplementContent' | 'needsBackup' | 'createStructure';

export interface ProtoResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface ProtoCmdPayload {
  workDir?: string;
  taskPath?: string;
  content?: string;
  docName?: string;
  summary?: string;
  taskId?: string;
  mission?: string;
  templateContent?: string;
}

/** 写协议命令信箱 → 轮询回执（服务 tick 缺省 5s，超时给足 15s） */
export async function protoCommand(op: ProtoOp, payload: ProtoCmdPayload, waitMs = 15000): Promise<ProtoResult> {
  const nonce = `proto_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await kvSet(K.cmdProtoPrefix + nonce, { op, nonce, ...payload, at: Date.now() });
  const deadline = Date.now() + waitMs;
  for (;;) {
    const r = await kvGet<ProtoResult & { doneAt?: number }>(K.resultPrefix + nonce);
    if (r && typeof r === 'object' && ('ok' in r || 'error' in r)) {
      kvDel(K.resultPrefix + nonce);
      return { ok: !!r.ok, data: r.data, error: r.error };
    }
    if (Date.now() > deadline) {
      return { ok: false, error: '服务未回执（可能未运行）——请检查调度服务状态' };
    }
    await sleep(800);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// ── 任务 CRUD ───────────────────────────────────────────────────────────────

/** 协议模式选中的模板 → 服务端 createStructure 的 templateContent（generateProtocolDocument 渲染后补 {taskId}/{workspacePath}） */
async function buildTemplateContent(taskId: string, params: CreateTaskParams): Promise<string | undefined> {
  if (!params.templateId) return undefined;
  const all = await listProtocolTemplates();
  const tmpl = all.find((p) => p.id === params.templateId);
  if (!tmpl) return undefined;
  // 面板侧渲染协议文档（types.ts 金标函数），服务端 createTaskStructure 只做 {{taskId}} 等双花括号替换
  const doc = generateDoc(tmpl, params.templateParams || {});
  return doc
    .replace(/\{taskId\}/g, taskId)
    .replace(/\{workspacePath\}/g, params.workDir || '');
}

// 延迟引入（避免 store.ts 与 types.ts 循环依赖的观感；实际无环，仅集中在一处）
import { generateProtocolDocument as generateDoc } from './types';

/** 创建任务（协议模式先经命令信箱 createStructure 落盘任务文档，再写任务键） */
export async function createTask(params: CreateTaskParams): Promise<ScheduledTask> {
  const now = Math.floor(Date.now() / 1000);
  const id = genId('task');
  const task = normalizeTask({ ...params, id, createdAt: now, updatedAt: now });

  if (task.mode === 'protocol' && task.workDir) {
    try {
      const templateContent = await buildTemplateContent(id, params);
      const r = await protoCommand('createStructure', {
        workDir: task.workDir,
        taskId: id,
        mission: task.mission || '',
        templateContent,
      });
      if (r.ok && typeof r.data === 'string') {
        task.taskPath = r.data;
      }
    } catch {
      // 落盘失败不阻塞任务创建；ProtocolDocumentViewer 会显示无文档路径
    }
  }

  await kvSet(K.taskPrefix + id, task);
  await kvSet(K.statePrefix + id, {
    lastRunAt: null, lastRunStatus: null, runCount: 0, retryCount: 0,
    nextRunAt: calculateNextRun(task.triggerType, task.triggerValue, now),
  });
  await refresh();
  return task;
}

/** 更新任务（nextRunAt 重算规则 = store.js recalcNextOnUpdate：after_completion 且 running → null 锁） */
export async function updateTask(task: ScheduledTask): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const merged = normalizeTask({ ...task, updatedAt: now });
  await kvSet(K.taskPrefix + merged.id, merged);
  const state = (await kvGet<Record<string, unknown>>(K.statePrefix + merged.id))
    || { lastRunAt: null, lastRunStatus: null, runCount: 0, retryCount: 0 };
  state.nextRunAt = recalcNextOnUpdate(
    { ...merged, lastRunStatus: (state.lastRunStatus as string | null) ?? null },
    now,
    undefined,
  );
  await kvSet(K.statePrefix + merged.id, state);
  await refresh();
}

export async function deleteTask(id: string): Promise<void> {
  await kvDel(K.taskPrefix + id);
  await kvDel(K.statePrefix + id);
  await refresh();
}

export async function toggleTask(id: string, enabled: boolean): Promise<void> {
  const raw = await kvGet<Record<string, unknown>>(K.taskPrefix + id);
  if (!raw) throw new Error(`任务不存在: ${id}`);
  const task = normalizeTask({ ...raw, enabled });
  await kvSet(K.taskPrefix + id, task);
  // 与 updateTask 同规则重算 nextRunAt（禁用态 isDue 不触发，启用后按新锚点排队）
  const state = (await kvGet<Record<string, unknown>>(K.statePrefix + id))
    || { lastRunAt: null, lastRunStatus: null, runCount: 0, retryCount: 0 };
  state.nextRunAt = recalcNextOnUpdate(
    { ...task, lastRunStatus: (state.lastRunStatus as string | null) ?? null },
    Math.floor(Date.now() / 1000),
    undefined,
  );
  await kvSet(K.statePrefix + id, state);
  await refresh();
}

/** 读任务列表（task + state 合并视图，createdAt 倒序） */
export async function loadTasks(): Promise<ScheduledTask[]> {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(K.taskPrefix)).map((k) => k.slice(K.taskPrefix.length));
  const out: ScheduledTask[] = [];
  for (const id of ids) {
    const raw = await kvGet<Record<string, unknown>>(K.taskPrefix + id);
    if (!raw) continue;
    const state = await kvGet<Record<string, unknown>>(K.statePrefix + id);
    out.push(mergeView(normalizeTask(raw), state));
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

// ── 手动执行（命令信箱；执行入口统一在服务进程，面板不直调 cap.ai.chat）────────
export interface RunResult { ok: boolean; error?: string; timedOut?: boolean }

export async function runTask(id: string): Promise<RunResult> {
  const nonce = `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await kvSet(K.cmdRunPrefix + nonce, { taskId: id, nonce, at: Date.now() });
  // 指定 3s 回执窗口：服务消费命令后立即回执 {ok:true, taskId}
  const deadline = Date.now() + 3000;
  for (;;) {
    const r = await kvGet<RunResult & { doneAt?: number }>(K.resultPrefix + nonce);
    if (r && typeof r === 'object' && ('ok' in r || 'error' in r)) {
      kvDel(K.resultPrefix + nonce);
      return { ok: !!r.ok, error: r.error };
    }
    if (Date.now() > deadline) {
      // 命令已在信箱内，服务下个 tick 会消费；面板如实提示
      return { ok: false, timedOut: true, error: '服务未在 3s 内回执' };
    }
    await sleep(600);
  }
}

// ── 执行历史（hist 块：服务单写，25 条/块，unshift 新→旧）─────────────────────
export async function loadHist(limit = HIST_POLL_LIMIT): Promise<HistEntry[]> {
  const idx = await kvGet<{ count?: number }>(K.histIdx);
  const count = idx && typeof idx.count === 'number' ? idx.count : 0;
  if (count === 0) return [];
  const max = Math.min(limit, count);
  const out: HistEntry[] = [];
  let n = Math.floor((count - 1) / HIST_CHUNK);
  while (out.length < max && n >= 0) {
    const chunk = await kvGet<HistEntry[]>(K.histPrefix + n);
    if (Array.isArray(chunk)) {
      for (const e of chunk) {
        if (out.length < max && e && typeof e === 'object') out.push(e);
      }
    }
    n -= 1;
  }
  return out; // 块内/块间均为新→旧
}

// ── 服务心跳（只读；生命周期归宿主 Supervisor，面板无启停）────────────────────
export async function loadMeta(): Promise<ServiceMeta | null> {
  return kvGet<ServiceMeta>(K.meta);
}

/** 心跳新鲜度：beatAt 60s 内视为运行中 */
export function metaAlive(meta: ServiceMeta | null): 'ok' | 'stale' | 'down' {
  if (!meta || !meta.beatAt) return 'down';
  return Date.now() / 1000 - meta.beatAt < 60 ? 'ok' : 'stale';
}

// ── 提示词模板（aisched.tmpl.<id> CRUD，面板单写者）──────────────────────────
export async function loadTemplates(): Promise<PromptTemplate[]> {
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(K.tmplPrefix)).map((k) => k.slice(K.tmplPrefix.length));
  const out: PromptTemplate[] = [];
  for (const id of ids) {
    const t = normalizePromptTemplate(await kvGet(K.tmplPrefix + id));
    if (t) out.push(t);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export async function createTemplate(params: CreateTemplateParams): Promise<PromptTemplate> {
  const now = Math.floor(Date.now() / 1000);
  const tmpl: PromptTemplate = {
    id: genId('tmpl'),
    name: params.name,
    description: params.description,
    content: params.content,
    enabled: params.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  await kvSet(K.tmplPrefix + tmpl.id, tmpl);
  await refresh();
  return tmpl;
}

export async function updateTemplate(template: PromptTemplate): Promise<PromptTemplate> {
  const next: PromptTemplate = { ...template, updatedAt: Math.floor(Date.now() / 1000) };
  await kvSet(K.tmplPrefix + next.id, next);
  await refresh();
  return next;
}

export async function deleteTemplate(id: string): Promise<void> {
  await kvDel(K.tmplPrefix + id);
  await refresh();
}

// ── 协议模板（builtin 常量 + aisched.ptmpl.<id> 自定义，builtin 在前）─────────
export async function listProtocolTemplates(): Promise<ProtocolTemplate[]> {
  const builtin = builtinTemplates()
    .map((t) => normalizeProtocolTemplate(t, true))
    .filter((t): t is ProtocolTemplate => !!t);
  const keys = await kvKeys();
  const ids = keys.filter((k) => k.startsWith(K.ptmplPrefix)).map((k) => k.slice(K.ptmplPrefix.length));
  const custom: ProtocolTemplate[] = [];
  for (const id of ids) {
    const t = normalizeProtocolTemplate(await kvGet(K.ptmplPrefix + id), false);
    if (t) custom.push(t);
  }
  custom.sort((a, b) => b.createdAt - a.createdAt);
  return [...builtin, ...custom];
}

/** 自定义协议模板落盘形状（paramType 与 type 双写：paramType=服务侧契约，type=面板消费） */
function templateToStore(t: ProtocolTemplate): Record<string, unknown> {
  return {
    ...t,
    params: t.params.map((p) => ({ ...p, paramType: p.type })),
  };
}

export async function createProtocolTemplate(params: CreateProtocolTemplateParams): Promise<ProtocolTemplate> {
  const now = Math.floor(Date.now() / 1000);
  const tmpl = normalizeProtocolTemplate(templateToStore({
    id: genId('ptmpl'),
    name: params.name,
    description: params.description,
    category: params.category,
    builtin: false,
    protocolConfig: params.protocolConfig,
    promptTemplate: params.promptTemplate,
    params: params.params || [],
    defaultTriggerType: params.defaultTriggerType,
    defaultTriggerValue: params.defaultTriggerValue,
    defaultEngineId: params.defaultEngineId,
    defaultMaxRuns: params.defaultMaxRuns,
    defaultTimeoutMinutes: params.defaultTimeoutMinutes,
    enabled: params.enabled !== false,
    createdAt: now,
    updatedAt: now,
  }), false);
  if (!tmpl) throw new Error('协议模板归一化失败');
  await kvSet(K.ptmplPrefix + tmpl.id, templateToStore(tmpl));
  await refresh();
  return tmpl;
}

export async function updateProtocolTemplate(id: string, params: CreateProtocolTemplateParams): Promise<ProtocolTemplate> {
  const keys = await kvKeys();
  if (!keys.includes(K.ptmplPrefix + id)) throw new Error('内置模板不可修改');
  const existing = normalizeProtocolTemplate(await kvGet(K.ptmplPrefix + id), false);
  const merged = normalizeProtocolTemplate(templateToStore({
    ...(existing || { protocolConfig: { missionTemplate: '' }, params: [] }),
    ...params,
    id,
    builtin: false,
    updatedAt: Math.floor(Date.now() / 1000),
  } as unknown as ProtocolTemplate), false);
  if (!merged) throw new Error('协议模板归一化失败');
  await kvSet(K.ptmplPrefix + id, templateToStore(merged));
  await refresh();
  return merged;
}

export async function deleteProtocolTemplate(id: string): Promise<boolean> {
  const keys = await kvKeys();
  if (!keys.includes(K.ptmplPrefix + id)) return false; // builtin 不在 kv，天然不可删
  await kvDel(K.ptmplPrefix + id);
  await refresh();
  return true;
}

// ── 协议文档操作（全部下沉服务进程命令信箱）──────────────────────────────────
export async function readProtocolDocuments(taskPath: string, workDir: string): Promise<ProtocolDocuments> {
  const r = await protoCommand('readAll', { taskPath, workDir });
  if (!r.ok) throw new Error(r.error || '读取协议文档失败');
  return (r.data || { protocol: '', supplement: '', memoryIndex: '', memoryTasks: '' }) as ProtocolDocuments;
}

export async function updateProtocolDoc(taskPath: string, workDir: string, content: string): Promise<void> {
  const r = await protoCommand('updateProtocol', { taskPath, workDir, content });
  if (!r.ok) throw new Error(r.error || '保存失败');
}

export async function updateSupplementDoc(taskPath: string, workDir: string, content: string): Promise<void> {
  const r = await protoCommand('updateSupplement', { taskPath, workDir, content });
  if (!r.ok) throw new Error(r.error || '保存失败');
}

export async function updateMemoryIndexDoc(taskPath: string, workDir: string, content: string): Promise<void> {
  const r = await protoCommand('updateMemoryIndex', { taskPath, workDir, content });
  if (!r.ok) throw new Error(r.error || '保存失败');
}

export async function updateMemoryTasksDoc(taskPath: string, workDir: string, content: string): Promise<void> {
  const r = await protoCommand('updateMemoryTasks', { taskPath, workDir, content });
  if (!r.ok) throw new Error(r.error || '保存失败');
}

export async function clearSupplementDoc(taskPath: string, workDir: string): Promise<void> {
  const r = await protoCommand('clearSupplement', { taskPath, workDir });
  if (!r.ok) throw new Error(r.error || '清空失败');
}

export async function backupDocument(taskPath: string, workDir: string, docName: string, content: string, summary?: string): Promise<void> {
  const r = await protoCommand('backupDocument', { taskPath, workDir, docName, content, summary });
  if (!r.ok) throw new Error(r.error || '备份失败');
}

// ── 轮询数据层（模块级单例 poller + useSyncExternalStore 多订阅共享）────────────
export interface SchedulerData {
  tasks: ScheduledTask[];
  hist: HistEntry[];
  meta: ServiceMeta | null;
  templates: PromptTemplate[];
  protocolTemplates: ProtocolTemplate[];
  loading: boolean;
  error: string | null;
}

const POLL_MS = 5000;

let cache: SchedulerData = {
  tasks: [], hist: [], meta: null, templates: [], protocolTemplates: [],
  loading: true, error: null,
};

const subs = new Set<() => void>();
let timer: number | null = null;
let pollBusy = false;

function setCache(patch: Partial<SchedulerData>) {
  cache = { ...cache, ...patch };
  for (const fn of subs) fn();
}

/** 全量拉取（任务/历史/心跳/模板/协议模板） */
async function refresh(): Promise<void> {
  if (pollBusy) return;
  pollBusy = true;
  try {
    const [tasks, hist, meta, templates, protocolTemplates] = await Promise.all([
      loadTasks(), loadHist(), loadMeta(), loadTemplates(), listProtocolTemplates(),
    ]);
    setCache({ tasks, hist, meta, templates, protocolTemplates, loading: false, error: null });
  } catch (e) {
    setCache({ loading: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    pollBusy = false;
  }
}

function ensurePolling() {
  if (timer !== null) return;
  void refresh();
  timer = window.setInterval(() => {
    // 后台标签页暂停轮询（与 task-runner 面板同一约定）
    if (document.visibilityState !== 'visible') return;
    void refresh();
  }, POLL_MS);
}

function stopPolling() {
  if (timer !== null && subs.size === 0) {
    window.clearInterval(timer);
    timer = null;
  }
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  ensurePolling();
  return () => {
    subs.delete(fn);
    stopPolling();
  };
}

/** 面板统一数据 hook：tasks/executions(hist)/meta/templates 全部走 5s 轮询共享缓存 */
export function useAiSchedulerData(): SchedulerData {
  // getServerSnapshot：SSR 渲染验证（render-verify）与宿主首帧安全网——返回当前缓存快照
  return useSyncExternalStore(subscribe, () => cache, () => cache);
}
