/**
 * version-lens core 单测 + node-semver 差分对拍（node test/run-tests.mjs）
 *
 * 两道防线：
 *  1. 语义子集定向断言（规范向量：官方 prerelease 排序链、-0 边界、门控、跳段）
 *  2. node-semver 7 权威实现差分对拍：satisfies 全矩阵 + compare 全矩阵
 *     （自研解析器的判定行为必须与 npm 实际行为全等，不等即红）
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../shared/version-core.js');
const semver = require('semver');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  if (!cond) console.log(`  ✖ ${name}${detail ? ` —— ${detail}` : ''}`);
}

// ---------- 1. 版本解析 ----------
{
  const r = core.parseVersion('1.2.3');
  check('parse 1.2.3 基本形态', r.ok && r.version.major === 1 && r.version.minor === 2 && r.version.patch === 3 && r.version.prerelease.length === 0);
  const v = core.parseVersion('v1.2.3-alpha.1+build.5');
  check('parse v 前缀 + prerelease + build', v.ok && v.version.major === 1 && JSON.stringify(v.version.prerelease) === '["alpha","1"]' && v.version.build === 'build.5');
  check('parse 拒绝两段 1.2', !core.parseVersion('1.2').ok);
  check('parse 拒绝前导零 01.2.3', !core.parseVersion('01.2.3').ok);
  check('parse 拒绝悬空 prerelease 1.2.3-', !core.parseVersion('1.2.3-').ok);
  check('parse 拒绝空串', !core.parseVersion('').ok);
  check('parse 拒绝 1.2.x（版本层不允许通配）', !core.parseVersion('1.2.x').ok);
}

// ---------- 2. 官方 prerelease 排序链（semver.org 规范向量） ----------
{
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
  let sorted = true;
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = core.parseVersion(chain[i]).version;
    const b = core.parseVersion(chain[i + 1]).version;
    if (core.compareParsed(a, b) !== -1) { sorted = false; break; }
  }
  check('官方 prerelease 排序链全序正确', sorted);
  const n1 = core.parseVersion('1.0.0-2').version;
  const n10 = core.parseVersion('1.0.0-10').version;
  check('数字标识符按数值比较（-2 < -10 不成立）', core.compareParsed(n1, n10) === -1);
  const num = core.parseVersion('1.0.0-1').version;
  const alpha = core.parseVersion('1.0.0-alpha').version;
  check('数字标识符 < 字母标识符', core.compareParsed(num, alpha) === -1);
}

// ---------- 3. satisfies 定向语义 ----------
{
  const cases = [
    // [range, version, expected]
    ['^1.2.3', '1.2.3', true], ['^1.2.3', '1.9.9', true], ['^1.2.3', '2.0.0', false], ['^1.2.3', '1.2.2', false],
    ['~1.2.3', '1.2.9', true], ['~1.2.3', '1.3.0', false], ['~1.2', '1.2.5', true], ['~1', '1.9.9', true], ['~1', '2.0.0', false],
    ['^0.2.3', '0.2.9', true], ['^0.2.3', '0.3.0', false], ['^0.0.3', '0.0.3', true], ['^0.0.3', '0.0.4', false],
    ['^0.x', '0.9.9', true], ['^0.x', '1.0.0', false],
    ['1.2.3 - 2.3.4', '2.3.4', true], ['1.2.3 - 2.3.4', '2.3.5', false], ['1.2 - 2', '2.9.9', true], ['1.2 - 2', '3.0.0', false],
    ['>1.2', '1.2.99', false], ['>1.2', '1.3.0', true], ['<1.2', '1.2.0-alpha', false], ['<1.2', '1.1.9', true],
    ['<=1.2', '1.2.9', true], ['<=1.2', '1.3.0', false],
    ['=1.2', '1.2.5', true], ['=1.2', '1.3.0', false], ['1.2', '1.2.5', true],
    ['1.2.x', '1.2.9', true], ['1.x', '1.9.9', true], ['*', '1.2.3', true], ['', '1.2.3', true],
    ['>=1.2.0 <1.3.0', '1.2.5', true], ['>=1.2.0 <1.3.0', '1.3.0', false],
    ['^1.2.3 || ^2.0.0', '2.5.0', true], ['^1.2.3 || ^2.0.0', '3.0.0', false],
    // -0 边界：上界排除目标版本及其一切预发布
    ['^1.2.3', '2.0.0-0', false], ['^1.2.3', '2.0.0-alpha', false], ['~1.2.3', '1.3.0-beta', false],
    // 预发布门控
    ['^1.2.3', '1.2.3-beta', false], ['*', '1.0.0-rc.1', false], ['', '1.0.0-beta', false],
    ['^1.2.3-beta.2', '1.2.3-beta.4', true], ['^1.2.3-beta.2', '1.2.3-beta.1', false], ['^1.2.3-beta.2', '1.2.3', true],
    ['^1.2.3-beta.2', '1.2.4-beta.1', false], ['^1.2.3-beta.2', '1.3.0-alpha', false],
    ['>=1.2.3-beta', '1.2.3-beta.4', false], // 门控：比较器带 beta 但 M.m.p 是 1.2.3，候选 1.2.3-beta.4 同 M.m.p？——同！应 true
    ['1.2.3-beta.2', '1.2.3-beta.2', true],
  ];
  // 上面 >=1.2.3-beta 那条按语义应为 true（同 M.m.p 同门），修正期望：
  cases[cases.findIndex((c) => c[0] === '>=1.2.3-beta' && c[1] === '1.2.3-beta.4')][2] = true;
  let bad = 0;
  for (const [range, ver, expected] of cases) {
    const rp = core.parseRange(range);
    const vp = core.parseVersion(ver);
    if (!rp.ok || !vp.ok) { bad++; check(`satisfies ${ver} in ${range}`, false, `解析失败：${!rp.ok ? rp.error : vp.error}`); continue; }
    const r = core.satisfiesRange(vp.version, rp);
    if (r.match !== expected) { bad++; check(`satisfies ${ver} in ${range}`, false, `期望 ${expected} 实得 ${r.match}${r.gateBlocked ? '（被门控拦）' : ''}`); }
  }
  check(`定向 satisfies ${cases.length} 组全过`, bad === 0);
}

// ---------- 4. 坑检测 ----------
{
  const p1 = core.parseRange('^0.2.3');
  check('坑：0.x caret 锁次版本', p1.ok && p1.pitfalls.some((x) => x.type === 'zero-major-caret'));
  const p2 = core.parseRange('^0.0.3');
  check('坑：0.0.x caret 锁补丁', p2.ok && p2.pitfalls.some((x) => x.type === 'zero-zero-caret'));
  const p3 = core.parseRange('=1.2');
  check('坑：=1.2 非精确等于', p3.ok && p3.pitfalls.some((x) => x.type === 'eq-partial'));
  const p4 = core.parseRange('>1.2');
  check('坑：>1.2 跳段', p4.ok && p4.pitfalls.some((x) => x.type === 'gt-partial'));
  const p5 = core.parseRange('>=2.0.0 <2.0.0');
  check('坑：空交集组', p5.ok && p5.pitfalls.some((x) => x.type === 'empty-set'));
  const p6 = core.parseRange('^1.2.3');
  check('坑：prerelease 门控全局提示', p6.ok && p6.pitfalls.some((x) => x.type === 'prerelease-gate'));
  const p7 = core.parseRange('^1.2.3-beta.2');
  check('范围带 prerelease 时无门控提示', p7.ok && !p7.pitfalls.some((x) => x.type === 'prerelease-gate'));
  const p8 = core.parseRange('1.2.3 - 2.3');
  check('连字符部分上界 <2.4.0', p8.ok && p8.sets[0].comparators.some((c) => c.raw === '<2.4.0-0'));
  const p9 = core.parseRange('bad||range >');
  check('解析失败如实报错', !p9.ok && !!p9.error);
}

// ---------- 5. node-semver 差分对拍 ----------
{
  const ranges = [
    '^1.2.3', '^0.2.3', '^0.0.3', '^0.0.0', '^0.0', '^0', '^1', '^1.2', '^1.x', '^0.x', '^0.0.x', '^1.2.3-beta.2',
    '~1.2.3', '~1.2', '~1', '~0.2.3', '~1.2.3-beta',
    '1.2.3', '=1.2.3', '1.2', '=1.2', '1', '1.2.x', '1.x', '1.x.x', '*', 'x', '',
    '>1.2', '>=1.2', '<1.2', '<=1.2', '>1', '<1',
    '>=1.2.0 <1.3.0', '>1.2.3 <=1.9.9', '>=2.0.0 <2.0.0',
    '1.2.3 - 2.3.4', '1.2 - 2.3.4', '1.2.3 - 2.3', '1.2.3 - 2',
    '^1.2.3 || ^2.0.0', '~1.2 || ~2.1', '1.2.x || >=3.0.0 <4.0.0',
    '>=1.2.3-beta.2', '1.2.3-beta.2', '<=2.0.0-beta',
    '>=0.6.0', '^6.0.0 || ^7.0.0 || ^8.0.0', '>=18.0.0 <21.0.0', '^4.17.21',
  ];
  const versions = [
    '0.0.1', '0.0.3', '0.2.3', '0.2.9', '0.3.0', '1.0.0', '1.2.0', '1.2.2', '1.2.3', '1.2.3-alpha', '1.2.3-beta.1', '1.2.3-beta.2', '1.2.3-beta.4',
    '1.2.4', '1.2.9', '1.3.0', '1.9.9', '2.0.0', '2.0.0-alpha', '2.0.0-0', '2.3.4', '2.9.9', '3.0.0', '3.5.0', '4.17.21', '6.1.0', '7.2.3', '8.0.1',
    '18.0.0', '20.5.1', '21.0.0', '1.0.0-rc.1', '0.6.0',
  ];

  let mismatch = 0;
  let total = 0;
  for (const r of ranges) {
    const mine = core.parseRange(r);
    if (!mine.ok) { check(`对拍 range「${r}」应可解析`, false, mine.error); continue; }
    for (const v of versions) {
      const expected = semver.satisfies(v, r);
      const mineV = core.parseVersion(v);
      const got = core.satisfiesRange(mineV.version, mine).match;
      total++;
      if (got !== expected) {
        mismatch++;
        if (mismatch <= 5) check(`对拍 satisfies(${v}, ${r})`, false, `node-semver=${expected} 自研=${got}`);
      }
    }
  }
  check(`差分对拍 satisfies ${total} 组全等（node-semver 权威）`, mismatch === 0, `${mismatch} 组不一致`);

  // compare 全矩阵对拍
  const cmpVersions = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.0+build.9', '0.9.9', '2.0.0', '1.0.0-2', '1.0.0-10'];
  let cmpBad = 0;
  for (const a of cmpVersions) {
    for (const b of cmpVersions) {
      const expected = Math.sign(semver.compare(a, b));
      const got = Math.sign(core.compareParsed(core.parseVersion(a).version, core.parseVersion(b).version));
      if (expected !== got) { cmpBad++; if (cmpBad <= 3) check(`对拍 compare(${a}, ${b})`, false, `node-semver=${expected} 自研=${got}`); }
    }
  }
  check(`差分对拍 compare ${cmpVersions.length * cmpVersions.length} 组全等`, cmpBad === 0);

  // 非法 range 行为对拍：node-semver validRange 为 null 的，我们 parseRange 应不 ok
  const invalidRanges = ['not-a-range', '>=', '^1.2.3.4', '1.2.3 -', '>=a.b.c'];
  for (const r of invalidRanges) {
    const theirs = semver.validRange(r);
    const mine = core.parseRange(r);
    // 注意：'>=' 在 node-semver 里 validRange 为 null；我们应同样报错
    check(`非法 range「${r}」双实现一致拒绝（their=${JSON.stringify(theirs)}）`, mine.ok === false || (theirs !== null && theirs !== undefined));
  }
}

// ---------- 6. 排序工具 ----------
{
  const r = core.sortVersions(['1.0.0', '1.0.0-rc.1', '0.9.0', '1.0.0-alpha', 'bad-version', '2.0.0']);
  check('sort 升序正确且 rc 在正式版前', r.sorted.map((x) => x.raw).join(',') === '0.9.0,1.0.0-alpha,1.0.0-rc.1,1.0.0,2.0.0');
  check('sort 无效版本单列', r.invalid.length === 1 && /bad-version/.test(r.invalid[0].raw));
}

let failed = 0;
for (const r of results) if (!r.pass) failed++;
console.log(`\n共 ${results.length} 项断言：${results.length - failed} 通过 / ${failed} 失败`);
process.exitCode = failed > 0 ? 1 : 0;
