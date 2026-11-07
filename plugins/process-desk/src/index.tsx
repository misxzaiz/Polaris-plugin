import Panel from './Panel'

export default function ProcessDeskEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <Panel pluginId={props.pluginId} onSendToChat={props.onSendToChat} />
}
