'use strict';
/**
 * store.js —— db-workbench 数据存储
 *
 * 三层数据、三个家，边界必须守死：
 *  1. profile 元数据（无密码）→ cap.kv `dbl.profiles`：桌面/Web/手机三端同读。
 *  2. 密码（仅 rememberPass=true 时存在）→ 本地文件 appConfigDir/db-workbench/credentials.json：
 *     只被本 service 进程读写，永不进 kv、永不进任何 API 返回值、永不进日志。
 *     （与 DBeaver 等 DB 客户端本机存储凭据同级；文档明示，不做伪加密。）
 *  3. 查询历史（脱敏截断）→ cap.kv `dbl.hist`：三端可读，AI 可经 MCP 读。
 *
 * kv 写纪律：读-改-写之间不设长事务，写前重读（单用户语义，changqi/mock-server 同款纪律）。
 */
const fs = require('fs');
const path = require('path');
const core = require('../shared/core');

const KV_PROFILES = 'dbl.profiles';
const KV_HIST = 'dbl.hist';
const KV_META = 'dbl.meta';
const KV_SERVICE = 'dbl.service';

function credentialsPath(appConfigDir) {
  return path.join(appConfigDir || '.', 'db-workbench', 'credentials.json');
}

function readCredentials(appConfigDir) {
  try {
    const v = JSON.parse(fs.readFileSync(credentialsPath(appConfigDir), 'utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch (_) {
    return {};
  }
}

function writeCredentials(appConfigDir, map) {
  const p = credentialsPath(appConfigDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(map, null, 2), 'utf8');
}

class Store {
  /**
   * @param kv {{kvGet:Function, kvSet:Function}} house kvclient 实例
   * @param appConfigDir {string}
   */
  constructor(kv, appConfigDir) {
    this.kv = kv;
    this.appConfigDir = appConfigDir || '';
  }

  // ── profiles ──────────────────────────────────────────────────────────────
  async readProfiles() {
    const v = await this.kv.kvGet(KV_PROFILES).catch(() => null);
    return v && Array.isArray(v.items) ? v.items : [];
  }

  async writeProfiles(items) {
    await this.kv.kvSet(KV_PROFILES, { items, updatedAt: Date.now() });
  }

  /** 新增/更新 profile；密码在此层落地（rememberPass）或删除，API 层拿不到明文回传 */
  async upsertProfile(raw, password) {
    const norm = core.normalizeProfile(raw);
    if (norm.error) return norm;
    const p = norm.profile;
    const items = await this.readProfiles();
    const idx = items.findIndex((x) => x.id === p.id);
    if (idx >= 0) {
      // 更新：保留创建时间与使用痕迹
      p.createdAt = items[idx].createdAt || p.createdAt;
      p.lastUsedAt = items[idx].lastUsedAt || 0;
      items[idx] = p;
    } else {
      items.push(p);
    }
    await this.writeProfiles(items);
    // 密码：记住→写本地文件；不记住→删（可能存在旧密码）
    const creds = readCredentials(this.appConfigDir);
    if (p.rememberPass && typeof password === 'string' && password.length > 0) {
      creds[p.id] = password;
      writeCredentials(this.appConfigDir, creds);
      p.hasStoredPass = true;
      await this.writeProfiles(items);
    } else if (!p.rememberPass && creds[p.id] !== undefined) {
      delete creds[p.id];
      writeCredentials(this.appConfigDir, creds);
      p.hasStoredPass = false;
      await this.writeProfiles(items);
    } else if (p.rememberPass && typeof password !== 'string') {
      // 未传密码但保留记住标记：沿用已存密码
      p.hasStoredPass = creds[p.id] !== undefined;
      await this.writeProfiles(items);
    }
    return { ok: true, profile: p };
  }

  async deleteProfile(id) {
    const items = await this.readProfiles();
    const next = items.filter((x) => x.id !== id);
    if (next.length === items.length) return { ok: false, error: '连接不存在' };
    await this.writeProfiles(next);
    const creds = readCredentials(this.appConfigDir);
    if (creds[id] !== undefined) {
      delete creds[id];
      writeCredentials(this.appConfigDir, creds);
    }
    return { ok: true };
  }

  /** 取连接用密码：一次性优先，其次本地文件；都没有返回空（连接会失败并提示） */
  resolvePassword(profileId, oneTime) {
    if (typeof oneTime === 'string' && oneTime.length > 0) return oneTime;
    const creds = readCredentials(this.appConfigDir);
    return typeof creds[profileId] === 'string' ? creds[profileId] : '';
  }

  hasStoredPassword(profileId) {
    return readCredentials(this.appConfigDir)[profileId] !== undefined;
  }

  // ── history ───────────────────────────────────────────────────────────────
  async readHistory() {
    const v = await this.kv.kvGet(KV_HIST).catch(() => null);
    return v && Array.isArray(v.items) ? v.items : [];
  }

  async pushHistory(item) {
    const items = await this.readHistory();
    items.unshift(core.trimHistoryItem(item));
    await this.kv.kvSet(KV_HIST, { items: items.slice(0, core.HIST_KEEP), updatedAt: Date.now() });
  }

  async clearHistory() {
    await this.kv.kvSet(KV_HIST, { items: [], updatedAt: Date.now() });
  }

  // ── meta / service discovery ──────────────────────────────────────────────
  async writeServiceInfo(info) {
    await this.kv.kvSet(KV_SERVICE, info);
  }

  async writeMeta(meta) {
    const cur = (await this.kv.kvGet(KV_META).catch(() => null)) || {};
    await this.kv.kvSet(KV_META, Object.assign({}, cur, meta, { updatedAt: Date.now() }));
  }
}

module.exports = {
  Store, KV_PROFILES, KV_HIST, KV_META, KV_SERVICE,
  credentialsPath, readCredentials, writeCredentials,
};
