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
  screencastStart, screencastFrame, screencastStop, inputMouse, inputKey,
  subscribeTheme, activeTheme,
  type EngineStatus, type SearchResult, type TabInfo,
} from './bridge';

interface LogLine { ts: number; text: string }

/** 内嵌实时视图：screencast 帧轮询 + 鼠标/键盘回传（坐标按帧设备尺寸等比映射） */
function EmbeddedView({ tabId, onLog }: { tabId: string; onLog: (t: string) => void }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [frameInfo, setFrameInfo] = useState<{ w: number; h: number } | null>(null);
  const seqRef = useRef(0);
  const deadRef = useRef(false);

  useEffect(() => {
    deadRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        await screencastStart(tabId);
      } catch { /* 引擎忙时降级：轮询仍会尝试 */ }
      const loop = async () => {
        while (!cancelled && !deadRef.current) {
          try {
            const r = await screencastFrame(tabId, seqRef.current);
            if (r.frame && r.seq > seqRef.current && imgRef.current) {
              seqRef.current = r.seq;
              imgRef.current.src = `data:image/jpeg;base64,${r.frame.data}`;
              setFrameInfo({ w: r.frame.deviceWidth, h: r.frame.deviceHeight });
            }
          } catch { /* 服务暂不可达，下轮重试 */ }
          await new Promise((res) => setTimeout(res, 250));
        }
      };
      void loop();
    })();
    return () => { cancelled = true; deadRef.current = true; void screencastStop(tabId).catch(() => {}); };
  }, [tabId]);

  /** 面板显示坐标 → 页面坐标（按帧 deviceWidth 与显示宽度等比） */
  const toPage = (clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el || !frameInfo || !frameInfo.w) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const sx = frameInfo.w / rect.width;
    const sy = frameInfo.h / rect.height;
    return { x: Math.round((clientX - rect.left) * sx), y: Math.round((clientY - rect.top) * sy) };
  };

  const onMouse = (e: React.MouseEvent, type: 'mousePressed' | 'mouseReleased' | 'mouseMoved') => {
    const { x, y } = toPage(e.clientX, e.clientY);
    void inputMouse(tabId, type, x, y, { button: e.button === 2 ? 'right' : 'left', clickCount: type === 'mousePressed' ? 1 : 0 });
  };
  const onWheel = (e: React.WheelEvent) => {
    const { x, y } = toPage(e.clientX, e.clientY);
    void inputMouse(tabId, 'mouseWheel', x, y, { deltaX: e.deltaX, deltaY: e.deltaY });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.length === 1 ? e.key : e.key;
    void inputKey(tabId, key);
  };

  return (
    <div
      className="bd-embed"
      tabIndex={0}
      onMouseMove={(e) => onMouse(e, 'mouseMoved')}
      onMouseDown={(e) => onMouse(e, 'mousePressed')}
      onMouseUp={(e) => onMouse(e, 'mouseReleased')}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <img ref={imgRef} alt="browser view" draggable={false} />
      {frameInfo && <span className="bd-embed-meta">{frameInfo.w}×{frameInfo.h}</span>}
    </div>
  );
}

let logSeq = 0;

export default function Panel() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [theme, setTheme] = useState(activeTheme());
  const [embedTabId, setEmbedTabId] = useState<string | null>(null);
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
        实时画面
        <span className="bd-section-spacer" />
        <button className="bd-action" onClick={() => setEmbedTabId(embedTabId ? null : (status?.tabs?.[0]?.tabId ?? null))} disabled={!status?.tabs?.length}>
          {embedTabId ? '收起' : '显示'}
        </button>
      </div>
      {embedTabId && <EmbeddedView tabId={embedTabId} onLog={addLog} />}
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
