/**
 * 渲染入口（esbuild 打包 + render-verify.mjs 断言）：
 * react-dom/server 渲染 Panel 与各 Tab，覆盖离线态/有数据态/自检报告/护栏文案。
 * SSR 下无宿主 invoke：kv 读取全部容错返回 null → 渲染离线态（这正是要断言的空态）。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import RoutesTab from '../src/tabs/RoutesTab'
import HistoryTab, { HistDetail } from '../src/tabs/HistoryTab'
import SelftestTab from '../src/tabs/SelftestTab'
import SettingsTab from '../src/tabs/SettingsTab'
import type { PanelData } from '../src/Panel'
import type { MockRoute, SelftestReport } from '../src/model'

const noop = async () => ({}) as PanelData
const toast = () => {}

function route(over: Partial<MockRoute>): MockRoute {
  return {
    id: 'r-test', name: '测试路由', method: 'GET', path: '/api/users/:id', status: 200,
    headers: {}, bodyType: 'json', body: '{"id":"{{req.path.id}}"}', delayMs: 0,
    errorRate: 0, errorStatus: 500, enabled: true, builtin: false, createdAt: 1, updatedAt: 1,
    ...over,
  }
}

export function fixtureData(): PanelData {
  return {
    meta: {
      version: '0.1.0', pid: 1, startedAt: Date.now(), lastTickAt: Date.now(), bridge: '',
      degraded: false, port: 9868, routeCount: 2, enabledCount: 2, corsMode: 'echo',
      fallbackEnabled: false, histTotal: 3, lastReqAt: Date.now(), uptimeSec: 120,
    },
    settings: {
      version: 1,
      routes: [
        route({ id: 'demo-users', builtin: true, path: '/mockdemo/users', name: '示例·用户列表' }),
        route({ id: 'r-param' }),
        route({ id: 'r-slow', method: 'POST', path: '/api/pay', delayMs: 500, errorRate: 20, status: 201 }),
      ],
      cors: { mode: 'echo' },
      fallback: { enabled: false, status: 200, bodyType: 'json', body: '{}' },
      updatedAt: Date.now(),
    },
    idx: { count: 3, total: 30, chunkCount: 1, oldestAt: 0, updatedAt: Date.now() },
    history: [
      {
        id: 'h1', at: Date.now(), method: 'POST', path: '/api/pay', query: 'a=1', sourceIp: '127.0.0.1',
        matchedRouteId: 'r-slow', matchedRouteName: '支付', status: 201, delayMs: 500, durMs: 512,
        reqHeaders: { authorization: '****（已脱敏）' }, reqBodyKind: 'text', reqBodySize: 12,
        reqBodyPreview: '{"amount":1}', reqBodyTruncated: false, respBytes: 30,
      },
    ],
    selftestReport: {
      version: '0.1.0', at: Date.now(), durationMs: 1600, passed: 7, total: 7, allGreen: true,
      checks: [{ item: '模板引擎：渲染', pass: true, detail: 'n=3 name=张三', ms: 6 }],
    },
    loaded: true,
  }
}

export function renderPanelOffline(): string {
  return renderToString(<Panel pluginId="mock-server" />)
}

export function renderPanelRunning(): string {
  return renderToString(<Panel pluginId="mock-server" />)
}

export function renderRoutesTab(): string {
  return renderToString(<RoutesTab data={fixtureData()} running reload={noop} showToast={toast} />)
}

export function renderHistoryTab(): string {
  return renderToString(<HistoryTab data={fixtureData()} running showToast={toast} />)
}

export function renderSelftestTab(): string {
  return renderToString(<SelftestTab data={fixtureData()} running reload={noop} showToast={toast} />)
}

export function renderSettingsTab(): string {
  return renderToString(<SettingsTab data={fixtureData()} reload={noop} showToast={toast} running />)
}

export function renderHistDetail(): string {
  return renderToString(<HistDetail r={fixtureData().history[0]} />)
}

export function renderSelftestFailed(): string {
  const d = fixtureData()
  d.selftestReport = {
    version: '0.1.0', at: Date.now(), durationMs: 900, passed: 6, total: 7, allGreen: false,
    checks: [{ item: 'CORS 预检', pass: false, detail: 'ACAO=undefined', ms: 2 }],
  } as SelftestReport
  return renderToString(<SelftestTab data={d} running reload={noop} showToast={toast} />)
}
