/**
 * 离线单测（node test/run-tests.mjs）—— forge-core 纯函数直测 + 脚手架自洽。
 * 零依赖零 mock；真实桥冒烟见 smoke-real.mjs。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const forgeCore = require(path.join(ROOT, 'shared', 'forge-core.js'));

const results = [];
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── lintManifest：合法清单 ───────────────────────────────────────────────────
const GOOD_MANIFEST = {
  id: 'my-plugin',
  name: '我的插件',
  version: '0.1.0',
  description: '这是一个足够长的描述文本，用来满足最少二十个字符的门槛要求。',
  enabledByDefault: true,
  contributes: {
    views: [{ id: 'my-plugin.panel', area: 'activityBar', panelType: 'myPlugin', icon: 'Beaker', labelKey: 'plugins.myPlugin', labelDefault: '我的插件', order: 80 }],
    panel: { entry: './dist/panel.js', supportsFullscreen: true },
    services: [{
      id: 'my-plugin-service', type: 'http', command: 'node',
      argsTemplate: ['{{pluginDir}}/service/main.js', '{{port}}', '{{appConfigDir}}'],
      healthCheck: '/__health', healthCheckTimeout: 5000,
      autoStart: true, restartOnFailure: true, maxRestarts: 10, description: '后台服务',
    }],
    mcpServers: [{ id: 'my-plugin', transport: 'stdio', command: 'node', argsTemplate: ['{{pluginDir}}/mcp/server.js', '{{appConfigDir}}'] }],
  },
  permissions: { appConfigRead: true, aiToolAccess: true },
};

t('lint: 合法清单 0 错误', () => {
  const r = forgeCore.lintManifest(GOOD_MANIFEST);
  assert.strictEqual(r.ok, true, `errors: ${JSON.stringify(r.errors)}`);
});
t('lint: JSON 字符串输入等价', () => {
  const r = forgeCore.lintManifest(JSON.stringify(GOOD_MANIFEST));
  assert.strictEqual(r.ok, true);
});
t('lint: 非法 JSON 给出 parse 错误', () => {
  const r = forgeCore.lintManifest('{ id: nope }');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors[0].rule, 'json.parse');
});
t('lint: 非白名单图标报错', () => {
  const m = JSON.parse(JSON.stringify(GOOD_MANIFEST));
  m.contributes.views[0].icon = 'FileText';
  const r = forgeCore.lintManifest(m);
  assert.ok(r.errors.some((e) => e.rule === 'view.icon'), JSON.stringify(r.errors));
});
t('lint: 图标白名单 18 值全部合法', () => {
  for (const icon of forgeCore.VALID_PLUGIN_ICONS) {
    const m = JSON.parse(JSON.stringify(GOOD_MANIFEST));
    m.contributes.views[0].icon = icon;
    const r = forgeCore.lintManifest(m);
    assert.ok(!r.errors.some((e) => e.rule === 'view.icon'), `${icon} 不该报错`);
  }
});
t('lint: 坏 id / 坏 version 报错', () => {
  const m = { ...GOOD_MANIFEST, id: 'Bad_ID', version: 'v1' };
  const r = forgeCore.lintManifest(m);
  assert.ok(r.errors.some((e) => e.rule === 'manifest.id'));
  assert.ok(r.errors.some((e) => e.rule === 'manifest.version'));
});
t('lint: 面板入口但无 view 报错', () => {
  const m = JSON.parse(JSON.stringify(GOOD_MANIFEST));
  delete m.contributes.views;
  const r = forgeCore.lintManifest(m);
  assert.ok(r.errors.some((e) => e.rule === 'view.missing'));
});
t('lint: MCP 声明缺 aiToolAccess 警告', () => {
  const m = JSON.parse(JSON.stringify(GOOD_MANIFEST));
  m.permissions = { appConfigRead: true };
  const r = forgeCore.lintManifest(m);
  assert.ok(r.warns.some((w) => w.rule === 'mcp.permission'));
});
t('lint: @tag 发布 URL 警告（publish 实坑）', () => {
  const m = JSON.parse(JSON.stringify(GOOD_MANIFEST));
  m.origin = { downloadUrl: 'https://cdn.jsdelivr.net/gh/u/rp@my-plugin-v0.1.0/plugins/my-plugin/my-plugin.zip' };
  const r = forgeCore.lintManifest(m);
  assert.ok(r.warns.some((w) => w.rule === 'origin.taggedUrl'));
});
t('lint: 未知 permission 键警告（会被忽略）', () => {
  const m = JSON.parse(JSON.stringify(GOOD_MANIFEST));
  m.permissions = { ...m.permissions, fsWrite: true };
  const r = forgeCore.lintManifest(m);
  assert.ok(r.warns.some((w) => w.rule === 'permissions.unknown'));
});
t('lint: 服务缺 healthCheck / 缺 {{port}} 警告', () => {
  const m = JSON.parse(JSON.stringify(GOOD_MANIFEST));
  delete m.contributes.services[0].healthCheck;
  m.contributes.services[0].argsTemplate = ['{{pluginDir}}/service/main.js'];
  const r = forgeCore.lintManifest(m);
  assert.ok(r.warns.some((w) => w.rule === 'service.healthCheck'));
  assert.ok(r.warns.some((w) => w.rule === 'service.port'));
});

// ── 搜索 ────────────────────────────────────────────────────────────────────
const METAS = [
  { id: 'a', title: '跨域治理', summary: 'CORS 与 fetch', tags: ['跨域', 'cap.http'] },
  { id: 'b', title: '键空间纪律', summary: 'cap.kv 前缀与分块', tags: ['kv'] },
];
const BODIES = { a: '面板绝不直接 fetch 外网。CORS 三层方案……', b: 'cap.kv list 返回全局所有键。' };
t('search: 命中标题权重高于正文', () => {
  const r = forgeCore.searchTopics(METAS, BODIES, '跨域');
  assert.strictEqual(r[0].meta.id, 'a');
});
t('search: 多词求和', () => {
  const r = forgeCore.searchTopics(METAS, BODIES, 'cap.kv 分块');
  assert.strictEqual(r[0].meta.id, 'b');
});
t('search: 无命中返回空', () => {
  assert.deepStrictEqual(forgeCore.searchTopics(METAS, BODIES, '量子力学'), []);
});
t('snippet: 定位命中片段', () => {
  const s = forgeCore.snippetFor(BODIES.a, 'CORS');
  assert.ok(s.includes('CORS'));
});

// ── 模板替换 ────────────────────────────────────────────────────────────────
t('applyTemplate: 全变量替换无残留', () => {
  const { text, missing } = forgeCore.applyTemplate('x={{A}} y={{B}} z={{C}}', { A: 1, B: 2, C: 3 });
  assert.strictEqual(text, 'x=1 y=2 z=3');
  assert.deepStrictEqual(missing, []);
});
t('applyTemplate: 缺变量保留并报警', () => {
  const { text, missing } = forgeCore.applyTemplate('{{A}} {{MISS}}', { A: 1 });
  assert.ok(text.includes('{{MISS}}'));
  assert.deepStrictEqual(missing, ['MISS']);
});

// ── 脚手架（真实模板文件参与）───────────────────────────────────────────────
const tplManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'scaffold', 'manifest.json'), 'utf8'));
function loadRealTemplates() {
  const out = {};
  for (const name of Object.keys(tplManifest.map)) {
    out[name] = fs.readFileSync(path.join(ROOT, 'shared', 'scaffold', name), 'utf8');
  }
  return out;
}
const SPEC = {
  id: 'demo-plugin', name: '演示插件', prefix: 'demo', icon: 'Beaker', order: 81,
  withService: true, withMcp: true, description: '演示', panelType: 'demoPlugin', labelKey: 'plugins.demoPlugin',
};

t('scaffold: 全量模板替换后零 {{TOKEN}} 残留', () => {
  const manifest = forgeCore.buildManifest(SPEC);
  const templates = { ...loadRealTemplates(), 'plugin.json': JSON.stringify(manifest, null, 2) };
  const { files, warnings } = forgeCore.buildScaffold(templates, SPEC);
  assert.deepStrictEqual(warnings, [], `warnings: ${warnings.join('; ')}`);
  const leftovers = files.filter((f) => /\{\{[A-Z_]+\}\}/.test(f.content));
  assert.deepStrictEqual(leftovers, [], leftovers.map((f) => f.path).join(', '));
  assert.ok(files.length >= 12, `文件数 ${files.length}`);
});
t('scaffold: withService=false 剔除服务文件', () => {
  const { files } = forgeCore.buildScaffold(loadRealTemplates(), { ...SPEC, withService: false });
  assert.ok(!files.some((f) => f.path.startsWith('service_')), files.map((f) => f.path).join(','));
  assert.ok(files.some((f) => f.path.startsWith('mcp_')));
});
t('scaffold: withMcp=false 剔除 MCP 文件', () => {
  const { files } = forgeCore.buildScaffold(loadRealTemplates(), { ...SPEC, withMcp: false });
  assert.ok(!files.some((f) => f.path.startsWith('mcp_')));
  assert.ok(files.some((f) => f.path.startsWith('service_')));
});

// ── 自洽：buildManifest 产物过自家体检 ──────────────────────────────────────
t('自洽: buildManifest 产物 lint 0 错误', () => {
  const m = forgeCore.buildManifest({ id: 'demo-plugin', name: '演示插件', icon: 'Beaker', order: 81, withService: true, withMcp: true, description: '演示插件描述足够长', panelType: 'demoPlugin', labelKey: 'plugins.demoPlugin' });
  const r = forgeCore.lintManifest(m);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
});
t('自洽: 18 个白名单图标逐一 buildManifest→lint 通过', () => {
  for (const icon of forgeCore.VALID_PLUGIN_ICONS) {
    const m = forgeCore.buildManifest({ id: 'demo-plugin', name: '演示插件', icon, order: 81, withService: false, withMcp: false, description: '演示插件描述足够长', panelType: 'demoPlugin', labelKey: 'plugins.demoPlugin' });
    const r = forgeCore.lintManifest(m);
    assert.strictEqual(r.ok, true, `icon=${icon}: ${JSON.stringify(r.errors)}`);
  }
});

// ── 知识库完整性 ────────────────────────────────────────────────────────────
t('知识库: index 与正文文件一一对应且非空', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'kb-index.json'), 'utf8'));
  assert.ok(idx.topics.length >= 14, `主题数 ${idx.topics.length}`);
  for (const tp of idx.topics) {
    const p = path.join(ROOT, 'shared', 'kb', `${tp.id}.md`);
    assert.ok(fs.existsSync(p), `缺正文 ${tp.id}.md`);
    const body = fs.readFileSync(p, 'utf8');
    assert.ok(body.length > 400, `${tp.id}.md 过短（${body.length}）`);
    assert.ok(Array.isArray(tp.tags) && tp.tags.length >= 3, `${tp.id} tags 不足`);
  }
});
t('知识库: 脚手架 manifest.map 与模板文件一一对应', () => {
  for (const name of Object.keys(tplManifest.map)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'shared', 'scaffold', name)), `缺模板 ${name}`);
  }
});

const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ' — ' + r.detail}`);
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
