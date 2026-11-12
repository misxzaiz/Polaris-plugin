/**
 * Panel.tsx —— browser-desk 控制台面板
 *
 * 形态（spec §2 裁定）：网页在独立 Chrome 窗口，面板做控制台——
 * 搜索框 / 标签列表（打开·激活·关闭）/ 搜索结果 / AI 操作日志 / 引擎状态徽章。
 * 数据经宿主转发（cap.pluginServiceManager.request → service /dispatch）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getStatus, search, openUrl, activateTab, closeTab,
  subscribeTheme, activeTheme,
  type EngineStatus, type SearchResult, type TabInfo,
} from './bridge';

interface LogLine { ts: number; text: string }

let logSeq = 0;

export default function Panel() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [theme, setTheme] = useState(activeTheme());
  const mountedRef = useRef(true);

  const addLog = useCallback((text: string) => {
    logSeq += 1;
    setLogs((prev) => [...prev.slice(-40), { ts: Date.now(), text }]);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const st = await getStatus();
      if (!mountedRef.current) return;
      setStatus(st);
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const timer = setInterval(refresh, 3000);
    const unTheme = subscribeTheme(setTheme);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      unTheme();
    };
  }, [refresh]);

  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    addLog(`search: ${q}`);
    try {
      const r = await search(q, undefined, 8);
      if (!mountedRef.current) return;
      setResults(r);
      addLog(`search → ${r.results.length} 条结果`);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [query, busy, addLog, refresh]);

  const doOpen = useCallback(async (url: string, newWindow = false) => {
    setBusy(true);
    addLog(`open: ${url.slice(0, 60)}${newWindow ? ' (新窗口)' : ''}`);
    try {
      await openUrl(url, newWindow);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [addLog, refresh]);

  const doActivate = useCallback(async (tabId: string) => {
    try {
      await activateTab(tabId);
      addLog(`activate tab ${tabId.slice(0, 8)}`);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [addLog, refresh]);

  const doClose = useCallback(async (tabId: string) => {
    try {
      await closeTab(tabId);
      addLog(`close tab ${tabId.slice(0, 8)}`);
      refresh();
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [addLog, refresh]);

  const engine = status?.engine ?? 'stopped';
  const chromeMissing = engine === 'stopped' && !!error && /Chrome|Edge|puppeteer/i.test(error);

  return (
    <div className="bd-root" data-theme={theme}>
      <div className="bd-header">
        <input
          className="bd-search"
          placeholder="搜索网页或输入 URL，回车执行"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void doSearch(); }}
          disabled={busy}
        />
        <button className="bd-action" onClick={() => void doSearch()} disabled={busy || !query.trim()}>
          搜索
        </button>
        <span className="bd-badge" title={status?.chromePath || error || ''}>
          <span className={`bd-dot bd-dot-${engine}`} />
          <span className="bd-badge-text">{engine === 'ready' ? `引擎 ${status?.tabs.length ?? 0} 标签` : engine === 'starting' ? '启动中' : '未运行'}</span>
        </span>
      </div>

      {error && (
        <div className="bd-guide">
          {chromeMissing
            ? (<>浏览器引擎不可用：{error}<br />请安装 Chrome/Edge，或设置环境变量 <code>BROWSER_DESK_CHROME</code> 指向 chrome.exe。</>)
            : (<>服务异常：{error}<br />可尝试在插件设置中重启 browser-desk-service。</>)}
        </div>
      )}

      {results && results.results.length > 0 && (
        <>
          <div className="bd-section">
            搜索结果 · {results.engine}
            <span className="bd-section-spacer" />
            <button className="bd-action" onClick={() => setResults(null)}>收起</button>
          </div>
          <div className="bd-results">
            {results.results.map((r, i) => (
              <a
                key={`${i}-${r.url}`}
                className="bd-result"
                onClick={(e) => { e.preventDefault(); void doOpen(r.url); }}
                href={r.url}
                title={r.url}
              >
                <div className="bd-result-title">{r.title || '(无标题)'}</div>
                <div className="bd-result-url">{r.url}</div>
                {r.snippet && <div className="bd-result-snippet">{r.snippet}</div>}
              </a>
            ))}
          </div>
        </>
      )}

      <div className="bd-section">
        标签
        <span className="bd-section-spacer" />
        <button className="bd-action" onClick={() => void doOpen('https://www.bing.com', true)} disabled={busy}>
          + 新窗口
        </button>
      </div>
      <div className="bd-tabs">
        {(status?.tabs ?? []).map((t: TabInfo) => (
          <div key={t.tabId} className="bd-tab" onClick={() => void doActivate(t.tabId)}>
            <div className="bd-tab-main">
              <span className="bd-tab-title">{t.title || '(无标题)'}</span>
              <span className="bd-tab-url">{t.url}</span>
            </div>
            {t.agentKey && <span className="bd-tab-agent" title={`绑定会话 ${t.agentKey}`}>{t.agentKey}</span>}
            <button
              className="bd-tab-close"
              title="关闭标签"
              onClick={(e) => { e.stopPropagation(); void doClose(t.tabId); }}
            >
              ✕
            </button>
          </div>
        ))}
        {status && status.tabs.length === 0 && (
          <div className="bd-empty">
            <span>暂无打开的标签</span>
            <span style={{ fontSize: 11 }}>在搜索框输入内容，或让 AI 经 desk_* 工具打开网页</span>
          </div>
        )}
        {!status && !error && (
          <div className="bd-empty"><span className="bd-spin" /><span>连接服务中…</span></div>
        )}
      </div>

      {logs.length > 0 && (
        <>
          <div className="bd-section">
            AI / 面板操作日志
            <span className="bd-section-spacer" />
            <button className="bd-action" onClick={() => setLogs([])}>清空</button>
          </div>
          <div className="bd-log">
            {logs.map((l, i) => (
              <div key={`${l.ts}-${i}`} className="bd-log-line">
                <b>{new Date(l.ts).toLocaleTimeString()}</b> {l.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
