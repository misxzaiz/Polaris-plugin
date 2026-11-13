'use strict';
/**
 * state.js —— 会话状态与实例状态管理（零依赖）
 *
 * 迁移自主仓 integrations/common/conversation_store.rs + instance_registry.rs：
 * - ConversationState：每个 IM 会话的引擎/工作目录/提示词/AI 会话 ID
 * - 实例状态：运行时适配器句柄 + 状态快照（connection_state / stats / error）
 *
 * 持久化走宿主 cap.kv（kvclient 注入），键：
 *   im-bridge:conv-states   （会话状态 map）
 *   im-bridge:instances     （实例配置数组，含 activeId）
 *   im-bridge:dedup         （消息去重 ring，容量内滚动）
 */

const CONV_KEY = 'im-bridge:conv-states';
const INST_KEY = 'im-bridge:instances';
const DEDUP_KEY = 'im-bridge:dedup';
const DEDUP_MAX = 2048;

/** @typedef {Object} ConversationState
 * @property {string} conversationId
 * @property {string} engineId
 * @property {string|null} aiSessionId
 * @property {string|null} workDir
 * @property {string|null} promptPresetId
 * @property {string|null} customPrompt
 * @property {'append'|'replace'} promptMode
 * @property {number} lastActivity
 * @property {number} messageCount
 * @property {boolean} pendingResume
 */

function newConvState(conversationId) {
  return {
    conversationId,
    engineId: 'claude-code',
    aiSessionId: null,
    workDir: null,
    promptPresetId: null,
    customPrompt: null,
    promptMode: 'append',
    lastActivity: Date.now(),
    messageCount: 0,
    pendingResume: false,
  };
}

class StateManager {
  /**
   * @param {import('./kvclient').KvClient} kv
   * @param {(level: string, msg: string) => void} log
   */
  constructor(kv, log) {
    this.kv = kv;
    this.log = log;
    /** @type {Map<string, ConversationState>} */
    this.convs = new Map();
    /** @type {Array<{id:string,name:string,platform:string,enabled:boolean,config:object,createdAt:string,lastActive?:string}>} */
    this.instances = [];
    /** @type {Record<string, string|null>} platform -> activeInstanceId */
    this.activeByPlatform = { qqbot: null, feishu: null, dingtalk: null };
    /** 消息去重（Set + 滚动淘汰） */
    this.dedup = new Set();
    this.dedupOrder = [];
  }

  // ── 加载 / 持久化 ────────────────────────────────────────────────────────

  /** cap.kv 值语义：宿主 kv set 直接存 JSON 值；kvclient.kvGet 返回原始值 */
  async kvGetJson(key) {
    return this.kv.kvGet(key);
  }
  async kvSetJson(key, value) {
    return this.kv.kvSet(key, value);
  }

  async load() {
    try {
      const convs = await this.kvGetJson(CONV_KEY);
      if (convs && typeof convs === 'object') {
        for (const [k, v] of Object.entries(convs)) this.convs.set(k, v);
      }
    } catch (e) { this.log('warn', `load conv-states: ${e.message}`); }
    try {
      const inst = await this.kvGetJson(INST_KEY);
      if (inst && Array.isArray(inst.instances)) {
        this.instances = inst.instances;
        this.activeByPlatform = Object.assign({ qqbot: null, feishu: null, dingtalk: null }, inst.activeByPlatform || {});
      }
    } catch (e) { this.log('warn', `load instances: ${e.message}`); }
    try {
      const d = await this.kvGetJson(DEDUP_KEY);
      if (d && Array.isArray(d.ids)) {
        for (const id of d.ids) this.dedup.add(id);
        this.dedupOrder = d.ids.slice();
      }
    } catch (e) { this.log('warn', `load dedup: ${e.message}`); }
  }

  async saveConvs() {
    const obj = {};
    for (const [k, v] of this.convs) obj[k] = v;
    await this.kvSetJson(CONV_KEY, obj);
  }

  async saveInstances() {
    await this.kvSetJson(INST_KEY, { instances: this.instances, activeByPlatform: this.activeByPlatform });
  }

  async saveDedup() {
    await this.kvSetJson(DEDUP_KEY, { ids: this.dedupOrder });
  }

  // ── 会话状态 ─────────────────────────────────────────────────────────────

  getOrCreateConv(conversationId) {
    let s = this.convs.get(conversationId);
    if (!s) {
      s = newConvState(conversationId);
      this.convs.set(conversationId, s);
    }
    return s;
  }

  getConv(conversationId) {
    return this.convs.get(conversationId) || null;
  }

  // ── 去重 ─────────────────────────────────────────────────────────────────

  /** 已处理返回 true；否则记录并返回 false */
  isDup(id) {
    if (!id) return false;
    if (this.dedup.has(id)) return true;
    this.dedup.add(id);
    this.dedupOrder.push(id);
    while (this.dedupOrder.length > DEDUP_MAX) {
      const old = this.dedupOrder.shift();
      this.dedup.delete(old);
    }
    return false;
  }

  // ── 实例管理 ─────────────────────────────────────────────────────────────

  listInstances(platform) {
    const arr = platform ? this.instances.filter((i) => i.platform === platform) : this.instances;
    return arr;
  }

  getInstance(id) {
    return this.instances.find((i) => i.id === id) || null;
  }

  addInstance(inst) {
    this.instances.push(inst);
    if (!this.activeByPlatform[inst.platform]) {
      this.activeByPlatform[inst.platform] = inst.id;
    }
  }

  updateInstance(inst) {
    const idx = this.instances.findIndex((i) => i.id === inst.id);
    if (idx >= 0) this.instances[idx] = inst;
    return idx >= 0;
  }

  removeInstance(id) {
    const idx = this.instances.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    const [removed] = this.instances.splice(idx, 1);
    for (const p of Object.keys(this.activeByPlatform)) {
      if (this.activeByPlatform[p] === id) {
        const first = this.instances.find((i) => i.platform === p);
        this.activeByPlatform[p] = first ? first.id : null;
      }
    }
    return removed;
  }

  getActiveInstance(platform) {
    const id = this.activeByPlatform[platform];
    if (!id) return this.instances.find((i) => i.platform === platform) || null;
    return this.instances.find((i) => i.id === id) || null;
  }

  activateInstance(id) {
    const inst = this.getInstance(id);
    if (!inst) return false;
    this.activeByPlatform[inst.platform] = id;
    return true;
  }
}

module.exports = { StateManager, newConvState, CONV_KEY, INST_KEY };
