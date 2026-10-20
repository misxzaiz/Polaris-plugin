'use strict';
/**
 * capability-runtime — 模块注册中心
 *
 * 职责：
 *  - home 布局 / 单实例锁（具名 pipe 存活探测 + 原子接管）
 *  - 模块安装（staging + rename 原子落地）/ 卸载（.trash）/ 启停
 *  - 每模块一个子进程（fork module-child.js），故障隔离 + taskkill /T 外科手术
 *  - 模块状态 KV（state/<id>.json，原子写 + .bak 降级 + quarantine）
 *  - 审计日志（audit.ndjson，尺寸轮转）
 *  - 统一调用内核（tools/call 与 cap_module_invoke 是同一路径的两个薄壳）
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { fork, execFile } = require('child_process');
const net = require('net');

const {
  log, safeParse, jdata, atomicWrite, rmrf, sha256, errorMessage, sleep,
  guardedFetch,
} = require('./util');

const NAME_TOOL_RE = /^[a-z][a-z0-9_]{0,63}$/;
const NAME_MODULE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const MAX_CODE = 262144;           // 256KB 字符
const MAX_TOOLS = 16;              // 每模块最大工具数
const MAX_MODULES = 12;            // 默认总模块上限（可通过构造参数覆盖）
const MAX_STATE_BYTES = 8 * 1024 * 1024;   // 每模块状态上限 8MB
const CALL_TIMEOUT_DEFAULT = 60000;         // 单次调用默认 60s
const CALL_TIMEOUT_MAX = 300000;            // 上限 300s
const MODULE_INFLIGHT_CAP = 32;             // 单模块并发上限
const PROC_RESTART_COOLDOWN = 750;          // 进程意外退出后重建冷却
const AUTO_DISABLE_STREAK = 3;              // 连续 N 次故障自动停用

const HOME_SUBDIRS = ['modules', 'state', '.trash', '.quarantine', 'audit'];

/**
 * pid 复用防御（锁检查的可选硬化）：
 * process.kill(pid, 0) 只能证明「有个进程占着这个 pid」，不能证明它还是锁持有者。
 * Windows 下用 tasklist 读镜像名兜底；探测失败（环境无 tasklist / 超时）按存活处理（保守，宁误忙不误接管）。
 */
function winImageName(pid) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeout: 3000, windowsHide: true }, (e, stdout) => {
        if (e || typeof stdout !== 'string') { resolve(null); return; }
        const m = stdout.match(/^\s*"([^"]+)"/);
        resolve(m ? m[1] : null);
      });
    } catch (_) { resolve(null); }
  });
}

