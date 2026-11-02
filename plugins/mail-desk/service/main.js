#!/usr/bin/env node
'use strict';
/**
 * main.js —— 邮件调试台后台服务(node >= 18;SMTP 依赖经 vendor.cjs 内联)
 *
 * 职责:
 *   - SMTP catch-all(127.0.0.1:<smtpPort> 默认 1025):只收不发、全收不转发,
 *     单封 5MB 上限;收到的原始报文落盘 .eml 并解析元数据入索引。
 *   - HTTP 数据面(127.0.0.1:<port> 默认 9875):/__health 恒 200;/api/* Bearer token
 *     (token 服务启动随机生成,经 kv mdk.service 分发给面板/MCP)。
 *   - 控制面(cap.kv mdk.*):settings 3s 热更(SMTP 端口改后重启 listener)/
 *     service 发现 {port, smtpPort, token}/ meta 心跳 60s / selftest 自检报告。
 *   - 自检(试金石):服务内手写 SMTP 客户端向自己发一封真信并断言收到。
 *
 * 生命周期由宿主 PluginServiceManager 管理。启动参数:node main.js <port> <appConfigDir>
 * 安全边界:两个 listener 都只绑 127.0.0.1;代码里不存在任何外发路径(零转发、
 * 零出站);日志不落邮件正文;环形上限 500 封/200MB 自淘汰。
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const core = require('../shared/core');
const { MailStore } = require('./store');
const { sendTestMail } = require('./smtpclient');

const { VERSION, K, LIMITS, DEFAULTS } = core;

// MDK_TEST_NO_BRIDGE=1:测试模式(无宿主桥场景)——kv 控制面降级为空实现,
// 防止集成测试的 mdk.* 键写入真实宿主。生产环境无此变量,路径不受影响。
const TEST_NO_BRIDGE = process.env.MDK_TEST_NO_BRIDGE === '1';
function createKvClientSafe() {
  if (TEST_NO_BRIDGE) {
    const stub = {
      dispatch: async () => { throw new Error('test no-bridge'); },
      dispatchOk: async () => { throw new Error('test no-bridge'); },
      kvGet: async () => null,
      kvSet: async () => true,
      kvDel: async () => true,
      kvKeys: async () => [],
      endpoint: () => null,
      refreshEndpoint: async () => null,
    };
    return stub;
  }
  const { createKvClient } = require('./kvclient');
  return createKvClient({ appConfigDir: ARG_CFG, log });
}

// ── vendor(npm 依赖内联;缺失时降级 node_modules,供开发/测试环境)────────────
let SMTPServer;
let simpleParser;
try {
  const vendor = require('./vendor.cjs');
  SMTPServer = vendor.SMTPServer;
  simpleParser = vendor.simpleParser;
} catch (_) {
  SMTPServer = require('smtp-server').SMTPServer;
  simpleParser = require('mailparser').simpleParser;
}

// ── 参数与日志 ───────────────────────────────────────────────────────────────
const ARG_PORT = parseInt(process.argv[2] || '', 10) || DEFAULTS.httpPort;
const ARG_CFG = process.argv[3] || '';

let logFile = null;
function initLog() {
  const dir = ARG_CFG || os.tmpdir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'mail-desk.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 512 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch (_) { /* 不存在即首轮 */ }
  } catch (_) { logFile = null; }
}
const DEBUG = process.env.MDK_DEBUG === '1';
function log(level, msg) {
  const line = `[mail-desk:${level}] ${new Date().toISOString()} ${msg}`;
  if (level === 'debug' && !DEBUG) return;
  process.stderr.write(line + '\n');
  if (logFile) {
    try { fs.appendFileSync(logFile, line + '\n'); } catch (_) { /* 磁盘问题不打断主流程 */ }
  }
}

// ── 状态 ────────────────────────────────────────────────────────────────────
const state = {
  httpPort: ARG_PORT,
  // MDK_TEST_SMTP_PORT 仅测试环境覆盖初始 SMTP 端口(无桥模式下 settings 热更不可用);生产无此变量
  smtpPort: parseInt(process.env.MDK_TEST_SMTP_PORT, 10) || DEFAULTS.smtpPort,
  // MDK_TEST_TOKEN 仅测试环境(无宿主桥时无法经 kv 分发 token)注入;生产环境无此变量
  token: process.env.MDK_TEST_TOKEN || crypto.randomBytes(16).toString('hex'),
  smtpListening: false,
  smtpLastError: '',
  startedAt: Date.now(),
  smtpConnections: 0,
};
const store = new MailStore({
  dir: path.join(ARG_CFG || os.tmpdir(), 'mail-desk'),
  parse: (raw) => simpleParser(raw),
  log,
});
const kv = createKvClientSafe();

