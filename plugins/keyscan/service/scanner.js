'use strict';
/**
 * scanner.js —— 目录遍历扫描引擎（零外网、只读、可取消）
 *
 * 职责：给定 root 与 settings，递归遍历目录（跳过策略见 scan-core），
 * 逐文件读入 → 二进制/大小过滤 → scanText 规则扫描 → 返回原始发现与统计。
 * 不写任何文件、不发任何网络请求；进度经 onProgress 回调上报（服务层落 kv）。
 *
 * 资源上限（诚实降级，不静默吞掉）：
 *   - maxFiles      文件数上限 → truncated=true
 *   - maxTotalMB    累计读取字节上限 → truncated=true
 *   - deadlineMs    硬超时（默认 15min）→ truncated=true
 *   - 单文件超过 maxFileKB → 跳过并计数（skippedSize）
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const core = require('../shared/scan-core');

const READ_CONCURRENCY = 8;
const DEFAULT_DEADLINE_MS = 15 * 60 * 1000;

async function scanDirectory(opts) {
  const {
    root,
    settings = {},
    onProgress = null,
    shouldCancel = null,
    deadlineMs = DEFAULT_DEADLINE_MS,
  } = opts || {};

  const maxFileKB = Number(settings.maxFileKB) > 0 ? Number(settings.maxFileKB) : core.DEFAULT_SETTINGS.maxFileKB;
  const maxFiles = Number(settings.maxFiles) > 0 ? Number(settings.maxFiles) : core.DEFAULT_SETTINGS.maxFiles;
  const maxTotalMB = Number(settings.maxTotalMB) > 0 ? Number(settings.maxTotalMB) : core.DEFAULT_SETTINGS.maxTotalMB;
  const extraSkipDirs = Array.isArray(settings.skipDirs) ? settings.skipDirs.map((s) => String(s).toLowerCase()) : [];
  const skipSet = new Set([...core.SKIP_DIRS, ...extraSkipDirs]);
  const enabledRules = new Set(
    core.RULES.map((r) => r.id).filter((id) => !(settings.disabledRules || []).includes(id)),
  );

  const stat = {
    root,
    startedAt: Date.now(),
    filesSeen: 0,
    filesScanned: 0,
    skippedDirs: 0,
    skippedBinary: 0,
    skippedSize: 0,
    readErrors: 0,
    totalBytes: 0,
    truncated: false,
    truncatedReason: '',
    cancelled: false,
  };
  const rawFindings = [];
  const deadline = Date.now() + deadlineMs;

  let lastProgressAt = Date.now();
  const report = (force) => {
    if (!onProgress) return;
    if (force || Date.now() - lastProgressAt > 2000) {
      lastProgressAt = Date.now();
      try { onProgress({ ...stat, findings: rawFindings.length }); } catch (_) { /* 进度回调失败不影响扫描 */ }
    }
  };

  async function readOne(absFile, relFile) {
    let buf;
    try {
      buf = await fsp.readFile(absFile);
    } catch (_) {
      stat.readErrors++;
      return;
    }
    stat.totalBytes += buf.length;
    if (buf.length > maxFileKB * 1024) { stat.skippedSize++; return; }
    if (core.looksBinary(buf)) { stat.skippedBinary++; return; }
    stat.filesScanned++;
    const text = buf.toString('utf8');
    const found = core.scanText(text, { relFile, enabledRules });
    if (found.length) rawFindings.push(...found);
  }

  async function walk(dir, rel) {
    if (stat.cancelled || stat.truncated) return;
    if (Date.now() > deadline) {
      stat.truncated = true;
      stat.truncatedReason = `已达 ${Math.round(deadlineMs / 60000)} 分钟硬超时`;
      return;
    }
    if (stat.filesSeen >= maxFiles) {
      stat.truncated = true;
      stat.truncatedReason = `文件数达上限 ${maxFiles}`;
      return;
    }
    if (stat.totalBytes >= maxTotalMB * 1024 * 1024) {
      stat.truncated = true;
      stat.truncatedReason = `累计读取达上限 ${maxTotalMB}MB`;
      return;
    }

    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (_) {
      stat.readErrors++;
      return;
    }

    const files = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        if (skipSet.has(e.name.toLowerCase())) { stat.skippedDirs++; continue; }
        files.push({ dir: true, entry: e });
      } else if (e.isFile()) {
        files.push({ dir: false, entry: e });
      } // 符号链接等一律不跟随（防环防越界）
    }

    const plainFiles = files.filter((f) => !f.dir).map((f) => f.entry);
    stat.filesSeen += plainFiles.length;

    // 有界并发读文件
    for (let i = 0; i < plainFiles.length; i += READ_CONCURRENCY) {
      if (stat.cancelled || stat.truncated) return;
      const batch = plainFiles.slice(i, i + READ_CONCURRENCY);
      await Promise.all(batch.map(async (e) => {
        const absFile = path.join(dir, e.name);
        if (core.isSkipFile(e.name) || core.isSkipExt(e.name)) return;
        await readOne(absFile, rel ? `${rel}/${e.name}` : e.name);
      }));
      report(false);
      if (shouldCancel && shouldCancel()) { stat.cancelled = true; return; }
    }

    // 子目录递归（深度优先，逐个）
    for (const f of files) {
      if (!f.dir) continue;
      if (stat.cancelled || stat.truncated) return;
      await walk(path.join(dir, f.entry.name), rel ? `${rel}/${f.entry.name}` : f.entry.name);
    }
  }

  await walk(root, '');
  report(true);

  return {
    stat,
    rawFindings,
    durationMs: Date.now() - stat.startedAt,
  };
}

module.exports = { scanDirectory };
