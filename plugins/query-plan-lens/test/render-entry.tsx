/**
 * 渲染/数据层冒烟入口（esbuild 打包 + render-verify.mjs 断言）
 * react-dom/server 与面板组件打进同一 bundle（单 React 实例，house 配方）。
 * 另导出 smokeDataLayer：用 stub 宿主 invoke（cap.http → 真 hermetic 服务）
 * 走一遍面板的 api() 数据通道，验证 router_dispatch 封套形状。
 */
import { renderToString } from 'react-dom/server'
import Panel, { __test } from '../src/Panel'
import type { ExplainResult } from '../src/types'
import { api, loadServiceMeta } from '../src/host'

export function renderPanel(): string {
  return renderToString(<Panel pluginId="query-plan-lens" />)
}

/** fabricated 结果（SSR 下渲染主结果视图，覆盖树/发现/详情渲染器） */
export function renderResultView(): string {
  const node1 = {
    id: '1', engine: 'pg' as const, nodeType: 'Seq Scan', relation: 'orders', alias: 'o', indexName: null,
    estRows: 10, estCost: 100, actRows: 5000, actRowsTotal: 5000, loops: 1,
    actualMs: 30, selfMs: 30, startupMs: 1, removedByFilter: 45000, neverExecuted: false,
    flags: [], detail: { Filter: '(o.amount > 50)' }, children: [],
  }
  const root = {
    id: '0', engine: 'pg' as const, nodeType: 'Sort', relation: null, alias: null, indexName: null,
    estRows: 10, estCost: 120, actRows: 10, actRowsTotal: 10, loops: 1,
    actualMs: 45, selfMs: 15, startupMs: 1, removedByFilter: null, neverExecuted: false,
    flags: [], detail: { 'Sort Key': 'created_at DESC' }, children: [node1],
  }
  const result: ExplainResult = {
    ok: true,
    plan: {
      engine: 'pg', statement: 'SELECT * FROM orders ORDER BY created_at', totalCost: 120,
      actualMs: 45, planningMs: 0.2, executionMs: 45, settings: null, triggers: 0, nodeCount: 2, root,
    },
    findings: [{
      id: 'F1', severity: 'warn', title: '全表扫描：orders（约 5.0k 行）', nodeId: '1',
      nodeLabel: 'Seq Scan on orders', detail: 'Filter：(o.amount > 50)', suggestion: '按 amount 建索引',
    }],
    raw: '[{"Query Plan":{"Plan":{"Node Type":"Sort"}}}]',
    meta: { analyzeUsed: true, durationMs: 46, serverVersion: '17.4' },
  }
  return renderToString(
    <__test.ResultView
      result={result}
      collapsed={new Set()} setCollapsed={() => {}}
      selectedNode={null} setSelectedNode={() => {}}
    />,
  )
}

export function renderNodeDetail(): string {
  const node = {
    id: '1', engine: 'mysql' as const, nodeType: '全表扫描 (ALL)', relation: 'orders', alias: null, indexName: null,
    estRows: 100000, examinedPerScan: 100000, filteredPct: 10, estCost: 8000,
    actRows: null, actRowsTotal: null, loops: 1,
    actualMs: null, selfMs: null, startupMs: null, removedByFilter: null, neverExecuted: true,
    flags: ['Using filesort（排序未走索引）'], detail: { attached_condition: '(`shop`.`orders`.`amount` > 100)' },
    children: [],
  }
  return renderToString(<__test.NodeDetail node={node} />)
}

export function renderFinding(): string {
  return renderToString(
    <__test.FindingCard f={{
      id: 'F1', severity: 'critical', title: '排序/聚合外排磁盘：Sort', nodeId: '1', nodeLabel: 'Sort',
      detail: 'Sort Space Used：4096kB', suggestion: '调大 work_mem',
    }} />,
  )
}

/** 数据层冒烟：window.__POLARIS_HOST_INVOKE__ → router_dispatch → cap.http → 127.0.0.1:svcPort */
export async function smokeDataLayer(svcPort: number, token: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  ;(globalThis as unknown as { window: unknown }).window = {
    __POLARIS_HOST_INVOKE__: async (cmd: string, args: Record<string, unknown>) => {
      if (cmd !== 'router_dispatch') throw new Error(`unexpected cmd ${cmd}`)
      const req = (args as { req: { target: string; payload: Record<string, unknown> } }).req
      if (req.target === 'cap.kv') {
        return { ok: true, result: { value: { port: svcPort, token } } }
      }
      if (req.target === 'cap.http') {
        const p = req.payload as { url: string; body?: string; headers?: Record<string, string> }
        const res = await fetch(p.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(p.headers || {}) },
          body: p.body,
        })
        const bodyText = await res.text()
        return { ok: true, result: { status: res.status, ok: res.ok, body: bodyText, isBase64: false } }
      }
      throw new Error(`unexpected target ${req.target}`)
    },
  }

  const meta = await loadServiceMeta()
  out.metaOk = !!meta && meta.port === svcPort
  if (!out.metaOk) return out

  // 连接列表（空）
  const conns = await api<{ connections: unknown[] }>('conns.list', {}, meta)
  out.connsOk = Array.isArray(conns.connections) && conns.connections.length === 0
  // plan.parse（PG 文本 → 发现）
  const parsed = await api<{ ok: boolean; plan: { engine: string }; findings: unknown[] }>('plan.parse', {
    text: 'Seq Scan on users  (cost=0.00..35.50 rows=2 width=8) (actual time=0.03..30.0 rows=2000 loops=1)\n  Rows Removed by Filter: 48000\nExecution Time: 45.00 ms',
    engine: 'auto',
  }, meta)
  out.parseOk = parsed.ok === true && parsed.plan.engine === 'pg' && parsed.findings.length > 0
  // 服务错误透传（写语句拒绝 → api 抛出用户可读中文）
  try {
    await api('plan.explain', { connId: 'none', sql: 'DELETE FROM x' }, meta)
    out.guardThrows = false
  } catch (e) {
    out.guardThrows = String((e as Error).message).includes('只')
  }
  return out
}
