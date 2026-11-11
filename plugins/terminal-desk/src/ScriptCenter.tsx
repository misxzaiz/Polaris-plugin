/**
 * 脚本中心（替代旧版底部 256px 抽屉）：v4 基线中的顶部可折叠区域，
 * 对齐内置 TerminalScriptPanel 的功能面——项目发现 / 自定义 / 编辑 / 复制 /
 * 隐藏 / 删除 / 在外部系统终端运行 / 自动运行 / 旧数据导入，全部带右键菜单。
 * 数据由 Panel 统一持有并上报（QuickRunBar、自动运行、tab 菜单共用同一份脚本表）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { openInExternalTerminal } from './bridge';
import { ContextMenu, ImportDialog, type MenuItem } from './Overlays';
import { Icon } from './icons';
import {
  AUTO_RUN_TRIGGERS,
  confirmMessageFor,
  makeCustomCommand,
  mergeHiddenIds,
  mergeImportedCommands,
  parseLegacyTerminalScripts,
  type AutoRunRule,
  type AutoRunTrigger,
  type CustomCommand,
  type PluginConfig,
  type ScriptRow,
  type ScriptRuntime,
  type ScriptTab,
  type UiState,
} from './model';

export interface ScriptCenterActions {
  setCustomCommands: (list: CustomCommand[]) => Promise<void>;
  setHiddenScriptIds: (ids: string[]) => Promise<void>;
  setAutoRunRules: (rules: Record<string, AutoRunRule>) => Promise<void>;
  importLegacy: (commands: CustomCommand[], hidden: string[]) => Promise<void>;
  setUiState: (patch: Partial<UiState>) => Promise<void>;
}

export interface ScriptCenterProps {
  collapsed: boolean;
  tab: ScriptTab;
  onTabChange: (tab: ScriptTab) => void;
  workspacePath: string | null;
  scripts: ScriptRow[];
  runtimes: Record<string, ScriptRuntime>;
  config: PluginConfig;
  actions: ScriptCenterActions;
  loading: boolean;
  discoveredError: string | null;
  onRefresh: () => void;
  onRun: (script: ScriptRow) => void;
  onStop: (scriptId: string) => void;
  onError: (message: string) => void;
  requestConfirm: (title: string, message: string, detail: string, onConfirm: () => void) => void;
}

interface EditorDraft {
  name: string;
  command: string;
  cwd: string;
  envText: string;
  autoRun: boolean;
  autoRunTrigger: AutoRunTrigger;
  confirmBeforeAutoRun: boolean;
  enabled: boolean;
}

function draftFromScript(script: ScriptRow): EditorDraft {
  return {
    name: script.name,
    command: script.command,
    cwd: script.cwd ?? '',
    envText: script.env ? JSON.stringify(script.env) : '',
    autoRun: script.autoRun ?? false,
    autoRunTrigger: script.autoRunTrigger ?? 'workspace_open',
    confirmBeforeAutoRun: script.confirmBeforeAutoRun ?? false,
    enabled: true,
  };
}

function parseEnv(text: string): Record<string, string> | undefined {
  if (!text.trim()) return undefined;
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('环境变量需为 JSON 对象');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) out[k] = String(v);
  return out;
}

export default function ScriptCenter({
  collapsed,
  tab,
  onTabChange,
  workspacePath,
  scripts,
  runtimes,
  config,
  actions,
  loading,
  discoveredError,
  onRefresh,
  onRun,
  onStop,
  onError,
  requestConfirm,
}: ScriptCenterProps) {
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; script: ScriptRow } | null>(null);
  const [editing, setEditing] = useState<{ mode: 'new' | 'edit'; id?: string } | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scripts.filter(
      (s) =>
        (tab === 'custom') === s.custom &&
        config.hiddenScriptIds.indexOf(s.id) === -1 &&
        (!q || s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q)),
    );
  }, [scripts, search, tab, config.hiddenScriptIds]);

  const hiddenIds = config.hiddenScriptIds;

  // 危险命令确认统一由 Panel.guardedRun 处理（单一入口，禁止双重确认）。
  // 行点击即运行，故双击会连发两次 click → 交由 Panel 的 350ms 节流拦住。
  const guardRun = useCallback((script: ScriptRow) => onRun(script), [onRun]);

  const runExternal = useCallback(
    (script: ScriptRow) => {
      const msg = confirmMessageFor(script.command);
      const run = () => {
        void openInExternalTerminal(script.command, script.cwd ?? workspacePath ?? undefined, script.env).catch(
          (e) => onError(`外部终端启动失败：${e instanceof Error ? e.message : String(e)}`),
        );
      };
      if (msg) requestConfirm('危险命令确认', msg, `${script.command}（系统终端）`, run);
      else run();
    },
    [workspacePath, onError, requestConfirm],
  );

  const openEditor = useCallback((script?: ScriptRow) => {
    if (script) {
      setEditing({ mode: 'edit', id: script.id });
      setDraft(draftFromScript(script));
    } else {
      setEditing({ mode: 'new' });
      setDraft({
        name: '',
        command: '',
        cwd: workspacePath ?? '',
        envText: '',
        autoRun: false,
        autoRunTrigger: 'workspace_open',
        confirmBeforeAutoRun: false,
        enabled: true,
      });
    }
  }, [workspacePath]);

  const saveDraft = useCallback(async () => {
    if (!editing || !draft) return;
    if (!draft.command.trim()) {
      onError('命令不能为空');
      return;
    }
    let env: Record<string, string> | undefined;
    try {
      env = parseEnv(draft.envText);
    } catch (e) {
      onError(`环境变量格式错误：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const base = makeCustomCommand(draft.name, draft.command, draft.cwd || undefined);
    if (editing.mode === 'edit' && editing.id) {
      const next = config.customCommands.map((c) =>
        c.id === editing.id
          ? {
              ...c,
              name: base.name,
              command: base.command,
              cwd: base.cwd,
              env,
              autoRun: draft.autoRun,
              autoRunTrigger: draft.autoRunTrigger,
              confirmBeforeAutoRun: draft.confirmBeforeAutoRun,
              enabled: draft.enabled,
            }
          : c,
      );
      await actions.setCustomCommands(next);
    } else {
      await actions.setCustomCommands([
        ...config.customCommands,
        {
          ...base,
          env,
          autoRun: draft.autoRun,
          autoRunTrigger: draft.autoRunTrigger,
          confirmBeforeAutoRun: draft.confirmBeforeAutoRun,
          enabled: draft.enabled,
        },
      ]);
    }
    setEditing(null);
    setDraft(null);
  }, [editing, draft, config.customCommands, actions, onError]);

  const duplicate = useCallback(
    async (script: ScriptRow) => {
      const copy = makeCustomCommand(`${script.name} 副本`, script.command, script.cwd);
      await actions.setCustomCommands([
        ...config.customCommands,
        { ...copy, env: script.env, autoRun: script.autoRun, autoRunTrigger: script.autoRunTrigger },
      ]);
      onTabChange('custom');
    },
    [config.customCommands, actions, onTabChange],
  );

  const removeOrHide = useCallback(
    (script: ScriptRow) => {
      const title = script.custom ? '删除自定义命令' : '隐藏项目脚本';
      const message = script.custom
        ? `将永久删除「${script.name}」，此操作不可撤销。`
        : `「${script.name}」来自项目脚本文件，不会修改源文件，仅从脚本中心隐藏。`;
      requestConfirm(title, message, script.command, () => {
        if (script.custom) {
          void actions.setCustomCommands(config.customCommands.filter((c) => c.id !== script.id));
        } else {
          void actions.setHiddenScriptIds(mergeHiddenIds(hiddenIds, [script.id]));
        }
      });
    },
    [requestConfirm, actions, config.customCommands, hiddenIds],
  );

  const toggleAutoRun = useCallback(
    (script: ScriptRow) => {
      if (script.custom) {
        void actions.setCustomCommands(
          config.customCommands.map((c) =>
            c.id === script.id ? { ...c, autoRun: !script.autoRun } : c,
          ),
        );
      } else {
        const rule = config.autoRunRules[script.id];
        void actions.setAutoRunRules({
          ...config.autoRunRules,
          [script.id]: {
            enabled: !rule?.enabled,
            trigger: rule?.trigger ?? 'workspace_open',
            confirm: rule?.confirm ?? false,
          },
        });
      }
    },
    [config.customCommands, config.autoRunRules, actions],
  );

  const importLegacy = useCallback(
    (text: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        onError(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      const result = parseLegacyTerminalScripts(parsed, workspacePath);
      const merged = mergeImportedCommands(config.customCommands, result.commands);
      const hidden = mergeHiddenIds(hiddenIds, result.hiddenScriptIds);
      void actions.importLegacy(merged.commands, hidden);
      setShowImport(false);
      onTabChange('custom');
      if (merged.addedCount === 0) onError('未发现可导入的新脚本（可能已导入过，或不含 source:"user" 的自定义脚本）');
    },
    [workspacePath, config.customCommands, hiddenIds, actions, onTabChange, onError],
  );

  const menuItems = useCallback(
    (script: ScriptRow): Array<MenuItem | { separator: true }> => {
      const rt = runtimes[script.id];
      const running = rt?.status === 'running';
      return [
        { id: 'run', label: '运行', icon: 'play', onSelect: () => guardRun(script) },
        {
          id: 'stop',
          label: '停止',
          icon: 'square',
          disabled: !running,
          onSelect: () => onStop(script.id),
        },
        { id: 'external', label: '在外部终端运行', icon: 'external', onSelect: () => runExternal(script) },
        { separator: true },
        {
          id: 'autorun',
          label: script.autoRun ? '关闭自动运行' : '启用自动运行',
          icon: 'zap',
          onSelect: () => void toggleAutoRun(script),
        },
        { separator: true },
        ...(script.custom
          ? ([
              { id: 'edit', label: '编辑', icon: 'edit', onSelect: () => openEditor(script) },
              { id: 'duplicate', label: '创建副本', icon: 'copy', onSelect: () => void duplicate(script) },
              { separator: true },
              {
                id: 'delete',
                label: '删除',
                icon: 'trash',
                danger: true,
                onSelect: () => removeOrHide(script),
              },
            ] as MenuItem[])
          : ([
              {
                id: 'hide',
                label: '从脚本中心隐藏',
                icon: 'eye-off',
                danger: true,
                onSelect: () => removeOrHide(script),
              },
            ] as MenuItem[])),
      ];
    },
    [runtimes, guardRun, onStop, runExternal, toggleAutoRun, openEditor, duplicate, removeOrHide],
  );

  // 菜单/编辑状态在折叠或切页时收起，避免残留浮层
  useEffect(() => {
    if (collapsed) {
      setMenu(null);
      setEditing(null);
      setShowHidden(false);
    }
  }, [collapsed]);

  if (collapsed) return null;

  return (
    <div className="td-scriptcenter">
      <div className="td-sc-head">
        <button
          className={`td-chip${tab === 'project' ? ' td-chip-on' : ''}`}
          onClick={() => onTabChange('project')}
        >
          项目脚本
        </button>
        <button
          className={`td-chip${tab === 'custom' ? ' td-chip-on' : ''}`}
          onClick={() => onTabChange('custom')}
        >
          自定义 {config.customCommands.length > 0 ? `· ${config.customCommands.length}` : ''}
        </button>
        <input
          className="td-input td-sc-search"
          placeholder="搜索脚本…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {discoveredError && (
          <span className="td-sc-error" title={discoveredError}>
            发现失败
          </span>
        )}
        <button className="td-iconbtn" onClick={onRefresh} title="重新发现项目脚本" aria-label="重新发现项目脚本">
          <Icon name="refresh" size={14} />
        </button>
        <button className="td-iconbtn" onClick={() => setShowImport(true)} title="导入内置终端旧脚本" aria-label="导入内置终端旧脚本">
          <Icon name="download" size={14} />
        </button>
        <button className="td-iconbtn" onClick={() => openEditor()} title="新增自定义命令" aria-label="新增自定义命令">
          <Icon name="plus" size={15} />
        </button>
      </div>

      <div className="td-sc-body">
        {tab === 'project' && !workspacePath && (
          <div className="td-sc-empty">未绑定工作区，无项目脚本可发现。可在「自定义」页添加命令。</div>
        )}
        {tab === 'project' && loading && <div className="td-sc-empty">正在发现项目脚本…</div>}
        {tab === 'project' && !loading && !discoveredError && workspacePath && visible.length === 0 && (
          <div className="td-sc-empty">工作区未声明 package.json scripts，或全部已隐藏。</div>
        )}
        {tab === 'custom' && visible.length === 0 && !editing && (
          <div className="td-sc-empty">暂无自定义命令。点击右上角 + 新增，或从旧内置终端导入。</div>
        )}

        {visible.map((script) => {
          const rt = runtimes[script.id];
          const autoRun = script.custom
            ? script.autoRun
            : config.autoRunRules[script.id]?.enabled;
          return (
            <div
              key={script.id}
              className="td-script"
              onClick={() => guardRun(script)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, script });
              }}
              title="点击运行 · 右键更多操作"
            >
              <span className={`td-status-dot td-status-${rt?.status ?? 'idle'}`} />
              <span className="td-script-name">{script.name}</span>
              <span className="td-script-cmd">{script.command}</span>
              {autoRun && (
                <span className="td-script-badge" title="已启用自动运行">
                  <Icon name="zap" size={11} />
                </span>
              )}
              <span className="td-script-actions" onClick={(e) => e.stopPropagation()}>
                {rt?.status === 'running' && (
                  <button className="td-mini" onClick={() => onStop(script.id)}>
                    停止
                  </button>
                )}
                <button className="td-mini" onClick={() => guardRun(script)}>
                  运行
                </button>
                <button
                  className="td-iconbtn"
                  onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, script })}
                  title="更多操作"
                  aria-label="更多操作"
                >
                  <Icon name="chevron-down" size={13} />
                </button>
              </span>
            </div>
          );
        })}

        {editing && draft && (
          <div className="td-editor">
            <div className="td-editor-grid">
              <label>
                名称
                <input
                  className="td-input"
                  value={draft.name}
                  placeholder="留空则用命令"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                工作目录（可选）
                <input
                  className="td-input"
                  value={draft.cwd}
                  onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                />
              </label>
              <label className="td-editor-wide">
                命令
                <input
                  className="td-input"
                  value={draft.command}
                  placeholder="如 pnpm test"
                  onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                />
              </label>
              <label className="td-editor-wide">
                环境变量（JSON 对象，可选）
                <input
                  className="td-input"
                  value={draft.envText}
                  placeholder='{"NODE_ENV":"test"}'
                  onChange={(e) => setDraft({ ...draft, envText: e.target.value })}
                />
              </label>
            </div>
            <div className="td-editor-options">
              <label className="td-check">
                <input
                  type="checkbox"
                  checked={draft.autoRun}
                  onChange={(e) => setDraft({ ...draft, autoRun: e.target.checked })}
                />
                自动运行
              </label>
              <select
                className="td-input"
                value={draft.autoRunTrigger}
                disabled={!draft.autoRun}
                onChange={(e) => setDraft({ ...draft, autoRunTrigger: e.target.value as AutoRunTrigger })}
              >
                {AUTO_RUN_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'app_start' ? '应用启动' : t === 'workspace_open' ? '打开工作区' : '打开终端'}
                  </option>
                ))}
              </select>
              <label className="td-check">
                <input
                  type="checkbox"
                  checked={draft.confirmBeforeAutoRun}
                  disabled={!draft.autoRun}
                  onChange={(e) => setDraft({ ...draft, confirmBeforeAutoRun: e.target.checked })}
                />
                自动运行前确认
              </label>
              <label className="td-check">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
                启用
              </label>
              <span className="td-sc-spacer" />
              <button className="td-btn" onClick={() => { setEditing(null); setDraft(null); }}>
                取消
              </button>
              <button className="td-btn td-btn-primary" onClick={() => void saveDraft()}>
                保存
              </button>
            </div>
          </div>
        )}

        {tab === 'project' && hiddenIds.length > 0 && (
          <div className="td-hidden">
            <button className="td-mini" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? '收起' : `已隐藏 ${hiddenIds.length} 个 · 管理`}
            </button>
            {showHidden &&
              hiddenIds.map((id) => (
                <button
                  key={id}
                  className="td-mini"
                  title="恢复显示"
                  onClick={() => void actions.setHiddenScriptIds(hiddenIds.filter((x) => x !== id))}
                >
                  {id} · 恢复
                </button>
              ))}
          </div>
        )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.script)} onClose={() => setMenu(null)} />}
      {showImport && <ImportDialog onImport={importLegacy} onCancel={() => setShowImport(false)} />}
    </div>
  );
}
