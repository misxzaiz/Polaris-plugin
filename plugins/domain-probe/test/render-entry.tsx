/**
 * 渲染入口（esbuild 打包 + render-verify.mjs 断言）：
 * react-dom/server 渲染 Panel 与各 Tab，覆盖离线态/运行态/报告 fixtures/护栏文案。
 * SSR 下无宿主 invoke：kv 读取全部容错返回 null → 渲染空态（这正是要断言的）。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import DiagnoseTab from '../src/DiagnoseTab'
import EmailTab from '../src/EmailTab'
import PropagateTab from '../src/PropagateTab'
import HistoryTab from '../src/HistoryTab'
import SettingsTab from '../src/SettingsTab'
import ReportView from '../src/ReportView'
import type { ServiceMeta, Report, Finding } from '../src/model'

const noop = () => {}

export function fixtureMeta(running: ServiceMeta['running'] = null): ServiceMeta {
  return { ts: new Date().toISOString(), version: '0.1.0', degraded: false, lastBridgeErr: null, running }
}

function finding(sev: Finding['sev'], code: string, title: string, detail = '', fix = ''): Finding {
  return { sev, code, title, detail, fix }
}

export function fixtureReport(): Report {
  return {
    runId: 'test-run-1', kind: 'full', domain: 'mailtest.test',
    startedAt: '2026-11-02T10:00:00.000Z', finishedAt: '2026-11-02T10:00:12.300Z', durationMs: 12300,
    ok: true, fatal: null,
    score: { total: 95, verdict: { cn: '优秀：没有发现需要处理的问题', tone: 'good' }, counts: { red: 0, yellow: 1, info: 2, green: 5 } },
    findings: [
      finding('yellow', 'cert.unavailable', '未取到证书信息', '解析出的地址均非公网（127.0.0.1），按护栏拒绝连接', ''),
      finding('info', 'spf.softfail', 'SPF 以 ~all 结尾（软失败）', '常见且可用的选择', ''),
      finding('green', 'dmarc.p-quarantine', 'DMARC 策略为 p=quarantine', '', ''),
      finding('green', 'dkim.found', '发现 1 条 DKIM 记录（selector：google）', '', ''),
    ],
    sections: {
      mail: {
        spf: { records: ['v=spf1 include:_spf.provider.test ~all'], parse: null, lookup: { count: 1, items: [], overLimit: false, atLimit: false } },
        dmarc: { record: { raw: 'v=DMARC1; p=quarantine; rua=mailto:agg@mailtest.test', tags: { v: 'DMARC1', p: 'quarantine', rua: 'mailto:agg@mailtest.test' }, errors: [], unknown: [], duplicates: [] }, orgRecord: null, orgGuess: '' },
        dkim: [{ selector: 'google', found: true, record: { version: 'DKIM1', keyType: 'rsa', revoked: false, hasPubKey: true, errors: [], flags: [] } }],
        mx: { answers: [{ name: 'mailtest.test', ttl: 600, type: 15, typeName: 'MX', raw: '10 mx1.mailtest.test.', pref: 10, data: 'mx1.mailtest.test' }], parsed: true, statusCn: 'NOERROR（正常）' },
      },
      cert: { refused: '解析出的地址均非公网（127.0.0.1），按护栏拒绝连接' },
    },
    resolversUsed: ['alidns'],
    resolverFailures: [],
  }
}

export function renderPanelOffline(): string {
  return renderToString(<Panel />)
}
export function renderDiagnoseTab(): string {
  return renderToString(<DiagnoseTab meta={fixtureMeta()} onDone={noop} />)
}
export function renderDiagnoseRunning(): string {
  return renderToString(<DiagnoseTab meta={fixtureMeta({ runId: 'r1', action: 'full', domain: 'example.com', step: 'cert', startedAt: Date.now() })} onDone={noop} />)
}
export function renderEmailTab(): string {
  return renderToString(<EmailTab meta={fixtureMeta()} />)
}
export function renderPropagateTab(): string {
  return renderToString(<PropagateTab meta={fixtureMeta()} />)
}
export function renderHistoryTab(): string {
  return renderToString(<HistoryTab refreshKey={0} />)
}
export function renderSettingsTab(): string {
  return renderToString(<SettingsTab meta={fixtureMeta()} />)
}
export function renderReport(): string {
  return renderToString(<ReportView rep={fixtureReport()} />)
}
