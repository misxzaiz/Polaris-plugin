/**
 * 渲染断言入口（被 test/render-verify.mjs 经 esbuild 打包后在 Node 内执行）
 * SSR 三 Tab + 种子数据，把 HTML 交给外层断言。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import WorkTab from '../src/WorkTab'
import { ReportView } from '../src/ReportTab'
import HistoryTab from '../src/HistoryTab'
import type {
  AuditReport, AuditSettings, HistoryEntry, ServiceMeta, LiveSnapshot,
} from '../src/model'

interface Seed {
  meta: ServiceMeta | null
  settings: AuditSettings | null
  lastReport: AuditReport | null
  history: HistoryEntry[]
  live?: LiveSnapshot | null
}

;(globalThis as unknown as { __siteAuditRender: (seed: Seed) => Record<string, string> }).__siteAuditRender =
  (seed: Seed) => {
    const noop = () => {}
    const sendToChat = async () => {}
    return {
      panel: renderToString(<Panel pluginId="site-audit" />),
      work: renderToString(
        <WorkTab meta={seed.meta} settings={seed.settings} lastReport={seed.lastReport} onRefresh={noop} onOpenReport={noop} onSendToChat={sendToChat} />,
      ),
      live: seed.live
        ? renderToString(
          <WorkTab meta={seed.meta} settings={seed.settings} lastReport={null} onRefresh={noop} onOpenReport={noop} onSendToChat={sendToChat} initialLive={seed.live} />,
        )
        : '',
      report: renderToString(<ReportView report={seed.lastReport} onSendToChat={sendToChat} />),
      history: renderToString(<HistoryTab meta={seed.meta} history={seed.history} onRefresh={noop} onView={noop} />),
    }
  }
