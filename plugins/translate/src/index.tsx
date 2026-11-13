/**
 * translate 面板入口：宿主按 mod.default 加载 dist/panel.js。
 * props 契约：{ pluginId, onSendToChat }（同 im-bridge / browser-desk）。
 */
import { TranslatePanel, type TranslatePanelProps } from './Panel';

export default function TranslatePanelEntry(props: TranslatePanelProps) {
  return <TranslatePanel {...props} />;
}

export { TranslatePanel };
export type { TranslatePanelProps };
