// core/store.js — 分键持久化 + 事件订阅（polaris-api 移植）
// 不可变更新：所有 set 产生新引用

const KEYS = {
  tabs: 'polaris.http.tabs.v2',
  collections: 'polaris.http.collections.v2',
  envs: 'polaris.http.envs.v2',
  ui: 'polaris.http.ui.v2',
  history: 'polaris.http.history.v2',
  templates: 'polaris.http.templates.v2',
  globalHeaders: 'polaris.http.globalHeaders.v2',
  servers: 'polaris.http.servers.v2',
}

export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)))

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

  get(key) { return clone(this._data[key]) }

  set(key, value) {
    this._data[key] = clone(value)
    try { localStorage.setItem(KEYS[key], JSON.stringify(this._data[key])) } catch (e) { /* quota exceeded */ }
    this._emit(key, clone(value))
  }

  update(key, patch) {
    const cur = this._data[key]
    if (cur && typeof cur === 'object') this.set(key, { ...cur, ...patch })
    else this.set(key, patch)
  }

  subscribe(key, fn) {
    ;(this._listeners[key] ||= []).push(fn)
    return () => { const list = this._listeners[key]; if (list) this._listeners[key] = list.filter(f => f !== fn) }
  }

  _emit(key, value) {
    ;(this._listeners[key] || []).forEach(fn => { try { fn(value) } catch (e) { console.error('[polaris-http store]', e) } })
  }
}

export const store = new Store()
export default store