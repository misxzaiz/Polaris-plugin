#!/usr/bin/env node
/**
 * start-blender.js — 一键启动 Blender 并开启 MCP for Blender 服务（监听 9876）。
 *
 * 行为：
 *   1. 探测 9876 是否已在监听 → 已监听则直接提示「已连接」，无需启动。
 *   2. 若未监听，检测 Blender 是否已运行（有进程但没服务）→ 提示在 Blender 内手动
 *      打开 N 面板 → MCP for Blender → 点 "Connect to Claude"。
 *   3. 否则启动 Blender（新窗口），并用 --python-expr 自动启用 addon + 启动 server，
 *      然后轮询 9876 直到就绪（最长 ~90s）。
 *
 * 用法：node start-blender.js   （或双击 start-blender.bat）
 */
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');

const HOST = '127.0.0.1';
const PORT = 9876;
const BLENDER = 'C:/Program Files/Blender Foundation/Blender 4.2/blender.exe';
const ADDON_MODULE = 'blender_mcp';

function portOpen() {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: HOST, port: PORT });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

function waitPort(timeoutMs = 90000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await portOpen()) return resolve(true);
      if (Date.now() - t0 > timeoutMs) return resolve(false);
      setTimeout(tick, 1000);
    };
    void tick();
  });
}

function blenderRunning() {
  try {
    const out = require('child_process').execSync('tasklist /FI "IMAGENAME eq blender.exe"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return /blender\.exe/i.test(out);
  } catch {
    return false;
  }
}

async function main() {
  console.log(`[start-blender] 探测 ${HOST}:${PORT} ...`);
  if (await portOpen()) {
    console.log('✓ MCP for Blender 已在监听 9876，直接可用。');
    return;
  }
  console.log('✗ 9876 未监听。');
  if (blenderRunning()) {
    console.log('  Blender 已在运行，但 addon server 未启动。请在 Blender 内：');
    console.log('  右侧 N 面板 → "MCP for Blender" → 点击 "Connect to Claude"（Start MCP Server）。');
    console.log('  启动后本脚本可重新探测：node start-blender.js');
    return;
  }
  if (!fs.existsSync(BLENDER)) {
    console.error(`✗ 未找到 Blender: ${BLENDER}`);
    console.error('  请安装 Blender 4.2+ 或修改本脚本中的 BLENDER 路径。');
    process.exit(1);
  }

  console.log(`启动 Blender（自动启用 ${ADDON_MODULE} addon + 开启 server）...`);
  // 用 python-expr 在 Blender 启动后自动启用 addon 并调用 start_server operator。
  // start /b 会共享控制台；spawn 的 detached 窗口在 Windows 上保持前台 GUI，Blender 不会退出。
  const py = `import bpy, addon_utils; addon_utils.enable('${ADDON_MODULE}', default_set=True, persistent=True); bpy.ops.blendermcp.start_server(); print('MCP_SERVER_STARTED')`;
  const child = spawn('cmd', ['/c', 'start', '', BLENDER, '--python-expr', py], {
    cwd: 'C:/',
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log('等待 Blender addon server 就绪（最长 90s）...');
  const ok = await waitPort();
  if (ok) {
    console.log(`✓ MCP for Blender 已就绪：${HOST}:${PORT}`);
  } else {
    console.error('✗ 超时未检测到 9876 监听。请检查 Blender 是否弹出并显示 addon 错误，');
    console.error('  或手动在 Blender 内点击 "Connect to Claude"。');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
