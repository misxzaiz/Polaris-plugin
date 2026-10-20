'use strict';
/**
 * capability-runtime — 模块子进程
 *
 * 职责：每个已安装模块运行在独立 Node 子进程里（fork），模块代码在 vm 沙箱上下文中执行。
 *
 * 隔离分层（措辞必须与 README「安全模型」一致）：
 *  - 进程层：模块崩溃 / 超时可被宿主 taskkill /T /F 外科手术式击杀，不影响 runtime 主进程
 *  - vm 层：宿主仅注入固定桥接函数 __capCall / __capReady（README 威胁模型已声明），ctx 的
 *    fetch/store/overlay 全部在 vm 内组合而成。防手滑（误触 require/process），
 *    不是恶意代码安全边界。
 *
 * 协议（JSON 序列化，与 registry.js）：
 *   宿主 → 子进程：第一条 { op:'load', code, manifest } → 子进程回报 { id:0, ok, result:{tools}|error }
 *   宿主 → 子进程：{ op:'call', id, tool, args }                → { id, ok, result } / { id, ok:false, error, capCode }
 *   子进程 → 宿主：{ __cap:1, id, op:'store'|'fetch'|'overlay'|'log', payload } → 宿主回 { __cap:1, id, ok, data/error }
 *   宿主 → 子进程：{ op:'shutdown' } → 子进程退出
 */

const vm = require('node:vm');
const fs = require('node:fs');

// ── __capCall：与宿主 registry 的往返 RPC ─────────────────────────────────────
let seqCounter = 0;
const inflight = new Map(); // id → { resolve, reject, timer }

function capCall(op, payload) {
  const id = `c${++seqCounter}`;
  // 边界硬契约：payload 必须可 JSON 化
  let data;
  try {
    data = JSON.parse(JSON.stringify(payload === undefined ? null : payload));
  } catch (_) {
    return Promise.reject(Object.assign(new Error('payload 不可 JSON 序列化'), { capCode: 'cap_bad_payload' }));
  }
  return new Promise((resolve, reject) => {
    inflight.set(id, { resolve, reject, op, timer: null });
    const settle = (fn, arg) => {
      const p = inflight.get(id);
      if (!p) return;
      if (p.timer) clearTimeout(p.timer);
      inflight.delete(id);
      fn(arg);
    };
    const timer = setTimeout(() => {
      const p = inflight.get(id);
      if (p) {
        inflight.delete(id);
        p.reject(Object.assign(new Error(`宿主 RPC ${op} 无响应`), { capCode: 'cap_host_timeout' }));
      }
    }, op === 'overlay' ? 360000 : 120000);
    inflight.set(id, { resolve, reject, timer });
    try {
      process.send({ __cap: 1, id, op, payload: data });
    } catch (e) {
      // 发送失败（IPC 通道已闭）—— 直接终态化，避免挂住
      inflight.delete(id);
      clearTimeout(timer);
      reject(Object.assign(new Error(`__capCall ${op} 发送失败: ${e.message}`), { capCode: 'cap_send_fail' }));
    }
  });
}

// 主消息泵
process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.__cap === 1) {
    const p = inflight.get(msg.id);
    if (!p) return; // 迟到应答，丢弃
    if (p.timer) clearTimeout(p.timer);
    inflight.delete(msg.id);
    if (msg.ok) p.resolve(msg.data);
    else {
      const err = new Error(msg.error || '宿主 RPC 失败');
      err.capCode = msg.errorCode || 'cap_host_error';
      p.reject(err);
    }
    return;
  }
  switch (msg.op) {
    case 'call': {
      const { id, tool, args } = msg;
      Promise.resolve()
        .then(() => dispatchCall(tool, args))
        .then((result) => reply(id, { ok: true, result: normalize(result) }))
        .catch((e) => {
          const err = e instanceof Error ? e : new Error(String((e && e.message) || e));
          reply(id, { ok: false, error: err.message.slice(0, 2000), capCode: err.capCode || 'module_error' });
        });
      return;
    }
    case 'shutdown':
      process.exit(0);
      return;
    default:
      return;
  }
});

function reply(id, payload) {
  try { process.send({ id, ...payload }); } catch (_) { /* 宿主已死 */ }
}

// ── 工具注册表 ────────────────────────────────────────────────────────────────
const apiDefs = new Map(); // toolName → def { name, handler, ... }

