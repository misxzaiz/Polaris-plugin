import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileExplorer } from './FileExplorer/FileExplorer'
import { FileSearchModal } from './Editor/FileSearchModal'
import { NarrowTabOverlay } from './Editor/NarrowTabOverlay'
import { useOverlayStore, useNarrowTabStore } from './deps'

/**
 * files-desk 面板入口 —— 文件工作台（文件浏览器席位 shadow 接管）
 * Editor/Diff 由宿主 CenterStage 经 tabStore 渲染（tabStore/fileEditorStore 留宿主）。
 */
export default function FilesDeskEntry() {
  return (
    <>
      <FileExplorer />
      <GlobalOverlays />
    </>
  )
}

/** 全局 overlay：文件搜索弹窗 + 窄屏 tab 覆盖层（原 App.tsx 顶层挂载，随域迁入） */
function GlobalOverlays() {
  const showFileSearch = useOverlayStore((s: any) => s.fileSearchOpen)
  const narrowTabId = useNarrowTabStore((s: any) => s.narrowTabId)
  const isCompact = useViewStoreIsCompact()
  return (
    <>
      {isCompact && narrowTabId && createPortal(<NarrowTabOverlay />, document.body)}
      {showFileSearch && createPortal(<FileSearchModal onClose={() => useOverlayStore.getState().setFileSearchOpen(false)} />, document.body)}
    </>
  )
}

function useViewStoreIsCompact(): boolean {
  const [compact, setCompact] = useState(() => window.innerWidth < 500)
  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 500)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return compact
}
import { EditorPanel } from './Editor/EditorPanel'
import { DiffViewer } from './Diff/DiffViewer'

/**
 * 注册 editor/diff 两个 Tab 类型渲染器到宿主 pluginTabRendererRegistry，
 * CenterStage 优先用插件渲染器（files-desk 启用并加载后接管主舞台编辑器/Diff）。
 */
try {
  const reg = (globalThis as any).__POLARIS_APP_CORE__.pluginSystem.pluginTabRendererRegistry
  reg.register('editor', 'files-desk', function EditorTabRenderer({ tab }: { tab: any }) {
    return <EditorPanel filePath={(tab as any).filePath} />
  })
  reg.register('diff', 'files-desk', function DiffTabRenderer({ tab }: { tab: any }) {
    return <DiffViewer diffData={(tab as any).diffData} />
  })
} catch (e) {
  console.warn('[files-desk] 注册 Tab 渲染器失败（宿主过旧）', e)
}
