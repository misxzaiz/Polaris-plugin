'use strict';
/**
 * engine.js —— DuckDB 引擎生命周期 + 工作区单权威（引擎底座：@duckdb/node-api）
 *
 * 底座沿革（2026-11-04 夜班实证，needs/013）：
 *   原方案 duckdb-wasm 1.33.1-dev57.0 有两个引擎级硬伤（writer/reader 进程分离实测）：
 *   ① DETACH 后同实例重 ATTACH 同文件必撞 "already locked exclusively"（实例内锁缓存，
 *      reset 删文件重建这条路走不通）；
 *   ② CHECKPOINT 后数据真实落盘（文件 540KB、DUCK 魔数正确），但全新实例/全新进程重开
 *      catalog 为空 —— 重开持久化在 dev 版 wasm 不可用；正式版 1.29.0 亦未解决。
 *   ⇒ 换 @duckdb/node-api（native binding，DuckDBInstance 直接 open 文件）：
 *      重开持久化实测 NATIVE_REOPEN_OK（中文无损），裸表名直解析（default catalog 即
 *      工作区文件），无 worker shim、无引擎下载。
 *   平台边界：vendor 只带 win32-x64 binding；其他平台在 require 处显式报错，不静默。
 *
 * 引擎语义（实测钉版 @duckdb/node-api 2.0.0-r.1）：
 *   - DuckDBInstance.create(workspace.duckdb) 打开即默认 catalog，表名直接解析；
 *   - 读结果走 runAndReadAll + getRowObjectsJson：BIGINT→字符串（保精度不炸 INT128 转换，
 *     getRowObjectsJS 会因 INT64 越界抛 Conversion Error）；
 *   - count(*) 出口统一 Number()；
 *   - connection.interrupt() 存在，v0.1 不接（查询不可取消的边界如实保留）。
 *
 * 重启恢复语义：每次写操作（import/drop/reset）后 CHECKPOINT 落盘 —— 不依赖进程优雅退出
 * （服务被 kill 重启时数据已在文件里），registry.json 仅作展示元数据，真相以 duckdb_tables
 * 对账为准。
 */
const fs = require('fs');
const path = require('path');
const core = require('./core');

const QUEUE_TIMEOUT_MS = 10 * 60 * 1000; // 单操作排队上限（本地大查询合理耗时，非同步掩码）

// DuckDB LogicalTypeId 整数族（@duckdb/node-bindings 枚举值实测：5=BIGINT 20=HUGEINT 等；
// 2=TINYINT 3=SMALLINT 4=INTEGER 6=UTINYINT 7=USMALLINT 8=UINTEGER 9=UBIGINT 21=UHUGEINT）
const INTEGER_TYPEIDS = new Set([2, 3, 4, 5, 6, 7, 8, 9, 20, 21]);

function slog(msg) { process.stderr.write(`[data-query:engine] ${msg}\n`); }

/** 加载 vendor 内 native 绑定（假 node_modules 结构保标准解析链；平台缺失显式报错） */
function loadDuckDB() {
  const root = path.join(__dirname, 'vendor', 'duckdb', 'node_modules', '@duckdb', 'node-api');
  if (!fs.existsSync(root)) {
    throw new Error('引擎绑定缺失（service/vendor/duckdb/），请重新安装插件');
  }
  const plat = `${process.platform}-${process.arch}`;
  if (!fs.existsSync(path.join(__dirname, 'vendor', 'duckdb', 'node_modules', `@duckdb`, `node-bindings-${plat}`))) {
    throw new Error(`数据查询台 v0.1 引擎仅随包 Windows x64（检测到 ${plat}）；请在 Windows x64 宿主使用，或自行安装 ${plat} binding 后重试`);
  }
  // eslint-disable-next-line global-require
  return require(root); // 绝对路径 require 绕开宿主无关的模块解析
}

