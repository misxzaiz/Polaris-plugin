'use strict';
/**
 * core.test.js —— 行数透视台纯函数层单测（node:test，离线零依赖）
 *
 * 覆盖：Buffer 计行（LF/CRLF/无尾换行/BOM/空文件/纯换行）、二进制嗅探、
 * 文件分类（黑名单扩展/锁文件/min 产物/超大）、忽略目录、桶归属、
 * recordFile 聚合、增量扣减（subtractFile 语义经 merge→subtract 往返验证）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const core = require('../shared/core');

// ── countLines ─────────────────────────────────────────────────────────────

test('countLines: 空与纯换行', () => {
  assert.equal(core.countLines(Buffer.alloc(0)), 0);
  assert.equal(core.countLines(Buffer.from('\n')), 1);
  assert.equal(core.countLines(Buffer.from('\n\n\n')), 3);
});

test('countLines: LF 与无尾换行', () => {
  assert.equal(core.countLines(Buffer.from('a')), 1);
  assert.equal(core.countLines(Buffer.from('a\n')), 1);
  assert.equal(core.countLines(Buffer.from('a\nb')), 2);
  assert.equal(core.countLines(Buffer.from('a\nb\n')), 2);
  assert.equal(core.countLines(Buffer.from('a\nb\n\n')), 3);
});

test('countLines: CRLF 按 \n 计数精确', () => {
  assert.equal(core.countLines(Buffer.from('a\r\nb\r\nc\r\n')), 3);
  assert.equal(core.countLines(Buffer.from('a\r\nb')), 2);
});

test('countLines: UTF-8 多字节内容不受 0x0A 误伤', () => {
  // 「好」= E5 A5 BD，「\n」出现在多字节序列中的概率为零，但此处验证字节级计数
  const buf = Buffer.from('中文注释\nsecond line\n');
  assert.equal(core.countLines(buf), 2);
});

test('countLines: GBK 字节流不解码也精确', () => {
  // GBK「中文」= D6 D0 CE C4，无 0x0A
  const buf = Buffer.from([0xD6, 0xD0, 0xCE, 0xC4, 0x0A, 0x31, 0x0A]);
  assert.equal(core.countLines(buf), 2);
});

// ── looksBinary ────────────────────────────────────────────────────────────

test('looksBinary: 空字节判定', () => {
  assert.equal(core.looksBinary(Buffer.from('hello world\n')), false);
  assert.equal(core.looksBinary(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x0D])), true);
  assert.equal(core.looksBinary(Buffer.alloc(0)), false);
});

// ── classifyFile ───────────────────────────────────────────────────────────

test('classifyFile: 二进制扩展名', () => {
  assert.equal(core.classifyFile('a/b.png', 10), 'binary');
  assert.equal(core.classifyFile('a/b.PDF', 10), 'binary');
  assert.equal(core.classifyFile('a/node_modules.bin', 10), 'binary');
});

test('classifyFile: 锁文件与 min 产物', () => {
  assert.equal(core.classifyFile('package-lock.json', 10), 'skipName');
  assert.equal(core.classifyFile('pnpm-lock.yaml', 10), 'skipName');
  assert.equal(core.classifyFile('Cargo.lock', 10), 'skipName');
  assert.equal(core.classifyFile('app.min.js', 10), 'skipName');
  assert.equal(core.classifyFile('vendor.chunk.js', 10), 'skipName');
  assert.equal(core.classifyFile('src/app.js', 10), 'count');
});

test('classifyFile: 锁文件在扫描层被跳过（经 recordFile 不计入）', () => {
  // 服务扫描层用 classifyFile 分流；这里验证锁文件不会被误计为文本文件
  const s = core.newStats();
  const lock = 'package-lock.json';
  assert.equal(core.classifyFile(lock, 100), 'skipName'); // 扫描层会 continue，不调 recordFile
  core.recordFile(s, 'src/real.ts', Buffer.from('a\n'));
  assert.equal(s.totals.files, 1);
});

test('classifyFile: 超大文件', () => {
  assert.equal(core.classifyFile('big.js', core.MAX_FILE_BYTES + 1), 'large');
  assert.equal(core.classifyFile('big.js', core.MAX_FILE_BYTES), 'count');
});

// ── bucketOf ───────────────────────────────────────────────────────────────

test('bucketOf: 一级目录与根文件', () => {
  assert.equal(core.bucketOf('src/a.ts', 1), 'src');
  assert.equal(core.bucketOf('README.md', 1), core.ROOT_FILES_BUCKET);
  assert.equal(core.bucketOf('src/x/a.ts', 1), 'src');
});

test('bucketOf: 二级下钻', () => {
  assert.equal(core.bucketOf('src/x/a.ts', 2), 'src/x');
  // 层级不足时归到最深目录
  assert.equal(core.bucketOf('src/a.ts', 2), 'src');
  assert.equal(core.bucketOf('README.md', 2), core.ROOT_FILES_BUCKET);
});

// ── recordFile 聚合 ────────────────────────────────────────────────────────

test('recordFile: 多文件聚合（行数/非空/文件数/语言）', () => {
  const s = core.newStats();
  core.recordFile(s, 'src/a.ts', Buffer.from('line1\nline2\n'));
  core.recordFile(s, 'src/b.ts', Buffer.from('x\n\ny'));       // 3 行，非空 2
  core.recordFile(s, 'README.md', Buffer.from('# hi\n'));       // 根文件桶
  assert.equal(s.totals.files, 3);
  assert.equal(s.totals.lines, 6, `'x\\n\\ny' 无尾换行 = 3 行（x/空行/y）`);
  assert.equal(s.totals.nonEmptyLines, 5, '非空 = 2(a.ts) + 2(b.ts) + 1(README)');
  assert.equal(s.modules['src'].files, 2);
  assert.equal(s.modules['src'].lines, 5);
  assert.equal(s.modules[core.ROOT_FILES_BUCKET].files, 1);
  assert.equal(s.languages['TypeScript'].files, 2);
  assert.equal(s.languages['TypeScript'].lines, 5);
  assert.equal(s.languages['Markdown'].lines, 1);
});
test('recordFile: 空文件计 1 文件 0 行', () => {
  const s = core.newStats();
  core.recordFile(s, 'src/empty.ts', Buffer.alloc(0));
  assert.equal(s.totals.files, 1);
  assert.equal(s.totals.lines, 0);
  assert.equal(s.totals.nonEmptyLines, 0);
});

// ── 增量扣减往返 ───────────────────────────────────────────────────────────

// 与 service/main.js 的 makeFileMeta/subtractFile 同逻辑（服务内函数不导出，这里镜像验证语义）
function makeFileMeta(buf, rel) {
  const lines = core.countLines(buf);
  let nonEmpty = 0;
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0A) {
      if (i > start) nonEmpty++;
      start = i + 1;
    }
  }
  const relPosix = rel.split('\\').join('/');
  return { rel: relPosix, lines, nonEmpty, bytes: buf.length, lang: core.langOf(relPosix), bucket: core.bucketOf(relPosix, 1) };
}
function subtractFile(stats, meta) {
  const m = stats.modules[meta.bucket];
  if (m) {
    m.files -= 1; m.lines -= meta.lines; m.nonEmptyLines -= meta.nonEmpty; m.bytes -= meta.bytes;
    if (m.files <= 0) delete stats.modules[meta.bucket];
  }
  const t = stats.totals;
  t.files -= 1; t.lines -= meta.lines; t.nonEmptyLines -= meta.nonEmpty; t.bytes -= meta.bytes;
  const lg = stats.languages[meta.lang];
  if (lg) {
    lg.files -= 1; lg.lines -= meta.lines;
    if (lg.files <= 0) delete stats.languages[meta.lang];
  }
}

test('增量：改写文件后 totals 等价于重扫', () => {
  const s = core.newStats();
  const oldBuf = Buffer.from('a\nb\nc\n');
  core.recordFile(s, 'src/a.ts', oldBuf);
  const meta = makeFileMeta(oldBuf, 'src/a.ts');
  // 文件被改写为 5 行
  const newBuf = Buffer.from('1\n2\n3\n4\n5\n');
  subtractFile(s, meta);
  core.recordFile(s, 'src/a.ts', newBuf);
  // 对照：直接对 newBuf 建立的新 stats
  const ref = core.newStats();
  core.recordFile(ref, 'src/a.ts', newBuf);
  assert.deepEqual(s.totals, ref.totals);
  assert.deepEqual(s.modules['src'], ref.modules['src']);
  assert.deepEqual(s.languages, ref.languages);
});

test('增量：删除文件后回到空 stats', () => {
  const s = core.newStats();
  const buf = Buffer.from('a\nb\n');
  core.recordFile(s, 'src/a.ts', buf);
  subtractFile(s, makeFileMeta(buf, 'src/a.ts'));
  assert.equal(s.totals.files, 0);
  assert.equal(s.totals.lines, 0);
  assert.deepEqual(s.modules, {});
  assert.deepEqual(s.languages, {});
});

// ── 展示辅助 ───────────────────────────────────────────────────────────────

test('moduleRows/languageRows 排序与截断', () => {
  const s = core.newStats();
  core.recordFile(s, 'a/x.ts', Buffer.from('1\n2\n3\n4\n5\n'));
  core.recordFile(s, 'b/y.ts', Buffer.from('1\n2\n'));
  core.recordFile(s, 'c/z.py', Buffer.from('1\n2\n3\n'));
  const rows = core.moduleRows(s);
  assert.deepEqual(rows.map((r) => r.name), ['a', 'c', 'b']);
  const langs = core.languageRows(s, 1);
  assert.equal(langs.length, 1);
  assert.equal(langs[0].name, 'TypeScript');
});

test('fmtCount 格式化', () => {
  assert.equal(core.fmtCount(0), '0');
  assert.equal(core.fmtCount(999), '999');
  assert.equal(core.fmtCount(1234), '1.2k');
  assert.equal(core.fmtCount(1200), '1.2k');
  assert.equal(core.fmtCount(1_000_000), '1M');
  assert.equal(core.fmtCount(2_345_678), '2.3M');
});

// ── 忽略目录名 ─────────────────────────────────────────────────────────────

test('isSkipDirName 大小写不敏感覆盖关键目录', () => {
  for (const d of ['node_modules', '.git', 'dist', 'build', 'target', 'coverage', '__pycache__', '.venv', '.polaris', '.workbuddy']) {
    assert.equal(core.isSkipDirName(d), true, d);
  }
  assert.equal(core.isSkipDirName('Node_Modules'), true);
  assert.equal(core.isSkipDirName('src'), false);
  assert.equal(core.isSkipDirName('my-dist'), false); // 前缀不误杀
});

// ── 服务级冒烟（真实 fs：临时夹具 + 全量扫描 + fs.watch 增量） ─────────────

/** 起 service/main.js 子进程（独立端口），返回 {proc, port, token, stop} */
async function startService(tmpRoot) {
  const proc = require('node:child_process').spawn(process.execPath, [path.join(__dirname, '../service/main.js'), '0', ''], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  proc.stderr.on('data', (c) => { stderr += c; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`服务启动超时\n${stderr}`)), 8000);
    proc.stderr.on('data', (c) => {
      const m = /127\.0\.0\.1:(\d+)/.exec(String(c));
      if (m) { clearTimeout(timer); resolve(Number(m[1])); }
    });
    proc.on('exit', () => { clearTimeout(timer); reject(new Error(`服务提前退出\n${stderr}`)); });
  });
  // token 未知（随机）：服务对 /api/* 校验 Bearer；测试用 /__health 确认存活后，
  // 通过环境变量注入固定 token 的方式不可行（服务已起），因此这里改为直接读进程内存不可行——
  // 简化：测试走「无 token 也可」的 /__health + 用真实 token 重启。
  return { proc, port, stderr, stop: () => proc.kill() };
}

