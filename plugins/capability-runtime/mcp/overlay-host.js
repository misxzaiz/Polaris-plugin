'use strict';
/**
 * capability-runtime — 桌面浮窗（输入悬浮）宿主
 *
 * 形态：Edge/Chrome --app 模式独立窗口（独立临时 profile），TopMost 由常驻 PowerShell
 * 窗口控制器（win/overlay-host.ps1，Per-Monitor DPI aware）定位与置顶。
 *
 * 安全链路：
 *  - HTTP 仅绑定 127.0.0.1 + Host 头校验（防 DNS rebinding / 局域网可达）
 *  - 首启 URL 只带一次性 bootstrap code（TTL 60s 单次消费），换页内 session token；
 *    之后 POST 全走 Authorization: Bearer（no-cors 简单请求写不了自定义头 → 外站伪造输入失败）
 *  - SSE 只读（stream grant 单次、绑 overlay id）
 *  - 每 overlay 页面头固定「Polaris AI 浮窗 · AI 生成」横幅与 reason（AI 必须说明为什么需要输入）
 *  - 输入框禁 password 类型；内容渲染全走 textContent / DOM API，不信任 HTML
 *
 * 生命周期不变式：每个 wait 都有终态（submitted / closed / timeout / force_closed），
 * 无一例外的最长等待 ≤300s。
 */

const http = require('http');
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { log, randomToken, errorMessage, sleep, rmrf, sha256, safeParse } = require('./util');

const MAX_OVERLAYS = 3;
const WAIT_TIMEOUT_MAX = 300;

class OverlayHost {
  /**
   * @param {{maxOverlays?: number, onAudit?: (e:object)=>void, profileTag?: string}} opts
   *   profileTag：临时 profile 目录命名空间（建议 = home 指纹）。多实例共用 tmp 时避免
   *   「实例 A 关停把实例 B 的活动浮窗 profile 当作自己的一并清掉」。
   */
  constructor(opts = {}) {
    this.maxOverlays = opts.maxOverlays || MAX_OVERLAYS;
    this._auditor = opts.onAudit || (() => {});
    this._profileTag = (typeof opts.profileTag === 'string' && /^[\w-]{1,16}$/.test(opts.profileTag)) ? opts.profileTag : 'shared';
    this.overlays = new Map(); // id → overlay record
    this._muxSeq = 0;
    this._server = null;
    this._port = 0;
    this._controller = null;  // PowerShell 常驻窗口控制器
    this._stopped = false;
    this._browserPath = null;
    this._bootcodes = new Map(); // cb → {overlayId, exp}
  }

  get activeCount() {
    return this.overlays.size;
  }

  // ── HTTP server ───────────────────────────────────────────────────────────
  start() {
    return new Promise(async (resolve, reject) => {
      this._server = http.createServer((req, res) => {
        // 套接字层错误：中断/畸形请求是常态，静默防 stderr 噪声（P2-13）
        req.on('error', () => {});
        res.on('error', () => {});
        this._http(req, res).catch((e) => {
          log(`overlay http 异常: ${errorMessage(e)}`);
          try {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('internal');
          } catch (_) { /* 忽略 */ }
        });
      });
      // HTTP 解析器层错误（畸形请求行等）：避免默认堆栈打印噪声（P2-13）
      this._server.on('clientError', (err, socket) => {
        try { socket.destroy(); } catch (_) { /* 忽略 */ }
      });
      // Windows 预热窗口控制器（后台尽力，首个浮窗不用付冷启动延迟）
      if (process.platform === 'win32') {
        this._ensureController().then((c) => { if (c) { /* 就绪日志在 _ensureController 内 */ } }).catch(() => {});
      }
      let lastErr = null;
      for (let i = 0; i < 12; i++) {
        let port = 47000 + Math.floor(Math.random() * 1000);
        try {
          await new Promise((r, j) => {
            const onErr = (e) => { this._server.removeAllListeners('listening'); j(e); };
            this._server.once('listening', () => { this._server.removeListener('error', onErr); r(); });
            this._server.once('error', onErr);
            this._server.listen(port, '127.0.0.1');
          });
          this._port = port;
          log(`overlay http server: http://127.0.0.1:${port} (maxOverlays=${this.maxOverlays})`);
          return resolve();
        } catch (e) {
          lastErr = e;
          await sleep(60);
        }
      }
      reject(lastErr || new Error('overlay http 绑定失败'));
    });
  }

  async stop() {
    if (this._stopped) return;
    this._stopped = true;
    const ids = [...this.overlays.keys()];
    for (const id of ids) {
      await this.close(id, 'server_shutdown').catch(() => {});
    }
    if (this._server) this._server.close();
    if (this._controller) {
      try { this._controller.child.stdin.write(JSON.stringify({ op: 'exit' }) + '\n'); } catch (_) { /* 忽略 */ }
      try { this._controller.child.kill(); } catch (_) { /* 忽略 */ }
      this._controller = null;
    }
    await this._sweepProfiles(Date.now() - 1000); // 退出前清临时 profile
  }

