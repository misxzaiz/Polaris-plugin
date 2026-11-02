'use strict';
/**
 * redis.js —— Redis 驱动（RESP2 手写，零依赖）
 *
 * 为什么手写：redis npm 包的连接状态机（重连/订阅/事务队列）远超本插件需要；
 * 本驱动只做「一条 TCP 连接 + 串行命令 + 白名单」，语义最小、故障面最小。
 *
 * 协议要点（RESP2）：
 *  - 请求恒为数组：*N\r\n 后跟 N 组 $len\r\narg\r\n
 *  - 响应五种：+simple / -error / :integer / $bulk / *array；RESP3 的 _（null）
 *    与 ,（double）也按行处理，避免 Redis 7 服务端 hello3 时炸解析（本驱动不发 HELLO，
 *    服务端保持 RESP2，但解析上仍防御）。
 *  - 错误响应以 - 开头：解析为 JS Error（message 去掉 - 前缀），不吞。
 *  - 大响应：socket 按块到达，解析器必须跨块续读（buffer 拼接 + 游标）。
 */
const net = require('net');
const { QUERY_TIMEOUT_MS } = require('../../shared/core');

const CONNECT_TIMEOUT_MS = 8000;

// ── RESP 编码 ───────────────────────────────────────────────────────────────

function encodeCommand(args) {
  const arr = args.map((a) => (a == null ? '' : String(a)));
  let size = Buffer.byteLength(`*${arr.length}\r\n`);
  const bufs = [Buffer.from(`*${arr.length}\r\n`)];
  for (const a of arr) {
    const len = Buffer.byteLength(a);
    const head = Buffer.from(`$${len}\r\n`);
    const body = Buffer.from(a, 'utf8');
    const tail = Buffer.from('\r\n');
    size += head.length + body.length + tail.length;
    bufs.push(head, body, tail);
  }
  return Buffer.concat(bufs, size);
}

// ── RESP 解码（增量式） ─────────────────────────────────────────────────────

/**
 * 从 buf 的 offset 起解析一个 RESP 值。
 * 返回 { value, next }；数据不足返回 null（等下一块）。
 */
function parseReply(buf, offset) {
  if (offset >= buf.length) return null;
  const lineEnd = buf.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;
  const type = String.fromCharCode(buf[offset]);
  const head = buf.toString('utf8', offset + 1, lineEnd);
  const bodyStart = lineEnd + 2;
  switch (type) {
    case '+': return { value: head, next: bodyStart };
    case '-': {
      const err = new Error(head);
      err.redisError = true;
      return { value: err, next: bodyStart };
    }
    case ':': return { value: parseInt(head, 10), next: bodyStart };
    case ',': return { value: parseFloat(head), next: bodyStart };
    case '_': return { value: null, next: bodyStart };
    case '(': { // RESP3 big number
      const num = Number(head);
      return { value: Number.isSafeInteger(num) ? num : head, next: bodyStart };
    }
    case '$': {
      const len = parseInt(head, 10);
      if (len === -1) return { value: null, next: bodyStart };
      if (buf.length < bodyStart + len + 2) return null;
      return { value: buf.toString('utf8', bodyStart, bodyStart + len), next: bodyStart + len + 2 };
    }
    case '%': { // RESP3 map → object
      const n = parseInt(head, 10);
      let pos = bodyStart;
      const obj = {};
      for (let k = 0; k < n; k++) {
        const kk = parseReply(buf, pos);
        if (!kk) return null;
        const vv = parseReply(buf, kk.next);
        if (!vv) return null;
        obj[String(kk.value)] = vv.value;
        pos = vv.next;
      }
      return { value: obj, next: pos };
    }
    case '*': {
      const n = parseInt(head, 10);
      if (n === -1) return { value: null, next: bodyStart };
      let pos = bodyStart;
      const arr = [];
      for (let k = 0; k < n; k++) {
        const r = parseReply(buf, pos);
        if (!r) return null;
        arr.push(r.value);
        pos = r.next;
      }
      return { value: arr, next: pos };
    }
    default:
      throw new Error(`RESP 解析遇到未知类型 ${type}（offset ${offset}）`);
  }
}

// ── 连接封装：单连接串行队列 ────────────────────────────────────────────────

/**
 * 一个 RedisConn = 一条 TCP + 串行命令队列。
 * 队列串行是刻意的：Redis 单命令本身原子，串行化省掉连接池语义与乱序回包问题。
 */
class RedisConn {
  /**
   * @param opts {{host:string, port:number, password?:string, username?:string, db?:number,
   *              onLog?:(level:string,msg:string)=>void}}
   */
  constructor(opts) {
    this.host = opts.host;
    this.port = opts.port;
    this.password = opts.password || '';
    this.username = opts.username || '';
    this.db = Number.isInteger(opts.db) ? opts.db : 0;
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.queue = []; // { resolve, reject, timer }
    this.connecting = null;
    this.closed = false;
    this.lastUsedAt = Date.now();
  }

