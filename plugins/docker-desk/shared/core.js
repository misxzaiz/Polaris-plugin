'use strict';
/**
 * core.js —— docker-desk 纯逻辑层（零依赖，service/mcp/测试共享）
 *
 * 只放「给定输入必然得到确定输出」的函数：格式化、解析、归一化、demux、CPU 计算、
 * compose 分组。任何 IO（http/fs/kv）都不得进入本文件——离线单测的全部对象在这里。
 */

const VERSION = '0.1.0';

// ── 上限纪律（全部集中在这里，service/mcp 引用同名常量，禁止散落魔法数） ──────
const LIMITS = {
  /** 单条日志行最大字符数（超长截断，防止单行 base64/堆栈撑爆面板与 AI 上下文） */
  LOG_LINE_CHARS: 2000,
  /** 一次性日志返回最大行数（面板/MCP 通用硬顶） */
  LOG_LINES_MAX: 1000,
  /** 日志 follow 流向面板输出的总字节上限（超限主动断流并提示） */
  LOG_STREAM_BYTES: 8 * 1024 * 1024,
  /** MCP 单次日志 tail 默认行数 */
  MCP_LOG_TAIL: 200,
  /** MCP inspect 返回 JSON 序列化后最大字符数 */
  MCP_INSPECT_CHARS: 12000,
  /** 事件环形缓冲条数（service 内存，不落盘） */
  EVENTS_RING: 500,
  /** MCP 表格行数上限 */
  MCP_ROWS: 50,
  /** 容器列表条数上限（超出提示用过滤缩小范围） */
  CONTAINERS_MAX: 500,
};

// ── 格式化 ────────────────────────────────────────────────────────────────────

/** 人类可读字节数；null/undefined/非数字 → '—' */
function fmtBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = -1;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

