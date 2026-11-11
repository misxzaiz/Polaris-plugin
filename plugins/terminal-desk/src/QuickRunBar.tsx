/**
 * 快速运行条（v4 视觉基线：36px 常驻，复刻内置 TerminalQuickRunBar）。
 * 展示「运行中优先 / 否则最近运行」的脚本，提供运行、停止、折叠脚本中心、命令浮层。
 */
import { Icon } from './icons';
import type { ScriptRow, ScriptRuntime } from './model';

export interface QuickRunBarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  script: ScriptRow | null;
  runtime?: ScriptRuntime;
  onRun: () => void;
  onStop: () => void;
  onOpenRunner: () => void;
}

function statusLabel(status?: ScriptRuntime['status']): { text: string; tone: string } {
  switch (status) {
    case 'running':
      return { text: '运行中', tone: 'running' };
    case 'success':
      return { text: '成功', tone: 'success' };
    case 'failed':
      return { text: '失败', tone: 'failed' };
    case 'stopped':
      return { text: '已停止', tone: 'idle' };
    default:
      return { text: '未运行', tone: 'idle' };
  }
}

export default function QuickRunBar({
  collapsed,
  onToggleCollapsed,
  script,
  runtime,
  onRun,
  onStop,
  onOpenRunner,
}: QuickRunBarProps) {
  const isRunning = runtime?.status === 'running';
  const status = statusLabel(runtime?.status);
  return (
    <div className="td-quickbar">
      <button
        className="td-qb-btn"
        onClick={onToggleCollapsed}
        title={collapsed ? '展开脚本中心' : '折叠脚本中心'}
        aria-label={collapsed ? '展开脚本中心' : '折叠脚本中心'}
      >
        <Icon name={collapsed ? 'chevron-down' : 'chevron-up'} size={15} />
      </button>
      <div className="td-qb-info" title={script ? `${script.name} · ${script.command}` : '无可运行脚本'}>
        <div className="td-qb-name">{script ? script.name : '无可运行脚本'}</div>
        <div className="td-qb-cmd">
          {script ? script.command : '按 Ctrl+Shift+R 输入临时命令'}
        </div>
      </div>
      <span className={`td-qb-status td-qb-${status.tone}`}>{status.text}</span>
      <button className="td-qb-action td-qb-optional" disabled={!script || isRunning} onClick={onRun} title="运行最近脚本">
        <Icon name="play" size={12} /> <span className="td-qb-label">运行</span>
      </button>
      <button className="td-qb-action td-qb-optional" disabled={!isRunning} onClick={onStop} title="停止脚本（关闭其终端会话）">
        <Icon name="square" size={11} /> <span className="td-qb-label">停止</span>
      </button>
      <button className="td-qb-action" onClick={onOpenRunner} title="快速运行 Ctrl+Shift+R">
        <Icon name="search" size={13} /> <span className="td-qb-label">快速运行</span>
      </button>
    </div>
  );
}
