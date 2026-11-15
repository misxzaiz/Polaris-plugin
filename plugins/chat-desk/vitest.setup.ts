import '@testing-library/jest-dom/vitest'

/**
 * vitest 环境的 APP_CORE 桩：面板代码（shims/core）依赖宿主桥。
 * 测试环境下按需提供惰性最小 store（zustand createStore），让模块顶层
 * 的 useStoreHook(...) 初始化不炸；具体测试自行 setState 造数据。
 */
import { createElement } from 'react'
import { createStore } from 'zustand/vanilla'

type AnyStore = { getState: () => any; setState: (p: any) => void; subscribe: (cb: () => void) => () => void }

const cache = new Map<string, AnyStore>()

function makeStore(name: string): AnyStore {
  // 常见字段安全默认 + 方法型成员兜底：消费方直接读 .metadatas/.config 或
  // 调 .getEngineDisplayName(...) 等都不炸（返回 undefined/空串由调用方降级）。
  const defaults: Record<string, unknown> = {
    metadatas: [],
    config: null,
    workspaces: [],
    currentWorkspaceId: null,
    pluginStates: {},
    profiles: [],
    messages: [],
    sessions: new Map(),
  }
  const base = createStore<any>(() => ({ name, ...defaults }))
  const stateProxy = new Proxy<any>({}, {
    get(_t, prop: string) {
      const v = base.getState()[prop]
      if (v !== undefined) return v
      if (prop === 'getEngineDisplayName' || prop === 'getEngineFullName') return () => ''
      if (prop === 'getEngineIds') return () => []
      if (prop === 'getEngine') return () => undefined
      if (prop === 'getEngineMetadata') return () => undefined
      // setter/action 型成员兜底（setXxx/toggleXxx/clearXxx/…）
      if (/^(set|toggle|clear|init|update|register|remove|add|push|reset|mark|append|complete|fail|continue|start|stop|open|close)[A-Z]/.test(prop)) {
        return () => undefined
      }
      return undefined
    },
  })
  return {
    getState: () => stateProxy,
    setState: (p: any) => base.setState(p),
    subscribe: (cb: () => void) => base.subscribe(cb),
  }
}

const storesProxy = new Proxy<Record<string, AnyStore>>({} as Record<string, AnyStore>, {
  get(_t, prop: string) {
    if (!cache.has(prop)) cache.set(prop, makeStore(String(prop)))
    return cache.get(prop)
  },
})

;(globalThis as unknown as { window: unknown }).window = globalThis
// i18n：真 i18next 实例 + 主仓同源词典（test-fixtures/locales，由 P6.1 的
// 主仓 src/locales 同步；插件运行时词典仍由宿主提供，此处仅供测试断言文案）。
import { vi } from 'vitest'


;// 对齐主仓 src/test/setup.ts 的 i18n mock：vi.mock('react-i18next')，
// t 返回 key（支持 t(key, defaultValue) 二参与 options 占位符替换）。
// 组件直接 import 'react-i18next'（vitest 直连 node_modules），与主仓同路径命中。

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown> | string) => {
      if (typeof options === 'string') return options
      if (options) {
        return Object.entries(options).reduce(
          (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
          key,
        )
      }
      return key
    },
    i18n: { language: 'zh-CN', changeLanguage: () => undefined },
  }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
  Trans: ({ children }: { children?: unknown }) => children as never,
}))


;(globalThis as unknown as { __POLARIS_APP_CORE__: unknown }).__POLARIS_APP_CORE__ = {
  stores: storesProxy,
  services: new Proxy({} as Record<string, unknown>, {
    get() {
      // 服务命名空间桩：任意成员是函数（调用返回 undefined），
      // 兼容「先取成员再调用」与「当对象展开」两种形态
      return new Proxy({} as Record<string, unknown>, {
        get(_t, member: string) {
          // 订阅类：返回解绑函数（effect cleanup 用）
          if (/^(on|subscribe|off|unsubscribe)$/.test(member)) return () => () => undefined
          // 读取类：返回 Promise（调用方 .then 链）
          if (/^(get|read|list|query|fetch|load|export)/.test(member)) {
            return (..._a: unknown[]) => Promise.resolve(undefined)
          }
          // 其余：同步 noop
          return () => undefined
        },
      })
    },
  }),
  sessionV2: {},
  aiRuntime: {},
  i18n: { t: (k: string) => k, addResourceBundle: () => undefined, language: 'zh-CN' },
  pluginSystem: {
    pluginRegistry: {
      listPlugins: () => [],
      getPlugin: () => undefined,
      listViewContributions: () => [],
      getMainSurfaceClaim: () => undefined,
    },
    listEnabledPluginMcpServers: () => [],
    listPluginMcpServerStatuses: () => [],
    chatCardRegistry: {
      listKeys: () => [],
      match: () => undefined,
      resolve: () => undefined,
    },
  },
  components: new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'Icons') {
        // 图标桩：任意 icon 名 → 空函数组件（测试不断言图标渲染）
        return new Proxy({} as Record<string, unknown>, { get: () => () => null })
      }
      // 任意宿主组件桩（Button/Modal/…）→ 带 div 壳的透传组件
      // （保留按钮文本等 children 为可查询元素，供 getByText 断言）
      const Passthrough = (props: Record<string, unknown>) =>
        createElement('div', { ...props, 'data-testid': 'host-component-stub' }, props.children as never)
      return Passthrough
    },
  }),
  tauri: {},
}

// eslint-disable-next-line no-console
console.log('SETUP-OK', typeof (globalThis as unknown as Record<string, unknown>).__POLARIS_HOST_USE_TRANSLATION__)