class Registry {
  /**
   * @param {{home: string, overlayApi: object, maxModules?: number, tag?: string}} opts
   */
  constructor(opts) {
    this.home = path.resolve(opts.home);
    this.overlayApi = opts.overlayApi; // overlay-host 实例或 stub
    this.maxModules = Number(opts.maxModules) || MAX_MODULES;
    this.tag = opts.tag || 'runtime';
    this.modules = new Map(); // id → { manifest, proc: {child, ops...} | null, state: obj|null, stateDirty: bool, inflight: count }
    this.revision = 0;        // tools/list 缓存版本
    this._changedTimer = null;
    this._auditFh = null;
    this._auditBytes = 0;
    this._stopped = false;
    this._procSpawns = new Map(); // id → lastSpawn ts
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────
  async init() {
    await fsp.mkdir(this.home, { recursive: true });
    for (const d of HOME_SUBDIRS) await fsp.mkdir(path.join(this.home, d), { recursive: true });
    // 启动清理：.staging 是安装原子落地的中转区，启动时不应有任何残留（上次崩溃遗留给扫描带来假目录）（P2-11）
    await rmrf(path.join(this.home, '.staging')).catch(() => {});
    await this._acquireLock();
    await this._scan();
    await this._openAudit();
    // 启动时清理陈旧 overlay 临时 profile（>3 小时）
    await this._sweepStaleProfiles();
  }

  async stop() {
    if (this._stopped) return;
    this._stopped = true;
    for (const id of [...this.modules.keys()]) {
      try { await this._killProc(id); } catch (_) { /* 尽力而为 */ }
    }
    await this._flushPendingStores();
    await this._closeAudit();
    await this._releaseLock();
  }

  // ── 单实例锁 ───────────────────────────────────────────────────────────────
  _pipeName(hash) {
    return process.platform === 'win32'
      ? `\\\\.\\pipe\\cap-rt-${hash}`
      : `/tmp/cap-rt-${hash}.sock`;
  }

  _probPipeHome(pipeName, timeoutMs = 900) {
    return new Promise((resolve) => {
      const socket = net.connect(pipeName);
      const done = (r) => { try { socket.destroy(); } catch (_) { /* 忽略 */ } resolve(r); };
      socket.once('error', () => done(false));
      socket.once('connect', () => {
        socket.write(JSON.stringify({ home: this.home }) + '\n');
      });
      socket.once('data', (buf) => {
        const msg = safeParse(buf.toString('utf8'), null);
        done(!!(msg && msg.ok));
      });
      setTimeout(() => done(false), timeoutMs);
    });
  }

  async _acquireLock() {
    // 语义：默认允许「后缀切分实例」（多会话互不干扰）；--home 指向下同样只报告占用并切后缀。
    let attempt = this.home;
    for (let i = 1; i <= 8; i++) {
      const free = await this._tryLock(attempt);
      if (free) {
        this.home = attempt;
        log(`home=${this.home} 实例锁获取成功 (host=${this.tag} pid=${process.pid})`);
        return;
      }
      log(`home=${attempt} 被存活实例占用，尝试后缀 i${i}`);
      attempt = `${this.home}.i${i}`;
    }
    throw new Error(`home 目录全部被占用（${this.home}.i1..i8），请检查是否有能力运行时实例僵死或显式指定 --home`);
  }

  async _tryLock(home) {
    try {
      await fsp.mkdir(home, { recursive: true });
      for (const d of HOME_SUBDIRS) await fsp.mkdir(path.join(home, d), { recursive: true });
      const lockPath = path.join(home, '.lock');
      const hash = sha256(home).slice(0, 12);

      // 1) 探测既存活主（具名 pipe）
      const busy = await this._probPipeHome(this._pipeName(hash));
      if (busy) return false;

      // 2) 存活持有者文件级确认（修复：pipe 就绪前两实例都探测失败的 TOC 竞态）
      //    .lock / .lock.takeover 里存 pid；pid 存活 → 忙；pid 已死 → 可接管
      const ownerBusy = await this._lockHolderAlive(home, lockPath);
      if (ownerBusy) return false;

      // 2b) 清理陈旧 takeover 残留（上次接管中途被硬杀留下的），>5s 才动（防误删并发竞争者刚建的）
      const takeover = `${lockPath}.takeover`;
      const tuStat = await fsp.stat(takeover).catch(() => null);
      if (tuStat && Date.now() - tuStat.mtimeMs > 5000) {
        const stale = `${takeover}.stale-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
        await fsp.rename(takeover, stale).catch(() => {});
        await rmrf(stale).catch(() => {});
      }

      // 3) 唯一接管：.lock.takeover 必须以 wx 创建（竞争者败者走后缀）
      try {
        const fh = await fsp.open(takeover, 'wx');
        await fh.write(JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }));
        await fh.close();
      } catch (e) {
        if (e && e.code === 'EEXIST') return false;
        throw e;
      }
      try {
        // 原子覆盖锁文件
        try {
          await fsp.rename(takeover, lockPath);
        } catch (eRename) {
          if (fs.existsSync(lockPath)) {
            await fsp.unlink(lockPath);
            await fsp.rename(takeover, lockPath);
          } else {
            await fsp.rename(takeover, lockPath);
          }
        }
      } catch (e) {
        await rmrf(takeover).catch(() => {});
        throw e;
      }
      // 4) 起具名 pipe 存活证明 server
      await this._startPipeServer(home);
      return true;
    } catch (e) {
      log(`_tryLock(${home}) 失败: ${errorMessage(e)}`);
      return false;
    }
  }

  /** 锁文件里的持有者进程是否存活（pipe 未就绪窗口的第二道防线） */
  async _lockHolderAlive(home, lockPath) {
    const readPid = async (p) => {
      const info = safeParse(await fsp.readFile(p, 'utf8').catch(() => ''), null);
      const pid = info ? Number(info.pid) : NaN;
      return Number.isInteger(pid) && pid > 1 && pid < Number.MAX_SAFE_INTEGER ? pid : null;
    };
    const pidAlive = async (pid) => {
      if (pid === process.pid) return true;
      let exists = false;
      try {
        process.kill(pid, 0); // Windows 下也是存在性探测；ESRCH=不存在
        exists = true;
      } catch (e) {
        exists = !!(e && e.code === 'EPERM'); // EPERM=进程存在但无权信号 → 仍算活
      }
      if (!exists) return false;
      // pid 复用确认：镜像名不再是 node/electron 家族 → 原持有者已死，可接管（P2-14 可选硬化）
      const image = await winImageName(pid);
      if (image !== null && !/^(node|electron)(\.exe)?$/i.test(image.replace(/^.*[\\/]/, ''))) {
        log(`pid=${pid} 现属 ${image}（非 node/electron 家族），判定为 pid 复用，锁可接管`);
        return false;
      }
      return true;
    };
    // .lock 里的 pid
    const lockPid = await readPid(lockPath);
    if (lockPid !== null && (await pidAlive(lockPid))) {
      log(`home=${home} .lock 指向存活进程 pid=${lockPid}（pipe 未就绪或未监听）`);
      return true;
    }
    // 无 .lock 时的 .lock.takeover（接管过半被杀的残留）
    if (lockPid === null && fs.existsSync(lockPath) === false) {
      const tuPid = await readPid(`${lockPath}.takeover`);
      if (tuPid !== null && (await pidAlive(tuPid))) {
        log(`home=${home} takeover 文件指向存活进程 pid=${tuPid}`);
        return true;
      }
    }
    return false;
  }

  _startPipeServer(home) {
    const hash = sha256(home).slice(0, 12);
    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        socket.setEncoding('utf8');
        socket.on('data', () => {
          try {
            socket.write(JSON.stringify({ ok: true, home, pid: process.pid }) + '\n');
          } catch (_) { /* 对端已走 */ }
        });
        socket.on('error', () => { try { socket.destroy(); } catch (_) { /* 探活连接中断是常态 */ } });
      });
      this._pipeServer = server;
      server.once('error', () => resolve());
      server.listen(this._pipeName(hash), () => resolve());
    });
  }

  async _releaseLock() {
    try {
      if (this._pipeServer) this._pipeServer.close();
      await fsp.unlink(path.join(this.home, '.lock')).catch(() => {});
    } catch (_) { /* 忽略 */ }
  }

  // ── 扫描恢复 ───────────────────────────────────────────────────────────────
  async _scan() {
    const modDir = path.join(this.home, 'modules');
    let names = [];
    try {
      names = await fsp.readdir(modDir);
    } catch (_) { names = []; }
    for (const id of names) {
      if (id.startsWith('.')) continue;
      try {
        const dir = path.join(modDir, id);
        const stat = await fsp.stat(dir);
        if (!stat.isDirectory()) continue;
        const manifest = safeParse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8').catch(() => ''), null);
        const hasCode = fs.existsSync(path.join(dir, 'module.js'));
        if (!manifest || !MANIFEST_OK(manifest, id) || !hasCode) {
          await this._quarantine(id, dir, 'manifest 损坏或缺 module.js');
          continue;
        }
        manifest.health = manifest.health || { failStreak: 0, faults: 0, lastFault: null, autoDisabled: false };
        if (manifest.health.failStreak >= AUTO_DISABLE_STREAK || manifest.health.autoDisabled) {
          manifest.enabled = false;
          log(`模块 ${id} 因历史故障计数 (${manifest.health.failStreak}) 保持停用状态，可 cap_module_set_enabled 恢复`);
        }
        const state = await this._loadState(id);
        this.modules.set(id, { manifest, proc: null, state, inflight: 0, stateDirty: false });
        log(`恢复模块 ${id} enabled=${manifest.enabled} tools=${(manifest.tools || []).length}`);
      } catch (e) {
        log(`扫描 ${id} 出错: ${errorMessage(e)}`);
      }
    }
  }

  async _quarantine(id, dir, reason) {
    const target = path.join(this.home, '.quarantine', `${id}-${Date.now()}`);
    log(`隔离模块目录 ${id}: ${reason}`);
    try {
      await fsp.rename(dir, target);
    } catch (_) {
      await rmrf(dir);
    }
    await this._audit({ event: 'quarantine', id, reason });
  }

  async _loadState(id) {
    const file = path.join(this.home, 'state', `${id}.json`);
    const bak = path.join(this.home, 'state', `${id}.bak.json`);
    let text = await fsp.readFile(file, 'utf8').catch(() => null);
    if (text != null) {
      const v = safeParse(text, null);
      if (v !== null) return v;
      log(`模块 ${id} state.json 损坏，尝试 .bak`);
    }
    text = await fsp.readFile(bak, 'utf8').catch(() => null);
    if (text != null) {
      const v = safeParse(text, null);
      if (v !== null) {
        await atomicWrite(file, JSON.stringify(v));
        return v;
      }
    }
    // 两者皆坏：移入 quarantine 目录 + 空状态
    if (fs.existsSync(file)) {
      const q = path.join(this.home, '.quarantine', `state-${id}-${Date.now()}.json`);
      await fsp.copyFile(file, q).catch(() => {});
      await fsp.unlink(file).catch(() => {});
      log(`模块 ${id} state 破损，已归档到 ${q}`);
    }
    return Object.create(null);
  }

  async _saveState(id) {
    const m = this.modules.get(id);
    if (!m) return;
    const text = JSON.stringify(m.state, null, 0);
    if (Buffer.byteLength(text) > MAX_STATE_BYTES) {
      log(`模块 ${id} 状态超限（>${MAX_STATE_BYTES}）写入失败`);
      m.stateError = 'storage_full';
      return false;
    }
    const file = path.join(this.home, 'state', `${id}.json`);
    const bak = path.join(this.home, 'state', `${id}.bak.json`);
    // 滚动 .bak：把上一代先留一份
    if (m._lastGoodStateText) await atomicWrite(bak, m._lastGoodStateText).catch(() => {});
    m._lastGoodStateText = m._lastGoodText || text; // 迟一代（保证回退对象真实存在过）
    let ok = false;
    if (await atomicWrite(file, text)) {
      m._lastGoodText = text;
      m.stateError = null;
      m.stateDirty = false;
      ok = true;
      // 预验：确保读回一致（东方责任制 —— 写前先把上一版留底）
      const check = safeParse(await fsp.readFile(file, 'utf8').catch(() => ''), null);
      if (check === null) {
        log(`模块 ${id} state 写入完整性校验失败`);
        m.stateError = 'storage_corrupt';
      }
    }
    if (!ok && !m.stateError) {
      m.stateError = 'storage_write_failed'; // 写盘失败但未分类（如磁盘只读/权限），仍然不能静默吞掉（P2-5）
    }
    return ok;
  }

  async _flushPendingStores() {
    for (const id of this.modules.keys()) {
      const m = this.modules.get(id);
      if (m && m.stateDirty) await this._saveState(id).catch(() => {});
    }
  }

  // ── 审计 ──────────────────────────────────────────────────────────────────
  async _openAudit() {
    await this._rollAuditIfNeeded(true);
  }

  async _audit(entry) {
    const line = JSON.stringify({ ts: new Date().toISOString(), host: this.tag, pid: process.pid, ...entry }) + '\n';
    this._auditBytes += Buffer.byteLength(line);
    this._auditBuffered = (this._auditBuffered || '') + line;
    if (this._auditBytes > 8 * 1024 * 1024) this._auditBuffered = this._auditBuffered.slice(-8 * 1024 * 1024);
    if (this._auditWriteChain) this._auditWriteChain = this._auditWriteChain.then(() => this._doAuditWrite());
    else this._auditWriteChain = this._doAuditWrite();
  }

  async _doAuditWrite() {
    if (!this._auditBuffered || this._stopped) return;
    const text = this._auditBuffered;
    this._auditBuffered = '';
    const file = path.join(this.home, 'audit', 'audit.ndjson');
    try {
      // append + 偶发轮转
      let okAppend = true;
      try {
        await fsp.appendFile(file, text, 'utf8');
      } catch (e) {
        okAppend = false;
        log(`audit append 失败: ${e.message}`);
      }
      if (okAppend) {
        await this._rollAuditIfNeeded();
      }
    } catch (e) {
      log(`audit 写入异常: ${e.message}`);
    }
  }

  async _rollAuditIfNeeded() {
    const file = path.join(this.home, 'audit', 'audit.ndjson');
    let size = 0;
    try {
      size = (await fsp.stat(file)).size;
    } catch (_) { return; }
    if (size > 10 * 1024 * 1024) {
      // 轮转（appendFile 每次自带 open/close，无长住 fd，可直接 rename 链）
      try {
        const t3 = `${file}.3`;
        const t2 = `${file}.2`;
        if (fs.existsSync(t3)) await fsp.unlink(t3).catch(() => {});
        if (fs.existsSync(t2)) await fsp.rename(t2, t3).catch(() => {});
        if (fs.existsSync(file)) await fsp.rename(file, t2).catch(() => {});
      } catch (e) {
        log(`audit rotate 失败: ${e.message}`);
      }
    }
  }

  async _closeAudit() {
    await this._doAuditWrite().catch(() => {});
  }

  // ── 模块安装 / 卸载 / 启停 ─────────────────────────────────────────────────
  async install(spec) {
    const id = String(spec.id || '').trim().toLowerCase();
    if (!NAME_MODULE_RE.test(id)) {
      throw capError('invalid_module_id', '模块 id 非法（须 ^[a-z0-9][a-z0-9-]{0,31}$，如 weather-tools）');
    }
    if (id.startsWith('cap-') || RESERVED_IDS.has(id)) {
      throw capError('reserved_id', `模块 id "${id}" 为保留字，请换一个`);
    }
    if (/^(con|aux|nul|prn|com[0-9]|lpt[0-9])$/.test(id)) {
      // Windows 保留设备名：用作 modules/ 下的目录名会在各种工具链上炸（P2-12）
      throw capError('reserved_id', `模块 id "${id}" 是 Windows 保留设备名，请换一个`);
    }
    if (this.modules.has(id)) {
      throw capError('module_exists', `模块 ${id} 已存在。如需更新请先 cap_module_remove 后重装（或用相同 id 重装=覆盖，本版本只做先删后装）`);
    }
    const currentIds = [...this.modules.values()].filter((m) => m.manifest.enabled).length;
    if (currentIds >= this.maxModules) {
      throw capError('limit_reached', `模块数已达上限 ${this.maxModules}，请先 cap_module_list 查看再卸载不用的模块`);
    }
    const code = typeof spec.code === 'string' ? spec.code : '';
    if (!code) throw capError('empty_code', 'code 不能为空');
    if (code.length > MAX_CODE) {
      throw capError('code_too_large', `code 超过 ${MAX_CODE} 字符上限（当前 ${code.length}），请精简或拆分为多个模块`);
    }

    // 1) 第一遍：独立子进程校验（语法 + api.tools 形状 + schema 合法性）
    const loadResult = await this._loadProbeAndDescribe(code);
    const tools = loadResult.tools;
    if (tools.length === 0) throw capError('no_tools', '模块未注册任何工具');
    validateToolDefs(tools);

    // 2) staging 写盘 → rename 原子落地
    const manifest = {
      id,
      name: String(spec.name || id).slice(0, 80),
      description: String(spec.description || '').slice(0, 400),
      version: String(spec.version || '0.1.0').slice(0, 24),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      permissions: {
        network: !!(spec.permissions && spec.permissions.network),
        allowPrivate: !!(spec.permissions && spec.permissions.allowPrivate),
        overlay: !!(spec.permissions && spec.permissions.overlay),
      },
      enabled: true,
      tools,
      codeSha256: sha256(code),
      health: { failStreak: 0, faults: 0, lastFault: null, autoDisabled: false },
    };
    const finalDir = path.join(this.home, 'modules', id);
    const staging = path.join(this.home, '.staging', `${id}-${Date.now()}`);
    await fsp.mkdir(path.join(this.home, '.staging'), { recursive: true });
    try {
      await fsp.mkdir(staging, { recursive: true });
      await fsp.writeFile(path.join(staging, 'module.js'), code, 'utf8');
      await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
      if (fs.existsSync(finalDir)) {
        throw capError('racing_install', `目录 modules/${id} 同时被其他进程创建（竞态），请重试`);
      }
      await fsp.rename(staging, finalDir).catch(async (e) => {
        if (fs.existsSync(finalDir) && (e.code === 'EPERM' || e.code === 'ENOTEMPTY' || e.code === 'EEXIST')) {
          throw capError('racing_install', `目录 modules/${id} 同时被其他进程创建（竞态），请重试`);
        }
        throw e;
      });
    } catch (e) {
      await rmrf(staging).catch(() => {});
      throw e;
    }

    const state = await this._loadState(id);
    this.modules.set(id, { manifest, proc: null, state, inflight: 0, stateDirty: false });
    this.bumpRevision();
    await this._audit({ event: 'install', id, tools: tools.map((t) => t.name), codeSha256: manifest.codeSha256, permissions: manifest.permissions });
    return {
      ok: true,
      id,
      tools: tools.map((t) => ({ name: `${id}_${t.name}`, description: t.description, inputSchema: t.inputSchema, exampleArgs: t.exampleArgs })),
      note: `模块已装并立即生效。若客户端工具列表尚未刷新（部分客户端只在连接时拉取 tools/list），请调用 cap_module_invoke({module:'${id}', tool:'${tools[0].name}', args:{...}}) 直接使用 —— 这是恒定可用的万能入口。`,
      invokeExample: `cap_module_invoke { "module": "${id}", "tool": "${tools[0].name}", "args": ${sampleArgsText(tools[0])} }`,
    };
  }

  /** 用一次性的子进程加载 code，返回 {tools:[...]} */
  _loadProbeAndDescribe(code) {
    return new Promise((resolve, reject) => {
      const child = fork(path.join(__dirname, 'module-child.js'), [], {
        serialization: 'json',
        cwd: this.home,
        env: { ...process.env, CAP_MODULE_ROLE: 'install-probe' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        execArgv: ['--max-old-space-size=256'],
      });
      child.stdout?.on('data', () => {}); // 子进程 stdout 仅期待自家消息，多余输出丢弃
      child.stderr?.on('data', (d) => process.stderr.write(`[cap-probe] ${d}`));
      const timer = setTimeout(() => {
        killTree(child.pid);
        reject(capError('install_probe_timeout', '模块加载探针超时（10s 内未完成同步注册）'));
      }, 15000);
      child.once('message', (m) => {
        clearTimeout(timer);
        if (!m || m.id !== 0) return;
        killTree(child.pid);
        if (m.op === 'load' && m.ok) {
          resolve({ tools: (m.result && m.result.tools) || [] });
        } else {
          reject(capError(m.capCode || 'module_invalid', m.error || '模块加载失败'));
        }
      });
      child.once('error', (e) => {
        clearTimeout(timer);
        reject(capError('probe_spawn_fail', errorMessage(e)));
      });
      child.send({ op: 'load', code, manifest: {} }, (err) => {
        if (err) { clearTimeout(timer); reject(capError('probe_send_fail', errorMessage(err))); }
      });
    });
  }

  async remove(moduleId) {
    const m = this.modules.get(moduleId);
    if (!m) throw capError('unknown_module', `未知模块: ${moduleId}`);
    await this._audit({ event: 'remove', id: moduleId });
    await this._killProc(moduleId, { graceful: true });
    const modDir = path.join(this.home, 'modules', moduleId);
    const trash = path.join(this.home, '.trash', `${Date.now()}-${moduleId}`);
    this.modules.delete(moduleId);
    this.bumpRevision();
    let moved = false;
    try {
      await fsp.mkdir(path.join(this.home, '.trash'), { recursive: true });
      await fsp.rename(modDir, trash);
      moved = true;
    } catch (e) {
      if (e && e.code !== 'ENOENT') {
        // Windows 上句柄晚释 → 退化 rmrf：可用性优先，但有 .trash 竞争兜底失败时报告
        const ok = await rmrf(modDir);
        moved = ok;
        if (!ok) log(`模块 ${moduleId} 目录清理失败（已从内存摘除）`);
      }
    }
    return { ok: true, id: moduleId, trashMoved: moved };
  }

  async setEnabled(moduleId, enabled) {
    const m = this.modules.get(moduleId);
    if (!m) throw capError('unknown_module', `未知模块: ${moduleId}`);
    m.manifest.enabled = !!enabled;
    if (enabled) {
      m.manifest.health.failStreak = 0;
      m.manifest.health.autoDisabled = false;
    } else {
      await this._killProc(moduleId);
    }
    await this._saveManifest(m);
    this.bumpRevision();
    await this._audit({ event: 'set_enabled', id: moduleId, enabled: m.manifest.enabled });
    return { ok: true, id: moduleId, enabled: m.manifest.enabled };
  }

  async _saveManifest(m) {
    const file = path.join(this.home, 'modules', m.manifest.id, 'manifest.json');
    m.manifest.updatedAt = new Date().toISOString();
    await atomicWrite(file, JSON.stringify(m.manifest, null, 2));
  }

  // ── 子进程池管理 ──────────────────────────────────────────────────────────
  async _ensureProc(id) {
    const m = this.modules.get(id);
    if (!m) throw capError('unknown_module', `未知模块: ${id}`);
    if (m.proc && m.proc.alive) return m.proc;
    if (m.procLoading) return m.procLoading; // 并发调用共用同一次冷启动
    if (m.manifest.enabled === false) {
      throw capError('module_disabled', `模块 ${id} 已停用（${m.manifest.health.autoDisabled ? '因连续故障自动停用' : '被手动停用'}）`);
    }
    // 同步占据 procLoading（在任何 await 之前），防并发冷启动双开子进程
    const loading = this._bootProc(id, m).then(
      (proc) => { m.procLoading = null; return proc; },
      (e) => { m.procLoading = null; throw e; }
    );
    m.procLoading = loading;
    return loading;
  }

  /** 冷启动全流程（清残骸 + 冷却 + fork + load 握手）；失败时保证杀掉已 fork 的子进程 */
  async _bootProc(id, m) {
    const modDir = path.join(this.home, 'modules', id);    const child = fork(path.join(__dirname, 'module-child.js'), [], {
      serialization: 'json',
      cwd: modDir,
      env: { ...process.env, CAP_MODULE_ROLE: 'run', CAP_MODULE_ID: id },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      execArgv: ['--max-old-space-size=256'],
    });
    try {
      // 旧残骸处置 / 冷却
      const older = m.proc && m.proc.child;
      if (older) {
        try { if (older.exitCode === null && older.signalCode === null) killTree(older.pid); } catch (_) { /* 尽力 */ }
      }
      const nowMs = Date.now();
      const last = this._procSpawns.get(id) || 0;
      if (nowMs - last < PROC_RESTART_COOLDOWN) {
        await sleep(PROC_RESTART_COOLDOWN - (nowMs - last));
      }
      this._procSpawns.set(id, nowMs);
      return await this._startProc(id, m, child, modDir);
    } catch (e) {
      // 启动失败：不留孤儿子进程
      try { if (child.exitCode === null && child.signalCode === null) killTree(child.pid); } catch (_) { /* 尽力 */ }
      throw e;
    }
  }

  async _startProc(id, m, child, modDir) {
    const proc = {
      alive: false,
      child: null,
      pending: new Map(), // reqId → { resolve, reject, timer, tool }
      reqSeq: 0,
    };
    proc.child = child;
    child.stdout?.on('data', (d) => process.stderr.write(`[cap-${id}] (stdout) ${String(d)}`));
    child.stderr?.on('data', (d) => process.stderr.write(`[cap-${id}] ${String(d)}`));

    child.once('message', (msg) => {
      // load 应答
      if (!msg || msg.id !== 0 || msg.op !== 'load') return;
      if (msg.ok) {
        proc.alive = true;
        // 自述与 manifest 漂移时以实测为准（只读，不覆盖磁盘：name/description 漂移低价值）
        log(`模块子进程 ${id} 就绪 (${child.pid})`);
      } else {
        log(`模块子进程 ${id} load 失败: ${msg.error}`);
      }
    });

    child.on('message', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (typeof msg.id === 'number' && msg.id > 0) {
        const p = proc.pending.get(msg.id);
        if (!p) return; // 迟到（被取消/已被超时过），丢弃
        proc.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.result);
        else {
          p.reject(capError(msg.capCode || 'module_error', msg.error || '模块返回错误'));
        }
        return;
      }
      if (msg.__cap === 1) {
        this._handleChildCap(id, msg).then(
          (data) => safeSend(child, { __cap: 1, id: msg.id, ok: true, data }),
          (e) => safeSend(child, { __cap: 1, id: msg.id, ok: false, error: errorMessage(e), errorCode: e.capCode })
        );
        return;
      }
    });

    child.on('exit', (code, signal) => {
      const wasAlive = proc.alive;
      proc.alive = false;
      const pend = [...proc.pending.values()];
      proc.pending.clear();
      for (const p of pend) {
        clearTimeout(p.timer);
        // 区分：被超时杀死的调用早已 reject；这里只处理非超时异常死亡
        p.reject(capError('module_crashed', `模块子进程退出 (code=${code} signal=${signal})，相关调用失败`));
      }
      proc.child = null;
      // 身份校验：迟到的 exit 不能作废新启动的子进程（P2-1 红队整改）
      if (m.proc === proc) {
        m.proc = null;
        this._procSpawns.delete(id);
      }
      if (wasAlive) log(`模块子进程 ${id} 退出 (code=${code} signal=${signal})，在飞调用已整体 reject`);
    });

    // 发送 load（带 code），等待 load 应答 + tools 可用
    const code = await fsp.readFile(path.join(modDir, 'module.js'), 'utf8');
    const manifest = safeParse(JSON.stringify(m.manifest), m.manifest);
    const loadAck = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(capError('proc_timeout', '模块子进程 load 应答超时')), 20000);
      child.once('message', function waiter(msg) {
        if (!msg || msg.id !== 0 || msg.op !== 'load') { child.once('message', waiter); return; }
        clearTimeout(timer);
        if (msg.ok) resolve();
        else reject(capError(msg.capCode || 'module_load_error', msg.error || '模块加载失败'));
      });
    });
    safeSend(child, { op: 'load', code, manifest });
    await loadAck;
    proc.alive = true;
    m.proc = proc;
    return proc;
  }

  async _killProc(id, { graceful = false } = {}) {
    const m = this.modules.get(id);
    if (!m || !m.proc) return;
    const child = m.proc.child;
    m.proc = null;
    if (child && child.connected) {
      if (graceful) {
        try { child.send({ op: 'shutdown' }); } catch (_) { /* 忽略 */ }
        await sleep(150);
      }
      killTree(child.pid);
      // 给一点时间让 exit 事件跑掉
      await sleep(120);
    }
  }

  bumpRevision() {
    this.revision++;
    if (this._changedTimer) clearTimeout(this._changedTimer);
    this._changedTimer = setTimeout(() => {
      this._changedTimer = null;
      if (this.onToolListChanged) this.onToolListChanged();
    }, 250);
  }

  // ── __capCall 语义（宿主侧） ───────────────────────────────────────────────
  async _handleChildCap(id, msg) {
    const op = msg.op;
    const payload = msg.payload || {};
    const m = this.modules.get(id);
    if (!m || !m.manifest) throw capError('internal', '模块缺失');

    if (op === 'store') {
      return this._storeOp(id, m, payload);
    }
    if (op === 'fetch') {
      if (!m.manifest.permissions.network) {
        throw capError('cap_permission_denied', `模块 ${id} 未开启 network 权限（manifest.permissions.network=false）。如需联网，重新安装时声明 permissions.network=true`);
      }
      const { url, opts } = payload;
      const res = await guardedFetch(String(url), opts && typeof opts === 'object' ? opts : {}, {
        allowPrivate: !!m.manifest.permissions.allowPrivate,
        maxBytes: 8 * 1024 * 1024,
        timeoutMs: 30000,
      });
      return { status: res.status, text: res.text.slice(0, 2 * 1024 * 1024) };
    }
    if (op === 'overlay') {
      if (!m.manifest.permissions.overlay) {
        throw capError('cap_permission_denied', `模块 ${id} 未开启 overlay 权限。重装时声明 permissions.overlay=true`);
      }
      return this._overlayOp(id, payload);
    }
    if (op === 'log') {
      const msgs = (payload.msgs || []).map((s) => String(s).slice(0, 500));
      log(`[mod:${id}] ${msgs.join(' ')}`);
      return null;
    }
    throw capError('cap_bad_op', `未知 __capCall op: ${op}`);
  }

  async _storeOp(id, m, payload) {
    const action = payload.action;
    if (action === 'get') {
      const key = String(payload.key || '');
      if (!(key in m.state)) return { value: null };
      return { value: m.state[key] };
    }
    if (action === 'set') {
      const key = String(payload.key || '');
      if (!key || key.length > 240 || key.startsWith('__')) throw capError('cap_bad_key', 'key 非法（1-240 字符，禁 __ 前缀）');
      if (payload.value === undefined) throw capError('cap_bad_value', 'value 不能为 undefined');
      const next = jdata(payload.value);
      if (next === null && payload.value !== null) throw capError('cap_bad_value', 'value 序列化失败');
      // 失败回滚：内存快照先记下旧值，写盘失败则恢复原状，保证「未生效」名副其实（P2-5）
      const hadKey = key in m.state;
      const prevVal = hadKey ? m.state[key] : undefined;
      m.state[key] = next;
      m.stateDirty = true;
      const saved = await this._saveState(id);
      if (!saved || m.stateError === 'storage_full' || m.stateError === 'storage_corrupt') {
        if (hadKey) m.state[key] = prevVal; else delete m.state[key];
        m.stateDirty = false; // 回滚后内存回到上次落盘状态
        throw capError(m.stateError, `模块状态持久化失败（${m.stateError}），本次 set 未生效`);
      }
      return { ok: true };
    }
    if (action === 'del') {
      const key = String(payload.key || '');
      const hadKey = key in m.state;
      const prevVal = hadKey ? m.state[key] : undefined;
      delete m.state[key];
      m.stateDirty = true;
      const saved = await this._saveState(id);
      if (!saved || m.stateError === 'storage_full' || m.stateError === 'storage_corrupt') {
        if (hadKey) m.state[key] = prevVal;
        m.stateDirty = false;
        throw capError(m.stateError, `模块状态持久化失败（${m.stateError}），本次 del 未生效`);
      }
      return { ok: true };
    }
    if (action === 'keys') {
      return { keys: Object.keys(m.state) };
    }
    throw capError('cap_bad_op', `未知 store action: ${action}`);
  }

  async _overlayOp(moduleId, payload) {
    const kind = payload.kind;
    const api = this.overlayApi;
    if (!api) throw capError('overlay_unavailable', '浮窗能力不可用（overlayApi 未注入）');
    if (kind === 'input') return api.moduleInput(moduleId, payload.spec || {});
    if (kind === 'show') return api.moduleShow(moduleId, payload.spec || {});
    if (kind === 'update') {
      const list = await api.list();
      const found = (list.entities || []).find((e) => e.id === String(payload.id || ''));
      if (!found) throw capError('unknown_overlay', '浮窗不存在');
      if (found.owner !== moduleId) throw capError('cap_permission_denied', '只能更新自己创建的浮窗');
      return api.update(payload.id, payload.patch || {});
    }
    if (kind === 'close') {
      const list = await api.list();
      const found = (list.entities || []).find((e) => e.id === String(payload.id || ''));
      if (!found) throw capError('unknown_overlay', '浮窗不存在');
      if (found.owner !== moduleId) throw capError('cap_permission_denied', '只能关闭自己创建的浮窗');
      await api.close(payload.id);
      return { ok: true };
    }
    if (kind === 'list') return api.list({ selfId: moduleId });
    throw capError('cap_bad_op', `未知 overlay kind: ${kind}`);
  }

  // ── 统一调用内核 ───────────────────────────────────────────────────────────
  /**
   * @returns {Promise<{content: Array, isError: boolean}>}
   */
  async invoke(moduleId, tool, args, { timeoutMs } = {}, { toolFullName } = {}) {
    const publishName = toolFullName || `${moduleId}_${tool}`;
    const m = this.modules.get(moduleId);
    if (!m) throw capError('unknown_module', `未知模块: ${moduleId}`);
    if (!m.manifest.enabled) {
      throw capError('module_disabled', `模块 ${moduleId} 已停用，可 cap_module_set_enabled 恢复`);
    }
    if (m.inflight >= MODULE_INFLIGHT_CAP) {
      throw capError('module_busy', `模块 ${moduleId} 并发已达上限 ${MODULE_INFLIGHT_CAP}，请减少并发或稍后重试`);
    }
    // 并发计数必须在任何 await 之前同步完成（P2-6：避免 N 个并发同时通过上限检查）
    const def = (m.manifest.tools || []).find((t) => t.name === tool);
    if (!def) {
      const names = (m.manifest.tools || []).map((t) => `${moduleId}_${t.name}`).join(', ');
      throw capError('unknown_tool', `模块 ${moduleId} 没有工具 ${tool}。可用: ${names || '（无）'}`);
    }
    m.inflight++;
    let proc;
    try {
      proc = await this._ensureProc(moduleId);
    } catch (e) {
      m.inflight--;
      throw e;
    }

    const timeout = Math.min(Math.max(Number(timeoutMs) || CALL_TIMEOUT_DEFAULT, 1000), CALL_TIMEOUT_MAX);
    const reqId = ++proc.reqSeq;
    const started = Date.now();

    try {
      const result = await new Promise((resolve, reject) => {
        const entry = { resolve, reject, timer: null, tool: publishName, withdrawn: false };
        proc.pending.set(reqId, entry);
        entry.timer = setTimeout(() => {
          const e = proc.pending.get(reqId);
          if (e) {
            proc.pending.delete(reqId);
            // 记为 fault → taskkill 击杀整个进程树（sync 死循环的兜底）
            e.reject(capError('module_timeout', `模块调用超过 ${timeout}ms，已强制终止模块进程（状态保留：store 持久化不受影响）`));
            this._onModuleFault(moduleId, 'timeout');
            // 触发对进程树的清理
            try { killTree(proc.child && proc.child.pid); } catch (_) { /* 忽略 */ }
            // killTree 会触发 child 'exit' → proc.alive=false，其他 pending 通过 exit reject
          }
        }, timeout);
        const sent = safeSend(proc.child, { op: 'call', id: reqId, tool, args: jdata(args) || {} });
        if (!sent) {
          proc.pending.delete(reqId);
          clearTimeout(entry.timer);
          reject(capError('module_pipe_fail', '向模块子进程发送失败'));
        }
      });

      const durMs = Date.now() - started;
      this._onModuleSuccess(moduleId, durMs);
      let payload = jdata(result);
      return { content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }], isError: false };
    } catch (e) {
      const isUserErr = ['unknown_tool', 'module_disabled', 'cap_bad_value', 'unknown_module'].includes(e.capCode);
      if (!isUserErr) this._onModuleFault(moduleId, e.capCode || 'error', e);
      log(`模块调用失败 ${publishName}: ${errorMessage(e)} (dur=${Date.now() - started}ms)`);
      throw e;
    } finally {
      m.inflight--;
    }
  }

  async _onModuleSuccess(id, durMs) {
    const m = this.modules.get(id);
    if (!m) return;
    if (m.manifest.health.failStreak !== 0) {
      m.manifest.health.failStreak = 0;
      await this._saveManifest(m);
    }
  }

  async _onModuleFault(id, capCode, e) {
    const m = this.modules.get(id);
    if (!m) return;
    const health = m.manifest.health;
    health.faults++;
    health.failStreak++;
    health.lastFault = { ts: new Date().toISOString(), capCode, message: e ? errorMessage(e) : undefined };
    if (health.failStreak >= AUTO_DISABLE_STREAK) {
      health.autoDisabled = true;
      m.manifest.enabled = false;
      log(`模块 ${id} 连续故障 ${health.failStreak} 次，自动停用`);
      await this._killProc(id);
      this.bumpRevision();
    }
    await this._saveManifest(m);
    await this._audit({ event: 'fault', id, capCode, failStreak: health.failStreak });
  }

  // ── meta-tools 数据视图 ────────────────────────────────────────────────────
  /** overlay 宿主的审计旁路入口（onAudit 接线；失败尽人皆知、不炸宿主） */
  auditExternal(e) {
    if (!e || typeof e !== 'object') return;
    const { event, id, reason } = e;
    this._audit({ event: String(event || '').slice(0, 40), id: String(id || '').slice(0, 24), reason: reason === undefined ? undefined : String(reason).slice(0, 40) }).catch(() => {});
  }

  listModules() {
    const list = [];
    for (const [id, m] of this.modules.entries()) {
      list.push({
        id,
        name: m.manifest.name,
        description: m.manifest.description,
        version: m.manifest.version,
        enabled: !!m.manifest.enabled,
        permissions: m.manifest.permissions,
        health: {
          faults: m.manifest.health.faults,
          failStreak: m.manifest.health.failStreak,
          lastFault: m.manifest.health.lastFault,
          autoDisabled: !!m.manifest.health.autoDisabled,
        },
        procAlive: !!(m.proc && m.proc.alive),
        inflight: m.inflight,
        stateSizeBytes: m._lastGoodText ? Buffer.byteLength(m._lastGoodText) : 0,
        tools: (m.manifest.tools || []).map((t) => ({
          name: `${id}_${t.name}`,
          description: t.description,
          inputSchema: t.inputSchema,
          exampleArgs: t.exampleArgs,
          invokeHint: `cap_module_invoke { "module": "${id}", "tool": "${t.name}", "args": ${sampleArgsText(t)} }`,
        })),
      });
    }
    return list;
  }

  runtimeStatus() {
    return {
      home: this.home,
      modules: this.modules.size,
      enabledModules: [...this.modules.values()].filter((m) => m.manifest.enabled).length,
      tools: [...this.modules.values()]
        .filter((m) => m.manifest.enabled)
        .reduce((n, m) => n + (m.manifest.tools || []).length, 0),
      overlayActive: this.overlayApi ? (this.overlayApi.activeCount ? this.overlayApi.activeCount() : 0) : 0,
      revision: this.revision,
    };
  }

  async _sweepStaleProfiles() {
    const tmp = require('os').tmpdir();
    try {
      const entries = await fsp.readdir(tmp);
      const cutoff = Date.now() - 3 * 3600 * 1000;
      for (const name of entries) {
        if (!name.startsWith('capov-')) continue;
        try {
          const st = await fsp.stat(path.join(tmp, name));
          if (st.mtimeMs < cutoff) await rmrf(path.join(tmp, name));
        } catch (_) { /* 忽略 */ }
      }
    } catch (_) { /* 忽略 */ }
  }
}

// ── 辅助 ─────────────────────────────────────────────────────────────────────
function MANIFEST_OK(manifest, expectedId) {
  return manifest && manifest.id === expectedId && typeof manifest.enabled === 'boolean' && Array.isArray(manifest.tools);
}

function validateToolDefs(tools) {
  let names;
  names = new Set();
  for (const t of tools) {
    if (!NAME_TOOL_RE.test(t.name)) {
      throw capError('invalid_tool_name', `工具名非法: ${t.name}（须 ^[a-z][a-z0-9_]{0,63}$）`);
    }
    if (names.has(t.name)) throw capError('dup_tool', `工具重复: ${t.name}`);
    names.add(t.name);
    if (typeof t.description !== 'string' || t.description.length > 2000) {
      throw capError('invalid_desc', `工具 ${t.name} description 缺失或超过 2000 字`);
    }
    const schema = t.inputSchema;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      throw capError('invalid_schema', `工具 ${t.name} 的 inputSchema 必须是对象`);
    }
    if ('properties' in schema && (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties))) {
      throw capError('invalid_schema', `工具 ${t.name} 的 inputSchema.properties 必须是对象`);
    }
    if ('required' in schema && !Array.isArray(schema.required)) {
      throw capError('invalid_schema', `工具 ${t.name} 的 inputSchema.required 必须是数组`);
    }
  }
}

function sampleArgsText(toolDef) {
  const ex = toolDef && toolDef.exampleArgs;
  if (ex && typeof ex === 'object' && !Array.isArray(ex)) return JSON.stringify(ex);
  return '{}';
}

function capError(capCode, message) {
  const e = new Error(message);
  e.capCode = capCode;
  return e;
}

function safeSend(child, msg) {
  if (!child || !child.connected) return false;
  try { child.send(msg); return true; } catch (_) { return false; }
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    // /T 连带杀子进程树（防模块再 spawn 的孤儿），/F 强制
    const { spawn } = require('child_process');
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).unref();
    } catch (_) { /* 忽略 */ }
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch (_) {
      try { process.kill(pid, 'SIGKILL'); } catch (_) { /* 忽略 */ }
    }
  }
}

const RESERVED_IDS = new Set(['invoke', 'status', 'docs', 'overlay']);

module.exports = { Registry, capError, killTree, validateToolDefs, NAME_MODULE_RE, NAME_TOOL_RE, MAX_CODE, MAX_TOOLS, MAX_MODULES };
