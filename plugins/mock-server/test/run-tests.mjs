/**
 * 离线单测（零依赖零 mock）：node test/run-tests.mjs
 * 覆盖 core.js 全部业务规则——路径模式编译与匹配评分、模板引擎（种子 rng 确定性
 * 断言 + 请求上下文 + 转义 + 未识别字面保留）、路由/settings 归一化、CORS 头、
 * 404 诊断、历史环与分块计划、掩码、OpenAPI 导入、自检路由规格。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const core = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'core.js'));

const results = [];
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, detail: e.message }); }
};

// ── id ────────────────────────────────────────────────────────────────────
t('newId 形如时间-随机且唯一', () => {
  const a = core.newId(), b = core.newId();
  assert.match(a, /^[0-9a-z]+-[0-9a-f]{10}$/);
  assert.notStrictEqual(a, b);
});
t('isValidRouteId：合法/非法', () => {
  assert.ok(core.isValidRouteId('demo-users'));
  assert.ok(core.isValidRouteId('r1'));
  assert.ok(!core.isValidRouteId('-abc'));
  assert.ok(!core.isValidRouteId('BAD ID'));
  assert.ok(!core.isValidRouteId(''));
});

// ── 路径模式 ──────────────────────────────────────────────────────────────
t('parsePathPattern：合法模式与评分（静态3 参数2 通配1）', () => {
  const p1 = core.parsePathPattern('/api/users');
  assert.ok(p1.ok && p1.score === 6 && p1.segments.length === 2);
  const p2 = core.parsePathPattern('/api/users/:id');
  assert.ok(p2.ok && p2.score === 8 && p2.paramNames.includes('id'));
  const p3 = core.parsePathPattern('/files/*');
  assert.ok(p3.ok && p3.score === 4 && p3.segments[1].type === 'splat');
});
t('parsePathPattern：拒绝——空/无斜杠/保留前缀/连续斜杠/query/中间通配/坏参数名', () => {
  assert.ok(!core.parsePathPattern('').ok);
  assert.ok(!core.parsePathPattern('api/users').ok);
  assert.ok(!core.parsePathPattern('/__health').ok);
  assert.ok(!core.parsePathPattern('/__mock/steal').ok);
  assert.ok(!core.parsePathPattern('/api//users').ok);
  assert.ok(!core.parsePathPattern('/api/users?x=1').ok);
  assert.ok(!core.parsePathPattern('/api/*/users').ok);
  assert.ok(!core.parsePathPattern('/api/:bad-name').ok);
});
t('matchPattern：静态/参数/通配与剩余段不匹配', () => {
  const p = core.parsePathPattern('/api/users/:id/posts/*');
  const m1 = core.matchPattern(p.segments, '/api/users/42/posts/a/b');
  assert.ok(m1.ok && m1.params.id === '42' && m1.params.rest === 'a/b');
  const m1b = core.matchPattern(p.segments, '/api/users/42/posts');
  assert.ok(m1b && m1b.ok && m1b.params.rest === '', 'splat 允许命中空尾（语义：零段或多段）');
  const p2 = core.parsePathPattern('/api/users/:id');
  assert.strictEqual(core.matchPattern(p2.segments, '/api/users/42/extra'), null, '剩余段未消费→不匹配');
  const p3 = core.parsePathPattern('/api/users');
  const m3 = core.matchPattern(p3.segments, '/API/USERS');
  assert.ok(m3 && m3.ok, '静态段大小写不敏感（mock 宽容语义，README 注明）');
});
t('matchPattern：URL 编码参数解码、非法编码拒绝', () => {
  const p = core.parsePathPattern('/api/users/:name');
  const m = core.matchPattern(p.segments, '/api/users/%E5%BC%A0%E4%B8%89');
  assert.ok(m.ok && m.params.name === '张三');
  assert.strictEqual(core.matchPattern(p.segments, '/api/users/%zz'), null, '非法编码不匹配');
});
t('findMatch：静态 > 参数 > 通配；ANY 让位精确方法；同分按 createdAt 稳定', () => {
  const mk = (id, method, path, createdAt) => {
    const n = core.normalizeRoute({ id, method, path, bodyType: 'json', body: '{}', createdAt });
    assert.ok(n.ok, `路由 ${id} 构造失败: ${n.error}`);
    return n.route;
  };
  const routes = [
    mk('a-param', 'GET', '/api/users/:id', 1),
    mk('b-splat', 'GET', '/api/*', 2),
    mk('c-static', 'GET', '/api/users/special', 3),
    mk('d-any', 'ANY', '/api/users/special', 4),
  ];
  const hit1 = core.findMatch(routes, 'GET', '/api/users/special');
  assert.strictEqual(hit1.route.id, 'c-static', '静态优先');
  const hit2 = core.findMatch(routes, 'GET', '/api/users/42');
  assert.strictEqual(hit2.route.id, 'a-param');
  const hit3 = core.findMatch(routes, 'GET', '/api/other');
  assert.strictEqual(hit3.route.id, 'b-splat');
  const hit4 = core.findMatch(routes, 'POST', '/api/users/special');
  assert.strictEqual(hit4.route.id, 'd-any', '无 POST 精确路由 → ANY 命中');
  // 同分稳定序
  const ties = [mk('t-b', 'GET', '/x/y', 10), mk('t-a', 'GET', '/x/y', 9)];
  assert.strictEqual(core.findMatch(ties, 'GET', '/x/y').route.id, 't-a', 'createdAt 升序');
  // enabled=false 跳过
  const dis = [mk('off', 'GET', '/x', 1)];
  dis[0].enabled = false;
  assert.strictEqual(core.findMatch(dis, 'GET', '/x'), null);
});

