// 一次性发布辅助：update.json 复制 + 重打包提示 + index.json 条目（@main URL，防 tag URL 坑）
// 用法：node plugins/qingnang/test/publish-helper.mjs <sha256>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const P = path.join(ROOT, 'plugins', 'qingnang');
const sha = process.argv[2];
if (!sha || sha.length !== 64) { console.error('用法: node publish-helper.mjs <sha256-hex>'); process.exit(1); }

// 1) update.json = plugin.json（三处一致性约束之一）
fs.copyFileSync(path.join(P, 'plugin.json'), path.join(P, 'update.json'));
console.log('update.json <- plugin.json（version 同步）');

// 2) index.json 条目（幂等；URL 一律 @main）
const idxPath = path.join(ROOT, 'index.json');
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
idx.plugins = idx.plugins.filter((p) => p.id !== 'qingnang');
const manifest = JSON.parse(fs.readFileSync(path.join(P, 'plugin.json'), 'utf8'));
const readme = fs.readFileSync(path.join(P, 'README.md'), 'utf8');
const M = 'https://cdn.jsdelivr.net/gh/misxzaiz/Polaris-plugin@main/plugins/qingnang/';
idx.plugins.push({
  id: manifest.id,
  name: manifest.name,
  version: manifest.version,
  description: manifest.description,
  author: 'Polaris',
  category: 'life',
  tags: ['health', 'medication', 'family', 'inventory', 'mcp', 'panel', 'local-first'],
  icon: 'Activity',
  homepage: manifest.origin.homepage,
  repository: manifest.origin.repository,
  manifestUrl: M + 'plugin.json',
  downloadUrl: M + 'qingnang.zip',
  updateUrl: M + 'update.json',
  sha256: sha,
  tier: 'production',
  permissions: { appConfigRead: true, aiToolAccess: true },
  screenshots: [],
  readme,
  versions: [{ version: manifest.version, downloadUrl: M + 'qingnang.zip', sha256: sha }],
});
idx.updated = new Date().toISOString();
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n');
console.log(`index.json 条目已写入 qingnang v${manifest.version} sha256=${sha.slice(0, 12)}…`);
console.log('三处一致性：plugin.json / update.json / index.json version =', manifest.version);
