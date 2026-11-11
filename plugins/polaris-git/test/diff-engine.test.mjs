/**
 * diff 引擎单测（node 原生 type-stripping 直跑 TS；断言行为锁定）
 * 运行前需 node >= 22.6（23.6+ 免 flag）。
 */
import assert from 'node:assert';
import { computeLineDiff, parseUnifiedPatch, diffLines, buildHunks, wordSegments, splitLines } from '../src/model/diffEngine.ts';

let n = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  n++;
}

// ── 基础 add/del/ctx ─────────────────────────────────────────
{
  const r = computeLineDiff('a\nb\nc', 'a\nX\nc');
  ok(r.hunks.length === 1, '单处修改=1 hunk');
  ok(r.additions === 1 && r.deletions === 1, '增删各1');
  ok(!r.truncated, '未截断');
  const lines = r.hunks[0].lines;
  ok(lines.some((l) => l.type === 'del' && l.text === 'b' && l.aLine === 2), 'del 行号正确');
  ok(lines.some((l) => l.type === 'add' && l.text === 'X' && l.bLine === 2), 'add 行号正确');
  ok(lines.some((l) => l.type === 'ctx' && l.text === 'a' && l.aLine === 1 && l.bLine === 1), 'ctx 行号正确');
  // 词级高亮：相邻 del+add 配对
  const del = lines.find((l) => l.type === 'del');
  const add = lines.find((l) => l.type === 'add');
  ok(Array.isArray(del.segments) && Array.isArray(add.segments), '相邻行对有词级 segments');
  ok(add.segments.some((s) => s.changed && s.text === 'X'), '新词标记 changed');
  ok(del.segments.some((s) => s.changed && s.text === 'b'), '旧词标记 changed');
}

// ── 全新增 / 全删除 ──────────────────────────────────────────
{
  const r = computeLineDiff(null, 'x\ny');
  ok(r.hunks.length === 1 && r.additions === 2 && r.deletions === 0, '空→两行全为 add');
  ok(r.hunks[0].lines.every((l) => l.type === 'add'), '无 ctx');
  const r2 = computeLineDiff('x\ny', null);
  ok(r2.deletions === 2 && r2.additions === 0, '两行→空全为 del');
}

// ── 无变化 ───────────────────────────────────────────────────
{
  const r = computeLineDiff('same\ntext', 'same\ntext');
  ok(r.hunks.length === 0 && r.additions === 0 && r.deletions === 0, '无差异=无 hunk');
}

// ── 两处独立修改切成两个 hunk ────────────────────────────────
{
  const old = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const now = ['1', '2', 'A', '4', '5', '6', '7', '8', '9', '10', 'B'];
  const r = computeLineDiff(old.join('\n'), now.join('\n'));
  ok(r.hunks.length === 2, `远距修改=2 hunk（实得 ${r.hunks.length}）`);
  ok(r.additions === 2 && r.deletions === 1, '统计正确');
}

// ── 大文件截断护栏 ───────────────────────────────────────────
{
  const big = Array.from({ length: 30000 }, (_, i) => `line ${i}`).join('\n');
  const r = computeLineDiff(big, big + '\nextra');
  ok(r.truncated && r.hunks.length === 0, '超限截断且不渲染');
}

// ── diffLines 纯函数：顺序敏感性 ─────────────────────────────
{
  const ops = diffLines(['a', 'b'], ['b', 'a']);
  ok(ops.some((o) => o.type === 'add') && ops.some((o) => o.type === 'del'), '换序识别为增删');
}

// ── 词级 segments 独立可调 ───────────────────────────────────
{
  const seg = wordSegments('const a = 1;', 'const a = 2;');
  ok(seg.del.some((s) => s.changed && s.text === '1'), '旧值 changed');
  ok(seg.add.some((s) => s.changed && s.text === '2'), '新值 changed');
  ok(seg.add.some((s) => !s.changed && s.text === 'const'), '未变词保持');
}

// ── unified patch 解析（stash_show 形态）─────────────────────
{
  const patch = [
    'commit abc123',
    'diff --git a/f.txt b/f.txt',
    'index 111..222 100644',
    '--- a/f.txt',
    '+++ b/f.txt',
    '@@ -1,3 +1,3 @@',
    ' ctx',
    '-old',
    '+new',
    ' ctx2',
    '\\ No newline at end of file',
  ].join('\n');
  const r = parseUnifiedPatch(patch);
  ok(r.hunks.length === 1, '1 hunk');
  ok(r.hunks[0].aStart === 1 && r.hunks[0].bStart === 1, '头行号解析');
  ok(r.additions === 1 && r.deletions === 1, '统计正确');
  const types = r.hunks[0].lines.map((l) => l.type);
  assert.deepStrictEqual(types, ['ctx', 'del', 'add', 'ctx']);
  n++;
  ok(r.hunks[0].lines[0].text === 'ctx' && r.hunks[0].lines[1].text === 'old', '剥掉前缀符号');
  // 空上下文行（diff 里以空格开头被某些工具剥掉）
  const r2 = parseUnifiedPatch('@@ -1,1 +1,1 @@\n-old\n+new');
  ok(r2.hunks.length === 1 && r2.additions === 1 && r2.deletions === 1, '无上下文行也能解析');
}

// ── splitLines 行尾归一 ──────────────────────────────────────
{
  ok(splitLines('a\nb\n').length === 2, '行尾换行不产生空行');
  ok(splitLines('').length === 0, '空串=0 行');
  ok(splitLines('a\r\nb').length === 2 && splitLines('a\r\nb')[0] === 'a\r', '仅按 \\n 切，\\r 留给渲染层（不改内容语义）');
}

// ── buildHunks 独立调用 ──────────────────────────────────────
{
  const ops = diffLines(['1', '2', '3'], ['1', 'X', '3']);
  const hunks = buildHunks(ops, 1);
  // ctx(1) del(2) add(X) ctx(3)：change 块 [del,add] 前后各 1 行上下文 → 4 行
  ok(hunks.length === 1 && hunks[0].lines.length === 4, `context=1 → 4 行 hunk（实得 ${hunks[0]?.lines.length}）`);
  ok(hunks[0].aStart === 1 && hunks[0].bStart === 1, 'hunk 起始行号');
}

console.log(`✓ diff-engine.test.mjs ${n} 断言通过`);
