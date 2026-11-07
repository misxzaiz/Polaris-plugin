/**
 * service-verify.mjs —— claim-lens 服务冒烟（spawn 真进程 + HTTP，零依赖 fetch）
 * 断言：/__health 免鉴权 / 401 拒绝 / extract / verify（fixture） / verify_batch / selftest / settings 读写。
 * 测试钩子：CLAIM_LENS_TEST_TOKEN 注入固定 token（yizhou 惯例）；端口 0 由服务回写 stdout。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const serviceJs = path.join(here, '../service/main.js');
const { buildFixture } = require('../server/selftest.js');

const TOKEN = 'test-token-claim-lens';
const cfgDir = mkdtempSync(path.join(tmpdir(), 'claim-lens-svc-cfg-'));
const fixtureRoot = buildFixture(tmpdir());

const child = spawn('node', [serviceJs, '0', cfgDir], {
  stdio: ['ignore', 'pipe', 'pipe'],
  // 测试隔离（mail-desk 坑）：POLARIS_PORT 钉死死端口，kvclient 走 env 分支短路端口扫描，
  // 杜绝「测试污染真宿主 kv」。此环境下 settings 应如实 saved:false（降级路径）。
  env: { ...process.env, CLAIM_LENS_TEST_TOKEN: TOKEN, POLARIS_HOST: '127.0.0.1', POLARIS_PORT: '1' },
});
let port = null;
let failures = 0;
child.stderr.setEncoding('utf8');
child.stderr.on('data', (c) => {
  if (port === null) {
    const m = /listening on 127\.0\.0\.1:(\d+)/.exec(c);
    if (m) port = Number(m[1]);
  }
  if (process.env.CLAIM_LENS_SVC_DEBUG) process.stderr.write(`[svc] ${c}`);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    if (port) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/__health`);
        if (r.ok) return await r.json();
      } catch (_) { /* not yet */ }
    }
    await sleep(100);
  }
  throw new Error('服务 5s 内未就绪');
}

async function api(pathName, body, token = TOKEN) {
  const res = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-claim-lens-token': token } : {}) },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* 非 JSON */ }
  return { status: res.status, data };
}

function check(name, cond, detail = '') {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
}

try {
  const health = await waitReady();
  check('/__health 200 免鉴权', health.ok === true && health.plugin === 'claim-lens');

  const noAuth = await api('/api/verify', { text: 'x', root: fixtureRoot }, null);
  check('无 token → 401', noAuth.status === 401);

  const badAuth = await api('/api/verify', { text: 'x', root: fixtureRoot }, 'wrong-token');
  check('错 token → 401', badAuth.status === 401);

  const ex = await api('/api/extract', { text: '入口在 `src/index.ts` 的 `parseConfig()`' });
  check('/api/extract 提取 file+symbol', ex.status === 200 && ex.data.ok
    && ex.data.claims.some((c) => c.type === 'file') && ex.data.claims.some((c) => c.type === 'symbol'),
  JSON.stringify(ex.data).slice(0, 150));

  const v = await api('/api/verify', {
    text: '`src/index.ts` 有 `parseConfig()`；`express` 在依赖；`src/missing.ts` 已删除',
    root: fixtureRoot,
  });
  check('/api/verify 全链路', v.status === 200 && v.data.ok && v.data.report.summary.total >= 3
    && v.data.report.claims.some((c) => c.verdict === 'verified')
    && v.data.report.claims.some((c) => c.verdict === 'refuted'),
  JSON.stringify(v.data).slice(0, 200));

  const vb = await api('/api/verify_batch', {
    root: fixtureRoot,
    claims: [{ type: 'config', target: 'server.port', file: 'config/app.config.json' }],
  });
  check('/api/verify_batch config 精确核验 8080', vb.status === 200
    && vb.data.report.claims[0].verdict === 'verified'
    && JSON.stringify(vb.data.report.claims[0].evidence).includes('8080'),
  JSON.stringify(vb.data).slice(0, 200));

  const badRoot = await api('/api/verify_batch', { root: 'Z:\\nonexistent\\root\\xyz', claims: [{ type: 'file', target: 'a.ts' }] });
  check('非法 root → 400', badRoot.status === 400);

  const badClaims = await api('/api/verify_batch', { root: fixtureRoot, claims: [{ type: 'nope', target: 'x' }] });
  check('非法 claim.type → 400', badClaims.status === 400);

  const sf = await api('/api/selftest', {});
  check('/api/selftest 全过', sf.status === 200 && sf.data.ok === true && sf.data.fail === 0,
    JSON.stringify(sf.data).slice(0, 300));

  // kv 桥被钉死（POLARIS_PORT=1）：settings 应如实 saved:false + 回读空默认，而不是假成功
  const s1 = await api('/api/settings', { roots: [fixtureRoot, 'D:\\other'] });
  check('/api/settings 降级如实 saved:false', s1.status === 200 && s1.data.saved === false && s1.data.settings.roots.length === 2);
  const s2 = await api('/api/settings', {});
  check('/api/settings 降级回读默认空', Array.isArray(s2.data.settings.roots) && s2.data.settings.roots.length === 0);
} catch (e) {
  failures++;
  console.error('✗ 异常:', e);
} finally {
  child.kill();
  try { rmSync(cfgDir, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
  try { rmSync(fixtureRoot, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
}

console.log(failures === 0 ? '\n服务冒烟通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
