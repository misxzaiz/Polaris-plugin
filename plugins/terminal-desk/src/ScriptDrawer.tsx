/**
 * terminal-desk 脚本抽屉：项目脚本发现（cap.terminal discover_scripts）+ 自定义命令
 * （plugin_set_config 持久化）+ 危险命令确认 + 运行/停止（对齐内置脚本面板语义）
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  capTerminal,
  currentWorkspacePath,
  onWorkspaceChanged,
  readPluginConfig,
  writePluginConfig,
} from './bridge';
import {
  confirmMessageFor,
  isCustomScript,
  makeCustomCommand,
  parseCustomCommands,
  setRuntime,
  type CustomCommand,
  type DiscoveredScript,
  type ScriptRuntime,
} from './model';

export interface ScriptDrawerProps {
  runtimes: Record<string, ScriptRuntime>;
  onRun: (script: { id: string; name: string; command: string; cwd?: string; env?: Record<string, string> }) => Promise<unknown>;
  onStop: (scriptId: string) => Promise<void>;
}

/** 保存自定义命令（模块级导出：RunCommandModal 的「保存并运行」复用） */
export async function saveCustomCommand(
  name: string,
  command: string,
  cwd?: string,
): Promise<CustomCommand> {
  const config = await readPluginConfig();
  const list = parseCustomCommands(config);
  const next = makeCustomCommand(name, command, cwd);
  await writePluginConfig({ customCommands: [...list, next] });
  return next;
}

export default function ScriptDrawer({ runtimes, onRun, onStop }: ScriptDrawerProps) {
  const [tab, setTab] = useState<'project' | 'custom'>('project');
  const [discovered, setDiscovered] = useState<DiscoveredScript[]>([]);
  const [discoveredError, setDiscoveredError] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomCommand[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshDiscovered = useCallback(async () => {
    const ws = currentWorkspacePath();
    if (!ws) {
      setDiscovered([]);
      setDiscoveredError(null);
      return;
    }
    setLoading(true);
    try {
      const res = await capTerminal<{ scripts?: DiscoveredScript[] }>({
        action: 'discover_scripts',
        workspacePath: ws,
      });
      setDiscovered(res.scripts ?? []);
      setDiscoveredError(null);
    } catch (e) {
      setDiscoveredError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCustom = useCallback(async () => {
    const config = await readPluginConfig();
    setCustom(parseCustomCommands(config));
  }, []);

  useEffect(() => {
    void refreshDiscovered();
    void refreshCustom();
    return onWorkspaceChanged(() => {
      void refreshDiscovered();
    });
  }, [refreshDiscovered, refreshCustom]);

  const filteredDiscovered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return discovered;
    return discovered.filter(
      (s) => s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q),
    );
  }, [discovered, search]);

  const filteredCustom = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return custom;
    return custom.filter(
      (s) => s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q),
    );
  }, [custom, search]);

  function guardAndRun(script: { id: string; name: string; command: string; cwd?: string; env?: Record<string, string> }) {
    const confirmMsg = confirmMessageFor(script.command);
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    void onRun(script).catch(() => {
      /* 错误横幅由父层 createSession 统一处理 */
    });
  }

  async function deleteCustom(id: string) {
    const next = custom.filter((c) => c.id !== id);
    setCustom(next);
    await writePluginConfig({ customCommands: next });
  }

  const rows: Array<{ id: string; name: string; command: string; cwd?: string; env?: Record<string, string>; custom: boolean }> = [
    ...filteredDiscovered.map((s) => ({ id: s.id, name: s.name, command: s.command, cwd: s.cwd, env: undefined, custom: false })),
    ...(tab === 'custom'
      ? filteredCustom.map((s) => ({ id: s.id, name: s.name, command: s.command, cwd: s.cwd, env: s.env, custom: true }))
      : []),
  ];

  return (
    <div className="td-drawer">
      <div className="td-drawer-head">
        <button className={`td-chip${tab === 'project' ? ' td-chip-on' : ''}`} onClick={() => setTab('project')}>
          项目脚本
        </button>
        <button className={`td-chip${tab === 'custom' ? ' td-chip-on' : ''}`} onClick={() => setTab('custom')}>
          自定义
        </button>
        <input
          className="td-input"
          placeholder="搜索脚本…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 160, marginLeft: 8 }}
        />
        <span style={{ flex: 1 }} />
        {discoveredError && (
          <span style={{ fontSize: 11, color: 'rgb(var(--c-danger, #f87171))' }} title={discoveredError}>
            发现失败
          </span>
        )}
        <button className="td-mini" onClick={() => void refreshDiscovered()} title="重新发现项目脚本">
          {loading ? '…' : '刷新'}
        </button>
      </div>
      <div className="td-drawer-body">
        {tab === 'project' && !currentWorkspacePath() && (
          <div style={{ fontSize: 12, color: 'rgb(var(--c-text-secondary))', padding: '8px 4px' }}>
            未绑定工作区，无项目脚本可发现。可在「自定义」页添加命令。
          </div>
        )}
        {rows.map((script) => {
          const rt = runtimes[script.id];
          return (
            <div key={script.id} className="td-script" onClick={() => guardAndRun(script)} title="点击运行">
              {rt && <span className={`td-status-dot td-status-${rt.status}`} />}
              <span className="td-script-name">{script.name}</span>
              <span className="td-script-cmd">{script.command}</span>
              <span className="td-script-actions" onClick={(e) => e.stopPropagation()}>
                {rt?.status === 'running' && rt.terminalSessionId && (
                  <button className="td-mini" onClick={() => void onStop(script.id)}>
                    停止
                  </button>
                )}
                <button className="td-mini" onClick={() => guardAndRun(script)}>
                  运行
                </button>
                {script.custom && (
                  <button className="td-mini" onClick={() => void deleteCustom(script.id)}>
                    删除
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {tab === 'project' && filteredDiscovered.length === 0 && currentWorkspacePath() && !loading && !discoveredError && (
          <div style={{ fontSize: 12, color: 'rgb(var(--c-text-secondary))', padding: '8px 4px' }}>
            工作区 package.json 未声明 scripts。
          </div>
        )}
        {tab === 'custom' && (
          <AddCustomRow onAdd={async (name, command) => {
            const next = makeCustomCommand(name, command, currentWorkspacePath() ?? undefined);
            await writePluginConfig({ customCommands: [...custom, next] });
            setCustom([...custom, next]);
          }} />
        )}
      </div>
    </div>
  );
}

function AddCustomRow({ onAdd }: { onAdd: (name: string, command: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const canSave = command.trim().length > 0;
  return (
    <div style={{ display: 'flex', gap: 6, padding: '8px 2px', alignItems: 'center' }}>
      <input
        className="td-input"
        placeholder="名称（可选）"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: 120 }}
      />
      <input
        className="td-input"
        placeholder="命令，如 pnpm test"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) {
            void onAdd(name, command);
            setName('');
            setCommand('');
          }
        }}
        style={{ flex: 1 }}
      />
      <button
        className="td-mini"
        disabled={!canSave}
        onClick={() => {
          void onAdd(name, command);
          setName('');
          setCommand('');
        }}
      >
        添加
      </button>
    </div>
  );
}
