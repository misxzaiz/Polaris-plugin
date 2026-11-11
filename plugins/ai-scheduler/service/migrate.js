'use strict';
/**
 * migrate.js —— 主仓 scheduler.db 一次性只读导入（金标护栏）
 *
 * 来源：主仓 SqliteStorage（services/storage/sqlite.rs）items 表
 * `items(id TEXT PRIMARY KEY, data TEXT NOT NULL)`，id ∈ task/<id>，data=完整
 * ScheduledTask JSON（camelCase，运行态字段内嵌）。
 *
 * 护栏：
 *   1. 只读打开（readonly + fileMustExist），绝不写主仓库；
 *   2. 导入成功后重命名 scheduler.db → scheduler.db.migrated（防重复导入）；
 *   3. settings.migratedAt 记账，已迁移则直接跳过；
 *   4. node:sqlite 不可用（Node < 22.5 或被禁）→ 如实跳过并写日志，
 *      不阻塞服务启动（用户仍可手动重建任务）。
 */
const fs = require('fs');
const path = require('path');
const { normalizeTask } = require('./store');

function loadSqlite() {
  try {
    // eslint-disable-next-line global-require
    const { DatabaseSync } = require('node:sqlite');
    return DatabaseSync;
  } catch (_) {
    return null;
  }
}

/**
 * @param appConfigDir 宿主数据根 config 目录（stores/scheduler.db 之父）
 * @param store createStore 实例
 * @param log (level,msg)=>void
 * @returns {Promise<{status: 'done'|'skip'|'none'|'error', count?: number, detail?: string}>}
 */
async function migrateFromHostDb(appConfigDir, store, log) {
  const settings = await store.getSettings();
  if (settings.migratedAt) {
    return { status: 'skip', count: settings.migratedCount, detail: '已迁移过（settings.migratedAt）' };
  }

  const dbPath = path.join(appConfigDir || '', 'stores', 'scheduler.db');
  if (!appConfigDir || !fs.existsSync(dbPath)) {
    await store.putSettings({ migratedAt: Math.floor(Date.now() / 1000), migratedCount: 0 });
    return { status: 'none', detail: `不存在 ${dbPath}` };
  }

  const DatabaseSync = loadSqlite();
  if (!DatabaseSync) {
    // 不记账：下次服务重启（升级 node 后）仍会尝试
    return { status: 'error', detail: 'node:sqlite 不可用（需 Node ≥ 22.5）' };
  }

  let rows;
  try {
    const db = new DatabaseSync(dbPath, { readonly: true, fileMustExist: true });
    rows = db.prepare("SELECT id, data FROM items WHERE id LIKE 'task/%'").all();
    db.close();
  } catch (e) {
    return { status: 'error', detail: `只读打开失败: ${e.message}` };
  }

  let count = 0;
  for (const row of rows) {
    let parsed;
    try { parsed = JSON.parse(row.data); } catch (_) { continue; }
    const task = normalizeTask(parsed);
    if (!task.name) continue;
    // eslint-disable-next-line no-await-in-loop
    await store.putTask(task);
    // eslint-disable-next-line no-await-in-loop
    await store.setState(task.id, {
      lastRunAt: parsed.lastRunAt !== undefined ? parsed.lastRunAt : null,
      lastRunStatus: parsed.lastRunStatus !== undefined ? parsed.lastRunStatus : null,
      // Running 不带过来：主仓断链期任务反复失败/可能卡 Running，交给自愈语义
      nextRunAt: parsed.nextRunAt !== undefined ? parsed.nextRunAt : null,
      runCount: parsed.runCount || 0,
      retryCount: parsed.retryCount || 0,
      lastError: parsed.lastError || null,
      lastSessionId: parsed.lastSessionId || null,
    });
    count += 1;
  }

  // 成功后重命名防重复导入；改名失败不致命（settings 记账兜底）
  try {
    fs.renameSync(dbPath, `${dbPath}.migrated`);
  } catch (e) {
    log('warn', `scheduler.db 重命名失败（不致命，settings 已记账）: ${e.message}`);
  }
  await store.putSettings({ migratedAt: Math.floor(Date.now() / 1000), migratedCount: count });
  log('info', `migrate: 导入 ${count} 条任务（共 ${rows.length} 行）`);
  return { status: 'done', count, detail: rows.length !== count ? `部分行解析失败（${rows.length - count}）` : null };
}

module.exports = { migrateFromHostDb };
