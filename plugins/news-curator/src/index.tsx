/**
 * 入口：AI 每日刊物面板（dist/panel.js，宿主按 mod.default 加载）
 */
import NewsPanel from './Panel'

export default function NewsCuratorEntry(props: any) {
  return <NewsPanel {...props} />
}
