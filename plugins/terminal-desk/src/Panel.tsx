/**
 * terminal-desk 主面板：多标签会话 + 脚本抽屉 + 运行命令浮层
 *
 * 会话语义对齐内置终端：挂载自动建首个会话；脚本运行=新会话（initialCommand +
 * purpose:'script' + scriptId）；停止=关闭会话；退出码徽标；Ctrl+Shift+R 浮层
 * （面板可见时生效）。全屏走 manifest supportsFullscreen（宿主机制）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SessionView from './SessionView';
import ScriptDrawer, { saveCustomCommand } from './ScriptDrawer';
import RunCommandModal from './RunCommandModal';
import {
  capTerminal,
  currentWorkspacePath,
  listenTerminalExit,
  onWorkspaceChanged,
} from './bridge';
import {
  markExited,
  nextSessionName,
  removeSession,
  setRuntime,
  upsertSession,
  type ScriptRuntime,
  type SessionMeta,
} from './model';

interface PanelProps {
  pluginId?: string;
  onSendToChat?: (message: string) => void;
}

interface CreatedSession {
  session?: { id: string; name?: string };
}

export default function TerminalDeskPanel(_props: PanelProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  /** 左右分屏：右栏会话 id（null = 单栏）。左栏恒为 activeId。 */
  const [splitPartnerId, setSplitPartnerId] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<Record<string, ScriptRuntime>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** tab 栏内会话名覆盖（重命名不回传后端——会话名仅本面板展示语义） */
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const sessionsRef = useRef<SessionMeta[]>([]);
  sessionsRef.current = sessions;

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  // 分屏伙伴：必须存在且未退出；否则视作单栏（splitPartnerId 残留无害）
  const partnerSession = useMemo(
    () =>
      splitPartnerId && splitPartnerId !== activeId
        ? sessions.find((s) => s.id === splitPartnerId && s.exitCode === null) ?? null
        : null,
    [sessions, splitPartnerId, activeId],
  );

  const createSession = useCallback(
    async (opts?: {
      name?: string;
      cwd?: string | null;
      initialCommand?: string;
      env?: Record<string, string>;
      purpose?: string;
      scriptId?: string;
      activate?: boolean;
    }): Promise<SessionMeta> => {
      setError(null);
      try {
        const res = await capTerminal<CreatedSession>({
          action: 'create',
          name: opts?.name ?? nextSessionName(sessionsRef.current),
          cwd: opts?.cwd ?? currentWorkspacePath() ?? undefined,
          cols: 80,
          rows: 24,
          initialCommand: opts?.initialCommand,
          env: opts?.env,
          purpose: opts?.purpose,
          scriptId: opts?.scriptId,
        });
        const session = res.session;
        if (!session?.id) throw new Error('创建会话失败：宿主未返回 sessionId');
        const meta: SessionMeta = {
          id: session.id,
          name: opts?.name ?? session.name ?? nextSessionName(sessionsRef.current),
          exitCode: null,
          scriptId: opts?.scriptId,
          cwd: opts?.cwd ?? null,
        };
        setSessions((prev) => upsertSession(prev, meta));
        if (opts?.activate !== false) setActiveId(session.id);
        return meta;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      }
    },
    [],
  );

  // 挂载自动建首个会话（无会话时；与内置一致）
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void createSession().catch(() => {
      /* 错误已入 error 横幅（宿主未升级/无 cap.terminal 场景） */
    });
  }, [createSession]);

  /** 左右分屏开关：无第二会话时自动新建（不抢焦点）；再点取消分屏 */
  const toggleSplit = useCallback(() => {
    if (partnerSession) {
      setSplitPartnerId(null);
      return;
    }
    if (!activeSession) return;
    const target = sessions.find((s) => s.id !== activeSession.id && s.exitCode === null);
    if (target) {
      setSplitPartnerId(target.id);
      return;
    }
    void createSession({ activate: false })
      .then((meta) => setSplitPartnerId(meta.id))
      .catch(() => {});
  }, [partnerSession, activeSession, sessions, createSession]);

  // 退出事件：标记退出码；关联脚本 runtime 置 stopped
  useEffect(() => {
    return listenTerminalExit((event) => {
      setSessions((prev) => {
        const found = prev.find((s) => s.id === event.sessionId);
        if (found?.scriptId) {
          setRuntimes((prevRt) =>
            setRuntime(prevRt, found.scriptId as string, { status: 'stopped', terminalSessionId: event.sessionId }),
          );
        }
        return markExited(prev, event.sessionId, event.exitCode);
      });
    });
  }, []);

  const closeSession = useCallback(async (sessionId: string) => {
    try {
      await capTerminal({ action: 'close', sessionId });
    } catch {
      /* 已退出会话 close 可能报 NotFound：UI 层照常移除 */
    }
    setSessions((prev) => removeSession(prev, sessionId));
    setActiveId((prev) => (prev === sessionId ? null : prev));
  }, []);

  const runScript = useCallback(
    async (script: { id: string; name: string; command: string; cwd?: string; env?: Record<string, string> }) => {
      const meta = await createSession({
        name: script.name,
        cwd: script.cwd || currentWorkspacePath(),
        initialCommand: script.command,
        env: script.env,
        purpose: 'script',
        scriptId: script.id,
      });
      setRuntimes((prev) =>
        setRuntime(prev, script.id, { status: 'running', terminalSessionId: meta.id }),
      );
      return meta.id;
    },
    [createSession],
  );

  const stopScript = useCallback(async (scriptId: string) => {
    const rt = runtimes[scriptId];
    if (rt?.terminalSessionId) await closeSession(rt.terminalSessionId);
  }, [runtimes, closeSession]);

  // 工作区切换：脚本抽屉内的发现列表由 ScriptDrawer 自行订阅；此处仅聚焦新会话 cwd 默认值
  useEffect(() => onWorkspaceChanged(() => {
    /* cwd 默认值每次 createSession 现读 __POLARIS_HOST_WORKSPACE__，无需额外处理 */
  }), []);

  // 快捷键（面板可见时生效）：Ctrl+Shift+R 运行命令浮层 / Ctrl+F 搜索当前会话
  const searchTriggerRef = useRef<(() => void) | null>(null);
  const isPanelVisible = useCallback(() => {
    const el = rootRef.current;
    return !!el && el.offsetParent !== null;
  }, []);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPanelVisible()) return;
      if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        e.stopPropagation();
        setRunnerOpen(true);
      } else if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        // xterm 自身会聚焦；命中当前会话的搜索条
        e.preventDefault();
        e.stopPropagation();
        searchTriggerRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isPanelVisible]);

  const openEmptySession = useCallback(() => {
    void createSession().catch(() => {});
  }, [createSession]);

  return (
    <div ref={rootRef} className="td-root">
      {/* tab 栏 */}
      <div className="td-tabbar">
        {sessions.map((s) => (
          <button
            key={s.id}
            className={`td-tab${s.id === activeId ? ' td-tab-on' : ''}`}
            onClick={() => setActiveId(s.id)}
            onDoubleClick={() => setRenamingId(s.id)}
            title={s.id === activeId ? '双击重命名' : undefined}
          >
            {renamingId === s.id ? (
              <input
                className="td-tab-input"
                autoFocus
                defaultValue={nameOverrides[s.id] ?? s.name}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = (e.target as HTMLInputElement).value.trim();
                    if (value) setNameOverrides((prev) => ({ ...prev, [s.id]: value }));
                    setRenamingId(null);
                  } else if (e.key === 'Escape') {
                    setRenamingId(null);
                  }
                }}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (value) setNameOverrides((prev) => ({ ...prev, [s.id]: value }));
                  setRenamingId(null);
                }}
              />
            ) : (
              <span className="td-tab-name">{nameOverrides[s.id] ?? s.name}</span>
            )}
            {s.exitCode !== null && <span className="td-tab-exit">exit {s.exitCode}</span>}
            <span
              className="td-tab-close"
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                void closeSession(s.id);
              }}
              title="关闭会话"
            >
              ✕
            </span>
          </button>
        ))}
        <span className="td-tabbar-actions">
          <button className="td-iconbtn" onClick={openEmptySession} title="新建终端">
            ＋
          </button>
          <button
            className="td-iconbtn"
            onClick={toggleSplit}
            title={partnerSession ? '取消左右分屏' : '左右分屏（当前会话 | 另一会话）'}
          >
            ⿴
          </button>
          <button
            className="td-iconbtn"
            onClick={() => setRunnerOpen(true)}
            title="运行命令（Ctrl+Shift+R）"
          >
            ▶
          </button>
          <button
            className="td-iconbtn"
            onClick={() => setDrawerOpen((v) => !v)}
            title={drawerOpen ? '收起脚本抽屉' : '展开脚本抽屉'}
          >
            {drawerOpen ? '▾' : '▴'}
          </button>
        </span>
      </div>

      {error && <div className="td-errorbar">{error}</div>}

      {/* 会话区（保活挂载，display 切换；分屏时 stage 转行向、双栏 flex:1） */}
      <div className="td-stage" style={partnerSession ? { flexDirection: 'row' } : undefined}>
        {sessions.map((s) => {
          // 分屏下两栏同时可见（ResizeObserver 各自 fit → resize）
          const inSplit = !!partnerSession && (s.id === activeId || s.id === partnerSession.id);
          const isLeftPane = partnerSession && s.id === activeId;
          return (
            <div
              key={s.id}
              style={{
                display: partnerSession ? (inSplit ? 'flex' : 'none') : s.id === activeId ? 'flex' : 'none',
                flexDirection: 'column',
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                borderRight:
                  partnerSession && isLeftPane ? '1px solid rgb(var(--c-border))' : undefined,
              }}
            >
              {s.exitCode !== null && (
                <div className="td-exitbanner">
                  <span>会话已退出（exit {s.exitCode}）</span>
                  <button
                    className="td-mini"
                    onClick={() => {
                      void closeSession(s.id);
                      void createSession({ activate: true });
                    }}
                  >
                    开新会话
                  </button>
                  <button className="td-mini" onClick={() => void closeSession(s.id)}>
                    关闭标签
                  </button>
                </div>
              )}
              <SessionView
                sessionId={s.id}
                visible={partnerSession ? inSplit : s.id === activeId}
                onExit={(code) => setSessions((prev) => markExited(prev, s.id, code))}
                registerSearch={(open) => {
                  searchTriggerRef.current = open;
                }}
              />
            </div>
          );
        })}
        {sessions.length === 0 && (
          <div className="td-empty">
            <div>暂无终端会话</div>
            <button className="td-mini" onClick={openEmptySession}>
              新建终端
            </button>
          </div>
        )}
        {runnerOpen && (
          <RunCommandModal
            onClose={() => setRunnerOpen(false)}
            onRun={async (command) => {
              if (!activeSession || activeSession.exitCode !== null) {
                await createSession({ name: 'Run', initialCommand: command });
              } else {
                // 写入当前活跃会话（带换行执行）
                const { encodeBase64 } = await import('./model');
                await capTerminal({ action: 'write', sessionId: activeSession.id, data: encodeBase64(`${command}\r`) });
              }
              setRunnerOpen(false);
            }}
            onSaveAndRun={async (command, name) => {
              await saveCustomCommand(name, command, currentWorkspacePath() ?? undefined);
              await createSession({ name: name || 'Run', initialCommand: command });
              setRunnerOpen(false);
            }}
          />
        )}
      </div>

      {/* 脚本抽屉 */}
      {drawerOpen && (
        <ScriptDrawer
          runtimes={runtimes}
          onRun={runScript}
          onStop={stopScript}
        />
      )}
    </div>
  );
}
