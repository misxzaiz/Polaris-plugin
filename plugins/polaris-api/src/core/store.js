// core/store.js — 事件订阅 + localStorage 持久化（分键）
// 不可变更新：所有 set 产生新引用，避免 React 变异与 undo 损坏
// 对齐 RELAY：按域分键，避免单键过大；每次写入深度克隆防引用污染

const KEYS = {
  tabs: 'polaris.api.tabs.v2',
  collections: 'polaris.api.collections.v2',
  envs: 'polaris.api.envs.v2',
  ui: 'polaris.api.ui.v2',
  ai: 'polaris.api.ai.v2',
  history: 'polaris.api.history.v2',
}

export const uid = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)))

/** 简易事件总线 + 持久化 */
class Store {
  constructor() {
    this._listeners = {}
    this._data = {}
    this._loadAll()
  }

  _loadAll() {
    for (const [key, lsKey] of Object.entries(KEYS)) {
      try {
        const raw = localStorage.getItem(lsKey)
        this._data[key] = raw ? JSON.parse(raw) : undefined
      } catch (e) {
        this._data[key] = undefined
      }
    }
  }

  get(key) {
    return clone(this._data[key])
  }

  set(key, value) {
    this._data[key] = clone(value)
    try {
      localStorage.setItem(KEYS[key], JSON.stringify(this._data[key]))
    } catch (e) { /* 配额超限静默 */ }
    this._emit(key, clone(value))
  }

  update(key, patch) {
    const cur = this._data[key]
    if (cur && typeof cur === 'object') {
      this.set(key, { ...cur, ...patch })
    } else {
      this.set(key, patch)
    }
  }

  subscribe(key, fn) {
    ;(this._listeners[key] ||= []).push(fn)
    return () => {
      const list = this._listeners[key]
      if (list) this._listeners[key] = list.filter(f => f !== fn)
    }
  }

  _emit(key, value) {
    ;(this._listeners[key] || []).forEach(fn => { try { fn(value) } catch (e) { console.error('[polaris-api store] listener error', e) } })
  }
}

export const store = new Store()
export default store