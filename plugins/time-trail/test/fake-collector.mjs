#!/usr/bin/env node
/**
 * fake-collector.mjs —— 冒烟专用脚本化采集器（经 TIMETRAIL_COLLECTOR_CMD 注入）
 *
 * 时间线（每行间隔 2s）：
 *   code ×3（6s，应用切换 +1）→ chrome ×2（4s）→ chrome idle ×3（6s+）→ 心跳循环
 * 预期归集：code≈6s / chrome≈4s / idle≈6s / switches=1 / titles.code 存在
 */
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n')
const now = () => Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  emit({ t: now(), app: 'code', title: 'Polaris - VS Code', idle: false, idleMs: 100 })
  await sleep(2000)
  emit({ t: now(), app: 'code', title: 'Polaris - VS Code', idle: false, idleMs: 200 })
  await sleep(2000)
  emit({ t: now(), app: 'code', title: 'Polaris - VS Code', idle: false, idleMs: 300 })
  await sleep(2000)
  emit({ t: now(), app: 'chrome', title: 'GitHub', idle: false, idleMs: 100 })
  await sleep(2000)
  emit({ t: now(), app: 'chrome', title: 'GitHub', idle: false, idleMs: 200 })
  await sleep(2000)
  emit({ t: now(), app: 'chrome', title: 'GitHub', idle: true, idleMs: 5000 })
  await sleep(2000)
  emit({ t: now(), app: 'chrome', title: 'GitHub', idle: true, idleMs: 7000 })
  await sleep(2000)
  emit({ t: now(), app: 'chrome', title: 'GitHub', idle: true, idleMs: 9000 })
  setInterval(() => emit({ t: now(), app: 'chrome', title: 'GitHub', idle: true, idleMs: 11000 }), 2000)
}

main().catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1) })
