import { useCallback, useEffect, useState } from 'react';
import { api, type DiffOpts } from './api';
import { DirDiffView, ErrBanner, JsonDiffView, TextDiffView, UrlSideCard } from './DiffViews';
import type { DiffResult, DirResult, HistoryItem, SelftestItem } from './types';

type Tab = 'diff' | 'dirs' | 'urls' | 'history';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'diff', label: '对比' },
  { id: 'dirs', label: '目录' },
  { id: 'urls', label: '接口' },
  { id: 'history', label: '历史' },
];

export default function Panel({ pluginId }: { pluginId: string; onSendToChat?: (message: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('diff');
  const [online, setOnline] = useState<boolean | null>(null);

  const probe = useCallback(async () => {
    try {
      await api.status();
      setOnline(true);
    } catch (_) {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void probe();
    const timer = setInterval(() => void probe(), 30000);
    return () => clearInterval(timer);
  }, [probe]);

  return (
    <div style={{ padding: 12, height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Diff 对比台</span>
        <span
          title={online ? '后台服务运行中' : '后台服务不可达（面板打开时会自动拉起，稍后重试）'}
          style={{
            width: 8, height: 8, borderRadius: 4,
            background: online === null ? '#9ca3af' : online ? '#3fb950' : '#f85149',
          }}
        />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, opacity: 0.55 }}>全流程本机 · 正文不出机</span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid rgba(128,128,128,0.25)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13,
              padding: '6px 12px',
              color: tab === t.id ? 'var(--p-accent, #4a7dff)' : 'inherit',
              borderBottom: tab === t.id ? '2px solid var(--p-accent, #4a7dff)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'diff' && <DiffTab />}
      {tab === 'dirs' && <DirsTab onOpenPair={(a, b) => { prefilledFiles.aPath = a; prefilledFiles.bPath = b; prefilledFiles.stamp = Date.now(); setTab('diff'); }} />}
      {tab === 'urls' && <UrlsTab />}
      {tab === 'history' && <HistoryTab />}
      <div style={{ marginTop: 18, fontSize: 11, opacity: 0.45 }}>
        diff-desk · {pluginId} · 正文不落盘不上传；历史仅存元数据
      </div>
    </div>
  );
}

/** 目录对比 → 文件对比 的跨 Tab 传参（模块级暂存，下一次 DiffTab 渲染消费一次） */
const prefilledFiles: { aPath?: string; bPath?: string; stamp?: number } = {};

/* ============================ 对比 Tab ============================ */

function DiffTab() {
  const [source, setSource] = useState<'paste' | 'file'>('paste');
  const [mode, setMode] = useState<'auto' | 'text' | 'json'>('auto');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [aPath, setAPath] = useState('');
  const [bPath, setBPath] = useState('');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [arrayAlign, setArrayAlign] = useState(true);
  const [ignorePaths, setIgnorePaths] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DiffResult | null>(null);

  // 消费目录页跳转预填（stamp 变化才算新指令）
  const [consumedStamp, setConsumedStamp] = useState(0);
  useEffect(() => {
    if (prefilledFiles.stamp && prefilledFiles.stamp !== consumedStamp) {
      setSource('file');
      setAPath(prefilledFiles.aPath || '');
      setBPath(prefilledFiles.bPath || '');
      setConsumedStamp(prefilledFiles.stamp);
    }
  }, [consumedStamp]);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const opts: DiffOpts = {
        ignoreWhitespace,
        ignoreCase,
        arrayAlign,
        ignorePaths: ignorePaths.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const r = source === 'paste'
        ? await api.diffText(a, b, mode === 'auto' ? undefined : mode, opts)
        : await api.diffFiles(aPath.trim(), bPath.trim(), mode === 'auto' ? undefined : mode, opts);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const canRun = source === 'paste' ? true : Boolean(aPath.trim() && bPath.trim());

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['paste', 'file'] as const).map((s) => (
            <button key={s} className="dfx-btn2" style={source === s ? { borderColor: 'var(--p-accent, #4a7dff)', color: 'var(--p-accent, #4a7dff)' } : undefined} onClick={() => setSource(s)}>
              {s === 'paste' ? '粘贴' : '文件路径'}
            </button>
          ))}
        </div>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'auto' | 'text' | 'json')}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}
        >
          <option value="auto">自动（能解析 JSON 就语义对比）</option>
          <option value="text">文本行级</option>
          <option value="json">JSON 语义</option>
        </select>
        <span style={{ flex: 1 }} />
        <button className="dfx-btn" disabled={running || !canRun} onClick={() => void run()}>
          {running ? '对比中…' : '对比'}
        </button>
      </div>

      {source === 'paste' ? (
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <textarea className="dfx-area" placeholder="A 侧：粘贴文本或 JSON（≤5MB）" value={a} onChange={(e) => setA(e.target.value)} />
          <textarea className="dfx-area" placeholder="B 侧：粘贴文本或 JSON（≤5MB）" value={b} onChange={(e) => setB(e.target.value)} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
          <input className="dfx-input" placeholder="A 文件绝对路径（如 D:\\conf\\app.json，≤20MB，UTF-8/GBK 自动识别）" value={aPath} onChange={(e) => setAPath(e.target.value)} />
          <input className="dfx-input" placeholder="B 文件绝对路径" value={bPath} onChange={(e) => setBPath(e.target.value)} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, margin: '8px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={ignoreWhitespace} onChange={(e) => setIgnoreWhitespace(e.target.checked)} /> 忽略空白
        </label>
        <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} /> 忽略大小写
        </label>
        {mode !== 'text' ? (
          <>
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={arrayAlign} onChange={(e) => setArrayAlign(e.target.checked)} /> 数组按内容对齐
            </label>
            <span style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', flex: 1, minWidth: 200 }}>
              忽略路径（逗号分隔，如 $.meta.updatedAt, $.items[*].ts）
              <input className="dfx-input" style={{ flex: 1 }} value={ignorePaths} onChange={(e) => setIgnorePaths(e.target.value)} />
            </span>
          </>
        ) : null}
      </div>

      {error ? <ErrBanner message={error} /> : null}
      {result ? (
        <div style={{ marginTop: 10 }}>
          {result.kind === 'json' ? <JsonDiffView result={result} /> : <TextDiffView result={result} />}
        </div>
      ) : null}
    </div>
  );
}

