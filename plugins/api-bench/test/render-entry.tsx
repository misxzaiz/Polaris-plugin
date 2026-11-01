/**
 * 渲染断言入口（被 test/render-verify.mjs 经 esbuild 打包后在 Node 内执行）
 * SSR 三 Tab + 种子数据，把 HTML 交给外层断言。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import WorkTab, { ReportView } from '../src/WorkTab'
import HistoryTab from '../src/HistoryTab'
import SettingsTab from '../src/SettingsTab'
import type {
  BenchReport, BenchSettings, FormState, HistoryEntry, ServiceMeta,
} from '../src/model'

interface Seed {
  meta: ServiceMeta | null
  settings: BenchSettings | null
  lastReport: BenchReport | null
  history: HistoryEntry[]
}

;(globalThis as unknown as { __apiBenchRender: (seed: Seed) => Record<string, string> }).__apiBenchRender =
  (seed: Seed) => {
    const noop = () => {}
    const form: FormState = {
      url: '', method: 'GET', headersText: '', body: '',
      connections: seed.settings?.connections || 10,
      durationS: seed.settings?.durationS || 10,
      timeoutS: seed.settings?.timeoutS || 10,
      rate: '', pipelining: 1,
    }
    return {
      panel: renderToString(<Panel pluginId="api-bench" />),
      work: renderToString(<WorkTab meta={seed.meta} settings={seed.settings} lastReport={seed.lastReport} onRefresh={noop} />),
      report: seed.lastReport ? renderToString(<ReportView report={seed.lastReport} />) : '',
      history: renderToString(<HistoryTab history={seed.history} onRefresh={noop} />),
      settings: renderToString(<SettingsTab meta={seed.meta} settings={seed.settings} onRefresh={noop} />),
      form: renderToString(<WorkTab meta={seed.meta} settings={seed.settings} lastReport={null} onRefresh={noop} />),
      _form: form,
    }
  }
