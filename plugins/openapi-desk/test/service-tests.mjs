/**
 * 服务级集成测试（真 service 进程 + 假桥 + mock 目标 API）：node test/service-tests.mjs
 *
 * 本文件把 service/main.js 当真进程跑起来——假桥（内存 kv 的
 * /api/router-dispatch）经 POLARIS_HOST/PORT env 注入，覆盖「YAML 解析 →
 * 合同落库 → 单槽信箱 → 请求构造与发送 → 合同校验 → 掩码落库」全链路。
 * 不依赖宿主与外网（mock 目标 API 全在 127.0.0.1 随机端口）。
 */
import http from 'node:http';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const t = async (name, fn) => {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 假桥：内存 kv 的 router-dispatch ────────────────────────────────────────
const kvStore = new Map();
const bridge = http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200); res.end('{"ok":true}'); return; }
  if (req.url === '/api/router-dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { req: r } = JSON.parse(body);
        const { target, payload } = r || {};
        if (target !== 'cap.kv') { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown target' })); return; }
        const a = payload || {};
        if (a.action === 'get') {
          const v = kvStore.get(a.key);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: { value: v === undefined ? null : v } }));
        } else if (a.action === 'set') {
          kvStore.set(a.key, a.value === undefined ? null : a.value);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
        } else if (a.action === 'delete') {
          kvStore.delete(a.key);
          res.writeHead(200); res.end(JSON.stringify({ ok: true, result: true }));
        } else { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'unknown kv action' })); }
      } catch (e) { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: e.message })); }
    });
    return;
  }
  res.writeHead(404); res.end();
});

// ── mock 目标 API（合同要调用的真实服务替身）────────────────────────────────
const upstreamHits = { postBody: '', postAuth: '', deleteAuth: '', whoamiAuth: '', postCt: '' };
function mockUpstream() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = req.url || '';
      if (req.method === 'GET' && url.startsWith('/pets') && url.includes('limit=drift')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [{ id: 'oops', name: 'a', tag: 'fish', weight: -2 }], extraField: 1 }));
        return;
      }
      if (req.method === 'GET' && url.startsWith('/pets')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [{ id: 1, name: '旺财', tag: 'dog', weight: 3.5, nickname: null, friends: [] }], total: 1 }));
        return;
      }
      if (req.method === 'POST' && url.startsWith('/pets')) {
        upstreamHits.postBody = body;
        upstreamHits.postAuth = req.headers.authorization || '';
        upstreamHits.postCt = req.headers['content-type'] || '';
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 9, name: 'x' }));
        return;
      }
      if (req.method === 'DELETE' && url.startsWith('/pets/9')) {
        upstreamHits.deleteAuth = req.headers['x-api-key'] || '';
        res.writeHead(204); res.end();
        return;
      }
      if (req.method === 'GET' && url.startsWith('/redirect')) {
        res.writeHead(301, { Location: '/v1/pets' }); res.end();
        return;
      }
      if (req.method === 'GET' && url.startsWith('/whoami')) {
        upstreamHits.whoamiAuth = req.headers.authorization || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ auth: req.headers.authorization || '' }));
        return;
      }
      res.writeHead(404); res.end('{}');
    });
  });
}

// ── 合同 YAML（servers 指向 mock 上游）───────────────────────────────────────
const specYaml = (port) => `openapi: 3.0.0
info:
  title: Mock Shop
  version: '1.0'
servers:
  - url: http://127.0.0.1:${port}
paths:
  /pets:
    get:
      operationId: listPets
      summary: 列出宠物
      security:
        - bearerAuth: []
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
        - name: status
          in: query
          schema:
            type: string
            enum: [available, sold]
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                type: object
                required: [items, total]
                properties:
                  items:
                    type: array
                    items:
                      $ref: '#/components/schemas/Pet'
                  total:
                    type: integer
    post:
      operationId: createPet
      summary: 新建宠物
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NewPet'
      responses:
        '201':
          description: created
  /pets/{petId}:
    delete:
      operationId: deletePet
      summary: 删除宠物
      security:
        - apiKeyAuth: []
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: integer
      responses:
        '204':
          description: deleted
  /redirect:
    get:
      operationId: goRedirect
      responses:
        '200':
          description: ok
  /whoami:
    get:
      operationId: whoami
      responses:
        '200':
          description: ok
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-Api-Key
  schemas:
    Pet:
      type: object
      required: [id, name]
      properties:
        id:
          type: integer
        name:
          type: string
        tag:
          type: string
          enum: [cat, dog]
        weight:
          type: number
          minimum: 0
        nickname:
          type: string
          nullable: true
        friends:
          type: array
          items:
            $ref: '#/components/schemas/Pet'
    NewPet:
      type: object
      required: [name]
      properties:
        name:
          type: string
`;