/* ============================ 目录 Tab ============================ */

function DirsTab({ onOpenPair }: { onOpenPair: (aPath: string, bPath: string) => void }) {
  const [aPath, setAPath] = useState('');
  const [bPath, setBPath] = useState('');
  const [includeNodeModules, setIncludeNodeModules] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DirResult | null>(null);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const r = await api.diffDirs(aPath.trim(), bPath.trim(), { includeNodeModules });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const openPair = (rel: string) => {
    if (!result) return;
    const rootA = (result.aMeta.path || '').replace(/[\\/]+$/, '');
    const rootB = (result.bMeta.path || '').replace(/[\\/]+$/, '');
    onOpenPair(`${rootA}/${rel}`, `${rootB}/${rel}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        <input className="dfx-input" placeholder="A 目录绝对路径（默认跳过 node_modules/.git 等）" value={aPath} onChange={(e) => setAPath(e.target.value)} />
        <input className="dfx-input" placeholder="B 目录绝对路径" value={bPath} onChange={(e) => setBPath(e.target.value)} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={includeNodeModules} onChange={(e) => setIncludeNodeModules(e.target.checked)} /> 包含 node_modules
          </label>
          <span style={{ flex: 1 }} />
          <button className="dfx-btn" disabled={running || !aPath.trim() || !bPath.trim()} onClick={() => void run()}>
            {running ? '遍历中…' : '对比目录'}
          </button>
        </div>
      </div>
      {error ? <ErrBanner message={error} /> : null}
      {result ? (
        <div style={{ marginTop: 10 }}>
          <DirDiffView result={result} onOpenPair={(rel) => openPair(rel)} />
        </div>
      ) : null}
    </div>
  );
}

/* ============================ 接口 Tab ============================ */

interface HeaderRow {
  name: string;
  value: string;
}

function UrlsTab() {
  const [aUrl, setAUrl] = useState('');
  const [bUrl, setBUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [headers, setHeaders] = useState<HeaderRow[]>([]);
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'auto' | 'text' | 'json'>('auto');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DiffResult | null>(null);
  const [proxy, setProxy] = useState('');
  const [proxySaved, setProxySaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await api.settings();
        setProxy(s.proxy || '');
      } catch (_) { /* 服务未起时静默 */ }
    })();
  }, []);

  const saveProxy = async () => {
    try {
      const r = await api.saveSettings({ proxy: proxy.trim() });
      setProxy(r.proxy);
      setProxySaved(true);
      setTimeout(() => setProxySaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setHeader = (i: number, patch: Partial<HeaderRow>) => {
    setHeaders((hs) => hs.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  };

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const headerObj: Record<string, string> = {};
      for (const h of headers) {
        if (h.name.trim()) headerObj[h.name.trim()] = h.value;
      }
      const r = await api.diffUrls(aUrl.trim(), bUrl.trim(), {
        method,
        headers: Object.keys(headerObj).length ? headerObj : undefined,
        body: method === 'POST' && body ? body : undefined,
        mode: mode === 'auto' ? undefined : mode,
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const canRun = Boolean(aUrl.trim() && bUrl.trim());

  return (
    <div>
      <div className="dfx-note" style={{ marginBottom: 8 }}>
        会向两个地址发起真实请求（staging vs prod、发布前后同接口）。私网/元数据地址被围栏拒绝；带敏感头的响应只在本机对比，不上传。
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <span className="dfx-label" style={{ flexShrink: 0 }}>出网代理</span>
        <input
          className="dfx-input"
          style={{ maxWidth: 280 }}
          placeholder="留空=自动（系统代理→直连），如 http://127.0.0.1:7890"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
        />
        <button className="dfx-btn2" onClick={() => void saveProxy()}>{proxySaved ? '已保存 ✓' : '保存'}</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="dfx-input" placeholder="A 侧完整 URL（https://staging.example.com/api/config）" value={aUrl} onChange={(e) => setAUrl(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="dfx-input" placeholder="B 侧完整 URL" value={bUrl} onChange={(e) => setBUrl(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={method} onChange={(e) => setMethod(e.target.value as 'GET' | 'POST')} style={{ background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value as 'auto' | 'text' | 'json')} style={{ background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}>
          <option value="auto">自动识别 JSON</option>
          <option value="text">文本</option>
          <option value="json">JSON 语义</option>
        </select>
        <span style={{ flex: 1 }} />
        <button className="dfx-btn" disabled={running || !canRun} onClick={() => void run()}>
          {running ? '请求中…' : '请求并对比'}
        </button>
      </div>
      <div style={{ marginBottom: 8 }}>
        {headers.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input className="dfx-input" style={{ maxWidth: 200 }} placeholder="头名（如 Authorization）" value={h.name} onChange={(e) => setHeader(i, { name: e.target.value })} />
            <input className="dfx-input" placeholder="值（两侧共用，≤8 个）" value={h.value} onChange={(e) => setHeader(i, { value: e.target.value })} />
            <button className="dfx-btn2" onClick={() => setHeaders((hs) => hs.filter((_, idx) => idx !== i))}>✕</button>
          </div>
        ))}
        {headers.length < 8 ? (
          <button className="dfx-btn2" onClick={() => setHeaders((hs) => hs.concat({ name: '', value: '' }))}>+ 请求头</button>
        ) : null}
      </div>
      {method === 'POST' ? (
        <textarea className="dfx-area" style={{ minHeight: 70, marginBottom: 8 }} placeholder="POST body（≤64KB，两侧共用）" value={body} onChange={(e) => setBody(e.target.value)} />
      ) : null}
      {error ? <ErrBanner message={error} /> : null}
      {result && result.aSide && result.bSide ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <UrlSideCard tag="A" side={result.aSide} />
            <UrlSideCard tag="B" side={result.bSide} />
          </div>
          {result.kind === 'json' ? <JsonDiffView result={result} /> : <TextDiffView result={result} />}
        </div>
      ) : null}
    </div>
  );
}

/* ============================ 历史 Tab ============================ */

function HistoryTab() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState('');
  const [selftest, setSelftest] = useState<{ running: boolean; items: SelftestItem[]; allGreen: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.history();
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clear = async () => {
    try {
      await api.historyClear();
      setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runSelftest = async () => {
    setSelftest({ running: true, items: [], allGreen: false });
    try {
      const r = await api.selftest();
      setSelftest({ running: false, items: r.items, allGreen: r.allGreen });
    } catch (e) {
      setSelftest({ running: false, items: [{ name: '自检执行失败', ok: false, detail: e instanceof Error ? e.message : String(e) }], allGreen: false });
    }
  };

  const fmtStats = (it: HistoryItem) => {
    const s = it.stats || {};
    if (it.kind === 'json') return `改${s.changed || 0}/增${s.added || 0}/删${s.removed || 0}/序${s.order || 0}`;
    if (it.kind === 'dirs') return `差异${s.changed || 0}/A独${s.onlyLeft || 0}/B独${s.onlyRight || 0}`;
    return `+${s.additions || 0}/-${s.deletions || 0}/~${s.modifies || 0}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <span className="dfx-note">仅元数据（时间/对象/统计），不存对比正文</span>
        <span style={{ flex: 1 }} />
        <button className="dfx-btn2" onClick={() => void runSelftest()} disabled={!!selftest?.running}>
          {selftest?.running ? '自检中…' : '运行自检'}
        </button>
        <button className="dfx-btn2" onClick={() => void clear()}>清空历史</button>
      </div>
      {selftest ? (
        <div style={{ border: '1px solid rgba(128,128,128,0.25)', borderRadius: 6, padding: 8, marginBottom: 12 }}>
          {selftest.items.map((it, i) => (
            <div key={i} style={{ fontSize: 12.5, padding: '2px 0' }}>
              {it.ok ? '✅' : '❌'} {it.name}
              {!it.ok && it.detail ? <span style={{ color: 'var(--p-danger, #f85149)' }}> — {it.detail}</span> : null}
            </div>
          ))}
          {selftest.items.length ? (
            <div className="dfx-note" style={{ marginTop: 4 }}>{selftest.allGreen ? '全部通过。' : '存在失败项。'}</div>
          ) : null}
        </div>
      ) : null}
      {error ? <ErrBanner message={error} /> : null}
      {!items ? (
        <div className="dfx-note">加载中…</div>
      ) : items.length === 0 ? (
        <div className="dfx-note">还没有对比记录。</div>
      ) : (
        <table className="dfx-table">
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td style={{ width: 150, whiteSpace: 'nowrap' }}>{new Date(it.ts).toLocaleString()}</td>
                <td style={{ width: 50 }}>{it.kind}</td>
                <td style={{ wordBreak: 'break-all' }}>{it.label}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtStats(it)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
