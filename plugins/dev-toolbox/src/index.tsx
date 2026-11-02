import DevToolboxPanel from './Panel'

// 样式不走 JS import（esbuild 会拆出 dist/panel.css，而宿主只认 manifest 的 contributes.styles）。
// src/styles.css 由 build.mjs 同步进 plugin.json，见 build.mjs 注释。
export default function DevToolboxPanelEntry() {
  return <DevToolboxPanel />
}