/** 人类可读时长；输入 ms */
function fmtDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24}h`;
}

/** 容器状态 → 中文展示（+ 是否视为运行中） */
const RUNNING_STATES = new Set(['running', 'restarting', 'paused']);

function stateLabel(state) {
  switch (state) {
    case 'created': return '已创建';
    case 'running': return '运行中';
    case 'paused': return '已暂停';
    case 'restarting': return '重启中';
    case 'removing': return '删除中';
    case 'exited': return '已退出';
    case 'dead': return '僵死';
    default: return state || '未知';
  }
}

// ── 容器/端口/镜像归一化（Engine API 原始结构 → 面板/MCP 友好结构） ───────────

/** com.docker.compose.* 标签 */
function composeOf(labels) {
  const l = labels || {};
  return {
    project: typeof l['com.docker.compose.project'] === 'string' ? l['com.docker.compose.project'] : '',
    service: typeof l['com.docker.compose.service'] === 'string' ? l['com.docker.compose.service'] : '',
  };
}

/** Ports 数组 → "0.0.0.0:8080->80/tcp" 列表（最多 8 条防刷屏） */
function parsePorts(ports) {
  if (!Array.isArray(ports)) return [];
  const out = [];
  for (const p of ports) {
    if (!p || typeof p.PrivatePort !== 'number') continue;
    const host = typeof p.IP === 'string' && p.IP ? `${p.IP}:${p.PublicPort}` : (typeof p.PublicPort === 'number' ? `:${p.PublicPort}` : '');
    out.push(host ? `${host}->${p.PrivatePort}/${p.Type || 'tcp'}` : `${p.PrivatePort}/${p.Type || 'tcp'}`);
    if (out.length >= 8) { out.push('…'); break; }
  }
  return out;
}

/**
 * GET /containers/json 单条 → 归一化。id 取 12 位短 id（Engine 短 id 即可精确定位，
 * 我们的所有后续调用都接受短 id——Engine 按 id 前缀匹配）。
 */
function normalizeContainer(c, nowMs) {
  if (!c || typeof c.Id !== 'string') return null;
  const compose = composeOf(c.Labels);
  const createdAt = typeof c.Created === 'number' ? c.Created * 1000 : null;
  const names = Array.isArray(c.Names) && c.Names.length ? c.Names[0] : '';
  return {
    id: c.Id.slice(0, 12),
    name: (names.startsWith('/') ? names.slice(1) : names) || c.Id.slice(0, 12),
    image: typeof c.Image === 'string' ? c.Image : '',
    state: typeof c.State === 'string' ? c.State : 'unknown',
    stateText: stateLabel(c.State),
    running: RUNNING_STATES.has(c.State),
    status: typeof c.Status === 'string' ? c.Status : '',
    createdAt,
    age: createdAt ? fmtDuration(Math.max(0, (nowMs || Date.now()) - createdAt)) : '—',
    ports: parsePorts(c.Ports),
    composeProject: compose.project,
    composeService: compose.service,
  };
}

/** compose 项目分组：有 project 标签的进组（按名排序），其余 loose */
function groupByCompose(items) {
  const projects = new Map();
  const loose = [];
  for (const it of items || []) {
    if (it && it.composeProject) {
      if (!projects.has(it.composeProject)) projects.set(it.composeProject, []);
      projects.get(it.composeProject).push(it);
    } else {
      loose.push(it);
    }
  }
  return {
    projects: Array.from(projects.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, list]) => ({
        name,
        running: list.filter((x) => x.running).length,
        total: list.length,
        items: list.sort((a, b) => a.name.localeCompare(b.name)),
      })),
    loose: loose.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** GET /images/json 单条 → 归一化（RepoTags 可能空 → <none>） */
function normalizeImage(i) {
  if (!i || typeof i.Id !== 'string') return null;
  const tags = Array.isArray(i.RepoTags) ? i.RepoTags.filter(Boolean) : [];
  const [repoTag] = tags;
  const at = repoTag ? repoTag.lastIndexOf(':') : -1;
  return {
    id: i.Id.replace(/^sha256:/, '').slice(0, 12),
    repo: at > 0 ? repoTag.slice(0, at) : (tags[0] || '<none>'),
    tag: at > 0 ? repoTag.slice(at + 1) : (tags[0] ? 'latest' : '<none>'),
    tags: tags.slice(0, 4),
    size: typeof i.Size === 'number' ? i.Size : null,
    created: typeof i.Created === 'number' ? i.Created * 1000 : null,
    containers: Array.isArray(i.Containers) ? i.Containers.filter((c) => c !== '-1').length : 0,
  };
}

// ── stats：CPU% 用 Engine 官方公式（cpu_delta/system_delta/online_cpus） ─────

function safeDiv(a, b) { return b > 0 ? a / b : 0; }

/**
 * stats?stream=false 单帧 → 面板快照。
 * 公式与 docker stats CLI 一致：cpu% = (cpuDelta / systemDelta) / onlineCpus * 100。
 * 刚启动容器 system_delta 可能为 0 → 显示 0.0%（与 CLI 行为一致）。
 */
function normalizeStats(raw) {
  const cpu = (raw && raw.cpu_stats) || {};
  const pre = (raw && raw.precpu_stats) || {};
  const mem = (raw && raw.memory_stats) || {};
  const cpuDelta = (cpu.cpu_usage && cpu.cpu_usage.total_usage) - (pre.cpu_usage && pre.cpu_usage.total_usage) || 0;
  const sysDelta = (cpu.system_cpu_usage || 0) - (pre.system_cpu_usage || 0) || 0;
  const online = (cpu.online_cpus) || (cpu.cpu_usage && Array.isArray(cpu.cpu_usage.percpu_usage) ? cpu.cpu_usage.percpu_usage.length : 1) || 1;
  const cpuPct = sysDelta > 0 && cpuDelta > 0 ? (safeDiv(cpuDelta, sysDelta) / online) * 100 : 0;
  const memUsed = typeof mem.usage === 'number' ? Math.max(0, mem.usage - (mem.stats && (mem.stats.cache || mem.stats.inactive_file)) || 0) : null;
  const memLimit = typeof mem.limit === 'number' ? mem.limit : null;
  const net = raw && raw.networks ? Object.values(raw.networks)[0] : null;
  const blk = (raw && (raw.blkio_stats || {}).io_service_bytes_recursive) || [];
  const blkOf = (op) => blk.filter((x) => x && x.op === op).reduce((s, x) => s + (x.value || 0), 0);
  return {
    cpuPct: Math.round(cpuPct * 10) / 10,
    memUsed,
    memLimit,
    memPct: memUsed != null && memLimit ? Math.round(safeDiv(memUsed, memLimit) * 1000) / 10 : null,
    netRx: net ? net.rx_bytes : null,
    netTx: net ? net.tx_bytes : null,
    blkRead: blkOf('Read'),
    blkWrite: blkOf('Write'),
  };
}

// ── system df：磁盘占用与可回收 ──────────────────────────────────────────────

/** GET /system/df → 汇总（镜像含 dangling=无 RepoTags 的可回收计算） */
function dfSummary(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const images = Array.isArray(r.Images) ? r.Images : [];
  const containers = Array.isArray(r.Containers) ? r.Containers : [];
  const volumes = Array.isArray(r.Volumes) ? r.Volumes : [];
  const buildCache = Array.isArray(r.BuildCache) ? r.BuildCache : [];
  const dangling = images.filter((i) => i && (!Array.isArray(i.RepoTags) || i.RepoTags.length === 0));
  const reclaimImages = dangling.reduce((s, i) => s + (i.Size || 0), 0)
    + images.filter((i) => i && i.Containers === 0 && Array.isArray(i.RepoTags) && i.RepoTags.length > 0).reduce((s, i) => s + (i.Size || 0), 0);
  const reclaimBuild = buildCache.reduce((s, c) => s + ((c && c.SizeInBytes) || 0), 0);
  const volSize = (v) => (v && v.UsageData && typeof v.UsageData.Size === 'number' ? v.UsageData.Size : 0);
  return {
    imagesCount: images.length,
    imagesSize: images.reduce((s, i) => s + (i.Size || 0), 0),
    danglingCount: dangling.length,
    containersCount: containers.length,
    containersSize: containers.reduce((s, c) => s + ((c && (c.SizeRw || 0)) || 0), 0),
    volumesCount: volumes.length,
    volumesSize: volumes.reduce((s, v) => s + volSize(v), 0),
    buildCacheCount: buildCache.length,
    reclaimable: reclaimImages + reclaimBuild,
    reclaimImages,
    reclaimBuildCache: reclaimBuild,
  };
}

// ── 日志 demux（Engine 多路复用帧 → 行） ─────────────────────────────────────

/**
 * 增量 demuxer：容器非 TTY 时 Engine 返回 8 字节帧头
 * [streamType(1B: 1=stdout 2=stderr), 0, 0, 0, size(4B BE)] + payload。
 * TTY 容器（或 swarm journal 等）是裸流 → 首帧不像帧头时整体按 stdout 处理。
 * push() 返回自上次以来解码出的行（不带行尾符）；跨 chunk 的半行/半帧内部缓冲。
 */
class LogDemuxer {
  constructor() {
    this.raw = null;       // null=未判定；true=裸流模式
    this.buf = Buffer.alloc(0);
    this.pending = null;   // 跨 chunk 半行 {buf, stream}
    this.lines = [];
  }

  push(chunk) {
    if (!chunk || !chunk.length) return [];
    this.lines = [];
    if (this.raw === true) { this.feedRaw(chunk); return this.lines; }
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    if (this.raw === null) {
      if (!this.sniff()) return this.lines; // 字节不够，继续等
    }
    // 帧模式：循环剥帧
    for (;;) {
      if (this.buf.length < 8) break;
      const size = this.buf.readUInt32BE(4);
      if (size < 0 || size > 16 * 1024 * 1024) { // 非法帧长 → 判定为裸流（理论不可达，防御）
        this.raw = true;
        const rest = this.buf;
        this.buf = Buffer.alloc(0);
        this.feedRaw(rest);
        break;
      }
      if (this.buf.length < 8 + size) break;
      const streamType = this.buf[0] === 2 ? 'stderr' : 'stdout';
      this.emitLines(this.buf.slice(8, 8 + size), streamType);
      this.buf = this.buf.slice(8 + size);
    }
    return this.lines;
  }

  /** 首块嗅探：8 字节头 [1|2, 0,0,0, 合理 size] 才认定为帧模式 */
  sniff() {
    if (this.buf.length < 8) return false;
    const b0 = this.buf[0];
    const zero = this.buf[1] === 0 && this.buf[2] === 0 && this.buf[3] === 0;
    const size = this.buf.readUInt32BE(4);
    if ((b0 === 1 || b0 === 2) && zero && size <= 16 * 1024 * 1024) {
      this.raw = false;
      return true;
    }
    this.raw = true;
    const rest = this.buf;
    this.buf = Buffer.alloc(0);
    this.feedRaw(rest);
    return true;
  }

  feedRaw(chunk) { this.emitLines(chunk, 'stdout'); }

  /** 按行切分（兼容 \n 与 \r\n）；尾段若非完整行则连同样式进入 pending 等下一个 chunk */
  emitLines(buf, streamType) {
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) {
        let end = i;
        if (end > start && buf[end - 1] === 13) end -= 1;
        this.pushLine(buf.slice(start, end), streamType);
        start = i + 1;
      }
    }
    if (start < buf.length) {
      const seg = buf.slice(start);
      this.pending = this.pending
        ? { buf: Buffer.concat([this.pending.buf, seg]), stream: this.pending.stream }
        : { buf: Buffer.from(seg), stream: streamType };
    }
  }

  /** 一行完结：若此前有半行 pending，则该行归属「行开始时」的流 */
  pushLine(seg, streamType) {
    let text;
    let stream = streamType;
    if (this.pending) {
      text = Buffer.concat([this.pending.buf, seg]).toString('utf8');
      stream = this.pending.stream;
      this.pending = null;
    } else {
      text = seg.toString('utf8');
    }
    if (text.length > LIMITS.LOG_LINE_CHARS) text = `${text.slice(0, LIMITS.LOG_LINE_CHARS)}…[截断]`;
    this.lines.push({ stream, text });
  }
}

/** 一次性 demux 整段 buffer → {stream, text}[]（测试/一次性日志用） */
function demuxAll(buffer) {
  const d = new LogDemuxer();
  return d.push(buffer);
}

// ── 事件 ─────────────────────────────────────────────────────────────────────

/** GET /events 的单条 NDJSON → 紧凑展示结构（unknown 容错：事件结构随引擎版本漂移） */
function normalizeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const actorName = ev.Actor && ev.Actor.Attributes
    ? (ev.Actor.Attributes.name || ev.Actor.Attributes.container || '')
    : '';
  const attrs = (ev.Actor && ev.Actor.Attributes) || {};
  const interesting = {};
  for (const k of ['exitCode', 'signal', 'image', 'oomKilled', 'error', 'execDuration', 'healthStatus']) {
    if (attrs[k] !== undefined) interesting[k] = String(attrs[k]).slice(0, 120);
  }
  return {
    time: typeof ev.time === 'number' ? (ev.timeNano ? Math.floor(ev.timeNano / 1e6) : ev.time * 1000) : Date.now(),
    type: typeof ev.Type === 'string' ? ev.Type : '?',
    action: typeof ev.Action === 'string' ? ev.Action : '?',
    actor: actorName || (ev.Actor && ev.Actor.ID ? String(ev.Actor.ID).slice(0, 12) : ''),
    attrs: interesting,
  };
}

/** 事件 → 单行文本（面板/MCP 共用） */
function eventLine(ev) {
  const e = normalizeEvent(ev);
  if (!e) return '';
  const extra = Object.entries(e.attrs).map(([k, v]) => `${k}=${v}`).join(' ');
  return `${new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })}  ${e.type}/${e.action}  ${e.actor}${extra ? `  ${extra}` : ''}`;
}

// ── 错误归一化（连接层错误 → 可读中文） ─────────────────────────────────────

/** 连接类错误的引擎可读化；code 取自 errno（ENOENT/EACCES/ECONNREFUSED…） */
function normEngineError(e) {
  const code = e && (e.code || (e.cause && e.cause.code));
  const msg = e && e.message ? e.message : String(e);
  if (code === 'ENOENT') return { readable: '未找到 Docker 引擎通信端点（Docker 可能未安装或未启动）', code: String(code) };
  if (code === 'ECONNREFUSED') return { readable: 'Docker 引擎拒绝了连接（Docker 可能正在启动或已停止）', code: String(code) };
  if (code === 'EACCES' || code === 'EPERM') return { readable: '无权限访问 Docker 引擎端点（Windows 需当前用户在 docker-users 组）', code: String(code) };
  if (code === 'ETIMEDOUT') return { readable: '连接 Docker 引擎超时', code: String(code) };
  return { readable: msg.slice(0, 300), code: code ? String(code) : '' };
}

/** 引擎端点 → 脱敏展示（不泄露 unix 路径之外的任何东西；TCP 显示 host:port） */
function describeEndpoint(ep) {
  if (!ep) return '—';
  if (ep.kind === 'npipe') return `named pipe ${ep.path}`;
  if (ep.kind === 'unix') return `unix socket ${ep.path}`;
  if (ep.kind === 'tcp') return `tcp://${ep.host}:${ep.port}`;
  return String(ep.kind);
}

