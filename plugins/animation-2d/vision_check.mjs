// vision_check.mjs — 直接调用智谱 GLM-4V 识别本地图片，用于美术分析
// 用法: node vision_check.mjs <图片路径> <提示词(可选)> [--max 2000] [--config <目录>]
// 配置来源：与 image-recognition 插件 server.js 相同的多候选目录合并（APPDATA/Polaris + 注入 + 兜底），
// 消除硬编码路径与双 key 存储。可用 --config <配置目录> 显式指定（可选）。
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import os from 'node:os';

const [imgPath, ...rest] = process.argv.slice(2);
const promptArg = rest.filter(a => !a.startsWith('--')).join(' ');
const maxTok = rest.includes('--max') ? +(rest[rest.indexOf('--max') + 1] || 2000) : 2000;
const cfgDirArg = rest.includes('--config') ? rest[rest.indexOf('--config') + 1] : null;

// ── 配置读取（与 image-recognition 插件 server.js 的 loadConfig 对齐）──────────
// 候选目录：DataRoot（%APPDATA%/Polaris）+ 历史小写目录 + 显式 --config，按优先级合并。
function loadPluginConfig() {
  const candidates = [
    cfgDirArg,
    path.join(os.homedir(), 'AppData', 'Roaming', 'Polaris'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'polaris'),
  ].filter(Boolean);

  const found = {};
  for (const dir of candidates) {
    try {
      const cfgPath = path.join(dir, 'config.json');
      if (!fs.existsSync(cfgPath)) continue;
      const root = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const cfg = root.plugins?.['image-recognition'];
      if (!cfg) continue;
      for (const [k, v] of Object.entries(cfg)) {
        if (typeof v === 'string' && v.trim() !== '') found[k] = v;
        else if (typeof v !== 'string') found[k] = v;
      }
    } catch (e) {
      console.error(`[vision_check] 读取配置失败 ${dir}: ${e.message}`);
    }
  }
  return {
    apiKey: found.apiKey || '',
    model: found.model || 'glm-4v-flash',
    baseUrl: found.baseUrl || 'https://open.bigmodel.cn/api/paas/v4',
  };
}

const CFG = loadPluginConfig();
const { apiKey, model, baseUrl } = CFG;
if (!apiKey) {
  console.error('[vision_check] 未找到 image-recognition 插件配置（apiKey）。请先在 Polaris 插件面板填入，或用 --config <目录> 指定配置目录。');
  process.exit(1);
}

const ext = path.extname(imgPath).toLowerCase();
const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
const b64 = fs.readFileSync(imgPath).toString('base64');
const dataUrl = `data:${mime};base64,${b64}`;

const prompt = promptArg || '请描述这张图片的内容，尽量具体。';
const body = JSON.stringify({
  model,
  messages: [{ role: 'user', content: [
    { type: 'image_url', image_url: { url: dataUrl } },
    { type: 'text', text: prompt },
  ]}],
  max_tokens: maxTok,
});

const url = new URL(baseUrl + '/chat/completions');
const req = https.request({
  hostname: url.hostname, path: url.pathname, method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) },
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      if (j.error) { console.error('API ERROR:', JSON.stringify(j.error)); process.exit(1); }
      console.log(j.choices?.[0]?.message?.content || '(empty)');
    } catch { console.error('RAW:', data.slice(0, 500)); process.exit(1); }
  });
});
req.on('error', e => { console.error('REQ ERROR:', e.message); process.exit(1); });
req.write(body); req.end();
