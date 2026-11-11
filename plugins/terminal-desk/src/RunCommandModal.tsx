/**
 * 运行命令浮层（Ctrl+Shift+R）：
 * 搜索既有自定义脚本回车运行；输入任意命令 Ctrl/Cmd+Enter 保存为自定义命令并运行。
 * 候选脚本由 Panel 传入（单一数据源），危险命令确认统一交给 Panel 的确认队列。
 */
import { useMemo, useRef, useState } from 'react';
import type { ScriptRow } from './model';
import { Icon } from './icons';

export interface RunCommandModalProps {
  scripts: ScriptRow[];
  workspacePath: string | null;
  onClose: () => void;
  /** 回车：运行命令（写入活跃会话或开新会话，由父层裁决） */
  onRun: (command: string) => Promise<void> | void;
  /** Ctrl/Cmd+Enter：保存为自定义命令并运行 */
  onSaveAndRun: (command: string, name: string) => Promise<void> | void;
}

export default function RunCommandModal({
  scripts,
  workspacePath,
  onClose,
  onRun,
  onSaveAndRun,
}: RunCommandModalProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scripts.slice(-8).reverse();
    return scripts
      .filter((s) => s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q))
      .slice(0, 8);
  }, [scripts, query]);

  const primaryCommand = query.trim();

  return (
    <div
      className="td-modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="td-modal" role="dialog" aria-modal="true" aria-label="运行命令">
        <div className="td-modal-head">
          <Icon name="terminal" size={14} />
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
                if (primaryCommand) void onSaveAndRun(primaryCommand, primaryCommand.slice(0, 40));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (candidates[selected] && !primaryCommand) {
                  void onRun(candidates[selected].command);
                } else if (primaryCommand) {
                  void onRun(primaryCommand);
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
        </div>
        <div className="td-modal-list">
          {candidates.map((script, i) => (
            <div
              key={script.id}
              className={`td-modal-item${i === selected ? ' td-modal-item-on' : ''}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => void onRun(script.command)}
            >
              <Icon name="play" size={12} />
              <span className="td-modal-item-name">{script.name}</span>
              <span className="td-script-cmd">{script.command}</span>
            </div>
          ))}
          {candidates.length === 0 && (
            <div className="td-modal-empty">
              {primaryCommand
                ? '无匹配脚本 — Enter 直接运行该命令'
                : `暂无自定义命令。输入命令后 Enter 运行；Ctrl+Enter 保存。工作区：${workspacePath ?? '未绑定'}`}
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
