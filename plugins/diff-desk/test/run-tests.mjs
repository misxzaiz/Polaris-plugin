#!/usr/bin/env node
/**
 * run-tests.mjs —— core 离线单测 + 静态安全断言（零依赖、零网络）。
 * 跑法：node test/run-tests.mjs（或 npm test）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const core = require(join(root, 'shared', 'core.js'));
const { fenceUrl, isPrivateIp, sanitizeHeaders, parseProxyConfig } = require(join(root, 'service', 'fetcher.js'));

/* ---------- 零依赖 runner ---------- */
let pass = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, msg: e.message });
    console.log(`  ✗ ${name}\n    ${e.message}`);
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label || 'eq'}：期望 ${b}，实际 ${a}`);
}
function ok(cond, label) {
  if (!cond) throw new Error(label || '断言失败');
}

/* ============================ 文本行级 diff ============================ */

test('等文本零差异', () => {
  const r = core.lineDiff('a\nb\nc', 'a\nb\nc');
  eq([r.stats.additions, r.stats.deletions, r.stats.modifies], [0, 0, 0], '统计');
  eq(r.items.length, 3, 'items 行数');
});

test('单行修改 → modify 且行内 spans 还原整行', () => {
  const r = core.lineDiff('timeout: 30s', 'timeout: 60s');
  eq([r.stats.modifies, r.stats.additions, r.stats.deletions], [1, 0, 0], '统计');
  const mod = r.items.find((it) => it.type === 'modify');
  ok(mod, '应有 modify');
  eq(mod.aNo, 1, 'aNo');
  eq(mod.bNo, 1, 'bNo');
  eq(mod.spans.left.map((s) => s.text).join(''), 'timeout: 30s', '左还原');
  eq(mod.spans.right.map((s) => s.text).join(''), 'timeout: 60s', '右还原');
  ok(mod.spans.right.some((s) => s.type === 'ins'), '右应标 ins span');
  ok(mod.spans.left.some((s) => s.type === 'del'), '左应标 del span');
});

test('纯新增与纯删除', () => {
  const add = core.lineDiff('a', 'a\nb\nc');
  eq([add.stats.additions, add.stats.deletions], [2, 0], '新增');
  const del = core.lineDiff('a\nb\nc', 'a');
  eq([del.stats.additions, del.stats.deletions], [0, 2], '删除');
});

test('共前缀行号偏移正确（第 5 行改）', () => {
  const r = core.lineDiff('l1\nl2\nl3\nl4\nl5', 'l1\nl2\nl3\nl4\nL5');
  const mod = r.items.find((it) => it.type === 'modify');
  ok(mod, '应有 modify');
  eq([mod.aNo, mod.bNo], [5, 5], '行号');
});

test('共后缀不干扰行号', () => {
  const r = core.lineDiff('x\nend', 'y\nend');
  const mod = r.items.find((it) => it.type === 'modify');
  eq([mod.aNo, mod.bNo], [1, 1], '行号');
});

test('忽略空白与大小写', () => {
  const r = core.lineDiff('Hello   World\nx  ', 'hello world\nx', { ignoreWhitespace: true, ignoreCase: true });
  eq([r.stats.additions, r.stats.deletions, r.stats.modifies], [0, 0, 0], '应视为相等');
  const strict = core.lineDiff('Hello', 'hello');
  ok(strict.stats.modifies === 1, '不忽略时应为修改');
});

test('CRLF 与混合换行', () => {
  const r = core.lineDiff('a\r\nb\r\nc', 'a\nb\nc', {});
  eq([r.stats.additions, r.stats.deletions, r.stats.modifies], [0, 0, 0], 'CRLF≈LF');
});

test('空文本与非空', () => {
  const r = core.lineDiff('', 'one\ntwo');
  eq([r.stats.additions, r.stats.deletions], [2, 0], '全为新增');
  eq(core.lineDiff('', '').items.length, 0, '双空');
});

test('超 D 上限回退不炸且覆盖全行', () => {
  const a = Array.from({ length: 1200 }, (_, i) => `A${i}`).join('\n');
  const b = Array.from({ length: 1200 }, (_, i) => `B${i}`).join('\n');
  const r = core.lineDiff(a, b);
  eq(r.stats.aLines, 1200, 'A 行数');
  eq(r.stats.bLines, 1200, 'B 行数');
  ok(r.stats.deletions + r.stats.modifies >= 1190, '应识别为大块变更');
});

test('buildHunks：相邻变更合并 + 上下文行', () => {
  const r = core.lineDiff('a\nb\nc\nd\ne\nf\ng\nh\ni\nj', 'a\nb\nX\nd\ne\nf\nY\nh\ni\nj');
  const built = core.buildHunks(r.items, 2, 400);
  eq(built.hunks.length, 1, '相距 3 行的两个变更在 ctx=2 下应合并为一个 hunk');
  ok(built.hunks[0].lines.length >= 8, '含上下文');
  const built2 = core.buildHunks(r.items, 0, 400);
  ok(built2.hunks.length >= 1 && built2.hunks[0].lines.length < built.hunks[0].lines.length, 'ctx=0 更短');
});

test('buildHunks：输出行数上限截断标注', () => {
  const a = Array.from({ length: 60 }, (_, i) => `v${i}`).join('\n');
  const b = Array.from({ length: 60 }, (_, i) => (i % 2 ? `w${i}` : `v${i}`)).join('\n');
  const r = core.lineDiff(a, b);
  const built = core.buildHunks(r.items, 0, 20);
  ok(built.truncated, '应标注截断');
  ok(built.stats.lines <= 20, '行数受限');
});

test('makeUnifiedPatch：格式与行内容', () => {
  const r = core.lineDiff('a\nb\nc\nd\ne\nf\ng\nh', 'a\nb\nX\nd\ne\nf\ng\nh');
  const p = core.makeUnifiedPatch(r.items, 2, 'a.txt', 'b.txt', 400);
  ok(p.patch.startsWith('--- a.txt\n+++ b.txt'), '头两行');
  ok(p.patch.includes('@@ -'), 'hunk 头');
  ok(p.patch.split('\n').some((l) => l === '-c'), '删除行');
  ok(p.patch.split('\n').some((l) => l === '+X'), '新增行');
  ok(p.patch.split('\n').some((l) => l === ' a'), '上下文行');
});

test('buildSideBySide：删/增配对成行', () => {
  const r = core.lineDiff('a\nb', 'a\nc');
  const rows = core.buildSideBySide(r.items);
  eq(rows.length, 2, '两行');
  const last = rows[1];
  ok(last.left && last.left.type === 'modify', '左为 modify');
  ok(last.right && last.right.type === 'modify', '右为 modify');
});

/* ============================ JSON 语义 diff ============================ */

test('键序无关 → 零差异', () => {
  const r = core.semanticJsonDiff({ a: 1, b: [1, 2], c: { x: 's' } }, { c: { x: 's' }, b: [1, 2], a: 1 });
  eq(r.changes.length, 0, '应零差异');
  eq([r.stats.added, r.stats.removed, r.stats.changed, r.stats.order], [0, 0, 0, 0], '统计');
});

test('标量改值：路径 + 旧值→新值', () => {
  const r = core.semanticJsonDiff({ version: '1.0.0', deep: { port: 8080 } }, { version: '1.1.0', deep: { port: 9090 } });
  eq(r.stats.changed, 2, '两处');
  const port = r.changes.find((c) => c.path === '$.deep.port');
  ok(port, '路径应精确');
  eq([port.oldText, port.newText], ['8080', '9090'], '值');
});

test('对象键增删', () => {
  const r = core.semanticJsonDiff({ keep: 1, gone: 2 }, { keep: 1, fresh: 3 });
  eq(r.stats.removed, 1, '删一');
  eq(r.stats.added, 1, '增一');
  ok(r.changes.some((c) => c.type === 'removed' && c.path === '$.gone'), 'gone 删除');
  ok(r.changes.some((c) => c.type === 'added' && c.path === '$.fresh'), 'fresh 新增');
});

test('对象数组按内容对齐：重排 + 改字段只报真实变更', () => {
  const A = { list: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }] };
  const B = { list: [{ id: 'c', v: 3 }, { id: 'a', v: 1 }, { id: 'b', v: 99 }] };
  const r = core.semanticJsonDiff(A, B);
  eq(r.stats.changed, 1, '只应报 v 的变更');
  eq(r.changes[0].path, '$.list[1].v', '按 A 侧位置索引，[1] 即 k=y 项');
  eq([r.changes[0].oldText, r.changes[0].newText], ['2', '99'], '值');
});

test('标量数组纯重排 → 一条顺序提示', () => {
  const r = core.semanticJsonDiff({ arr: [1, 2, 3, 4] }, { arr: [4, 1, 2, 3] });
  eq(r.stats.order, 1, 'order=1');
  eq(r.stats.added + r.stats.removed + r.stats.changed, 0, '无其他差异');
});

test('对象数组纯重排（元素全等）→ 顺序提示', () => {
  const A = { l: [{ k: 1 }, { k: 2 }] };
  const B = { l: [{ k: 2 }, { k: 1 }] };
  const r = core.semanticJsonDiff(A, B);
  eq(r.stats.order, 1, 'order=1');
});

test('数组增删对齐（中间插入不惊动后续）', () => {
  const A = { s: ['alpha', 'beta', 'gamma'] };
  const B = { s: ['alpha', 'beta2', 'beta', 'gamma'] };
  const r = core.semanticJsonDiff(A, B);
  eq(r.stats.changed, 0, '等值 LCS 下 beta 精确配对，beta2 纯新增');
  eq(r.stats.added, 1, '多出的一个');
  eq(r.stats.removed, 0, '不误报删除');
});

test('数组相似项配对（无等值可配时）', () => {
  const A = { s: ['timeout: 30s', 'other'] };
  const B = { s: ['timeout: 60s', 'other'] };
  const r = core.semanticJsonDiff(A, B);
  eq(r.stats.changed, 1, '相似串应配对为修改而非增删');
});

test('arrayAlign:false 走位置对齐', () => {
  const r = core.semanticJsonDiff({ l: [1, 2, 3] }, { l: [3, 1, 2] }, { arrayAlign: false });
  eq(r.stats.changed, 3, '逐位比较三处全变');
});

test('ignorePaths：精确路径', () => {
  const A = { meta: { ts: 1, v: 1 } };
  const B = { meta: { ts: 9, v: 1 } };
  const r = core.semanticJsonDiff(A, B, { ignorePaths: ['$.meta.ts'] });
  eq(r.changes.length, 0, '应被忽略');
});

test('ignorePaths：[*] 通配', () => {
  const A = { items: [{ id: 1, ts: 1 }, { id: 2, ts: 2 }] };
  const B = { items: [{ id: 1, ts: 99 }, { id: 2, ts: 99 }] };
  const r = core.semanticJsonDiff(A, B, { ignorePaths: ['$.items[*].ts'] });
  eq(r.changes.length, 0, '全部忽略');
  const r2 = core.semanticJsonDiff(A, B, { ignorePaths: ['$.items[0].ts'] });
  eq(r2.stats.changed, 1, '只忽略第一项');
});

test('ignorePaths：** 深层通配', () => {
  const A = { a: { b: { traceId: 'x', n: 1 } }, traceId: 'y' };
  const B = { a: { b: { traceId: 'z', n: 1 } }, traceId: 'w' };
  const r = core.semanticJsonDiff(A, B, { ignorePaths: ['$.**.traceId'] });
  eq(r.changes.length, 0, '深层+浅层都忽略');
});

test('类型差异标注（1 vs "1"）', () => {
  const r = core.semanticJsonDiff({ n: 1 }, { n: '1' });
  eq(r.stats.changed, 1, '算变更');
  ok(r.changes[0].note && r.changes[0].note.includes('类型'), '应有类型 note');
});

test('容器类型不同（对象↔数组）', () => {
  const r = core.semanticJsonDiff({ x: { a: 1 } }, { x: [1] });
  eq(r.stats.changed, 1, '一处');
  ok(r.changes[0].note && r.changes[0].note.includes('容器'), '容器 note');
});

test('超大数组回退位置对齐不炸', () => {
  const a = Array.from({ length: 600 }, (_, i) => ({ id: i, v: i }));
  const b = Array.from({ length: 600 }, (_, i) => ({ id: i, v: i === 599 ? 999 : i }));
  const r = core.semanticJsonDiff(a, b, { ignorePaths: ['$[*].id'] });
  eq(r.stats.changed, 1, '只改了最后一个');
  eq(r.changes[0].path, '$[599].v', '位置路径');
});

test('parseJsonLoose：错误行列定位', () => {
  const r = core.parseJsonLoose('{\n  "a": 1,\n  "b": ]\n}');
  ok(!r.ok, '应失败');
  eq(r.error.line, 3, '行');
  ok(r.error.col > 0, '列');
});

test('parseJsonLoose：BOM 剥离与空白容错', () => {
  const r = core.parseJsonLoose('\uFEFF\n{"a": 1}\n');
  ok(r.ok, 'BOM+空白应可解析');
  eq(r.value.a, 1, '值');
});

test('parseJsonLoose：空内容报错', () => {
  const r = core.parseJsonLoose('   ');
  ok(!r.ok && r.error.msg.includes('空'), '应报空');
});

/* ============================ canonical / similarity ============================ */

test('canonical 键序无关且递归', () => {
  eq(core.canonical({ b: 1, a: [2, { y: 1, x: 2 }] }), core.canonical({ a: [2, { x: 2, y: 1 }], b: 1 }), '规范化相等');
  ok(core.canonical({ a: 1 }) !== core.canonical({ a: 2 }), '不同值规范化不等');
});

test('similarity 阈值行为', () => {
  ok(core.similarity('timeout: 30s', 'timeout: 60s') >= 0.5, '相似');
  ok(core.similarity('abc', 'xyz') < 0.5, '无关');
  eq(core.similarity('same', 'same'), 1, '全等');
});

/* ============================ 目录对比 ============================ */

test('dirDiffTrees：same/changed/only/dir', () => {
  const A = [
    { path: 'same.txt', kind: 'file', size: 10, mtimeMs: 1000 },
    { path: 'diff.txt', kind: 'file', size: 20, mtimeMs: 1000 },
    { path: 'onlyA.txt', kind: 'file', size: 5, mtimeMs: 1000 },
    { path: 'lib', kind: 'dir', size: 0, mtimeMs: 1000 },
  ];
  const B = [
    { path: 'same.txt', kind: 'file', size: 10, mtimeMs: 1000 },
    { path: 'diff.txt', kind: 'file', size: 21, mtimeMs: 1000 },
    { path: 'onlyB.txt', kind: 'file', size: 5, mtimeMs: 1000 },
    { path: 'lib', kind: 'dir', size: 0, mtimeMs: 1000 },
  ];
  const r = core.dirDiffTrees(A, B);
  eq(r.same, 1, 'same');
  eq(r.changed.length, 1, 'changed');
  eq(r.changed[0], 'diff.txt', 'changed 路径');
  eq(r.onlyLeft.length, 1, 'onlyLeft');
  eq(r.onlyRight.length, 1, 'onlyRight');
  eq(r.dirCount, 1, 'dir');
});

test('dirDiffTrees：sha256 判同/判异', () => {
  const mk = (sha) => ({ path: 'f', kind: 'file', size: 10, mtimeMs: 0, sha256: sha });
  eq(core.dirDiffTrees([mk('aa')], [mk('aa')]).same, 1, '同哈希');
  eq(core.dirDiffTrees([mk('aa')], [mk('bb')]).changed.length, 1, '异哈希');
});

test('dirDiffTrees：同大小无哈希按 mtime 容差', () => {
  const mk = (mt) => ({ path: 'f', kind: 'file', size: 10, mtimeMs: mt });
  eq(core.dirDiffTrees([mk(1000)], [mk(1500)]).same, 1, '2s 内视为同');
  eq(core.dirDiffTrees([mk(1000)], [mk(99000)]).unknown, 1, '差异大且无哈希 → 未知');
});

/* ============================ SSRF 围栏（纯函数） ============================ */

test('fenceUrl：协议拒绝', () => {
  ok(!fenceUrl('file:///etc/passwd').ok, 'file');
  ok(!fenceUrl('ftp://x/').ok, 'ftp');
  ok(!fenceUrl('gopher://x/').ok, 'gopher');
  ok(!fenceUrl('not a url').ok, '烂串');
});

test('fenceUrl：私网/回环/元数据拒绝', () => {
  for (const u of [
    'http://127.0.0.1/', 'http://127.3.4.5/', 'http://localhost/', 'http://a.localhost/',
    'http://10.0.0.1/', 'http://172.16.0.1/', 'http://172.31.255.1/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0/', 'http://100.64.0.1/',
    'http://[::1]/', 'http://[fe80::1]/', 'http://[fc00::1]/', 'http://224.0.0.1/',
    'http://[::ffff:10.0.0.1]/',
  ]) {
    ok(!fenceUrl(u).ok, `应拒绝：${u}`);
  }
});

test('fenceUrl：内嵌凭据拒绝', () => {
  ok(!fenceUrl('http://user:pass@example.com/').ok, '凭据');
});

test('fenceUrl：公网放行', () => {
  ok(fenceUrl('https://example.com/api?x=1').ok, 'https 域名');
  ok(fenceUrl('http://8.8.8.8/').ok, '公网 IP');
  ok(fenceUrl('http://[2606:4700::1]/').ok, '公网 IPv6');
  ok(fenceUrl('https://api.staging.example.cn:8443/v1').ok, '带端口');
});

test('isPrivateIp 边界', () => {
  ok(isPrivateIp('fc00::1') === true, 'ULA fc00::/7 私');
  ok(isPrivateIp('fd12::1') === true, 'ULA fd00::/8 私');
  ok(isPrivateIp('172.15.255.255') === false, '172.15 公网');
  ok(isPrivateIp('172.32.0.1') === false, '172.32 公网');
  ok(isPrivateIp('100.63.0.1') === false, '100.63 公网');
  ok(isPrivateIp('100.128.0.1') === false, '100.128 公网');
  ok(isPrivateIp('198.18.0.1') === true, '基准段私');
  ok(isPrivateIp('2001:db8::1') === true, '文档段私');
  ok(isPrivateIp('64:ff9b::1.2.3.4') === true, 'NAT64 拒');
});

test('sanitizeHeaders：上限与 hop-by-hop 阻断', () => {
  const out = sanitizeHeaders({ Host: 'evil', Connection: 'close', 'Accept-Encoding': 'gzip', Authorization: 'Bearer x', 'X-A': '1' });
  ok(!out.Host && !out.Connection && !out['Accept-Encoding'], '阻断保留头');
  eq(out.Authorization, 'Bearer x', '业务头透传');
  const many = {};
  for (let i = 0; i < 20; i++) many[`X-H${i}`] = String(i);
  eq(Object.keys(sanitizeHeaders(many)).length, 10, '默认 2（accept/UA）+ 用户头最多 8');
  eq(sanitizeHeaders({ 'bad name': 'x', 'good-name': 'y' })['good-name'], 'y', '非法头名跳过');
});

/* ============================ 出网代理配置 ============================ */

test('parseProxyConfig：格式解析', () => {
  eq(parseProxyConfig('127.0.0.1:7897'), { host: '127.0.0.1', port: 7897 }, '裸 host:port');
  eq(parseProxyConfig('http://127.0.0.1:7897'), { host: '127.0.0.1', port: 7897 }, '带 scheme');
  eq(parseProxyConfig('http://proxy.lan:8080/'), { host: 'proxy.lan', port: 8080 }, '带尾斜杠');
  eq(parseProxyConfig('  10.0.0.2:1080 '), { host: '10.0.0.2', port: 1080 }, '前后空白');
});

test('parseProxyConfig：非法与直连语义', () => {
  eq(parseProxyConfig(''), null, '空');
  eq(parseProxyConfig('direct'), null, 'direct');
  eq(parseProxyConfig('off'), null, 'off');
  eq(parseProxyConfig('no-port'), null, '无端口');
  eq(parseProxyConfig('host:99999'), null, '端口越界');
  eq(parseProxyConfig('host:abc'), null, '端口非数字');
});

/* ============================ 摘要函数 ============================ */

test('summarizeTextDiff 零差异结论', () => {
  const r = core.lineDiff('a', 'a');
  const s = core.summarizeTextDiff(r);
  ok(s.includes('没有差异'), '零差异文案');
});

test('summarizeJsonDiff 输出路径清单', () => {
  const r = core.semanticJsonDiff({ a: 1 }, { a: 2 });
  const s = core.summarizeJsonDiff(r);
  ok(s.includes('$.a') && s.includes('1') && s.includes('2'), '路径与值');
});

test('summarizeDirDiff 列表与统计', () => {
  const r = core.dirDiffTrees(
    [{ path: 'x', kind: 'file', size: 1, mtimeMs: 0 }],
    [{ path: 'y', kind: 'file', size: 1, mtimeMs: 0 }],
  );
  const s = core.summarizeDirDiff(r);
  ok(s.includes('< x') && s.includes('> y'), '独有标记');
});

/* ============================ 静态安全断言 ============================ */

const SCAN_FILES = [
  'shared/core.js',
  'service/main.js',
  'service/files.js',
  'service/fetcher.js',
  'service/kvclient.js',
  'mcp/server.js',
];

test('静态断言：service/mcp/shared 无写文件调用（全只读）', () => {
  const banned = /writeFileSync|writeFile\(|appendFile|unlinkSync|unlink\(|rmdirSync|rmdir\(|rmSync|rm\(|createWriteStream|truncateSync|ftruncate/;
  for (const f of SCAN_FILES) {
    const src = readFileSync(join(root, f), 'utf8');
    ok(!banned.test(src), `${f} 出现写调用`);
  }
});

test('静态断言：无外发 URL 常量（http(s):// 仅 127.0.0.1 或注释）', () => {
  for (const f of SCAN_FILES) {
    const lines = readFileSync(join(root, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = /https?:\/\//.exec(line);
      if (!m) return;
      const allowed =
        line.includes('127.0.0.1') ||
        /^\s*(\/\/|\*|\/\*)/.test(line) ||
        line.includes('example') ||
        /fenceUrl\(|应拒绝|应放行/.test(line); // 自检断言里的 URL 字面量（围栏测试，非外发）
      ok(allowed, `${f}:${i + 1} 出现可疑外发 URL：${line.trim().slice(0, 80)}`);
    });
  }
});

test('静态断言：MCP stdout 只写 JSON-RPC（协议纪律）', () => {
  const src = readFileSync(join(root, 'mcp', 'server.js'), 'utf8');
  ok(!/console\.log/.test(src), 'MCP 禁 console.log');
  const mainSrc = readFileSync(join(root, 'service', 'main.js'), 'utf8');
  ok(!/console\.log/.test(mainSrc), '服务禁 console.log');
});

test('静态断言：fetcher 具备围栏要件', () => {
  const src = readFileSync(join(root, 'service', 'fetcher.js'), 'utf8');
  ok(src.includes('isPrivateIp'), '私网判定');
  ok(src.includes('dns'), 'DNS 复检');
  ok(src.includes('authorization'), '重定向剥鉴权头');
  ok(src.includes('server.verify') || src.includes('servername'), 'TLS 校验保留');
});

/* ---------- 汇总 ---------- */
console.log(`\n通过 ${pass} 项，失败 ${failures.length} 项`);
if (failures.length) {
  process.exit(1);
}
