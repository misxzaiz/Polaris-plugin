/**
 * 交互面板全屏覆盖层（card / panel 共用，原生 DOM 实现）
 *
 * 为什么是原生 DOM 而不是 React portal：
 * 宿主 pluginModuleLoader 的 React shim 只导出 hooks + createElement + jsx runtime，
 * 不导出 createPortal；window 也未挂 react-dom（见 plans/interactive-panel-fullscreen-spec.md §3.3）。
 * 覆盖层必须挂到 document.body，才能脱离 react-virtuoso 的 transform item 与
 * PluginCardHost 的 overflow-hidden —— 组件树内的 position:fixed 会被劫持/裁剪。
 *
 * 状态单源（spec §3.5）：覆盖层只负责 DOM，退出一律回调 onClose → 由调用方的
 * React state 驱动 useEffect cleanup 移除本层；覆盖层自身不持有独立的 open 布尔。
 *
 * 顶部操作栏常驻且在 iframe 之外：焦点落在 sandbox iframe 内时按钮仍可点击，
 * 不再依赖「宿主 window 收不到 iframe 内 Esc」这条唯一出口。
 */

export interface FullscreenOverlayOptions {
  title: string
  /** 版本 / 「闪造应用」等，拼在标题后 */
  meta?: string
  srcDoc: string
  sandbox: string
  allow: string
  /** iframe 底色：主题注入档 transparent，否则白底 */
  frameBg: string
  /** 顶部栏次级操作（静音 / 复制源码路径等） */
  actions?: { label: string; onClick: () => void }[]
  /** 覆盖层 iframe 交给调用方（如静音协议需向两个 iframe 广播） */
  onFrame?: (frame: HTMLIFrameElement) => void
  /** 覆盖层内「退出全屏」/ Esc → 回写 React state */
  onClose: () => void
}

/** 宿主 TopMenuBar h-10；与旧 ArtifactPreviewRenderer 的 TOPBAR_HEIGHT 一致 */
const TOPBAR_OFFSET_PX = 40
/** 对齐宿主 --z-overlay(40)，不压 z-popover:50 / z-modal:70 */
const Z_OVERLAY = 'var(--z-overlay, 40)'

let active: { root: HTMLElement; detach: () => void } | null = null

/** 只拆 DOM、解绑事件；不回调 onClose（避免与 React state 回写形成双写） */
function teardown(): void {
  if (!active) return
  const { root, detach } = active
  active = null
  detach()
  root.remove()
}

/**
 * 打开覆盖层；返回**仅作用于本层**的 close，供 useEffect cleanup。
 * 重复调用先关旧层（幂等），旧句柄不会误关新层。
 */
export function openFullscreenOverlay(opts: FullscreenOverlayOptions): () => void {
  teardown()

  const root = document.createElement('div')
  root.className = 'flex flex-col bg-background'
  Object.assign(root.style, {
    position: 'fixed',
    top: `${TOPBAR_OFFSET_PX}px`,
    left: '0',
    right: '0',
    bottom: '0',
  })
  root.style.setProperty('z-index', Z_OVERLAY)

  // 顶部操作栏：48px 常驻，shrink-0
  const bar = document.createElement('div')
  bar.className = 'flex items-center justify-between gap-2 border-b border-border bg-background-elevated'
  Object.assign(bar.style, {
    height: '48px',
    flex: '0 0 48px',
    padding: '0 14px',
  })

  const left = document.createElement('div')
  left.className = 'flex min-w-0 items-center gap-2'
  const chip = document.createElement('span')
  chip.className = 'shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-400'
  chip.textContent = '交互面板'
  const titleEl = document.createElement('span')
  titleEl.className = 'truncate text-xs font-medium text-text-primary'
  titleEl.textContent = opts.title
  left.append(chip, titleEl)
  if (opts.meta) {
    const meta = document.createElement('span')
    meta.className = 'shrink-0 text-[10px] text-text-tertiary'
    meta.textContent = opts.meta
    left.appendChild(meta)
  }

  const right = document.createElement('div')
  right.className = 'flex shrink-0 items-center gap-2'
  for (const action of opts.actions ?? []) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'text-[10px] text-text-tertiary hover:text-text-primary'
    btn.textContent = action.label
    btn.onclick = action.onClick
    right.appendChild(btn)
  }
  // 推荐样式 A：醒目主按钮（沿用宿主已生成的 bg-red-500，不硬编码色值）
  const exit = document.createElement('button')
  exit.type = 'button'
  exit.className = 'bg-red-500 text-white'
  exit.textContent = '✕ 退出全屏'
  Object.assign(exit.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  })
  exit.onclick = opts.onClose
  right.appendChild(exit)
  bar.append(left, right)

  const content = document.createElement('div')
  content.className = 'flex-1 overflow-hidden'
  const frame = document.createElement('iframe')
  frame.title = opts.title
  frame.setAttribute('sandbox', opts.sandbox)
  frame.setAttribute('allow', opts.allow)
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.srcdoc = opts.srcDoc
  Object.assign(frame.style, {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block',
    background: opts.frameBg,
  })
  content.appendChild(frame)
  opts.onFrame?.(frame)

  root.append(bar, content)

  // Esc 为辅助出口：焦点在 iframe 内时收不到，由上面的按钮兜底。
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') opts.onClose()
  }
  document.addEventListener('keydown', onKey)
  document.body.appendChild(root)

  active = { root, detach: () => document.removeEventListener('keydown', onKey) }

  return () => {
    if (active?.root === root) teardown()
  }
}
