#!/usr/bin/env node
/**
 * merge-usage-tier.mjs — 把人工打分的使用习惯分级合并进 index.json
 *
 * 数据源：cap.kv 键 `usage.rating.<pluginId>` → { rating: 1-10, ratedAt }
 * （打分经 Polaris 交互面板人工完成，本脚本内嵌映射与 cap.kv 一致，
 *   写入 index.json 每插件 usageTier 字段）
 *
 * 用法： node scripts/merge-usage-tier.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const INDEX = resolve(import.meta.dirname, '../index.json')

// ── 人工打分映射（2026-11-04 六批交互面板，与 cap.kv usage.rating.* 同源）──
const RATINGS = {
  // 批1 (1-20)
  multichat: 1, 'polaris.marketplace': 8, 'relay-devkit': 8, 'workspace-manager': 1,
  'image-recognition': 9, 'mimo-tts': 5, agnes: 3, 'animation-3d': 1, 'animation-2d': 1,
  'douyin-publish': 1, 'battle-mode': 1, 'capability-runtime': 1, 'news-curator': 3,
  'opts.zcode-bridge': 3, 'data-ark': 2, 'clip-relay': 2, 'page-sentinel': 3,
  'feed-radar': 2, 'pocket-ledger': 8, memoryforge: 1,
  // 批2 (21-40)
  'pocket-host': 3, 'paper-radar': 2, 'plugin-forge': 4, 'bookmark-dig': 1,
  'pocket-drop': 1, sundial: 1, 'time-sift': 2, 'net-sentinel': 5, 'disk-radar': 1,
  'decision-journal': 1, amber: 1, abacus: 1, 'time-trail': 1, 'ask-stove': 1,
  tether: 1, lingxi: 1, 'opts.zcode-adapter': 2, watchtower: 5, 'quote-sentinel': 6,
  changqi: 1,
  // 批3 (41-60)
  shouzha: 1, guanzhi: 1, qimu: 1, gezhi: 1, qingnang: 1, wenjin: 1, zhifang: 1,
  quanfu: 1, piaoxia: 1, jinkui: 1, weibian: 1, xintu: 1, chexia: 1, duzhi: 1,
  maian: 1, flashforge: 5, yizhou: 2, needs: 8, zhuangxiu: 1, imgforge: 1,
  // 批4 (61-80)
  'webhook-station': 1, 'mcp-probe': 1, 'context-pack': 1, keyscan: 1, 'log-lens': 1,
  'llm-probe': 1, 'pdf-tables': 1, 'api-bench': 1, 'file-flow': 1, 'site-audit': 1,
  'task-runner': 1, 'mock-server': 1, 'ocr-bench': 1, 'sqlite-lens': 1, 'har-lens': 1,
  'domain-probe': 1, 'stream-desk': 1, 'prompt-matrix': 1, 'dep-probe': 1,
  'daw-studio': 1,
  // 批5 (81-100)
  'whale-pet': 8, 'repo-lens': 1, 'dev-toolbox': 1, 'db-workbench': 1, 'mail-desk': 1,
  'bundle-lens': 1, 'cdn-audit': 1, 'deadcode-lens': 1, 'diff-desk': 1, 'stack-lens': 1,
  'docker-desk': 1, 'llm-request-desk': 1, 'query-plan-lens': 1, 'openapi-desk': 1,
  'exec-sandbox': 6, 'cookie-lens': 1, 'cron-lens': 1, 'csv-lens': 1, 'data-query': 1,
  'datetime-lens': 1,
  // 批6 (101-118)
  'encoding-lens': 1, 'env-drift': 1, 'flow-pipeline': 1, 'gitignore-lens': 1,
  'id-lens': 1, 'json-repair': 1, 'jwt-desk': 1, 'prompt-guard': 1, 'regex-desk': 1,
  'schema-check': 1, 'schema-mock': 1, 'swarm-lab': 1, 'text-triage': 1,
  'trace-lens': 1, 'unicode-lens': 1, 'url-lens': 1, 'version-lens': 1, 'yaml-lens': 1,
}

const index = JSON.parse(readFileSync(INDEX, 'utf8'))
const plugins = index.plugins
const ids = new Set(plugins.map((p) => p.id))

// 校验：映射覆盖全部插件、无多余 id
const missing = [...ids].filter((id) => !(id in RATINGS))
const extra = Object.keys(RATINGS).filter((id) => !ids.has(id))
if (missing.length || extra.length) {
  if (missing.length) console.error(`✗ 未打分的插件: ${missing.join(', ')}`)
  if (extra.length) console.error(`✗ 映射中不存在的插件: ${extra.join(', ')}`)
  process.exit(1)
}

let n = 0
for (const p of plugins) {
  const r = RATINGS[p.id]
  if (typeof r === 'number' && r >= 1 && r <= 10) {
    p.usageTier = r
    n++
  }
}

writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log(`✅ 已写入 usageTier 到 ${n}/${plugins.length} 个插件`)

// 分布统计
const dist = {}
for (const p of plugins) dist[p.usageTier] = (dist[p.usageTier] ?? 0) + 1
console.log('分布:', Object.entries(dist).sort((a, b) => b[0] - a[0]).map(([k, v]) => `${k}:${v}`).join('  '))