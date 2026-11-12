'use strict';
/**
 * puppeteer-loader.js —— puppeteer-core 动态装载
 *
 * 策略（spec §5 打包策略）：
 *   1. 依次探测插件目录/上层目录 node_modules/puppeteer-core
 *   2. 缺失则 npm install --no-save puppeteer-core（约 88MB，进度写日志）
 *   3. 全部失败 → 抛出可读错误（/__health 返回 degraded）
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let cached = null;

function candidateRoots(pluginDir) {
  return [
    pluginDir,
    path.dirname(pluginDir),
    path.dirname(path.dirname(pluginDir)),
  ];
}

function tryResolve(pluginDir) {
  for (const root of candidateRoots(pluginDir)) {
    const p = path.join(root, 'node_modules', 'puppeteer-core');
    try {
      if (fs.existsSync(path.join(p, 'package.json'))) {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require(p);
      }
    } catch (e) {
      // junction 场景 require 可能被安全策略拦截：留痕便于排查
      if (process.env.BROWSER_DESK_DEBUG) {
        process.stderr.write(`[browser-desk:debug] tryResolve ${p} 失败: ${e.message}\n`);
      }
    }
  }
  return null;
}

function install(pluginDir, log) {
  const dir = pluginDir;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  log('info', 'puppeteer-core 缺失，开始 npm install --no-save puppeteer-core（首次约 1-2 分钟）...');
  // Node ≥ 18.20/20.12/21.7 安全修复：Windows 上 spawn .cmd 必须 shell:true，
  // 否则 spawnSync 抛 EINVAL（CVE-2024-27980 加固）。
  execFileSync(npm, ['install', '--no-save', 'puppeteer-core@25'], {
    cwd: dir,
    stdio: 'ignore',
    timeout: 5 * 60 * 1000,
    shell: process.platform === 'win32',
  });
  log('info', 'puppeteer-core 安装完成');
}

/** @returns {Promise<import('puppeteer-core')>} */
async function loadPuppeteer(pluginDir, log) {
  if (cached) return cached;
  let mod = tryResolve(pluginDir);
  if (!mod) {
    install(pluginDir, log);
    mod = tryResolve(pluginDir);
  }
  if (!mod) {
    throw new Error('puppeteer-core 获取失败：请检查网络后重试，或手动在插件目录 npm install puppeteer-core');
  }
  cached = mod;
  return mod;
}

module.exports = { loadPuppeteer };