// ── 引擎 ──────────────────────────────────────────────────────────────────
class Engine {
  /**
   * @param {{engineDir?:string, workspaceDir:string, maxImportBytes?:number, onStatus?:Function}} opts
   *   workspaceDir：workspace.duckdb + registry.json 目录（engineDir 仅存转码临时文件，兼容旧参数）
   */
  constructor(opts) {
    this.engineDir = opts.engineDir || opts.workspaceDir;
    this.workspaceDir = opts.workspaceDir;
    this.maxImportBytes = opts.maxImportBytes || core.LIMITS.PATH_IMPORT_BYTES;
    this.onStatus = opts.onStatus || (() => {});
    this.state = 'absent'; // absent | initializing | ready | error
    this.progress = 0;
    this.error = '';
    this.instance = null;
    this.conn = null;
    this.initPromise = null;
    this.queueTail = Promise.resolve();
    this.registry = []; // [{table, source, kind, rows, sizeBytes, importedAt}]
  }

  // ── 对外状态 ──
  status() {
    const wsFile = this.workspaceFile();
    return {
      engine: this.state,
      engineVersion: core.NATIVE.VERSION,
      progress: Math.round(this.progress * 100),
      error: this.error,
      tables: this.state === 'ready' ? this.registry.length : 0,
      workspaceFile: wsFile,
      workspaceBytes: this.state === 'ready' && fs.existsSync(wsFile) ? fs.statSync(wsFile).size : 0,
      rowsTotal: this.registry.reduce((a, r) => a + (r.rows || 0), 0),
    };
  }

  workspaceFile() { return path.join(this.workspaceDir, 'workspace.duckdb'); }
  registryFile() { return path.join(this.workspaceDir, 'registry.json'); }
  tmpDir() { return path.join(this.engineDir, 'tmp'); }

  protectedPaths() {
    return [this.workspaceFile(), this.workspaceFile() + '.wal', this.registryFile()];
  }

