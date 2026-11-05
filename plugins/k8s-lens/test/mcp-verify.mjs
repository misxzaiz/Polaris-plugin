#!/usr/bin/env node
/**
 * k8s-lens MCP 全链路冒烟：spawn 真实 stdio 子进程（node mcp/server.js，esbuild 产物），
 * 走完整 JSON-RPC：initialize → tools/list → k8s_lint（多文档坏清单）→ 非清单拒绝 →
 * k8s_explain → k8s_rules → k8s_scan（临时夹具目录，自造自清理）。
 * 前置：npm run build（产物 mcp/server.js 必须存在）。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_JS = path.join(pluginDir, 'mcp', 'server.js');

if (!fs.existsSync(SERVER_JS)) {
  console.error('✗ 未找到 mcp/server.js —— 先跑 npm run build');
  process.exit(1);
}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}

const child = spawn('node', [SERVER_JS], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderrBuf = '';
child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

let buf = '';
const pending = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf('\n');
    if (i === -1) break;
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`RPC 超时：${method}（${timeoutMs}ms）`));
    }, timeoutMs);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const BAD_MANIFEST = `apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: legacy-web
  labels:
    app: legacy
    version: 1
spec:
  selector:
    matchLabels:
      app: legacy
  template:
    metadata:
      labels:
        app: legacy
    spec:
      hostPID: true
      containers:
        - name: web
          image: nginx
          env:
            - name: ADMIN_PASSWORD
              value: hunter2-real
---
apiVersion: v1
kind: Service
metadata:
  name: legacy-svc
spec:
  selector:
    app: legacy
  ports:
    - port: 80
      targetPort: 8443
`;

async function main() {
  // 1. initialize
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'k8s-lens-verify', version: '0.0.1' },
  });
  ok(init.result && init.result.serverInfo && init.result.serverInfo.name === 'k8s-lens', `initialize：serverInfo.name=${init.result && init.result.serverInfo && init.result.serverInfo.name}`);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  // 2. tools/list
  const list = await rpc('tools/list', {});
  const names = (list.result.tools || []).map((t) => t.name);
  ok(names.length === 4 && ['k8s_lint', 'k8s_scan', 'k8s_rules', 'k8s_explain'].every((n) => names.includes(n)), `tools/list 4 工具：${names.join(',')}`);

  // 3. k8s_lint 坏清单
  const lint = await rpc('tools/call', { name: 'k8s_lint', arguments: { text: BAD_MANIFEST } });
  const lintText = lint.result.content[0].text;
  ok(lint.result.isError === false, 'k8s_lint 正常返回');
  ok(lintText.includes('k8s-deprecated-api'), '检出弃用 API（apps/v1beta1）');
  ok(lintText.includes('k8s-host-ns'), '检出 hostPID 红线');
  ok(lintText.includes('k8s-plaintext-secret') && lintText.includes('ADMIN_PASSWORD'), '检出明文密钥');
  ok(lintText.includes('k8s-label-value-type'), '检出 label 数字值');
  ok(lintText.includes('k8s-svc-port-mismatch'), '跨资源：Service targetPort 断链');
  ok(lintText.includes('k8s-image-tag'), '检出 latest 镜像');
  ok(/评分 \*\*[\d.]+\/10/.test(lintText), '报告含评分');

  // 4. 非清单拒绝
  const notK8s = await rpc('tools/call', { name: 'k8s_lint', arguments: { text: 'hello: world\nfoo: bar\n' } });
  ok(notK8s.result.isError === true && notK8s.result.content[0].text.includes('不像 K8s 清单'), '非清单文本如实拒绝');

  // 5. Helm 模板放行（不炸）
  const helm = await rpc('tools/call', { name: 'k8s_lint', arguments: { text: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ .Values.name }}\nspec:\n  replicas: {{ .Values.replicas }}\n' } });
  ok(helm.result.isError === false && helm.result.content[0].text.includes('Helm 模板'), 'Helm 模板识别并跳过');

  // 6. k8s_explain
  const explain = await rpc('tools/call', { name: 'k8s_explain', arguments: { rule: 'k8s-privileged' } });
  ok(explain.result.content[0].text.includes('安全红线'), 'k8s_explain 命中');
  const explainBad = await rpc('tools/call', { name: 'k8s_explain', arguments: { rule: 'nope' } });
  ok(explainBad.result.isError === true, 'k8s_explain 未知 id 报错');

  // 7. k8s_rules
  const rules = await rpc('tools/call', { name: 'k8s_rules', arguments: {} });
  ok(/规则目录（共 \d+ 条）/.test(rules.result.content[0].text), 'k8s_rules 目录完整');

  // 8. k8s_scan 临时夹具
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-lens-scan-'));
  try {
    fs.writeFileSync(path.join(tmp, 'deploy.yaml'), BAD_MANIFEST);
    fs.writeFileSync(path.join(tmp, 'not-k8s.yaml'), 'name: CI\non: push\njobs: {}\n');
    fs.mkdirSync(path.join(tmp, 'sub'));
    fs.writeFileSync(path.join(tmp, 'sub', 'clean.yaml'), 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ok\ndata:\n  a: b\n');
    const scan = await rpc('tools/call', { name: 'k8s_scan', arguments: { dir: tmp } });
    const scanText = scan.result.content[0].text;
    ok(scan.result.isError === false, 'k8s_scan 正常返回');
    ok(scanText.includes('deploy.yaml') && scanText.includes('clean.yaml'), '扫描命中两个清单文件');
    ok(scanText.includes('体检 2 个清单文件'), '汇总计数 2');
    const scanEmpty = await rpc('tools/call', { name: 'k8s_scan', arguments: { dir: path.join(tmp, 'nope') } });
    ok(scanEmpty.result.isError === true, '目录不存在如实报错');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n========== MCP 真桥冒烟：${pass} 通过 / ${fail} 失败 ==========`);
  if (stderrBuf.includes('[k8s-lens:error]')) console.error('（stderr 有 error 日志）', stderrBuf.split('\n').filter((l) => l.includes(':error]')).join('\n'));
  child.kill();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('✗ 冒烟失败：', e.message);
  child.kill();
  process.exit(1);
});
