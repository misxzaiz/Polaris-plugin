'use strict';
/**
 * run-tests.mjs —— 纯函数调度核心金标对拍（node:test 风格自写 runner）
 *
 * 金标来源：
 *  - PROBE_CRON_*：主仓临时探针 cargo test --test cron_probe -- --nocapture 实测
 *    （cron crate 真实行为；运行时刻 2026-11-11T00:30:00~00:30:30Z，故部分探针值
 *     与「注入 now=2026-11-11T00:00:00Z」的手算值不同——凡探针值与手算值一致者
 *     同时断言两者，不一致者只断言手算值并在注释标注探针佐证语义）。
 *  - parse_interval / calculate_next_run / apply_template 用例 ← models/scheduler.rs #[cfg(test)]
 *  - extract_user_content / needs_backup 用例 ← protocol_task.rs #[cfg(test)]
 *  - update/updateStatus 重算规则 ← sqlite_task_storage.rs:292-330
 */
import { createRequire } from 'node:module';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const engine = require('../shared/engine.js');
const protocol = require('../shared/protocol.js');

const results = { pass: 0, fail: 0, failures: [] };
function t(name, fn) {
  try { fn(); results.pass += 1; console.log(`  ✓ ${name}`); } catch (e) {
    results.fail += 1; results.failures.push(`${name}: ${e.message}`);
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

// 锚点：2026-11-11T00:00:00Z（周三）= 1794355200
const T0 = 1794355200;
const probeNow = 1773139200; // 探针注释锚点（实际被 cron 忽略，见 spec §6-1）

// ── parseInterval（金标 models/scheduler.rs test_parse_interval）────────────
t('parseInterval 金标: 30s/5m/2h/1d/invalid', () => {
  assert.strictEqual(engine.parseInterval('30s'), 30);
  assert.strictEqual(engine.parseInterval('5m'), 300);
  assert.strictEqual(engine.parseInterval('2h'), 7200);
  assert.strictEqual(engine.parseInterval('1d'), 86400);
  assert.strictEqual(engine.parseInterval('invalid'), null);
});
t('parseInterval 边界: 空串/未知单位/大小写/非整数', () => {
  assert.strictEqual(engine.parseInterval(''), null);
  assert.strictEqual(engine.parseInterval('10x'), null);
  assert.strictEqual(engine.parseInterval('3M'), 180); // 金标探针: 3M → +180（M 小写化 = 分钟）
  assert.strictEqual(engine.parseInterval('1.5m'), null); // Rust i64 parse 失败
  assert.strictEqual(engine.parseInterval('5'), null); // 无后缀
});

// ── calculateNextRun: interval / once（金标 test_calculate_next_run_interval）─
t('calculateNextRun interval: now+300', () => {
  assert.strictEqual(engine.calculateNextRun('interval', '5m', 1000), 1300);
});
t('calculateNextRun once: 未来 Some/过去 None/非法 None（金标语义）', () => {
  assert.strictEqual(engine.calculateNextRun('once', '2026-11-11T01:00:00Z', T0), 1794358800);
  assert.strictEqual(engine.calculateNextRun('once', '2026-11-10T01:00:00Z', T0), null); // 过去过滤 ts>now
  assert.strictEqual(engine.calculateNextRun('once', 'bad', T0), null);
});
t('calculateNextRun after_completion 等同 interval 数值行为', () => {
  assert.strictEqual(engine.calculateNextRun('after_completion', '30s', T0), T0 + 30);
});

// ── cron：与 cron crate 语义对拍 ─────────────────────────────────────────────
const CRON_GOLDEN = [
  // [expr, expected(T0 起算), 探针值(运行时刻起算，仅语义佐证)]
  ['0 0 9 * * *', 1794387600, 1794387600],
  ['30 0 12 * * MON-FRI', 1794398430, 1794398430],
  ['0 0 0 1 * *', 1796083200, 1796083200],
  ['0 30 8 1,15 * *', 1794731400, 1794731400],
  ['59 59 23 * * *', 1794441599, 1794441599],
  ['0 0 9-18 * * MON-FRI', 1794387600, 1794387600],
  ['0 15 10 * * SUN', 1794737700, 1794737700],
  ['0 0 9 29 2 *', 1835427600, 1835427600], // 下一个闰年 2/29 = 2028
  ['@hourly', 1794358800, 1794358800],
  ['0 0 12 * * SAT,SUN', 1794657600, 1794657600],
  ['0 0 8 * * 1', 1794729600, 1794729600], // dow=1=Sunday（探针实测 11-15 周日）
  ['0 0 8 * * 7', 1794643200, 1794643200], // dow=7=Saturday（探针实测 11-14 周六）
];
for (const [expr, expected, probe] of CRON_GOLDEN) {
  t(`cron ${JSON.stringify(expr)} @T0 → ${expected}`, () => {
    assert.strictEqual(engine.cronNext(expr, T0), expected);
    // 探针佐证：凡手算与探针一致，双锚点都断言
    if (probe !== null && expected === probe) {
      assert.strictEqual(engine.cronNext(expr, T0), probe);
    }
  });
}
t('cron "0 */5 * * * *" @T0 → 00:05（探针 00:35 佐证 */5 分钟域 + 忽略入参行为）', () => {
  assert.strictEqual(engine.cronNext('0 */5 * * * *', T0), 1794355500);
});
t('cron "*/30 * * * * *" @T0 → 00:00:30（探针 00:30:30 佐证秒域）', () => {
  assert.strictEqual(engine.cronNext('*/30 * * * * *', T0), 1794355230);
});
t('cron "0 */2 */3 * * *" @T0 → 00:02:00（探针 00:32:00 佐证 min=*/2 hour=*/3 组合）', () => {
  assert.strictEqual(engine.cronNext('0 */2 */3 * * *', T0), 1794355320);
});
t('cron "0 0 * * * *" @T0 → 01:00（每小时整点）', () => {
  assert.strictEqual(engine.cronNext('0 0 * * * *', T0), 1794358800);
});
t('cron dom+dow 同时受限 = AND（探针 0 30 8 10 * MON → 2027-05-10T08:30Z）', () => {
  // 2027-05-10T08:30:00Z = 探针 1809937800；AND 语义：10 号且周一
  assert.strictEqual(engine.cronNext('0 30 8 10 * MON', 1794355200), 1809937800);
});
t('cron dow=0 非法 → None（探针实测 None）', () => {
  assert.strictEqual(engine.cronNext('0 0 8 * * 0', T0), null);
});
t('cron 5 字段（无秒）→ null（cron crate 需 6/7 字段，与主仓一致）', () => {
  assert.strictEqual(engine.cronNext('0 9 * * *', T0), null);
});
t('cron 非法表达式 → null', () => {
  assert.strictEqual(engine.cronNext('bad', T0), null);
  assert.strictEqual(engine.cronNext('0 0 9 * * * * *', T0), null); // 8 段
  assert.strictEqual(engine.cronNext('', T0), null);
});
t('cron 7 字段 year=* 合法（cron crate 语义）', () => {
  assert.strictEqual(engine.cronNext('0 0 9 * * * *', T0), 1794387600);
});
t('cron year 字段支持', () => {
  assert.strictEqual(engine.cronNext('0 0 0 1 1 * 2030', T0), Date.UTC(2030, 0, 1) / 1000);
});
t('cron 忽略注入 now 的金标行为：不传 now 时用真实时钟', () => {
  const v = engine.cronNext('0 0 9 * * *');
  assert.ok(typeof v === 'number' && v > 0);
});

// ── applyTemplate（金标 models/scheduler.rs，UTC 取值）──────────────────────
t('applyTemplate 全变量（UTC + 中文星期）', () => {
  // 2026-11-11T00:00Z 是周三
  const out = engine.applyTemplate(
    'P={{prompt}}|N={{taskName}}|D={{date}}|T={{time}}|DT={{datetime}}|W={{weekday}}',
    '日报任务', '写日报', Date.UTC(2026, 10, 11, 0, 30),
  );
  assert.strictEqual(out, 'P=写日报|N=日报任务|D=2026-11-11|T=00:30|DT=2026-11-11 00:30|W=星期三');
});
t('applyTemplate 无变量透传', () => {
  assert.strictEqual(engine.applyTemplate('plain', 'n', 'p'), 'plain');
});

// ── 协议文档（金标 protocol_task.rs 4 个 #[test] 逐条翻译）──────────────────
t('extractUserContent 金标用例', () => {
  const content = '# 用户补充\n\n> 用于临时调整任务方向或补充要求\n\n---\n\n<!-- 在下方添加补充内容 -->\n\n这是用户的补充内容\n第二行\n\n\n';
  assert.strictEqual(protocol.extractUserContent(content), '这是用户的补充内容\n第二行');
});
t('hasSupplementContent 金标用例（空/有内容）', () => {
  const empty = '# 用户补充\n\n<!-- 在下方添加补充内容 -->\n\n\n\n\n';
  assert.strictEqual(protocol.hasSupplementContent(empty), false);
  const withC = '# 用户补充\n\n<!-- 在下方添加补充内容 -->\n\n有内容\n';
  assert.strictEqual(protocol.hasSupplementContent(withC), true);
});
t('needsBackup 金标用例（100 行 false / 900 行 true，阈值 800）', () => {
  assert.strictEqual(protocol.needsBackup('line\n'.repeat(100)), false);
  assert.strictEqual(protocol.needsBackup('line\n'.repeat(900)), true);
});
t('时间戳 14 位与任务路径格式（本地时区，金标 Local::now）', () => {
  const ts = protocol.generateTimestamp(new Date(2026, 10, 11, 1, 2, 3).getTime());
  assert.strictEqual(ts, '20261111010203');
  const p = protocol.generateTaskPathFromTimestamp(ts);
  assert.ok(p.startsWith('.polaris/tasks/'));
  assert.strictEqual(protocol.extractTimestamp(p), ts);
});
t('countLines 对齐 Rust lines().count()', () => {
  assert.strictEqual(protocol.countLines(''), 0);
  assert.strictEqual(protocol.countLines('a\nb'), 2);
  assert.strictEqual(protocol.countLines('a\n'), 1);
  assert.strictEqual(protocol.countLines('a'), 1);
});

// ── 协议任务目录结构端到端（金标 create_task_structure）─────────────────────
t('createTaskStructure 落盘四件套 + buildProtocolPrompt 拼装', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisched-proto-'));
  try {
    const fixedMs = new Date(2026, 10, 11, 12, 0, 0).getTime();
    const taskPath = protocol.createTaskStructure(dir, '20261111000000', '完成功能 X', null, fixedMs);
    assert.strictEqual(taskPath, '.polaris/tasks/20261111120000');
    assert.ok(fs.existsSync(path.join(dir, taskPath, 'protocol.md')));
    assert.ok(fs.existsSync(path.join(dir, taskPath, 'supplement.md')));
    assert.ok(fs.existsSync(path.join(dir, taskPath, 'memory', 'index.md')));
    assert.ok(fs.existsSync(path.join(dir, taskPath, 'memory', 'tasks.md')));
    assert.ok(fs.existsSync(path.join(dir, '.oprcli', 'tasks', protocol.extractTimestamp(taskPath), 'supplement-history')));

    const prompt = protocol.buildProtocolPrompt(dir, taskPath);
    assert.ok(prompt.includes('# 任务协议'));
    assert.ok(prompt.includes('# 当前状态'));
    assert.ok(prompt.includes('## 进度索引'));
    assert.ok(prompt.includes('## 任务队列'));
    // supplement 无内容 → 无「用户补充（当前轮次）」段
    assert.ok(!prompt.includes('# 用户补充（当前轮次）'));

    // 写补充后 prompt 含用户补充段
    protocol.updateSupplement(dir, taskPath, '补充内容模板\n\n<!-- 在下方添加补充内容 -->\n\n urgent 修复');
    const prompt2 = protocol.buildProtocolPrompt(dir, taskPath);
    assert.ok(prompt2.includes('# 用户补充（当前轮次）'));
    assert.ok(prompt2.includes('urgent 修复'));

    // clearSupplement 恢复模板
    protocol.clearSupplement(dir, taskPath);
    assert.strictEqual(protocol.hasSupplementContent(protocol.readSupplement(dir, taskPath)), false);

    // backupSupplement / backupDocument
    const bp = protocol.backupSupplement(dir, taskPath, '重要补充');
    assert.ok(fs.existsSync(bp) && bp.includes('supplement-history'));
    const bd = protocol.backupDocument(dir, taskPath, 'protocol', 'x\n'.repeat(10), '摘要');
    assert.ok(fs.existsSync(bd) && bd.includes('doc-history'));
    assert.ok(fs.readFileSync(bd, 'utf8').includes('## 摘要'));

    // deleteTaskStructure 双目录删除
    protocol.deleteTaskStructure(dir, taskPath);
    assert.ok(!fs.existsSync(path.join(dir, taskPath)));
    assert.ok(!fs.existsSync(path.join(dir, '.oprcli', 'tasks', protocol.extractTimestamp(taskPath))));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
t('generateProtocolMd 与模板渲染路径（templateContent 优先）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisched-gen-'));
  try {
    const taskPath = protocol.createTaskStructure(dir, 'tid', '使命', '自定义协议 {{mission}} @ {{workspaceRoot}}');
    const md = fs.readFileSync(path.join(dir, taskPath, 'protocol.md'), 'utf8');
    assert.ok(md.includes('自定义协议 使命'));
    assert.ok(md.includes('@ ' + dir));
    assert.ok(!md.includes('{{mission}}'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
t('renderProtocolFromTemplate {{createdAt}}/{{currentDate}} 占位（本地时区）', () => {
  const out = protocol.renderProtocolFromTemplate('t1', 'm', 'w', '20261111000000', 'A={{taskId}} B={{mission}} C={{workspaceRoot}} D={{timestamp}} E={{createdAt}} F={{currentDate}}', new Date(2026, 10, 11, 12, 34, 56).getTime());
  assert.strictEqual(out, 'A=t1 B=m C=w D=20261111000000 E=2026-11-11 12:34:56 F=2026-11-11');
});

// ── 协议模板渲染（金标 models/scheduler.rs render_protocol_template，UTC）───
t('renderProtocolTemplate 系统占位符 + 用户参数', () => {
  const out = protocol.renderProtocolTemplate(
    '{dateTime}|{date}|{time}|{weekday}|{keywords}',
    { keywords: 'AI 定时任务' },
    Date.UTC(2026, 10, 11, 3, 5),
  );
  assert.strictEqual(out, '2026-11-11 03:05|2026-11-11|03:05|星期三|AI 定时任务');
});
t('generateProtocolDocument 结构（{{taskId}}/{{workspacePath}} 保留 + 段落齐备）', () => {
  const [tpl] = require('../shared/builtin-templates.js').builtinTemplates(T0);
  const doc = protocol.generateProtocolDocument(tpl, { mission: '实现 X' }, Date.UTC(2026, 10, 11));
  assert.ok(doc.includes('> 任务ID: {{taskId}}'));
  assert.ok(doc.includes('```\n{{workspacePath}}\n```'));
  assert.ok(doc.includes('实现 X'));
  assert.ok(doc.includes('模板类型: Development'));
  assert.ok(doc.includes('## 执行规则'));
  assert.ok(doc.includes('## 补充'));
  assert.ok(doc.includes('## 协议更新'));
});
t('内置协议模板 5 条（金标 models/scheduler.rs）', () => {
  const list = require('../shared/builtin-templates.js').builtinTemplates(T0);
  assert.deepStrictEqual(list.map((x) => x.id), ['dev-feature', 'protocol-assist', 'review-code', 'news-search', 'monitor-service']);
  assert.ok(list.every((x) => x.builtin === true && x.params.length >= 1));
  const news = list.find((x) => x.id === 'news-search');
  assert.strictEqual(news.params.length, 3);
  assert.strictEqual(news.params[1].options.length, 4);
});

// ── 运行态机（金标 sqlite_task_storage.rs:292-330）──────────────────────────
const mkTask = (over) => ({
  id: 't1', name: 'n', enabled: true, triggerType: 'interval', triggerValue: '5m',
  lastRunStatus: null, lastRunAt: null, ...over,
});
t('recalcNextOnUpdate：AfterCompletion+Running → null 锁', () => {
  assert.strictEqual(engine.recalcNextOnUpdate(mkTask({ triggerType: 'after_completion', lastRunStatus: 'running' }), 100), null);
});
t('recalcNextOnUpdate：非 Running → 重算', () => {
  assert.strictEqual(engine.recalcNextOnUpdate(mkTask({ triggerType: 'after_completion', lastRunStatus: 'success' }), 100), 100 + 300);
  assert.strictEqual(engine.recalcNextOnUpdate(mkTask(), 100), 400);
});
t('recalcNextOnStatus：Running 锁 / 终态重算', () => {
  assert.strictEqual(engine.recalcNextOnStatus(mkTask({ triggerType: 'after_completion' }), 100, 'running'), null);
  assert.strictEqual(engine.recalcNextOnStatus(mkTask({ triggerType: 'after_completion' }), 100, 'success'), 400);
  assert.strictEqual(engine.recalcNextOnStatus(mkTask(), 100, 'failed'), 400);
});
t('isDue：enabled/Running 锁/nextRunAt 三闸', () => {
  assert.strictEqual(engine.isDue(mkTask({ nextRunAt: 50 }), 100), true);
  assert.strictEqual(engine.isDue(mkTask({ nextRunAt: 150 }), 100), false);
  assert.strictEqual(engine.isDue(mkTask({ nextRunAt: 50, enabled: false }), 100), false);
  assert.strictEqual(engine.isDue(mkTask({ nextRunAt: 50, lastRunStatus: 'running', lastRunAt: 90 }), 100), false);
  assert.strictEqual(engine.isDue(mkTask({ nextRunAt: null }), 100), false);
});
t('isDue：Running 卡死自愈（默认 30min / timeoutMinutes 覆盖）', () => {
  const stale = mkTask({ nextRunAt: null, lastRunStatus: 'running', lastRunAt: 100 });
  assert.strictEqual(engine.isDue(stale, 100 + 1800), false); // 恰好阈值内不触发
  assert.strictEqual(engine.isDue(stale, 100 + 1801), 'stale');
  const stale2 = mkTask({ nextRunAt: null, lastRunStatus: 'running', lastRunAt: 100, timeoutMinutes: 1 });
  assert.strictEqual(engine.isDue(stale2, 100 + 61), 'stale');
});

// ── 汇总 ───────────────────────────────────────────────────────────────────
console.log(`\n${results.pass} passed, ${results.fail} failed`);
if (results.fail > 0) {
  console.error(results.failures.join('\n'));
  process.exit(1);
}
