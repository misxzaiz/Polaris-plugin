'use strict';
/**
 * sandbox-core.js —— 执行沙箱共享核心（单一权威，零依赖纯函数、零 node 内置模块）
 *
 * 被 MCP server（CJS require）与面板（esbuild 打包进 browser bundle）共用。
 * 因此本文件**禁止 require 任何 node 内置模块**（os/path/fs 等）——
 * 涉及文件系统的路径组装/resolve 在 server.js（node 侧）完成，本 core 只做
 * 键名、纯字符串比对、元数据归一化、TTL 判定等纯计算，防口径漂移。
 *
 * 隔离语义（如实）：
 *   - 目录隔离：每个工作区一个独立临时目录，销毁即递归删除。
 *   - 根边界：write/destroy 的目标路径 resolve 后必须位于沙箱根内（整段目录
 *     前缀比对防 ws-abc-evil 撞名，weibian 先例），越界一律拒绝。
 *   - 非进程级沙箱：exec 与宿主同权限级，靠「目录隔离 + 短 TTL + 双确认闸」
 *     收敛风险面，不宣称进程隔离（plugin.json description 同口径）。
 *
 * 数据契约（cap.kv）：
 *   execsandbox.ws.<workspaceId> → WorkspaceMeta
 *     { v: 1, workspaceId, label, dir, createdAt, expiresAt, lastActivityAt }
 */

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 工作区默认存活时长（毫秒）：24h，list/create 时惰性清理过期项 */
const TTL_MS = 24 * 60 * 60 * 1000;

/** exec 输出保存尾部上限（字节，对齐 task-runner OUTPUT_TAIL） */
const OUTPUT_TAIL = 8 * 1024;

/** exec 超时上下限（秒） */
const EXEC_TIMEOUT_MIN_SEC = 1;
const EXEC_TIMEOUT_MAX_SEC = 120;

const KV_PREFIX = 'execsandbox.ws.';
/** tmpdir 下沙箱根目录名（真实路径组装在 server.js：path.join(os.tmpdir(), TMP_ROOT_NAME, id)） */
const TMP_ROOT_NAME = 'polaris-exec-sandbox';

// ── workspaceId ────────────────────────────────────────────────────────────

/** workspaceId 生成：时间戳 base36 + 6 位随机（仅目录名用途） */
function makeWorkspaceId(now) {
  return 'ws' + (now || Date.now()).toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── 路径边界校验（纯字符串比对；参数必须是已 path.resolve 的绝对路径）──────

/**
 * 目标路径是否在根内。用 `root + sep` 整段前缀比对，防 `ws-abc-evil` 撞名
 * （weibian 先例）；root/target 两侧均须来自同一平台的 path.resolve 产物。
 */
function isInsideRoot(rootAbs, targetAbs) {
  const r = String(rootAbs || '');
  const t = String(targetAbs || '');
  if (!r || !t) return false;
  if (t === r) return true; // 根自身语义允许
  const sep = t.includes('\\') ? '\\' : '/';
  return t.startsWith(r + sep);
}

// ── 元数据归一化 ───────────────────────────────────────────────────────────

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function toTs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** cap.kv 原始值 → WorkspaceMeta；结构不符返回 null（脏数据防御） */
function normalizeWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const workspaceId = typeof raw.workspaceId === 'string' && raw.workspaceId ? raw.workspaceId : null;
  if (!workspaceId) return null;
  const dir = typeof raw.dir === 'string' ? raw.dir : '';
  return {
    v: 1,
    workspaceId,
    label: typeof raw.label === 'string' ? raw.label.slice(0, 100) : '',
    dir,
    createdAt: toTs(raw.createdAt) || 0,
    expiresAt: toTs(raw.expiresAt) || 0,
    lastActivityAt: toTs(raw.lastActivityAt) || 0,
  };
}

/** kv 键名 */
function wsKey(workspaceId) {
  return KV_PREFIX + workspaceId;
}

/** 已过期判定（now 注入可测） */
function isExpired(meta, now) {
  if (!meta || !meta.expiresAt) return false;
  return meta.expiresAt <= (now || Date.now());
}

/** 新工作区元数据 */
function newWorkspaceMeta(workspaceId, dir, label, now, ttlMs) {
  const t = now || Date.now();
  return {
    v: 1,
    workspaceId,
    label: String(label || '').slice(0, 100),
    dir,
    createdAt: t,
    expiresAt: t + (ttlMs || TTL_MS),
    lastActivityAt: t,
  };
}

/** 触达刷新 lastActivityAt（不续期 expiresAt——TTL 从创建起算，语义简单可预期） */
function touchMeta(meta, now) {
  return { ...meta, lastActivityAt: now || Date.now() };
}

// ── 输出截尾（对齐 task-runner tailBytes）──────────────────────────────────

function tailBytes(s, cap) {
  const t = String(s == null ? '' : s);
  if (t.length <= cap) return t;
  return '…' + t.slice(t.length - (cap - 1));
}

// ── exec 命令校验 ──────────────────────────────────────────────────────────

/** exec 超时归一（秒 → 毫秒，夹紧 [1,120]） */
function clampTimeoutSec(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return 120 * 1000;
  return Math.min(EXEC_TIMEOUT_MAX_SEC, Math.max(EXEC_TIMEOUT_MIN_SEC, Math.round(n))) * 1000;
}

/** confirm 双闸（对齐 task-runner：危险操作需显式 confirm:true） */
function requireConfirm(args) {
  return Boolean(args && args.confirm === true);
}

module.exports = {
  TTL_MS, OUTPUT_TAIL, EXEC_TIMEOUT_MIN_SEC, EXEC_TIMEOUT_MAX_SEC,
  KV_PREFIX, TMP_ROOT_NAME,
  makeWorkspaceId,
  isInsideRoot,
  normalizeWorkspace, wsKey, isExpired, newWorkspaceMeta, touchMeta,
  tailBytes, clampTimeoutSec, requireConfirm,
};
