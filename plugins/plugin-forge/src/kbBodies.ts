/**
 * 知识库正文内联（esbuild --loader:.md=text）。
 * 键与 shared/kb-index.json 的 topics[].id 一一对应。
 */
import overview from '../shared/kb/overview.md'
import manifest from '../shared/kb/manifest.md'
import panel from '../shared/kb/panel.md'
import crossOrigin from '../shared/kb/cross-origin.md'
import service from '../shared/kb/service.md'
import serviceStart from '../shared/kb/service-start.md'
import singleWriter from '../shared/kb/single-writer.md'
import keyspace from '../shared/kb/keyspace.md'
import mcp from '../shared/kb/mcp.md'
import caps from '../shared/kb/caps.md'
import testing from '../shared/kb/testing.md'
import publishing from '../shared/kb/publishing.md'
import uiUx from '../shared/kb/ui-ux.md'
import productionChecklist from '../shared/kb/production-checklist.md'
import pitfalls from '../shared/kb/pitfalls.md'
import workflow from '../shared/kb/workflow.md'

export const KB_BODIES: Record<string, string> = {
  overview,
  manifest,
  panel,
  'cross-origin': crossOrigin,
  service,
  'service-start': serviceStart,
  'single-writer': singleWriter,
  keyspace,
  mcp,
  caps,
  testing,
  publishing,
  'ui-ux': uiUx,
  'production-checklist': productionChecklist,
  pitfalls,
  workflow,
}
