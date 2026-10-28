/**
 * 浏览器打包等价代理：与 dist/panel.js 相同的 esbuild 浏览器形态（ESM、browser platform、
 * react 外置），把 shared 引擎链（core+render+vendor exceljs UMD）整体打包后在此入口执行
 * writeBuffer —— 验证「esbuild 转换不损坏 exceljs、引擎在打包语境下可用」。
 * 用法：esbuild 打包本入口 → node 执行 → 产物交 openpyxl 验收。
 */
import { core, render } from '../src/model'

export async function proxyBuild(): Promise<{ b64: string, sheets: string[] }> {
  const spec = {
    title: '浏览器链路验证',
    theme: 'plain',
    sheets: [{
      name: '数据',
      columns: [
        { h: '名称', type: 'text' },
        { h: '数量', type: 'int' },
        { h: '金额', type: 'money', formula: '=B{r}*2' },
      ],
      rows: [['中文值', 3, null], ['=注入', 5, null]],
      stats: [{ type: 'sum' }],
      conditional: [{ col: 1, op: 'lt', value: 4, style: 'warn' }],
    }],
  }
  const norm = core.normalizeBook(spec)
  if (norm.error || !norm.book) throw new Error(`normalize: ${norm.error}`)
  const g = core.layout(norm.book)
  const buf = await render.renderToBuffer(norm.book, g)
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return { b64: btoa(bin), sheets: g.sheets.map((s) => s.name) }
}
