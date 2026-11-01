/**
 * imgforge 测试汇总入口（node test/run-tests.mjs）
 * 依次执行五层验证：core（纯函数）→ engine（真 sharp）→ mcp（真 stdio server）→ service（mock桥+真服务）→ render（SSR）。
 * 任一层失败即整体退出码 1。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const suites = [
  ['core（纯函数：魔数/EXIF-GPS/归一/命名/护栏）', 'node', ['--test', 'test/core-verify.mjs']],
  ['engine（真 sharp：扫描/变换/二分/剥离/落盘）', 'node', ['test/engine-verify.mjs']],
  ['mcp（真 stdio server：四工具全流程+错误路径）', 'node', ['test/mcp-verify.mjs']],
  ['service（mock 桥 + 真服务 HTTP 闭环）', 'node', ['test/service-verify.mjs']],
  ['render（SSR：三 Tab UI/状态文案）', 'node', ['test/render-verify.mjs']],
];

let failed = 0;
for (const [name, cmd, args] of suites) {
  console.log(`\n━━ ${name} ━━`);
  const r = spawnSync(cmd, args, { cwd: APP_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    failed++;
    console.log(`✗ ${name} 失败（exit ${r.status}${r.signal ? ', signal ' + r.signal : ''}）`);
  }
}

console.log('\n══════════════════════════════');
if (failed) {
  console.log(`✗ ${failed} 层失败`);
  process.exit(1);
}
console.log('✓ 五层验证全绿');