// ── 归一化 ────────────────────────────────────────────────────────────────
const VALID_BASE = { method: 'GET', path: '/api/x', status: 200, bodyType: 'json', body: '{}', delayMs: 0, errorRate: 0, errorStatus: 500, enabled: true, headers: {} };
t('normalizeRoute：缺省回默认、数值夹取', () => {
  const n = core.normalizeRoute({ method: 'patch', path: '/api/:x', status: 99999, delayMs: 999999, errorRate: -5, errorStatus: 200 });
  assert.ok(n.ok);
  assert.strictEqual(n.route.method, 'PATCH');
  assert.strictEqual(n.route.status, 599);
  assert.strictEqual(n.route.delayMs, core.DELAY_MAX_MS);
  assert.strictEqual(n.route.errorRate, 0);
  assert.ok(n.route.id, '自动生成 id');
  assert.strictEqual(n.route.enabled, true);
});
t('normalizeRoute：路径错误给中文原因；body 截断到 16KB；headers 过滤', () => {
  const bad = core.normalizeRoute({ ...VALID_BASE, path: 'no-slash' });
  assert.ok(!bad.ok && /以 \/ 开头/.test(bad.error));
  const n = core.normalizeRoute({
    ...VALID_BASE,
    body: 'x'.repeat(core.ROUTE_BODY_CAP + 100),
    headers: { 'X-Ok': 'v', 'content-type': 'hack', 'X-Bad\nKey': 'x', 'X-Long': 'y'.repeat(2000) },
  });
  assert.ok(n.ok);
  assert.strictEqual(n.route.body.length, core.ROUTE_BODY_CAP);
  assert.strictEqual(n.route.headers['X-Ok'], 'v');
  assert.strictEqual(n.route.headers['content-type'], undefined, 'content-type 不允许自定义（防覆盖语义）');
  assert.strictEqual(n.route.headers['X-Long'].length, 1024);
});
t('normalizeRoute partial：保留原 id 与 createdAt', () => {
  const orig = core.normalizeRoute({ ...VALID_BASE, id: 'keep-me', createdAt: 123 }).route;
  const n = core.normalizeRoute({ id: 'keep-me', path: '/api/y', status: 201 }, { partial: true });
  assert.ok(n.ok);
  assert.strictEqual(n.route.id, 'keep-me');
  assert.strictEqual(n.route.status, 201);
});
t('normalizeSettings：非法路由剔除+warnings、重复 id 剔除、数量截断、宽容读', () => {
  const s = core.normalizeSettings({
    routes: [
      { ...VALID_BASE, id: 'ok-1' },
      { ...VALID_BASE, id: 'BAD!' },
      { ...VALID_BASE, id: 'ok-2' },
      null,
    ],
    cors: { mode: 'star' },
    fallback: { enabled: true, status: 999, bodyType: 'weird', body: 'ok' },
  });
  assert.strictEqual(s.routes.length, 2);
  assert.ok(s.warnings && s.warnings.length >= 2);
  assert.strictEqual(s.cors.mode, 'star');
  assert.strictEqual(s.fallback.status, 599);
  assert.strictEqual(s.fallback.bodyType, 'json');
  assert.strictEqual(core.normalizeSettings(null).cors.mode, 'echo', '默认 CORS echo');
});
t('bootstrapSettings：空值写 2 条示例路由；已有 settings 原样归一', () => {
  const s = core.bootstrapSettings(null);
  assert.ok(s.routes.length === 2 && s.routes.every((r) => r.builtin));
  const existing = core.normalizeSettings({ routes: [{ ...VALID_BASE, id: 'mine' }] });
  assert.strictEqual(core.bootstrapSettings(existing).routes.length, 1);
});
t('upsertRoute/removeRoute：upsert 更新保 createdAt、上限拒绝、remove 报告命中', () => {
  const r1 = core.normalizeRoute({ ...VALID_BASE, id: 'a', createdAt: 1 }).route;
  const r1b = core.normalizeRoute({ ...VALID_BASE, id: 'a', status: 500, createdAt: 999 }).route;
  const up = core.upsertRoute([r1], r1b);
  assert.ok(up.ok && up.updated && up.routes[0].status === 500 && up.routes[0].createdAt === 1);
  const routes = Array.from({ length: core.MAX_ROUTES }, (_, i) => core.normalizeRoute({ ...VALID_BASE, id: `r${i}` }).route);
  const denied = core.upsertRoute(routes, core.normalizeRoute({ ...VALID_BASE, id: 'new' }).route);
  assert.ok(!denied.ok && /上限/.test(denied.error));
  const rm = core.removeRoute(routes, 'r5');
  assert.ok(rm.ok && rm.routes.length === core.MAX_ROUTES - 1);
  assert.ok(!core.removeRoute(routes, 'nope').ok);
});

