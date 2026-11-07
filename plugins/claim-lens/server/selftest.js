'use strict';
/**
 * selftest.js —— 试金石自检（服务 /api/selftest 与 MCP claim_selftest 共用）
 *
 * 在系统临时目录搭一个 mini fixture 仓，对五类核验原语跑断言，结束清理。
 * 覆盖：文件存在/缺失/大小写 partial/git 交叉、符号定义/仅引用/refuted/全库不证伪、
 *       依赖声明/幽灵依赖/别名、CLI 白名单+flag 命中/缺失/注入拒绝、配置 JSON 精确/
 *       JSONC 注释/YAML 弱证据、版本比较、提取引擎纯逻辑。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../shared/claim-core.js');
const prims = require('./verify-prims.js');

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: 期望 ${JSON.stringify(b)} 实得 ${JSON.stringify(a)}`);
  return true;
}

function buildFixture(rootBase) {
  const root = fs.mkdtempSync(path.join(rootBase, 'claim-lens-fixture-'));
  const w = (rel, content) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  };
  w('src/index.ts', [
    'import { readFile } from "node:fs";',
    'import express from "express";',
    'import { helper } from "./util";',
    'export const VERSION = "1.0.0";',
    'export function parseConfig(raw) {',
    '  return JSON.parse(raw);',
    '}',
    'class Engine {',
    '  constructor() {}',
    '}',
    'const unused = helper;',
    'parseConfig("{}");',
  ].join('\n'));
  w('src/util.ts', 'export function helper() { return 1; }\n');
  w('package.json', JSON.stringify({
    name: 'fixture', version: '1.0.0',
    dependencies: { express: '^4.18.0' },
    scripts: { build: 'tsc' },
    ping: { timeout: 3000 },
  }, null, 2));
  w('config/app.config.json', '{\n  // 注释应被剥离\n  "server": { "port": 8080 },\n  "debug": true\n}');
  w('config/settings.yml', 'server:\n  port: 9090\nlog:\n  level: info\n');
  w('README.md', '# fixture\nsee docs/guide.md for details\n');
  w('docs/guide.md', '# guide\n');
  return root;
}

async function runSelftest() {
  const items = [];
  const check = (name, fn) => items.push({ name, ok: false, detail: '' });
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-lens-selftest-'));
  const root = buildFixture(tmpBase);
  try {
    // 严格契约：回调返回 true/'ok' 才算过（本轮实证教训：返回 falsy 被当绿，盖住正则 bug 两轮）
    const t = (name, fn) => {
      let entry = items.find((i) => i.name === name);
      if (!entry) { entry = { name, ok: false, detail: '' }; items.push(entry); }
      try {
        const r = fn();
        entry.ok = r === true || r === 'ok';
        entry.detail = entry.ok ? '' : String(r == null ? '断言未返回 true/ok' : r).slice(0, 200);
      } catch (e) {
        entry.ok = false;
        entry.detail = String(e && e.message || e).slice(0, 200);
      }
    };

    const claims = (arr) => core.normalizeClaims(arr);

    // ── file ──
    const cFileOk = claims([{ type: 'file', target: 'src/index.ts' }])[0];
    const cFileMiss = claims([{ type: 'file', target: 'src/nonexist.ts' }])[0];
    const cFileCase = claims([{ type: 'file', target: 'SRC/INDEX.TS' }])[0];
    const cFileDir = claims([{ type: 'file', target: 'src' }])[0];
    const rF = await prims.verifyClaims(root, [cFileOk, cFileMiss, cFileCase, cFileDir], { skipGit: true });
    t('file: 存在 → verified', () => assertEq(rF.claims[0].verdict, 'verified'));
    t('file: 缺失 → refuted（父目录存在）', () => assertEq(rF.claims[1].verdict, 'refuted'));
    t('file: 大小写失配 → partial', () => assertEq(rF.claims[2].verdict, 'partial'));
    t('file: 目标是目录 → refuted', () => assertEq(rF.claims[3].verdict, 'refuted'));

    // ── symbol ──
    const cSymDef = claims([{ type: 'symbol', target: 'parseConfig', file: 'src/index.ts' }])[0];
    const cSymUse = claims([{ type: 'symbol', target: 'readFile', file: 'src/index.ts' }])[0];
    const cSymAbsent = claims([{ type: 'symbol', target: 'zombieFunction', file: 'src/index.ts' }])[0];
    const cSymRepo = claims([{ type: 'symbol', target: 'helper' }])[0];
    const cSymRepoGhost = claims([{ type: 'symbol', target: 'localStorage' }])[0];
    const rS = await prims.verifyClaims(root, [cSymDef, cSymUse, cSymAbsent, cSymRepo, cSymRepoGhost], { skipGit: true });
    t('symbol: 文件内定义 → verified', () => assertEq(rS.claims[0].verdict, 'verified'));
    t('symbol: 仅引用 → partial', () => assertEq(rS.claims[1].verdict, 'partial'));
    t('symbol: 文件存在但无符号 → refuted（硬证据）', () => assertEq(rS.claims[2].verdict, 'refuted'));
    t('symbol: 全库定义 → verified', () => assertEq(rS.claims[3].verdict, 'verified'));
    t('symbol: 全库未见（全局 API）→ unverifiable 不证伪', () => assertEq(rS.claims[4].verdict, 'unverifiable'));

    // ── package ──
    const cPkgOk = claims([{ type: 'package', target: 'express' }])[0];
    const cPkgGhost = claims([{ type: 'package', target: 'left-pad' }])[0];
    const rP = await prims.verifyClaims(root, [cPkgOk, cPkgGhost], { skipGit: true });
    t('package: 已声明 → verified', () => assertEq(rP.claims[0].verdict, 'verified'));
    t('package: 未声明未安装 → refuted', () => assertEq(rP.claims[1].verdict, 'refuted'));

    // node: 内置在提取/normalize 阶段即排除
    t('package: node: 内置在提取层即排除', () => core.pkgFromImport('node:fs') === null ? 'ok' : 'node:fs 未被排除');
    t('package: node:fs 被 normalizeClaims 拒绝', () => {
      try { core.normalizeClaims([{ type: 'package', target: 'node:fs' }]); return '未拒绝'; }
      catch (e) { return e.user ? 'ok' : String(e); }
    });

    // ── cli ──
    const cCliFlag = claims([{ type: 'cli', target: 'git', subcmd: ['switch'], flags: ['--orphan'] }])[0];
    const cCliBadFlag = claims([{ type: 'cli', target: 'git', subcmd: ['switch'], flags: ['--totally-fake-flag'] }])[0];
    const cCliDenied = claims([{ type: 'cli', target: 'powershell', flags: ['--help'] }])[0];
    const cCliMissing = claims([{ type: 'cli', target: 'git', subcmd: ['switch'], flags: ['-Z'] }])[0];
    const rC = await prims.verifyClaims(root, [cCliFlag, cCliBadFlag, cCliDenied, cCliMissing], { skipGit: true });
    t('cli: git switch --orphan → verified（真探测）', () => assertEq(rC.claims[0].verdict, 'verified'));
    t('cli: 伪造 flag → refuted', () => assertEq(rC.claims[1].verdict, 'refuted'));
    t('cli: 白名单外命令 → unverifiable', () => assertEq(rC.claims[2].verdict, 'unverifiable'));
    t('cli: -Z 短 flag → unverifiable/refuted（不虚判）', () => ['unverifiable', 'refuted'].includes(rC.claims[3].verdict) ? 'ok' : assertEq(rC.claims[3].verdict, '?'));
    t('exec: 注入 token 被校验拒绝', () => {
      const v = prims.validateProbeArgs('git', ['status; rm -rf /']);
      return v.ok === false ? 'ok' : assertEq(v.ok, false);
    });
    t('exec: 白名单外命令被拒绝', () => {
      const v = prims.validateProbeArgs('curl', ['--help']);
      return v.ok === false ? 'ok' : assertEq(v.ok, false);
    });

    // ── config ──
    const cCfgJson = claims([{ type: 'config', target: 'server.port', file: 'config/app.config.json' }])[0];
    const cCfgMiss = claims([{ type: 'config', target: 'server.host', file: 'config/app.config.json' }])[0];
    const cCfgDeep = claims([{ type: 'config', target: 'ping.timeout', file: 'package.json' }])[0];
    const cCfgYaml = claims([{ type: 'config', target: 'log.level', file: 'config/settings.yml' }])[0];
    const rCfg = await prims.verifyClaims(root, [cCfgJson, cCfgMiss, cCfgDeep, cCfgYaml], { skipGit: true });
    t('config: JSON 点路径 → verified 8080', () => assertEq(rCfg.claims[0].verdict, 'verified') || String(rCfg.claims[0].evidence).includes('8080') ? 'ok' : '');
    t('config: JSON 缺键 → refuted', () => assertEq(rCfg.claims[1].verdict, 'refuted'));
    t('config: package.json 深键 → verified', () => assertEq(rCfg.claims[2].verdict, 'verified'));
    t('config: YAML 弱证据 → partial（如实标注）', () => assertEq(rCfg.claims[3].verdict, 'partial'));

    // ── version ──
    const cVer = claims([{ type: 'version', target: 'node', constraint: '0.0.1' }])[0];
    const cVerHigh = claims([{ type: 'version', target: 'node', constraint: '99.0.0' }])[0];
    const rV = await prims.verifyClaims(root, [cVer, cVerHigh], { skipGit: true });
    t('version: node >= 0.0.1 → verified', () => assertEq(rV.claims[0].verdict, 'verified'));
    t('version: node >= 99.0.0 → refuted', () => assertEq(rV.claims[1].verdict, 'refuted'));
    t('version: 语义化比较 1.9 < 1.10', () => assertEq(prims.cmpSemver('1.9.0', '1.10.0'), -1));

    // ── 提取引擎（纯逻辑）──
    const sample = [
      '已完成登录模块：',
      '```ts',
      'import express from "express";',
      'import { readFile } from "node:fs";',
      'import { helper } from "./util";',
      'const x = require("left-pad");',
      'git switch --orphan tmp-branch',
      'pnpm add zod',
      '```',
      '改动集中在 `src/auth.ts` 与 `src/token.ts`，入口函数 `parseSession()` 定义在 `src/auth.ts` 中。',
      '需要 Node >= 18；配置见 `app.config.json` 中的 `server.port`。',
    ].join('\n');
    const ex = core.extractClaims(sample);
    t('提取: package 3 条（node:fs 排除、./util 排除）', () => {
      const pkgs = ex.claims.filter((c) => c.type === 'package').map((c) => c.target).sort();
      return assertEq(JSON.stringify(pkgs), JSON.stringify(['express', 'left-pad', 'zod']));
    });
    t('提取: cli 含 git switch --orphan', () => {
      const cli = ex.claims.find((c) => c.type === 'cli' && c.target === 'git');
      return cli && cli.flags.includes('--orphan') ? 'ok' : `flags=${JSON.stringify(cli)}`;
    });
    t('提取: file 含 src/auth.ts', () => ex.claims.some((c) => c.type === 'file' && c.target === 'src/auth.ts') ? 'ok' : JSON.stringify(ex.claims.filter((c) => c.type === 'file')));
    t('提取: symbol parseSession 挂上 src/auth.ts', () => {
      const s = ex.claims.find((c) => c.type === 'symbol' && c.target === 'parseSession');
      return s && s.file === 'src/auth.ts' ? 'ok' : JSON.stringify(s);
    });
    t('提取: version Node >= 18', () => {
      const v = ex.claims.find((c) => c.type === 'version' && c.target === 'node');
      return v && v.constraint === '18' ? 'ok' : JSON.stringify(v);
    });
    t('提取: config server.port 挂上 app.config.json', () => {
      const c = ex.claims.find((c2) => c2.type === 'config' && c2.target === 'server.port');
      return c && c.file === 'app.config.json' ? 'ok' : JSON.stringify(c);
    });
    t('提取: 去重（同 target 只一条）', () => {
      const files = ex.claims.filter((c) => c.type === 'file' && c.target === 'src/auth.ts');
      return assertEq(files.length, 1);
    });
    t('normalize: 路径穿越拒绝', () => {
      try { core.normalizeClaims([{ type: 'file', target: '../../etc/passwd' }]); return '未拒绝'; } catch (e) { return e.user ? 'ok' : String(e); }
    });
    t('normalize: 符号非法标识符拒绝', () => {
      try { core.normalizeClaims([{ type: 'symbol', target: 'foo bar' }]); return '未拒绝'; } catch (e) { return e.user ? 'ok' : String(e); }
    });
    t('formatReport: 四态齐全输出', () => {
      const report = { root, summary: { total: 4, verified: 1, refuted: 1, partial: 1, unverifiable: 1 }, claims: rF.claims.slice(0, 4).map((c, i) => ({ ...c, id: i + 1 })), gitStatusNote: '' };
      const text = core.formatReport(report);
      return text.includes('已证实') && text.includes('已证伪') && text.includes('部分核实') && text.includes('无法核验') ? 'ok' : text.slice(0, 100);
    });
  } finally {
    // 清理（best-effort）
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) { /* 忽略 */ }
  }
  const pass = items.filter((i) => i.ok).length;
  return { pass, fail: items.length - pass, items };
}

module.exports = { runSelftest, buildFixture };
