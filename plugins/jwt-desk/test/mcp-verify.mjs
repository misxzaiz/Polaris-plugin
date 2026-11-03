/**
 * JWT 调试台 MCP 协议离线验证（node test/mcp-verify.mjs）
 *
 * 纯本地检测无宿主依赖——initialize/tools/list/未知工具/真实验签全可离线验证。
 * tools/call 参数平铺 { name, arguments }，勿双重包裹（exec-sandbox 坑）。
 */
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '..');

const mcp = spawn(process.execPath, ['mcp/server.js'], {
  cwd: APP_ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const stderr = [];
mcp.stderr.on('data', (c) => stderr.push(String(c)));

let buf = '';
const pending = new Map();
let nextId = 1;
mcp.stdout.setEncoding('utf8');
mcp.stdout.on('data', (c) => {
  buf += c;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch (_) { /* ignore */ }
  }
});

function rpc(method, params, timeoutMs = 20000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`rpc 超时: ${method}`)), timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function text(res) {
  return String(res.result?.content?.[0]?.text || '');
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

const JWTIO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const JWTIO_SECRET = 'your-256-bit-secret';

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '0' } });
  check('initialize: protocolVersion', init.result?.protocolVersion === '2024-11-05');
  check('initialize: serverInfo.name', init.result?.serverInfo?.name === 'jwt-desk');
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  check('tools/list: 4 工具', names.length === 4, `实际 ${names.join(',')}`);
  check('tools/list: decode', names.includes('jwtdesk_decode'));
  check('tools/list: verify', names.includes('jwtdesk_verify'));
  check('tools/list: audit', names.includes('jwtdesk_audit'));
  check('tools/list: sign', names.includes('jwtdesk_sign'));

  // decode：jwt.io 已知向量
  const d1 = await rpc('tools/call', { name: 'jwtdesk_decode', arguments: { token: JWTIO_TOKEN } });
  check('decode: isError=false', d1.result?.isError === false, text(d1));
  check('decode: 三段拆解含 claims', text(d1).includes('John Doe') && text(d1).includes('签发者') === false, text(d1).slice(0, 120));
  check('decode: claims 对照表', text(d1).includes('iat（签发时间'), text(d1).slice(0, 200));

  // decode：JWE 五段如实拒绝
  const d2 = await rpc('tools/call', { name: 'jwtdesk_decode', arguments: { token: 'a.b.c.d.e' } });
  check('decode: JWE 拒绝 isError', d2.result?.isError === true && text(d2).includes('JWE'), text(d2));

  // verify：通过 + 时钟视角
  const v1 = await rpc('tools/call', { name: 'jwtdesk_verify', arguments: { token: JWTIO_TOKEN, secret: JWTIO_SECRET, nowMs: 1710000000000 } });
  check('verify: isError=false', v1.result?.isError === false, text(v1));
  check('verify: 验签通过', text(v1).includes('验签通过'), text(v1).slice(0, 200));
  check('verify: 含审计发现段', text(v1).includes('审计发现'), text(v1).slice(0, 300));
  // iat=1516239022 早于 nowMs → 无未来时告警
  check('verify: 无 iat_future 误报', !text(v1).includes('iat 在未来'), text(v1).slice(0, 300));

  // verify：错误密钥
  const v2 = await rpc('tools/call', { name: 'jwtdesk_verify', arguments: { token: JWTIO_TOKEN, secret: 'wrong-secret-wrong' } });
  check('verify: 错误密钥判不通过', v2.result?.isError === false && text(v2).includes('验签不通过'), text(v2).slice(0, 150));

  // verify：缺密钥给出中文指引
  const v3 = await rpc('tools/call', { name: 'jwtdesk_verify', arguments: { token: JWTIO_TOKEN } });
  check('verify: 缺 secret 中文指引', text(v3).includes('secret'), text(v3).slice(0, 200));

  // audit：注入 nowMs（ISO 字符串形态，一参一义内的合法输入）
  const a1 = await rpc('tools/call', {
    name: 'jwtdesk_audit',
    arguments: {
      token: 'eyJhbGciOiJub25lIn0.' + Buffer.from(JSON.stringify({ sub: 'x', password: 'leak' })).toString('base64url') + '.',
      nowMs: '2026-11-04T00:00:00Z',
    },
  });
  check('audit: isError=false', a1.result?.isError === false, text(a1));
  check('audit: alg=none 高危', text(a1).includes('高危') && text(a1).includes('none'), text(a1).slice(0, 250));
  check('audit: 凭证字段发现', text(a1).includes('password'), text(a1).slice(0, 300));

  // sign HS256 → verify 往返（同一 MCP 进程）
  const s1 = await rpc('tools/call', {
    name: 'jwtdesk_sign',
    arguments: { alg: 'HS256', secret: 'mcp-roundtrip-secret-123', payload: { sub: 'roundtrip', scope: 'read' }, expiresInSeconds: 3600, nowMs: 1710000000000 },
  });
  check('sign: isError=false', s1.result?.isError === false, text(s1));
  const minted = text(s1).split('\n').find((l) => l.includes('.') && l.length > 40 && !l.includes(' '));
  check('sign: 产出 token 行', !!minted, text(s1));
  if (minted) {
    const v4 = await rpc('tools/call', { name: 'jwtdesk_verify', arguments: { token: minted.trim(), secret: 'mcp-roundtrip-secret-123', nowMs: 1710000600000 } });
    check('sign→verify 往返通过', text(v4).includes('验签通过'), text(v4).slice(0, 200));
    const v5 = await rpc('tools/call', { name: 'jwtdesk_verify', arguments: { token: minted.trim(), secret: 'mcp-roundtrip-secret-123', nowMs: 1710100000000 } });
    check('sign→verify 过期判定', text(v5).includes('已过期'), text(v5).slice(0, 200));
  }

  // sign RS256（harness 现场生成密钥对，PEM 传入）→ verify
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const s2 = await rpc('tools/call', { name: 'jwtdesk_sign', arguments: { alg: 'RS256', privateKeyPem: privPem, payload: { sub: 'rsa-ok' } } });
  check('sign RS256: isError=false', s2.result?.isError === false, text(s2));
  const mintedRsa = text(s2).split('\n').map((l) => l.trim()).find((l) => l.split('.').length === 3);
  check('sign RS256: 产出 token', !!mintedRsa, text(s2).slice(0, 120));
  if (mintedRsa) {
    const v6 = await rpc('tools/call', { name: 'jwtdesk_verify', arguments: { token: mintedRsa, publicKeyPem: pubPem } });
    check('sign RS256→verify 通过', text(v6).includes('验签通过'), text(v6).slice(0, 200));
  }

  // sign ES256 往返
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ecPriv = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const ecPub = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const s3 = await rpc('tools/call', { name: 'jwtdesk_sign', arguments: { alg: 'ES256', privateKeyPem: ecPriv, payload: { sub: 'ec-ok' } } });
  check('sign ES256: isError=false', s3.result?.isError === false, text(s3));
  const mintedEc = text(s3).split('\n').map((l) => l.trim()).find((l) => l.split('.').length === 3);
  if (mintedEc) {
    const v7 = await rpc('tools/call', { name: 'jwtdesk_verify', arguments: { token: mintedEc, publicKeyPem: ecPub } });
    check('sign ES256→verify 通过（r||s↔DER 全链）', text(v7).includes('验签通过'), text(v7).slice(0, 200));
  }

  // 缺参 / 未知工具
  const miss = await rpc('tools/call', { name: 'jwtdesk_decode', arguments: {} });
  check('decode: 缺 token isError', miss.result?.isError === true, text(miss));
  const badSign = await rpc('tools/call', { name: 'jwtdesk_sign', arguments: { alg: 'HS256', payload: { a: 1 } } });
  check('sign: 缺 secret isError', badSign.result?.isError === true, text(badSign));
  const unk = await rpc('tools/call', { name: 'jwtdesk_nope', arguments: {} });
  check('未知工具 isError', unk.result?.isError === true, text(unk));

  mcp.kill();
} catch (e) {
  console.error('harness 异常:', e.message);
  console.error('stderr:', stderr.join('').slice(-800));
  mcp.kill();
  process.exit(1);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.length - pass;
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