// ── SMTP catch-all ──────────────────────────────────────────────────────────
let smtpServer = null;

function startSmtp(port, cb) {
  const server = new SMTPServer({
    authOptional: true,
    size: LIMITS.maxSingleMailBytes,
    disabledCommands: ['AUTH'],
    banner: 'polaris mail-desk catch-all (接收即终结,永不转发)',
    onConnect(session, cb) {
      // 连接数护栏:防本机失控进程打爆内存(每连接缓冲上限受单封 5MB 限制)
      if (state.smtpConnections >= 20) {
        setImmediate(() => cb(new Error('并发连接过多,请稍后再试')));
        return;
      }
      state.smtpConnections += 1;
      session.__mdkConn = true;
      cb();
    },
    onClose(session) {
      if (session && session.__mdkConn) state.smtpConnections = Math.max(0, state.smtpConnections - 1);
    },
    onRcptTo(address, session, cb) {
      // catch-all:全收。每封收件人数 ≤20 防滥用。
      const count = (session.envelope && session.envelope.rcptTo && session.envelope.rcptTo.length) || 0;
      if (count >= 20) return cb(new Error('收件人过多(上限 20)'));
      cb();
    },
    onData(stream, session, cb) {
      const chunks = [];
      let total = 0;
      let oversize = false;
      stream.on('data', (c) => {
        total += c.length;
        if (total > LIMITS.maxSingleMailBytes) {
          oversize = true;
          chunks.length = 0;
          return;
        }
        if (!oversize) chunks.push(c);
      });
      stream.on('end', () => {
        cb();
        if (oversize) {
          log('warn', `拒收超限邮件(${(total / 1024 / 1024).toFixed(1)}MB > 5MB): from=${safeFrom(session)}`);
          return;
        }
        const raw = Buffer.concat(chunks);
        store.ingest(raw)
          .then(({ meta }) => log('info', `收信 ${meta.id} 「${meta.subject}」 from=${meta.fromText} size=${raw.length}B`))
          .catch((e) => log('error', `入库失败: ${e.message}`));
      });
      stream.on('error', (e) => {
        log('warn', `数据流错误: ${e.message}`);
        try { cb(e); } catch (_) { /* cb 已调 */ }
      });
    },
  });
  server.on('error', (e) => {
    log('error', `SMTP 错误: ${e.message}`);
    state.smtpLastError = e.message;
  });
  server.listen(port, '127.0.0.1', () => {
    state.smtpPort = port;
    state.smtpListening = true;
    state.smtpLastError = '';
    log('info', `SMTP catch-all 已监听 127.0.0.1:${port}(只收不发)`);
    if (cb) cb(null);
  });
  server.on('error', (e) => {
    if (cb && !state.smtpListening) cb(e);
  });
  return server;
}

function safeFrom(session) {
  try {
    const f = session.envelope && session.envelope.mailFrom;
    return f && f.address ? String(f.address).slice(0, 120) : '(unknown)';
  } catch (_) { return '(unknown)'; }
}

/** 带 probe 的 SMTP 启动:冲突时向后找可用端口 */
function startSmtpWithProbe(preferred, probeN, cb) {
  let attempt = 0;
  const tryOnce = () => {
    const port = preferred + attempt;
    const srv = startSmtp(port, (err) => {
      if (!err) {
        if (cb) cb(null, port);
      } else if (attempt < probeN) {
        attempt += 1;
        try { srv.close(); } catch (_) { /* 未起成功 */ }
        log('warn', `SMTP 端口 ${port} 占用,尝试 ${preferred + attempt}`);
        setImmediate(tryOnce);
      } else if (cb) {
        cb(new Error(`SMTP 端口 ${preferred}~${preferred + probeN} 均不可用`));
      }
    });
  };
  tryOnce();
}

// ── HTTP 数据面 ─────────────────────────────────────────────────────────────

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authed(req) {
  const h = String(req.headers.authorization || '');
  return h === `Bearer ${state.token}`;
}

