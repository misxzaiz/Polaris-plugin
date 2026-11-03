import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, SERVICE_BASE } from './host';

// ── 类型（对齐 service/server.js 出参）────────────────────────────────────
interface EngineStatus {
  engine: 'absent' | 'initializing' | 'ready' | 'error';
  engineVersion: string;
  progress: number;
  error: string;
  tables: number;
  workspaceFile: string;
  workspaceBytes: number;
  rowsTotal: number;
}
interface StatusInfo {
  ok: boolean;
  version: string;
  port: number;
  dataRoot: string;
  home: string;
  engine: EngineStatus;
  workspaceDir: string;
}
interface TableInfo {
  table: string;
  source: string;
  kind: string;
  rows: number;
  sizeBytes: number;
  importedAt: string;
}
interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  sql?: string;
}
interface Preview { columns: string[]; rows: Record<string, unknown>[] }
interface SchemaInfo { table: string; columns: { name: string; type: string }[]; sample: Record<string, unknown>[] }

interface PanelProps {
  pluginId: string;
  onSendToChat?: (text: string) => void;
}

// ── 本地存储（SQL 历史 / 最近导入路径）────────────────────────────────────
const LS = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(`dq.${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch (_) { return fallback; }
  },
  set(key: string, value: unknown): void {
    try { window.localStorage.setItem(`dq.${key}`, JSON.stringify(value)); } catch (_) { /* 隐私模式等 */ }
  },
};

function fmtSize(bytes: number): string {
  if (!bytes) return '0KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(2)}GB`;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return String(v); } }
  return String(v);
}

function resultToMarkdown(r: QueryResult, maxRows = 40): string {
  const lines = [`| ${r.columns.join(' | ')} |`, `|${r.columns.map(() => ' --- ').join('|')}|`];
  for (const row of r.rows.slice(0, maxRows)) {
    lines.push(`| ${r.columns.map((c) => cellText(row[c])).join(' | ')} |`);
  }
  if (r.rows.length > maxRows) lines.push(`…（共 ${r.rowCount} 行）`);
  return lines.join('\n');
}

function defaultExportPath(home: string, format: 'csv' | 'json'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const base = home ? `${home.replace(/[\\/]+$/, '')}\\Downloads\\dq-${stamp}.${format}` : `D:\\dq-${stamp}.${format}`;
  return base;
}

