'use strict';
/**
 * store.js —— 邮件存储(落盘 .eml 为真相 + 内存索引;环形自淘汰)
 *
 * 设计:
 *   - 目录 <appConfigDir>/mail-desk/,每封邮件一个 <id>.eml(原始报文,单一真相)。
 *   - 内存索引:元数据(id/from/to/subject/日期/大小/附件清单/正文缓存)。
 *   - 启动重建:扫描目录逐封解析(simpleParser)拿元数据;上限 500 封,最坏几秒一次。
 *   - 正文缓存:text/html 解析结果驻留内存;重启后首次读取时按需解析。
 *   - 淘汰:入库后按 core.evictPlan 决策删最旧(文件 + 索引 + 缓存)。
 *   - 写入安全:先写 .part 再 rename,避免半截文件被启动扫描误读。
 */
const fs = require('fs');
const path = require('path');
const core = require('../shared/core');

const { LIMITS } = core;

class MailStore {
  /**
   * @param opts {{dir: string, parse: (raw: Buffer)=>Promise<any>, log?: (l:string,m:string)=>void}}
   *   parse 由 main.js 注入(mailparser.simpleParser 的 vendor 包装),保持 store 零依赖。
   */
  constructor(opts) {
    this.dir = opts.dir;
    this.parse = opts.parse;
    this.log = opts.log || (() => {});
    /** @type {Array<{id:string,fromText:string,toText:string,subject:string,date:string|null,receivedAt:number,sizeBytes:number,attachments:Array<{filename:string,contentType:string,size:number}>,hasHtml:boolean,hasText:boolean,textPreview:string,headers:Record<string,string>}>} */
    this.items = []; // 按 receivedAt 升序(最旧在前)
    /** @type {Map<string,{raw:Buffer|null,text:string|null,html:string|null}>} */
    this.cache = new Map(); // 正文缓存(id→解析结果;raw 保留到淘汰)
  }

  init() {
    fs.mkdirSync(this.dir, { recursive: true });
    const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.eml'));
    let rebuilt = 0;
    for (const f of files) {
      const id = f.slice(0, -4);
      try {
        const raw = fs.readFileSync(path.join(this.dir, f));
        // 同步重建用异步队列也可以,但 simpleParser 是回调式——启动期用缓冲同步策略:
        // 先以占位元数据入列,再异步补齐(列表接口在重建完成前仍可用)。
        const meta = {
          id,
          fromText: '',
          toText: '',
          subject: '(解析中…)',
          date: null,
          receivedAt: this.tsFromId(id),
          sizeBytes: raw.length,
          attachments: [],
          hasHtml: false,
          hasText: false,
          textPreview: '',
          headers: {},
          _pending: true,
        };
        this.items.push(meta);
        this.cache.set(id, { raw });
        rebuilt += 1;
      } catch (e) {
        this.log('warn', `重建索引跳过损坏文件 ${f}: ${e.message}`);
      }
    }
    if (rebuilt) this.log('info', `启动重建索引:${rebuilt} 封(异步补齐元数据)`);
    // 异步补齐(不阻塞服务启动)
    for (const meta of this.items.filter((m) => m._pending)) {
      this.hydrate(meta).catch((e) => this.log('warn', `补齐 ${meta.id} 失败: ${e.message}`));
    }
    // 补齐完成后按 receivedAt 排序
    void Promise.allSettled(this.items.filter((m) => m._pending).map((m) => this.hydrate(m)))
      .then(() => { this.items.sort((a, b) => a.receivedAt - b.receivedAt); });
  }

  /** 从 id 恢复时间戳(id 格式 m_<base36 ts>_<rand>) */
  tsFromId(id) {
    const m = /^m_([0-9a-z]+)_/.exec(id);
    if (m) {
      const ts = parseInt(m[1], 36);
      if (Number.isFinite(ts) && ts > 0) return ts;
    }
    return 0;
  }

