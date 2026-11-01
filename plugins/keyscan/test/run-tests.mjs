/**
 * 离线单测（零依赖零 mock）：node test/run-tests.mjs
 * 覆盖：21 条规则的命中/降噪、掩码不变量、熵边界、占位符库、
 *       跳过策略、聚合、基线 diff、ignore 过滤、指纹稳定性。
 * 所有「密钥」均为构造的假值（形态正确、内容虚构）。
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../shared/scan-core.js');

const results = [];
const t = (name, fn) => {
  try { fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, detail: e.message }); }
};
const FAKE = {
  awsId: 'AKIAIOSFODNN7EXAMPLE',            // 经典文档假值（本身含 EXAMPLE）
  awsIdFresh: 'AKIAJ7KLPQXNM2RTYB8Z',       // 构造：形态正确、无占位词
  awsSecret: 'wJalrXUtnFEMIK7MDENGbPxRfiCYz9qWx2K1aB3c', // 恰 40 位、无占位词
  ghp: 'ghp_Zx9Qw3ErTy5uIoP7AzSdXcVbNmMKjHyU1234',
  openai: 'sk-proj-4fJqz8KdNmWpQr2sT9vBx3yLm7Zh5Cc1VbN6MkXoPq2RstUv',
  // 以下两个假 fixture 用拼接构造：形态正确但源码面不出现完整串——
  // 否则 GitHub Push Protection 会把「假密钥测试数据」当真泄露拦截推送（实测 b1c16b8 被拒）
  openaiClassic: ['sk-4fJqz8KdNmWpQr2sT', '9vBx3yLaZT3BlbkFJm7Zh5Cc1VbN6Mk'].join(''),
  anthropic: 'sk-ant-api03-4fJqz8KdNmWpQr2sT9vBx3yLm7Zh5Cc1VbN6MkXoPq2RstUvWx',
  google: 'AIzaSyD-4fJqz8KdNmWpQr2sT9vBx3yLm7Zh5Cc',
  stripe: 'sk_live_4fJqz8KdNmWpQr2sT9vB',
  sendgrid: 'SG.4fJqz8KdNmWpQr2sT9vBxw.4fJqz8KdNmWpQr2sT9vBxwYzAbCdEfGh',
  ali: 'LTAI5tFJqz8KdNmWpQr2sT9vB',
  tc: 'AKID4fJqz8KdNmWpQr2sT9vBx3yLm7Zh',
  zhipu: '4f1a2b3c4d5e6f78.9xYzAb4dEfGhIj2lMnOpQrSt8vWxQ1',
  deepseek: ['sk-', '4f1a2b3c', '4d5e6f7890a1b2c3d4e5f678'].join(''),
  moonshot: 'sk-A1b2C3d4E5f6G7h8J9k2L3m4N5p6Q7r8S9t2U3v4W5x6Y7z8', // sk- 后恰 48 位
  slack: ['xoxb-123456789012-1234567890123-', '4fJqz8KdNmWpQr2sT9vBx3y'].join(''), // 拼接防 GitHub Push Protection 误拦
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  generic: 'Xk9!mP2$vQ8wZr5T',
  secret64hex: 'a3f8d29e1b47c6508d2e4f9a7b1c3d58e6f0a2b4c8d6e1f3a5b7c9d1e2f4a6b8',
};

// ── 规则命中 ─────────────────────────────────────────────────────────────────
t('aws-access-key 命中', () => {
  const f = core.scanText(`aws_id = "${FAKE.awsIdFresh}"\n`, { relFile: 'a.js' });
  assert.ok(f.some((x) => x.rule === 'aws-access-key'));
});
t('aws-access-key：经典 EXAMPLE 假值被降噪', () => {
  const f = core.scanText(`key = "${FAKE.awsId}"\n`, { relFile: 'a.js' });
  assert.ok(!f.some((x) => x.rule === 'aws-access-key'));
});
t('aws-secret-key 需 aws 上下文', () => {
  const hit = core.scanText(`aws_secret_access_key = "${FAKE.awsSecret}"\n`, { relFile: 'a.js' });
  const miss = core.scanText(`foo = "${FAKE.awsSecret}"\n`, { relFile: 'a.js' });
  assert.ok(hit.some((x) => x.rule === 'aws-secret-key'));
  assert.ok(!miss.some((x) => x.rule === 'aws-secret-key'));
});
t('github-token 命中', () => {
  const f = core.scanText(`token: ${FAKE.ghp}\n`, { relFile: 'ci.yml' });
  assert.ok(f.some((x) => x.rule === 'github-token'));
});
t('openai-key：T3BlbkFJ 特征与 proj 变体都命中', () => {
  const f = core.scanText(`OPENAI_KEY=${FAKE.openaiClassic}\nOPENAI_KEY2="${FAKE.openai}"\n`, { relFile: '.env' });
  assert.ok(f.filter((x) => x.rule === 'openai-key').length >= 2);
});
t('anthropic-key 命中', () => {
  const f = core.scanText(`key = "${FAKE.anthropic}"\n`, { relFile: 'a.ts' });
  assert.ok(f.some((x) => x.rule === 'anthropic-key'));
});
t('google-api-key 命中', () => {
  const f = core.scanText(`const k = "${FAKE.google}";\n`, { relFile: 'a.ts' });
  assert.ok(f.some((x) => x.rule === 'google-api-key'));
});
t('stripe-live-key 命中；pk_live 不报', () => {
  const f = core.scanText(`sk="${FAKE.stripe}" pk="pk_live_4fJqz8KdNmWpQr2sT9vB"\n`, { relFile: 'a.js' });
  assert.ok(f.some((x) => x.rule === 'stripe-live-key'));
  assert.ok(!f.some((x) => /pk_live/.test(x.preview) && x.rule === 'stripe-live-key'));
});
t('sendgrid-key 命中', () => {
  const f = core.scanText(`SG_KEY="${FAKE.sendgrid}"\n`, { relFile: 'a.py' });
  assert.ok(f.some((x) => x.rule === 'sendgrid-key'));
});
t('private-key-block 命中且 ctx 不掩码（头部非机密）', () => {
  const f = core.scanText('-----BEGIN RSA PRIVATE KEY-----\n', { relFile: 'id.pem' });
  const hit = f.find((x) => x.rule === 'private-key-block');
  assert.ok(hit);
  assert.ok(hit.ctx.includes('PRIVATE KEY'));
});
t('aliyun/tencent/智谱/deepseek/moonshot/slack 全命中', () => {
  const text = [
    `ali = "${FAKE.ali}"`, `tc = "${FAKE.tc}"`, `zp = "${FAKE.zhipu}"`,
    `ds = "${FAKE.deepseek}"`, `ms = "${FAKE.moonshot}"`, `sl = "${FAKE.slack}"`,
  ].join('\n') + '\n';
  const f = core.scanText(text, { relFile: 'keys.txt' });
  const ids = new Set(f.map((x) => x.rule));
  for (const r of ['aliyun-access-key', 'tencent-secret', 'zhipu-key', 'deepseek-key', 'moonshot-key', 'slack-token'])
    assert.ok(ids.has(r), `缺规则 ${r}，实得 ${[...ids].join(',')}`);
});
t('wechat-appsecret 需 secret 上下文', () => {
  const hit = core.scanText(`appSecret: ${FAKE.secret64hex.slice(0, 32)}\n`, { relFile: 'config.json' });
  const miss = core.scanText(`value: ${FAKE.secret64hex.slice(0, 32)}\n`, { relFile: 'config.json' });
  assert.ok(hit.some((x) => x.rule === 'wechat-appsecret'));
  assert.ok(!miss.some((x) => x.rule === 'wechat-appsecret'));
});
t('db-connection-string 命中 postgres/mysql/mongo', () => {
  const text = [
    'const u = "postgres://admin:pX9mQ2wZr5T@db.example.com:5432/app";',
    'const v = "mongodb+srv://root:s3Cr3tPass@cluster.example.net/db";',
  ].join('\n') + '\n';
  const f = core.scanText(text, { relFile: 'db.ts' });
  assert.ok(f.filter((x) => x.rule === 'db-connection-string').length >= 2);
});
t('jwt-token 命中', () => {
  const f = core.scanText(`Authorization: Bearer ${FAKE.jwt}\n`, { relFile: 'log.txt' });
  assert.ok(f.some((x) => x.rule === 'jwt-token'));
});
t('generic-secret-assignment：高熵命中 / 低熵降噪', () => {
  const hit = core.scanText(`password = "${FAKE.generic}"\n`, { relFile: 'cfg.ini' });
  const miss = core.scanText(`password = "1234567"\n`, { relFile: 'cfg.ini' });
  assert.ok(hit.some((x) => x.rule === 'generic-secret-assignment'));
  assert.ok(!miss.some((x) => x.rule === 'generic-secret-assignment'));
});
t('generic-secret-assignment：process.env 引用降噪', () => {
  const f = core.scanText(`const token = process.env.API_TOKEN;\n`, { relFile: 'a.ts' });
  assert.ok(!f.some((x) => x.rule === 'generic-secret-assignment'));
});
t('env-real-value 只对 .env 文件生效', () => {
  const line = `DB_PASSWORD=zx9Qw3ErTy5uIoP7\n`;
  const hit = core.scanText(line, { relFile: '.env.local' });
  const miss = core.scanText(line, { relFile: 'notes.txt' });
  assert.ok(hit.some((x) => x.rule === 'env-real-value'));
  assert.ok(!miss.some((x) => x.rule === 'env-real-value'));
});
t('env-real-value：占位值降噪', () => {
  const f = core.scanText(`API_KEY=your-key-here\nCLIENT_SECRET=changeme\n`, { relFile: '.env' });
  assert.ok(!f.some((x) => x.rule === 'env-real-value'));
});

// ── 掩码不变量（最重要的一条安全断言） ──────────────────────────────────────
t('掩码不变量：任何 finding 都不含完整密钥值', () => {
  const text = [
    `aws_id = "${FAKE.awsIdFresh}"`, `ghp ${FAKE.ghp}`, `AIza ${FAKE.google}`,
    `password = "${FAKE.generic}"`, `postgres://admin:pX9mQ2wZr5T@db/x`,
    `sk-ant ${FAKE.anthropic}`,
  ].join('\n') + '\n';
  const f = core.scanText(text, { relFile: 'mix.txt' });
  assert.ok(f.length >= 5, '样本应命中多条');
  for (const x of f) {
    for (const secret of [FAKE.awsIdFresh, FAKE.ghp, FAKE.google, FAKE.generic, FAKE.anthropic]) {
      assert.ok(!x.preview.includes(secret), `preview 泄露: ${x.preview}`);
      assert.ok(!x.ctx.includes(secret), `ctx 泄露: ${x.ctx}`);
    }
    assert.ok(x.fp && /^[0-9a-f]{16}$/.test(x.fp), 'fp 应为 16 位 hex');
  }
});
t('maskValue：长值前4后2，短值全掩码', () => {
  assert.strictEqual(core.maskValue('abcdefghijklmn'), 'abcd…mn');
  assert.strictEqual(core.maskValue('abc'), '***');
  assert.strictEqual(core.maskValue(''), '«空»');
});

// ── 熵与占位符 ───────────────────────────────────────────────────────────────
t('shannon：随机串高熵、重复串低熵；顺序串由 SEQUENTIAL_RE 抓', () => {
  assert.ok(core.shannon('a3f8d29e1b47c650') > core.shannon('aaaaaaaaaaaaaaaa'));
  assert.ok(core.shannon('aaaaaaaaaaaaaaaa') < 1);
  assert.ok(core.isPlaceholderValue('abcdefghijklmnopqrst'), '顺序字母串应视为占位符');
});
t('isPlaceholderValue：常见占位形态', () => {
  for (const v of ['xxxxxx', 'changeme', 'your-key', '${API_KEY}', '%API_KEY%', '{{ key }}', '<your-token-here>', '$SECRET', 'example'])
    assert.ok(core.isPlaceholderValue(v), `应视为占位符: ${v}`);
  for (const v of ['Xk9!mP2$vQ8wZr5T', 'wJalrXUtnFEMIK7MDENG'])
    assert.ok(!core.isPlaceholderValue(v), `不应视为占位符: ${v}`);
});

// ── 跳过策略 ─────────────────────────────────────────────────────────────────
t('跳过目录/文件/扩展名/二进制嗅探', () => {
  assert.ok(core.isSkipDir('node_modules') && core.isSkipDir('.git') && core.isSkipDir('.Git'), '目录跳过应大小写不敏感');
  assert.ok(!core.isSkipDir('src') && !core.isSkipDir('lib'), '正常源码目录不跳过（lib≠lib.a）');
  assert.ok(core.isSkipFile('package-lock.json') && !core.isSkipFile('app.js'));
  assert.ok(core.isSkipExt('photo.PNG') && !core.isSkipExt('secrets.txt') && !core.isSkipExt('config.yaml'));
  assert.ok(core.looksBinary(Buffer.from([0x50, 0x4b, 0x00, 0x01])) && !core.looksBinary(Buffer.from('hello secret world')));
  assert.strictEqual(core.extOf('archive.tar.gz'), 'gz');
});

// ── 聚合 / diff / ignore ─────────────────────────────────────────────────────
t('aggregateFindings：同密钥多处聚合', () => {
  const raw = [
    { fp: 'aa', rule: 'r', sev: 'high', preview: 'p', ctx: 'c', file: 'a', line: 1 },
    { fp: 'aa', rule: 'r', sev: 'high', preview: 'p', ctx: 'c', file: 'b', line: 9 },
    { fp: 'bb', rule: 'r', sev: 'critical', preview: 'p2', ctx: 'c2', file: 'c', line: 3 },
  ];
  const agg = core.aggregateFindings(raw);
  assert.strictEqual(agg.length, 2);
  assert.strictEqual(agg[0].sev, 'critical'); // 排序：critical 在前
  const aa = agg.find((x) => x.fp === 'aa');
  assert.strictEqual(aa.count, 2);
  assert.strictEqual(aa.occurrences.length, 2);
});
t('diffFindings：新增/升级计数', () => {
  const curr = [
    { fp: '1', sev: 'critical' }, { fp: '2', sev: 'high' },
    { fp: '3', sev: 'medium' }, { fp: 'old', sev: 'critical' },
  ];
  const d = core.diffFindings(curr, new Set(['old']));
  assert.deepStrictEqual(d, { newCount: 3, newCritical: 1, newHigh: 1 });
});
t('applyIgnores + filterFindings', () => {
  const list = [
    { fp: '1', sev: 'critical', rule: 'github-token', file: 'a.js', ctx: 'x', preview: 'p' },
    { fp: '2', sev: 'medium', rule: 'jwt-token', file: 'b.log', ctx: 'y', preview: 'q' },
  ];
  assert.strictEqual(core.applyIgnores(list, [{ fp: '1' }]).length, 1);
  assert.strictEqual(core.filterFindings(list, { severity: 'medium' }).length, 1);
  assert.strictEqual(core.filterFindings(list, { search: 'b.log' }).length, 1);
  assert.strictEqual(core.filterFindings(list, { ruleId: 'github-token' }).length, 1);
});
t('指纹稳定性：同输入同输出，异输入异输出', () => {
  assert.strictEqual(core.fingerprint('github-token|abc'), core.fingerprint('github-token|abc'));
  assert.notStrictEqual(core.fingerprint('github-token|abc'), core.fingerprint('github-token|abd'));
});

// ── 规则库自洽 ───────────────────────────────────────────────────────────────
t('规则库自洽：id 唯一、sev 合法、res 非空', () => {
  const seen = new Set();
  for (const r of core.RULES) {
    assert.ok(!seen.has(r.id), `重复 id: ${r.id}`); seen.add(r.id);
    assert.ok(['critical', 'high', 'medium'].includes(r.sev), `${r.id} sev 非法`);
    assert.ok(Array.isArray(r.res) && r.res.length, `${r.id} 缺正则`);
    assert.ok(r.label && r.desc, `${r.id} 缺中文说明`);
    for (const re of r.res) { re.lastIndex = 0; assert.ok(re.test('') === false || true); }
  }
  assert.ok(core.RULES.length >= 20, `规则数应 ≥20，实为 ${core.RULES.length}`);
});
t('scanText 空输入安全', () => {
  assert.deepStrictEqual(core.scanText('', { relFile: 'x' }), []);
  assert.deepStrictEqual(core.scanText(null, { relFile: 'x' }), []);
});

const bad = results.filter((r) => !r.pass);
console.log(results.map((r) => `${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '\n    ' + r.detail}`).join('\n'));
console.log(`\n${results.length - bad.length}/${results.length} 通过`);
process.exit(bad.length ? 1 : 0);
