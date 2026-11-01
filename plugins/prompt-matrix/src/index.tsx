import Panel from './Panel'

/** 宿主按 mod.default 加载（house 契约） */
export default function PromptMatrixEntry(props: {
  pluginId: string
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  return <Panel pluginId={props.pluginId} onSendToChat={props.onSendToChat} />
}