async function dispatchCall(tool, args) {
  const def = apiDefs.get(tool);
  if (!def || typeof def.handler !== 'function') {
    throw Object.assign(new Error(`未知工具: ${tool}`), { capCode: 'unknown_tool' });
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
  return def.handler(args, makeCtx());
}

/** ctx：完全在 vm 内组合（const 方法经同一桥 __capCall 落到宿主） */
function makeCtx() {
  return {
    fetch: (url, opts) => capCall('fetch', { url, opts }),
    store: {
      // 宿主回 envelope {value}：get 解包，缺席 key → null（符合 ctx.store 文档契约）
      get: async (key) => {
        const r = await capCall('store', { action: 'get', key });
        return r && typeof r === 'object' && 'value' in r ? r.value : r;
      },
      set: (key, value) => capCall('store', { action: 'set', key, value }),
      del: (key) => capCall('store', { action: 'del', key }),
      keys: async () => {
        const r = await capCall('store', { action: 'keys' });
        return r && Array.isArray(r.keys) ? r.keys : [];
      },
    },
    overlay: {
      input: (spec) => capCall('overlay', { kind: 'input', spec }),
      show: (spec) => capCall('overlay', { kind: 'show', spec }),
      update: (id, patch) => capCall('overlay', { kind: 'update', id, patch }),
      close: (id) => capCall('overlay', { kind: 'close', id }),
      list: () => capCall('overlay', { kind: 'list' }),
    },
    log: (...msgs) => capCall('log', { msgs: msgs.map((m) => (typeof m === 'string' ? m : safeStr(m))) }),
  };
}

function safeStr(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (_) { return '<unserializable>'; }
}

/** 跨 realm 归一化：宿主仅接受纯数据 */
function normalize(value) {
  try {
    return JSON.parse(JSON.stringify(value === undefined ? null : value));
  } catch (e) {
    return { message: `<序列化失败: ${e.message}>` };
  }
}

// ── 启动序列 ─────────────────────────────────────────────────────────────────
// 宿主 fork 后发送第一条 { op:'load', code, manifest }
// （Node 的 IPC会在监听器注册前排队，不会丢）
const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('模块加载超时（宿主未发送 load）')), 20000);
  process.once('message', (m) => {
    clearTimeout(t);
    resolve(m);
  });
  // 兼容：宿主也可能用 --code-file <path> 传 code（绕开 IPC 大载荷限制）
  const idx = process.argv.indexOf('--code-file');
  if (idx > 0 && process.argv[idx + 1]) {
    try {
      const spec = JSON.parse(fs.readFileSync(process.argv[idx + 1], 'utf8'));
      if (spec && spec.op === 'load') { clearTimeout(t); process.removeAllListeners('message'); resolve(spec); }
    } catch (_) { /* 等待消息 */ }
  }
}).then((msg) => {
  const manifest = (msg && msg.manifest) || {};
  const code = String((msg && msg.code) || '');

  if (!code || code.length > 262144) {
    finishLoadError('模块代码为空或超过 256KB', 'bad_size');
    return;
  }

  const sandbox = Object.create(null);
  sandbox.globalThis = sandbox;
  // 固定注入的两个宿主函数（README 威胁模型已声明）：
  sandbox.__capCall = capCall;
  sandbox.__capReady = (defs) => {
    if (!Array.isArray(defs)) return;
    for (const d of defs) {
      if (d && typeof d === 'object' && typeof d.handler === 'function') {
        apiDefs.set(d.name, d);
      }
    }
  };

  const vmCtx = vm.createContext(sandbox);

  // bootstrap：api 形状校验 + 注册。api 在 vm 内组合 —— 宿主侧只出过 __capCall/__capReady。
  const BOOT = `
    ;(function __capBoot(){
      const __defs = [];
      const api = Object.freeze({
        tools(list) {
          if (!Array.isArray(list) || list.length === 0) throw new Error('api.tools 需要一个非空数组');
          if (list.length > 16) throw new Error('模块最多注册 16 个工具');
          for (const d of list) {
            if (!d || typeof d !== 'object') throw new Error('工具定义必须是对象');
            if (typeof d.name !== 'string' || !__capNameRe.test(d.name)) throw new Error('工具名非法: ' + join(d.name) + '（须 ^[a-z][a-z0-9_]{0,63}$）');
            if (typeof d.description !== 'string' || !d.description.trim()) throw new Error('工具 ' + d.name + ' 缺少 description');
            if (!d.inputSchema || typeof d.inputSchema !== 'object' || Array.isArray(d.inputSchema)) throw new Error('工具 ' + d.name + ' 缺少 inputSchema（JSON Schema 对象）');
            if (typeof d.handler !== 'function') throw new Error('工具 ' + d.name + ' 缺少 handler 函数');
            __defs.push(d);
          }
          __capReady(__defs);
          return __defs.length;
        },
      });
      function join(v) { return v === undefined ? 'undefined' : String(v).slice(0, 64); }
      globalThis.api = api;
    })();
  `;

  // vm timeout（渐进自 rm timeout 功能）：加载块同步执行部分限 10s
  sandbox.__capNameRe = NAME_RE;
  try {
    vm.runInContext(BOOT, vmCtx, { timeout: 5000, displayErrors: true });
    vm.runInContext(code, vmCtx, { timeout: 10000, displayErrors: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    finishLoadError(`模块加载失败: ${err.message.slice(0, 800)}`, 'module_load_error');
    return;
  }

  if (apiDefs.size === 0) {
    finishLoadError('模块未同步调用 api.tools([...])（顶层异步注册不被支持）', 'module_no_tools');
    return;
  }

  // 回报自述（供 install 前校验 / tools/list）
  const defs = [];
  for (const d of apiDefs.values()) {
    defs.push({
      name: d.name,
      description: String(d.description),
      inputSchema: normalize(d.inputSchema),
      exampleArgs: d.exampleArgs ? normalize(d.exampleArgs) : null,
    });
  }
  reply(0, { id: 0, op: 'load', ok: true, result: { tools: defs } });
}).catch((e) => {
  finishLoadError(`子进程启动失败: ${e.message}`, 'boot_fail');
});

function finishLoadError(error, capCode) {
  reply(0, { id: 0, op: 'load', ok: false, error, capCode });
  // 留一拍让 ipc flush 后退出；宿主也会这就地进行清理
  setTimeout(() => process.exit(3), 80);
}
