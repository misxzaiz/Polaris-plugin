// core/store.js — 事件驱动状态管理 + localStorage 持久化
// 零外部依赖，支持 undo/redo、状态订阅、路径式访问

const STORE_KEY = 'polaris.api.store.v1'

// 默认状态
const DEFAULT_STATE = {
  request: {
    method: 'GET',
    url: '',
    params: [{ key: '', value: '', enabled: true }],
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: '', value: '', enabled: true },
    ],
    body: '',
    bodyType: 'none', // 'none' | 'json' | 'text' | 'form' | 'xml'
  },
  response: null,
  collections: [],
  envs: [
    {
      id: 'env-default',
      name: '默认环境',
      baseUrl: '',
      vars: [
        { key: 'token', value: '', enabled: false },
        { key: '', value: '', enabled: true },
      ],
    },
  ],
  activeEnv: 'env-default',
  history: [],
  ai: {
    configs: [],
    activeConfig: null,
    conversations: [],
    activeConversation: null,
  },
  ui: {
    sidebarView: 'collections', // 'collections' | 'history' | 'ai'
    editorView: 'params', // 'params' | 'headers' | 'body'
    responseView: 'pretty', // 'pretty' | 'raw' | 'headers'
    proxyEnabled: false,
    sidebarCollapsed: false,
    layout: 'vertical', // 'vertical' | 'horizontal'
  },
  _version: 1,
}

// 工具函数
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// 轻量级事件总线
class EventBus {
  constructor() {
    this._listeners = {}
  }
  on(event, fn) {
    ;(this._listeners[event] ||= []).push(fn)
    return () => this.off(event, fn)
  }
  off(event, fn) {
    const list = this._listeners[event]
    if (list) this._listeners[event] = list.filter(f => f !== fn)
  }
  emit(event, ...args) {
    const list = this._listeners[event]
    if (list) list.forEach(fn => fn(...args))
  }
}

// 路径式状态管理
class Store {
  constructor() {
    this._bus = new EventBus()
    this._state = clone(DEFAULT_STATE)
    this._undoStack = []
    this._redoStack = []
    this._maxUndo = 50
    this._load()
  }

  // 获取状态值（支持路径：'request.method', 'response.status'）
  get(path) {
    if (!path) return this._state
    const parts = path.split('.')
    let val = this._state
    for (const p of parts) {
      if (val == null || typeof val !== 'object') return undefined
      val = val[p]
    }
    return val
  }

  // 设置状态值
  set(path, value) {
    const parts = path.split('.')
    const key = parts.pop()
    let obj = this._state
    for (const p of parts) {
      if (obj[p] == null || typeof obj[p] !== 'object') obj[p] = {}
      obj = obj[p]
    }
    // 保存 undo
    const prev = this._getAtPath(this._state, path)
    this._undoStack.push({ path, prev: clone(prev) })
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift()
    this._redoStack = []

    obj[key] = value
    this._save()
    this._bus.emit(path, value)
    this._bus.emit('*', path, value)
  }

  // 更新对象（浅合并）
  update(path, patch) {
    const current = this.get(path)
    if (current && typeof current === 'object') {
      this.set(path, { ...current, ...patch })
    } else {
      this.set(path, patch)
    }
  }

  // 订阅状态变化
  subscribe(path, fn) {
    return this._bus.on(path, fn)
  }

  // 订阅任意变化
  subscribeAll(fn) {
    return this._bus.on('*', fn)
  }

  // 撤销
  undo() {
    if (!this._undoStack.length) return false
    const entry = this._undoStack.pop()
    const current = this._getAtPath(this._state, entry.path)
    this._redoStack.push({ path: entry.path, prev: clone(current) })
    this._setAtPath(this._state, entry.path, clone(entry.prev))
    this._save()
    this._bus.emit(entry.path, clone(entry.prev))
    this._bus.emit('*', entry.path, clone(entry.prev))
    return true
  }

  // 重做
  redo() {
    if (!this._redoStack.length) return false
    const entry = this._redoStack.pop()
    const current = this._getAtPath(this._state, entry.path)
    this._undoStack.push({ path: entry.path, prev: clone(current) })
    this._setAtPath(this._state, entry.path, clone(entry.prev))
    this._save()
    this._bus.emit(entry.path, clone(entry.prev))
    this._bus.emit('*', entry.path, clone(entry.prev))
    return true
  }

  // 重置
  reset() {
    this._state = clone(DEFAULT_STATE)
    this._undoStack = []
    this._redoStack = []
    this._save()
    this._bus.emit('*', '__reset__')
  }

  // 获取完整状态（用于导出）
  export() {
    return clone(this._state)
  }

  // 导入状态
  import(data) {
    this._state = { ...clone(DEFAULT_STATE), ...clone(data), _version: DEFAULT_STATE._version }
    this._undoStack = []
    this._redoStack = []
    this._save()
    this._bus.emit('*', '__import__')
  }

  // 获取可持久化的状态（排除非序列化字段）
  _serializable() {
    const s = clone(this._state)
    delete s._version
    return s
  }

  _getAtPath(obj, path) {
    const parts = path.split('.')
    let val = obj
    for (const p of parts) {
      if (val == null) return undefined
      val = val[p]
    }
    return val
  }

  _setAtPath(obj, path, value) {
    const parts = path.split('.')
    const key = parts.pop()
    let target = obj
    for (const p of parts) {
      if (target[p] == null) target[p] = {}
      target = target[p]
    }
    target[key] = value
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        this._state = { ...clone(DEFAULT_STATE), ...data }
        // 确保必填字段存在
        if (!this._state.envs || !this._state.envs.length) {
          this._state.envs = clone(DEFAULT_STATE.envs)
        }
        if (!this._state.activeEnv) {
          this._state.activeEnv = this._state.envs[0]?.id || 'env-default'
        }
      }
    } catch (e) {
      // 持久化失败，使用默认状态
    }
  }

  _save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this._serializable()))
    } catch (e) {
      // 存储失败（如配额超限），静默忽略
    }
  }
}

export const store = new Store()
export default store