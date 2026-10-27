/**
 * index.tsx —— 面板入口（宿主按 mod.default 加载）
 */
import TimeSiftPanel from './Panel'

export default function TimeSiftEntry(props: { pluginId: string }) {
  return <TimeSiftPanel pluginId={props.pluginId} />
}
