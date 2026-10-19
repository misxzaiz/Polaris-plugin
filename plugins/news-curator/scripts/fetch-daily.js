#!/usr/bin/env node
/**
 * fetch-daily.js — 「生成今日刊物」执行器（零外网、零服务）
 *
 * 设计（与规划 §3 一致）：抓取由 AI 用内置浏览器完成，本脚本不直连任何外部源。
 * 它只做两件事：
 *   1. 自检宿主 IPC 可达性（/api/health）
 *   2. 可选 --run：向宿主 scheduler 提交一条"现在执行"的 chat 任务，
 *      由 SchedulerDaemon 创建 AI 会话执行 prompt（AI 浏览器抓源 → news_publish_daily）
 *
 * 用法：
 *   node scripts/fetch-daily.js            # 自检 + 打印提示
 *   node scripts/fetch-daily.js --run      # 触发一次 chat 执行器（真正生成日报）
 *
 * 环境变量：POLARIS_HOST/POLARIS_PORT/POLARIS_TOKEN（同 MCP server）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_PROMPT = [
  '你是"AI 每日刊物"生成器。今天的任务：',
  '1) 用内置浏览器（browser_acquire/navigate/context）访问数据源：天天基金排行、Hacker News、微博热搜或头条热榜、Product Hunt、HuggingFace Trending（抓不到的源跳过并标注"源暂不可用"）；',
  '2) 先调 news_get_profile 读取用户偏好，按偏好加权筛选；与 news.sources.last 对比去重；',
  '3) 用 news_publish_daily 发布日报：date=今天，sections 至少含 summary/fund/tech/news 四类（creative/learn 有则加），totalMinutes 估算阅读时长；',
  '4) 若用户语音已开启，再调 news_brief 把摘要章节转播报稿交给 mimo_tts_synthesize 合成（数据 URL）。',
].join('\n');

// ── Polaris IPC 自发现（同 MCP server）──────────────────────────────────────
const ENV_HOST = process.env.POLARIS_HOST || '';
const ENV_PORT = parseInt(process.env.POLARIS_PORT || '', 10);
const ENV_TOKEN = process.env.POLARIS_TOKEN || '';

function configCandidates() {
  const cands = [];
  for (const anchor of [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '',
    path.join(os.homedir(), '.config', 'Polaris', 'anchor.json'),
    path.join(os.homedir(), '.polaris', 'anchor.json'),
  ]) {
    try {
      const a = JSON.parse(fs.readFileSync(anchor, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) cands.push(path.join(a.dataRoot, 'config.json'));
    } catch (_) { /* 跳过 */ }
  }
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  return cands;
}
function loadWebConfig() {
  for (const p of configCandidates()) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      const web = root.web || {};
      if (typeof web.port === 'number') return { host: web.host || '', port: web.port, token: web.token || '' };
    } catch (_) { /* 跳过 */ }
  }
  return null;
}
function healthCheck(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: '/api/health', timeout: 1200 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
let _endpointPromise = null;
function resolveEndpoint() {
  if (!_endpointPromise) {
    _endpointPromise = (async () => {
      if (ENV_HOST && Number.isFinite(ENV_PORT)) return { host: ENV_HOST, port: ENV_PORT, token: ENV_TOKEN };
      const cfg = loadWebConfig();
      const cfgHost = (cfg && cfg.host) || '';
      const host = cfgHost && cfgHost !== '0.0.0.0' ? cfgHost : '127.0.0.1';
      const basePort = cfg ? cfg.port : 3000;
      const token = cfg ? cfg.token : '';
      for (let i = 0; i < 25; i++) {
        if (await healthCheck(host, basePort + i)) return { host, port: basePort + i, token };
      }
      return { host, port: basePort, token };
    })();
  }
  return _endpointPromise;
}
function polarisIpc(command, args = {}) {
  return new Promise((resolve, reject) => {
    resolveEndpoint()
      .then((ep) => {
        const data = JSON.stringify(args);
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        if (ep.token) headers['Authorization'] = `Bearer ${crypto.createHash('md5').update(ep.token).digest('hex')}`;
        const req = http.request(
          { hostname: ep.host, port: ep.port, path: `/api/${command.replace(/_/g, '-')}`, method: 'POST', headers, timeout: 30000 },
          (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
              try { resolve(JSON.parse(buf)); } catch (e) { resolve(buf); }
            });
          }
        );
        req.on('error', (e) => reject(new Error(`Polaris IPC ${command} 失败: ${e.message}`)));
        req.on('timeout', () => { req.destroy(); reject(new Error('Polaris IPC timeout')); });
        req.write(data);
        req.end();
      })
      .catch((e) => reject(e));
  });
}

async function main() {
  const run = process.argv.includes('--run');
  const ep = await resolveEndpoint();
  if (!run) {
    console.log('✅ 宿主可达：%s:%d（%s）', ep.host, ep.port, ep.token ? '带认证' : '无认证');
    console.log('说明：本执行器不直连外网。正式生成请让 AI 会话执行——两种方式：');
    console.log('  1) 对话里说"生成今天的日报"（AI 用内置浏览器抓源 → news_publish_daily）');
    console.log(`  2) 本脚本加 --run 提交 chat 任务：node scripts/fetch-daily.js --run`);
    return;
  }
  const res = await polarisIpc('scheduler_create_task', {
    name: '每日刊物（手动触发）',
    triggerType: 'once',
    triggerValue: new Date().toISOString(),
    executorType: 'chat',
    executorParams: { prompt: DEFAULT_PROMPT },
    tags: ['news-curator'],
  });
  console.log('✅ 已提交 chat 任务：', JSON.stringify(res));
}

main().catch((e) => {
  console.error('执行器失败:', e.message);
  process.exit(1);
});
