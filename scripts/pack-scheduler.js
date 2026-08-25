const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pluginDir = 'D:\\space\\base\\Polaris-plugin\\plugins\\polaris-scheduler';
const files = ['plugin.json', 'update.json', '.pluginignore', 'dist/panel.js', 'mcp/server.js'];
const zipPath = path.join(pluginDir, 'polaris-scheduler.zip');

// Use PowerShell Compress-Archive
const staging = path.join(require('os').tmpdir(), 'polaris-scheduler-pack-' + Date.now());
fs.mkdirSync(staging, { recursive: true });
for (const f of files) {
  const src = path.join(pluginDir, f);
  const dst = path.join(staging, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipPath}'"`, { stdio: 'pipe' });
const stat = fs.statSync(zipPath);
console.log(`ZIP created: ${zipPath} (${stat.size} bytes)`);

// Cleanup
fs.rmSync(staging, { recursive: true, force: true });