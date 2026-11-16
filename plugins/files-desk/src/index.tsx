import { FileExplorer } from './FileExplorer/FileExplorer'

/**
 * files-desk 面板入口 —— 文件工作台（文件浏览器席位 shadow 接管）
 * Editor/Diff 由宿主 CenterStage 经 tabStore 渲染（tabStore/fileEditorStore 留宿主）。
 */
export default function FilesDeskEntry() {
  return <FileExplorer />
}