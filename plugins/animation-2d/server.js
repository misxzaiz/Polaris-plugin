#!/usr/bin/env node
/**
 * animation-2d 渲染 HTTP 服务 — 供活动栏面板触发渲染/预览。
 *
 * 端点：
 *   GET  /__health                     健康检查
 *   POST /render/stills  {times, out}  渲染指定时刻静帧 PNG（times: "1.2,3.4"）
 *   POST /render/sheet   {times, out, cols?, width?}  联系方式图（视觉检查）
 *   POST /render/video   {range?, out?}  出片 MP4（--clip 直出，可选 --range=a:b）
 *   POST /render/frames  {range?, out?}  帧序列 JPEG（并行渲染到 out/frames）
 *   POST /encode         {out?}          已有帧序列 → MP4
 *   GET  /file?path=...                  插件目录内图片（面板预览）
 *   POST /vision         {image, prompt} GLM-4V 质检（服务端代理，免浏览器读文件限制）
 *
 * 启动：node server.js <port> <pluginDir>
 * 渲染由 render.mjs 驱动（headless Chrome + p5.brush），cwd 必须为插件目录。
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const PORT = parseInt(process.argv[2] || '0', 10);
const PLUGIN_DIR = process.argv[3] || path.resolve(__dirname);

// 渲染参数固定值（与 render.mjs 默认一致）
const FPS = 24;

function render(args, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['render.mjs', ...args, ...extraArgs], {
      cwd: PLUGIN_DIR,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    p.stdout.on('data', (c) => (out += c));
    p.stderr.on('data', (c) => (err += c));
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true, stdout: out.trim(), stderr: err.trim() });
      else reject(new Error(`render.mjs 退出码 ${code}: ${err.trim() || out.trim()}`));
    });
  });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

// CORS：面板（主应用 webview）与渲染服务不同源（dev http://localhost:9827 / 生产 tauri://localhost），
// 服务仅监听 127.0.0.1，允许任意来源即可（本机回环，无暴露面扩大风险）。
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...corsHeaders() });
  res.end(JSON.stringify(data));
}

// ── GLM-4V 质检（复用 image-recognition 插件配置）─────────────────────────────
function loadVisionConfig() {
  const found = {};
  for (const dir of [path.join(os.homedir(), 'AppData', 'Roaming', 'Polaris'), path.join(os.homedir(), 'AppData', 'Roaming', 'polaris')]) {
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
    } catch (_) { /* skip */ }
  }
  return { apiKey: found.apiKey || '', model: found.model || 'glm-4v-flash', baseUrl: found.baseUrl || 'https://open.bigmodel.cn/api/paas/v4' };
}

