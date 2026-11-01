'use strict';
/**
 * imports.js —— Claude 式 MCP 配置扫描与档案候选生成（零依赖）
 *
 * 路径口径与宿主 mcp_manager_service.rs 对齐（list_config_paths）：
 *   1. ~/.claude/settings.json            （Global）
 *   2. <workspace>/.mcp.json              （Project）
 *   3. <workspace>/.claude/settings.json   （Local）
 *   4. <workspace>/.claude/settings.local.json（Local）
 * 另加 ~/.claude.json（Claude Code 用户级真实存储位，缺文件则跳过）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseClaudeConfig } = require('../shared/probe-core');

const SCOPES = ['global', 'user', 'project', 'local'];

/** @returns {Array<{path:string, scope:string}>} */
function configPaths(home, workspace) {
  const h = home || os.homedir();
  const ws = workspace || '';
  const list = [
    { path: path.join(h, '.claude', 'settings.json'), scope: 'global' },
    { path: path.join(h, '.claude.json'), scope: 'user' },
  ];
  if (ws) {
    list.push(
      { path: path.join(ws, '.mcp.json'), scope: 'project' },
      { path: path.join(ws, '.claude', 'settings.json'), scope: 'local' },
      { path: path.join(ws, '.claude', 'settings.local.json'), scope: 'local' },
    );
  }
  return list;
}

/**
 * 扫描全部（或指定 scope）配置文件。
 * 返回 { found:[candidate+{scope,sourcePath}], files:[{path,scope,exists,error}] }
 */
function scanConfigs(opts) {
  const home = opts && opts.home;
  const workspace = (opts && opts.workspace) || '';
  const scopes = (opts && opts.scopes) && opts.scopes.length ? opts.scopes : SCOPES;
  const found = [];
  const files = [];
  for (const entry of configPaths(home, workspace)) {
    if (!scopes.includes(entry.scope)) continue;
    let text;
    try {
      text = fs.readFileSync(entry.path, 'utf8');
    } catch (e) {
      files.push({ ...entry, exists: false, error: /ENOENT/.test(e.code || e.message) ? '' : e.message });
      continue;
    }
    files.push({ ...entry, exists: true, error: '' });
    const parsed = parseClaudeConfig(text, entry.path);
    for (const s of parsed.servers) {
      found.push({ ...s, scope: entry.scope, sourcePath: entry.path });
    }
    for (const sk of parsed.skipped) {
      files.push({ ...entry, exists: true, error: `${sk.name}: ${sk.reason}` });
    }
  }
  return { found, files };
}

/**
 * 由候选生成档案（去重键 = scope + name，同键覆盖旧档案的连接字段但保留手工备注）。
 * profile 字段：id/name/transport/command/args/env/url/headers/timeoutMs/origin/sourcePath/createdAt/updatedAt
 */
function candidateToProfile(cand, existing) {
  const now = new Date().toISOString();
  const base = existing || {};
  return {
    id: base.id || `srv-${cand.scope}-${String(cand.name).replace(/[^a-zA-Z0-9_-]+/g, '-')}`,
    name: cand.name,
    transport: cand.transport,
    command: cand.command || '',
    args: cand.args || [],
    env: cand.env || {},
    url: cand.url || '',
    headers: cand.headers || {},
    timeoutMs: base.timeoutMs || 30000,
    origin: 'claude-import',
    sourceScope: cand.scope,
    sourcePath: cand.sourcePath,
    legacy: !!cand.legacy,
    note: base.note || '',
    createdAt: base.createdAt || now,
    updatedAt: now,
  };
}

module.exports = { SCOPES, configPaths, scanConfigs, candidateToProfile };
