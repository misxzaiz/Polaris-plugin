// core/ai-store.js — 多 AI 配置管理：CRUD + 切换 + localStorage 持久化。
// 复用 store() 命名空间模式，配置列表 / 激活 ID / 对话历史分别存储。

import { store, uid } from './dom.js';

const cfgStore = store('ai.configs');
const activeStore = store('ai.active');
const histStore = store('ai.history');

const COLORS = ['#4493f8','#a371f7','#3fb950','#d29922','#f85149','#79c0ff','#ff7a59','#2dd4bf'];

/* ===================== 配置 CRUD ===================== */

export function getConfigs() {
  return cfgStore.get() || [];
}

function saveConfigs(configs) {
  cfgStore.set(configs);
}

export function getConfig(id) {
  return getConfigs().find(c => c.id === id) || null;
}

export function getActive() {
  const id = activeStore.get();
  if (!id) return getConfigs()[0] || null;
  return getConfig(id) || getConfigs()[0] || null;
}

export function getActiveId() {
  const a = getActive();
  return a ? a.id : null;
}

export function addConfig(partial = {}) {
  const configs = getConfigs();
  const cfg = {
    id: uid(),
    name: partial.name || '新配置',
    endpoint: partial.endpoint || '',          // Base URL，如 https://api.deepseek.com/v1
    apiKey: partial.apiKey || '',
    model: partial.model || '',
    temperature: partial.temperature ?? 0.7,
    maxTokens: partial.maxTokens || 4096,
    systemPrompt: partial.systemPrompt || '',
    color: partial.color || COLORS[configs.length % COLORS.length],
    proxy: partial.proxy || false,
    createdAt: Date.now(),
  };
  configs.push(cfg);
  saveConfigs(configs);
  // 如果是第一个配置，自动激活
  if (configs.length === 1) switchConfig(cfg.id);
  return cfg;
}

export function updateConfig(id, patch) {
  const configs = getConfigs();
  const idx = configs.findIndex(c => c.id === id);
  if (idx < 0) return null;
  Object.assign(configs[idx], patch);
  saveConfigs(configs);
  return configs[idx];
}

export function removeConfig(id) {
  let configs = getConfigs();
  configs = configs.filter(c => c.id !== id);
  saveConfigs(configs);
  // 如果删除的是当前激活的，切换到第一个
  if (activeStore.get() === id) {
    activeStore.set(configs.length ? configs[0].id : null);
  }
  return configs;
}

export function switchConfig(id) {
  activeStore.set(id);
}

/* ===================== 对话历史 ===================== */

const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 200;

export function getConversations() {
  return histStore.get() || [];
}

export function getConversation(id) {
  return getConversations().find(c => c.id === id) || null;
}

export function saveConversation(conv) {
  const convs = getConversations();
  const idx = convs.findIndex(c => c.id === conv.id);
  if (idx >= 0) {
    // 截断消息数
    if (conv.messages && conv.messages.length > MAX_MESSAGES) {
      conv.messages = conv.messages.slice(-MAX_MESSAGES);
    }
    convs[idx] = conv;
  } else {
    convs.unshift(conv);
    // 截断对话数
    if (convs.length > MAX_CONVERSATIONS) convs.length = MAX_CONVERSATIONS;
  }
  histStore.set(convs);
}

export function deleteConversation(id) {
  const convs = getConversations().filter(c => c.id !== id);
  histStore.set(convs);
  return convs;
}

export function clearConversations() {
  histStore.set([]);
}

/* ===================== 工具函数 ===================== */

/** 从 Base URL 拼接完整的 chat completions URL */
export function chatUrl(baseEndpoint) {
  let base = (baseEndpoint || '').replace(/\/+$/, '');
  if (!base) return '';
  // 如果用户已经填了完整路径，直接返回
  if (base.endsWith('/chat/completions')) return base;
  // 否则拼接
  return base + '/chat/completions';
}

/** 脱敏 API Key（只显示前 4 位和后 4 位） */
export function maskKey(key) {
  if (!key || key.length <= 12) return key ? '••••••••' : '';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

export { COLORS };
