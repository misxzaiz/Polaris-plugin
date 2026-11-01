'use strict';
/**
 * probe.js —— MCP 调试台后台服务（127.0.0.1，宿主 PluginServiceManager 托管）
 *
 * 启动：node probe.js <port> <appConfigDir>
 *
 * 所有权纪律（与 docs/mcp-probe-plan.md §四对齐）：
 * - 外部 MCP 服务器连接的唯一所有者是本进程（面板/AI 工具都不 spawn）；
 *   宿主插件 MCP 的唯一所有者是宿主 McpClientRegistry（本服务只经 cap.mcp 代理，绝不重复 spawn）。
 * - cap.kv 中 probe.* 键空间的唯一写者是本进程；面板对 kv 只读（降级视图）。
 * - 宿主不收集插件服务 stdout：日志自落盘 <appConfigDir>/mcp-probe.log（512KB 轮转保 1 份 .old）。
 *
 * 安全：
 * - 仅绑 127.0.0.1；除 /__health 外全部要求 Bearer token（首启生成，写 probe.meta 供面板/AI 读取）；
 * - CORS 仅回显本地 origin（http(s)://localhost|127.0.0.1 与 tauri 系）；
 * - AI 工具只能引用已注册档案的 serverId，不接受裸命令行；
 * - 退出时逐一关闭子进程，防孤儿 MCP 服务器。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { McpConnection } = require('./mcpclient');
const { createKvClient } = require('./kvclient');
const { scanConfigs, candidateToProfile, SCOPES } = require('./imports');
const core = require('../shared/probe-core');

const VERSION = '0.1.0';
const KV = {
  meta: 'probe.meta',
  profiles: 'probe.profiles',
  history: 'probe.history',
  snapshots: 'probe.snapshots',
  reports: 'probe.reports',
  settings: 'probe.settings',
};
const HISTORY_CAP = 200;
const SNAPSHOT_CAP = 30;
const REPORT_CAP = 30;
const RESULT_TEXT_CAP = 64 * 1024;
const ARGS_TEXT_CAP = 16 * 1024;
const IDLE_DISCONNECT_MS = 15 * 60 * 1000;
const IDLE_SWEEP_MS = 60 * 1000;

/* ------------------------------ 日志 ------------------------------ */

function createLogger(logPath) {
  function write(level, msg) {
    const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
    try {
      if (fs.existsSync(logPath)) {
        const st = fs.statSync(logPath);
        if (st.size > 512 * 1024) {
          try { fs.renameSync(logPath, `${logPath}.old`); } catch (_) { /* 覆盖失败则继续追加 */ }
        }
      }
      fs.appendFileSync(logPath, line);
    } catch (_) { /* 日志失败不影响业务 */ }
    if (level === 'error' || level === 'warn') process.stderr.write(line);
  }
  return {
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
    debug: (m) => { if (process.env.POLARIS_PROBE_DEBUG) write('debug', m); },
  };
}

/* ------------------------------ 主服务 ------------------------------ */

