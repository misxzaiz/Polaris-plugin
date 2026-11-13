'use strict';
/**
 * commands.js —— IM 机器人命令解析（对照主仓 integrations/commands.rs）
 *
 * 语义不变：/ 开头才解析；未知命令作为普通消息处理（返回 null 由 AI 处理）。
 * 引擎别名由调用方注入（宿主 cap.help / 引擎元数据动态获取）。
 */

/**
 * @param {string} content 消息文本
 * @param {{engineAliases: string[]}} ctx 引擎别名表（如 ['claude','claude-code','simple-ai','pi',...]）
 * @returns {object|null} 命令对象或 null（普通消息）
 */
function parseCommand(content, ctx) {
  const trimmed = String(content || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const cmdText = trimmed.slice(1).trim();
  const parts = cmdText.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1);

  if ((ctx.engineAliases || []).includes(cmd)) {
    const restText = rest.join(' ').trim();
    return { kind: 'switch_engine', engine: cmd, customPrompt: restText || null };
  }
  switch (cmd) {
    case 'agent':
    case 'engines':
    case 'engine':
    case '模型':
      return { kind: 'engine_info' };
    case 'stop':
    case 'end':
    case '停止':
      return { kind: 'interrupt' };
    case 'status':
    case '状态':
      return { kind: 'status' };
    case 'path':
    case '路径':
      return rest.length > 0
        ? { kind: 'set_path', path: rest.join(' ') }
        : { kind: 'get_path' };
    case 'workspace':
    case '工作区':
      return { kind: 'workspace' };
    case 'resume':
    case '继续':
    case '恢复':
      return { kind: 'resume' };
    case 'restart':
    case 'rs':
    case '重启':
      return { kind: 'restart' };
    case 'clear':
    case '清除':
      return { kind: 'clear' };
    case 'help':
    case '帮助':
      return { kind: 'help' };
    case 'preset':
    case '预设': {
      const sub = (rest[0] || '').toLowerCase();
      if (!sub || sub === 'list' || sub === '列表') return { kind: 'list_presets' };
      if (sub === 'default' || sub === '默认') return { kind: 'switch_preset', presetId: null };
      return { kind: 'switch_preset', presetId: rest.join(' ') };
    }
    default:
      // 未知命令：按普通消息处理（主仓 BotCommand::Unknown → None 语义）
      return null;
  }
}

function helpText() {
  return [
    '🤖 **可用命令**',
    '',
    '**模型**',
    '• `/claude [提示词]` / `/simple-ai [提示词]` — 切换 AI 引擎（可选追加提示词）',
    '• `/agent` — 查看可用引擎列表',
    '',
    '**会话**',
    '• `/stop` — 中断当前对话',
    '• `/resume` — 恢复最近会话',
    '• `/restart` — 重启会话',
    '• `/clear` — 清除 AI 上下文',
    '• `/status` — 查看当前状态',
    '',
    '**工作区**',
    '• `/path <目录>` — 设置工作目录',
    '• `/path` — 查看当前工作目录',
    '• `/workspace` — 查看工作区详情',
    '',
    '**提示词**',
    '• `/preset list` — 列出可用预设',
    '• `/preset <id>` — 切换预设',
  ].join('\n');
}

module.exports = { parseCommand, helpText };
