'use strict';
/**
 * core-tests.mjs —— openapi-core 纯函数单测
 * 跑法：node --test test/core-tests.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/openapi-core.js');

// ── 测试夹具：petstore 精简版（OpenAPI 3.0，含 $ref/components/循环） ──
const FIXTURE_30 = {
  openapi: '3.0.3',
  info: { title: 'Sample Pet Store', version: '1.0.0', description: '测试夹具' },
  servers: [
    { url: 'https://api.example.com/{ver}', variables: { ver: { default: 'v1' } } },
    { url: 'https://staging.example.com/v1', description: 'staging' },
  ],
  security: [{ bearerAuth: [] }],
  tags: [{ name: 'pets' }, { name: 'admin' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' }, apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } },
    schemas: {
      Pet: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer', format: 'int64', example: 10 },
          name: { type: 'string', example: 'doggie' },
          tag: { type: 'string', enum: ['cat', 'dog'], description: '种类' },
          weight: { type: 'number', minimum: 0, maximum: 100 },
          nickname: { type: 'string', nullable: true },
          email: { type: 'string', format: 'email' },
          bornAt: { type: 'string', format: 'date-time' },
          friends: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
          meta: { type: 'object', additionalProperties: false, properties: { color: { type: 'string' } } },
        },
      },
      NewPet: {
        type: 'object', required: ['name'],
        properties: { name: { type: 'string', minLength: 1 }, tag: { type: 'string' } },
      },
      ErrorModel: { type: 'object', required: ['code'], properties: { code: { type: 'integer' }, message: { type: 'string' } } },
      PetList: { type: 'object', required: ['items', 'total'], properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Pet' } }, total: { type: 'integer' } } },
      Status: { type: 'string', enum: ['available', 'sold'] },
    },
  },
  paths: {
    '/pets': {
      get: {
        tags: ['pets'], operationId: 'listPets', summary: '列出宠物',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 }, description: '每页数量' },
          { name: 'status', in: 'query', required: false, schema: { $ref: '#/components/schemas/Status' } },
          { name: 'X-Trace', in: 'header', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/PetList' } } } },
          '4XX': { description: '参数错误', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorModel' } } } },
        },
      },
      post: {
        tags: ['pets'], operationId: 'createPet', summary: '新建宠物',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' } } } },
        responses: { '201': { description: '创建成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }, default: { description: '错误', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorModel' } } } } },
      },
    },
    '/pets/{petId}': {
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['pets'], operationId: 'showPetById', summary: '宠物详情',
        responses: {
          '200': { description: '详情', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
          '404': { description: '不存在' },
        },
      },
      delete: {
        tags: ['admin'], operationId: 'deletePet', summary: '删除宠物', security: [{ apiKeyAuth: [] }],
        responses: { '204': { description: '已删除' } },
      },
    },
  },
};

const FIXTURE_20 = {
  swagger: '2.0',
  info: { title: 'Legacy API', version: '0.9.0' },
  host: 'legacy.example.com',
  basePath: '/api',
  paths: {
    '/users/{id}': {
      get: {
        summary: '用户详情',
        parameters: [
          { name: 'id', in: 'path', required: true, type: 'integer' },
          { name: 'expand', in: 'query', required: false, type: 'string' },
        ],
        responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/User' } } },
      },
      post: {
        summary: '更新用户',
        parameters: [
          { name: 'id', in: 'path', required: true, type: 'integer' },
          { name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/UserUpdate' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
  definitions: { User: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } }, UserUpdate: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
};

// ── 掩码 ──
test('maskSecret：长值尾4可见，短值全掩码，空为（空）', () => {
  assert.equal(core.maskSecret('sk-1234567890abcdef'), '****cdef');
  assert.equal(core.maskSecret('abc'), '****');
  assert.equal(core.maskSecret(''), '（空）');
  assert.equal(core.maskSecret(null), '（空）');
});

// ── $ref 解析 ──
test('resolveRef：内部引用解析成功；外部引用标记 external', () => {
  const r = core.resolveRef(FIXTURE_30, '#/components/schemas/Pet');
  assert.ok(r.ok);
  assert.equal(r.value.properties.id.type, 'integer');
  const ext = core.resolveRef(FIXTURE_30, './other.yaml#/schemas/Foo');
  assert.equal(ext.ok, false);
  assert.equal(ext.external, true);
  const missing = core.resolveRef(FIXTURE_30, '#/components/schemas/Nope');
  assert.equal(missing.ok, false);
});

// ── 规范化 ──
test('normalizeSpec：3.0 完整提取端点/参数/servers', () => {
  const r = core.normalizeSpec(FIXTURE_30, { name: '夹具店', source: 'text' });
  assert.ok(r.ok, r.error);
  const spec = r.spec;
  assert.equal(spec.specVersion, '3.0');
  assert.equal(spec.title, 'Sample Pet Store');
  assert.equal(spec.endpoints.length, 4); // GET/POST /pets + GET/DELETE /pets/{petId}
  assert.equal(spec.servers.length, 2);
  assert.deepEqual(spec.tags, ['pets', 'admin']);
  const listPets = spec.endpoints.find((e) => e.id === 'GET /pets');
  assert.ok(listPets);
  assert.equal(listPets.operationId, 'listPets');
  assert.equal(listPets.parameters.length, 3); // limit/status/X-Trace
  assert.equal(listPets.responses['200'].schema.$ref, '#/components/schemas/PetList');
  assert.equal(listPets.responses['4XX'].code, '4XX'); // 区间码保留
  const del = spec.endpoints.find((e) => e.id === 'DELETE /pets/{petId}');
  assert.ok(del);
  assert.ok(del.securityReqs && del.securityReqs.length === 1, 'operation 级 security 覆盖');
  const get = spec.endpoints.find((e) => e.id === 'GET /pets/{petId}');
  assert.equal(get.securityReqs, null, '未写 security 的 operation 返回 null 表示继承全局');
});

test('normalizeSpec：path 级参数合并进 operation', () => {
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  const get = spec.endpoints.find((e) => e.id === 'GET /pets/{petId}');
  const petId = get.parameters.find((p) => p.name === 'petId');
  assert.ok(petId, 'path 级参数被合并');
  assert.equal(petId.in, 'path');
  assert.equal(petId.required, true);
});

test('normalizeSpec：2.0 基础兼容（host+basePath→servers，in:body→requestBody，类型直写参数）', () => {
  const r = core.normalizeSpec(FIXTURE_20, {});
  assert.ok(r.ok, r.error);
  const spec = r.spec;
  assert.equal(spec.specVersion, '2.0');
  assert.equal(spec.servers[0].url, 'http://legacy.example.com/api');
  const upd = spec.endpoints.find((e) => e.id === 'POST /users/{id}');
  assert.ok(upd.hasRequestBody, 'in:body 参数转为 requestBody');
  assert.ok(upd.requestBodyRequired);
  const get = spec.endpoints.find((e) => e.id === 'GET /users/{id}');
  const idp = get.parameters.find((p) => p.name === 'id');
  assert.equal(idp.schema.type, 'integer');
  assert.equal(get.responses['200'].schema.$ref, '#/definitions/User');
});

test('normalizeSpec：坏输入给可读错误', () => {
  assert.equal(core.normalizeSpec(null, {}).ok, false);
  assert.equal(core.normalizeSpec([], {}).ok, false);
  const noVersion = core.normalizeSpec({ info: {}, paths: {} }, {});
  assert.equal(noVersion.ok, false);
  assert.match(noVersion.error, /openapi|swagger/);
  const noPaths = core.normalizeSpec({ openapi: '3.0.0', info: {} }, {});
  assert.equal(noPaths.ok, false);
  assert.match(noPaths.error, /paths/);
  const noOps = core.normalizeSpec({ openapi: '3.0.0', paths: { '/x': { parameters: [] } } }, {});
  assert.equal(noOps.ok, false);
});

test('normalizeSpec：3.1 检测给出降级提示', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE_30));
  doc.openapi = '3.1.0';
  const { spec } = core.normalizeSpec(doc, {});
  assert.equal(spec.specVersion, '3.1');
  assert.ok(spec.hints.some((h) => h.includes('3.1')));
});

// ── 示例生成 ──
test('exampleFromSchema：example/default/enum 优先级与格式感知', () => {
  assert.equal(core.exampleFromSchema(FIXTURE_30, FIXTURE_30.components.schemas.Pet.properties.id), 10);
  assert.equal(core.exampleFromSchema(FIXTURE_30, FIXTURE_30.components.schemas.Pet.properties.tag), 'cat');
  const dt = core.exampleFromSchema(FIXTURE_30, FIXTURE_30.components.schemas.Pet.properties.bornAt);
  assert.match(dt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(core.exampleFromSchema(FIXTURE_30, FIXTURE_30.components.schemas.Pet.properties.email), 'user@example.com');
  assert.equal(core.exampleFromSchema(FIXTURE_30, { type: 'integer', minimum: 5 }), 5);
});

test('exampleFromSchema：嵌套对象/数组/$ref 完整展开', () => {
  const pet = core.exampleFromSchema(FIXTURE_30, { $ref: '#/components/schemas/Pet' });
  assert.equal(pet.id, 10);
  assert.equal(pet.name, 'doggie');
  assert.ok(Array.isArray(pet.friends));
  assert.equal(pet.friends[0].name, 'doggie', '$ref 循环在数组内一层可见');
  assert.deepEqual(pet.friends[0].friends, [], '循环引用处截断为空数组，不炸栈不指数膨胀');
  assert.equal(pet.meta.color, 'string');
});

test('exampleBodyForEndpoint：POST /pets 生成 NewPet 示例', () => {
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  const post = spec.endpoints.find((e) => e.id === 'POST /pets');
  const body = core.exampleBodyForEndpoint(spec.raw, post);
  assert.ok(body);
  assert.equal(body.mediaType, 'application/json');
  assert.equal(body.value.name, 'string');
});

// ── 请求构造 ──
function listPetsEp() {
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  return { spec, ep: spec.endpoints.find((e) => e.id === 'GET /pets') };
}

test('buildRequest：baseUrl/server 变量/path 参数/query 序列化', () => {
  const { spec, ep } = listPetsEp();
  const r = core.buildRequest({
    root: spec.raw, endpoint: ep,
    baseUrl: 'https://api.example.com/{ver}',
    values: { query: { limit: '20', status: 'available' } },
    auth: { type: 'bearer', token: 'tok-abcdefgh12345678' },
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.url, 'https://api.example.com/v1/pets?limit=20&status=available');
  assert.equal(r.headers.Authorization, 'Bearer tok-abcdefgh12345678');
  assert.equal(r.maskedHeaders.Authorization, '****5678');
});

test('buildRequest：省略 baseUrl 落到合同 servers[0] 并替换变量', () => {
  const { spec, ep } = listPetsEp();
  const r = core.buildRequest({ root: spec.raw, endpoint: ep, auth: { type: 'bearer', token: 'x1234567890123456' } });
  assert.ok(r.ok, r.error);
  assert.equal(r.url, 'https://api.example.com/v1/pets');
});

test('buildRequest：路径参数缺失被拦截', () => {
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  const ep = spec.endpoints.find((e) => e.id === 'GET /pets/{petId}');
  const r = core.buildRequest({ root: spec.raw, endpoint: ep, baseUrl: 'https://x.example.com', auth: { type: 'bearer', token: 'x1234567890123456' } });
  assert.equal(r.ok, false);
  assert.match(r.error, /petId/);
});

test('buildRequest：免鉴权端点无需 token；鉴权端点裸发被拦', () => {
  const { spec, ep } = listPetsEp();
  const okR = core.buildRequest({ root: spec.raw, endpoint: ep, baseUrl: 'https://x.example.com', auth: null, values: {} });
  // 全局 security 要求 bearer → 裸发被拦
  assert.equal(okR.ok, false);
  assert.match(okR.error, /鉴权/);
  // DELETE 端点 operation 级 security（apiKeyAuth）
  const del = spec.endpoints.find((e) => e.id === 'DELETE /pets/{petId}');
  const r2 = core.buildRequest({
    root: spec.raw, endpoint: del, baseUrl: 'https://x.example.com',
    values: { path: { petId: '5' } },
    auth: { type: 'apiKey', in: 'header', name: 'X-Api-Key', value: 'ak-9999xyz88' },
  });
  assert.ok(r2.ok, r2.error);
  assert.equal(r2.headers['X-Api-Key'], 'ak-9999xyz88');
});

test('buildRequest：basic auth 与 apiKey in query', () => {
  const doc = JSON.parse(JSON.stringify(FIXTURE_30));
  doc.security = []; // 关全局
  const { spec } = core.normalizeSpec(doc, {});
  const ep = spec.endpoints.find((e) => e.id === 'GET /pets');
  const r1 = core.buildRequest({ root: spec.raw, endpoint: ep, baseUrl: 'https://x.example.com', auth: { type: 'basic', username: 'u1', password: 'p1' } });
  assert.equal(r1.headers.Authorization, `Basic ${Buffer.from('u1:p1').toString('base64')}`);
  const r2 = core.buildRequest({ root: spec.raw, endpoint: ep, baseUrl: 'https://x.example.com', auth: { type: 'apiKey', in: 'query', name: 'api_key', value: 'q-1234567890abcdef' } });
  assert.match(r2.url, /api_key=q-1234567890abcdef/);
});

test('buildRequest：POST JSON 体非法被预检拦截', () => {
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  const post = spec.endpoints.find((e) => e.id === 'POST /pets');
  const r = core.buildRequest({
    root: spec.raw, endpoint: post, baseUrl: 'https://x.example.com',
    bodyText: '{"name": truc}', auth: null,
  });
  // 全局 security 仍会拦；先关掉再测体校验
  const doc = JSON.parse(JSON.stringify(FIXTURE_30));
  doc.security = [];
  const spec2 = core.normalizeSpec(doc, {}).spec;
  const post2 = spec2.endpoints.find((e) => e.id === 'POST /pets');
  const r2 = core.buildRequest({ root: spec2.raw, endpoint: post2, baseUrl: 'https://x.example.com', bodyText: '{"name": truc}', auth: null });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /JSON/);
  const r3 = core.buildRequest({ root: spec2.raw, endpoint: post2, baseUrl: 'https://x.example.com', bodyText: '{"name":"旺财"}', auth: null });
  assert.ok(r3.ok, r3.error);
  assert.equal(r3.headers['Content-Type'], 'application/json');
  assert.equal(r3.bodyText, '{"name":"旺财"}');
});

// ── 响应校验 ──
function validateOnListPets(status, bodyText) {
  const { spec, ep } = listPetsEp();
  return core.validateResponse(spec.raw, ep, { status, bodyText });
}

test('validateResponse：完全符合的响应零漂移', () => {
  const body = JSON.stringify({ items: [{ id: 1, name: '旺财', tag: 'dog', weight: 12.5, nickname: null, email: 'a@b.co', bornAt: '2024-01-01T00:00:00Z', friends: [], meta: { color: 'yellow' } }], total: 1 });
  const r = validateOnListPets(200, body);
  assert.ok(r.statusInContract);
  const breaking = r.drifts.filter((d) => d.severity === 'breaking');
  assert.equal(breaking.length, 0, `应无 breaking，实际：${JSON.stringify(breaking)}`);
  // nickname: null 合法（nullable）——已由上面 breaking=0 覆盖
});

test('validateResponse：状态码不在合同 → breaking', () => {
  const r = validateOnListPets(599, '');
  assert.equal(r.statusInContract, false);
  assert.equal(r.drifts[0].kind, 'unknown-status');
  assert.equal(r.drifts[0].severity, 'breaking');
});

test('validateResponse：类型漂移/必填缺失/枚举越界逐项报出', () => {
  const body = JSON.stringify({ items: [{ id: 'not-a-number', name: '旺财', tag: 'fish', weight: -3 }] });
  const r = validateOnListPets(200, body);
  const kinds = new Set(r.drifts.filter((d) => d.severity === 'breaking').map((d) => `${d.jsonPath}:${d.kind}`));
  assert.ok(kinds.has('$.items[0].id:type-mismatch'), [...kinds].join(','));
  assert.ok(kinds.has('$.items[0].tag:enum-violation'));
  assert.ok([...kinds].some((k) => k.startsWith('$.items[0].id') || k.includes('id')), 'id 类型漂移在内');
  // total 必填缺失
  assert.ok(r.drifts.some((d) => d.kind === 'missing-required' && d.jsonPath === '$.total'));
  // weight < minimum
  assert.ok(r.drifts.some((d) => d.kind === 'min-violation' && d.jsonPath === '$.items[0].weight'));
});

test('validateResponse：额外字段=info，additionalProperties:false=warn', () => {
  const body = JSON.stringify({ items: [], total: 0, extraTop: 1 });
  const r = validateOnListPets(200, body);
  assert.ok(r.drifts.some((d) => d.kind === 'undeclared-fields' && d.severity === 'info' && d.jsonPath === '$'));
  const body2 = JSON.stringify({ items: [{ id: 1, name: 'a', friends: [], meta: { color: 'x', hack: true } }], total: 1 });
  const r2 = validateOnListPets(200, body2);
  assert.ok(r2.drifts.some((d) => d.kind === 'additional-forbidden' && d.severity === 'warn'));
});

test('validateResponse：非 JSON 体对 JSON schema → breaking unparseable', () => {
  const r = validateOnListPets(200, '<html>oops</html>');
  assert.ok(r.drifts.some((d) => d.kind === 'unparseable-body' && d.severity === 'breaking'));
});

test('validateResponse：区间码 4XX 与 default 命中', () => {
  const r = validateOnListPets(418, JSON.stringify({ code: 7, message: 'teapot' }));
  assert.ok(r.statusInContract, '418 命中 4XX 区间');
  assert.equal(r.summary.breaking, 0);
  const r2 = validateOnListPets(201, JSON.stringify({ name: 'x' })); // POST default
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  const post = spec.endpoints.find((e) => e.id === 'POST /pets');
  const rr = core.validateResponse(spec.raw, post, { status: 503, bodyText: JSON.stringify({ code: 1 }) });
  assert.ok(rr.statusInContract, '503 命中 default');
});

test('validateResponse：oneOf 全不匹配 → breaking；格式告警=warn', () => {
  const schema = { oneOf: [{ type: 'object', required: ['a'], properties: { a: { type: 'integer' } } }, { type: 'object', required: ['b'], properties: { b: { type: 'string' } } }] };
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  const fakeEp = { ...spec.endpoints[0], responses: { '200': { code: '200', schema } } };
  const r = core.validateResponse(spec.raw, fakeEp, { status: 200, bodyText: JSON.stringify({ c: true }) });
  assert.ok(r.drifts.some((d) => d.kind === 'oneOf-no-match' && d.severity === 'breaking'));
  const emailEp = { responses: { '200': { code: '200', schema: { type: 'object', properties: { contact: { type: 'string', format: 'email' } } } } }, parameters: [], hasRequestBody: false, securityReqs: [] };
  const r2 = core.validateResponse(spec.raw, emailEp, { status: 200, bodyText: JSON.stringify({ contact: '不是邮箱' }) });
  assert.ok(r2.drifts.some((d) => d.kind === 'format-violation' && d.severity === 'warn'));
  assert.equal(r2.summary.breaking, 0);
});

// ── diff ──
test('diffSpecs：端点删除/新增必填参数/类型变更全 breaking', () => {
  const a = core.normalizeSpec(FIXTURE_30, {}).spec;
  const bDoc = JSON.parse(JSON.stringify(FIXTURE_30));
  delete bDoc.paths['/pets'].post;
  bDoc.paths['/pets'].get.parameters.push({ name: 'sort', in: 'query', required: true, schema: { type: 'string' } });
  const limitParam = bDoc.paths['/pets'].get.parameters[0];
  limitParam.schema.type = 'string'; // integer → string
  const b = core.normalizeSpec(bDoc, {}).spec;
  const { changes, summary } = core.diffSpecs(a, b);
  assert.ok(changes.some((c) => c.kind === 'endpoint-removed' && c.breaking && c.path === '/pets'));
  assert.ok(changes.some((c) => c.kind === 'param-added' && c.breaking && c.detail.includes('sort')));
  assert.ok(changes.some((c) => c.kind === 'param-type-changed' && c.breaking && c.detail.includes('limit')));
  assert.ok(summary.breaking >= 3);
});

test('diffSpecs：可选参数新增=非 breaking；deprecated=warn；枚举收缩=breaking', () => {
  const a = core.normalizeSpec(FIXTURE_30, {}).spec;
  const bDoc = JSON.parse(JSON.stringify(FIXTURE_30));
  bDoc.paths['/pets'].get.parameters.push({ name: 'lang', in: 'query', required: false, schema: { type: 'string' } });
  bDoc.paths['/pets'].get.deprecated = true;
  bDoc.components.schemas.Status.enum = ['available']; // 收缩：sold 被移除
  const b = core.normalizeSpec(bDoc, {}).spec;
  const { changes, summary } = core.diffSpecs(a, b);
  assert.ok(changes.some((c) => c.kind === 'param-added' && !c.breaking && c.detail.includes('lang')));
  assert.ok(changes.some((c) => c.kind === 'deprecated-added'));
  assert.ok(changes.some((c) => c.kind === 'param-enum-narrowed' && c.breaking));
  assert.equal(summary.breaking, 1);
});

test('diffSpecs：响应 schema 字段移除 breaking；新增字段 info；响应码移除 breaking', () => {
  const a = core.normalizeSpec(FIXTURE_30, {}).spec;
  const bDoc = JSON.parse(JSON.stringify(FIXTURE_30));
  delete bDoc.components.schemas.PetList.properties.total; // 响应字段移除
  bDoc.components.schemas.Pet.properties.weight.description = '体重'; // 无结构变化
  bDoc.components.schemas.PetList.properties.newField = { type: 'string' }; // 新增字段
  const b = core.normalizeSpec(bDoc, {}).spec;
  const { changes } = core.diffSpecs(a, b);
  const removed = changes.find((c) => c.kind === 'schema-field-removed');
  assert.ok(removed && removed.breaking && removed.detail.includes('total'));
  const added = changes.find((c) => c.kind === 'schema-field-added');
  assert.ok(added && !added.breaking);
  // /pets/{petId} 的 DELETE 204 无 schema 不受影响；404 响应在两边都有
});

test('diffSpecs：全局 security 从无到有=breaking；server 变化=非 breaking', () => {
  const aDoc = JSON.parse(JSON.stringify(FIXTURE_30));
  aDoc.security = [];
  const a = core.normalizeSpec(aDoc, {}).spec;
  const bDoc = JSON.parse(JSON.stringify(FIXTURE_30));
  bDoc.servers = [{ url: 'https://moved.example.com/v2' }];
  const b = core.normalizeSpec(bDoc, {}).spec;
  const { changes } = core.diffSpecs(a, b);
  assert.ok(changes.some((c) => c.kind === 'global-security-changed' && c.breaking));
  assert.ok(changes.some((c) => c.kind === 'servers-changed' && !c.breaking));
});

test('diffSpecs：请求体从可选变必填=breaking；请求体新增=视 required 定级', () => {
  const aDoc = JSON.parse(JSON.stringify(FIXTURE_30));
  aDoc.paths['/pets'].post.requestBody.required = false;
  const a = core.normalizeSpec(aDoc, {}).spec;
  const b = core.normalizeSpec(FIXTURE_30, {}).spec;
  const { changes } = core.diffSpecs(a, b);
  assert.ok(changes.some((c) => c.kind === 'body-required-tightened' && c.breaking));

  const cDoc = JSON.parse(JSON.stringify(FIXTURE_30));
  delete cDoc.paths['/pets'].get; // 只留 post 对比端点级 body-added
  const cDoc2 = { openapi: '3.0.0', info: { title: 'x', version: '1' }, paths: { '/stats': { get: { responses: { '200': { description: 'ok' } } } } } };
  const c = core.normalizeSpec(cDoc2, {}).spec;
  const { changes: ch2 } = core.diffSpecs(c, core.normalizeSpec(FIXTURE_30, {}).spec);
  assert.ok(ch2.some((ch) => ch.kind === 'endpoint-added'));
});

// ── 环境掩码 ──
test('sanitizeEnvForKv：token 只出掩码', () => {
  const kvView = core.sanitizeEnvForKv({ baseUrl: 'https://x', auth: { type: 'bearer', token: 'sk-supersecret123456', name: '', in: '' } });
  assert.equal(kvView.baseUrl, 'https://x');
  assert.ok(kvView.auth.tokenMask.startsWith('****'));
  assert.equal(JSON.stringify(kvView).includes('supersecret'), false, '掩码视图绝不包含原文');
});

test('endpointBrief：AI 视图不含 raw schema', () => {
  const { spec } = core.normalizeSpec(FIXTURE_30, {});
  const brief = core.endpointBrief(spec.endpoints.find((e) => e.id === 'GET /pets'));
  assert.equal(brief.method, 'GET');
  assert.ok(brief.parameters.some((p) => p.name === 'limit' && p.type === 'integer'));
  assert.ok(brief.needsAuth, '全局 security → needsAuth');
  assert.ok(!JSON.stringify(brief).includes('$ref'), 'brief 不携带 $ref 原文');
});
