/**
 * terminal-desk 主面板（v0.3 改造）
 *
 * 布局对齐 v4 视觉基线：QuickRunBar(36) → 脚本中心(可折叠) → TabBar(36) → 终端区。
 * 会话语义对齐内置终端：挂载先恢复宿主已有 PTY 会话，无会话才新建；
 * 脚本运行=新会话（initialCommand + purpose:'script' + scriptId）；停止=关闭会话。
 *
 * 数据通道唯一：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.terminal。
 * 宿主 H1 真全屏落地前，全屏按钮降级为插件内「专注模式」（Esc 退出）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SessionView from './SessionView';
import ScriptCenter from './ScriptCenter';
import QuickRunBar from './QuickRunBar';
import RunCommandModal from './RunCommandModal';
import { ConfirmDialog, ContextMenu, type MenuItem } from './Overlays';
import { Icon } from './icons';
import { usePluginConfig } from './config';
import {
  capTerminal,
  currentWorkspacePath,
  hasHostFullscreen,
  listTerminalSessions,
  listenTerminalExit,
  onWorkspaceChanged,
  openInExternalTerminal,
  toggleHostFullscreen,
} from './bridge';
import {
  autoRunCandidates,
  confirmMessageFor,
  makeCustomCommand,
  markExited,
  mergeRecoveredSessions,
  nextSessionName,
  removeSession,
  selectRecentScript,
  setRuntime,
  upsertSession,
  type AutoRunTrigger,
  type CustomCommand,
  type HostSession,
  type ScriptRow,
  type ScriptRuntime,
  type ScriptTab,
  type SessionMeta,
} from './model';

interface PanelProps {
  pluginId?: string;
  onSendToChat?: (message: string) => void;
}

interface CreatedSession {
  session?: { id: string; name?: string };
}

interface ConfirmState {
  title: string;
  message: string;
  detail: string;
  onConfirm: () => void;
}

export default function TerminalDeskPanel(_props: PanelProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [splitPartnerId, setSplitPartnerId] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<Record<string, ScriptRuntime>>({});
  const [discovered, setDiscovered] = useState<ScriptRow[]>([]);
  const [discoveredLoading, setDiscoveredLoading] = useState(false);
  const [discoveredError, setDiscoveredError] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string | null>(() => currentWorkspacePath());
  const [ready, setReady] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; session: SessionMeta } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const sessionsRef = useRef<SessionMeta[]>([]);
  sessionsRef.current = sessions;
  const searchTriggersRef = useRef<Map<string, () => void>>(new Map());
  const seenAutoRunRef = useRef<Set<string>>(new Set());
  const autoBootDoneRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const confirmQueueRef = useRef<ConfirmState[]>([]);

  const onError = useCallback((message: string) => setError(message), []);
  const { config, ...actions } = usePluginConfig(onError);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  const partnerSession = useMemo(
    () =>
      splitPartnerId && splitPartnerId !== activeId
        ? sessions.find((s) => s.id === splitPartnerId && s.exitCode === null) ?? null
        : null,
    [sessions, splitPartnerId, activeId],
  );

  // ── 确认队列：多个待确认动作依次弹出，避免后者覆盖前者 ──────────────
  const showNextConfirm = useCallback(() => {
    if (confirmQueueRef.current.length === 0) {
      setConfirm(null);
      return;
    }
    setConfirm(confirmQueueRef.current.shift() ?? null);
  }, []);

  const resolveConfirm = useCallback(
    (run: boolean) => {
      const current = confirm;
      setConfirm(null);
      if (run) current?.onConfirm();
      showNextConfirm();
    },
    [confirm, showNextConfirm],
  );

  const requestConfirm = useCallback(
    (title: string, message: string, detail: string, onConfirm: () => void) => {
      const next: ConfirmState = { title, message, detail, onConfirm };
      if (confirm || confirmQueueRef.current.length > 0) {
        confirmQueueRef.current.push(next);
      } else {
        setConfirm(next);
      }
    },
    [confirm],
  );

  // ── 会话创建 / 恢复 / 关闭 ──────────────────────────────────────────
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

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    (async () => {
      try {
        const remote = await listTerminalSessions<HostSession>();
        const { sessions: restored } = mergeRecoveredSessions([], remote);
        if (restored.length > 0) {
          setSessions(restored);
          setActiveId(restored[0].id);
          // 恢复的脚本会话补运行时状态（宿主会话携带 scriptId）
          const nextRt: Record<string, ScriptRuntime> = {};
          for (const s of restored) {
            if (s.scriptId) {
              nextRt[s.scriptId] = {
                status: 'running',
                terminalSessionId: s.id,
                lastRunAt: Date.now(),
              };
            }
          }
          if (Object.keys(nextRt).length > 0) setRuntimes(nextRt);
        } else {
          await createSession();
        }
      } catch {
        // list 失败（旧宿主 / Web 未注册）→ 回落为直接新建，错误由 createSession 统一入横幅
        try {
          await createSession();
        } catch {
          /* 已有错误横幅 */
        }
      } finally {
        setReady(true);
      }
    })();
  }, [createSession]);

  const closeSession = useCallback(async (sessionId: string) => {
    try {
      await capTerminal({ action: 'close', sessionId });
    } catch {
      /* 已退出会话 close 可能报 NotFound：UI 层照常移除 */
    }
    setSessions((prev) => {
      const next = removeSession(prev, sessionId);
      setActiveId((cur) => (cur === sessionId ? next[0]?.id ?? null : cur));
      return next;
    });
    setSplitPartnerId((cur) => (cur === sessionId ? null : cur));
    searchTriggersRef.current.delete(sessionId);
  }, []);

  // 退出事件：标记退出码 + 脚本运行时终态（退出码非 0 记 failed）
  useEffect(
    () =>
      listenTerminalExit((event) => {
        const found = sessionsRef.current.find((s) => s.id === event.sessionId);
        if (found?.scriptId) {
          setRuntimes((prev) =>
            setRuntime(prev, found.scriptId as string, {
              status: event.exitCode && event.exitCode !== 0 ? 'failed' : 'success',
              terminalSessionId: event.sessionId,
              exitCode: event.exitCode,
            }),
          );
        }
        setSessions((prev) => markExited(prev, event.sessionId, event.exitCode));
      }),
    [],
  );

  // ── 脚本表（项目发现 + 自定义，扣除隐藏项）──────────────────────────
  const refreshDiscovered = useCallback(async () => {
    const ws = currentWorkspacePath();
    if (!ws) {
      setDiscovered([]);
      setDiscoveredError(null);
      return;
    }
    setDiscoveredLoading(true);
    try {
      const res = await capTerminal<{
        scripts?: Array<{
          id: string;
          name: string;
          command: string;
          cwd?: string;
          source: string;
          sourcePath: string;
          enabled: boolean;
          tags: string[];
        }>;
      }>({ action: 'discover_scripts', workspacePath: ws });
      setDiscovered(
        (res.scripts ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          command: s.command,
          cwd: s.cwd,
          custom: false,
        })),
      );
      setDiscoveredError(null);
    } catch (e) {
      setDiscoveredError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscoveredLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDiscovered();
    return onWorkspaceChanged((path) => {
      setWorkspacePath(path);
      void refreshDiscovered();
    });
  }, [refreshDiscovered]);

  const scripts = useMemo<ScriptRow[]>(() => {
    const custom: ScriptRow[] = config.customCommands.map((c: CustomCommand) => ({
      id: c.id,
      name: c.name,
      command: c.command,
      cwd: c.cwd,
      env: c.env,
      custom: true,
      autoRun: c.autoRun,
      autoRunTrigger: c.autoRunTrigger,
      confirmBeforeAutoRun: c.confirmBeforeAutoRun,
    }));
    const project: ScriptRow[] = discovered.map((s) => {
      const rule = config.autoRunRules[s.id];
      return {
        ...s,
        autoRun: rule?.enabled,
        autoRunTrigger: rule?.trigger,
        confirmBeforeAutoRun: rule?.confirm,
      };
    });
    const enabledCustom = custom.filter((s) => config.customCommands.find((c) => c.id === s.id)?.enabled !== false);
    return [...project, ...enabledCustom].filter((s) => config.hiddenScriptIds.indexOf(s.id) === -1);
  }, [config.customCommands, config.autoRunRules, config.hiddenScriptIds, discovered]);

  const recentScript = useMemo(() => selectRecentScript(scripts, runtimes), [scripts, runtimes]);

  // ── 运行 / 停止 / 危险确认 ──────────────────────────────────────────
  const runScript = useCallback(
    async (script: ScriptRow): Promise<void> => {
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
    },
    [createSession],
  );

  const lastRunRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const guardedRun = useCallback(
    (script: ScriptRow) => {
      // 行点击即运行，双击会连发两次 click；350ms 内同一脚本只放行一次，
      // 避免重复开 PTY 会话与重复弹危险确认。
      const now = Date.now();
      if (lastRunRef.current.id === script.id && now - lastRunRef.current.at < 350) return;
      lastRunRef.current = { id: script.id, at: now };
      const msg = confirmMessageFor(script.command);
      if (msg) {
        requestConfirm('危险命令确认', msg, script.command, () => {
          void runScript(script).catch(() => {});
        });
        return;
      }
      void runScript(script).catch(() => {});
    },
    [runScript, requestConfirm],
  );

  const stopScript = useCallback(
    (scriptId: string) => {
      const rt = runtimes[scriptId];
      if (rt?.terminalSessionId) void closeSession(rt.terminalSessionId);
      setRuntimes((prev) => setRuntime(prev, scriptId, { status: 'stopped' }));
    },
    [runtimes, closeSession],
  );

  // ── 自动运行（app_start / workspace_open / terminal_open）────────────
  const triggerAutoRun = useCallback(
    (trigger: AutoRunTrigger, ws: string | null) => {
      const candidates = autoRunCandidates(
        config.customCommands,
        config.autoRunRules,
        trigger,
        ws,
        seenAutoRunRef.current,
      );
      for (const c of candidates) {
        seenAutoRunRef.current.add(c.key);
        const script = scripts.find((s) => s.id === c.id);
        if (!script) continue;
        if (c.needsConfirm) {
          requestConfirm(
            '自动运行确认',
            `脚本「${script.name}」已配置自动运行，是否执行？`,
            script.command,
            () => void runScript(script).catch(() => {}),
          );
        } else {
          void runScript(script).catch(() => {});
        }
      }
    },
    [config.customCommands, config.autoRunRules, scripts, requestConfirm, runScript],
  );

  useEffect(() => {
    if (!ready) return;
    if (!autoBootDoneRef.current) {
      autoBootDoneRef.current = true;
      triggerAutoRun('app_start', workspacePath);
      triggerAutoRun('terminal_open', workspacePath);
    }
    triggerAutoRun('workspace_open', workspacePath);
  }, [ready, workspacePath, triggerAutoRun]);

  // ── 分屏 / 全屏（专注模式）──────────────────────────────────────────
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

  const focusMode = config.uiState.focusMode;
  const toggleFocus = useCallback(() => {
    if (hasHostFullscreen()) {
      void toggleHostFullscreen().catch((e) =>
        setError(`宿主全屏切换失败：${e instanceof Error ? e.message : String(e)}`),
      );
      return;
    }
    void actions.setUiState({ focusMode: !focusMode });
  }, [actions, focusMode]);

  // ── 快捷键 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = rootRef.current;
      if (!el || el.offsetParent === null) return;
      if (e.key === 'Escape' && focusMode) {
        e.preventDefault();
        e.stopPropagation();
        void actions.setUiState({ focusMode: false });
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        e.stopPropagation();
        setRunnerOpen(true);
      } else if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        e.stopPropagation();
        if (activeId) searchTriggersRef.current.get(activeId)?.();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [focusMode, activeId, actions]);

  // ── tab 右键菜单 ────────────────────────────────────────────────────
  const tabMenuItems = useCallback(
    (session: SessionMeta): Array<MenuItem | { separator: true }> => {
      const script = session.scriptId ? scripts.find((s) => s.id === session.scriptId) : null;
      const running = session.scriptId ? runtimes[session.scriptId]?.status === 'running' : false;
      return [
        { id: 'rename', label: '重命名', icon: 'edit', onSelect: () => setRenamingId(session.id) },
        { id: 'new', label: '新建终端', icon: 'plus', onSelect: () => void createSession().catch(() => {}) },
        {
          id: 'split',
          label: partnerSession ? '取消分屏' : '左右分屏',
          icon: 'columns',
          onSelect: toggleSplit,
        },
        { separator: true },
        ...(script
          ? ([
              { id: 'rerun', label: '重跑关联脚本', icon: 'play', onSelect: () => guardedRun(script) },
              {
                id: 'stop',
                label: '停止关联脚本',
                icon: 'square',
                disabled: !running,
                onSelect: () => session.scriptId && stopScript(session.scriptId),
              },
              { separator: true },
            ] as Array<MenuItem | { separator: true }>)
          : []),
        {
          id: 'copycmd',
          label: '复制启动命令',
          icon: 'copy',
          disabled: !script,
          onSelect: () => {
            if (script) void navigator.clipboard?.writeText(script.command).catch(() => {});
          },
        },
        {
          id: 'external',
          label: '在外部终端运行',
          icon: 'external',
          disabled: !script,
          onSelect: () => {
            if (script) {
              void openInExternalTerminal(script.command, session.cwd ?? workspacePath ?? undefined, script.env).catch(
                (e) => setError(`外部终端启动失败：${e instanceof Error ? e.message : String(e)}`),
              );
            }
          },
        },
        { separator: true },
        {
          id: 'close',
          label: '关闭会话',
          icon: 'close',
          danger: true,
          onSelect: () => void closeSession(session.id),
        },
      ];
    },
    [scripts, runtimes, partnerSession, toggleSplit, createSession, guardedRun, stopScript, closeSession, workspacePath],
  );

  const renameSession = useCallback(
    (id: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) void actions.setSessionNames({ ...config.sessionNames, [id]: trimmed });
      setRenamingId(null);
    },
    [actions, config.sessionNames],
  );

  const saveAndRun = useCallback(
    async (command: string, name: string) => {
      const cmd = makeCustomCommand(name, command, currentWorkspacePath() ?? undefined);
      await actions.setCustomCommands([...config.customCommands, cmd]);
      await runScript({
        id: cmd.id,
        name: cmd.name,
        command: cmd.command,
        cwd: cmd.cwd,
        custom: true,
      });
    },
    [actions, config.customCommands, runScript],
  );

  // ── 渲染 ────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} className={`td-root${focusMode ? ' td-focus' : ''}`}>
      {!focusMode && (
        <>
          <QuickRunBar
            collapsed={config.uiState.scriptCenterCollapsed}
            onToggleCollapsed={() =>
              void actions.setUiState({ scriptCenterCollapsed: !config.uiState.scriptCenterCollapsed })
            }
            script={recentScript}
            runtime={recentScript ? runtimes[recentScript.id] : undefined}
            onRun={() => recentScript && guardedRun(recentScript)}
            onStop={() => recentScript && stopScript(recentScript.id)}
            onOpenRunner={() => setRunnerOpen(true)}
          />

          <ScriptCenter
            collapsed={config.uiState.scriptCenterCollapsed}
            tab={config.uiState.scriptTab as ScriptTab}
            onTabChange={(tab) => void actions.setUiState({ scriptTab: tab })}
            workspacePath={workspacePath}
            scripts={scripts}
            runtimes={runtimes}
            config={config}
            actions={actions}
            loading={discoveredLoading}
            discoveredError={discoveredError}
            onRefresh={() => void refreshDiscovered()}
            onRun={guardedRun}
            onStop={stopScript}
            onError={onError}
            requestConfirm={requestConfirm}
          />

          <div className="td-tabbar">
            <div className="td-tabstrip">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`td-tab${s.id === activeId ? ' td-tab-on' : ''}`}
                  onClick={() => setActiveId(s.id)}
                  onDoubleClick={() => setRenamingId(s.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveId(s.id);
                    setTabMenu({ x: e.clientX, y: e.clientY, session: s });
                  }}
                  title={config.sessionNames[s.id] ?? s.name}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setActiveId(s.id);
                  }}
                >
                  <Icon name="terminal" size={13} className="td-tab-icon" />
                  {renamingId === s.id ? (
                    <input
                      className="td-tab-input"
                      autoFocus
                      defaultValue={config.sessionNames[s.id] ?? s.name}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameSession(s.id, (e.target as HTMLInputElement).value);
                        else if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={(e) => renameSession(s.id, e.target.value)}
                    />
                  ) : (
                    <span className="td-tab-name">{config.sessionNames[s.id] ?? s.name}</span>
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
                    <Icon name="close" size={12} />
                  </span>
                </div>
              ))}
            </div>
            <div className="td-tabbar-actions">
              <button className="td-tabaction" onClick={() => void createSession().catch(() => {})} title="新建终端" aria-label="新建终端">
                <Icon name="plus" size={15} />
              </button>
              <button
                className={`td-tabaction${partnerSession ? ' td-tabaction-on' : ''}`}
                onClick={toggleSplit}
                title={partnerSession ? '取消左右分屏' : '左右分屏'}
                aria-label="左右分屏"
              >
                <Icon name="columns" size={14} />
              </button>
              <button
                className={`td-tabaction${focusMode || hasHostFullscreen() ? ' td-tabaction-on' : ''}`}
                onClick={toggleFocus}
                title={hasHostFullscreen() ? '切换宿主全屏 (Esc 退出)' : '专注模式：隐藏工具栏，Esc 退出'}
                aria-label="全屏 / 专注模式"
              >
                <Icon name="maximize" size={14} />
              </button>
              <button className="td-tabaction" onClick={() => setRunnerOpen(true)} title="运行命令 Ctrl+Shift+R" aria-label="运行命令">
                <Icon name="play" size={13} />
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="td-errorbar">
          <Icon name="alert" size={13} />
          <span className="td-errorbar-text">{error}</span>
          <button className="td-iconbtn" onClick={() => setError(null)} title="关闭提示" aria-label="关闭提示">
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      {focusMode && (
        <div className="td-focus-hint">
          <Icon name="minimize" size={12} /> 专注模式 · Esc 退出
          <button className="td-iconbtn" onClick={toggleFocus} title="退出专注模式" aria-label="退出专注模式">
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      <div className="td-stage" style={partnerSession ? { flexDirection: 'row' } : undefined}>
        {sessions.map((s) => {
          const inSplit = !!partnerSession && (s.id === activeId || s.id === partnerSession.id);
          const isLeftPane = partnerSession && s.id === activeId;
          return (
            <div
              key={s.id}
              className="td-pane"
              style={{
                display: partnerSession ? (inSplit ? 'flex' : 'none') : s.id === activeId ? 'flex' : 'none',
                ...(partnerSession && isLeftPane ? { borderRight: '1px solid rgb(var(--c-border) / 0.1)' } : {}),
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
                  searchTriggersRef.current.set(s.id, open);
                  return () => searchTriggersRef.current.delete(s.id);
                }}
              />
            </div>
          );
        })}
        {sessions.length === 0 && (
          <div className="td-empty">
            <Icon name="terminal" size={36} />
            <div>暂无终端会话</div>
            <button className="td-btn td-btn-primary" onClick={() => void createSession().catch(() => {})}>
              新建终端
            </button>
          </div>
        )}
      </div>

      {runnerOpen && (
        <RunCommandModal
          scripts={scripts.filter((s) => s.custom)}
          workspacePath={workspacePath}
          onClose={() => setRunnerOpen(false)}
          onRun={async (command) => {
            const msg = confirmMessageFor(command);
            if (msg) {
              setRunnerOpen(false);
              requestConfirm('危险命令确认', msg, command, () => {
                void runScript({ id: `adhoc:${command}`, name: command.slice(0, 40), command, custom: true }).catch(
                  () => {},
                );
              });
              return;
            }
            if (!activeSession || activeSession.exitCode !== null) {
              await createSession({ name: 'Run', initialCommand: command });
            } else {
              const { encodeBase64 } = await import('./model');
              await capTerminal({
                action: 'write',
                sessionId: activeSession.id,
                data: encodeBase64(`${command}\r`),
              });
            }
            setRunnerOpen(false);
          }}
          onSaveAndRun={async (command, name) => {
            await saveAndRun(command, name);
            setRunnerOpen(false);
          }}
        />
      )}

      {tabMenu && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={tabMenuItems(tabMenu.session)}
          onClose={() => setTabMenu(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          detail={confirm.detail}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      )}
    </div>
  );
}
