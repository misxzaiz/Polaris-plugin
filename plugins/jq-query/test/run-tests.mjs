/**
 * run-tests.mjs —— jq 查询台核心单测（node:test；离线，不依赖宿主）
 *
 * 金标来源（独立于被测代码）：
 *   - jq 语义用例：来自 jq 1.7 手册与命令行实际行为（spike 已与本 WASM 构建对拍），
 *     含错误语义（语法=exit 3 / 运行期=exit 5）、NDJSON 多文档流、全 flags。
 *   - engine-api：纯函数边界（聚合式 flags / 流切分 / 截断）。
 *   - 超时护栏：engine.js 真实 worker 上跑死查询，断言击杀 + 重生成可用。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const api = require(path.join(here, '../shared/engine-api.js'));
const ref = require(path.join(here, '../shared/reference.js'));
const outline = require(path.join(here, '../shared/outline.js'));
const { createEngine } = require(path.join(here, '../service/engine.js'));

// ── engine-api：flags ─────────────────────────────────────────────────────────
test('flags：白名单放行与 --arg/--argjson 配对', () => {
  assert.deepEqual(api.normalizeFlags(['-r', '-c']).flags, ['-r', '-c']);
  assert.deepEqual(api.normalizeFlags(['--arg', 'x', '4']).flags, ['--arg', 'x', '4']);
  assert.deepEqual(api.normalizeFlags(['--argjson', 'y', '{"v":1}']).flags, ['--argjson', 'y', '{"v":1}']);
  assert.equal(api.normalizeFlags(['--arg', 'x']).ok, false, '缺第二个参数必须拒绝');
  assert.equal(api.normalizeFlags(['--argjson', 'y', '{bad']).ok, false, 'argjson 值非 JSON 必须拒绝');
  assert.equal(api.normalizeFlags(['--evil']).ok, false, '未知 flag 必须拒绝');
});

test('flags：聚合式 -rn / -rnS 展开', () => {
  assert.deepEqual(api.normalizeFlags(['-rn']).flags, ['-r', '-n']);
  assert.deepEqual(api.normalizeFlags(['-rnS']).flags, ['-r', '-n', '-S']);
  assert.equal(api.normalizeFlags(['-rx']).ok, false, '含未知字符的聚合式必须整体拒绝');
});

test('flags：长写法白名单透传（jq 双写法都接受）', () => {
  assert.deepEqual(api.normalizeFlags(['--raw-output', '--compact-output']).flags, ['--raw-output', '--compact-output']);
});

test('超时钳制：缺省 5000，夹在 [100, 30000]', () => {
  assert.equal(api.clampTimeoutMs(undefined), 5000);
  assert.equal(api.clampTimeoutMs('abc'), 5000);
  assert.equal(api.clampTimeoutMs(5), 100);
  assert.equal(api.clampTimeoutMs(999999), 30000);
  assert.equal(api.clampTimeoutMs(2500), 2500);
});

// ── engine-api：JSON 流切分 ───────────────────────────────────────────────────
test('splitJsonStream：NDJSON 多文档', () => {
  const parts = api.splitJsonStream('{"a":1}\n{"a":2}\n');
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.value.a), [1, 2]);
});

test('splitJsonStream：pretty JSON 多值（jq 默认输出）', () => {
  const parts = api.splitJsonStream('{\n  "a": 1\n}\n{\n  "b": [1, 2]\n}');
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0].value, { a: 1 });
  assert.deepEqual(parts[1].value, { b: [1, 2] });
});

test('splitJsonStream：字符串内花括号/引号/转义不误切', () => {
  const parts = api.splitJsonStream('{"s":"a}b{\\"c"}\n{"t":"x"}');
  assert.equal(parts.length, 2);
  assert.equal(parts[0].value.s, 'a}b{"c');
});

test('splitJsonStream：标量流与非法段容错', () => {
  const parts = api.splitJsonStream('1 "two" {"a":1} not json');
  assert.equal(parts.length, 5, '"not json" 按空白切成两个非法段');
  assert.equal(parts[0].value, 1);
  assert.equal(parts[1].value, 'two');
  assert.deepEqual(parts[2].value, { a: 1 });
  assert.ok(parts[3].error && parts[4].error, '非法段必须带 error 而非抛异常');
});

test('splitJsonStream：空输入', () => {
  assert.deepEqual(api.splitJsonStream(''), []);
  assert.deepEqual(api.splitJsonStream('   \n  '), []);
});

test('inputStats：字节数按 UTF-8、文档数、错误标记', () => {
  const s = api.inputStats('{"a":"中文"}\n{"a":2}');
  assert.equal(s.docCount, 2);
  assert.ok(s.bytes > 20, 'UTF-8 中文应计多字节');
  assert.equal(s.hasParseError, false);
  const bad = api.inputStats('{"a":}');
  assert.equal(bad.hasParseError, true);
  assert.equal(api.inputStats('   ').empty, true);
});

test('parseOutputs：jq 输出流 → 值数组', () => {
  const outs = api.parseOutputs('"x"\n42\n{"a":[1,2]}');
  assert.equal(outs.length, 3);
  assert.equal(outs[0].value, 'x');
  assert.equal(outs[1].value, 42);
  assert.deepEqual(outs[2].value, { a: [1, 2] });
});

test('truncationNotice：提示语包含上限', () => {
  assert.ok(api.truncationNotice(999, 100).includes('100'));
});

// ── reference ────────────────────────────────────────────────────────────────
test('reference：关键词搜索命中 sig/desc/cat/ex', () => {
  assert.ok(ref.searchReference('group_by').total >= 1);
  assert.ok(ref.searchReference('时间').total >= 3);
  assert.ok(ref.searchReference('@csv').entries[0].sig.includes('@csv'));
  const all = ref.searchReference('');
  assert.ok(all.total > 80, `速查表应有 80+ 条，实际 ${all.total}`);
});

test('reference：cap 截断', () => {
  const r = ref.searchReference('a', 5); // "a" 是超宽词，必然超 5 条
  assert.ok(r.entries.length <= 5);
  assert.equal(r.truncated, true);
});

// ── outline ──────────────────────────────────────────────────────────────────
test('outline：对象键与数组元素键并集', () => {
  const r = outline.outlineFromText('{"rows":[{"id":1,"n":"x"},{"id":2},{"id":3}]}', { depth: 3 });
  const rows = r.node.children[0];
  assert.equal(rows.type, 'array');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.elementKeys, ['id', 'n']);
  assert.ok(r.text.includes('rows[0]'));
});

test('outline：数组元素类型统计与标量样本', () => {
  const r = outline.outlineFromText('{"xs":[1,"a",true,null,2]}', { depth: 3 });
  const xs = r.node.children[0];
  assert.ok(xs.childTypes.includes('number'));
  assert.ok(xs.childTypes.includes('string'));
  const kid = xs.children[0];
  assert.equal(kid.type, 'number');
  assert.equal(kid.sample, '1');
});

test('outline：深度钳制与截断标记', () => {
  const big = { items: Array.from({ length: 40 }, (_, i) => ({ i })) };
  const r = outline.outlineOf(big, { depth: 2, maxChildren: 10 });
  const items = r.children[0];
  assert.equal(items.length, 40, '数组长度如实（不受深度门控）');
  assert.ok(items.childTypes.includes('object'), '元素类型统计不受深度门控');
  assert.ok(outline.outlineFromText('not json') === null, '非法 JSON 返回 null');
});

// ── 真实引擎（worker 隔离）：jq 1.7 语义保真 ─────────────────────────────────
const engine = createEngine({ log: () => {} });
const run = (input, query, flags, timeoutMs) => engine.run({ input, query, flags: flags || [], timeoutMs: timeoutMs || 10000 });

test('引擎：恒等与管道', async () => {
  const r = await run('{"a":1}', '.');
  assert.equal(r.out.trim(), '{\n  "a": 1\n}');
});

test('引擎：select/map/聚合', async () => {
  assert.equal((await run('[1,2,3]', 'map(. * 2) | add')).out.trim(), '12');
  assert.equal((await run('[{"n":1},{"n":5}]', '[.[] | select(.n > 3)] | length')).out.trim(), '1');
  assert.equal((await run('[{"k":"a"},{"k":"b"},{"k":"a"}]', 'group_by(.k) | map({k: .[0].k, n: length}) | tojson', ['-r'])).out.trim(), '[{"k":"a","n":2},{"k":"b","n":1}]');
});

test('引擎：NDJSON 多文档流式输出', async () => {
  assert.equal((await run('{"a":1}\n{"a":2}', '.a')).out.trim(), '1\n2');
  assert.equal((await run('{"a":1}\n{"a":2}\n{"a":3}', 'length', ['--slurp'])).out.trim(), '3');
  assert.equal((await run('{"a":1}\n{"a":2}\n{"a":3}', '[inputs] | length')).out.trim(), '2', 'inputs 读首个之后的剩余文档');
});

test('引擎：-r/-c/-S/--tab/--arg/--argjson 全 flags', async () => {
  assert.equal((await run('"x"', '["a","b"] | @csv', ['-r'])).out, '"a","b"', '@csv 全字段加引号（jq RFC4180 语义）');
  assert.equal((await run('"x"', '["a","b"] | @tsv', ['-r'])).out, 'a\tb', '@tsv 不加引号');
  assert.equal((await run('{"a":1}', '.', ['-c'])).out.trim(), '{"a":1}');
  assert.match((await run('{"b":1,"a":2}', '.', ['-S'])).out, /"a": 2[\s\S]*"b": 1/, '-S 输出按键排序');
  assert.equal((await run('null', '$x', ['-n', '--arg', 'x', 'hello'])).out.trim(), '"hello"');
  assert.equal((await run('null', '$y.v + $x', ['-n', '--argjson', 'x', '2', '--argjson', 'y', '{"v":40}'])).out.trim(), '42', '--arg 是字符串、--argjson 才是 JSON（真实 jq 语义）');
  await assert.rejects(() => run('null', '$x + 1', ['-n', '--arg', 'x', '41']), (e) => e.jq === true, '字符串与数字相加必须报错（真实 jq 语义）');
});

test('引擎：正则族（test/match/capture/scan/gsub）', async () => {
  assert.equal((await run('"id=42"', 'test("^[a-z]+=")')).out.trim(), 'true');
  assert.equal((await run('"id=42"', 'capture("(?<n>[0-9]+)") | .n')).out.trim(), '"42"');
  assert.equal((await run('"a1b22"', '[scan("[0-9]+")] | join("-")', ['-r'])).out, '1-22');
  assert.equal((await run('"a1b22"', 'gsub("[0-9]+"; "#")')).out.trim(), '"a#b#"');
  assert.equal((await run('"aAa"', '[match("a"; "g") | .offset] | tojson', ['-r'])).out.trim(), '[0,2]');
});

test('引擎：时间函数与 $ENV', async () => {
  assert.equal((await run('1700000000', 'todate')).out.trim(), '"2023-11-14T22:13:20Z"');
  assert.equal((await run('null', '$ENV | type')).out.trim(), '"object"');
});

test('引擎：to_entries/paths/getpath/del', async () => {
  assert.equal((await run('{"a":{"b":1}}', 'getpath(["a","b"])')).out.trim(), '1');
  assert.equal((await run('{"a":1,"b":2}', 'del(.a)', ['-c'])).out.trim(), '{"b":2}');
  assert.equal((await run('{"a":{"b":1}}', '[paths] | length')).out.trim(), '2', 'paths 含中间路径（jq 1.7 语义）');
});

test('引擎：错误语义金标——语法错误与运行期错误都抛 user 错', async () => {
  await assert.rejects(() => run('null', '.a ++'), (e) => e.user === true && e.jq === true && /syntax|compile/i.test(e.message));
  await assert.rejects(() => run('{"a":"s"}', '.a | tonumber'), (e) => e.user === true && e.jq === true);
  await assert.rejects(() => run('{"a":1}', '.a | @csv'), (e) => e.user === true, '@csv 拒标量（真实 jq 语义）');
});

test('引擎：flags 隔离——前后查询的 -r 互不粘连（jq-web 0.6.2 粘连 bug 回归）', async () => {
  // 用 '.' 查询探针：无 -r → '"x"'（JSON 编码）；有 -r → 'x'（原文）。语义无歧义。
  await run('"x"', '.', []);
  const withR = await run('"x"', '.', ['-r']);
  assert.equal(withR.out, 'x', '前一条无 -r 不得污染本条');
  await run('"x"', '.', ['-r']);
  const noR = await run('"x"', '.', []);
  assert.equal(noR.out, '"x"', '前一条有 -r 不得污染本条');
  // -c 与 pretty 互不粘连
  await run('{"a":1}', '.', ['-c']);
  const pretty = await run('{"a":1}', '.', []);
  assert.ok(pretty.out.includes('\n  '), '前一条 -c 不得污染本条 pretty 输出');
});

test('引擎：空流输出为空字符串（非错误）', async () => {
  const r = await run('"abc"', '[match("z")] | length');
  assert.equal(r.out.trim(), '0');
  const empty = await run('{"a":1}', '.x // empty');
  assert.equal(empty.out, '');
});

test('引擎：坏输入提前报错（服务层语义经引擎复验）', async () => {
  await assert.rejects(() => run('{bad json', '.'), (e) => e.user === true);
});

test('引擎：超时护栏——死查询被击杀且重生成后可用', async () => {
  const before = engine.stats().timeouts;
  await assert.rejects(() => run('0', '[repeat(.+1)]', [], 600), (e) => e.timeout === true && e.user === true);
  assert.equal(engine.stats().timeouts, before + 1, '超时计数必须 +1');
  const after = await run('{"v":[10,20,12]}', '.v | add');
  assert.equal(after.out.trim(), '42', '击杀后引擎重生成，后续查询正常');
});

test('引擎：串行队列——并发请求不交错', async () => {
  const [a, b] = await Promise.all([
    run('null', '[range(2000)] | add'),
    run('"slow"', '. + "!"'),
  ]);
  assert.equal(b.out.trim(), '"slow!"');
  assert.equal(a.out.trim(), '1999000', '并发下结果仍精确（1999000 = 0..1999 之和）');
});

test('引擎：idle 后仍可复用（幂等生命周期）', async () => {
  const s1 = engine.stats();
  const r = await run('"again"', '.');
  assert.equal(r.out.trim(), '"again"');
  assert.ok(engine.stats().queries >= s1.queries);
});

test.after(async () => {
  await engine.shutdown();
});
