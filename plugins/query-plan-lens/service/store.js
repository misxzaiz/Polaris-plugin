'use strict';
/**
 * store.js —— 连接配置存储（appConfigDir 单文件；密码不进 kv/日志/AI 上下文）
 *
 * 威胁模型与诚实边界：文件存放在 Polaris 应用配置目录（与 db-workbench 同一纪律），
 * 密码用 AES-256-GCM 加密落盘（密钥从 appConfigDir 路径派生）——这是**混淆**，
 * 防 shoulder-surf 与误同步到云盘的明文泄露；本机 root/同用户进程仍可读取，
 * 真正的边界是「不进 kv、不进日志、不进 AI 返回、不跨设备」。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_NAME = 'qpl-connections.json';
const ALGO = 'aes-256-gcm';

function deriveKey(appConfigDir) {
  return crypto.scryptSync(`query-plan-lens:${appConfigDir}`, 'qpl-static-salt-v1', 32);
}

function encryptPassword(key, plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptPassword(key, blob) {
  if (!blob) return '';
  try {
    const [ivB64, tagB64, encB64] = String(blob).split(':');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (_) {
    return '';
  }
}

class ConnStore {
  constructor(appConfigDir) {
    this.dir = appConfigDir || require('os').tmpdir();
    this.file = path.join(this.dir, FILE_NAME);
    this.key = deriveKey(this.dir);
  }

  _load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && Array.isArray(raw.connections)) return raw;
    } catch (_) { /* 首次/损坏：按空处理 */ }
    return { version: 1, connections: [] };
  }

  _save(data) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2), 'utf8');
    try { fs.chmodSync(this.file, 0o600); } catch (_) { /* Windows 无 chmod 语义 */ }
  }

  /** 列表（不含密码字段） */
  list() {
    return this._load().connections.map((c) => ({
      id: c.id, name: c.name, engine: c.engine, host: c.host, port: c.port,
      database: c.database, user: c.user, ssl: !!c.ssl,
      hasPassword: !!c.passwordEnc, createdAt: c.createdAt,
    }));
  }

  /** 取完整连接（含解密后密码；仅服务内部使用，绝不外发） */
  get(id) {
    const c = this._load().connections.find((x) => x.id === id);
    if (!c) return null;
    return { ...c, password: decryptPassword(this.key, c.passwordEnc), passwordEnc: undefined };
  }

  /** 新建/更新；返回 {id} */
  save(input) {
    const data = this._load();
    const now = Date.now();
    let id = input.id || '';
    if (!id) id = `c${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const engine = input.engine === 'pg' ? 'pg' : 'mysql';
    const rec = {
      id, name: String(input.name || '').trim() || `${engine}-${input.host}`,
      engine,
      host: String(input.host || '').trim(),
      port: Number(input.port) || (engine === 'pg' ? 5432 : 3306),
      database: String(input.database || '').trim(),
      user: String(input.user || '').trim(),
      ssl: !!input.ssl,
      createdAt: now,
      passwordEnc: input.password ? encryptPassword(this.key, input.password) : undefined,
    };
    if (!rec.host) throw new Error('host 不能为空');
    const idx = data.connections.findIndex((x) => x.id === id);
    if (idx >= 0) {
      // 更新时未传密码 → 保留旧密码
      if (!input.password) rec.passwordEnc = data.connections[idx].passwordEnc;
      data.connections[idx] = rec;
    } else {
      data.connections.push(rec);
    }
    this._save(data);
    return { id };
  }

  delete(id) {
    const data = this._load();
    const before = data.connections.length;
    data.connections = data.connections.filter((x) => x.id !== id);
    this._save(data);
    return data.connections.length < before;
  }
}

module.exports = { ConnStore, encryptPassword, decryptPassword };
