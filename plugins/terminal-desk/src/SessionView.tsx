/**
 * terminal-desk 单会话视图：xterm.js 生命周期封装
 *
 * 数据流（plans/terminal-plugin-spec.md §五）：
 *   输出  __POLARIS_HOST_LISTEN__('terminal:output') 按 sessionId 过滤 → decode → term.write
 *   输入  term.onData → encode → cap.terminal write（base64）
 *   尺寸  ResizeObserver → fit + proposeDimensions → cap.terminal resize（rAF+100ms 去抖）
 *   主题  __POLARIS_THEME_API__.subscribe → options.theme 热更新
 *
 * addon：fit（尺寸）、web-links（链接）、search（搜索条）、webgl（GPU 渲染，
 * 失败静默降级 canvas——WebView2 环境个别版本 WebGL 上下文创建失败属正常路径）。
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import { capTerminal, currentThemeId, listenTerminalExit, listenTerminalOutput, onThemeChanged } from './bridge';
import { decodeBase64ToBytes, encodeBase64 } from './model';
import { getXtermTheme } from './xtermTheme';

export interface SessionViewProps {
  sessionId: string;
  /** 面板可见性变化（不可见时跳过 resize，避免 display:none 下 propose 尺寸为 0） */
  visible: boolean;
  /** 会话退出（exit 事件），通知父层标记 */
  onExit: (exitCode: number | null) => void;
  /** 注册打开搜索条的触发器（父层 Ctrl+F 转发到当前会话） */
  registerSearch?: (open: () => void) => void;
}

export default function SessionView({ sessionId, visible, onExit, registerSearch }: SessionViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // onExit 引用代理：exit 订阅随会话装配一次，回调换绑不重建订阅
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      scrollback: 10000,
      fontSize: 14,
      fontFamily: "Consolas, 'Courier New', monospace",
      cursorBlink: true,
      theme: getXtermTheme(currentThemeId()) as never,
    });
    termRef.current = term;

    const fit = new FitAddon();
    const search = new SearchAddon();
    fitRef.current = fit;
    searchRef.current = search;
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(search);
    // webgl 渲染：加载失败静默降级默认渲染器
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* 无 WebGL 上下文时走默认渲染 */
    }

    term.open(container);
    void fit.fit();

    // 输出订阅：全局事件流按 sessionId 过滤（多会话/多面板共用同一事件）
    const offOutput = listenTerminalOutput((event) => {
      if (event.sessionId !== sessionId) return;
      term.write(decodeBase64ToBytes(event.data));
    });
    // 退出事件：标记退出码（xterm 保留最终输出）
    const offExit = listenTerminalExit((event) => {
      if (event.sessionId === sessionId) onExitRef.current(event.exitCode);
    });

    // 输入：UTF-8 安全 base64（TextEncoder → btoa，同内置终端）
    const dataDisposable = term.onData((data) => {
      void capTerminal({ action: 'write', sessionId, data: encodeBase64(data) }).catch(() => {
        /* 写失败不致命：会话可能已退出，exit 事件随后到来 */
      });
    });

    // 尺寸：ResizeObserver + rAF + 100ms 尾随去抖（移植内置节奏）
    let resizeTimer: number | null = null;
    let rafId = 0;
    const observer = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (resizeTimer !== null) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          resizeTimer = null;
          if (container.offsetParent === null) return; // 隐藏中不 propose（尺寸为 0）
          try {
            fit.fit();
            const dims = fit.proposeDimensions();
            if (dims && dims.cols > 1 && dims.rows > 1) {
              void capTerminal({ action: 'resize', sessionId, cols: dims.cols, rows: dims.rows }).catch(
                () => {},
              );
            }
          } catch {
            /* 容器尺寸异常时忽略本轮 */
          }
        }, 100);
      });
    });
    observer.observe(container);

    registerSearch?.(() => {
      setSearchOpen(true);
      // 等搜索条渲染后聚焦
      window.setTimeout(() => {
        const input = container.parentElement?.querySelector<HTMLInputElement>('.td-search-input');
        input?.focus();
        input?.select();
      }, 30);
    });

    // 卸载：dispose xterm（连带 addon），解绑事件与观察器
    return () => {
      observer.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      if (rafId) cancelAnimationFrame(rafId);
      dataDisposable.dispose();
      offOutput();
      offExit();
      try {
        term.dispose();
      } catch {
        /* 重复 dispose 安全忽略 */
      }
      if (termRef.current === term) termRef.current = null;
      if (fitRef.current === fit) fitRef.current = null;
      if (searchRef.current === search) searchRef.current = null;
    };
    // sessionId 生命周期内一次性装配；visible/onExit 变化不重建 xterm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 主题热跟随
  useEffect(() => {
    return onThemeChanged(() => {
      if (termRef.current) termRef.current.options.theme = getXtermTheme(currentThemeId()) as never;
    });
  }, []);

  // 可见性恢复补一次 fit（display:none → 显示，ResizeObserver 有时滞后一拍）
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* 隐藏态尺寸异常忽略 */
      }
    }, 60);
    return () => window.clearTimeout(id);
  }, [visible]);

  function closeSearch() {
    setSearchOpen(false);
    termRef.current?.focus();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
      {searchOpen && (
        <SearchBar
          onSearch={(text, opts) => {
            const search = searchRef.current;
            if (!search || !text) return;
            if (opts.backward) search.findPrevious(text, { caseSensitive: opts.caseSensitive });
            else search.findNext(text, { caseSensitive: opts.caseSensitive });
          }}
          onClose={closeSearch}
        />
      )}
      <div ref={containerRef} className="td-session" />
    </div>
  );
}

function SearchBar({
  onSearch,
  onClose,
}: {
  onSearch: (text: string, opts: { backward: boolean; caseSensitive: boolean }) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 6, padding: '4px 8px', borderBottom: '1px solid rgb(var(--c-border))', flex: 'none', alignItems: 'center' }}>
      <input
        className="td-search-input td-input"
        placeholder="搜索（Enter 下一个 / Shift+Enter 上一个）"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSearch(text, { backward: e.shiftKey, caseSensitive });
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        style={{ width: 240 }}
      />
      <label style={{ fontSize: 11, display: 'inline-flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
        区分大小写
      </label>
      <button className="td-mini" onClick={onClose} style={{ marginLeft: 'auto' }}>
        ✕
      </button>
    </div>
  );
}