  /** 解析 raw 并填充 meta(启动补齐/入库共用) */
  async hydrate(meta) {
    const c = this.cache.get(meta.id);
    if (!c) return meta;
    if (!c.raw) return meta;
    const parsed = await this.parse(c.raw);
    const text = typeof parsed.text === 'string' ? parsed.text : '';
    const html = typeof parsed.html === 'string' ? parsed.html : '';
    const attachments = (parsed.attachments || []).map((a) => ({
      filename: a.filename || '(未命名)',
      contentType: a.contentType || 'application/octet-stream',
      size: (a.content && a.content.length) || 0,
      cid: a.cid || '',
    }));
    const addrList = (a) => (a && a.value ? a.value.map((v) => [v.name, v.address].filter(Boolean).join(' ')).join(', ') : '');
    meta.fromText = addrList(parsed.from);
    meta.toText = addrList(parsed.to);
    meta.subject = parsed.subject || '(无主题)';
    meta.date = parsed.date ? new Date(parsed.date).toISOString() : null;
    meta.attachments = attachments;
    meta.hasHtml = Boolean(html);
    meta.hasText = Boolean(text);
    meta.textPreview = text.slice(0, 2048);
    const headers = {};
    try {
      const map = parsed.headers instanceof Map ? parsed.headers : new Map(Object.entries(parsed.headers || {}));
      for (const key of ['from', 'to', 'cc', 'subject', 'date', 'message-id', 'content-type', 'user-agent', 'x-mailer']) {
        if (map.has(key)) headers[key] = String(map.get(key)).slice(0, 500);
      }
    } catch (_) { /* headers 解析失败不致命 */ }
    meta.headers = headers;
    meta._pending = false;
    // 正文缓存(raw 保留供原文/附件读取;text/html 常驻)
    this.cache.set(meta.id, { raw: c.raw, text, html });
    return meta;
  }

  /** 入库(已在 SMTP onData 收齐 raw);返回 {meta, evicted:[id]} */
  async ingest(raw) {
    const id = core.newMailId();
    const tmp = path.join(this.dir, `${id}.eml.part`);
    const file = path.join(this.dir, `${id}.eml`);
    fs.writeFileSync(tmp, raw);
    fs.renameSync(tmp, file);
    const meta = {
      id,
      fromText: '',
      toText: '',
      subject: '(解析中…)',
      date: null,
      receivedAt: Date.now(),
      sizeBytes: raw.length,
      attachments: [],
      hasHtml: false,
      hasText: false,
      textPreview: '',
      headers: {},
      _pending: true,
    };
    this.items.push(meta);
    this.cache.set(id, { raw });
    await this.hydrate(meta);
    const evicted = this.evict();
    return { meta, evicted };
  }

  /** 环形淘汰(数量+字节),返回被淘汰 id */
  evict() {
    const plan = core.evictPlan(
      this.items.map((m) => ({ id: m.id, sizeBytes: m.sizeBytes })),
      LIMITS.maxMailCount,
      LIMITS.maxTotalBytes,
    );
    for (const id of plan) this.removeLocal(id);
    return plan;
  }

  removeLocal(id) {
    try { fs.unlinkSync(path.join(this.dir, `${id}.eml`)); } catch (_) { /* 文件可能已不在 */ }
    this.items = this.items.filter((m) => m.id !== id);
    this.cache.delete(id);
  }

  list({ query, offset, limit }) {
    const matched = this.items.filter((m) => !m._pending && core.mailMatches(m, query));
    const total = matched.length;
    const page = matched.slice().reverse().slice(offset, offset + limit); // 新的在前
    return { items: page, total };
  }

  getMeta(id) {
    return this.items.find((m) => m.id === id && !m._pending) || null;
  }

  /** 详情(含正文;重启后首次按需解析) */
  async getDetail(id) {
    const meta = this.getMeta(id);
    if (!meta) return null;
    let c = this.cache.get(id);
    if (c && !('text' in c)) {
      await this.hydrate(meta);
      c = this.cache.get(id);
    }
    return { meta, text: (c && c.text) || '', html: (c && c.html) || '', raw: (c && c.raw) || null };
  }

  remove(id) {
    if (!this.getMeta(id)) return false;
    this.removeLocal(id);
    return true;
  }

  clear() {
    const ids = this.items.map((m) => m.id);
    for (const id of ids) this.removeLocal(id);
    return ids.length;
  }

  stats() {
    const totalBytes = this.items.reduce((s, m) => s + (m.sizeBytes || 0), 0);
    return { count: this.items.length, totalBytes, dir: this.dir };
  }
}

module.exports = { MailStore };
