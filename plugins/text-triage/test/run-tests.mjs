/**
 * text-triage core 单元测试（node test/run-tests.mjs）
 * 引擎 shared/triage-core.js + 预设 shared/presets.js 纯离线断言。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const core = require(path.join(HERE, '..', 'shared', 'triage-core.js'));
const { BUILTIN_PIPELINES } = require(path.join(HERE, '..', 'shared', 'presets.js'));

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}

// ── 模板校验 ────────────────────────────────────────────────────────────────
console.log('\n[模板校验]');
check('非对象模板拒绝', !core.validatePipeline('x').ok);
check('classes 非数组拒绝', !core.validatePipeline({ classes: 'x' }).ok);
check('类别缺 id 拒绝', !core.validatePipeline({ classes: [{ anyOf: ['a'] }] }).ok);
check('类别重复 id 拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }, { id: 'a', anyOf: ['y'] }] }).ok);
check('anyOf 空数组拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: [] }] }).ok);
check('坏正则拒绝且带路径', (() => { const r = core.validatePipeline({ classes: [{ id: 'a', anyOf: ['re:[invalid'] }] }); return !r.ok && r.error.includes('classes[0].anyOf[0]'); })(), JSON.stringify(core.validatePipeline({ classes: [{ id: 'a', anyOf: ['re:[invalid'] }] })));
check('未知类型拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }], extract: { a: { f: { pattern: 'x', type: 'long' } } } }).ok);
check('extract 引用未定义类别拒绝', (() => { const r = core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }], extract: { typo: { f: { pattern: 'x' } } } }); return !r.ok && r.error.includes('typo'); })());
check('未知算子拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }], decide: { a: [{ when: { field: 'f', op: 'between', value: 1 }, then: { verdict: 'v' } }] } }).ok);
check('matches 坏正则拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }], decide: { a: [{ when: { field: 'f', op: 'matches', value: '([' }, then: { verdict: 'v' } }] } }).ok);
check('in 非数组拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }], decide: { a: [{ when: { field: 'f', op: 'in', value: 'abc' }, then: { verdict: 'v' } }] } }).ok);
check('then.verdict 缺失拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }], decide: { a: [{ when: { field: 'f', op: 'exists' }, then: {} }] } }).ok);
check('字面量模式配 group 拒绝', !core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }], extract: { a: { f: { pattern: 'lit', group: 1 } } } }).ok);
check('合法最小模板通过', core.validatePipeline({ classes: [{ id: 'a', anyOf: ['x'] }] }).ok);
check('未知顶层键出 info 警示', (() => { const r = core.validatePipeline({ class: [{ id: 'a', anyOf: ['x'] }], classes: [{ id: 'a', anyOf: ['x'] }] }); return r.ok && r.warnings.some((w) => w.msg.includes('class')); })(), JSON.stringify(core.validatePipeline({ class: [], classes: [{ id: 'a', anyOf: ['x'] }] })));

// ── 分类 ────────────────────────────────────────────────────────────────────
console.log('\n[分类]');
const cls = { classes: [{ id: 'err', name: '错误', anyOf: ['ERROR', 're:失败'] }, { id: 'warn', anyOf: ['WARN'] }] };
check('字面量不区分大小写命中', core.runPipeline(cls, 'xx error xx').classId === 'err');
check('按序首中即决', core.runPipeline(cls, 'ERROR and WARN').classId === 'err');
check('正则形态命中', core.runPipeline(cls, '任务失败').classId === 'err');
check('正则大小写敏感（大写 ERROR 不中 re:失败 但中字面量 ERROR）', core.runPipeline(cls, 'ERROR').classId === 'err');
check('未分类落 fallback verdict', core.runPipeline({ ...cls, fallback: { verdict: '兜底' } }, 'nothing here').decision.verdict === '兜底');
check('未分类无 fallback 用内置默认', core.runPipeline(cls, 'nothing here').decision.verdict === '未分类');
check('classifyEvidence 记录命中原文', core.runPipeline(cls, 'xx Error yy').classifyEvidence === 'Error');

// ── 抽取与类型归一 ──────────────────────────────────────────────────────────
console.log('\n[抽取与类型归一]');
const ex = {
  classes: [{ id: 'c', anyOf: ['c'] }],
  extract: {
    c: {
      a: { pattern: 're:count=(\\d+)', type: 'int' },
      f: { pattern: 're:rate=([\\d.]+)', type: 'float' },
      b: { pattern: 're:enabled=(\\w+)', type: 'bool' },
      dur: { pattern: 're:took (\\S+)', type: 'duration' },
      size: { pattern: 're:size (\\S+)', type: 'bytes' },
      when: { pattern: 're:at (\\d{4}-\\d{2}-\\d{2}T[\\d:]+Z)', type: 'date' },
      plain: { pattern: 're:user=(\\S+)', type: 'string' },
      absent: { pattern: 're:nothinghere(\\d+)', type: 'int' },
      withDefault: { pattern: 're:nope(\\d+)', type: 'int', default: 7 },
    },
  },
};
const r1 = core.runPipeline(ex, 'c: count=42 rate=0.75 enabled=true took 2m30s size 512KB at 2026-01-02T03:04:05Z user=alice');
check('int 归一', r1.fields.a === 42, JSON.stringify(r1.fields));
check('float 归一', r1.fields.f === 0.75);
check('bool true 归一', r1.fields.b === true);
check('duration 2m30s → 150000ms', r1.fields.dur === 150000, String(r1.fields.dur));
check('bytes 512KB → 524288', r1.fields.size === 524288, String(r1.fields.size));
check('date ISO → toISOString', r1.fields.when === '2026-01-02T03:04:05.000Z', String(r1.fields.when));
check('string 默认原文', r1.fields.plain === 'alice');
check('未命中字段为 null 且有警示', r1.fields.absent === null && r1.fieldMeta.absent.warn, JSON.stringify(r1.fieldMeta.absent));
check('default 兜底生效', r1.fields.withDefault === 7);
check('抽取失败不致命（整体 ok）', r1.ok === true);

const r2 = core.runPipeline({
  classes: [{ id: 'c', anyOf: ['c'] }],
  extract: { c: { v: { pattern: 're:v=([\\d.]+)', type: 'int' } } },
}, 'c v=42.5');
check('int 收到小数→警示 + null', r2.fields.v === null && r2.warnings.some((w) => w.msg.includes('42.5')), JSON.stringify(r2.warnings));

const r3 = core.runPipeline({
  classes: [{ id: 'c', anyOf: ['c'] }],
  extract: { c: { dur: { pattern: 're:took (\\S+)', type: 'duration' } } },
}, 'c: took 1.5h');
check('duration 1.5h → 5400000', r3.fields.dur === 5400000, String(r3.fields.dur));

const r4 = core.runPipeline({
  classes: [{ id: 'c', anyOf: ['c'] }],
  extract: { c: { b: { pattern: 're:flag=(\\w+)', type: 'bool' } } },
}, 'c: flag=yes');
check('bool yes 归一', r4.fields.b === true);

const r5 = core.runPipeline({
  classes: [{ id: 'c', anyOf: ['c'] }],
  extract: { c: { first: { pattern: 're:(\\d+)-(\\d+)', type: 'int' }, second: { pattern: 're:(\\d+)-(\\d+)', group: 2, type: 'int' }, whole: { pattern: 're:\\d+-\\d+', type: 'string' } } },
}, 'c: 12-34');
check('默认取第 1 捕获组', r5.fields.first === 12, JSON.stringify(r5.fields));
check('显式 group=2', r5.fields.second === 34);
check('无捕获组取整段匹配', r5.fields.whole === '12-34');

// '*' 共享层 + 类别层覆盖
const r6 = core.runPipeline({
  classes: [{ id: 'x', anyOf: ['X'] }],
  extract: {
    '*': { shared: { pattern: 're:sh=(\\w+)', type: 'string' }, level: { pattern: 're:lv=(\\w+)', type: 'string' } },
    x: { level: { pattern: 're:lv=(\\w+)', type: 'int' } },
  },
}, 'X sh=ok lv=42');
check("'*' 共享层字段生效", r6.fields.shared === 'ok');
check('类别层覆盖同名（类型 int）', r6.fields.level === 42 && r6.fieldMeta.level.type === 'int', JSON.stringify(r6.fieldMeta.level));

// ── 决策 ────────────────────────────────────────────────────────────────────
console.log('\n[决策]');
const dec = {
  classes: [{ id: 'c', anyOf: ['c'] }],
  extract: { c: { n: { pattern: 're:v=(\\d+)', type: 'int' }, s: { pattern: 're:tag=(\\w+)', type: 'string' } } },
  decide: {
    c: [
      { when: { field: 'n', op: 'gt', value: 100 }, then: { verdict: 'big', severity: 'P0' } },
      { when: { field: 'n', op: 'gte', value: 50 }, then: { verdict: 'mid', severity: 'P1' } },
      { when: { field: 's', op: 'contains', value: 'red' }, then: { verdict: 'red-tag' } },
      { when: { field: 's', op: 'matches', value: '^a\\w+$' }, then: { verdict: 'a-word' } },
      { when: { field: 's', op: 'in', value: ['x', 'y'] }, then: { verdict: 'in-xy' } },
      { when: { field: 'n', op: 'eq', value: '42' }, then: { verdict: 'answer' } },
      { when: { field: 'ghost', op: 'exists' }, then: { verdict: 'impossible' } },
      { when: { field: 'n', op: 'missing' }, then: { verdict: 'no-n' } },
    ],
    '*': [{ when: { field: 's', op: 'eq', value: 'star' }, then: { verdict: 'star-hit' } }],
  },
  fallback: { verdict: 'none', severity: 'P3' },
};
check('gt 数值命中', core.runPipeline(dec, 'c v=150').decision.verdict === 'big');
check('首中即决（150 不落 gte50）', core.runPipeline(dec, 'c v=150').decision.severity === 'P0');
check('gte 边界', core.runPipeline(dec, 'c v=50').decision.verdict === 'mid');
check('gt 未命中落到后续规则链', core.runPipeline(dec, 'c v=10 tag=redx').decision.verdict === 'red-tag');
check('contains 命中', core.runPipeline(dec, 'c v=10 tag=colored').decision.verdict === 'red-tag');
check('matches 正则命中', core.runPipeline(dec, 'c v=10 tag=abc').decision.verdict === 'a-word');
check('in 数组命中', core.runPipeline(dec, 'c v=10 tag=y').decision.verdict === 'in-xy');
check("eq 数值串与 int 字段跨型相等", core.runPipeline(dec, 'c v=42').decision.verdict === 'answer');
check('不存在字段 exists 不命中', core.runPipeline(dec, 'c v=10').decision.verdict !== 'impossible');
check('missing 算子（字段存在→不命中→fallback）', core.runPipeline(dec, 'c v=10').decision.verdict === 'none');
check("类别规则全不中落 '*' 规则（输入须带 n，否则 n missing 规则会先兜住）", core.runPipeline(dec, 'c v=10 tag=star').decision.verdict === 'star-hit');
check("'*' 也不中落 fallback", core.runPipeline(dec, 'c v=10 tag=z').decision.verdict === 'none');
check('lt 非数值可比性：字段缺失不命中', core.runPipeline({ classes: [{ id: 'c', anyOf: ['c'] }], decide: { c: [{ when: { field: 'ghost', op: 'lt', value: 5 }, then: { verdict: 'v' } }] } }, 'c').decision.source === 'default', JSON.stringify(core.runPipeline({ classes: [{ id: 'c', anyOf: ['c'] }], decide: { c: [{ when: { field: 'ghost', op: 'lt', value: 5 }, then: { verdict: 'v' } }] } }, 'c')));
check('非数值字段 gt 不命中并记 trace 理由', (() => {
  const r = core.runPipeline({ classes: [{ id: 'c', anyOf: ['c'] }], extract: { c: { s: { pattern: 're:tag=(\\w+)' } } }, decide: { c: [{ when: { field: 's', op: 'gt', value: 5 }, then: { verdict: 'v' } }] } }, 'c tag=abc');
  const t = r.trace.find((x) => x.step === 'decide');
  return !t.matched && t.reason.includes('非数值');
})());

// ── trace 与渲染 ────────────────────────────────────────────────────────────
console.log('\n[trace 与渲染]');
const rt = core.runPipeline(dec, 'c v=150');
check('trace 含三类步骤', ['classify', 'extract', 'decide'].every((s) => rt.trace.some((t) => t.step === s)));
check('trace 分类条目含证据', rt.trace.some((t) => t.step === 'classify' && t.hit && t.evidence === 'c'));
check('renderRun 含关键段', (() => { const txt = core.renderRun(rt); return txt.includes('分流结果') && txt.includes('类别') && txt.includes('证据链 trace'); })());
check('renderRun 未抽取字段如实标注', (() => { const txt = core.renderRun(core.runPipeline(ex, 'c: count=1')); return txt.includes('未抽取'); })());

// ── 内置预设 ────────────────────────────────────────────────────────────────
console.log('\n[内置预设]');
check('三套预设全部通过校验', BUILTIN_PIPELINES.every((b) => core.validatePipeline(b.pipeline).ok), BUILTIN_PIPELINES.map((b) => `${b.name}:${JSON.stringify(core.validatePipeline(b.pipeline))}`).join('; '));

const LOG_ERR = '2026-11-04 10:23:01 ERROR [auth-service] login failed for user=alice';
const pLog = BUILTIN_PIPELINES.find((b) => b.name === 'log-triage').pipeline;
const lr = core.runPipeline(pLog, LOG_ERR);
check('log-triage: ERROR 行类别=error', lr.classId === 'error', lr.classId);
check('log-triage: 抽出 component=auth-service', lr.fields.component === 'auth-service', JSON.stringify(lr.fields));
check('log-triage: ts 归一为 ISO（无时区按本机时区解释）', lr.fields.ts === new Date(2026, 10, 4, 10, 23, 1).toISOString(), String(lr.fields.ts));
check('log-triage: verdict=尽快处理 P1', lr.decision.verdict === '尽快处理' && lr.decision.severity === 'P1', JSON.stringify(lr.decision));
const lFatal = core.runPipeline(pLog, '2026-11-04 10:23:01 FATAL [core] 进程崩溃');
check('log-triage: FATAL → P0 立即处理', lFatal.decision.severity === 'P0' && lFatal.decision.verdict === '立即处理', JSON.stringify(lFatal.decision));
const lInfo = core.runPipeline(pLog, '2026-11-04 10:23:01 INFO [api] - health check ok');
check('log-triage: INFO → P3 无需处理', lInfo.decision.severity === 'P3' && lInfo.decision.verdict === '无需处理', JSON.stringify(lInfo.decision));

const pLat = BUILTIN_PIPELINES.find((b) => b.name === 'latency-triage').pipeline;
function latVerdict(ms) {
  return core.runPipeline(pLat, `POST /api/chat 耗时 ${ms}ms status=200`).decision;
}
check('latency-triage: 5000ms → P0', latVerdict(5000).severity === 'P0', JSON.stringify(latVerdict(5000)));
check('latency-triage: 4999ms → P1', latVerdict(4999).severity === 'P1');
check('latency-triage: 999ms → P2', latVerdict(999).severity === 'P2');
check('latency-triage: 499ms → P3', latVerdict(499).severity === 'P3');
check('latency-triage: 抽出 endpoint', core.runPipeline(pLat, 'POST /api/chat 耗时 600ms').fields.endpoint === '/api/chat');

const pDisk = BUILTIN_PIPELINES.find((b) => b.name === 'disk-triage').pipeline;
const dr = core.runPipeline(pDisk, '/dev/sda1 使用率 96.5%（剩余 3.2GB 可用）');
check('disk-triage: 96.5% → P0 立即扩容', dr.decision.severity === 'P0' && dr.decision.verdict === '立即扩容/清理', JSON.stringify(dr.decision));
check('disk-triage: 抽出 device', dr.fields.device === '/dev/sda1');
check('disk-triage: percent float', dr.fields.percent === 96.5);

// ── 边界 ────────────────────────────────────────────────────────────────────
console.log('\n[边界]');
check('text 非字符串安全转字符串', core.runPipeline(cls, null).ok === true);
check('空文本不炸', core.runPipeline(cls, '').ok === true);
check('坏模板 runPipeline 返回 ok:false', !core.runPipeline({ classes: [{ id: 'a', anyOf: ['re:(('] }] }, 'x').ok);
check('duration 裸数字按毫秒', core.runPipeline({ classes: [{ id: 'c', anyOf: ['c'] }], extract: { c: { d: { pattern: 're:(\\d+)', type: 'duration' } } } }, 'c 800').fields.d === 800);
check('bytes 裸数字按字节', core.runPipeline({ classes: [{ id: 'c', anyOf: ['c'] }], extract: { c: { s: { pattern: 're:(\\d+)', type: 'bytes' } } } }, 'c 1024').fields.s === 1024);
check('无时区日期按本机时区并注明', (() => {
  const r = core.runPipeline({ classes: [{ id: 'c', anyOf: ['c'] }], extract: { c: { t: { pattern: 're:(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})', type: 'date' } } } }, 'c 2026-01-02 03:04:05');
  return r.fieldMeta.t.warn && r.fieldMeta.t.warn.includes('本机时区');
})());

// ── 汇总 ────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass).length;
console.log(`\ncore 单测: ${results.length - failed}/${results.length} 通过`);
process.exitCode = failed ? 1 : 0;
