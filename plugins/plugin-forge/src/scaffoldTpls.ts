/**
 * 脚手架模板内联（esbuild --loader:.txt=text）。
 * manifest.json 的 map：模板文件名 → 生成目标相对路径。
 */
import tplManifestJson from '../shared/scaffold/manifest.json'
import packageJsonTpl from '../shared/scaffold/package.json.txt'
import tsconfigTpl from '../shared/scaffold/tsconfig.json.txt'
import pluginignoreTpl from '../shared/scaffold/pluginignore.txt'
import srcHostTpl from '../shared/scaffold/src_host.ts.txt'
import srcIndexTpl from '../shared/scaffold/src_index.tsx.txt'
import srcModelTpl from '../shared/scaffold/src_model.ts.txt'
import srcPanelTpl from '../shared/scaffold/src_Panel.tsx.txt'
import sharedCoreTpl from '../shared/scaffold/shared_core.js.txt'
import serviceKvclientTpl from '../shared/scaffold/service_kvclient.js.txt'
import serviceMainTpl from '../shared/scaffold/service_main.js.txt'
import mcpServerTpl from '../shared/scaffold/mcp_server.js.txt'
import testRunTestsTpl from '../shared/scaffold/test_run-tests.mjs.txt'
import testSmokeRealTpl from '../shared/scaffold/test_smoke-real.mjs.txt'
import readmeTpl from '../shared/scaffold/README.md.txt'

export const TPL_MAP: Record<string, string> = (tplManifestJson as { map: Record<string, string> }).map

export const TEMPLATES: Record<string, string> = {
  'package.json.txt': packageJsonTpl,
  'tsconfig.json.txt': tsconfigTpl,
  'pluginignore.txt': pluginignoreTpl,
  'src_host.ts.txt': srcHostTpl,
  'src_index.tsx.txt': srcIndexTpl,
  'src_model.ts.txt': srcModelTpl,
  'src_Panel.tsx.txt': srcPanelTpl,
  'shared_core.js.txt': sharedCoreTpl,
  'service_kvclient.js.txt': serviceKvclientTpl,
  'service_main.js.txt': serviceMainTpl,
  'mcp_server.js.txt': mcpServerTpl,
  'test_run-tests.mjs.txt': testRunTestsTpl,
  'test_smoke-real.mjs.txt': testSmokeRealTpl,
  'README.md.txt': readmeTpl,
}