function callVision(imagePath, prompt, maxTokens = 2000) {
  const cfg = loadVisionConfig();
  if (!cfg.apiKey) return Promise.reject(new Error('未找到 image-recognition 插件配置（apiKey）'));
  const ext = path.extname(imagePath).toLowerCase();
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  const body = JSON.stringify({
    model: cfg.model,
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}` } },
      { type: 'text', text: prompt },
    ] }],
    max_tokens: maxTokens,
  });
  const url = new URL(cfg.baseUrl + '/chat/completions');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}`, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) return reject(new Error(`视觉 API 错误: ${JSON.stringify(j.error)}`));
          let content = j.choices?.[0]?.message?.content || '(empty)';
          const m = String(content).match(/<answer>([\s\S]*?)<\/answer>/i);
          if (m) content = m[1].trim();
          resolve(String(content));
        } catch (e) { reject(new Error(`响应解析失败: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // CORS 预检：POST + application/json 触发，直接放行
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  try {
    // 健康检查
    if (url.pathname === '/__health') {
      return json(res, 200, { status: 'ok', uptime: process.uptime(), pluginDir: PLUGIN_DIR });
    }

    // 静态图片：面板预览渲染结果（仅插件目录内）
    if (req.method === 'GET' && url.pathname === '/file') {
      const fp = url.searchParams.get('path');
      if (!fp) return json(res, 400, { error: '缺少 path 参数' });
      const resolved = path.resolve(fp);
      if (!resolved.startsWith(path.resolve(PLUGIN_DIR))) {
        return json(res, 403, { error: '路径超出插件目录' });
      }
      if (!fs.existsSync(resolved)) return json(res, 404, { error: '文件不存在' });
      const ext = path.extname(resolved).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, ...corsHeaders() });
      fs.createReadStream(resolved).pipe(res);
      return;
    }

    // GLM-4V 质检（面板调用，服务端读文件 + 调智谱）
    if (req.method === 'POST' && url.pathname === '/vision') {
      const { image, prompt, maxTokens } = await parseBody(req);
      if (!image) return json(res, 400, { error: '缺少 image 路径' });
      const resolved = path.resolve(image);
      if (!resolved.startsWith(path.resolve(PLUGIN_DIR))) return json(res, 403, { error: '路径超出插件目录' });
      if (!fs.existsSync(resolved)) return json(res, 404, { error: '文件不存在' });
      const text = await callVision(resolved, prompt || '请审查这张 2D 手绘动画帧。', maxTokens || 2000);
      return json(res, 200, { ok: true, image: resolved, verdict: text });
    }

    if (req.method === 'POST' && url.pathname === '/render/stills') {
      const { times, out, loop } = await parseBody(req);
      if (!times) return json(res, 400, { error: '缺少 times（逗号分隔的时刻，如 "1.2,3.4"）' });
      const outPath = out || path.join(PLUGIN_DIR, 'out', 'stills');
      const extra = loop ? [`--loop=${loop}`] : [];
      // 渲染前快照 mtime，只返回本次新增/更新的帧
      const dir = outPath && fs.existsSync(outPath) && fs.statSync(outPath).isDirectory() ? outPath : path.dirname(outPath);
      const before = new Map();
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (/\.png$/i.test(f)) {
            const fp = path.join(dir, f);
            before.set(fp, fs.statSync(fp).mtimeMs);
          }
        }
      }
      const r = await render([`--stills=${times}`, `--out=${outPath}`], extra);
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(dir, f))
            .filter((fp) => !before.has(fp) || fs.statSync(fp).mtimeMs > before.get(fp))
        : [];
      return json(res, 200, { ok: true, out: files, outDir: dir, log: r.stdout });
    }

    if (req.method === 'POST' && url.pathname === '/render/sheet') {
      const { times, out, cols, width, loop } = await parseBody(req);
      if (!times) return json(res, 400, { error: '缺少 times（逗号分隔的时刻）' });
      const outPath = out || path.join(PLUGIN_DIR, 'out', 'sheet.jpg');
      const args = [`--sheet=${times}`, `--out=${outPath}`];
      if (cols) args.push(`--cols=${cols}`);
      if (width) args.push(`--w=${width}`);
      const extra = loop ? [`--loop=${loop}`] : [];
      const r = await render(args, extra);
      return json(res, 200, { ok: true, out: outPath, log: r.stdout });
    }

    if (req.method === 'POST' && url.pathname === '/render/video') {
      const { range, out } = await parseBody(req);
      const outPath = out || path.join(PLUGIN_DIR, 'out', 'clip.mp4');
      const args = ['--clip'];
      if (range) args.push(`--range=${range}`);
      args.push(`--out=${outPath}`);
      const r = await render(args);
      return json(res, 200, { ok: true, out: outPath, log: r.stdout });
    }

    if (req.method === 'POST' && url.pathname === '/render/frames') {
      const { range, out, workers } = await parseBody(req);
      const args = ['--frames'];
      if (range) args.push(`--range=${range}`);
      if (workers) args.push(`--workers=${workers}`);
      if (out) args.push(`--out=${out}`);
      const r = await render(args);
      return json(res, 200, { ok: true, log: r.stdout, framesDir: 'out/frames' });
    }

    if (req.method === 'POST' && url.pathname === '/encode') {
      const { out } = await parseBody(req);
      const outPath = out || path.join(PLUGIN_DIR, 'out', 'video.mp4');
      const r = await render(['--encode', `--out=${outPath}`]);
      return json(res, 200, { ok: true, out: outPath, log: r.stdout });
    }

    return json(res, 404, { error: '未找到端点' });
  } catch (e) {
    return json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[animation-2d] render server → http://127.0.0.1:${PORT} (pluginDir=${PLUGIN_DIR})`);
  process.send?.({ type: 'ready', port: PORT });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