// ── 自检（纯逻辑，零 IO；被 service /api/selftest 与 MCP dk_selftest 调用） ──

function selfTest() {
  const checks = [];
  const t = (name, ok, detail) => checks.push({ name, ok, detail: ok ? '' : String(detail || '断言失败') });

  t('fmtBytes', fmtBytes(1536) === '1.5 KB' && fmtBytes(0) === '0 B' && fmtBytes(null) === '—', `fmtBytes(1536)=${fmtBytes(1536)}`);
  t('fmtDuration', fmtDuration(90000) === '1m30s' && fmtDuration(0) === '0s', `fmtDuration(90000)=${fmtDuration(90000)}`);
  t('parsePorts', (() => {
    const r = parsePorts([{ IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }, { PrivatePort: 443, Type: 'tcp' }]);
    return r[0] === '0.0.0.0:8080->80/tcp' && r[1] === '443/tcp';
  })(), '端口格式不符');
  t('normalizeContainer', (() => {
    const c = normalizeContainer({
      Id: 'abcdef1234567890', Names: ['/web'], Image: 'nginx:1.25', State: 'running',
      Status: 'Up 2 hours', Created: 1700000000, Ports: [], Labels: { 'com.docker.compose.project': 'demo' },
    }, 1700007200000);
    return !!c && c.name === 'web' && c.id === 'abcdef123456' && c.composeProject === 'demo' && c.age === '2h0m';
  })(), '容器归一化字段不符');
  t('groupByCompose', (() => {
    const g = groupByCompose([
      { name: 'b', composeProject: 'p1', running: true },
      { name: 'a', composeProject: 'p1', running: false },
      { name: 'c', composeProject: '', running: false },
    ]);
    return g.projects.length === 1 && g.projects[0].name === 'p1' && g.projects[0].items[0].name === 'a' && g.loose.length === 1;
  })(), 'compose 分组不符');
  t('cpuFormula', (() => {
    const s = normalizeStats({
      cpu_stats: { cpu_usage: { total_usage: 2_000_000_000 }, system_cpu_usage: 10_000_000_000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 1_000_000_000 }, system_cpu_usage: 9_000_000_000 },
      memory_stats: { usage: 300e6, limit: 1e9, stats: { cache: 100e6 } },
      networks: { eth0: { rx_bytes: 10, tx_bytes: 20 } },
    });
    // delta 1e9/1e9 / 2cpu = 50%
    return s.cpuPct === 50 && s.memUsed === 200e6 && s.memPct === 20;
  })(), 'CPU%/内存公式不符');
  t('demuxFrame', (() => {
    const payload = Buffer.from('hello\nworld\n');
    const head = Buffer.alloc(8);
    head[0] = 1; head.writeUInt32BE(payload.length, 4);
    const d = demuxAll(Buffer.concat([head, payload]));
    return d.length === 2 && d[0].text === 'hello' && d[1].text === 'world' && d[0].stream === 'stdout';
  })(), '标准帧 demux 不符');
  t('demuxRaw', (() => {
    const d = demuxAll(Buffer.from('plain tty output\nline2\n'));
    return d.length === 2 && d[0].text === 'plain tty output' && d[0].stream === 'stdout';
  })(), '裸流 demux 不符');
  t('demuxSplitFrame', (() => {
    const payload = Buffer.from('abc\ndef\n');
    const head = Buffer.alloc(8);
    head[0] = 2; head.writeUInt32BE(payload.length, 4);
    const whole = Buffer.concat([head, payload]);
    const d = new LogDemuxer();
    const a = d.push(whole.slice(0, 9));
    const b = d.push(whole.slice(9));
    return b.length === 2 && b[0].stream === 'stderr' && b[0].text === 'abc' && b[1].text === 'def' && a.length === 0;
  })(), '跨 chunk 半帧 demux 不符');
  t('dfSummary', (() => {
    const s = dfSummary({
      Images: [{ RepoTags: ['a:1'], Size: 100, Containers: 0 }, { RepoTags: [], Size: 50, Containers: 0 }, { RepoTags: ['b:2'], Size: 10, Containers: 3 }],
      Containers: [{ SizeRw: 5 }],
      Volumes: [{ UsageData: { Size: 7 } }],
      BuildCache: [{ SizeInBytes: 3 }],
    });
    return s.imagesCount === 3 && s.danglingCount === 1 && s.reclaimable === 153 && s.containersSize === 5;
  })(), 'df 汇总不符');
  t('eventLine', (() => {
    const line = eventLine({ time: 1700000000, Type: 'container', Action: 'die', Actor: { Attributes: { name: 'web', exitCode: '137' } } });
    return line.includes('container/die') && line.includes('web') && line.includes('exitCode=137');
  })(), '事件行不符');
  t('normEngineError', normEngineError({ code: 'ENOENT' }).readable.includes('未找到 Docker 引擎'), '错误归一化不符');

  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

module.exports = {
  VERSION, LIMITS, RUNNING_STATES,
  fmtBytes, fmtDuration, stateLabel,
  composeOf, parsePorts, normalizeContainer, groupByCompose, normalizeImage,
  normalizeStats, dfSummary,
  LogDemuxer, demuxAll,
  normalizeEvent, eventLine,
  normEngineError, describeEndpoint,
  selfTest,
};
