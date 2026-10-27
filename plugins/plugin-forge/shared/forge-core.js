'use strict';
/**
 * forge-core.js —— 插件工坊纯函数核心（零依赖，CommonJS）
 *
 * 面板（esbuild bundle）与 MCP server（node 原生 require）共用同一份
 * lint / search / 模板替换逻辑，保证「面板看到的体检结论」与「AI 拿到的」
 * 永远同口径（同 pocket-ledger 的 shared core 模式）。
 *
 * 知识库正文不在这里：元数据在 shared/kb-index.json，正文在 shared/kb/<id>.md。
 * 面板经 esbuild text loader 内联；MCP 经 fs 读取——同一份文件两种加载法。
 */

// ── 平台权威常量（与主仓 src/plugin-system/schema.ts 逐字对齐，2026-10-27 核实）──
const VALID_VIEW_AREAS = ['activityBar'];
const VALID_PLUGIN_ICONS = [
  'Files', 'GitPullRequest', 'CheckSquare', 'Languages', 'Clock', 'Target',
  'ClipboardList', 'Terminal', 'SquareTerminal', 'Code2', 'Bot', 'BookOpen',
  'AlertCircle', 'Film', 'Globe2', 'Activity', 'Users', 'Beaker',
];
const VALID_PERMISSIONS = ['appConfigRead', 'aiToolAccess'];
const ID_RE = /^[a-z][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

// ── manifest 体检 ────────────────────────────────────────────────────────────
/**
 * 对一份 plugin.json（对象或 JSON 字符串）跑全部实测规则。
 * 每条问题给出 rule（机器可读）/ msg / fix（怎么改）。
 * @returns {{ok:boolean, errors:Array, warns:Array, infos:Array, checked:number}}
 */
function lintManifest(input) {
  let m = input;
  if (typeof input === 'string') {
    try {
      m = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [{ rule: 'json.parse', msg: `不是合法 JSON：${e.message}`, fix: '先过 JSON 校验（注意尾逗号与注释）' }], warns: [], infos: [], checked: 1 };
    }
  }
  const errors = [];
  const warns = [];
  const infos = [];
  const err = (rule, msg, fix) => errors.push({ rule, msg, fix });
  const warn = (rule, msg, fix) => warns.push({ rule, msg, fix });
  const info = (rule, msg, fix) => infos.push({ rule, msg, fix });
  let checked = 0;
  const ck = (cond) => { checked += 1; return cond; };

  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return { ok: false, errors: [{ rule: 'manifest.type', msg: '清单必须是 JSON 对象', fix: '顶层应为 {...}' }], warns: [], infos: [], checked: 1 };
  }

  // ① 身份四件套
  if (ck(typeof m.id !== 'string' || !ID_RE.test(m.id || ''))) {
    err('manifest.id', `id 缺失或不合规：${JSON.stringify(m.id ?? null)}`, '小写字母开头，仅小写字母/数字/连字符（kebab-case），如 my-plugin');
  }
  if (ck(!m.name || typeof m.name !== 'string')) err('manifest.name', 'name 缺失', '中文短名（商城展示用），如「网页哨兵」');
  if (ck(!SEMVER_RE.test(String(m.version || '')))) {
    err('manifest.version', `version 缺失或不是 semver：${JSON.stringify(m.version ?? null)}`, '三段式，如 0.1.0');
  }
  if (ck(!m.description || typeof m.description !== 'string' || m.description.trim().length < 20)) {
    warn('manifest.description', 'description 缺失或过短（<20 字）', '商城与 AI 都靠它理解插件；写清「是什么 + 杀手锏 + 数据面」');
  } else if (m.description.length > 2000) {
    warn('manifest.description', `description 过长（${m.description.length} 字）`, '超过 2000 字建议精简，细节移入 README');
  }
  if (ck(typeof m.enabledByDefault !== 'boolean')) {
    info('manifest.enabledByDefault', '未显式声明 enabledByDefault', '显式写 true/false；注意平台是「静态 enabledByDefault + 设置开关」两层门，true 不等于面板一定可见');
  }

  // ② contributes.views
  const views = (m.contributes && Array.isArray(m.contributes.views)) ? m.contributes.views : [];
  if (ck(m.contributes && m.contributes.panel)) {
    // 有面板
    const p = m.contributes.panel || {};
    if (!p.entry || typeof p.entry !== 'string') {
      err('panel.entry', 'contributes.panel.entry 缺失', '应为 "./dist/panel.js"（esbuild 产物）');
    } else if (!p.entry.startsWith('./') || !p.entry.endsWith('.js')) {
      warn('panel.entry', `entry 建议形如 ./dist/panel.js（相对插件根）`, `当前：${p.entry}`);
    }
  }
  for (const v of views) {
    const at = `views[${views.indexOf(v)}]`;
    if (ck(!VALID_VIEW_AREAS.includes(v.area))) {
      err('view.area', `${at}.area=${JSON.stringify(v.area ?? null)} 不在白名单`, `当前平台仅支持 ${VALID_VIEW_AREAS.join('/')}`);
    }
    if (ck(!VALID_PLUGIN_ICONS.includes(v.icon))) {
      err('view.icon', `${at}.icon=${JSON.stringify(v.icon ?? null)} 不在图标白名单（会被拒）`, `可用 18 值：${VALID_PLUGIN_ICONS.join(', ')}`);
    }
    if (ck(!v.panelType)) err('view.panelType', `${at}.panelType 缺失`, '面板类型标识，宿主用它路由；建议 <idCamel> 形式');
    if (ck(!v.labelKey || !v.labelDefault)) {
      warn('view.label', `${at} 缺 labelKey/labelDefault`, 'labelKey 形如 plugins.<camel>，labelDefault 为中文默认名');
    }
    if (ck(typeof v.order !== 'number')) {
      info('view.order', `${at}.order 非数字`, 'ActivityBar 排序；现有插件已占 15/20/40/50/68/72/73/74/75/80/85/90，取不冲突值');
    }
  }
  if (m.contributes && m.contributes.panel && views.length === 0) {
    err('view.missing', '有 panel 入口但没有任何 view 挂到 activityBar', 'contributes.views 至少一条，icon 必须在白名单');
  }

  // ③ services（type=http 健康检查语义来自 PluginServiceManager 实测）
  const services = (m.contributes && Array.isArray(m.contributes.services)) ? m.contributes.services : [];
  for (const s of services) {
    const at = `services[${services.indexOf(s)}]`;
    if (ck(!s.id)) err('service.id', `${at}.id 缺失`, '服务 id，start/stop 时要用');
    if (ck(!['http', 'std', 'worker'].includes(s.type))) {
      warn('service.type', `${at}.type=${JSON.stringify(s.type ?? null)} 非 http/std/worker`, 'http 型有健康检查语义；std/worker 只看进程退出');
    }
    if (ck(!s.command)) err('service.command', `${at}.command 缺失`, '一般为 "node"');
    if (ck(!Array.isArray(s.argsTemplate))) {
      err('service.argsTemplate', `${at}.argsTemplate 缺失或不是数组`, `如 ["{{pluginDir}}/service/main.js", "{{port}}", "{{appConfigDir}}"]`);
    } else {
      if (s.type === 'http') {
        if (!s.argsTemplate.some((a) => String(a).includes('{{port}}'))) {
          warn('service.port', `${at}.argsTemplate 未含 {{port}}`, 'http 型服务需要端口起健康端点');
        }
        if (!s.healthCheck) {
          warn('service.healthCheck', `${at} 未配 healthCheck`, 'http 型默认按任意 2xx 判活（3s 超时/30s 周期/3 次判死），建议显式配 "/__health"');
        }
        if (s.healthCheckTimeout && Number(s.healthCheckTimeout) > 10000) {
          warn('service.healthCheckTimeout', `${at}.healthCheckTimeout=${s.healthCheckTimeout} 偏大`, '健康检查超时建议 ≤10s；判死周期=30s×3 次');
        }
      }
      if (!s.argsTemplate.some((a) => String(a).includes('{{appConfigDir}}'))) {
        info('service.appConfigDir', `${at}.argsTemplate 未含 {{appConfigDir}}`, '日志落盘/自发现桥都需要它（kvclient 以此兜底 config.json）');
      }
      if (!s.argsTemplate.some((a) => String(a).includes('{{pluginDir}}'))) {
        warn('service.pluginDir', `${at}.argsTemplate 未用 {{pluginDir}} 引用自身文件`, '安装目录不可硬编码，用 {{pluginDir}} 占位');
      }
    }
    if (s.autoStart === false && s.restartOnFailure !== false) {
      info('service.autostart', `${at} autoStart=false 且 restartOnFailure 开启`, '确认这是有意的组合（不自启但崩溃拉起）');
    }
  }

  // ④ mcpServers
  const mcps = (m.contributes && Array.isArray(m.contributes.mcpServers)) ? m.contributes.mcpServers : [];
  for (const s of mcps) {
    const at = `mcpServers[${mcps.indexOf(s)}]`;
    if (ck(s.transport !== 'stdio')) {
      warn('mcp.transport', `${at}.transport=${JSON.stringify(s.transport ?? null)}`, '现平台以 stdio 为准');
    }
    if (ck(!Array.isArray(s.argsTemplate) || !s.argsTemplate.some((a) => String(a).includes('{{pluginDir}}')))) {
      err('mcp.args', `${at}.argsTemplate 缺失或未用 {{pluginDir}}`, `如 ["{{pluginDir}}/mcp/server.js", "{{appConfigDir}}"]`);
    }
    if (ck(Array.isArray(s.argsTemplate) && !s.argsTemplate.some((a) => String(a).includes('{{appConfigDir}}')))) {
      info('mcp.appConfigDir', `${at} 未传 {{appConfigDir}} 给 MCP 进程`, 'MCP server 也要自发现桥（日志兜底/anchor 定位），建议传入');
    }
  }
  if (ck(!Array.isArray(m.contributes && m.contributes.mcpServers))) {
    info('mcp.none', '未声明 mcpServers', '无 AI 工具的纯面板插件可以没有；有 MCP 则 AI 能直接操作插件');
  }

  // ⑤ permissions
  if (m.permissions && typeof m.permissions === 'object') {
    for (const k of Object.keys(m.permissions)) {
      if (ck(!VALID_PERMISSIONS.includes(k))) {
        warn('permissions.unknown', `permissions.${k} 不在已知集合`, `已知：${VALID_PERMISSIONS.join(', ')}（未知键会被忽略，别指望它生效）`);
      }
    }
  } else {
    info('permissions.none', '未声明 permissions', '需要 AI 工具（MCP）时须 aiToolAccess:true；要读 appConfigDir 时须 appConfigRead:true');
  }
  if (mcps.length > 0 && !(m.permissions && m.permissions.aiToolAccess)) {
    warn('mcp.permission', '声明了 mcpServers 但 permissions.aiToolAccess ≠ true', '补 "permissions": { "aiToolAccess": true }，否则 AI 侧可能不可用');
  }

  // ⑥ origin / 发布 URL（publish 三坑之一：@tag 钉定会 404）
  const o = m.origin || {};
  for (const k of ['updateUrl', 'downloadUrl', 'manifestUrl']) {
    const u = o[k] || (k === 'manifestUrl' ? null : null);
    if (u && /@[a-zA-Z0-9._-]+v?\d/i.test(String(u)) && !/@main/.test(String(u))) {
      warn('origin.taggedUrl', `origin.${k} 疑似 @tag 钉定：${u}`, '未推 tag 的仓库该 URL 会 404；publish 脚本可能改写，落 @main 并重算 zip sha256');
    }
  }
  if (ck(!o.repository)) info('origin.repository', '未声明 origin.repository', '商城来源信息');

  // ⑦ 键空间前缀提示（无法从清单直接判定，给纪律提醒）
  info('keyspace', '确认数据面键空间以 <id 去连字符>. 或自定短前缀 + "." 开头', 'cap.kv list 返回全局所有键（跨插件共享空间），无前缀 = 污染他人 + 被他人污染');

  return { ok: errors.length === 0, errors, warns, infos, checked };
}