/** 自检:发自检信 → 断言收到 */
async function runSelftest() {
  const t0 = Date.now();
  const before = store.stats().count;
  if (!state.smtpListening) {
    return { ok: false, at: new Date().toISOString(), error: `SMTP 未监听:${state.smtpLastError || '未知'}`, steps: [] };
  }
  const sent = await sendTestMail(state.smtpPort);
  if (!sent.ok) {
    const report = { ok: false, at: new Date().toISOString(), error: sent.error || 'SMTP 会话失败', steps: sent.steps, elapsedMs: Date.now() - t0 };
    return report;
  }
  // 轮询断言:5s 内出现自检信(数量增加且主题匹配)
  let receivedId = '';
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    const after = store.stats().count;
    if (after > before) {
      const { items } = store.list({ query: '邮件调试台自检', offset: 0, limit: 1 });
      if (items.length) { receivedId = items[0].id; break; }
    }
  }
  const report = receivedId
    ? { ok: true, at: new Date().toISOString(), receivedId, steps: sent.steps, elapsedMs: Date.now() - t0 }
    : { ok: false, at: new Date().toISOString(), error: '信已发出但 5s 内未出现在收件箱', steps: sent.steps, elapsedMs: Date.now() - t0 };
  return report;
}

let selftestRunning = null;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const p = url.pathname;

  try {
    if (p === '/__health') {
      return json(res, 200, { ok: true, version: VERSION, smtp: state.smtpListening });
    }

    if (!authed(req)) {
      return json(res, 401, { error: '未授权(缺 Bearer token;请经面板或 MCP 访问)' });
    }

    if (req.method === 'GET' && p === '/api/meta') {
      const st = store.stats();
      return json(res, 200, {
        version: VERSION,
        httpPort: state.httpPort,
        smtpPort: state.smtpPort,
        smtpListening: state.smtpListening,
        smtpLastError: state.smtpLastError,
        count: st.count,
        totalBytes: st.totalBytes,
        dir: st.dir,
        uptimeMs: Date.now() - state.startedAt,
        limits: LIMITS,
      });
    }

    if (req.method === 'GET' && p === '/api/mail') {
      const q = core.pageArgs(url.searchParams.get('query'), url.searchParams.get('offset'), url.searchParams.get('limit'));
      const { items, total } = store.list(q);
      return json(res, 200, { items, total });
    }

    let m;
    if (req.method === 'GET' && (m = /^\/api\/mail\/([^/]+)$/.exec(p))) {
      const detail = await store.getDetail(decodeURIComponent(m[1]));
      if (!detail) return json(res, 404, { error: '邮件不存在或已被淘汰(环形上限 500 封/200MB)' });
      const codes = core.extractCodes(detail.text);
      return json(res, 200, {
        meta: detail.meta,
        text: detail.text,
        html: detail.html,
        codes,
        limits: { maxRawPreviewBytes: LIMITS.maxRawPreviewBytes, maxAttachmentB64: LIMITS.maxAttachmentB64 },
      });
    }

    if (req.method === 'GET' && (m = /^\/api\/mail\/([^/]+)\/raw$/.exec(p))) {
      const detail = await store.getDetail(decodeURIComponent(m[1]));
      if (!detail || !detail.raw) return json(res, 404, { error: '邮件不存在或原文不可用' });
      const rawStr = detail.raw.toString('utf8');
      const truncated = rawStr.length > LIMITS.maxRawPreviewBytes;
      return json(res, 200, {
        raw: truncated ? rawStr.slice(0, LIMITS.maxRawPreviewBytes) : rawStr,
        truncated,
        totalBytes: detail.raw.length,
      });
    }

    if (req.method === 'GET' && (m = /^\/api\/mail\/([^/]+)\/attach\/(\d+)$/.exec(p))) {
      const detail = await store.getDetail(decodeURIComponent(m[1]));
      if (!detail) return json(res, 404, { error: '邮件不存在' });
      const idx = parseInt(m[2], 10);
      const att = (detail.meta.attachments || [])[idx];
      if (!att) return json(res, 404, { error: '附件不存在' });
      if (att.size > LIMITS.maxAttachmentB64) {
        return json(res, 413, { error: `附件 ${(att.size / 1024 / 1024).toFixed(1)}MB 超过下发上限 8MB` });
      }
      // 从 raw 重新解析拿附件内容(详情缓存不驻留附件二进制,控内存)
      const parsed = await store.parse(detail.raw);
      const a = (parsed.attachments || [])[idx];
      if (!a || !a.content) return json(res, 500, { error: '附件内容解析失败' });
      return json(res, 200, {
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        dataB64: Buffer.from(a.content).toString('base64'),
      });
    }

    if (req.method === 'DELETE' && (m = /^\/api\/mail\/([^/]+)$/.exec(p))) {
      const id = decodeURIComponent(m[1]);
      if (store.remove(id)) return json(res, 200, { deleted: id });
      return json(res, 404, { error: '邮件不存在' });
    }

    if (req.method === 'POST' && p === '/api/clear') {
      const n = store.clear();
      log('info', `清空收件箱:${n} 封`);
      return json(res, 200, { cleared: n });
    }

    if (req.method === 'POST' && p === '/api/settings') {
      const body = JSON.parse((await readBody(req, 64 * 1024)) || '{}');
      const port = parseInt(body.smtpPort, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        return json(res, 400, { error: 'smtpPort 非法(1-65535)' });
      }
      await kv.kvSet(K.settings, { smtpPort: port });
      return json(res, 200, { ok: true, smtpPort: port, note: '已写入配置,服务将在 3s 内热更(端口变化则重启 SMTP listener)' });
    }

    if (req.method === 'GET' && p === '/api/selftest') {
      const last = await kv.kvGet(K.selftest);
      return json(res, 200, { last: last || null });
    }

    if (req.method === 'POST' && p === '/api/selftest') {
      if (selftestRunning) return json(res, 409, { error: '自检进行中,请稍候' });
      selftestRunning = true;
      try {
        const report = await runSelftest();
        await kv.kvSet(K.selftest, report);
        log('info', `自检完成 ok=${report.ok} ${report.error || ''}`);
        return json(res, 200, report);
      } finally {
        selftestRunning = false;
      }
    }

    return json(res, 404, { error: `未知端点 ${req.method} ${p}` });
  } catch (e) {
    log('error', `HTTP 处理异常 ${p}: ${e.message}`);
    return json(res, 500, { error: e.message || '内部错误' });
  }
});