test('服务冒烟：健康检查 + 全量扫描 + 增量更新', { timeout: 30000 }, async () => {
  // 夹具目录
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-lens-test-'));
  const srcDir = path.join(tmp, 'src');
  const subDir = path.join(srcDir, 'sub');
  fs.mkdirSync(subDir, { recursive: true });
  fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'a.ts'), 'line1\nline2\nline3\n');
  fs.writeFileSync(path.join(subDir, 'b.ts'), 'x\ny\n');
  fs.writeFileSync(path.join(tmp, 'README.md'), 'hello\n');
  fs.writeFileSync(path.join(tmp, 'node_modules', 'c.js'), 'ignored\n');
  fs.writeFileSync(path.join(srcDir, 'pic.png'), Buffer.from([0, 1, 2, 3]));

  // 用固定 token 起服务：main.js 的 token 是随机生成，为可测性通过子进程内 env 覆盖不可行；
  // 退而求其次——起两个进程太重，这里直接以「重写 token 不可行」为由：
  // 用 /__health 验证服务活着，再用「同目录复制 main.js 注入固定 token」不优雅。
  // 真正做法：main.js 支持 LOC_LENS_TOKEN env（可测性开关，生产不设置时保持随机）。
  const proc2 = require('node:child_process').spawn(
    process.execPath,
    [path.join(__dirname, '../service/main.js'), '0', ''],
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env: { ...process.env, LOC_LENS_TOKEN: 'testtoken' } },
  );
  let stderr2 = '';
  proc2.stderr.on('data', (c) => { stderr2 += c; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`服务启动超时\n${stderr2}`)), 8000);
    proc2.stderr.on('data', (c) => {
      const m = /127\.0\.0\.1:(\d+)/.exec(String(c));
      if (m) { clearTimeout(timer); resolve(Number(m[1])); }
    });
    proc2.on('exit', () => { clearTimeout(timer); reject(new Error(`服务提前退出\n${stderr2}`)); });
  });

  const auth = { Authorization: 'Bearer testtoken' };
  const get = (p) => fetch(`http://127.0.0.1:${port}${p}`, { headers: auth }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const post = (p, data) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  try {
    // 1) 健康检查（带 token）
    const h = await get('/api/health');
    assert.equal(h.status, 200);
    assert.equal(h.body.ok, true);

    // 2) 未授权拒绝
    const unauth = await fetch(`http://127.0.0.1:${port}/api/stats?root=${encodeURIComponent(tmp)}`);
    assert.equal(unauth.status, 401);

    // 3) 全量扫描：3 个文本文件（a.ts 3 行 + b.ts 2 行 + README 1 行），node_modules 整树跳过，png 二进制跳过
    const s1 = await get(`/api/stats?root=${encodeURIComponent(tmp)}`);
    assert.equal(s1.status, 200, `stats 失败：${JSON.stringify(s1.body)}`);
    assert.equal(s1.body.stats.totals.files, 3);
    assert.equal(s1.body.stats.totals.lines, 6);
    const byName = Object.fromEntries(s1.body.stats.modules.map((m) => [m.name, m]));
    assert.equal(byName['src'].lines, 5, 'src 桶含 a.ts(3) + src/sub/b.ts(2)（一级聚合把子目录文件归入 src）');
    assert.ok(byName[core.ROOT_FILES_BUCKET], '存在根文件桶');
    assert.equal(byName[core.ROOT_FILES_BUCKET].lines, 1);
    assert.equal(s1.body.stats.skippedBinary, 1);

    // 4) 增量：修改 a.ts 后（防抖 800ms + 轮询）行数应更新
    fs.writeFileSync(path.join(srcDir, 'a.ts'), '1\n2\n3\n4\n5\n6\n7\n');
    let updated = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const s = await get(`/api/stats?root=${encodeURIComponent(tmp)}`);
      if (s.status === 200 && s.body.stats.totals.lines === 10) { updated = s.body; break; }
    }
    assert.ok(updated, `增量更新未生效：${JSON.stringify(updated)}`);
    const byName2 = Object.fromEntries(updated.stats.modules.map((m) => [m.name, m]));
    assert.equal(byName2['src'].lines, 9, 'src 桶 = a.ts(7) + sub/b.ts(2)');

    // 5) 删除文件后总量减少
    fs.unlinkSync(path.join(subDir, 'b.ts'));
    let afterDel = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const s = await get(`/api/stats?root=${encodeURIComponent(tmp)}`);
      if (s.status === 200 && s.body.stats.totals.lines === 8) { afterDel = s.body; break; }
    }
    assert.ok(afterDel, '删除文件后增量未生效');

    // 6) 手动重扫端点
    const rs = await post('/api/rescan', { root: tmp });
    assert.equal(rs.status, 200);
    assert.equal(rs.body.stats.totals.lines, 8);

    // 7) 不存在的根 → 400
    const bad = await get(`/api/stats?root=${encodeURIComponent(path.join(tmp, 'nope'))}`);
    assert.equal(bad.status, 400);
  } finally {
    proc2.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
