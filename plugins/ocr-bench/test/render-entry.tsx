/**
 * 渲染断言入口（被 test/render-verify.mjs 经 esbuild 打包后在 Node 内执行）
 * SSR 三 Tab + 种子数据，把 HTML 交给外层断言。
 */
import { renderToString } from 'react-dom/server'
import Panel from '../src/Panel'
import WorkTab from '../src/WorkTab'
import LangsTab from '../src/LangsTab'
import HistoryTab from '../src/HistoryTab'
import type {
  OcrReport, BenchSettings, HistoryEntry, ServiceMeta,
} from '../src/model'

interface Seed {
  meta: ServiceMeta | null
  settings: BenchSettings | null
  lastReport: OcrReport | null
  history: HistoryEntry[]
}

;(globalThis as unknown as { __ocrBenchRender: (seed: Seed) => Record<string, string> }).__ocrBenchRender =
  (seed: Seed) => {
    const noop = () => {}
    return {
      panel: renderToString(<Panel pluginId="ocr-bench" />),
      work: renderToString(<WorkTab meta={seed.meta} settings={seed.settings} lastReport={seed.lastReport} onRefresh={noop} />),
      langs: renderToString(<LangsTab meta={seed.meta} onRefresh={noop} />),
      history: renderToString(<HistoryTab history={seed.history} onOpenReport={noop} onRefresh={noop} />),
    }
  }