// ── 面板 ──────────────────────────────────────────────────────────────────
export default function Panel({ onSendToChat }: PanelProps) {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selTable, setSelTable] = useState<string>('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [schemaInfo, setSchemaInfo] = useState<SchemaInfo | null>(null);
  const [sql, setSql] = useState<string>(() => LS.get<string>('lastSql', ''));
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [importPath, setImportPath] = useState<string>('');
  const [importTable, setImportTable] = useState<string>('');
  const [exportPath, setExportPath] = useState<string>('');
  const [showSchema, setShowSchema] = useState<boolean>(true);
  const statusTimer = useRef<number | null>(null);

  const engine = status?.engine;
  const ready = engine?.engine === 'ready';

  const refreshTables = useCallback(async (selectFirst = false) => {
    try {
      const r = await api<{ tables: TableInfo[] }>('GET', '/tables');
      setTables(r.tables);
      setSelTable((cur) => {
        if (cur && r.tables.some((t) => t.table === cur)) return cur;
        return selectFirst && r.tables.length ? r.tables[r.tables.length - 1].table : '';
      });
    } catch (e) { setError((e as Error).message); }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api<StatusInfo>('GET', '/status', undefined, 10000);
      setStatus(s);
      if (s.engine.engine === 'ready') {
        await refreshTables();
      }
      return s;
    } catch (e) {
      setError(`服务不可达（${SERVICE_BASE}）：${(e as Error).message}`);
      return null;
    }
  }, [refreshTables]);

  // 引擎未就绪时轮询状态（初始化/错误），就绪后停轮询
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const s = await refreshStatus();
      if (!cancelled && s && s.engine.engine !== 'ready') {
        statusTimer.current = window.setTimeout(tick, 2500);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 选中表 → 拉预览 + schema
  const selectTable = useCallback(async (name: string) => {
    setSelTable(name);
    setPreview(null);
    setSchemaInfo(null);
    if (!name) return;
    try {
      const [pv, sc] = await Promise.all([
        api<Preview>('GET', `/preview?table=${encodeURIComponent(name)}&n=10`),
        api<SchemaInfo>('GET', `/schema?table=${encodeURIComponent(name)}`),
      ]);
      setPreview(pv);
      setSchemaInfo(sc);
    } catch (e) { setError((e as Error).message); }
  }, []);

  const runQuery = useCallback(async () => {
    const text = sql.trim();
    if (!text) { setError('先写一条 SQL'); return; }
    setBusy('查询中…');
    setError('');
    setNotice('');
    try {
      const r = await api<QueryResult>('POST', '/query', { sql: text, maxRows: 500 }, 600000);
      setResult(r);
      const hist = LS.get<string[]>('history', []).filter((h) => h !== text);
      hist.unshift(text);
      LS.set('history', hist.slice(0, 30));
      setExportPath((cur) => cur || defaultExportPath(status?.home || '', 'csv'));
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally { setBusy(''); }
  }, [sql, status]);

  const doImport = useCallback(async () => {
    const p = importPath.trim();
    if (!p) { setError('先填数据文件路径（如 D:\\data\\orders.csv）'); return; }
    setBusy('导入中…');
    setError('');
    setNotice('');
    try {
      const r = await api<{ table: string; rows: number; elapsedMs: number }>('POST', '/import', {
        path: p, table: importTable.trim() || undefined,
      }, 600000);
      setNotice(`导入成功：${r.table}（${r.rows} 行，${(r.elapsedMs / 1000).toFixed(2)}s）`);
      const rec = LS.get<string[]>('recentPaths', []).filter((x) => x !== p);
      rec.unshift(p);
      LS.set('recentPaths', rec.slice(0, 8));
      setImportPath('');
      setImportTable('');
      await refreshTables();
      await selectTable(r.table);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }, [importPath, importTable, refreshTables, selectTable]);

  const doExport = useCallback(async (format: 'csv' | 'json') => {
    if (!result || !sql.trim()) { setError('先执行一次查询再导出'); return; }
    const p = (exportPath.trim() || defaultExportPath(status?.home || '', format)).replace(/\.(csv|json|ndjson|txt)$/i, `.${format}`);
    setBusy('导出中…');
    setError('');
    setNotice('');
    try {
      const r = await api<{ path: string; rows: number; bytes: number }>('POST', '/export', {
        sql: sql.trim(), path: p, format, overwrite: false,
      }, 600000);
      setNotice(`导出成功：${r.path}（${r.rows} 行，${fmtSize(r.bytes)}）`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }, [result, sql, exportPath, status]);

  const dropTable = useCallback(async (name: string) => {
    if (!window.confirm(`删除表 ${name}？（源文件不受影响，可重新导入）`)) return;
    try {
      await api('POST', '/drop', { table: name });
      if (selTable === name) { setSelTable(''); setPreview(null); setSchemaInfo(null); }
      await refreshTables();
    } catch (e) { setError((e as Error).message); }
  }, [selTable, refreshTables]);

  const resetWorkspace = useCallback(async () => {
    if (!window.confirm('重置工作区将删除全部已导入表（源文件不受影响）。确定？')) return;
    try {
      await api('POST', '/workspace/reset', { confirm: true }, 300000);
      setSelTable(''); setPreview(null); setSchemaInfo(null); setResult(null);
      await refreshTables();
      setNotice('工作区已重置');
    } catch (e) { setError((e as Error).message); }
  }, [refreshTables]);

  const engineRetry = useCallback(async () => {
    setBusy('引擎初始化…');
    setError('');
    try { await api('GET', '/tables', undefined, 600000); await refreshTables(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }, [refreshTables]);

  const history = useMemo(() => LS.get<string[]>('history', []), [sql]);
  const recentPaths = useMemo(() => LS.get<string[]>('recentPaths', []), [importPath]);

  // ── 渲染 ──
  return (
    <div className="dq-root">
      <style>{STYLE}</style>

      {/* 顶栏：引擎状态 */}
      <div className="dq-topbar">
        <span className="dq-title">数据查询台</span>
        <span className="dq-spacer" />
        {engine && engine.engine === 'ready' && (
          <span className="dq-pill dq-pill-ok">
            引擎就绪 · {engine.tables} 表 · {engine.rowsTotal.toLocaleString()} 行 · {fmtSize(engine.workspaceBytes)}
          </span>
        )}
        {engine && engine.engine === 'initializing' && <span className="dq-pill dq-pill-warn">引擎初始化中…</span>}
        {engine && engine.engine === 'initializing' && <span className="dq-pill dq-pill-warn">引擎初始化中…</span>}
        {engine && engine.engine === 'error' && (
          <button type="button" className="dq-btn dq-btn-danger" onClick={engineRetry} disabled={!!busy}>
            引擎错误，点此重试
          </button>
        )}
        {engine && engine.engine === 'absent' && <span className="dq-pill dq-pill-warn">引擎待初始化（导入/查询时自动开始）</span>}
        {tables.length > 0 && (
          <button type="button" className="dq-btn" onClick={resetWorkspace} disabled={!!busy} title="删除全部已导入表">重置工作区</button>
        )}
      </div>

      {error && <div className="dq-box dq-err" role="alert">{error}<button type="button" className="dq-x" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="dq-box dq-okbox">{notice}<button type="button" className="dq-x" onClick={() => setNotice('')}>×</button></div>}

      <div className="dq-layout">
        {/* 左栏：导入 + 表列表 */}
        <div className="dq-side">
          <div className="dq-card">
            <div className="dq-card-title">导入数据文件</div>
            <input
              className="dq-input"
              placeholder="数据文件绝对路径（.csv/.tsv/.txt/.json/.jsonl/.parquet）"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doImport(); }}
              disabled={!!busy}
            />
            <div className="dq-row">
              <input
                className="dq-input dq-input-sm"
                placeholder="表名（可选，默认文件名）"
                value={importTable}
                onChange={(e) => setImportTable(e.target.value)}
                disabled={!!busy}
              />
              <button type="button" className="dq-btn dq-btn-primary" onClick={doImport} disabled={!!busy || !ready}>导入</button>
            </div>
            {recentPaths.length > 0 && (
              <div className="dq-recent">
                {recentPaths.map((p) => (
                  <button type="button" key={p} className="dq-recent-item" onClick={() => setImportPath(p)} title={p}>
                    {p.length > 42 ? `…${p.slice(-40)}` : p}
                  </button>
                ))}
              </div>
            )}
            <div className="dq-hint">GBK / UTF-16 编码自动转码；同名再导入 = 覆盖刷新。</div>
          </div>

          <div className="dq-card">
            <div className="dq-card-title">表（{tables.length}）</div>
            {tables.length === 0 && <div className="dq-hint">还没有表。导入一个数据文件，或对 AI 说「帮我把 xxx.csv 导进来」。</div>}
            {tables.map((t) => (
              <div key={t.table} className={`dq-table-item${selTable === t.table ? ' dq-table-item-sel' : ''}`}>
                <button type="button" className="dq-table-main" onClick={() => selectTable(t.table)} title={`${t.source} · ${t.importedAt || ''}`}>
                  <span className="dq-table-name">{t.table}</span>
                  <span className="dq-table-meta">{t.rows.toLocaleString()} 行 · {fmtSize(t.sizeBytes)}{t.kind && t.kind !== 'unknown' ? ` · ${t.kind}` : ''}</span>
                </button>
                <button type="button" className="dq-x" onClick={() => dropTable(t.table)} title="删除表" disabled={!!busy}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* 主区：SQL + 结果 */}
        <div className="dq-main">
          <div className="dq-card">
            <div className="dq-card-title">
              SQL（DuckDB 方言，Ctrl+Enter 运行）
              {history.length > 0 && (
                <select
                  className="dq-select"
                  value=""
                  onChange={(e) => { if (e.target.value) setSql(e.target.value); }}
                >
                  <option value="">历史 {history.length}</option>
                  {history.map((h, i) => (
                    <option key={`${i}-${h.slice(0, 24)}`} value={h}>{h.slice(0, 70).replace(/\s+/g, ' ')}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              className="dq-sql"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
              placeholder={`SELECT 品类, sum(金额) AS 总金额\nFROM 订单\nGROUP BY 1 ORDER BY 总金额 DESC`}
              spellCheck={false}
              rows={5}
              disabled={!!busy}
            />
            <div className="dq-row">
              <button type="button" className="dq-btn dq-btn-primary" onClick={runQuery} disabled={!!busy || !ready}>运行</button>
              {busy && <span className="dq-busy">{busy}</span>}
              <span className="dq-spacer" />
              {result && onSendToChat && (
                <button
                  type="button" className="dq-btn"
                  onClick={() => onSendToChat(`SQL:\n${sql.trim()}\n\n查询结果（${result.rowCount} 行，${(result.elapsedMs / 1000).toFixed(2)}s）：\n${resultToMarkdown(result)}`)}
                >
                  结果发给 AI
                </button>
              )}
            </div>
          </div>

          {/* 选中表速览 */}
          {selTable && (preview || schemaInfo) && (
            <div className="dq-card">
              <div className="dq-card-title">
                表 {selTable}
                <button type="button" className="dq-btn dq-btn-sm" onClick={() => setShowSchema(!showSchema)}>
                  {showSchema ? '隐藏结构' : '看结构'}
                </button>
                <button type="button" className="dq-btn dq-btn-sm" onClick={() => setSql(`SELECT * FROM ${selTable} LIMIT 100`)}>填入示例 SQL</button>
                <span className="dq-spacer" />
                <button type="button" className="dq-x" onClick={() => { setSelTable(''); setPreview(null); setSchemaInfo(null); }}>×</button>
              </div>
              {showSchema && schemaInfo && (
                <div className="dq-schema">
                  {schemaInfo.columns.map((c) => (
                    <span key={c.name} className="dq-col-chip" title={`样例：${cellText(schemaInfo.sample[0]?.[c.name])}`}>
                      {c.name}<em>{c.type}</em>
                    </span>
                  ))}
                </div>
              )}
              {preview && <Grid columns={preview.columns} rows={preview.rows} note={`前 ${preview.rows.length} 行`} />}
            </div>
          )}

          {/* 查询结果 */}
          {result && (
            <div className="dq-card">
              <div className="dq-card-title">
                结果：{result.rowCount.toLocaleString()} 行 · {(result.elapsedMs / 1000).toFixed(2)}s
                {result.truncated && <em className="dq-trunc">（展示前 {result.rows.length} 行）</em>}
                <span className="dq-spacer" />
                <input
                  className="dq-input dq-input-sm dq-export-path"
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  placeholder="导出文件绝对路径"
                />
                <button type="button" className="dq-btn dq-btn-sm" onClick={() => doExport('csv')} disabled={!!busy}>导出 CSV</button>
                <button type="button" className="dq-btn dq-btn-sm" onClick={() => doExport('json')} disabled={!!busy}>导出 JSON</button>
              </div>
              <Grid columns={result.columns} rows={result.rows} note={result.truncated ? `展示 ${result.rows.length}/${result.rowCount} 行` : undefined} />
            </div>
          )}

          {/* 空状态引导 */}
          {!result && !selTable && tables.length === 0 && (
            <div className="dq-card dq-guide">
              <div className="dq-card-title">三步开始</div>
              <ol className="dq-ol">
                <li>左上填一个数据文件路径点「导入」（比如下载的账单 CSV、导出的订单 JSON）。</li>
                <li>点表名看结构和样例，或点「填入示例 SQL」改一改。</li>
                <li>也可以直接对 AI 说：「帮我把下载目录的 sales.csv 导进来，按月汇总金额前十」。</li>
              </ol>
              <div className="dq-hint">所有数据只在你本机：DuckDB 引擎随包内置（Windows x64），全程离线。</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 结果网格（受控行数，单元格等宽渲染）──────────────────────────────────
function Grid({ columns, rows, note }: { columns: string[]; rows: Record<string, unknown>[]; note?: string }) {
  if (!columns.length || !rows.length) return <div className="dq-hint">（空结果）</div>;
  return (
    <div className="dq-grid-wrap">
      {note && <div className="dq-grid-note">{note}</div>}
      <table className="dq-grid">
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const v = row[c];
                const numeric = typeof v === 'number';
                return <td key={c} className={numeric ? 'dq-num' : undefined}>{cellText(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 样式（dq- 前缀作用域；主题中性：透明底 + currentColor，不与宿主主题打架）──
const STYLE = `
.dq-root { color: inherit; font-size: 13px; line-height: 1.5; padding: 12px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.dq-topbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dq-title { font-weight: 700; font-size: 15px; }
.dq-spacer { flex: 1; }
.dq-pill { padding: 2px 10px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(128,128,128,.35); display: inline-flex; align-items: center; gap: 6px; }
.dq-pill-ok { color: inherit; }
.dq-pill-warn { opacity: .9; }
.dq-bar { width: 90px; height: 6px; border-radius: 3px; background: rgba(128,128,128,.25); overflow: hidden; display: inline-block; }
.dq-bar-in { display: block; height: 100%; background: currentColor; opacity: .6; }
.dq-layout { display: flex; gap: 10px; align-items: flex-start; }
.dq-side { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
.dq-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.dq-card { border: 1px solid rgba(128,128,128,.3); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.dq-card-title { font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dq-card-title em.dq-trunc { font-weight: 400; opacity: .75; font-style: normal; font-size: 12px; }
.dq-input { flex: 1; min-width: 0; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; font-size: 12.5px; font-family: ui-monospace, Consolas, monospace; }
.dq-input:focus { outline: none; border-color: currentColor; }
.dq-input-sm { flex: 0 1 200px; }
.dq-export-path { flex: 1 1 220px; max-width: 340px; }
.dq-select { padding: 3px 6px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; font-size: 12px; max-width: 260px; }
.dq-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; cursor: pointer; font-size: 12.5px; white-space: nowrap; }
.dq-btn:hover { background: rgba(128,128,128,.12); }
.dq-btn:disabled { opacity: .45; cursor: default; }
.dq-btn-primary { background: rgba(128,128,128,.18); font-weight: 600; }
.dq-btn-danger { border-color: rgba(220,80,80,.6); }
.dq-btn-sm { padding: 3px 8px; font-size: 12px; }
.dq-busy { opacity: .8; font-size: 12px; }
.dq-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dq-sql { width: 100%; min-height: 110px; resize: vertical; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; box-sizing: border-box; }
.dq-sql:focus { outline: none; border-color: currentColor; }
.dq-hint { opacity: .7; font-size: 12px; }
.dq-box { border-radius: 8px; padding: 8px 12px; font-size: 12.5px; position: relative; padding-right: 28px; }
.dq-err { border: 1px solid rgba(220,80,80,.5); background: rgba(220,80,80,.08); white-space: pre-wrap; }
.dq-okbox { border: 1px solid rgba(90,180,90,.5); background: rgba(90,180,90,.08); }
.dq-x { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; padding: 2px 6px; opacity: .6; }
.dq-x:hover { opacity: 1; }
.dq-table-item { display: flex; align-items: center; border-radius: 8px; border: 1px solid transparent; }
.dq-table-item:hover { background: rgba(128,128,128,.1); }
.dq-table-item-sel { border-color: rgba(128,128,128,.5); background: rgba(128,128,128,.08); }
.dq-table-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; border: none; background: transparent; color: inherit; cursor: pointer; padding: 6px 8px; text-align: left; }
.dq-table-name { font-weight: 600; font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
.dq-table-meta { font-size: 11.5px; opacity: .7; }
.dq-recent { display: flex; flex-direction: column; gap: 2px; }
.dq-recent-item { border: none; background: transparent; color: inherit; opacity: .65; cursor: pointer; text-align: left; font-size: 11.5px; padding: 2px 4px; font-family: ui-monospace, Consolas, monospace; }
.dq-recent-item:hover { opacity: 1; text-decoration: underline; }
.dq-schema { display: flex; flex-wrap: wrap; gap: 6px; }
.dq-col-chip { border: 1px solid rgba(128,128,128,.35); border-radius: 999px; padding: 1px 9px; font-size: 11.5px; font-family: ui-monospace, Consolas, monospace; }
.dq-col-chip em { font-style: normal; opacity: .6; margin-left: 4px; }
.dq-grid-wrap { overflow: auto; max-height: 46vh; border: 1px solid rgba(128,128,128,.25); border-radius: 8px; }
.dq-grid-note { padding: 4px 8px; font-size: 11.5px; opacity: .7; border-bottom: 1px solid rgba(128,128,128,.2); }
.dq-grid { border-collapse: collapse; width: 100%; font-size: 12px; font-family: ui-monospace, Consolas, monospace; }
.dq-grid th, .dq-grid td { text-align: left; padding: 4px 8px; border-bottom: 1px solid rgba(128,128,128,.18); white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.dq-grid th { position: sticky; top: 0; background: rgba(128,128,128,.12); font-weight: 600; }
.dq-grid td.dq-num { text-align: right; font-variant-numeric: tabular-nums; }
.dq-guide ol.dq-ol { margin: 4px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
`;
