/**
 * 真实 PDF 抽查工具（node test/real-pdf-check.mjs <绝对路径1> [路径2 ...]）
 * 只读：对任意本地 PDF 跑 detect，打印逐页表格候选摘要（行列数/表头/首行预览）。
 * 用途：用真实世界的 PDF 人工抽查引擎效果（开发/验收辅助，不进交付冒烟链）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../service/table-engine.js');

const args = process.argv.slice(2);
if (!args.length) {
  console.log('用法: node test/real-pdf-check.mjs <pdf绝对路径> [...]');
  process.exit(1);
}

for (const p of args) {
  const label = path.basename(p);
  try {
    const bytes = fs.readFileSync(p);
    const r = await engine.runOp('detect', [{ name: label, bytes }], {});
    console.log('==', label, '→ pages:', r.pages, 'tables:', r.totalTables);
    for (const pr of r.pageResults) {
      for (const t of pr.tables) {
        console.log('  p' + pr.page + ': ' + t.rowsCount + '行×' + t.colCount + '列 fill=' + t.fillRatio + ' 表头: ' + t.header.join(' | ').slice(0, 130));
        if (t.preview[1]) console.log('    首行: ' + t.preview[1].join(' | ').slice(0, 150));
      }
      if (!pr.tables.length) console.log('  p' + pr.page + ': 未检出表格' + (pr.textLess ? '（无文字层）' : ''));
    }
    if (r.note) console.log('  note:', r.note);
  } catch (e) {
    console.log('==', label, 'ERR:', String(e && e.message || e).slice(0, 150));
  }
}