// ── 控制面(settings 热更 / 心跳 / 发现)───────────────────────────────────────
let lastSettings = '';

function startTickers() {
  // settings 3s 热更:smtpPort 变化 → 重启 SMTP listener
  setInterval(() => {
    kv.kvGet(K.settings)
      .then((s) => {
        const sig = s ? JSON.stringify(s) : '';
        if (sig === lastSettings) return;
        lastSettings = sig;
        const want = s && Number.isFinite(s.smtpPort) ? s.smtpPort : null;
        if (want && want !== state.smtpPort) {
          log('info', `settings 热更:SMTP 端口 ${state.smtpPort} → ${want}`);
          const old = smtpServer;
          state.smtpListening = false;
          try { old.close(() => {}); } catch (_) { /* 忽略 */ }
          startSmtpWithProbe(want, DEFAULTS.smtpProbe, (err, port) => {
            if (err) {
              state.smtpLastError = err.message;
              log('error', `热更失败: ${err.message}`);
            } else {
              publishService();
            }
          });
        }
      })
      .catch(() => { /* 桥暂不可达,下一轮再试 */ });
  }, 3000).unref();

  // meta 心跳 60s
  const beat = () => {
    const st = store.stats();
    kv.kvSet(K.meta, {
      version: VERSION,
      count: st.count,
      totalBytes: st.totalBytes,
      smtpListening: state.smtpListening,
      smtpPort: state.smtpPort,
      updatedAt: new Date().toISOString(),
    }).catch(() => { /* 忽略 */ });
  };
  beat();
  setInterval(beat, 60 * 1000).unref();
}

/** 服务发现信息写 kv(面板/MCP 均经此发现;token 一次性分发) */
function publishService() {
  const st = store.stats();
  return kv.kvSet(K.service, {
    port: state.httpPort,
    smtpPort: state.smtpPort,
    token: state.token,
    pid: process.pid,
    version: VERSION,
    count: st.count,
    startedAt: new Date(state.startedAt).toISOString(),
  }).catch((e) => log('warn', `发布服务发现失败: ${e.message}`));
}

// ── 启动 ────────────────────────────────────────────────────────────────────
initLog();

// HTTP 先起(端口由宿主指定,冲突即退出让宿主 restartOnFailure 换端口重试)
server.on('error', (e) => {
  log('error', `HTTP 启动失败: ${e.message}`);
  process.exit(1);
});
server.listen(state.httpPort, '127.0.0.1', () => {
  log('info', `HTTP 数据面已监听 127.0.0.1:${state.httpPort}`);
  store.init();
  startSmtpWithProbe(state.smtpPort, DEFAULTS.smtpProbe, (err, port) => {
    if (err) state.smtpLastError = err.message;
    else state.smtpPort = port;
    // 发现信息最后发布(拿最终 smtpPort)
    const publish = () => publishService();
    if (kv.endpoint()) publish();
    else {
      kv.refreshEndpoint().then(publish).catch(publish);
    }
    startTickers();
  });
});

process.on('uncaughtException', (e) => log('error', `uncaughtException: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => log('error', `unhandledRejection: ${e && e.message ? e.message : String(e)}`));
