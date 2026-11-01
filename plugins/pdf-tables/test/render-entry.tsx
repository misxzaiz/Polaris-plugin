/**
 * 渲染断言入口（被 test/render-verify.mjs 经 esbuild 打包后在 Node 内执行）
 * SSR 三 Tab + 种子数据，把 HTML 交给外层断言。
 */
import { renderToString } from 'react-dom/server'
import PdfTablesPanel from '../src/Panel'
import WorkTab from '../src/WorkTab'
import HistoryTab from '../src/HistoryTab'
import SettingsTab from '../src/SettingsTab'
import type { PanelCtx } from '../src/Panel'
import type { HistoryEntry, PdfTablesMeta, PdfTablesSettings } from '../src/model'

interface Seed {
  meta: PdfTablesMeta | null
  settings: PdfTablesSettings
  history: HistoryEntry[]
}

;(globalThis as unknown as { __pdfTablesRender: (seed: Seed) => Record<string, string> }).__pdfTablesRender =
  (seed: Seed) => {
    const noop = () => {}
    const ctx: PanelCtx = {
      showToast: noop,
      meta: seed.meta,
      reloadMeta: async () => {},
      settings: seed.settings,
      reloadSettings: async () => {},
      history: seed.history,
      reloadHistory: async () => {},
    }
    return {
      panel: renderToString(<PdfTablesPanel pluginId="pdf-tables" />),
      work: renderToString(<WorkTab ctx={ctx} />),
      history: renderToString(<HistoryTab ctx={ctx} />),
      settings: renderToString(<SettingsTab ctx={ctx} />),
    }
  }
