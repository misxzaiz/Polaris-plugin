import QueryPlanLensPanel from './Panel'

export default function PanelRoot(props: { pluginId: string; onSendToChat?: (msg: string) => void | Promise<void> }) {
  return <QueryPlanLensPanel {...props} />
}
