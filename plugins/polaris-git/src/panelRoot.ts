/**
 * 面板根元素引用（.pg-root）—— 菜单/对话框的定位与钳位边界。
 * Panel 挂载时写入；内联渲染（无 portal）的浮层以它为 containing block。
 */
export const panelRootRef: { current: HTMLElement | null } = { current: null };