// ── 知识搜索 ─────────────────────────────────────────────────────────────────
/**
 * 对主题做朴素打分搜索（子串命中，title×4 / tags×3 / summary×2 / body×1）。
 * query 支持空格分词，多词取和。CJK 无需分词——子串即可。
 * @param {Array<{id:string,title:string,summary:string,tags:string[]}>} metas
 * @param {Record<string,string>} bodies  id → 正文
 * @param {string} query
 * @returns {Array<{id:number, meta:object, score:number}>} 按分降序，score>0 才返回
 */
function searchTopics(metas, bodies, query) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const meta of metas) {
    const title = String(meta.title || '').toLowerCase();
    const summary = String(meta.summary || '').toLowerCase();
    const tags = (meta.tags || []).join(' ').toLowerCase();
    const body = String(bodies[meta.id] || '').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (!t) continue;
      score += countOcc(title, t) * 4;
      score += countOcc(tags, t) * 3;
      score += countOcc(summary, t) * 2;
      score += countOcc(body, t) * 1;
    }
    if (score > 0) out.push({ meta, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
function countOcc(hay, needle) {
  if (!hay || !needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n += 1; i += needle.length; }
  return n;
}

/** 搜索结果摘要：定位命中行，前后各留 ~60 字 */
function snippetFor(body, query, maxLen = 200) {
  const lower = String(body || '').toLowerCase();
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  let idx = -1;
  for (const t of terms) { const i = lower.indexOf(t); if (i !== -1) { idx = i; break; } }
  if (idx === -1) return String(body || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  const start = Math.max(0, idx - 60);
  const raw = String(body).slice(start, start + maxLen).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + raw + (start + maxLen < String(body).length ? '…' : '');
}

// ── 脚手架模板 ───────────────────────────────────────────────────────────────
/** 模板占位符替换（{{TOKEN}} 形式；未提供的 token 原样保留并报警） */
function applyTemplate(tpl, vars) {
  const missing = new Set();
  const out = String(tpl).replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (Object.prototype.hasOwnProperty.call(vars, k)) return String(vars[k]);
    missing.add(k);
    return `{{${k}}}`;
  });
  return { text: out, missing: [...missing] };
}

/**
 * 生成脚手架文件集。
 * @param {Record<string,string>} templates  相对路径 → 模板正文
 * @param {{id:string, name:string, prefix:string, icon:string, order:number,
 *          withService:boolean, withMcp:boolean, panelType:string, labelKey:string}} spec
 * @returns {{files:Array<{path:string, content:string}>, warnings:string[]}}
 */
function buildScaffold(templates, spec) {
  const id = spec.id || 'my-plugin';
  const camel = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
  const prefix = spec.prefix || camel;
  const vars = {
    PLUGIN_ID: id,
    PLUGIN_ID_NODASH: id.replace(/-/g, '_'),
    PLUGIN_NAME: spec.name || id,
    PREFIX: prefix,
    PREFIX_UPPER: prefix.replace(/-/g, '_').toUpperCase(),
    PREFIX_DOT: prefix + '.',
    PANEL_TYPE: spec.panelType || camel,
    LABEL_KEY: spec.labelKey || `plugins.${camel}`,
    ICON: spec.icon || 'Beaker',
    ORDER: String(spec.order ?? 80),
    VERSION: '0.1.0',
    // react import 走占位符：模板正文经 --loader:.txt=text 原样内联进面板 bundle，
    // 裸的 react import 字面量会被宿主加载器的 import 重写正则误命中（它不识别
    // 字符串边界），注入的 blob URL 会破坏 bundle 语法（Unexpected identifier 'blob'）。
    // 占位符在生成期替换，bundle 里不存在可被命中的字节。
    REACT_SPEC: "'react'",
  };
  const warnings = [];
  const files = [];
  const skip = new Set();
  if (!spec.withService) {
    for (const p of Object.keys(templates)) if (p.startsWith('service_')) skip.add(p);
  }
  if (!spec.withMcp) {
    for (const p of Object.keys(templates)) if (p.startsWith('mcp_')) skip.add(p);
  }
  for (const [rel, tpl] of Object.entries(templates)) {
    if (skip.has(rel)) continue;
    const { text, missing } = applyTemplate(tpl, vars);
    if (missing.length) warnings.push(`${rel}: 未提供占位符 ${missing.join(', ')}`);
    files.push({ path: rel, content: text });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, warnings };
}

/** 生成 plugin.json（脚手架用；与 lintManifest 规则自洽） */
function buildManifest(spec) {
  const m = {
    id: spec.id,
    name: spec.name,
    version: '0.1.0',
    description: spec.description || `${spec.name}：用 node scripts/pack.js 打包前请补全本描述（≥20 字，说清是什么/杀手锏/数据面）。`,
    enabledByDefault: false,
    contributes: {
      views: [{
        id: `${spec.id}.panel`,
        area: 'activityBar',
        panelType: spec.panelType,
        icon: spec.icon,
        labelKey: spec.labelKey,
        labelDefault: spec.name,
        order: spec.order ?? 80,
      }],
      panel: { entry: './dist/panel.js', supportsFullscreen: true },
    },
    permissions: { appConfigRead: true, aiToolAccess: true },
  };
  if (spec.withService) {
    m.contributes.services = [{
      id: `${spec.id}-service`,
      type: 'http',
      command: 'node',
      argsTemplate: ['{{pluginDir}}/service/main.js', '{{port}}', '{{appConfigDir}}'],
      healthCheck: '/__health',
      healthCheckTimeout: 5000,
      autoStart: true,
      restartOnFailure: true,
      maxRestarts: 10,
      description: '后台服务（原生 fetch，无跨域限制）',
    }];
  }
  if (spec.withMcp) {
    m.contributes.mcpServers = [{
      id: spec.id,
      transport: 'stdio',
      command: 'node',
      argsTemplate: ['{{pluginDir}}/mcp/server.js', '{{appConfigDir}}'],
    }];
  }
  return m;
}

module.exports = {
  VALID_PLUGIN_ICONS,
  VALID_VIEW_AREAS,
  VALID_PERMISSIONS,
  lintManifest,
  searchTopics,
  snippetFor,
  countOcc,
  applyTemplate,
  buildScaffold,
  buildManifest,
};
