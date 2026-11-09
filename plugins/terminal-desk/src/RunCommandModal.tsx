/**
 * terminal-desk 运行命令浮层（Ctrl+Shift+R）：
 * 搜索既有脚本回车运行；输入任意命令 Ctrl/Cmd+Enter 保存为自定义命令并运行。
 * 对齐内置 TerminalRunCommandModal 交互。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { currentWorkspacePath } from './bridge';
import { confirmMessageFor, parseCustomCommands, type CustomCommand } from './model';
import { readPluginConfig } from './bridge';

export interface RunCommandModalProps {
  onClose: () => void;
  /** 回车：运行命令（写入活跃会话或开新会话，由父层裁决） */
  onRun: (command: string) => Promise<void> | void;
  /** Ctrl/Cmd+Enter：保存为自定义命令并运行 */
  onSaveAndRun: (command: string, name: string) => Promise<void> | void;
}

export default function RunCommandModal({ onClose, onRun, onSaveAndRun }: RunCommandModalProps) {
  const [query, setQuery] = useState('');
  const [scripts, setScripts] = useState<CustomCommand[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void readPluginConfig().then((config) => setScripts(parseCustomCommands(config)));
  }, []);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scripts.slice(-8).reverse();
    return scripts
      .filter((s) => s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q))
      .slice(0, 8);
  }, [scripts, query]);

  const primaryCommand = query.trim();

  async function runCommand(command: string) {
    if (!command) return;
    const confirmMsg = confirmMessageFor(command);
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    await onRun(command);
  }

  return (
    <div
      className="td-modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="td-modal">
        <input
          ref={inputRef}
          autoFocus
          className="td-modal-input"
          placeholder="运行命令（Enter 运行 / Ctrl+Enter 保存为自定义并运行 / Esc 关闭）"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (primaryCommand) {
                void onSaveAndRun(primaryCommand, primaryCommand.slice(0, 40));
              }
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (candidates[selected] && !primaryCommand) {
                void runCommand(candidates[selected].command);
              } else if (primaryCommand) {
                void runCommand(primaryCommand);
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelected((i) => Math.min(i + 1, Math.max(candidates.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected((i) => Math.max(i - 1, 0));
            }
          }}
        />
        <div className="td-modal-list">
          {candidates.map((script, i) => (
            <div
              key={script.id}
              className={`td-modal-item${i === selected ? ' td-modal-item-on' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => void runCommand(script.command)}
            >
              <span style={{ fontWeight: 600, flex: 'none' }}>{script.name}</span>
              <span className="td-script-cmd">{script.command}</span>
            </div>
          ))}
          {candidates.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'rgb(var(--c-text-secondary))' }}>
              {primaryCommand
                ? '无匹配脚本 — Enter 直接运行该命令'
                : `暂无自定义命令。输入命令后 Enter 运行；Ctrl+Enter 保存。工作区：${currentWorkspacePath() ?? '未绑定'}`}
            </div>
          )}
        </div>
        <div className="td-modal-hint">
          <span>Enter 运行</span>
          <span>Ctrl+Enter 保存并运行</span>
          <span>↑↓ 选择</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
