/**
 * im-bridge 面板入口：宿主按 mod.default 加载 dist/panel.js。
 * props 契约：{ pluginId, onSendToChat }（同 ai-scheduler / browser-desk）。
 */
import { Panel } from './Panel';

export default function ImBridgePanel() {
  return <Panel />;
}

export { Panel };