// ── 模板引擎（种子 rng 确定性）─────────────────────────────────────────────
function seededCtx(overrides = {}) {
  return {
    rng: core.mulberry32(42),
    counter: { n: 0 },
    now: 1730000000000,
    req: { path: { id: '42' }, query: { tag: 'abc' }, headers: { 'x-token': 'tok-1' }, body: { user: { name: '张三', tags: ['a', 'b'] } } },
    ...overrides,
  };
}
t('renderTemplate：数值/字符串/布尔生成器确定性输出', () => {
  const c1 = seededCtx();
  const out1 = core.renderTemplate('{"a":{{int 1,100}},"b":"{{cname}}","c":{{bool}},"d":"{{email}}"}', c1);
  const j1 = JSON.parse(out1.text);
  assert.ok(Number.isInteger(j1.a) && j1.a >= 1 && j1.a <= 100);
  assert.match(j1.b, /^[\u4e00-\u9fa5]{2,3}$/);
  assert.strictEqual(typeof j1.c, 'boolean');
  assert.match(j1.d, /^[a-z]+\d+@example\.com$/);
  // 同种子 → 同输出
  const out2 = core.renderTemplate('{"a":{{int 1,100}},"b":"{{cname}}","c":{{bool}},"d":"{{email}}"}', seededCtx());
  assert.strictEqual(out2.text, out1.text);
});
t('renderTemplate：uuid/counter/url/ip/color/datetime 形态', () => {
  const out = core.renderTemplate('{{uuid}}|{{counter}}|{{counter}}|{{url}}|{{ip}}|{{color}}|{{datetime}}', seededCtx());
  const parts = out.text.split('|');
  assert.match(parts[0], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.strictEqual(parts[1], '1');
  assert.strictEqual(parts[2], '2', 'counter 递增');
  assert.match(parts[3], /^https:\/\/example\.com\/[a-z]+\/\d+$/);
  assert.match(parts[4], /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  assert.match(parts[5], /^#[0-9a-f]{6}$/);
  assert.strictEqual(parts[6], new Date(1730000000000).toISOString());
});
t('renderTemplate：请求上下文 path/query/header/body（大小写不敏感头名/深层取值/数组/缺省空）', () => {
  const out = core.renderTemplate('{"p":"{{req.path.id}}","q":"{{req.query.tag}}","h":"{{req.header.X-Token}}","n":"{{req.body.user.name}}","a":"{{req.body.user.tags.1}}","miss":"{{req.query.nope}}"}', seededCtx());
  const j = JSON.parse(out.text);
  assert.strictEqual(j.p, '42');
  assert.strictEqual(j.q, 'abc');
  assert.strictEqual(j.h, 'tok-1');
  assert.strictEqual(j.n, '张三');
  assert.strictEqual(j.a, 'b');
  assert.strictEqual(j.miss, '');
});
t('renderTemplate：未识别表达式字面保留 + \\{{ 转义', () => {
  const o1 = core.renderTemplate('x={{noSuchGen}} y={{int}}', seededCtx());
  assert.match(o1.text, /\{\{noSuchGen\}\}/);
  assert.ok(o1.warnings.some((w) => w.includes('noSuchGen')));
  const o2 = core.renderTemplate('\\{{literal}}', seededCtx());
  assert.strictEqual(o2.text, '{{literal}}');
});
t('renderTemplate：pick/csentence/ctitle/daterange 形态', () => {
  const out = core.renderTemplate('{{pick red|green|blue}}|{{csentence 5,8}}|{{ctitle 6}}|{{dateRange -3,3}}', seededCtx());
  const [p, s, ti, d] = out.text.split('|');
  assert.ok(['red', 'green', 'blue'].includes(p));
  assert.match(s, /^[\u4e00-\u9fa5]+。$/);
  assert.ok(ti.length === 6);
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

// ── CORS ──────────────────────────────────────────────────────────────────
t('corsHeaders：echo 回显 Origin+凭据+Vary；star 固定 *；off 空', () => {
  const h = { origin: 'http://localhost:5173' };
  const echo = core.corsHeaders('echo', h);
  assert.strictEqual(echo['Access-Control-Allow-Origin'], 'http://localhost:5173');
  assert.strictEqual(echo['Access-Control-Allow-Credentials'], 'true');
  assert.strictEqual(echo.Vary, 'Origin');
  const pre = core.corsHeaders('echo', { ...h, 'access-control-request-headers': 'x-a, x-b' }, { preflight: true });
  assert.strictEqual(pre['Access-Control-Allow-Headers'], 'x-a, x-b');
  const star = core.corsHeaders('star', h, { preflight: true });
  assert.strictEqual(star['Access-Control-Allow-Origin'], '*');
  assert.strictEqual(star['Access-Control-Allow-Credentials'], undefined);
  assert.deepStrictEqual(core.corsHeaders('off', h), {});
  assert.strictEqual(core.corsHeaders('echo', {})['Access-Control-Allow-Origin'], undefined, '无 Origin 不给 ACAO');
  assert.strictEqual(core.corsHeaders('echo', { origin: `${'x'.repeat(300)}` })['Access-Control-Allow-Origin'].length, 200, 'Origin 截断');
});

// ── 404 诊断 ──────────────────────────────────────────────────────────────
t('notFoundBody：给同方法/相近路径 hint，容忍 undefined 项', () => {
  const routes = [
    { ...VALID_BASE, id: '1', method: 'GET', path: '/api/users', enabled: true, name: 'u' },
    { ...VALID_BASE, id: '2', method: 'POST', path: '/api/orders', enabled: true, name: 'o' },
    undefined,
  ];
  const body = core.notFoundBody(routes, 'GET', '/api/userz');
  assert.strictEqual(body.ok, false);
  assert.ok(body.hint.length >= 1);
});

// ── 历史 ──────────────────────────────────────────────────────────────────
t('maskHeaders：敏感头掩码不可逆、普通头截断保留', () => {
  const h = core.maskHeaders({ authorization: 'Bearer sk-very-secret-value-123', cookie: 'a=b; c=d', 'x-normal': 'v'.repeat(600) });
  assert.ok(!/sk-very-secret/.test(h.authorization));
  assert.match(h.authorization, /（已脱敏）$/);
  assert.match(h.cookie, /（已脱敏）$/);
  assert.strictEqual(h['x-normal'].length, 512);
});
t('classifyBodyPreview：json 文本/二进制/空/截断', () => {
  const j = core.classifyBodyPreview('application/json', Buffer.from('{"a":1}'), 100);
  assert.strictEqual(j.kind, 'text');
  const b = core.classifyBodyPreview('application/octet-stream', Buffer.from([0, 1, 2]), 100);
  assert.strictEqual(b.kind, 'binary');
  const e = core.classifyBodyPreview('', Buffer.alloc(0), 100);
  assert.strictEqual(e.kind, 'empty');
  const big = core.classifyBodyPreview('text/plain', Buffer.from('x'.repeat(300)), 100);
  assert.ok(big.truncated && big.bodyPreview.length === 100);
});
t('makeHistRec/applyHist：环形上限（新在前）', () => {
  let ring = [];
  for (let i = 0; i < core.HISTORY_CAP + 10; i++) ring = core.applyHist(ring, core.makeHistRec({ at: i, method: 'GET', path: `/${i}`, status: 200 }));
  assert.strictEqual(ring.length, core.HISTORY_CAP);
  assert.strictEqual(ring[0].path, `/${core.HISTORY_CAP + 9}`);
  assert.strictEqual(ring[core.HISTORY_CAP - 1].path, '/10');
});
t('planChunkWrites/readRing：写计划含删块、HIST_CHUNKS_KEEP 封顶、roundtrip', () => {
  const ring = Array.from({ length: 45 }, (_, i) => ({ at: i }));
  const plan = core.planChunkWrites(ring, 0);
  assert.strictEqual(plan.length, 3); // ceil(45/20)=3
  const map = {};
  for (const p of plan) map[p.key] = p.value;
  assert.deepStrictEqual(core.readRing(map).map((x) => x.at), ring.map((x) => x.at));
  // 收缩：ring 变短 → 多余块进删除计划
  const plan2 = core.planChunkWrites(ring.slice(0, 10), 3);
  assert.strictEqual(plan2.length, 3); // 1 写 + 2 删
  assert.strictEqual(plan2.filter((p) => p.value === null).length, 2);
  // 封顶：500 条 → 12 块
  const bigRing = Array.from({ length: 500 }, (_, i) => ({ at: i }));
  const plan3 = core.planChunkWrites(bigRing, 0);
  assert.strictEqual(plan3.length, core.HIST_CHUNKS_KEEP);
  assert.strictEqual(plan3[0].value.length, 20);
  // 超过 KEEP 的旧数据不镜像（内存仍有）
  assert.strictEqual(core.readRing(Object.fromEntries(plan3.map((p) => [p.key, p.value]))).length, 240);
});
t('summarizeHist：一行摘要含方法/路径/状态/⚠标记', () => {
  const s = core.summarizeHist(core.makeHistRec({ method: 'GET', path: '/api/x', query: 'a=1', status: 500, delayMs: 5, durMs: 8, matchedRouteName: 'r' }));
  assert.match(s, /GET \/api\/x\?a=1 → 500 ⚠/);
  assert.match(s, /路由\[r\]/);
});

// ── OpenAPI 导入 ──────────────────────────────────────────────────────────
t('importOpenApi：拒绝非 JSON/缺 paths/YAML 提示', () => {
  assert.ok(!core.importOpenApi(null).ok);
  assert.ok(!core.importOpenApi({}).ok);
  const bad = core.importOpenApi('openapi: 3.0\npaths:');
  assert.ok(!bad.ok);
});
t('importOpenApi：operation→路由、schema→模板示例、prefix、方法过滤', () => {
  const spec = {
    openapi: '3.0.0',
    paths: {
      '/pets': {
        get: { summary: '列表', responses: { '200': { description: '', content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'integer' }, data: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string', format: 'email' } } } } } } } } } } },
        post: { summary: '新建', responses: { default: { description: '', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } } } },
        parameters: [],
      },
      '/pets/{id}': { get: { summary: '详情', responses: { '200': { description: '', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'integer' } } } } } } } } },
    },
  };
  const imp = core.importOpenApi(spec, { prefix: '/mock' });
  assert.ok(imp.ok && imp.routes.length === 3);
  const list = imp.routes.find((r) => r.path === '/mock/pets' && r.method === 'GET');
  assert.ok(list);
  const body = JSON.parse(list.body);
  assert.strictEqual(body.code, '{{int 1,999}}');
  assert.strictEqual(Array.isArray(body.data), true);
  assert.strictEqual(body.data[0].name, '{{word}}');
  assert.strictEqual(body.data[0].email, '{{email}}');
  const detail = imp.routes.find((r) => r.path === '/mock/pets/{id}');
  assert.ok(detail && detail.method === 'GET');
  // 无 200/default 响应 schema → 兜底体
  const spec2 = { openapi: '3.0.0', paths: { '/x': { get: { summary: 's', responses: { '204': { description: '' } } } } } };
  const imp2 = core.importOpenApi(spec2, {});
  assert.ok(imp2.ok && imp2.routes[0].body === '{"ok":true,"data":{}}');
});
t('schemaToExample：enum/default/example/深度封顶', () => {
  assert.strictEqual(core.schemaToExample({ enum: ['a', 'b'] }, 0), 'a');
  assert.strictEqual(core.schemaToExample({ default: 7, type: 'integer' }, 0), 7);
  assert.strictEqual(core.schemaToExample({ example: { x: 1 } }, 0).x, 1);
  // 深度 4 → word
  const deep = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'object', properties: { d: { type: 'string' } } } } } } } } };
  const out = JSON.stringify(core.schemaToExample(deep, 0));
  assert.match(out, /\{\{word\}\}/);
});

// ── 自检规格 ──────────────────────────────────────────────────────────────
t('selftestRoutes：5 条全部合法（不被保留前缀拒绝）且 path 独占 /mst/ 空间', () => {
  const routes = core.selftestRoutes();
  assert.strictEqual(routes.length, 5);
  for (const r of routes) {
    assert.ok(r && r.id.startsWith('st-'));
    assert.ok(!r.path.startsWith(core.RESERVED_PREFIX));
    assert.ok(r.path.startsWith('/mst/'));
  }
  const ids = routes.map((r) => r.id);
  assert.strictEqual(new Set(ids).size, 5);
  const fail = routes.find((r) => r.id === 'st-fail');
  assert.strictEqual(fail.errorRate, 100);
  assert.strictEqual(routes.find((r) => r.id === 'st-slow').delayMs, 600);
});

console.log('');
let fail = 0;
for (const r of results) {
  console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.pass ? '' : ` —— ${r.detail}`}`);
  if (!r.pass) fail += 1;
}
console.log(`\ncore 单测: ${results.length - fail}/${results.length} 通过`);
process.exit(fail ? 1 : 0);
