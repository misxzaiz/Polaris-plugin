'use strict';
/**
 * pool.js —— per-profile 连接池管理（懒建 / 复用 / 空闲回收 / 密码变更失效）
 *
 * 语义：一个 profile 至多一个池；profile 编辑/删除时显式失效（密码可能已变，
 * 池内旧凭据连接不可信——不复用旧池，宁可重建）。
 */
const mysqlDrv = require('./drivers/mysql');
const pgDrv = require('./drivers/pg');

const IDLE_SWEEP_MS = 60000;
const POOL_IDLE_TTL_MS = 5 * 60 * 1000;

class PoolManager {
  constructor() {
    this.map = new Map(); // profileId -> { type, pool, createdAt, lastUsedAt }
    this.sweepTimer = null;
  }

  start() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweepIdle(), IDLE_SWEEP_MS);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  get(id) {
    const e = this.map.get(id);
    if (e) e.lastUsedAt = Date.now();
    return e || null;
  }

  /** 取或建池。Redis 不在此管理（RedisConn 单连接，由 redisManager 管） */
  async getOrCreate(profile, password) {
    const found = this.get(profile.id);
    if (found) return found.pool;
    const drv = profile.type === 'mysql' ? mysqlDrv : pgDrv;
    const pool = drv.createPool(profile, password);
    this.map.set(profile.id, { type: profile.type, pool, createdAt: Date.now(), lastUsedAt: Date.now() });
    return pool;
  }

  /** 拿到对应驱动模块（query/listTables 等元数据调用） */
  driver(type) {
    return type === 'mysql' ? mysqlDrv : pgDrv;
  }

  async drop(id) {
    const e = this.map.get(id);
    if (!e) return;
    this.map.delete(id);
    try {
      await e.pool.end();
    } catch (_) { /* 回收失败不抛——池本身是尽力而为的资源 */ }
  }

  async sweepIdle() {
    const now = Date.now();
    for (const [id, e] of this.map) {
      if (now - e.lastUsedAt > POOL_IDLE_TTL_MS) await this.drop(id);
    }
  }

  async shutdownAll() {
    const ids = Array.from(this.map.keys());
    for (const id of ids) await this.drop(id);
  }

  size() { return this.map.size; }
}

/**
 * RedisConn 管理器：一个 profile 一条长连接（串行队列已保证不乱序）。
 * 连接出错/超时后 _teardown 会把 connecting 置空，下次 exec 自动重连。
 */
class RedisManager {
  constructor() {
    this.map = new Map();
    this.sweepTimer = null;
  }

  start() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweepIdle(), IDLE_SWEEP_MS);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  async getOrCreate(profile, password) {
    const found = this.map.get(profile.id);
    if (found && !found.closed) {
      found.lastUsedAt = Date.now();
      return found;
    }
    if (found) await this.drop(profile.id);
    const { RedisConn } = require('./drivers/redis');
    const conn = new RedisConn({
      host: profile.host,
      port: profile.port,
      password,
      username: profile.username || '',
      db: profile.database ? parseInt(profile.database, 10) || 0 : 0,
    });
    this.map.set(profile.id, conn);
    return conn;
  }

  async drop(id) {
    const c = this.map.get(id);
    if (!c) return;
    this.map.delete(id);
    try { c.close(); } catch (_) { /* 尽力而为 */ }
  }

  async sweepIdle() {
    for (const [id, c] of this.map) {
      if (c.isIdle(POOL_IDLE_TTL_MS)) await this.drop(id);
    }
  }

  async shutdownAll() {
    const ids = Array.from(this.map.keys());
    for (const id of ids) await this.drop(id);
  }

  size() { return this.map.size; }
}

module.exports = { PoolManager, RedisManager, POOL_IDLE_TTL_MS };