  // ── 初始化（幂等；并发调用共享同一 promise）──
  ensure() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init().catch((e) => {
      this.state = 'error';
      this.error = e && e.message ? e.message : String(e);
      this.initPromise = null; // 允许下次重试
      throw e;
    });
    return this.initPromise;
  }

  async _init() {
    this.state = 'initializing';
    this.onStatus(this.status());
    const duckdb = loadDuckDB();
    fs.mkdirSync(this.workspaceDir, { recursive: true });
    fs.mkdirSync(this.tmpDir(), { recursive: true });
    // native 打开文件即默认 catalog：裸表名直解析，无 ATTACH 别名/USE 链
    this.instance = await duckdb.DuckDBInstance.create(this.workspaceFile());
    this.conn = await this.instance.connect();
    await this._reconcileRegistry();

    this.state = 'ready';
    this.error = '';
    this.onStatus(this.status());
    slog(`ready: workspace=${this.workspaceFile()}, tables=${this.registry.length}`);
  }

  /** 注册表对账：库里有而注册表没有 → 按 duckdb_tables 补；注册表有而库里没有 → 删 */
  async _reconcileRegistry() {
    const res = await this.conn.runAndReadAll('SELECT table_name FROM duckdb_tables()');
    const dbTables = new Set((await res.getRowObjectsJson()).map((r) => String(r.table_name)));
    let reg = [];
    try { reg = JSON.parse(fs.readFileSync(this.registryFile(), 'utf8')); } catch (_) { /* 空 */ }
    const regTables = new Set(reg.map((r) => r.table));
    const merged = [];
    for (const item of reg) {
      if (dbTables.has(item.table)) {
        item.rows = await this._count(item.table);
        merged.push(item);
      }
    }
    for (const t of dbTables) {
      if (!regTables.has(t)) {
        merged.push({ table: t, source: '(未知来源：恢复自工作区)', kind: 'unknown', rows: await this._count(t), sizeBytes: 0, importedAt: '' });
      }
    }
    merged.sort((a, b) => a.table.localeCompare(b.table));
    this.registry = merged;
    this._saveRegistry();
  }

  _saveRegistry() {
    try { fs.writeFileSync(this.registryFile(), JSON.stringify(this.registry, null, 1)); } catch (e) {
      slog(`registry save failed: ${e.message}`);
    }
  }

  async _count(table) {
    const { rows } = await this._runRows(`SELECT count(*)::BIGINT AS c FROM ${quoteIdent(table)}`);
    return rows[0] ? Number(rows[0].c) : 0;
  }

  /**
   * 读查询统一出口：列名 + JSON 行，结果即取即关。
   * 整数族列（BIGINT/HUGEINT 等）在 JSON 出口是字符串（保精度）——安全整数范围内回归 Number，
   * 对齐原 wasm 版出口语义（前端 Grid numeric 右对齐 / MCP markdown 数字字面量依赖 number 形态）；
   * 超过安全整数保留 string（精度优先）。VARCHAR 列不受影响（typeId 判别，非内容判别）。
   */
  async _runRows(sql) {
    const res = await this.conn.runAndReadAll(sql);
    let columns;
    try { columns = res.columnNames(); } catch (_) { columns = []; }
    let typeIds = [];
    try { typeIds = res.columnTypesJson().map((t) => (t && t.typeId) ?? -1); } catch (_) { /* 容错走原值 */ }
    const raw = await res.getRowObjectsJson();
    try { res.closeSync(); } catch (_) { /* 流式结果容错 */ }
    const rows = raw.map((row) => {
      const o = {};
      let i = 0;
      for (const k of columns) {
        let v = row[k];
        if (INTEGER_TYPEIDS.has(typeIds[i]) && typeof v === 'string' && /^-?\d+$/.test(v)) {
          const n = Number(v);
          if (Number.isSafeInteger(n)) v = n;
        }
        o[k] = v === undefined ? null : v;
        i += 1;
      }
      return o;
    });
    return { columns: columns.length ? columns : (raw.length ? Object.keys(raw[0]) : []), rows };
  }

  // ── 串行队列：所有引擎操作单飞，避免并发写工作区 ──
  _enqueue(label, fn) {
    const run = this.queueTail.then(() => fn());
    // 队列不被单个失败打死
    this.queueTail = run.then(() => {}, (e) => slog(`op failed (${label}): ${e && e.message ? e.message : e}`));
    // 排队护栏：前一任务久久不返回时后续任务限时报错（只防无限饿死，不掩同步问题）
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`操作 ${label} 排队超时（>10 分钟，前一查询未结束）`)), QUEUE_TIMEOUT_MS);
      run.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
  }

  // ── 导入：路径 ──
  async importPath(p, wantName) {
    await this.ensure();
    return this._enqueue('import', () => this._importFile(String(p || '').trim(), wantName, null));
  }

  // ── 导入：内存字节（上传通道）──
  async importBytes(name, buf) {
    await this.ensure();
    return this._enqueue('import-bytes', async () => {
      if (!buf || buf.length > core.LIMITS.UPLOAD_BYTES) {
        throw new Error(`内存导入上限 ${Math.round(core.LIMITS.UPLOAD_BYTES / 1048576)}MB`);
      }
      const tmp = path.join(this.tmpDir(), `up-${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      fs.writeFileSync(tmp, buf);
      try {
        // 注意 await：finally 必须等导入真正完成才能删临时文件（engine-tests 抓到的竞态）
        return await this._importFile(tmp, path.basename(name).replace(/\.[a-z0-9]+$/i, ''), path.basename(name));
      } finally {
        setImmediate(() => { try { fs.rmSync(tmp, { force: true }); } catch (_) { /* 忽略 */ } });
      }
    });
  }

  async _importFile(p, wantName, displayNameOverride) {
    if (!p) throw new Error('路径为空');
    let st;
    try { st = fs.statSync(p); } catch (_) { throw new Error(`文件不存在或不可读：${p}`); }
    if (st.isDirectory()) throw new Error('目标是一个目录，请给文件路径');
    if (st.size > this.maxImportBytes) {
      throw new Error(`文件 ${(st.size / 1048576).toFixed(1)}MB 超过导入上限 ${(this.maxImportBytes / 1048576).toFixed(0)}MB`);
    }

    const displayName = displayNameOverride || path.basename(p);
    let kind = core.sniffKind(displayName, '');
    let sourcePath = p;

    // 文本类：编码探测；非严格 UTF-8 → 流式转码 UTF-8 副本（恒定内存）
    if (kind === 'csv' || kind === 'tsv' || kind === 'json' || kind === 'jsonl') {
      const head = readHead(p, 1024);
      const sampleText = safeDecode(head);
      kind = core.sniffKind(displayName, sampleText) || kind;
      const det = core.detectEncoding(head);
      if (det.encoding !== 'utf-8') {
        let dec;
        try {
          dec = core.makeTextDecoder(det.encoding);
        } catch (_) {
          throw new Error(`本机 Node 缺少 ${det.encoding} 解码支持（需 full-ICU 构建）；请先用编辑器把文件转存为 UTF-8 再导入`);
        }
        sourcePath = await transcodeToUtf8(p, dec, this.tmpDir(), det.bom);
        slog(`transcoded ${det.encoding} → utf-8: ${sourcePath}`);
      }
    }
    if (!kind) {
      throw new Error('不认识的文件类型：支持 .csv/.tsv/.txt/.json/.jsonl/.ndjson/.parquet');
    }

    const taken = this.registry.map((r) => r.table);
    const base = core.sanitizeTableName(wantName || path.basename(displayName).replace(/\.[a-z0-9]+$/i, ''));
    // 同名语义：显式指定表名 → 覆盖刷新（幂等）；自动派生名撞上"不同来源"的既有表 → 去重让位
    const existing = this.registry.find((r) => r.table === base);
    const table = existing && (wantName || existing.source === displayName)
      ? base
      : core.dedupeTableName(base, taken);
    const from = readerFor(kind, sourcePath);
    const t0 = Date.now();
    await this.conn.run(`CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT * FROM ${from}`);
    const rows = await this._count(table);
    await this._checkpoint();
    const elapsedMs = Date.now() - t0;
    if (rows === 0) slog(`warning: imported table ${table} has 0 rows`);

    this.registry = this.registry.filter((r) => r.table !== table);
    this.registry.push({
      table, source: displayName, kind, rows,
      sizeBytes: st.size, importedAt: new Date().toISOString(),
    });
    this.registry.sort((a, b) => a.table.localeCompare(b.table));
    this._saveRegistry();
    if (sourcePath !== p) setImmediate(() => { try { fs.rmSync(sourcePath, { force: true }); } catch (_) { /* 忽略 */ } });
    return { table, rows, elapsedMs, kind, source: displayName };
  }

  /** 写操作后落盘（不依赖进程优雅退出；CHECKPOINT 失败仅告警不炸——下次写操作会再试） */
  async _checkpoint() {
    try { await this.conn.run('CHECKPOINT'); } catch (e) { slog(`checkpoint failed: ${e.message}`); }
  }

  // ── 查询（只读护在 server 层调 core.assertReadOnlySelect）──
  async query(sql, maxRows) {
    await this.ensure();
    return this._enqueue('query', async () => {
      const t0 = Date.now();
      const { columns, rows: all } = await this._runRows(sql);
      const cap = Math.min(Math.max(1, maxRows || core.LIMITS.QUERY_ROWS_DEFAULT), core.LIMITS.QUERY_ROWS_MAX);
      const rows = all.slice(0, cap);
      return { columns, rows, rowCount: all.length, truncated: all.length > cap, elapsedMs: Date.now() - t0 };
    });
  }

  async schema(table) {
    await this.ensure();
    return this._enqueue('schema', async () => {
      const t = String(table || '');
      if (!this.registry.find((r) => r.table === t)) throw new Error(`表不存在：${t}（见 /tables）`);
      // DESCRIBE 的行才是元数据（column_name/column_type 列）；_runRows 的 columns 是结果列名数组
      const { rows: descRows } = await this._runRows(`DESCRIBE ${quoteIdent(t)}`);
      const columns = descRows.map((r) => ({ name: String(r.column_name), type: String(r.column_type) }));
      const { rows: sample } = await this._runRows(`SELECT * FROM ${quoteIdent(t)} LIMIT 3`);
      return { table: t, columns, sample };
    });
  }

  async preview(table, n) {
    await this.ensure();
    return this._enqueue('preview', async () => {
      const t = String(table || '');
      if (!this.registry.find((r) => r.table === t)) throw new Error(`表不存在：${t}`);
      const cap = Math.min(Math.max(1, n || 10), core.LIMITS.PREVIEW_ROWS_MAX);
      const { columns, rows } = await this._runRows(`SELECT * FROM ${quoteIdent(t)} LIMIT ${cap}`);
      return { columns, rows };
    });
  }

  async tables() {
    await this.ensure();
    return this._enqueue('tables', async () => {
      const out = [];
      for (const r of this.registry) {
        out.push({
          table: r.table, source: r.source, kind: r.kind,
          rows: r.rows, sizeBytes: r.sizeBytes, importedAt: r.importedAt,
        });
      }
      return out;
    });
  }

  async drop(table) {
    await this.ensure();
    return this._enqueue('drop', async () => {
      const t = String(table || '');
      if (!this.registry.find((r) => r.table === t)) throw new Error(`表不存在：${t}`);
      await this.conn.run(`DROP TABLE ${quoteIdent(t)}`);
      await this._checkpoint();
      this.registry = this.registry.filter((r) => r.table !== t);
      this._saveRegistry();
      return { dropped: t };
    });
  }

  /**
   * 重置工作区 = 清空全部表 + CHECKPOINT（文件保留）。
   * 不走「DETACH→删文件→重挂」：wasm 底座实测 DETACH 后同实例重 ATTACH 必撞实例内锁缓存
   * （needs/013 夜班实证）；native 底座下 drop-all 语义与面板文案「删除全部已导入表」精确一致，
   * 且彻底避开文件锁与句柄释放时序问题。
   */
  async reset(confirm) {
    if (confirm !== true) throw new Error('重置工作区将删除所有已导入表，需显式 confirm:true');
    await this.ensure();
    return this._enqueue('reset', async () => {
      const { rows } = await this._runRows('SELECT table_name FROM duckdb_tables()');
      const names = rows.map((r) => String(r.table_name));
      for (const t of names) await this.conn.run(`DROP TABLE ${quoteIdent(t)}`);
      await this._checkpoint();
      this.registry = [];
      this._saveRegistry();
      return { reset: true, dropped: names.length };
    });
  }

  /** 释放引擎（测试/重启场景用；服务进程通常直接退出） */
  async terminate() {
    try { if (this.conn) this.conn.closeSync(); } catch (_) { /* 忽略 */ }
    try { if (this.instance) this.instance.closeSync(); } catch (_) { /* 忽略 */ }
    this.conn = null;
    this.instance = null;
    this.state = 'absent';
    this.initPromise = null;
  }

  /**
   * 导出：先跑 count 报告行数（开销=重复执行一次，v0.1 如实接受），
   * 再 COPY(<select>) TO 文件；csv 附加 UTF-8 BOM（Excel 直开不乱码，流式补写恒定内存）。
   */
  async exportQuery({ sql, outPath, format, overwrite }) {
    await this.ensure();
    return this._enqueue('export', async () => {
      const fmt = core.LIMITS.EXPORT_FORMATS.includes(format) ? format : 'csv';
      const finalPath = outPath.trim();
      // overwrite:true 时先删旧文件再过护栏——护栏的「已存在」检查看到的是删后的世界。
      // 原实现把删除放在 guard 之后，overwrite:true 永远被 guard 的「文件已存在」拒掉
      // （11-02 半成品从未跑过测试所以未暴露；engine-tests export 用例实证）。
      if (overwrite === true && fs.existsSync(finalPath)) fs.rmSync(finalPath, { force: true });
      const guard = core.exportPathGuard(finalPath, {
        exists: (x) => fs.existsSync(x),
        isDir: (x) => { try { return fs.statSync(x).isDirectory(); } catch (_) { return false; } },
        protectedPaths: this.protectedPaths(),
      });
      if (!guard.ok) { const e = new Error(guard.error); e.userFacing = true; throw e; }

      const { rows: cntRows } = await this._runRows(`SELECT count(*)::BIGINT AS c FROM (${sql}) __dq_count`);
      const cnt = cntRows[0] ? Number(cntRows[0].c) : 0;
      const t0 = Date.now();
      // Windows 反斜杠路径在 DuckDB 字符串字面量里是非法转义（\U…），统一转正斜杠
      const quoted = finalPath.replace(/\\/g, '/').replace(/'/g, "''");
      if (fmt === 'csv') {
        await this.conn.run(`COPY (${sql}) TO '${quoted}' (FORMAT CSV, HEADER, DELIMITER ',')`);
        await prependBom(finalPath);
      } else if (fmt === 'json') {
        await this.conn.run(`COPY (${sql}) TO '${quoted}' (FORMAT JSON, ARRAY true)`);
      } else {
        await this.conn.run(`COPY (${sql}) TO '${quoted}' (FORMAT JSON)`);
      }
      const bytes = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : 0;
      return { path: finalPath, format: fmt, rows: cnt, bytes, elapsedMs: Date.now() - t0 };
    });
  }
}

// ── 工具函数 ───────────────────────────────────────────────────────────────
/** SQL 标识符引用：工作区内部表名由 sanitizeTableName 收敛为 [A-Za-z0-9_]，双引号防御未来漂移 */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function readHead(file, n) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, got);
  } finally {
    fs.closeSync(fd);
  }
}

function safeDecode(buf) {
  try { return new TextDecoder('utf-8', { fatal: false }).decode(buf); } catch (_) { return ''; }
}

/** 流式转码 → UTF-8 副本（恒定内存；TextDecoder stream 模式跨块拼接多字节字符） */
function transcodeToUtf8(src, decoder, tmpDir, hasBom) {
  return new Promise((resolve, reject) => {
    const dest = path.join(tmpDir, `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.utf8.csv`);
    const input = fs.createReadStream(src, { highWaterMark: 1 << 20 });
    const output = fs.createWriteStream(dest);
    input.on('data', (chunk) => {
      const text = decoder.decode(chunk, { stream: true });
      output.write(Buffer.from(text, 'utf8')); // 源 BOM 已被 TextDecoder 吃掉；目标统一不带 BOM（duckdb 兼容）
    });
    input.on('end', () => {
      const tail = decoder.decode(); // 冲刷残字节
      if (tail) output.write(Buffer.from(tail, 'utf8'));
      output.end(() => resolve(dest));
    });
    input.on('error', reject);
    output.on('error', reject);
  });
}

/** CSV 导出补 UTF-8 BOM（Excel 直开不乱码）；流式恒定内存 */
function prependBom(file) {
  return new Promise((resolve) => {
    const fd = fs.openSync(file, 'r');
    const probe = Buffer.alloc(3);
    const got = fs.readSync(fd, probe, 0, 3, 0);
    fs.closeSync(fd);
    if (got >= 3 && probe[0] === 0xef && probe[1] === 0xbb && probe[2] === 0xbf) { resolve(); return; }
    const tmp = `${file}.bom`;
    const out = fs.createWriteStream(tmp);
    out.write(Buffer.from([0xef, 0xbb, 0xbf]));
    fs.createReadStream(file).pipe(out);
    out.on('finish', () => { fs.renameSync(tmp, file); resolve(); });
    out.on('error', () => { try { fs.rmSync(tmp, { force: true }); } catch (_) { /* 忽略 */ } resolve(); });
  });
}

/** kind → reader 表达式（tsv/txt 定界符显式；INSTALL/LOAD 被护 ⇒ 不可能读远程 URL）。
 *  Windows 反斜杠路径必须转正斜杠：反斜杠在 DuckDB 字符串字面量里是非法转义（engine-tests 回归）。 */
function readerFor(kind, p) {
  const q = String(p).replace(/\\/g, '/').replace(/'/g, "''");
  if (kind === 'tsv') return `read_csv_auto('${q}', delim='\t', header=true)`;
  if (kind === 'json') return `read_json_auto('${q}')`;
  if (kind === 'jsonl') return `read_json_auto('${q}', format='newline_delimited')`;
  if (kind === 'parquet') return `read_parquet('${q}')`;
  return `read_csv_auto('${q}', header=true)`;
}

module.exports = { Engine };
