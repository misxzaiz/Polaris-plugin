/**
 * service-verify.mjs —— jq 查询台 HTTP 服务真桥验证（随机测试端口 + 测试 token 钩子）
 * 断言：health / 401 / query 全链路（NDJSON/flags/截断预告）/ check 双态 / outline /
 *       reference / selftest 14 断言 / 400 可读错误 / 404 / OPTIONS 预检 / 超大请求体 400。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 39883; // 测试专用端口（插件正式端口 9883 之外）
const TOKEN = 'test-token-jq-query';

const child = spawn('node', [path.join(here, '../service/main.js'), String(PORT), ''], {
  env: { ...process.env, JQ_QUERY_TEST_TOKEN: TOKEN },
  stdio: ['ignore', 'ignore', 'pipe'],
});
child.stderr.on('data', (c) => process.stderr.write(`[svc-stderr] ${c}`));

async function waitHealth(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/__health`);
      if (r.status === 200) return await r.json();
    } catch (_) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务 5s 内未就绪');
}

async function api(pathname, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!opts.noToken) headers['x-jq-query-token'] = opts.badToken ? 'wrong' : TOKEN;
  const r = await fetch(`http://127.0.0.1:${PORT}${pathname}`, {
    method: opts.method || 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await r.json(); } catch (_) { /* leave null */ }
  return { status: r.status, json, headers: r.headers };
}

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${detail}`); }
}

try {
  const health = await waitHealth();
  check('health 200 + version + engine stats', health.ok === true && typeof health.version === 'string' && typeof health.engine?.queries === 'number');

  // 鉴权
  const noAuth = await api('/api/query', { input: '{}', query: '.' }, { noToken: true });
  check('无 token → 401', noAuth.status === 401);
  const badAuth = await api('/api/query', { input: '{}', query: '.' }, { badToken: true });
  check('错 token → 401', badAuth.status === 401);

  // OPTIONS 预检（web 构建加固）
  const optRes = await fetch(`http://127.0.0.1:${PORT}/api/query`, { method: 'OPTIONS' });
  check('OPTIONS 204 + CORS 头', optRes.status === 204 && optRes.headers.get('access-control-allow-origin') === '*');

  // query：全链路
  const q1 = await api('/api/query', {
    input: '{"users":[{"name":"alice","age":31},{"name":"bob","age":24},{"name":"carol","age":37}]}',
    query: '[.users[] | select(.age > 30) | .name] | join(",")',
    flags: ['-r'],
  });
  check('query select+join -r', q1.status === 200 && q1.json.ok && q1.json.raw.trim() === 'alice,carol', JSON.stringify(q1.json).slice(0, 200));
  check('query 返回 ms/文档数/输出数', typeof q1.json.ms === 'number' && q1.json.inputDocs === 1 && q1.json.outputCount === 1);

  const q2 = await api('/api/query', { input: '{"a":1}\n{"a":2}\n{"a":3}', query: 'length', flags: ['--slurp'] });
  check('query NDJSON --slurp', q2.json.ok && q2.json.raw.trim() === '3' && q2.json.inputDocs === 3, JSON.stringify(q2.json).slice(0, 200));

  const q3 = await api('/api/query', { input: '', query: '[range(5)]', flags: ['-n'] });
  check('query -n 造数据', q3.json.ok && q3.json.outputCount === 1 && JSON.stringify(q3.json.outputs[0].value) === '[0,1,2,3,4]');

  const q4 = await api('/api/query', { input: '{"a":"s"}', query: '.a | tonumber' });
  check('query jq 运行错误 → 400 人话', q4.status === 400 && /jq 错误/.test(q4.json.error), JSON.stringify(q4.json));

  const q5 = await api('/api/query', { input: '{bad', query: '.' });
  check('query 坏输入 → 400', q5.status === 400 && /合法 JSON/.test(q5.json.error));

  const q6 = await api('/api/query', { input: '{}', query: '.a ++' });
  check('query 语法错误 → 400', q6.status === 400 && /syntax|compile/i.test(q6.json.error), JSON.stringify(q6.json).slice(0, 200));

  const q7 = await api('/api/query', { input: '{}', query: '.', flags: ['--evil'] });
  check('query 非法 flag → 400 白名单提示', q7.status === 400 && /不支持/.test(q7.json.error));

  const q8 = await api('/api/query', { input: '{}', query: '' });
  check('query 空 query → 400', q8.status === 400);

  // check 双态
  const c1 = await api('/api/check', { query: '.a ++' });
  check('check 语法错误 syntaxOk=false', c1.json.ok && c1.json.syntaxOk === false && c1.json.errorKind === 'syntax');
  const c2 = await api('/api/check', { query: '.a | select(. > 1)' });
  check('check 语法 OK', c2.json.ok && c2.json.syntaxOk === true);

  // outline
  const o1 = await api('/api/outline', { json: '{"rows":[{"id":1},{"id":2}]}' });
  check('outline 元素键并集', o1.json.ok && o1.json.text.includes('元素键并集') && o1.json.text.includes('id'));
  const o2 = await api('/api/outline', { json: 'nope' });
  check('outline 非法 JSON → 400', o2.status === 400);

  // reference
  const r1 = await api('/api/reference', { keyword: 'csv' });
  check('reference 搜索', r1.json.ok && r1.json.entries.some((e) => e.sig.includes('@csv')));
  const r2 = await api('/api/reference', {});
  check('reference 全量', r2.json.ok && r2.json.total > 80);

  // selftest：14 断言全绿（含真实超时击杀+重生成）
  const s1 = await api('/api/selftest', {});
  check('selftest 15/15 全绿', s1.json.ok && s1.json.fail === 0 && s1.json.total === 15,
    JSON.stringify(s1.json.results?.filter((x) => !x.pass)));
  check('selftest 后引擎仍健康', s1.json.engine.timeouts >= 1 && s1.json.engine.respawns >= 1);

  // 404 与超大请求体
  const nf = await api('/api/nope', {});
  check('未知 API → 404', nf.status === 404);
  const big = 'x'.repeat(66 * 1024 * 1024);
  const over = await api('/api/query', { input: big, query: '.' });
  check('超大请求体 → 400', over.status === 400 && /超限|超过/.test(over.json.error || ''), JSON.stringify(over.json).slice(0, 120));

  // 隐私红线：日志不含输入内容（服务 stderr 只允许尺寸/错误类型）
  // 由 spawn 的 stderr 转发可见；这里做静态断言：main-src 源码中不 log query/input 内容
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(here, '../service/main-src.js'), 'utf8');
  check('日志不落查询内容（静态审计）', !/log\([^)]*body\.query/.test(src) && !/log\([^)]*body\.input/.test(src));
} catch (e) {
  failures++;
  console.error('✗ 异常中断:', e);
} finally {
  child.kill();
}
console.log(failures === 0 ? '\n服务验证全部通过' : `\n服务验证失败 ${failures} 项`);
process.exit(failures === 0 ? 0 : 1);