function main() {
  const port = parseInt(process.argv[2] || '', 10);
  const appConfigDir = process.argv[3] || '';
  if (!Number.isFinite(port) || port <= 0) {
    process.stderr.write('[mcp-probe] 缺少 port 参数\n');
    process.exit(2);
  }
  const logPath = appConfigDir ? path.join(appConfigDir, 'mcp-probe.log') : path.join(process.cwd(), 'mcp-probe.log');
  const log = createLogger(logPath);

  const state = {
    profiles: [],   // 外部服务器档案（唯一写者=本进程）
    history: [],    // 调用历史（新在前）
    snapshots: [],  // 工具清单快照（新在前）
    reports: [],    // 体检报告（新在前）
    settings: { initTimeoutMs: 15000, callTimeoutMs: 30000 },
    pool: new Map(), // serverId -> McpConnection
    degraded: false, // kv 不可达时置位（内存态照常工作）
    startedAt: new Date().toISOString(),
  };
  const token = crypto.randomBytes(16).toString('hex');
  const kv = createKvClient({ appConfigDir, log: (l, m) => log[l](m) });

  /* ---------- kv 持久化（失败降级内存态，不抛出） ---------- */
  async function persist(key, value) {
    try {
      await kv.kvSet(key, value);
      state.degraded = false;
    } catch (e) {
      state.degraded = true;
      log.error(`kv 持久化失败（${key}）: ${e.message}——继续内存态运行`);
    }
  }

  async function loadState() {
    const loads = await Promise.allSettled([
      kv.kvGet(KV.profiles), kv.kvGet(KV.history), kv.kvGet(KV.snapshots), kv.kvGet(KV.reports), kv.kvGet(KV.settings),
    ]);
    const pick = (i, field, fallback) => {
      const r = loads[i];
      if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
        const arr = r.value[field];
        return Array.isArray(arr) ? arr : fallback;
      }
      return fallback;
    };
    state.profiles = pick(0, 'servers', []);
    state.history = pick(1, 'calls', []);
    state.snapshots = pick(2, 'snaps', []);
    state.reports = pick(3, 'reports', []);
    if (loads[4].status === 'fulfilled' && loads[4].value && typeof loads[4].value === 'object') {
      state.settings = { ...state.settings, ...loads[4].value };
    }
    if (loads.some((r) => r.status === 'rejected')) {
      state.degraded = true;
      log.warn('部分 kv 状态加载失败，以缺省态启动');
    }
    log.info(`状态加载：profiles=${state.profiles.length} history=${state.history.length} snapshots=${state.snapshots.length} reports=${state.reports.length}`);
  }

  async function publishMeta() {
    await persist(KV.meta, {
      port, pid: process.pid, version: VERSION, startedAt: state.startedAt, token,
    });
  }

  /* ---------- 档案 ---------- */
  function findProfile(id) {
    return state.profiles.find((p) => p.id === id) || null;
  }

  function validateProfile(input) {
    const p = input && typeof input === 'object' ? input : {};
    if (!p.name || typeof p.name !== 'string') return '档案缺少 name';
    if (p.transport !== 'stdio' && p.transport !== 'http') return 'transport 必须是 stdio 或 http';
    if (p.transport === 'stdio') {
      if (!String(p.command || '').trim()) return 'stdio 档案需要 command';
    } else if (!/^https?:\/\//i.test(String(p.url || ''))) {
      return 'http 档案需要 http(s) url';
    }
    if (p.args !== undefined && !Array.isArray(p.args)) return 'args 必须是字符串数组';
    return '';
  }

  function saveProfile(input) {
    const err = validateProfile(input);
    if (err) return { error: err };
    const now = new Date().toISOString();
    const existing = input.id ? findProfile(input.id) : null;
    const profile = {
      id: existing ? existing.id : core.newId('srv'),
      name: String(input.name),
      transport: input.transport,
      command: String(input.command || '').trim(),
      args: Array.isArray(input.args) ? input.args.map(String) : [],
      env: plainStrings(input.env),
      url: String(input.url || ''),
      headers: plainStrings(input.headers),
      timeoutMs: clampInt(input.timeoutMs, 3000, 300000, 30000),
      origin: input.origin || existing?.origin || 'manual',
      sourceScope: input.sourceScope ?? existing?.sourceScope ?? '',
      sourcePath: input.sourcePath ?? existing?.sourcePath ?? '',
      legacy: !!(input.legacy ?? existing?.legacy),
      note: String(input.note ?? existing?.note ?? ''),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (existing) {
      state.profiles.splice(state.profiles.indexOf(existing), 1, profile);
    } else {
      state.profiles.push(profile);
    }
    persist(KV.profiles, { servers: state.profiles });
    return { profile };
  }

  function plainStrings(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') out[k] = String(val);
    }
    return out;
  }

  function clampInt(v, min, max, dflt) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  }

  async function deleteProfile(id) {
    const p = findProfile(id);
    if (!p) return false;
    const conn = state.pool.get(id);
    if (conn) {
      await conn.close().catch(() => {});
      state.pool.delete(id);
    }
    state.profiles.splice(state.profiles.indexOf(p), 1);
    await persist(KV.profiles, { servers: state.profiles });
    return true;
  }

  /* ---------- 连接池 ---------- */
  function poolInfo() {
    const out = [];
    for (const [serverId, c] of state.pool) {
      out.push({
        serverId,
        status: c.status,
        serverInfo: c.serverInfo,
        protocolVersion: c.protocolVersion,
        toolCount: Array.isArray(c.tools) ? c.tools.length : 0,
        connectedAt: c.connectedAt,
        lastUsedAt: c.lastUsedAt,
        poisoned: c.poisoned,
        lastError: c.lastError,
      });
    }
    return out;
  }

  async function getOrConnect(profileId, forceReconnect) {
    const p = findProfile(profileId);
    if (!p) throw new Error(`未找到档案 ${profileId}`);
    const existing = state.pool.get(profileId);
    if (existing && !forceReconnect) {
      if (existing.status === 'ready' && !existing.poisoned) {
        return { profile: p, conn: existing, reused: true };
      }
      if (existing.status === 'connecting') {
        throw new Error('该档案正在连接中，请稍候');
      }
      // error/poisoned/closed → 重建
      await existing.close().catch(() => {});
      state.pool.delete(profileId);
    } else if (existing && forceReconnect) {
      await existing.close().catch(() => {});
      state.pool.delete(profileId);
    }
    const conn = new McpConnection(p, { log: (l, m) => log[l](`[${p.name}] ${m}`) });
    state.pool.set(profileId, conn);
    try {
      await conn.connect(state.settings.initTimeoutMs);
      return { profile: p, conn, reused: false };
    } catch (e) {
      state.pool.delete(profileId);
      await conn.close().catch(() => {});
      throw e;
    }
  }

  /* ---------- 调用与历史 ---------- */
  function capText(s, cap) {
    const str = typeof s === 'string' ? s : JSON.stringify(s);
    if (str.length <= cap) return str;
    return `${str.slice(0, cap)}\n…[截断，完整 ${str.length} 字符]`;
  }

  function recordHistory(entry) {
    const rec = {
      id: core.newId('call'),
      at: new Date().toISOString(),
      serverId: entry.serverId,
      serverName: entry.serverName || '',
      tool: entry.tool,
      argsText: capText(entry.argsText || '{}', ARGS_TEXT_CAP),
      resultText: capText(entry.resultText || '', RESULT_TEXT_CAP),
      isError: !!entry.isError,
      durationMs: entry.durationMs || 0,
      via: entry.via === 'ai' ? 'ai' : 'panel',
      source: entry.source === 'host' ? 'host' : 'external',
    };
    state.history.unshift(rec);
    state.history = core.capList(state.history, HISTORY_CAP);
    persist(KV.history, { calls: state.history });
    return rec;
  }

  function resultToText(result) {
    try {
      return JSON.stringify(result, null, 2);
    } catch (_) {
      return String(result);
    }
  }

  /* ---------- 宿主插件 MCP（cap.mcp 代理） ---------- */
  async function hostListTools() {
    const r = await kv.dispatchOk('cap.mcp', { action: 'list_plugin_tools', pluginId: '' });
    return r && Array.isArray(r.servers) ? r.servers : [];
  }

  async function hostCall(mcpServerId, tool, args) {
    const t0 = Date.now();
    const r = await kv.dispatchOk('cap.mcp', {
      action: 'call', mcpServerId, tool, arguments: args || {},
    });
    return { resultJson: r && r.resultJson !== undefined ? r.resultJson : '', durationMs: Date.now() - t0 };
  }

  function parseServerId(serverId) {
    if (typeof serverId === 'string' && serverId.startsWith('host:')) {
      return { kind: 'host', mcpServerId: serverId.slice(5) };
    }
    return { kind: 'external', profileId: String(serverId || '') };
  }

  /* ---------- 体检 ---------- */
  async function healthCheckOne(serverId) {
    const parsed = parseServerId(serverId);
    const t0 = Date.now();
    if (parsed.kind === 'host') {
      const servers = await hostListTools();
      const target = servers.find((s) => `host:${s.server || s.pluginId}` === serverId || s.server === parsed.mcpServerId);
      if (!target) throw new Error(`宿主未注册 MCP server: ${parsed.mcpServerId}（可先 list_plugin_tools 查看）`);
      const tools = Array.isArray(target.tools) ? target.tools : [];
      const issues = core.assessToolset(tools);
      const report = {
        id: core.newId('rep'), at: new Date().toISOString(), kind: 'host',
        serverId, serverName: parsed.mcpServerId,
        ok: !issues.some((i) => i.level === 'error'),
        roundtripMs: Date.now() - t0, via: 'cap.mcp',
        toolCount: tools.length, issues,
        note: '宿主插件工具：体检只覆盖清单元数据；实际调用行为请到调试台验证',
      };
      state.reports.unshift(report);
      state.reports = core.capList(state.reports, REPORT_CAP);
      persist(KV.reports, { reports: state.reports });
      return report;
    }
    const p = findProfile(parsed.profileId);
    if (!p) throw new Error(`未找到档案 ${parsed.profileId}`);
    const existing = state.pool.get(parsed.profileId);
    const reusable = existing && existing.status === 'ready' && !existing.poisoned;
    const conn = reusable ? existing : new McpConnection(p, { log: (l, m) => log[l](`[${p.name}] ${m}`) });
    try {
      let initLatencyMs = null;
      let listLatencyMs = null;
      let protocolVersion = '';
      let serverInfo = null;
      let tools = [];
      if (reusable) {
        const t1 = Date.now();
        tools = await conn.listTools(state.settings.callTimeoutMs);
        listLatencyMs = Date.now() - t1;
        protocolVersion = conn.protocolVersion;
        serverInfo = conn.serverInfo;
      } else {
        const t1 = Date.now();
        await conn.start();
        const info = await conn.initialize(state.settings.initTimeoutMs);
        initLatencyMs = Date.now() - t1;
        const t2 = Date.now();
        tools = await conn.listTools(state.settings.callTimeoutMs);
        listLatencyMs = Date.now() - t2;
        protocolVersion = info.protocolVersion;
        serverInfo = info.serverInfo;
      }
      const issues = core.assessToolset(tools);
      const report = {
        id: core.newId('rep'), at: new Date().toISOString(), kind: 'external',
        serverId, serverName: p.name,
        ok: !issues.some((i) => i.level === 'error'),
        initLatencyMs, listLatencyMs, protocolVersion, serverInfo,
        toolCount: tools.length, issues,
        reusedConnection: !!reusable,
      };
      state.reports.unshift(report);
      state.reports = core.capList(state.reports, REPORT_CAP);
      persist(KV.reports, { reports: state.reports });
      return report;
    } catch (e) {
      const report = {
        id: core.newId('rep'), at: new Date().toISOString(), kind: 'external',
        serverId, serverName: p.name, ok: false,
        error: e.message, toolCount: 0, issues: [],
      };
      state.reports.unshift(report);
      state.reports = core.capList(state.reports, REPORT_CAP);
      persist(KV.reports, { reports: state.reports });
      return report;
    } finally {
      if (!reusable) await conn.close().catch(() => {});
    }
  }

  /* ---------- 快照与 diff ---------- */
  async function snapshotToolset(serverId, via) {
    const parsed = parseServerId(serverId);
    let tools = [];
    let serverName = '';
    if (parsed.kind === 'host') {
      const servers = await hostListTools();
      const target = servers.find((s) => `host:${s.server || s.pluginId}` === serverId || s.server === parsed.mcpServerId);
      if (!target) throw new Error(`宿主未注册 MCP server: ${parsed.mcpServerId}`);
      tools = Array.isArray(target.tools) ? target.tools : [];
      serverName = parsed.mcpServerId;
    } else {
      const p = findProfile(parsed.profileId);
      if (!p) throw new Error(`未找到档案 ${parsed.profileId}`);
      serverName = p.name;
      const { conn } = await getOrConnect(parsed.profileId, false);
      tools = await conn.listTools(state.settings.callTimeoutMs);
    }
    let snap = {
      id: core.newId('snap'), at: new Date().toISOString(),
      serverId, serverName, via: via === 'ai' ? 'ai' : 'panel',
      toolCount: tools.length,
      tools: tools.map((t) => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema ?? null })),
      truncated: false,
    };
    if (JSON.stringify(snap).length > 512 * 1024) {
      snap = {
        ...snap,
        truncated: true,
        tools: snap.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: null })),
      };
    }
    state.snapshots.unshift(snap);
    state.snapshots = core.capList(state.snapshots, SNAPSHOT_CAP);
    persist(KV.snapshots, { snaps: state.snapshots });
    return snap;
  }

  async function diffServer(serverId, snapshotId, via) {
    const snaps = state.snapshots.filter((s) => s.serverId === serverId);
    let base = null;
    if (snapshotId) base = state.snapshots.find((s) => s.id === snapshotId) || null;
    else base = snaps[0] || null;
    const current = await snapshotToolset(serverId, via);
    if (!base) {
      return {
        createdSnapshot: true, snapshotId: current.id,
        added: [], removed: [], changed: [], unchangedCount: current.toolCount,
        note: '该服务器此前没有快照，已拍首个快照；下次调用本工具即与它对比',
      };
    }
    const diff = core.diffToolsets(base.tools, current.tools);
    return { createdSnapshot: true, baseSnapshotId: base.id, baseAt: base.at, currentSnapshotId: current.id, ...diff };
  }

  /* ---------- HTTP 基建 ---------- */
  // CORS 回显任意 origin：安全门是 Bearer token（token 只能经宿主桥 cap.kv 读取，
  // 外部页面拿不到；回显 origin 只是为了让宿主 webview / 局域网 Web 端的面板能过预检）。
  // 除 /__health 外所有数据端点都要求 token，因此放宽 origin 不扩大攻击面。
  function corsHeaders(origin) {
    return {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    };
  }

  function timingSafeEq(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  function readBody(req, cap) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > cap) {
          reject(new Error('请求体过大'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) { resolve({}); return; }
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`请求体非 JSON: ${e.message}`)); }
      });
      req.on('error', reject);
    });
  }

  function send(res, status, obj, extraHeaders) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      ...(extraHeaders || {}),
    });
    res.end(body);
  }

  function fail(res, origin, err, status) {
    log.warn(`请求失败: ${err.message}`);
    send(res, status || 200, { ok: false, error: err.message }, corsHeaders(origin));
  }

  /* ---------- 路由 ---------- */
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const cors = corsHeaders(origin);
    const urlObj = new URL(req.url, `http://127.0.0.1:${port}`);
    const route = urlObj.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (route === '/__health') {
      // 宿主 healthCheck 探针：恒 200，用字段表达降级（pocket-drop 先例）
      send(res, 200, { ok: true, service: 'mcp-probe', version: VERSION, degraded: state.degraded }, cors);
      return;
    }

    // token 门（本机服务 + 除探针外全部鉴权）
    const auth = req.headers.authorization || '';
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!presented || !timingSafeEq(presented, token)) {
      send(res, 401, { ok: false, error: '未授权（缺少或不匹配的 Bearer token）' }, cors);
      return;
    }

    try {
      if (req.method === 'GET' && route === '/api/state') {
        send(res, 200, {
          ok: true,
          version: VERSION,
          startedAt: state.startedAt,
          degraded: state.degraded,
          settings: state.settings,
          profiles: state.profiles.map((p) => ({
            ...p,
            env: core.redactValue(p.env),
            headers: core.redactValue(p.headers),
          })),
          pool: poolInfo(),
          counts: {
            history: state.history.length, snapshots: state.snapshots.length, reports: state.reports.length,
          },
        }, cors);
        return;
      }

      if (req.method === 'GET' && route === '/api/host/tools') {
        const servers = await hostListTools();
        send(res, 200, { ok: true, servers }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/host/call') {
        const body = await readBody(req, 2 * 1024 * 1024);
        if (!body.mcpServerId || !body.tool) throw new Error('需要 mcpServerId 与 tool');
        const r = await hostCall(String(body.mcpServerId), String(body.tool), body.arguments);
        const rec = recordHistory({
          serverId: `host:${body.mcpServerId}`, serverName: String(body.mcpServerId),
          tool: String(body.tool), argsText: resultToText(body.arguments || {}),
          resultText: typeof r.resultJson === 'string' ? r.resultJson : resultToText(r.resultJson),
          isError: false, durationMs: r.durationMs, via: body.via, source: 'host',
        });
        send(res, 200, { ok: true, resultJson: r.resultJson, durationMs: r.durationMs, historyId: rec.id }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/profiles/save') {
        const body = await readBody(req, 1024 * 1024);
        const r = saveProfile(body);
        if (r.error) throw new Error(r.error);
        send(res, 200, {
          ok: true,
          profile: { ...r.profile, env: core.redactValue(r.profile.env), headers: core.redactValue(r.profile.headers) },
        }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/profiles/delete') {
        const body = await readBody(req, 64 * 1024);
        const ok = await deleteProfile(String(body.id || ''));
        send(res, 200, { ok, deleted: ok }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/profiles/import-claude') {
        const body = await readBody(req, 64 * 1024);
        const scopes = Array.isArray(body.scopes) && body.scopes.length
          ? body.scopes.filter((s) => SCOPES.includes(s))
          : SCOPES;
        const scan = scanConfigs({ workspace: String(body.workspace || ''), scopes });
        if (!body.apply) {
          send(res, 200, {
            ok: true, found: scan.found, files: scan.files, applied: 0,
            note: '扫描结果未入库；携带 apply:true 与 keys（候选 key 数组，缺省全部）可导入为档案',
          }, cors);
          return;
        }
        const keys = Array.isArray(body.keys) && body.keys.length ? new Set(body.keys) : null;
        let applied = 0;
        const imported = [];
        for (const cand of scan.found) {
          if (keys && !keys.has(cand.key)) continue;
          const existing = state.profiles.find((p) => p.id === `srv-${cand.scope}-${String(cand.name).replace(/[^a-zA-Z0-9_-]+/g, '-')}`);
          const r = saveProfile(candidateToProfile(cand, existing));
          if (!r.error) { applied += 1; imported.push(r.profile.id); }
        }
        send(res, 200, { ok: true, found: scan.found.length, applied, importedIds: imported, files: scan.files }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/connect') {
        const body = await readBody(req, 64 * 1024);
        const parsed = parseServerId(String(body.serverId || ''));
        if (parsed.kind === 'host') {
          const servers = await hostListTools();
          const target = servers.find((s) => `host:${s.server || s.pluginId}` === parsed.mcpServerId
            || s.server === parsed.mcpServerId || s.pluginId === parsed.mcpServerId);
          if (!target) throw new Error(`宿主未注册 MCP server: ${parsed.mcpServerId}（可先 list_plugin_tools 查看）`);
          send(res, 200, {
            ok: true, source: 'host', serverId: `host:${target.server || body.serverId.slice(5)}`,
            tools: target.tools, toolGates: target.toolGates || null, injected: target.injected || '',
          }, cors);
          return;
        }
        const { profile, conn, reused } = await getOrConnect(parsed.profileId, !!body.force);
        send(res, 200, {
          ok: true, source: 'external', serverId: profile.id, reused,
          profile: { ...profile, env: core.redactValue(profile.env), headers: core.redactValue(profile.headers) },
          info: {
            initLatencyMs: conn.initLatencyMs || null, protocolVersion: conn.protocolVersion,
            serverInfo: conn.serverInfo, capabilities: conn.capabilities,
            tools: conn.tools, resources: conn.resources, prompts: conn.prompts,
          },
        }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/disconnect') {
        const body = await readBody(req, 64 * 1024);
        const id = String(body.serverId || '');
        const conn = state.pool.get(id);
        if (conn) {
          await conn.close().catch(() => {});
          state.pool.delete(id);
        }
        send(res, 200, { ok: true, disconnected: !!conn }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/call') {
        const body = await readBody(req, 2 * 1024 * 1024);
        const tool = String(body.tool || '');
        if (!tool) throw new Error('需要 tool');
        const parsed = parseServerId(String(body.serverId || ''));
        if (parsed.kind === 'host') {
          const r = await hostCall(parsed.mcpServerId, tool, body.arguments);
          const rec = recordHistory({
            serverId: `host:${parsed.mcpServerId}`, serverName: parsed.mcpServerId,
            tool, argsText: resultToText(body.arguments || {}),
            resultText: typeof r.resultJson === 'string' ? r.resultJson : resultToText(r.resultJson),
            isError: false, durationMs: r.durationMs, via: body.via, source: 'host',
          });
          send(res, 200, { ok: true, resultJson: r.resultJson, durationMs: r.durationMs, historyId: rec.id }, cors);
          return;
        }
        const { profile, conn } = await getOrConnect(parsed.profileId, false);
        const t0 = Date.now();
        try {
          const result = await conn.callTool(tool, body.arguments, profile.timeoutMs || state.settings.callTimeoutMs);
          const durationMs = Date.now() - t0;
          const isError = !!(result && result.isError);
          const rec = recordHistory({
            serverId: profile.id, serverName: profile.name, tool,
            argsText: resultToText(body.arguments || {}),
            resultText: resultToText(result), isError, durationMs, via: body.via, source: 'external',
          });
          send(res, 200, { ok: true, result, isError, durationMs, historyId: rec.id }, cors);
        } catch (e) {
          const durationMs = Date.now() - t0;
          recordHistory({
            serverId: profile.id, serverName: profile.name, tool,
            argsText: resultToText(body.arguments || {}),
            resultText: `【错误】${e.message}`, isError: true, durationMs, via: body.via, source: 'external',
          });
          throw e;
        }
        return;
      }

      if (req.method === 'POST' && route === '/api/health-check') {
        const body = await readBody(req, 64 * 1024);
        const targets = body.serverId
          ? [String(body.serverId)]
          : [
            ...state.profiles.map((p) => p.id),
          ];
        const reports = [];
        for (const t of targets) {
          // eslint-disable-next-line no-await-in-loop
          reports.push(await healthCheckOne(t));
        }
        send(res, 200, { ok: true, reports }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/snapshot') {
        const body = await readBody(req, 64 * 1024);
        const snap = await snapshotToolset(String(body.serverId || ''), body.via);
        send(res, 200, { ok: true, snapshot: snap }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/diff') {
        const body = await readBody(req, 64 * 1024);
        const r = await diffServer(String(body.serverId || ''), body.snapshotId ? String(body.snapshotId) : '', body.via);
        send(res, 200, { ok: true, ...r }, cors);
        return;
      }

      if (req.method === 'GET' && route === '/api/history') {
        const limit = clampInt(urlObj.searchParams.get('limit'), 1, HISTORY_CAP, 50);
        const serverId = urlObj.searchParams.get('serverId') || '';
        const tool = urlObj.searchParams.get('tool') || '';
        let calls = state.history;
        if (serverId) calls = calls.filter((c) => c.serverId === serverId);
        if (tool) calls = calls.filter((c) => c.tool === tool);
        send(res, 200, { ok: true, calls: calls.slice(0, limit), total: calls.length }, cors);
        return;
      }

      if (req.method === 'POST' && route === '/api/history/clear') {
        const n = state.history.length;
        state.history = [];
        await persist(KV.history, { calls: [] });
        send(res, 200, { ok: true, cleared: n }, cors);
        return;
      }

      if (req.method === 'GET' && route === '/api/snapshots') {
        send(res, 200, { ok: true, snapshots: state.snapshots }, cors);
        return;
      }

      if (req.method === 'GET' && route === '/api/reports') {
        send(res, 200, { ok: true, reports: state.reports }, cors);
        return;
      }

      send(res, 404, { ok: false, error: `未知路由 ${req.method} ${route}` }, cors);
    } catch (e) {
      fail(res, origin, e instanceof Error ? e : new Error(String(e)));
    }
  });

  /* ---------- 生命周期 ---------- */
  server.on('error', (e) => {
    log.error(`HTTP server 错误: ${e.message}`);
    if (e.code === 'EADDRINUSE') process.exit(3);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`收到 ${signal}，开始优雅退出`);
    for (const [id, conn] of state.pool) {
      try { await conn.close(); } catch (_) { /* ignore */ }
      state.pool.delete(id);
    }
    try { await kv.kvDel(KV.meta); } catch (_) { /* 离线则留给下次启动覆盖 */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (e) => log.error(`uncaughtException（不退出）: ${e.stack || e.message}`));
  process.on('unhandledRejection', (e) => log.error(`unhandledRejection（不退出）: ${e instanceof Error ? e.stack || e.message : String(e)}`));

  // 空闲连接回收：15 分钟未使用的 stdio 子进程主动断开，防孤儿堆积
  setInterval(() => {
    const now = Date.now();
    for (const [id, conn] of state.pool) {
      if (!conn.isHttp && conn.lastUsedAt && now - conn.lastUsedAt > IDLE_DISCONNECT_MS) {
        log.info(`连接 ${id} 空闲超过 ${IDLE_DISCONNECT_MS / 60000} 分钟，主动断开`);
        conn.close().catch(() => {});
        state.pool.delete(id);
      }
    }
  }, IDLE_SWEEP_MS).unref();

  /* ---------- 启动 ---------- */
  (async () => {
    await loadState();
    await publishMeta();
    server.listen(port, '127.0.0.1', () => {
      log.info(`mcp-probe 服务就绪: 127.0.0.1:${port} (pid=${process.pid}, profiles=${state.profiles.length})`);
    });
  })();
}

main();
