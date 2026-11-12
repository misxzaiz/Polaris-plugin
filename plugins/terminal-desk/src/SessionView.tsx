/**
 * terminal-desk 单会话视图：xterm.js 生命周期封装
 *
 * 数据流（plans/terminal-plugin-spec.md §五）：
 *   输出  __POLARIS_HOST_LISTEN__('terminal:output') 按 sessionId 过滤 → 批量解码 → term.write
 *   输入  term.onData → encode → cap.terminal write（base64）
 *   尺寸  ResizeObserver → fit + proposeDimensions → 尺寸变化才下发 cap.terminal resize
 *   主题  __POLARIS_THEME_API__.subscribe → options.theme 热更新
 *
 * addon：fit / web-links / search / webgl（GPU 渲染失败静默降级）。
 * 字体、行高、光标样式对齐内置 TerminalPanel.tsx，消除视觉差异。
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
import { Icon } from './icons';
import { ContextMenu, menuPointFromEvent, type MenuItem, type MenuPoint } from './Overlays';

export interface SessionViewProps {
  sessionId: string;
  /** 面板可见性变化（不可见时跳过 resize，避免 display:none 下 propose 尺寸为 0） */
  visible: boolean;
  /** 会话退出（exit 事件），通知父层标记 */
  onExit: (exitCode: number | null) => void;
  /** 注册打开搜索条的触发器；返回清理函数，避免切换会话后触发已卸载的 xterm */
  registerSearch?: (open: () => void) => () => void;
}

const FONT_FAMILY = 'Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", "Courier New", monospace';

export default function SessionView({ sessionId, visible, onExit, registerSearch }: SessionViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [canvasMenu, setCanvasMenu] = useState<{ point: MenuPoint; hasSelection: boolean } | null>(null);

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const registerSearchRef = useRef(registerSearch);
  registerSearchRef.current = registerSearch;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      scrollback: 10000,
      fontFamily: FONT_FAMILY,
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: false,
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
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      /* 无 WebGL 上下文时走默认渲染 */
    }

    term.open(container);
    void fit.fit();

    // 终端画布右键：用 capture 阶段挂在容器上，确保先于 xterm 自身的
    // contextmenu handler（后者绑在内部元素上）拿到事件；preventDefault 屏蔽浏览器原生菜单。
    // 坐标同样走面板坐标域换算，否则 contain:paint 下菜单会偏移/被裁。
    const onCanvasContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setCanvasMenu({ point: menuPointFromEvent(e), hasSelection: !!term.getSelection() });
    };
    container.addEventListener('contextmenu', onCanvasContextMenu, true);

    const offOutput = listenTerminalOutput((event) => {
      if (event.sessionId !== sessionId) return;
      // 一次性 Uint8Array 解码，避免逐字节 charCodeAt 循环（大输出场景）
      term.write(decodeBase64ToBytes(event.data));
    });
    const offExit = listenTerminalExit((event) => {
      if (event.sessionId === sessionId) onExitRef.current(event.exitCode);
    });

    const dataDisposable = term.onData((data) => {
      void capTerminal({ action: 'write', sessionId, data: encodeBase64(data) }).catch(() => {
        /* 写失败不致命：会话可能已退出，exit 事件随后到来 */
      });
    });

    // 尺寸：ResizeObserver + rAF + 尾随去抖；仅当 cols/rows 变化才下发后端 resize，
    // 避免旧实现每次容器微动都 fit + resize 造成 PTY 抖动与重复 IPC。
    let resizeTimer: number | null = null;
    let rafId = 0;
    let lastCols = 0;
    let lastRows = 0;
    const observer = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (resizeTimer !== null) window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          resizeTimer = null;
          if (container.offsetParent === null) return;
          try {
            fit.fit();
            const dims = fit.proposeDimensions();
            if (!dims || dims.cols <= 1 || dims.rows <= 1) return;
            if (dims.cols === lastCols && dims.rows === lastRows) return;
            lastCols = dims.cols;
            lastRows = dims.rows;
            void capTerminal({ action: 'resize', sessionId, cols: dims.cols, rows: dims.rows }).catch(() => {});
          } catch {
            /* 容器尺寸异常时忽略本轮 */
          }
        }, 80);
      });
    });
    observer.observe(container);

    const unregisterSearch = registerSearchRef.current?.(() => setSearchOpen(true));

    return () => {
      container.removeEventListener('contextmenu', onCanvasContextMenu, true);
      observer.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      if (rafId) cancelAnimationFrame(rafId);
      dataDisposable.dispose();
      offOutput();
      offExit();
      try {
        unregisterSearch?.();
      } catch {
        /* 重复清理安全忽略 */
      }
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

  useEffect(
    () =>
      onThemeChanged(() => {
        if (termRef.current) termRef.current.options.theme = getXtermTheme(currentThemeId()) as never;
      }),
    [],
  );

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

  useEffect(() => {
    if (!searchOpen) return;
    const id = window.setTimeout(() => {
      const input = containerRef.current?.parentElement?.querySelector<HTMLInputElement>('.td-search-input');
      input?.focus();
      input?.select();
    }, 30);
    return () => window.clearTimeout(id);
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    termRef.current?.focus();
  }

  const canvasMenuItems = (hasSelection: boolean): Array<MenuItem | { separator: true }> => [
    {
      id: 'copy',
      label: '复制',
      icon: 'copy',
      disabled: !hasSelection,
      onSelect: () => {
        const text = termRef.current?.getSelection();
        if (text && navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => {});
      },
    },
    {
      id: 'paste',
      label: '粘贴',
      icon: 'clipboard',
      onSelect: () => {
        const cb = navigator.clipboard;
        if (!cb) return;
        // paste() 会走 xterm 的 onData → cap.terminal write，保持与键盘输入同一条链路
        void cb.readText().then((text) => {
          if (text) termRef.current?.paste(text);
        }).catch(() => {});
      },
    },
    {
      id: 'select-all',
      label: '全选',
      icon: 'select-all',
      onSelect: () => termRef.current?.selectAll(),
    },
    { separator: true },
    { id: 'find', label: '查找', icon: 'search', onSelect: () => setSearchOpen(true) },
    {
      id: 'clear',
      label: '清屏',
      icon: 'eraser',
      // clear() 清当前视口、保留 scrollback；不用 reset()（会重置终端模式与标题）
      onSelect: () => termRef.current?.clear(),
    },
  ];

  return (
    <div className="td-session-wrap">
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
      {canvasMenu && (
        <ContextMenu
          anchor={canvasMenu.point}
          items={canvasMenuItems(canvasMenu.hasSelection)}
          onClose={() => setCanvasMenu(null)}
        />
      )}
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
    <div className="td-searchbar">
      <Icon name="search" size={13} />
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
      />
      <label className="td-check">
        <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
        区分大小写
      </label>
      <button className="td-iconbtn" onClick={onClose} title="关闭搜索" aria-label="关闭搜索">
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
