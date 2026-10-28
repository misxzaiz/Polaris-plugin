import Panel from './Panel'

export default function QuoteSentinelPanel(props: { pluginId: string; onSendToChat?: (text: string) => void }) {
  return <Panel pluginId={props.pluginId} />
}
