/**
 * theme.ts —— 宿主主题订阅（对齐 terminal-desk bridge 的 __POLARIS_THEME_API__）
 *
 * 插件样式经 slot 作用域注入后自动跟随宿主 CSS 变量；这里只负责把宿主
 * 主题切换事件转成 React 可订阅信号（供个别需要重算的颜色/图标用）。
 */

export interface ThemeApi {
  activeId: () => string;
  subscribe: (listener: () => void) => () => void;
}

export function getThemeApi(): ThemeApi | null {
  const api = (window as unknown as { __POLARIS_THEME_API__?: ThemeApi }).__POLARIS_THEME_API__;
  return api ?? null;
}

export function getActiveThemeId(): string {
  return getThemeApi()?.activeId() ?? '';
}
