/**
 * yaml-lens core 测试（node test/run-tests.mjs）
 * 三层：
 *  A. js-yaml 4.1.0 行为锁 —— 本工具文案与类型预览的地基，全部 2026-11-04 实测值；
 *     若未来升级 js-yaml 此层先红，防止文案与行为脱节。
 *  B. lintYaml 规则断言 —— 19 条规则逐条正向/反向向量（反查误报）。
 *  C. round-trip 与工具函数 —— url-lens 纪律：重建→重解析→结构相等。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const core = require(path.join(HERE, '..', 'shared', 'yaml-core.js'));
const yaml = require('js-yaml');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '  ✓' : '  ✖'} ${name}${cond ? '' : ` —— ${detail}`}`);
}
function issues(text) { return core.lintYaml(text).issues; }
function rules(text) { return issues(text).map((i) => i.rule); }
function byRule(text, rule) { return issues(text).filter((i) => i.rule === rule); }

let section = '';
function sec(s) { section = s; console.log(`\n== ${s} ==`); }
const label = (n) => `${section}::${n}`;

// ---------- A. js-yaml 4.1.0 行为锁（实测值） ----------
sec('A js-yaml 行为锁');
check(label('no→字符串'), yaml.load('a: no').a === 'no');
check(label('yes→字符串'), yaml.load('a: yes').a === 'yes');
check(label('on→字符串'), yaml.load('a: on').a === 'on');
check(label('前导零→十进制'), yaml.load('a: 02134').a === 2134);
check(label('0755→十进制'), yaml.load('a: 0755').a === 755);
check(label('sexagesimal→字符串'), yaml.load('a: 12:34:56').a === '12:34:56');
check(label('大整数精度丢失'), yaml.load('a: 9007199254740993').a === 9007199254740992);
check(label('1.10→1.1'), yaml.load('a: 1.10').a === 1.1);
check(label('时间戳→Date'), yaml.load('a: 2024-01-02').a instanceof Date);
check(label('.inf→Infinity'), yaml.load('a: .inf').a === Infinity);
check(label('JSON.stringify(Infinity)→null（陷阱本体）'), JSON.stringify(yaml.load('a: .inf')) === '{"a":null}');
check(label('JSON.stringify(Date)→ISO'), JSON.stringify(yaml.load('a: 2024-01-02')).includes('2024-01-02T00:00:00.000Z'));
{
  let threw = null;
  try { yaml.load('a: 1\na: 2'); } catch (e) { threw = e; }
  check(label('重复键抛错'), threw !== null && /duplicated mapping key/.test(threw.reason || threw.message));
  check(label('重复键 mark 0 基（第2行→line:1）'), threw && threw.mark && threw.mark.line === 1 && threw.mark.column === 0);
}
check(label('合并键 DEFAULT_SCHEMA 生效'), JSON.stringify(yaml.load('base: &b {a: 1, c: 3}\nderived: {<<: *b, a: 2}')) === '{"base":{"a":1,"c":3},"derived":{"a":2,"c":3}}');
check(label('loadAll 多文档'), yaml.loadAll('a: 1\n---\nb: 2').length === 2);

// ---------- B. lintYaml 规则 ----------
sec('B1 Norway / 布尔 lookalike');
{
  const r = rules('mode: no\nok: "no"\nk2: \'on\'\nsingle: y');
  check(label('unquoted no→bool-lookalike'), r.includes('bool-lookalike'));
  check(label('引号内 no 不误报'), byRule('mode: no\nok: "no"\nk2: \'on\'', 'bool-lookalike').length === 1);
  check(label('单字母 y→info'), rules('single: y').includes('bool-single'));
  check(label('文案含跨实现对照'), byRule('mode: no', 'bool-lookalike')[0].message.includes('PyYAML'));
}
sec('B2 数字形态');
{
  const r = issues('zip: 02134');
  check(label('前导零警告'), r.length === 1 && r[0].rule === 'leading-zero' && r[0].severity === 'warn');
  check(label('八进制值 1116'), r[0].message.includes('1116'));
  check(label('十进制值 2134'), r[0].message.includes('2134'));
  check(label('0755→493'), issues('p: 0755')[0].message.includes('493'));
  const sx = issues('d: 12:34:56');
  check(label('sexagesimal 警告'), sx.length === 1 && sx[0].rule === 'sexagesimal');
  check(label('六十进制值 45296'), sx[0].message.includes('45296'));
  check(label('1.10 尾零'), rules('v: 1.10').includes('float-form'));
  check(label('1.12 不误报'), !rules('v: 1.12').includes('float-form'));
  check(label('大整数警告'), rules('id: 9007199254740993').includes('big-int'));
  check(label('安全整数不误报'), !rules('id: 9007199254740991').includes('big-int'));
  check(label('科学计数法 info'), issues('n: 1e3')[0].rule === 'sci-note' && issues('n: 1e3')[0].severity === 'info');
  check(label('.inf info'), rules('v: .inf').includes('special-float'));
  check(label('时间戳 info'), rules('b: 2024-01-02').includes('timestamp'));
  check(label('加引号时间戳不误报'), !rules('b: "2024-01-02"').includes('timestamp'));
}
sec('B3 重复键与作用域');
{
  const r = byRule('a: 1\na: 2', 'dup-key');
  check(label('顶层重复'), r.length === 1 && r[0].line === 2 && r[0].col === 1 && r[0].severity === 'error');
  check(label('嵌套重复'), byRule('x:\n  b: 1\n  b: 2', 'dup-key').length === 1);
  check(label('同级不同父不误报'), byRule('x:\n  a: 1\ny:\n  a: 2', 'dup-key').length === 0);
  check(label('序列项不误报'), byRule('- c: 1\n- c: 2', 'dup-key').length === 0);
  check(label('序列项内延续键仍检出'), byRule('a:\n  - b: 1\n    b: 2', 'dup-key').length === 1);
  check(label('flow 重复'), byRule('m: {x: 1, x: 2}', 'dup-key').length === 1);
  check(label('flow 无重复不误报'), byRule('m: {x: 1, y: 2}', 'dup-key').length === 0);
  check(label('多文档作用域重置'), byRule('a: 1\n---\na: 2', 'dup-key').length === 0);
}
sec('B4 书写陷阱');
{
  check(label('Tab 缩进'), rules('a:\n\tb: 1').includes('tab-indent'));
  const ti = byRule('a:\n\tb: 1', 'tab-indent')[0];
  check(label('Tab 位置 2:1'), ti.line === 2 && ti.col === 1);
  check(label('智能引号'), rules('title: “中文”').includes('smart-quote'));
  check(label('保留字符 `'), rules('cmd: `ls`').includes('reserved-char'));
  check(label('保留字符 @'), rules('h: @me').includes('reserved-char'));
  check(label('% 中文档报错'), rules('a: 1\n%foo').includes('percent-middoc'));
  check(label('%YAML 首行指令不误报'), rules('%YAML 1.2\n---\na: 1').includes('percent-middoc') === false);
  check(label('键后缺空格 info'), rules('key:value').includes('colon-nospace'));
  check(label('host:port 同规则 info'), rules('localhost:8080').includes('colon-nospace'));
  check(label('正常键值不误报'), rules('key: value').includes('colon-nospace') === false);
  check(label('URL 冒号不误报'), rules('u: https://example.com').includes('colon-nospace') === false);
}
sec('B5 注释 / 空值 / 锚点');
{
  const cs = byRule('cmd: echo # tail', 'comment-swallow');
  check(label('注释吞值 info'), cs.length === 1 && cs[0].severity === 'info');
  check(label('# 位置 1:11'), cs[0].col === 11);
  check(label('引号内 # 不误报'), byRule('q: "x # y"', 'comment-swallow').length === 0);
  check(label('无空格 # 不算注释'), byRule('u: http://x#frag', 'comment-swallow').length === 0);
  check(label('空值 null info'), byRule('a:\n', 'empty-value').length === 1);
  check(label('~ info'), rules('t: ~').includes('null-tilde'));
  check(label('合并键 info'), rules('m:\n  <<: *base').includes('merge-key'));
  check(label('未解析别名 error'), rules('x: *gone').includes('unresolved-alias'));
  const ok = core.lintYaml('a: &v 1\nb: *v');
  check(label('已解析别名不报错'), !ok.issues.some((i) => i.rule === 'unresolved-alias'));
  check(label('别名 resolved 标记'), ok.aliases.length === 1 && ok.aliases[0].resolved === true);
  check(label('锚点清单'), ok.anchors.length === 1 && ok.anchors[0].name === 'v' && ok.anchors[0].line === 1);
  check(label('锚点重定义 warn'), rules('a: &v 1\nb: &v 2').includes('anchor-dup'));
  check(label('BOM info'), rules('\uFEFFa: 1').includes('bom'));
}
sec('B6 块标量与跨行状态机');
{
  const r = issues('script: |\n  echo "no # here"\n  mode: no\nafter: yes');
  check(label('块标量内容豁免'), r.length === 1 && r[0].line === 4 && r[0].rule === 'bool-lookalike');
  check(label('折叠 > 同样豁免'), byRule('doc: >\n  a: no\n  b: 1\nnext: 2', 'bool-lookalike').length === 0);
  check(label('跨行引用不误报注释'), byRule('a: "line1\nline2 continued" # tail', 'comment-swallow').length === 0);
  check(label('跨行 flow 不产生键规则误报'), byRule('list: [\n  1,\n  2\n]', 'colon-nospace').length === 0);
  check(label('CRLF 行列正确'), (() => { const i = byRule('a: 1\r\nb: no', 'bool-lookalike')[0]; return i && i.line === 2 && i.col === 4; })());
  check(label('统计行数'), core.lintYaml('a: 1\nb: 2\nc: 3').stats.lines === 3);
  check(label('空文本无 issue'), core.lintYaml('').issues.length === 0 && core.lintYaml('').docs === 1);
}

// ---------- C. jsonSafe / normalizeYamlError ----------
sec('C jsonSafe 与错误归一');
check(label('Infinity→.inf'), core.jsonSafe(Infinity) === '.inf');
check(label('-Infinity→-.inf'), core.jsonSafe(-Infinity) === '-.inf');
check(label('NaN→.nan'), core.jsonSafe(NaN) === '.nan');
check(label('Date→ISO'), core.jsonSafe(new Date('2024-01-02T00:00:00Z')) === '2024-01-02T00:00:00.000Z');
check(label('深嵌套'), JSON.stringify(core.jsonSafe({ a: { b: [Infinity] } })) === '{"a":{"b":[".inf"]}}');
check(label('load .inf 预览不丢'), JSON.stringify(core.jsonSafe(yaml.load('a: .inf'))) === '{"a":".inf"}');
{
  let e = null;
  try { yaml.load('a: 1\na: 2'); } catch (x) { e = x; }
  const n = core.normalizeYamlError(e);
  check(label('错误行列 1 基'), n.line === 2 && n.column === 1);
  check(label('重复键 hint'), n.hint.includes('重复键'));
  let e2 = null;
  try { yaml.load('a:\n\tb: 1'); } catch (x) { e2 = x; }
  check(label('Tab 错误 hint'), core.normalizeYamlError(e2).hint.includes('Tab'));
}

// ---------- D. 工具函数与 round-trip ----------
sec('D 工具函数 / round-trip');
check(label('sexagesimalToInt 45296'), core.sexagesimalToInt('12:34:56') === 45296);
check(label('sexagesimalToInt 1:30'), core.sexagesimalToInt('1:30') === 90);
check(label('sexagesimalToInt 负数'), core.sexagesimalToInt('-1:30') === -90);
check(label('octalValue 493'), core.octalValue('0755') === 493);
check(label('octalValue 02134'), core.octalValue('02134') === 1116);
check(label('octalValue 含 8/9 非法'), core.octalValue('089') === null);
{
  const sample = { name: '服务', port: 8080, tags: ['a', 'b'], nested: { deep: [1, 2, { x: null }] } };
  const dumped = yaml.dump(sample, { lineWidth: -1, noRefs: true });
  const back = yaml.load(dumped);
  check(label('round-trip 结构相等'), JSON.stringify(back) === JSON.stringify(sample));
}
{
  const long = { s: 'x'.repeat(300) };
  const folded = yaml.dump(long);
  const unfolded = yaml.dump(long, { lineWidth: -1 });
  check(label('默认 80 折行'), folded.split('\n').length > 1);
  check(label('lineWidth -1 不折行'), unfolded.trim().split('\n').length === 1 && unfolded.length > 300);
}
{
  const out = yaml.dump({ b: 1, a: 2 }, { sortKeys: true });
  check(label('sortKeys 排序'), out.trim() === 'a: 2\nb: 1');
  check(label('indent 4'), yaml.dump({ a: { b: 1 } }, { indent: 4 }).includes('\n    b: 1'));
  const shared = { x: 1 };
  const norefs = yaml.dump({ a: shared, b: shared }, { noRefs: true });
  check(label('noRefs 展开引用'), !norefs.includes('&') && !norefs.includes('*'));
  check(label('中文不转义'), yaml.dump({ 名: '值' }).includes('名: 值'));
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n共 ${results.length} 项断言：${results.length - failed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
