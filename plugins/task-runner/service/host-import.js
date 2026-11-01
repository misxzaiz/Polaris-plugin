'use strict';
/**
 * host-import.js —— 宿主供应商导入（纯映射 + 配置文件候选定位）
 *
 * 面板侧 cap.config get 的 modelProfiles.apiKey 是宿主脱敏占位（__POLARIS_*
 * 前缀，实测 2026-11-02）——直接入库会让 AI 任务鉴权失败。真值只在宿主
 * config.json 落盘（kvclient 读 port/token 的同一个文件，同信任域），故导入
 * 下沉服务进程读盘（llm-probe import_host 同款先例）。
 *
 * 安全语义：
 *  - 掩码占位 key 一律拒收（防宿主未来改脱敏策略后静默塞入坏供应商）
 *  - 按 hostId 幂等合并：重复导入替换同名宿主档案，保留手填档案
 *  - dryRun 只算不写（冒烟/预览用）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

/** 与 kvclient 同源的宿主配置候选（读全量 config，含 modelProfiles 原始密钥） */
function findHostConfigFile(appConfigDir) {
  const cands = [];
  const anchorPath = process.env.APPDATA ? path.join(process.env.APPDATA, 'Polaris', 'anchor.json') : '';
  if (anchorPath) {
    try {
      const a = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
      if (a && typeof a.dataRoot === 'string' && a.dataRoot) {
        cands.push(path.join(a.dataRoot, 'config.json'));
      }
    } catch (_) { /* 跳过不可读候选 */ }
  }
  if (appConfigDir) cands.push(path.join(appConfigDir, 'config.json'));
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.config', 'Polaris', 'config.json'));
  cands.push(path.join(os.homedir(), '.polaris', 'config.json'));
  for (const p of cands) {
    try {
      const root = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (root && typeof root === 'object') return { file: p, root };
    } catch (_) { /* 跳过 */ }
  }
  return null;
}

/**
 * 把宿主 config.modelProfiles 映射为任务台供应商并与现有档案幂等合并。
 * @returns {{imported:number, providers:object[]}}
 */
function mapHostProfiles(configRoot, existingProviders, genId) {
  const list = configRoot && Array.isArray(configRoot.modelProfiles) ? configRoot.modelProfiles : [];
  const mapped = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const baseUrl = String(p.baseUrl || '').trim();
    if (!baseUrl) continue;
    const apiKey = String(p.apiKey || '').trim();
    if (!apiKey || apiKey.startsWith('__POLARIS')) continue; // 掩码占位拒收
    const hostId = String(p.id || '').trim();
    if (!hostId) continue;
    const model = String(p.model || (Array.isArray(p.modelOptions) && p.modelOptions[0]) || '').trim();
    mapped.push({
      hostId,
      name: String(p.name || hostId).slice(0, 40),
      baseUrl,
      apiKey,
      model,
      wire: p.wireApi === 'anthropic-messages' ? 'anthropic-messages' : 'openai-chat-completions',
    });
  }
  // 合并：宿主档案按 hostId 整组替换；无 hostId 的手填档案全保留
  const kept = (Array.isArray(existingProviders) ? existingProviders : [])
    .filter((x) => !(x && typeof x === 'object' && x.hostId && mapped.some((m) => m.hostId === x.hostId)));
  const providers = [
    ...kept,
    ...mapped.map((m, i) => ({ id: genId(i), source: 'host', ...m })),
  ];
  return { imported: mapped.length, providers };
}

module.exports = { findHostConfigFile, mapHostProfiles };
