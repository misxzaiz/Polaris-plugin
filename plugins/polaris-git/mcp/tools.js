/**
 * tools.js —— polaris-git AI 工具层（注入式，可离线单测；零 npm 依赖）
 *
 * 工具面从 service/actions.js 的 KNOWN_ACTIONS 自动派生，不在本文件手写动作清单，
 * 以呼应主仓 bus_mcp_server.rs「动作协议从 describe 派生、不手写、避免幽灵动作漂移」
 * 的纪律：
 *   - 每个 action 暴露为一个工具，名称 = git_<action>（即主仓原命令名，
 *     git_capability.rs 文档明确 action 为「去 git_ 前缀」所得，故加回前缀即原名）。
 *   - 另提供 git_dispatch 通用转发工具，对齐主仓 bus_dispatch 转发
 *     target=cap.git、payload={action,...} 的语义。
 *
 * 工具实现经 HTTP 调本插件 service 的 POST /dispatch。端口从「参数 / 环境变量 /
 * <appConfigDir>/polaris-git-service.port 文件」发现，且惰性解析（服务与 MCP 启动
 * 顺序不固定，首个 tools/call 时才需要端口），解析成功后缓存。
 *
 * 本插件 package.json 为 "type": "module"，故使用 ESM。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  KNOWN_ACTIONS,
  ACTION_LABELS,
} from '../service/actions.js';

const PORT_FILE_NAME = 'polaris-git-service.port';

// ── MCP 结果形状（与 ai-scheduler/mcp/tools.js 完全一致）──────────────────
export function textResult(text, isError) {
  return { content: [{ type: 'text', text }], isError: !!isError };
}
function structured(structuredContent, text) {
  return {
    content: [{ type: 'text', text: text || JSON.stringify(structuredContent) }],
    structuredContent,
    isError: false,
  };
}

function positiveInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 把 service 返回的 { ok, data|error } 信封转成 MCP tools/call 结果。
 * 成功：content + 可选 structuredContent（仅当 data 为对象/数组时）+ isError:false。
 * 失败（含结构化 PR_CLI_UNAVAILABLE）：isError:true，错误原文进 content，不伪造数据。
 */
function envelopeToResult(env) {
  if (!env || typeof env !== 'object') return textResult('service 返回了无法识别的响应', true);
  if (env.ok !== true) {
    // R1：service 的结构化错误（如 PR_CLI_UNAVAILABLE）把 code / 安装提示一并透传，
    // 让 AI 调用方能直接看到可执行的补救信息，而非只剩一句错误文本。
    const lines = [String(env.error || 'service 返回失败')];
    if (env.code) lines.push(`code=${env.code}`);
    if (env.requiredCli) lines.push(`requiredCli=${env.requiredCli}`);
    if (env.installHint) lines.push(`installHint=${env.installHint}`);
    return textResult(lines.join('\n'), true);
  }
  const text = JSON.stringify(env.data);
  if (env.data !== null && typeof env.data === 'object') {
    return structured(env.data, text);
  }
  // data 为字符串 / null / undefined：MCP structuredContent 要求对象，故只回 text。
  return textResult(text, false);
}

/**
 * 构造绑定了 service 端口的 HTTP 转发器：async (action, params) => MCP result。
 * 端口发现优先级：显式参数 / 环境变量 > <appConfigDir>/polaris-git-service.port > 报错。
 *   argv[0] = appConfigDir（与 ai-scheduler MCP 的启动参数一致）
 *   argv[1] = 可选显式端口
 *   env.POLARIS_GIT_APP_CONFIG_DIR / POLARIS_GIT_PORT / POLARIS_GIT_SERVICE_PORT
 */
export function createHttpDispatcher(argv = process.argv.slice(2), env = process.env) {
  const appConfigDir = env.POLARIS_GIT_APP_CONFIG_DIR || argv[0] || '';
  const fixedPort = positiveInt(argv[1])
    || positiveInt(env.POLARIS_GIT_PORT)
    || positiveInt(env.POLARIS_GIT_SERVICE_PORT)
    || null;
  let cached = fixedPort;

  function getPort() {
    if (cached) return cached;
    if (appConfigDir) {
      try {
        const p = positiveInt(fs.readFileSync(path.join(appConfigDir, PORT_FILE_NAME), 'utf8').trim());
        if (p) { cached = p; return cached; }
      } catch (_) { /* 文件暂未就绪，稍后再试 */ }
    }
    throw new Error(
      '无法发现 polaris-git service 端口：请通过启动参数 <appConfigDir> <port>、'
      + '环境变量 POLARIS_GIT_PORT / POLARIS_GIT_SERVICE_PORT，'
      + `或 <appConfigDir>/${PORT_FILE_NAME} 文件提供`,
    );
  }

  return async function httpDispatch(action, params) {
    const port = getPort(); // 惰性：首个调用时才真正需要端口
    let res;
    try {
      res = await fetch(`http://127.0.0.1:${port}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params: params || {} }),
      });
    } catch (e) {
      throw new Error(`调用 polaris-git service (127.0.0.1:${port}) 失败：${e.message}`);
    }
    let env;
    try { env = await res.json(); } catch (_) {
      throw new Error(`polaris-git service 返回非 JSON 响应（HTTP ${res.status}）`);
    }
    return envelopeToResult(env);
  };
}

/** 归一化可能的 git_ 前缀，让 git_dispatch 也接受带前缀的 action 名。 */
function stripPrefix(action) {
  return String(action || '').replace(/^git_/, '');
}

/**
 * @param dispatch async (action, params) => MCP result（由 createHttpDispatcher 注入）
 * @returns 工具对象数组 { name, description, inputSchema, call }
 */
export function buildTools(dispatch) {
  const tools = KNOWN_ACTIONS.map((action) => {
    const label = ACTION_LABELS[action] || action;
    return {
      name: `git_${action}`,
      description: `${label}（cap.git action: ${action}）。参数按 cap.git 契约以 camelCase 原样透传，绝大多数动作需 workspacePath（工作区绝对路径）。`,
      inputSchema: {
        type: 'object',
        properties: {
          workspacePath: { type: 'string', description: '工作区绝对路径（必须存在且为目录），绝大多数动作必填' },
        },
        additionalProperties: true, // 各 action 参数各异，透传不逐个枚举，避免协议漂移
      },
      async call(args) {
        return dispatch(action, args || {});
      },
    };
  });

  // 通用转发：对齐主仓 bus_dispatch → target=cap.git、payload={action,...} 语义。
  tools.push({
    name: 'git_dispatch',
    description: '通用 cap.git 动作转发（对齐主仓 bus_dispatch target=cap.git）：直接给出 action 与 params，可调用全部 77 个 action。适合调用未单独暴露或需要动态拼装的动作。',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', description: 'cap.git 动作名（去 git_ 前缀），如 get_status；带 git_ 前缀亦可' },
        params: { type: 'object', description: '动作参数对象（camelCase 原样透传，通常含 workspacePath）' },
      },
      additionalProperties: false,
    },
    async call(args) {
      return dispatch(stripPrefix(args.action), args.params || {});
    },
  });

  return tools;
}
