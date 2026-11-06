#!/usr/bin/env node
/**
 * gen.mjs —— fixture 证书矩阵生成（一次性；产物 PEM 入库，测试/selftest 消费固定文件）
 *
 * 为什么入库而非运行时生成：Node 无 X.509 签发 API，签发依赖 openssl。
 * fixture 固定后，单测断言（到期天数区间、SAN 列表、链结构）是确定性的。
 * 需要再生成时：node test/fixtures/gen.mjs（需 PATH 里有 openssl ≥3.4，用到 -not_before/-not_after）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (f) => path.join(here, f);
const run = (args) => execFileSync('openssl', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

// 生成证书并按需用 ext 文件追加扩展（x509 -req 的扩展经 -extfile）
function extFile(exts) {
  const f = path.join(os.tmpdir(), `cert-lens-ext-${Date.now()}-${Math.random().toString(36).slice(2)}.cnf`);
  fs.writeFileSync(f, exts.join('\n') + '\n');
  return f;
}
function selfSigned({ name, keyBits = 2048, digest = 'sha256', days = 150, cn, san, notBefore, notAfter, extraExts = [] }) {
  const args = [
    'req', '-x509', '-newkey', `rsa:${keyBits}`, '-nodes',
    '-keyout', out(`${name}.key`), '-out', out(`${name}.pem`),
    '-days', String(days), `-${digest}`,
    '-subj', `/CN=${cn}/O=Cert Lens Fixture`,
  ];
  if (notBefore) args.push('-not_before', notBefore);
  if (notAfter) args.push('-not_after', notAfter);
  const exts = [];
  if (san) exts.push(`subjectAltName=${san}`);
  exts.push(...extraExts);
  if (exts.length) args.push('-addext', exts.join(' -addext ').length && exts.join('\n').replace(/\n/g, ' -addext ') && exts.join(' '));
  // req -addext 每个扩展一次；上面拼接不可靠，改为逐个 push
  args.length = 0;
  args.push('req', '-x509', '-newkey', `rsa:${keyBits}`, '-nodes',
    '-keyout', out(`${name}.key`), '-out', out(`${name}.pem`),
    '-days', String(days), `-${digest}`,
    '-subj', `/CN=${cn}/O=Cert Lens Fixture`);
  if (notBefore) args.push('-not_before', notBefore);
  if (notAfter) args.push('-not_after', notAfter);
  for (const e of exts) args.push('-addext', e);
  run(args);
}
function csrSigned({ name, keyBits = 2048, digest = 'sha256', days = 200, cn, san, issuer, extraExts = [] }) {
  // issuer: {cert, key}
  run(['req', '-newkey', `rsa:${keyBits}`, '-nodes', '-keyout', out(`${name}.key`),
    '-out', out(`${name}.csr`), '-subj', `/CN=${cn}/O=Cert Lens Fixture`]);
  const ef = extFile([...(san ? [`subjectAltName=${san}`] : []), 'basicConstraints=CA:FALSE', ...extraExts]);
  run(['x509', '-req', '-in', out(`${name}.csr`), '-CA', out(issuer.cert), '-CAkey', out(issuer.key),
    '-CAcreateserial', '-out', out(`${name}.pem`), '-days', String(days), `-${digest}`, '-extfile', ef]);
  fs.rmSync(ef, { force: true });
}

// ── 矩阵 ──────────────────────────────────────────────────────────────────────
// 叶证书统一显式 CA:FALSE（openssl 3.x req -x509 默认 CA:TRUE，会污染「叶」语义）
const LEAF = ['basicConstraints=critical,CA:FALSE'];
// 1) 正常叶证书：自签（fixture 无真实 CA 链），SAN 齐全，RSA-2048/SHA-256，~150 天
selfSigned({ name: 'good-leaf', cn: 'good.test', san: 'DNS:good.test,IP:127.0.0.1', days: 150, extraExts: LEAF });
// 2) 过期证书：2024-01-01 → 2025-01-01（对 2026 年的 now 必然过期）
selfSigned({ name: 'expired', cn: 'expired.test', san: 'DNS:expired.test', days: 365, notBefore: '240101000000Z', notAfter: '250101000000Z', extraExts: LEAF });
// 3) SAN 不匹配：目标主机 localhost 时 SAN 里没有
selfSigned({ name: 'wrong-san', cn: 'wrong.test', san: 'DNS:wrong.test', days: 150, extraExts: LEAF });
// 4) 弱密钥：RSA-1024
selfSigned({ name: 'weak-key', keyBits: 1024, cn: 'weak.test', san: 'DNS:weak.test', days: 150, extraExts: LEAF });
// 5) 弱签名：SHA-1
selfSigned({ name: 'sha1', digest: 'sha1', cn: 'sha1.test', san: 'DNS:sha1.test', days: 150, extraExts: LEAF });
// 6) 三级链：root CA → intermediate CA → leaf（leaf SAN 指向 localhost，供 hermetic 服务器用）
selfSigned({ name: 'chain-root', cn: 'Cert Lens Test Root', days: 3650,
  extraExts: ['basicConstraints=critical,CA:TRUE', 'keyUsage=critical,keyCertSign,cRLSign'] });
csrSigned({ name: 'chain-inter', cn: 'Cert Lens Test Intermediate', days: 1825, issuer: { cert: 'chain-root.pem', key: 'chain-root.key' },
  extraExts: ['basicConstraints=critical,CA:TRUE,pathlen:0', 'keyUsage=critical,keyCertSign,cRLSign'] });
csrSigned({ name: 'chain-leaf', cn: 'localhost', days: 200, issuer: { cert: 'chain-inter.pem', key: 'chain-inter.key' },
  san: 'DNS:localhost,IP:127.0.0.1' });
// 7) 拼链：正确序（叶→中间→根）与乱序（中间→叶→根）
const rd = (f) => fs.readFileSync(out(f), 'utf8');
fs.writeFileSync(out('chain-full.pem'), rd('chain-leaf.pem') + rd('chain-inter.pem') + rd('chain-root.pem'));
fs.writeFileSync(out('chain-full-mixed.pem'), rd('chain-inter.pem') + rd('chain-leaf.pem') + rd('chain-root.pem'));
// 8) 不配对私钥（与 good-leaf.key 同为 RSA-2048 但不同钥）
run(['genrsa', '-out', out('unmatched-key.pem'), '2048']);
// 9) 公钥单独导出（公钥解析路径）
run(['pkey', '-in', out('good-leaf.key'), '-pubout', '-out', out('public-only.pem')]);

// ── sanity：node 解析每个产物，打印关键字段核对 ────────────────────────────────
const { X509Certificate } = await import('node:crypto');
// unmatched-key.pem 是 genrsa 私钥文件，不进证书 sanity
const list = fs.readdirSync(here).filter((f) => f.endsWith('.pem') && !f.includes('full') && !f.startsWith('public') && f !== 'unmatched-key.pem');
for (const f of list.sort()) {
  const pem = fs.readFileSync(out(f), 'utf8');
  const c = new X509Certificate(pem.split(/-----END CERTIFICATE-----/)[0] + '-----END CERTIFICATE-----\n');
  const left = Math.round((c.validToDate.getTime() - Date.now()) / 86400000);
  console.log(`${f.padEnd(18)} CN=${(c.subject.match(/CN=([^,\n]+)/) || [])[1] || '?'} CA=${c.ca} daysLeft=${left}`);
}
console.log('fixtures OK');