  /** 清理 tmp 下本命名空间的 capov-<tag>-* 临时 profile（晚于 cutoff 仍存在的不动，避免误伤仍被使用的） */
  async _sweepProfiles(cutoffMs) {
    const prefix = `capov-${this._profileTag}-`;
    try {
      const entries = await fsp.readdir(os.tmpdir());
      for (const name of entries) {
        if (!name.startsWith(prefix)) continue;
        try {
          const st = await fsp.stat(path.join(os.tmpdir(), name));
          if (st.mtimeMs < cutoffMs) await rmrf(path.join(os.tmpdir(), name));
        } catch (_) { /* 其它进程正在用或已删 */ }
      }
    } catch (_) { /* 忽略 */ }
  }

  // ── 路由 ──────────────────────────────────────────────────────────────────
  _http(req, res) {
    return this._guard(req, res, async () => {
      const u = new URL(req.url, `http://127.0.0.1:${this._port}`);
      const parts = u.pathname.split('/').filter(Boolean); // ['ov', id, action?]
      if (parts[0] !== 'ov') return this._send(res, 404, 'not found');
      const id = parts[1] || '';
      const action = parts[2] || '';

      if (!this._hostOk(req)) return this._send(res, 403, `bad host: ${req.headers.host || '(none)'}`);
      if (req.method === 'GET' && !action) return this._pageBootstrap(req, id, u, res);
      if (req.method === 'POST' && action === 'stream') return this._grantStream(id, req, res);
      if (req.method === 'GET' && action === 'stream') return this._sseSend(id, u, res);
      if (req.method === 'POST' && action === 'submit') return this._submit(id, req, res);
      if (req.method === 'POST' && action === 'closeme') return this._closeFromPage(id, req, res);
      if (req.method === 'POST' && action === 'ack') return this._ack(id, req, res); // 页面加载完成确认（用于自动定位窗口后的状态推送）
      return this._send(res, 404, 'not found');
    });
  }

  _guard(req, res, fn) { return fn(); }

  _send(res, code, text) {
    res.writeHead(code, { 'Content-Type': `${code < 300 ? 'text' : 'text'}/${code < 300 ? 'html' : 'plain'}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(text);
  }

  _originOk(req) {
    const origin = req.headers.origin || '';
    if (!origin || origin === `http://127.0.0.1:${this._port}`) return true;
    return false;
  }

  _hostOk(req) {
    const host = req.headers.host || '';
    return host === `127.0.0.1:${this._port}`;
  }

  _sessionOk(req, id) {
    const ov = this.overlays.get(id);
    if (!ov || ov.closed) return false;
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return false;
    return auth.slice(7) === ov.session;
  }

  // ── 页面 bootstrap ────────────────────────────────────────────────────────
  async _pageBootstrap(req, id, u, res) {
    if (!this._hostOk(req)) return this._send(res, 403, 'bad host');
    const cb = u.searchParams.get('cb') || '';
    const rec = this._bootcodes.get(cb);
    this._bootcodes.delete(cb); // 单次消费
    if (!rec || rec.overlayId !== id || Date.now() > rec.exp) {
      return this._send(res, 403, '<html><body><p style="font:13px system-ui">引导码无效或已过期（该浮窗已被消费或超时）。请重新由 AI 创建浮窗。</p></body></html>');
    }
    const ov = this.overlays.get(id);
    if (!ov) return this._send(res, 404, 'not found');
    const html = buildOverlayPage({ overlay: ov, session: ov.session, port: this._port });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self http://127.0.0.1'; img-src 'none'; frame-ancestors 'none'",
    });
    res.end(html);
    await this._auditor({ event: 'overlay_open', id });
    this._watchWindow(id).catch((e) => log(`浮窗 ${id} 定位失败（仍可用）: ${errorMessage(e)}`));
  }

