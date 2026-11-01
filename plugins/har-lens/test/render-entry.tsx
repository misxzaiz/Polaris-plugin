/**
 * 渲染入口（esbuild 打包 + render-verify.mjs 断言）：
 * react-dom/server 渲染 Panel 与各 Tab，覆盖离线态/有数据态/审计/对比/自检报告/护栏文案。
 * SSR 下无宿主 invoke：kv 读取全部容错返回 null → 渲染离线态（这正是要断言的空态）。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import AnalyzeTab from '../src/tabs/AnalyzeTab'
import AuditTab from '../src/tabs/AuditTab'
import CompareTab from '../src/tabs/CompareTab'
import SelftestTab from '../src/tabs/SelftestTab'
import type { PanelData } from '../src/model'

const noop = async () => ({}) as PanelData
const toast = () => {}

export function fixtureData(): PanelData {
  const baseRow = {
    i: 0, m: 'GET', u: 'https://api.example.com/v1/users?access_token=‹已脱敏›&tab=1', s: 200,
    t: 400, sz: 2100, mime: 'application/json', rs: 0, ph: [-1, -1, -1, -1, 1, 300, 99], flags: '',
  }
  return {
    meta: {
      version: '0.1.0', pid: 1, startedAt: Date.now(), lastTickAt: Date.now(), bridge: '',
      degraded: false, port: 9873, state: 'ready', error: '', activePath: 'C:/t/trace.har',
      activeEntryCount: 6, busy: false,
    },
    report: {
      path: 'C:/t/trace.har', fileBytes: 45678, openedAt: Date.now(), version: '1.2',
      creator: 'Chrome HAR Export', pages: 1, entryCount: 6, truncatedEntries: false,
      spanMs: 640, timeSumMs: 2395, phaseTotalsMs: [0, 0, 0, 0, 6, 1975, 414],
      transferBytes: 9800, bodyBytes: 9100,
      statusCounts: { '2xx': 3, '3xx': 1, '4xx': 1, '5xx': 1, '0/abort': 0 },
      methodCounts: { GET: 5, POST: 1 },
      domains: [{ h: 'api.example.com', n: 5, bytes: 9000, time: 2100 }],
      mimes: [{ k: 'application/json', n: 5 }],
      times: { avg: 399, p50: 380, p95: 1250, max: 1250 },
      errors: [{ ...baseRow, i: 4, s: 500, u: 'https://api.example.com/v1/orders', t: 1250, flags: 'error,slow' }],
      slowTop: [{ ...baseRow, i: 4, s: 500, u: 'https://api.example.com/v1/orders', t: 1250, flags: 'error,slow' }],
      largeTop: [baseRow],
      dupUncached: [{ key: 'GET https://api.example.com/v1/users?access_token=‹已脱敏›&tab=1', count: 2, timeSumMs: 780, statuses: [200] }],
      cachedCount: 1, redirectCount: 1, errorCount: 2,
      auditHigh: { total: 7, high: 4 },
      startedAt: '2026-11-02T08:00:00.000Z', endedAt: '2026-11-02T08:00:00.640Z', t0: 0,
    },
    audit: {
      scannedEntries: 6, total: 7, highCount: 4,
      findings: [
        { cat: 'auth-header', sev: 'high', label: '鉴权头（Authorization / X-Api-Key 等）', count: 4, entryCount: 4, idx: [0, 3, 4, 5], samples: [{ i: 0, where: '请求头 Authorization', masked: '‹已脱敏›(len=14)' }] },
        { cat: 'query-secret', sev: 'medium', label: 'URL 敏感参数（token/key/…）', count: 2, entryCount: 2, idx: [0, 3], samples: [{ i: 0, where: 'URL 参数 access_token', masked: '‹已脱敏›(len=9)' }] },
      ],
      scannedAt: Date.now(),
    },
    diff: {
      basePath: 'C:/t/trace.har', candPath: 'C:/t/after.har',
      summary: { baseCount: 6, candCount: 6, matched: 6, added: 1, removed: 0, changed: 2, flips: 1, slowerCount: 1, fasterCount: 0, baseTimeSum: 2395, candTimeSum: 3545 },
      changed: [{ m: 'GET', u: 'https://api.example.com/v1/orders', s1: 500, s2: 500, t1: 1250, t2: 2400, dt: 1150, sz1: 100, sz2: 100 }],
      added: [{ m: 'GET', u: 'https://api.example.com/v1/users?access_token=‹已脱敏›&tab=1', s: 200, t: 400, sz: 2100 }],
      removed: [], slower: [{ m: 'GET', u: 'https://api.example.com/v1/orders', s1: 500, s2: 500, t1: 1250, t2: 2400, dt: 1150, sz1: 100, sz2: 100 }],
      faster: [], flips: [{ m: 'GET', u: 'https://api.example.com/v1/avatar', s1: 404, s2: 503, t1: 90, t2: 95, dt: 5, sz1: 9, sz2: 9 }],
      comparedAt: Date.now(),
    },
    hist: [{ path: 'C:/t/trace.har', fileBytes: 45678, entryCount: 6, at: Date.now() }],
    selftest: {
      version: '0.1.0', at: Date.now(), durationMs: 1600, passed: 17, total: 17, allGreen: true,
      checks: [{ item: 'fixture 结构校验', pass: true, detail: 'warnings=0', ms: 2 }],
    },
    loaded: true,
  }
}

export function renderPanelOffline(): string {
  return renderToString(<Panel pluginId="har-lens" />)
}

export function renderPanelRunning(): string {
  return renderToString(<Panel pluginId="har-lens" />)
}

export function renderAnalyzeTab(): string {
  return renderToString(<AnalyzeTab data={fixtureData()} running reload={noop} showToast={toast} />)
}

export function renderAnalyzeEmpty(): string {
  const d = fixtureData()
  d.report = null
  d.meta.activePath = ''
  d.hist = []
  return renderToString(<AnalyzeTab data={d} running reload={noop} showToast={toast} />)
}

export function renderAuditTab(): string {
  return renderToString(<AuditTab data={fixtureData()} running reload={noop} showToast={toast} />)
}

export function renderAuditClean(): string {
  const d = fixtureData()
  d.audit = { scannedEntries: 6, total: 0, highCount: 0, findings: [], scannedAt: Date.now() }
  d.report.auditHigh = { total: 0, high: 0 }
  return renderToString(<AuditTab data={d} running reload={noop} showToast={toast} />)
}

export function renderCompareTab(): string {
  return renderToString(<CompareTab data={fixtureData()} running reload={noop} showToast={toast} />)
}

export function renderSelftestTab(): string {
  return renderToString(<SelftestTab data={fixtureData()} running reload={noop} showToast={toast} />)
}
