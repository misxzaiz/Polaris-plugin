/** 作品 Tab：MCP（对话生成）与面板共享的登记列表，含路径复制与定位引导。 */
import { useState } from 'react'
import type { PanelCtx } from './Panel'
import { core } from './model'

function fmtTs(ts: number): string {
  const d = new Date(ts || 0)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export default function WorksTab({ ctx }: { ctx: PanelCtx }) {
  const { works, reloadWorks, showToast } = ctx
  const [copied, setCopied] = useState('')

  const copyPath = async (path: string, id: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(id)
      showToast('路径已复制')
      window.setTimeout(() => setCopied(''), 1500)
    } catch {
      showToast('复制失败（浏览器未授权剪贴板）', 'bad')
    }
  }

  return (
    <div>
      <div className="gz-sec">
        <span className="gz-bar" />作品
        <span className="gz-hint">对话里「帮我把…做成 Excel」生成的文件也登记在这里</span>
      </div>
      {works.length === 0 && (
        <div className="gz-empty">
          还没有作品。<br />在创作 Tab 粘贴数据构建，或在对话里说<br />「帮我把这些数据做成 Excel，落盘到桌面」
        </div>
      )}
      {works.map((w) => (
        <div className="gz-item" key={w.id}>
          <div className="gz-item-head">
            <b>{w.title}</b>
            <span className="gz-badge">{w.sheetCount} 表 · {w.rowCount} 行</span>
            <span className="gz-badge">{core.THEMES[w.theme] ? core.THEMES[w.theme].label : w.theme}</span>
          </div>
          <div className="gz-item-mid">
            {fmtTs(w.ts)} · {w.file}
            <br />{w.path}
          </div>
          <div className="gz-row" style={{ marginTop: 7 }}>
            <button className="gz-btn sm ghost" onClick={() => copyPath(w.path, w.id)}>{copied === w.id ? '✓ 已复制' : '复制路径'}</button>
            <span className="gz-sub" style={{ marginLeft: 'auto' }}>Excel / WPS 打开即可继续编辑</span>
          </div>
        </div>
      ))}
      {works.length > 0 && (
        <div className="gz-row" style={{ padding: '2px 16px 10px' }}>
          <button className="gz-btn sm ghost" onClick={() => reloadWorks()}>刷新</button>
          <span className="gz-sub">想在资源管理器里定位？在对话里说「用 xlsx_reveal 打开最近的表格」</span>
        </div>
      )}
    </div>
  )
}
