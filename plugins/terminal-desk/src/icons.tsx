/**
 * 内联 SVG 图标（不引入 lucide 依赖；插件 bundle 与宿主 React shim 同源）。
 * 统一 currentColor + 1.9 stroke（对齐宿主 lucide 的 2），替代旧版 Unicode 字形
 * （＋ ⿴ ▶ ▴ ✕），解决图标大小不一、字体缺失与对齐抖动。
 */
export type IconName =
  | 'chevron-down'
  | 'chevron-up'
  | 'clipboard'
  | 'close'
  | 'columns'
  | 'copy'
  | 'download'
  | 'edit'
  | 'eraser'
  | 'external'
  | 'eye-off'
  | 'maximize'
  | 'minimize'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'select-all'
  | 'square'
  | 'terminal'
  | 'trash'
  | 'zap'
  | 'alert';

const PATHS: Record<IconName, JSX.Element> = {
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  // lucide Clipboard（画布右键「粘贴」）
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  external: (
    <>
      <path d="M14 3h7v7M21 3l-9 9" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </>
  ),
  eraser: (
    <>
      <path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21" />
      <path d="M22 21H7M5 11l9 9" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.6 10.6 0 0 1 12 5c5 0 9 5 9 7a12 12 0 0 1-2.2 2.9M6.6 6.6C4.3 8 3 10.2 3 12c0 2 4 7 9 7a9.7 9.7 0 0 0 4.2-.9" />
    </>
  ),
  maximize: <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3" />,
  minimize: <path d="M3 8h3a2 2 0 0 0 2-2V3m13 5h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3m13-5h-3a2 2 0 0 0-2 2v3" />,
  play: <path d="m7 4 13 8-13 8V4Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  'select-all': (
    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
  ),
  square: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  // 对齐 lucide Terminal：无外框的提示符折线 + 光标横线。
  // 旧版自带矩形窗口外框，与宿主其余线性图标的视觉重量不一致。
  terminal: <path d="m4 17 6-6-6-6M12 19h8" />,
  trash: (
    <>
      <path d="M4 7h16M10 11v6m4-6v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
    </>
  ),
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4m0 4h.01" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 14, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {PATHS[name]}
    </svg>
  );
}