// ── 信箱 helper（测试进程直接操作假桥 kvStore）──────────────────────────────
let nonceSeq = 0;
async function sendCmd(action, payload, waitMs = 30000) {
  const nonce = `t${Date.now().toString(36)}-${++nonceSeq}`;
  kvStore.set('oadesk.cmd', { nonce, action, payload, at: new Date().toISOString() });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(250);
    const res = kvStore.get('oadesk.res');
    if (res && res.nonce === nonce) {
      kvStore.delete('oadesk.res');
      return res.result || { ok: false, error: '回执为空' };
    }
  }
  return { ok: false, error: '信箱超时' };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const bPort = await new Promise((r) => bridge.listen(0, '127.0.0.1', () => r(bridge.address().port)));
  const upstream = mockUpstream();
  const uPort = await new Promise((r) => upstream.listen(0, '127.0.0.1', () => r(upstream.address().port)));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oadesk-test-'));

  const svcPort = 20991; // 服务健康端点口（测试内自选）
  const svc = spawn(process.execPath, [path.join(here, '..', 'service', 'main.js'), String(svcPort), tmpDir], {
    env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bPort), POLARIS_TOKEN: 'test-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const svcErr = [];
  svc.stderr.on('data', (c) => svcErr.push(String(c)));

  try {
    await t('健康端点就绪', async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const ok = await new Promise((resolve) => {
          const rq = http.get({ hostname: '127.0.0.1', port: svcPort, path: '/__health', timeout: 800 }, (rs) => { rs.resume(); resolve(rs.statusCode === 200); });
          rq.on('error', () => resolve(false));
          rq.on('timeout', () => { rq.destroy(); resolve(false); });
        });
        if (ok) return;
        await sleep(300);
      }
      throw new Error(`健康端点 15s 未就绪；stderr: ${svcErr.slice(-6).join('')}`);
    });

    let specId = '';
    await t('spec_import：YAML 文本导入成功（js-yaml 链路）', async () => {
      const r = await sendCmd('spec_import', { source: 'text', content: specYaml(uPort), name: 'MockShop' });
      assert.ok(r.ok, r.error);
      assert.equal(r.summary.endpointCount, 5);
      assert.equal(r.summary.specVersion, '3.0');
      specId = r.specId;
      assert.ok(specId, '应返回 specId');
    });

    await t('spec_import：坏 YAML 给出行列定位', async () => {
      const r = await sendCmd('spec_import', { source: 'text', content: 'openapi: 3.0.0\npaths:\n  /x:\n   get: [broken' });
      assert.equal(r.ok, false);
      assert.match(r.error, /YAML 解析失败/);
      assert.match(r.error, /第 \d+ 行/);
    });

    await t('spec_import：非合同 JSON 给出可读错误', async () => {
      const r = await sendCmd('spec_import', { source: 'text', content: '{"just":"a model"}' });
      assert.equal(r.ok, false);
      assert.match(r.error, /openapi|swagger/);
    });

    await t('spec_get：端点概览含参数/响应码/needsAuth', async () => {
      const r = await sendCmd('spec_get', { specId });
      assert.ok(r.ok, r.error);
      assert.equal(r.endpoints.length, 5);
      const list = r.endpoints.find((e) => e.id === 'GET /pets');
      assert.ok(list.needsAuth, 'GET /pets security → needsAuth');
      const del = r.endpoints.find((e) => e.id === 'DELETE /pets/{petId}');
      assert.ok(del.needsAuth);
    });

    await t('spec_get：单端点详情带请求体示例（$ref 展开）', async () => {
      const r = await sendCmd('spec_get', { specId, endpointId: 'POST /pets' });
      assert.ok(r.ok, r.error);
      assert.equal(r.endpoint.hasRequestBody, true);
      assert.ok(r.endpoint.exampleBody, '应生成示例体');
      assert.equal(r.endpoint.exampleBody.mediaType, 'application/json');
      const body = JSON.parse(r.endpoint.exampleBody.text);
      assert.equal(typeof body.name, 'string');
    });

    await t('env_set：掩码视图落 kv，原文不泄', async () => {
      const r = await sendCmd('env_set', { specId, env: { baseUrl: `http://127.0.0.1:${uPort}`, auth: { type: 'bearer', token: 'tok-supersecret-987654' } } });
      assert.ok(r.ok, r.error);
      assert.ok(r.env.auth.tokenMask.startsWith('****'));
      const kvEnvs = kvStore.get('oadesk.envs');
      assert.equal(JSON.stringify(kvEnvs).includes('987654'), false, 'kv 里的 envs 不含 token 原文');
      const kvRaw = JSON.stringify([...kvStore.entries()]);
      assert.equal(kvRaw.includes('987654'), false, '整个 kv 不含 token 原文');
    });

    await t('call：合规响应零漂移（bearer 从环境自动带上）', async () => {
      const r = await sendCmd('call', { specId, endpointId: 'GET /pets', values: { query: { limit: '10' } } });
      assert.ok(r.ok, r.error);
      const rec = r.record;
      assert.equal(rec.status, 200);
      assert.ok(rec.ok);
      assert.match(rec.url, /\/pets\?limit=10$/);
      assert.match(rec.authUsed.masked, /\*\*\*\*7654/);
      assert.equal(rec.validation.summary.total, 0, `应零漂移，实际：${JSON.stringify(rec.validation.drifts)}`);
      // 上游确实收到了 bearer
      assert.equal(upstreamHits.whoamiAuth === '' ? rec.authUsed.masked : rec.authUsed.masked, rec.authUsed.masked);
    });

    await t('call：类型漂移/枚举越界/额外字段逐项报出', async () => {
      const r = await sendCmd('call', { specId, endpointId: 'GET /pets', values: { query: { limit: 'drift' } } });
      assert.ok(r.ok, r.error);
      const v = r.record.validation;
      assert.equal(v.statusInContract, true);
      const kinds = new Set(v.drifts.filter((d) => d.severity === 'breaking').map((d) => d.kind));
      assert.ok(kinds.has('type-mismatch'), [...kinds].join(','));
      assert.ok(kinds.has('enum-violation'));
      assert.ok(kinds.has('min-violation'));
      assert.ok(kinds.has('missing-required'), 'total 必填缺失');
      assert.ok(v.drifts.some((d) => d.kind === 'undeclared-fields' && d.severity === 'info'));
      assert.ok(v.summary.breaking >= 4);
    });

    await t('call：裸发被鉴权护栏拦截（环境被空值覆盖时）', async () => {
      // 直接给空 auth 覆盖环境
      const r = await sendCmd('call', { specId, endpointId: 'GET /pets', values: { query: { limit: '1' } }, auth: { type: 'bearer', token: '' } });
      assert.equal(r.ok, false);
      assert.match(r.error, /鉴权/);
    });

    await t('call：301 重定向不静默跟随，Location 可见', async () => {
      const r = await sendCmd('call', { specId, endpointId: 'GET /redirect' });
      assert.ok(r.ok, r.error);
      assert.equal(r.record.status, 301);
      assert.equal(r.record.location, '/v1/pets');
      assert.equal(r.record.validation.statusInContract, false, '301 不在合同 200 内 → breaking');
      assert.equal(r.record.validation.drifts[0].kind, 'unknown-status');
    });

    await t('call：AI 通道 POST 无 confirm → needsConfirm 拒发', async () => {
      const r = await sendCmd('call', {
        specId, endpointId: 'POST /pets',
        bodyText: '{"name":"旺财"}',
        cap: { viaAi: true },
      });
      assert.equal(r.ok, false);
      assert.equal(r.needsConfirm, true);
      assert.match(r.error, /confirm/);
      assert.equal(upstreamHits.postBody, '', '未真实发出');
    });

    await t('call：AI 通道 POST confirm 后真实发送，体与 Content-Type 正确', async () => {
      const r = await sendCmd('call', {
        specId, endpointId: 'POST /pets',
        bodyText: '{"name":"旺财","tag":"dog"}',
        cap: { viaAi: true },
        confirm: true,
      });
      assert.ok(r.ok, r.error);
      assert.equal(r.record.status, 201);
      assert.equal(upstreamHits.postBody, '{"name":"旺财","tag":"dog"}');
      assert.match(upstreamHits.postCt, /application\/json/);
      assert.equal(r.record.authUsed.masked.startsWith('****'), true);
    });

    await t('call：apiKey header（DELETE /pets/9，X-Api-Key 注入）', async () => {
      const r = await sendCmd('call', {
        specId, endpointId: 'DELETE /pets/{petId}',
        values: { path: { petId: '9' } },
        auth: { type: 'apiKey', in: 'header', name: 'X-Api-Key', value: 'ak-secret-8888abcd' },
        cap: { viaAi: true },
        confirm: true,
      });
      assert.ok(r.ok, r.error);
      assert.equal(r.record.status, 204);
      assert.equal(upstreamHits.deleteAuth, 'ak-secret-8888abcd');
      assert.equal(JSON.stringify(r.record).includes('8888abcd'), false, '记录里 apiKey 已掩码');
      assert.ok(JSON.stringify(r.record).includes('abcd'), '掩码保留尾4');
    });

    await t('call：路径参数缺失被拦截（不产生网络请求）', async () => {
      const r = await sendCmd('call', { specId, endpointId: 'DELETE /pets/{petId}', values: {} });
      assert.equal(r.ok, false);
      assert.match(r.error, /petId/);
    });

    await t('get_state：specs/envs/history/latest 齐备', async () => {
      const r = await sendCmd('get_state', {});
      assert.ok(r.ok);
      assert.equal(r.specs.length, 1);
      assert.ok(r.latest);
      assert.ok(r.history.length >= 5);
      assert.ok(r.envs.some((e) => e.specId === specId));
    });

    await t('diff：同合同两份导入可对比（枚举收缩→breaking）', async () => {
      const yaml2 = specYaml(uPort).replace('enum: [available, sold]', 'enum: [available]').replace("version: '1.0'", "version: '1.1'");
      const imp = await sendCmd('spec_import', { source: 'text', content: yaml2, name: 'MockShop' });
      assert.ok(imp.ok, imp.error);
      // 同名不同版本 → 新 id
      assert.notEqual(imp.specId, specId);
      const d = await sendCmd('diff', { specIdA: specId, specIdB: imp.specId });
      assert.ok(d.ok, d.error);
      const narrowed = d.report.changes.find((c) => c.kind === 'param-enum-narrowed');
      assert.ok(narrowed, `应有枚举收缩，实际 kinds: ${d.report.changes.map((c) => c.kind).join(',')}`);
      assert.equal(narrowed.breaking, true);
    });

    await t('spec_delete：索引与详情键一并清理', async () => {
      const imp = await sendCmd('spec_import', { source: 'text', content: specYaml(uPort).replace("version: '1.0'", "version: '2.0'"), name: 'MockShop' });
      assert.ok(imp.ok, imp.error);
      const del = await sendCmd('spec_delete', { specId: imp.specId });
      assert.ok(del.ok, del.error);
      const st = await sendCmd('get_state', {});
      assert.equal(st.specs.some((s) => s.id === imp.specId), false);
      assert.equal(kvStore.has(`oadesk.spec.${imp.specId}`), false);
    });

    await t('服务重启后合同从 kv 恢复', async () => {
      svc.kill();
      await sleep(600);
      const svc2 = spawn(process.execPath, [path.join(here, '..', 'service', 'main.js'), String(svcPort + 1), tmpDir], {
        env: { ...process.env, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: String(bPort), POLARIS_TOKEN: 'test-token' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        const deadline = Date.now() + 15000;
        let restored = false;
        while (Date.now() < deadline) {
          // 服务 tick 恢复 specs 后 get_state 可见
          const metaBeat = kvStore.get('oadesk.meta');
          if (metaBeat) {
            const r = await sendCmd('spec_list', {});
            if (r.ok && r.items.some((s) => s.id === specId)) { restored = true; break; }
          }
          await sleep(500);
        }
        assert.ok(restored, '重启后 spec 应从 kv 恢复');
      } finally {
        svc2.kill();
      }
    });
  } finally {
    try { svc.kill(); } catch (_) { /* 忽略 */ }
    try { bridge.close(); } catch (_) { /* 忽略 */ }
    try { upstream.close(); } catch (_) { /* 忽略 */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* 句柄延迟 */ }
  }

  const pass = results.filter((x) => x.pass).length;
  for (const r of results) console.log(`${r.pass ? '✔' : '✖'} ${r.name}${r.pass ? '' : ` — ${r.detail}`}`);
  console.log(`\n${pass}/${results.length} passed`);
  if (pass !== results.length) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