  _connect() {
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port });
      sock.setNoDelay(true);
      let settled = false;
      const fail = (e) => {
        if (settled) return;
        settled = true;
        try { sock.destroy(); } catch (_) { /* 忽略 */ }
        reject(e);
      };
      sock.setTimeout(CONNECT_TIMEOUT_MS, () => fail(new Error(`连接超时（${this.host}:${this.port}）`)));
      sock.once('error', (e) => fail(new Error(`连接失败: ${e.message}`)));
      sock.once('connect', () => {
        sock.setTimeout(0);
        settled = true;
        this.sock = sock;
        this._bindSock();
        const boot = [];
        if (this.password) {
          // Redis 6 ACL：带用户名走 AUTH user pass；否则 AUTH pass
          boot.push(this.username ? ['AUTH', this.username, this.password] : ['AUTH', this.password]);
        }
        if (this.db > 0) boot.push(['SELECT', String(this.db)]);
        (async () => {
          try {
            for (const cmd of boot) await this._raw(cmd);
            resolve(this);
          } catch (e) {
            this._teardown();
            reject(e);
          }
        })();
      });
    });
    this.connecting.catch(() => { this.connecting = null; });
    return this.connecting;
  }

  _bindSock() {
    this.sock.on('data', (chunk) => {
      this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
      this._drain();
    });
    this.sock.on('error', (e) => {
      this._failAll(new Error(`连接中断: ${e.message}`));
      this._teardown();
    });
    this.sock.on('close', () => {
      this._failAll(new Error('连接已关闭'));
      this._teardown();
    });
  }

  _failAll(err) {
    const q = this.queue.splice(0);
    for (const it of q) {
      if (it.timer) clearTimeout(it.timer);
      it.reject(err);
    }
  }

  _teardown() {
    if (this.sock) { try { this.sock.destroy(); } catch (_) { /* 忽略 */ } }
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.connecting = null;
  }

  _drain() {
    // 尽量多解析已排队命令的回包（FIFO 与发送顺序一致）
    while (this.queue.length) {
      let r;
      try {
        r = parseReply(this.buf, 0);
      } catch (e) {
        this._failAll(e);
        this._teardown();
        return;
      }
      if (!r) return;
      this.buf = this.buf.subarray(r.next);
      const it = this.queue.shift();
      if (it.timer) clearTimeout(it.timer);
      if (r.value instanceof Error) it.reject(r.value);
      else it.resolve(r.value);
    }
  }

  /** 内部直发（不走白名单；连接引导 AUTH/SELECT 用） */
  _raw(args) {
    return this.exec(args, QUERY_TIMEOUT_MS);
  }

  /** 对外命令入口：串行排队 + 超时 */
  exec(args, timeoutMs) {
    if (this.closed) return Promise.reject(new Error('连接已关闭'));
    this.lastUsedAt = Date.now();
    return this._connect().then(() => new Promise((resolve, reject) => {
      if (!this.sock) { reject(new Error('连接不可用')); return; }
      const it = { resolve, reject, timer: null };
      it.timer = setTimeout(() => {
        const idx = this.queue.indexOf(it);
        if (idx !== -1) this.queue.splice(idx, 1);
        // 超时后连接状态不可信（回包可能晚到），直接断链防串包
        this._failAll(new Error('命令超时，连接已重置'));
        this._teardown();
      }, timeoutMs);
      this.queue.push(it);
      try {
        this.sock.write(encodeCommand(args));
      } catch (e) {
        const idx = this.queue.indexOf(it);
        if (idx !== -1) this.queue.splice(idx, 1);
        clearTimeout(it.timer);
        reject(new Error(`发送失败: ${e.message}`));
        this._teardown();
      }
    }));
  }

  /** 空闲回收由 pool 侧调用 */
  close() {
    this.closed = true;
    this._failAll(new Error('连接已关闭'));
    this._teardown();
  }

  isIdle(maxIdleMs) {
    return !this.queue.length && Date.now() - this.lastUsedAt > maxIdleMs;
  }
}

/** 执行一条命令（白名单校验在 service 层用 shared/core 做，本层只管协议与格式化） */
async function execCommand(conn, args, timeoutMs) {
  const reply = await conn.exec(args, timeoutMs);
  return formatReply(reply);
}

/** 回包转成 JSON 友好形状（嵌套数组保留；Buffer 已按 utf8 字符串） */
function formatReply(v) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (Array.isArray(v)) return v.map(formatReply);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && !(v instanceof Error)) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = formatReply(v[k]);
    return o;
  }
  return v;
}

/** INFO 文本解析成对象（section 内 k:v 行） */
function parseInfo(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

module.exports = { RedisConn, encodeCommand, parseReply, formatReply, execCommand, parseInfo, CONNECT_TIMEOUT_MS };