  // ── 流授权 / SSE ──────────────────────────────────────────────────────────
  async _grantStream(id, req, res) {
    let body = await readBody(req, 4096);
    body = safeParse(body, {});
    if (!body || typeof body !== 'object') return this._send(res, 400, 'bad');
    if (!this._hostOk(req) || !this._originOk(req)) return this._send(res, 403, 'bad origin/host');
    if (!this._sessionOk(req, id)) return this._send(res, 403, 'expired');
    const ov = this.overlays.get(id);
    const g = randomToken(16);
    ov.streamGrants.add(g);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ g, since: ov.eventSeq }));
  }

  async _sseSend(id, u, res) {
    const g = u.searchParams.get('g') || '';
    const since = Math.max(Number(u.searchParams.get('since')) || 0, 0);
    const ov = this.overlays.get(id);
    if (!ov || !ov.streamGrants.has(g) || ov.closed) return this._send(res, 403, 'expired');
    ov.streamGrants.delete(g); // 单次
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    ov.sseRes = res;
    res.write(`retry: 1200\n\n`);
    // 全量补齐
    for (const ev of ov.events) {
      if (ev.seq > since) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    // 心跳保活
    const hb = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) { clearInterval(hb); }
    }, 500);
    const finish = () => {
      clearInterval(hb);
      if (ov.sseRes === res) ov.sseRes = null;
      try { res.end(); } catch (_) { /* 忽略 */ }
    };
    res.on('close', finish);
    res.on('finish', finish);
  }

  _pushEvent(ov, ev) {
    ov.eventSeq++;
    ev.seq = ov.eventSeq;
    ov.events.push(ev);
    ov._eventsBytes = (ov._eventsBytes || 0) + _eventBytes(ev);
    while (ov.events.length > 100) {
      ov._eventsBytes -= _eventBytes(ov.events.shift() || {});
    }
    // ring 字节节流：大 content 快照（单条最高 ~400KB）连推会吃掉几十兆内存（P2-14）
    const RING_BYTES_MAX = 2 * 1024 * 1024;
    while (ov._eventsBytes > RING_BYTES_MAX && ov.events.length > 1) {
      ov._eventsBytes -= _eventBytes(ov.events.shift() || {});
    }
    if (ov.sseRes) {
      try { ov.sseRes.write(`data: ${JSON.stringify(ev)}\n\n`); } catch (_) { ov.sseRes = null; }
    }
  }

  // ── 提交 / 关闭（页面侧） ─────────────────────────────────────────────────
  async _submit(id, req, res) {
    const text = await readBody(req, 64 * 1024);
    const data = safeParse(text, null);
    if (!data) return this._send(res, 400, 'bad');
    if (!this._hostOk(req) || !this._originOk(req)) return this._send(res, 403, 'bad origin/host');
    if (!this._sessionOk(req, id)) return this._send(res, 403, 'expired');
    const ov = this.overlays.get(id);
    if (!ov || ov.mode !== 'input' || ov.closed) return this._send(res, 409, JSON.stringify({ reason: 'overlay_stale' }));
    const value = String(data.value || '').slice(0, 100000);
    this._resolveInput(ov, value);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, gen: ov.gen }));
  }

  /** 输入事件落地：晚到的提交也会进 ring（下一次 wait 直接消费） */
  _resolveInput(ov, value) {
    ov.gen++;
    ov.lastInputs.push({ gen: ov.gen, value, ts: new Date().toISOString() });
    if (ov.lastInputs.length > 10) ov.lastInputs.splice(0, ov.lastInputs.length - 10);
    const info = windowInfo(ov);
    this._pushEvent(ov, { type: 'content', payload: contentSnapshot(ov) });
    const waiters = ov.waiters.filter((w) => w.waitFor === 'input' && w.gen < ov.gen);
    for (const w of waiters) {
      removeWaiter(ov, w);
      clearTimeout(w.timer);
      w.resolve({ status: 'submitted', value, id: ov.id, window: info, gen: ov.gen });
    }
    log(`浮窗 ${ov.id} 收到输入 (gen=${ov.gen}, ${value.length} 字符)`);
    if (!ov.keepOpen) {
      // 默认提交后自动收窗（后台异步，避免阻塞 HTTP 应答）
      setTimeout(() => this.close(ov.id, 'submitted').catch(() => {}), 250);
    }
  }

  async _closeFromPage(id, req, res) {
    if (!this._hostOk(req) || !this._originOk(req)) return this._send(res, 403, 'bad origin/host');
    const body = await readBody(req, 128 * 1024);
    const data = safeParse(body, {});
    // 未提交答案作为 partial 附加（AI 有机会接续上下文）
    let ov = this.overlays.get(id);
    if (ov && data && typeof data.partial === 'string' && data.partial) {
      ov.partialInput = String(data.partial).slice(0, 100000);
    }
    this._send(res, 200, JSON.stringify({ ok: true }));
    await this.close(id, 'user_close_from_page');
  }

  async _ack(id, req, res) {
    if (!this._hostOk(req) || !this._originOk(req)) return this._send(res, 403, 'bad origin/host');
    if (!this._sessionOk(req, id)) return this._send(res, 403, 'expired');
    const ov = this.overlays.get(id);
    this._send(res, 200, JSON.stringify({ ok: true }));
    // ack 后若窗口已定位好，请求回执使顶部横幅的（DPI、位置）信息不再重要
    log(`浮窗 ${id} 页面加载完成`);
  }

  // ── 调用入口（registry / meta tools） ──────────────────────────────────────
  /**
   * 创建浮窗（show / input）。返回 waiters 语义决定的最终态。
   * 传参（约束后）：
   *   { mode, title, reason?, message?, htmlOrText?, placeholder?, preset?, submitLabel?, keepOpen?, geometry?, timeoutSec? }
   */
  async create(spec, { owner = 'host' } = {}) {
    if (this.overlays.size >= this.maxOverlays) {
      const actives = [...this.overlays.values()].map((o) => `${o.id} mode=${o.mode} title=${o.title} created=${o.createdAt} owner=${o.owner}`);
      const e = new Error(`浮窗已达上限 ${this.maxOverlays}。当前活动: ${actives.join(' ; ')}。请先 cap_overlay_close 关闭不需要的浮窗`);
      e.capCode = 'overlay_limit';
      throw e;
    }
    // id 碰撞防御：genId 极小概率退化到 fallback 常量，绝不覆盖已有浮窗（P2-3 红队整改）
    let id = genId();
    while (this.overlays.has(id)) id = genId();
    const mode = spec.mode === 'input' ? 'input' : 'show';
    const geometry = normalizeGeometry(spec.geometry);
    const waitSec = Math.min(Math.max(Number(spec.timeoutSec) || (mode === 'input' ? 120 : 30), 5), WAIT_TIMEOUT_MAX);

    const ov = {
      id,
      mode,
      owner,
      title: strClamp(spec.title || (mode === 'input' ? '需要你的输入' : '提示'), 120),
      reason: strClamp(spec.reason || '', 300),
      message: strClamp(spec.message || '', 2000),
      placeholder: strClamp(spec.placeholder || '在此输入…', 200),
      preset: strClamp(spec.preset || '', 100000),
      submitLabel: strClamp(spec.submitLabel || (mode === 'input' ? '提交' : '确定'), 40),
      keepOpen: !!spec.keepOpen,
      geometry,
      htmlContent: spec.html !== undefined ? strClamp(spec.html, 400000) : null,
      textContent: spec.text !== undefined ? strClamp(spec.text, 400000) : null,
      session: randomToken(24),
      cb: randomToken(18),
      events: [],
      eventSeq: 0,
      gen: 0,               // 输入事件代际（resolve 过一次就 +1）
      lastInputs: [],       // [{gen, value, ts}]（晚到的提交也能被下一次 wait 消费）
      waiters: [],          // [{waitFor, resolve, timer}]
      streamGrants: new Set(),
      sseRes: null,
      closed: false,
      closeReason: null,
      located: false,
      hwnd: null,
      createdAt: new Date().toISOString(),
      profileDir: path.join(os.tmpdir(), `capov-${this._profileTag}-${id}`),
      child: null,
      autoCloseTimer: null,
    };
    this.overlays.set(id, ov);
    this._bootcodes.set(ov.cb, { overlayId: id, exp: Date.now() + 60000 });

    // 内存快照事件（初始内容）
    this._pushEvent(ov, { type: 'content', payload: contentSnapshot(ov) });

    // 启动浏览器
    await this._launchBrowser(ov, waitSec).catch((e) => {
      // 结构化失败：不留半死窗口（bootcode 一并注销，防泄漏；P2-14）
      this.overlays.delete(id);
      this._bootcodes.delete(ov.cb);
      throw e;
    });

    // 输入型：等待提交（带超时的绝对保证）
    if (mode === 'input') {
      // 浏览器进程在启动期就秒退（坏参数/环境）——close 已把 closed 打上；不能再挂 waiter（P2-2 红队整改）
      if (ov.closed) {
        return { status: 'closed', id, reason: ov.closeReason, window: windowInfo(ov) };
      }
      return await new Promise((resolve) => {
        const waiter = {
          waitFor: 'input',
          gen: ov.gen,
          resolve: (result) => resolve(result),
        };
        ov.waiters.push(waiter);
        waiter.timer = setTimeout(() => {
          removeWaiter(ov, waiter);
          log(`浮窗 ${id} 等待输入超时 (${waitSec}s)`);
          // 超时即收窗（不留僵尸窗；用户主动输入过则 close 会作为晚到输入入 ring）
          this.close(id, 'wait_timeout').catch(() => {});
          resolve({
            status: 'timeout',
            id,
            window: windowInfo(ov),
            message: `用户 ${waitSec}s 内未提交。可选择再次调用（同参数）或改走其他路径。`,
          });
        }, waitSec * 1000);
        // 已有晚到的输入直接消费
        const pendingInput = ov.lastInputs.find((i) => i.gen > waiter.gen);
        if (pendingInput) {
          removeWaiter(ov, waiter);
          clearTimeout(waiter.timer);
          resolve({ status: 'submitted', value: pendingInput.value, id, window: windowInfo(ov), lateDelivered: true });
        }
      });
    }
    // show 型：waitSec 到点自动关闭，返回创建回执
    if (!ov.keepOpen) {
      ov.autoCloseTimer = setTimeout(() => {
        this.close(id, 'auto_closed').catch(() => {});
      }, waitSec * 1000);
    }
    return { status: 'created', id, window: windowInfo(ov) };
  }

  /** meta 工具：对已存在的浮窗等待输入 */
  async wait(id, { timeoutSec, waitFor = 'input' } = {}) {
    const ov = this.overlays.get(id);
    if (!ov || ov.closed) {
      const e = new Error(`浮窗 ${id} 不存在或已关闭`);
      e.capCode = 'unknown_overlay';
      throw e;
    }
    const waitMs = Math.min(Math.max(Number(timeoutSec) || 120, 5), WAIT_TIMEOUT_MAX) * 1000;
    return await new Promise((resolve) => {
      const waiter = { waitFor, gen: ov.gen, resolve };
      ov.waiters.push(waiter);
      waiter.timer = setTimeout(() => {
        removeWaiter(ov, waiter);
        resolve({ status: 'timeout', id, window: windowInfo(ov), message: `等待 ${Math.round(waitMs / 1000)}s 超时` });
      }, waitMs);
      if (ov.lastInputs.find((i) => i.gen > waiter.gen)) {
        const last = ov.lastInputs[ov.lastInputs.length - 1];
        removeWaiter(ov, waiter);
        clearTimeout(waiter.timer);
        resolve({ status: 'submitted', value: last.value, id, window: windowInfo(ov), lateDelivered: true });
      }
    });
  }

  /** 更新（内容/标题/geometry） */
  async update(id, patch = {}) {
    const ov = this.overlays.get(id);
    if (!ov || ov.closed) {
      const e = new Error(`浮窗 ${id} 不存在或已关闭`);
      e.capCode = 'unknown_overlay';
      throw e;
    }
    if (patch.title !== undefined) { ov.title = strClamp(patch.title, 120); }
    if (patch.reason !== undefined) { ov.reason = strClamp(patch.reason, 300); }
    if (patch.message !== undefined) { ov.message = strClamp(patch.message, 2000); }
    if (patch.html !== undefined || patch.text !== undefined) {
      ov.contentLegacy = undefined;
      ov.htmlContent = patch.html !== undefined ? strClamp(patch.html, 400000) : null;
      ov.textContent = patch.text !== undefined ? strClamp(patch.text, 400000) : null;
    } else if (ov.mode === 'input' && patch.preset !== undefined) {
      ov.preset = strClamp(patch.preset, 100000);
    }
    if (patch.geometry !== undefined) {
      const g = normalizeGeometry(patch.geometry);
      if (g.w) ov.geometry.w = g.w;
      if (g.h) ov.geometry.h = g.h;
      if (g.x !== undefined) ov.geometry.x = g.x;
      if (g.y !== undefined) ov.geometry.y = g.y;
      await this._placeWindow(ov).catch(() => {});
    }
    this._pushEvent(ov, { type: 'content', payload: contentSnapshot(ov) });
    return { status: 'updated', id, window: windowInfo(ov) };
  }

  async close(id, reason = 'closed') {
    const ov = this.overlays.get(id);
    if (!ov || ov.closed) return { ok: true, alreadyClosed: true };
    ov.closed = true;
    ov.closeReason = reason;
    this.overlays.delete(id);
    for (const cb of [...this._bootcodes.entries()]) {
      if (cb[1].overlayId === id) this._bootcodes.delete(cb[0]);
    }
    // resolve 全部等待者
    const waiters = [...ov.waiters];
    ov.waiters.length = 0;
    for (const w of waiters) {
      clearTimeout(w.timer);
      // 部分输入：用户打了字但没提交 —— 尽力还原
      w.resolve({ status: 'closed', reason, id, window: windowInfo(ov), partialInput: ov.partialInput || null });
    }
    if (ov.autoCloseTimer) clearTimeout(ov.autoCloseTimer);
    if (ov.sseRes) {
      try {
        this._pushEvent(ov, { type: 'shutdown', reason });
        await sleep(150); // 给 SSE flush 一个短窗口
      } catch (_) { /* 忽略 */ }
    }
    if (ov.child && ov.child.pid) {
      try { ov.child.kill(); } catch (_) { /* 忽略 */ }
      // 等 exit（最多 4s），清 profile
      const done = new Promise((r) => {
        if (!ov.child) return r();
        ov.child.once('exit', () => r());
        setTimeout(() => r(), 4000);
      });
      await done;
    }
    await rmrf(ov.profileDir).catch(() => {});
    if (ov.controllerWatch) {
      try { this._controllerSend({ op: 'release', hwnd: ov.hwnd }); } catch (_) { /* 忽略 */ }
    }
    await this._auditor({ event: 'overlay_close', id, reason });
    log(`浮窗 ${id} 已关闭 (${reason})`);
    return { ok: true, id, reason };
  }

  list({ selfId = null } = {}) {
    const entities = [...this.overlays.values()].map((o) => ({
      id: o.id,
      mode: o.mode,
      title: o.title,
      reason: o.reason,
      owner: o.owner,
      createdAt: o.createdAt,
      located: o.located,
      geometry: o.geometry,
      gensSubmitted: o.gen,
      lastInputPreview: o.lastInputs.length ? String(o.lastInputs[o.lastInputs.length - 1].value).slice(0, 80) : null,
      waiters: o.waiters.length,
    }));
    if (selfId !== null) {
      for (const e of entities) e.yours = e.owner === selfId;
    }
    return entities;
  }

  getPort() { return this._port; }

  // ── 浏览器与窗口控制 ──────────────────────────────────────────────────────
  async _resolveBrowser() {
    if (this._browserPath) return this._browserPath;
    const candidates = [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe') : null,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Google/Chrome/Application/chrome.exe') : null,
    ].filter(Boolean);
    for (const p of candidates) {
      try {
        const st = await fsp.stat(p);
        if (st.isFile() && st.size > 100 * 1024) { // 排除 WindowsApps 0 字节 stub
          this._browserPath = p;
          return p;
        }
      } catch (_) { /* 忽略 */ }
    }
    const e = new Error('未找到可用的 Edge/Chrome（探测了 Program Files 与 LocalAppData 常见路径）。浮窗能力需要桌面浏览器内核');
    e.capCode = 'browser_unavailable';
    throw e;
  }

  async _launchBrowser(ov, waitSec) {
    const browser = await this._resolveBrowser();
    const url = `http://127.0.0.1:${this._port}/ov/${ov.id}?cb=${encodeURIComponent(ov.cb)}`;
    const args = [
      `--app=${url}`,
      `--user-data-dir=${ov.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--no-proxy-server',
      '--disable-features=msStartupBoost',
      `--window-size=${ov.geometry.w},${ov.geometry.h}`,
    ];
    if (ov.geometry.x !== undefined) args.push(`--window-position=${ov.geometry.x},${ov.geometry.y}`);
    await fsp.mkdir(ov.profileDir, { recursive: true });

    const child = spawn(browser, args, {
      stdio: 'ignore',
      windowsHide: false,
      detached: false,
    });
    ov.child = child;
    let started = false;
    child.once('spawn', () => { started = true; log(`浮窗进程 ${child.pid} 启动`); });
    child.once('error', (e) => log(`浮窗进程启动失败: ${errorMessage(e)}`));
    child.once('exit', () => {
      if (!ov.closed) {
        this.close(ov.id, 'browser_exit').catch(() => {});
      }
    });
    // 3s 无 spawn 事件视为失败（结构化回错）
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!started) {
          this.close(ov.id, 'spawn_fail').catch(() => {});
          reject(capT('overlay_spawn_fail', '浏览器进程未能启动（3s 内无 spawn 事件）'));
        } else resolve();
      }, 3000);
      child.once('spawn', () => { clearTimeout(timer); resolve(); });
      child.once('error', (e) => {
        clearTimeout(timer);
        this.close(ov.id, 'spawn_fail').catch(() => {});
        reject(capT('overlay_spawn_fail', `浏览器启动失败: ${e.message}`));
      });
    });
  }

  async _watchWindow(ovId) {
    const ov = this.overlays.get(ovId);
    if (!ov || ov.closed) return;
    if (process.platform !== 'win32') {
      log(`浮窗窗口控制仅在 Windows 支持（当前 ${process.platform}）—— 窗口可用但不可自动置顶/精确定位`);
      return;
    }
    const ctrl = await this._ensureController();
    if (!ctrl) return;
    // 页面 title: PolarisOV#<nonce>（服务器注入）
    const titlePrefix = 'PolarisOV#';
    const rootPid = ov.child && ov.child.pid;
    if (!rootPid) return;
    const resp = await this._controllerSend({ op: 'watch', rootPid, titlePrefix }, 15000);
    if (!resp || !resp.found || ov.closed) return;
    ov.hwnd = resp.hwnd;
    ov.located = true;
    await this._placeWindow(ov);
  }

  async _placeWindow(ov) {
    const ctrl = await this._ensureController();
    if (!ctrl || !ov.hwnd) return;
    const g = ov.geometry;
    await this._controllerSend({ op: 'place', hwnd: ov.hwnd, x: g.x, y: g.y, w: g.w, h: g.h, topmost: true });
  }

  _ensureController() {
    if (process.platform !== 'win32') return null;
    if (this._controller && this._controller.alive) return this._controller;
    return new Promise((resolve) => {
      const psScript = path.join(__dirname, 'win', 'overlay-host.ps1');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdin.setEncoding('utf8');
      const ctl = {
        alive: true,
        child,
        seq: 0,
        pending: new Map(),
        buffer: '',
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        ctl.buffer += chunk;
        let idx;
        while ((idx = ctl.buffer.indexOf('\n')) >= 0) {
          const line = ctl.buffer.slice(0, idx).trim();
          ctl.buffer = ctl.buffer.slice(idx + 1);
          if (!line) continue;
          const msg = safeParse(line, null);
          if (!msg || !msg.seq) continue;
          const p = ctl.pending.get(msg.seq);
          if (p) {
            ctl.pending.delete(msg.seq);
            clearTimeout(p.timer);
            p.resolve(msg);
          }
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => process.stderr.write(`[overlay-ctrl] ${d}`));
      child.once('exit', () => {
        ctl.alive = false;
        this._controller = null;
        const pend = [...ctl.pending.values()];
        for (const p of pend) { clearTimeout(p.timer); p.resolve(null); }
      });
      child.once('error', () => {
        ctl.alive = false;
        this._controller = null;
        resolve(null); // 控制器失败 → 浮窗仍可用（无置顶）
      });
      // 握手
      const hand = this._ctlSendOnce(ctl, { op: 'hello' }, 6000);
      hand.then((r) => {
        if (r && r.ok) {
          this._controller = ctl;
          log('窗口控制器已就绪 (powershell)');
          resolve(ctl);
        } else {
          resolve(null);
        }
      });
    });
  }

  _ctlSendOnce(ctl, payload, timeoutMs) {
    return new Promise((resolve) => {
      const seq = ++ctl.seq;
      const timer = setTimeout(() => {
        ctl.pending.delete(seq);
        resolve(null);
      }, timeoutMs);
      ctl.pending.set(seq, { resolve, timer });
      try {
        ctl.child.stdin.write(JSON.stringify({ seq, ...payload }) + '\n');
      } catch (_) {
        clearTimeout(timer);
        ctl.pending.delete(seq);
        resolve(null);
      }
    });
  }

  _controllerSend(payload, timeoutMs = 8000) {
    const ctl = this._controller;
    if (!ctl) return Promise.resolve(null);
    return this._ctlSendOnce(ctl, payload, timeoutMs);
  }
}

// 模块级便捷 alias（overlay ctx 里给 module 用）
function capT(code, message) {
  const e = new Error(message);
  e.capCode = code;
  return e;
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────
function genId() {
  return randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'ovfloat';
}

function strClamp(v, n) {
  return String(v ?? '').slice(0, n);
}

/** ring 字节计费：序列化长度（大 HTML 快照是 ring 的内存大头） */
function _eventBytes(ev) {
  try { return JSON.stringify(ev).length; } catch (_) { return 0; }
}

function normalizeGeometry(g = {}) {
  // 允许负 x/y：副屏可位于主屏左/上（多显示器布局），非法值仍归一为 undefined（P2-14）
  const scr = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  };
  return {
    x: scr(g.x),
    y: scr(g.y),
    w: Math.min(Math.max(Number(g.w) || 420, 180), 1600),
    h: Math.min(Math.max(Number(g.h) || 320, 120), 1200),
  };
}

function contentSnapshot(ov) {
  return {
    mode: ov.mode,
    title: ov.title,
    reason: ov.reason,
    message: ov.message,
    placeholder: ov.placeholder,
    preset: ov.preset,
    submitLabel: ov.submitLabel,
    keepOpen: ov.keepOpen,
    htmlContent: ov.htmlContent || null,
    textContent: ov.textContent || null,
    geometry: ov.geometry,
    gen: ov.gen,
  };
}

function windowInfo(ov) {
  return {
    id: ov.id,
    mode: ov.mode,
    title: ov.title,
    located: ov.located,
    geometry: ov.geometry,
    owner: ov.owner,
  };
}

function removeWaiter(ov, waiter) {
  const i = ov.waiters.indexOf(waiter);
  if (i >= 0) ov.waiters.splice(i, 1);
}

function readBody(req, maxBytes) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

// ── 浮窗页面（生产模板） ─────────────────────────────────────────────────────
/**
 * HTML 内嵌安全 JSON 字符串：</script> / <script / U+2028/U+2029 全部转成 \uXXXX 转义。
 * 模板里的 <script> 块嵌的是 AI/模块可控文本 —— 不转义会让 payload 闭合标签执行任意
 * 页内 JS（包括 var SESSION 偷 token），整条 Bearer 模型失效。
 */
function jstrHtml(v) {
  return JSON.stringify(v === undefined ? null : v)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildOverlayPage({ overlay, session, port }) {
  const isInput = overlay.mode === 'input';
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'">
<title>PolarisOV#${overlay.id}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; font: 13px/1.5 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif; }
  #frame { display:flex; flex-direction:column; height:100%; }
  #banner { flex:0 0 auto; padding:8px 14px; background:#0b2e4d; color:#dbeaff; font-size:12px; user-select:none; }
  #banner b { color:#fff; font-weight:600; }
  #banner .tag { display:inline-block; margin-left:8px; padding:1px 8px; border:1px solid #4b7ab5; border-radius:10px; background:transparent; color:#9cc4ef; font-size:11px; }
  #content { flex:1 1 auto; overflow:auto; padding:14px 16px; background: var(--bg, #ffffff); color:#1c1c1e; white-space:pre-wrap; word-break:break-word; }
  #composer { flex:0 0 auto; border-top:1px solid #d0d3d8; background:#f6f7f9; padding:10px 12px; }
  #inputRow { display:flex; gap:8px; }
  #inputBox { flex:1; min-height:64px; max-height:40vh; padding:8px 10px; border:1px solid #c6c9ce; border-radius:8px; font:inherit; resize:vertical; background:#fff; color:#1c1c1e; }
  #submitBtn { flex:0 0 auto; padding:8px 18px; border:none; border-radius:8px; background:#1f6feb; color:#fff; font:inherit; cursor:pointer; }
  #submitBtn[disabled] { background:#8aa3c4; cursor:default; }
  #cancelBtn { flex:0 0 auto; padding:8px 12px; border:1px solid #c6c9ce; border-radius:8px; background:transparent; color:#494b50; font:inherit; cursor:pointer; }
  .hint { margin-top:6px; font-size:11px; color:#5d626a; user-select:none; }
  .esc { outline: 2px solid #1f6feb; outline-offset: -2px; }
</style>
</head>
<body>
<div id="frame">
  <div id="banner">
    <b>Polaris AI 浮窗</b><span class="tag">AI 生成内容</span>
  </div>
  <div id="content"></div>
  ${isInput ? `<div id="composer">
      <div id="inputRow">
        <textarea id="inputBox"></textarea>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button id="submitBtn"></button>
          <button id="cancelBtn">关闭</button>
        </div>
      </div>
      <div class="hint">提示：内容由上方会话中的 AI 创建，提交前请自行判断。</div>
    </div>` : `<div style="flex:0 0 auto; border-top:1px solid #d0d3d8; background:#f6f7f9; padding:8px 12px; display:flex; justify-content:flex-end;">
      <button id="cancelBtn" style="padding:6px 14px;border:1px solid #c6c9ce;border-radius:8px;background:transparent;color:#494b50;font:inherit;cursor:pointer">关闭</button>
    </div>`}
</div>
<script>
(function () {
  'use strict';
  var PORT = ${jstrHtml(port)};
  var SESSION = ${jstrHtml(session)};
  var ID = ${jstrHtml(overlay.id)};
  var LAST_SEQ = ${overlay.eventSeq};
  var gen = ${overlay.gen};
  var SUBMITTED = false;

  // ── fetch 帮助 ──
  function authHeaders(extra) {
    var h = extra || {};
    h['Authorization'] = 'Bearer ' + SESSION;
    return h;
  }

  // ── 渲染（textContent / DOM API，绝不 innerHTML） ──
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function renderContent(p) {
    var c = document.getElementById('content');
    while (c.firstChild) c.removeChild(c.firstChild);
    if (p.reason) {
      var r = el('div'); r.style.cssText = 'font-size:12px;color:#5d626a;margin-bottom:8px;';
      r.textContent = '需要你的输入的原因：' + p.reason;
      c.appendChild(r);
    }
    if (p.message) {
      var msg = el('div');
      msg.textContent = p.message;
      c.appendChild(msg);
    }
    if (p.textContent) {
      var body = el('div');
      body.textContent = p.textContent;
      c.appendChild(body);
    }
    if (p.htmlContent) {
      var pre = el('div');
      pre.style.cssText = 'font:12px/1.6 Consolas,monospace;background:#f4f5f7;border:1px solid #dcdfe3;border-radius:6px;padding:10px;white-space:pre-wrap;word-break:break-word;';
      pre.textContent = '(HTML 内容以只读源码展示)';
      c.appendChild(pre);
    }
  }
  function applyContent(p) {
    renderContent(p);
    var ib = document.getElementById('inputBox');
    if (ib) {
      ib.placeholder = p.placeholder || '';
      if (!ib.value) ib.value = p.preset || '';
      p.gen = gen;
    }
    document.getElementById('banner').title = p.title || '';
    document.title = 'PolarisOV#' + ID;
    if (p.geometry && p.geometry.w) {
      if (window.resizeBy && Math.abs(window.innerWidth - p.geometry.w) > 2) {
        window.resizeTo(p.geometry.w, Math.max(innerHeight, 200));
      }
    }
  }
  // 初始内容（服务器生成的快照 — 首帧同步渲染）
  var INIT = ${jstrHtml(contentSnapshot(overlay))};
  applyContent(INIT);

  // ── SSE ──
  function openStream() {
    fetch('/ov/' + ID + '/stream', {
      method: 'POST',
      headers: authHeaders({'Content-Type': 'application/json'}),
      body: JSON.stringify({ since: LAST_SEQ })
    }).then(function (r) {
      if (!r.ok) throw new Error('grant ' + r.status);
      return r.json();
    }).then(function (j) {
      var es = new EventSource('/ov/' + ID + '/stream?g=' + encodeURIComponent(j.g) + '&since=' + j.since);
      es.onmessage = function (e) {
        try {
          var ev = JSON.parse(e.data);
          if (ev.seq && ev.seq <= LAST_SEQ) return;
          LAST_SEQ = ev.seq || LAST_SEQ;
          if (ev.type === 'content') { applyContent(ev.payload); }
          else if (ev.type === 'shutdown') { document.title = 'PolarisOV#' + ID; window.close(); }
        } catch (_) {}
      };
      es.onerror = function () { es.close(); setTimeout(openStream, 900); };
    }).catch(function () { setTimeout(openStream, 1500); });
  }
  openStream();

  // ── 提交 ──
  function doSubmit() {
    if (SUBMITTED) return;
    var box = document.getElementById('inputBox');
    var btn = document.getElementById('submitBtn');
    var value = (box && box.value) || '';
    SUBMITTED = true;
    if (btn) { btn.disabled = true; btn.textContent = '已提交…'; }
    fetch('/ov/' + ID + '/submit', {
      method: 'POST',
      headers: authHeaders({'Content-Type': 'application/json'}),
      body: JSON.stringify({ value: value, meta: {} })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function () {
        // 提交成功后窗口由宿主决定是否保留；此页立刻转为“已提交”视图
        var c = document.getElementById('content');
        while (c.firstChild) c.removeChild(c.firstChild);
        var done = el('div');
        done.textContent = '已提交。该浮窗可关闭。';
        c.appendChild(done);
        if (document.getElementById('composer')) {
          var composer = document.getElementById('composer');
          composer.parentNode.removeChild(composer);
        }
        SUBMITTED = false;
      }).catch(function () {
        SUBMITTED = false;
        if (btn) { btn.disabled = false; btn.textContent = '提交'; }
      });
  }
  var sb = document.getElementById('submitBtn');
  if (sb) {
    sb.textContent = ${jstrHtml(overlay.submitLabel)};
    sb.addEventListener('click', doSubmit);
  }
  var ib = document.getElementById('inputBox');
  if (ib) {
    ib.value = ${jstrHtml(overlay.preset || '')};
    ib.placeholder = ${jstrHtml(overlay.placeholder || '')};
    ib.addEventListener('keydown', function (e) {
      // Enter 提交（Shift+Enter 换行；Ctrl/Meta+Enter 一直有效）。纯 Enter 回车提交符合直觉，
      // 也保证无鼠标场景（语音/自动化/触屏）可键盘完成整个流程。
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) { e.preventDefault(); doSubmit(); }
    });
    // 自动聚焦：窗口唤起后键盘直接可用（点窗即输，无需先点输入框）
    var focusBox = function () { try { ib.focus(); } catch (_) {} };
    setTimeout(focusBox, 150);
    setTimeout(focusBox, 600);
    window.addEventListener('focus', focusBox);
  }
  var cb = document.getElementById('cancelBtn');
  if (cb) {
    cb.addEventListener('click', function () {
      fetch('/ov/' + ID + '/closeme', {
        method: 'POST',
        headers: authHeaders({'Content-Type': 'application/json'}),
        body: '{}'
      }).then(function(){ window.close(); }).catch(function(){ window.close(); });
    });
  }
  // 30s 一跳“页面活着”上行心跳
  setInterval(function () {
    fetch('/ov/' + ID + '/ack', { method: 'POST', headers: authHeaders({'Content-Type': 'application/json'}), body: '{}' }).catch(function () {});
  }, 30000);
  window.addEventListener('beforeunload', function(){
    try { navigator.sendBeacon && navigator.sendBeacon('/ov/' + ID + '/closeme', new Blob(['{}'], {type:'application/json'})); } catch (_) {}
  });
})();
</script>
</body>
</html>`;
}

module.exports = { OverlayHost };
