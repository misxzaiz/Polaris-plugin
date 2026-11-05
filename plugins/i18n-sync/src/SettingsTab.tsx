/**
 * 设置 Tab：基准语言 / 服务状态 / 术语表 / 撤销历史与数据管理。
 */
import { useEffect, useState } from 'react'
import type { PanelCtx } from './Panel'
import {
  apiUndoList, getMeta, loadGlossary, loadSettings, loadUndoIndex, saveGlossary, saveSettings,
  metaAlive, type Glossary, type ServiceMeta, type UndoEntry,
} from './model'

export default function SettingsTab({ ctx, meta, onMetaRefresh }: {
  ctx: PanelCtx
  meta: ServiceMeta | null
  onMetaRefresh: () => void
}) {
  const [baseLocale, setBaseLocale] = useState('')
  const [glossary, setGlossary] = useState<Glossary>({ terms: {} })
  const [glossaryDraft, setGlossaryDraft] = useState('') // 每行「源 = 译」
  const [undoList, setUndoList] = useState<UndoEntry[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadSettings().then((s) => setBaseLocale(s.baseLocale || ''))
    loadGlossary().then((g) => {
      setGlossary(g)
      setGlossaryDraft(Object.entries(g.terms).map(([k, v]) => `${k} = ${v}`).join('\n'))
    })
    loadUndoIndex().then(setUndoList).catch(() => setUndoList([]))
  }, [])

  const saveBase = async () => {
    const s = await loadSettings()
    await saveSettings({ ...s, baseLocale: baseLocale.trim() || undefined })
    setMsg('基准语言已保存')
    setTimeout(() => setMsg(''), 2000)
  }

  const saveGlossaryDraft = async () => {
    const terms: Record<string, string> = {}
    for (const line of glossaryDraft.split('\n')) {
      const t = line.trim()
      if (!t) continue
      const idx = t.indexOf('=')
      if (idx <= 0) continue
      const k = t.slice(0, idx).trim()
      const v = t.slice(idx + 1).trim()
      if (k && v) terms[k] = v
    }
    const next = { terms, updatedAt: new Date().toISOString() }
    await saveGlossary(next)
    setGlossary(next)
    setMsg(`术语表已保存（${Object.keys(terms).length} 条），AI 翻译时自动注入`)
    setTimeout(() => setMsg(''), 2500)
  }

  const clearGlossary = async () => {
    const next = { terms: {}, updatedAt: new Date().toISOString() }
    await saveGlossary(next)
    setGlossary(next)
    setGlossaryDraft('')
  }

  const refreshUndo = async () => {
    if (meta && metaAlive(meta)) {
      try { setUndoList(await apiUndoList(meta)); return } catch (_) { /* 落 kv 版 */ }
    }
    setUndoList(await loadUndoIndex())
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {msg && (
        <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', fontSize: 12 }}>{msg}</div>
      )}

      <Card title="基准语言">
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
          翻译源语言。留空=自动推断（zh* 优先，其次 en）。示例：zh-cn、zh、en。
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={baseLocale}
            onChange={(e) => setBaseLocale(e.target.value)}
            placeholder="自动推断"
            style={{ ...inputStyle, width: 180 }}
          />
          <button onClick={() => void saveBase()} style={btnPrimary}>保存</button>
        </div>
      </Card>

      <Card title="术语表（翻译约束）">
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
          每行一条「源词 = 译词」。i18n_missing 输出工作表时自动注入，AI 翻译必须遵守。
          当前 {Object.keys(glossary.terms).length} 条。
        </div>
        <textarea
          value={glossaryDraft}
          onChange={(e) => setGlossaryDraft(e.target.value)}
          rows={6}
          placeholder={'checkout = 结算\n订单 = order'}
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={() => void saveGlossaryDraft()} style={btnPrimary}>保存术语表</button>
          <button onClick={() => void clearGlossary()} style={btnGhost}>清空</button>
        </div>
      </Card>

      <Card title="服务状态">
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          <div>状态：{metaAlive(meta) ? <span style={{ color: '#22c55e' }}>在线</span> : <span style={{ color: '#ef4444' }}>离线（宿主会自动拉起，30s 心跳）</span>}</div>
          {meta && (
            <>
              <div>端口 {meta.port} · 版本 v{meta.version || '?'} · pid {meta.pid || '-'}</div>
              <div>心跳 {String(meta.lastTickAt || '').replace('T', ' ').slice(0, 19) || '—'}</div>
              <div>undo 快照目录：{meta.appConfigDir ? `${meta.appConfigDir}\\i18n-sync-undo\\` : '（未知）'}</div>
            </>
          )}
          <button onClick={onMetaRefresh} style={{ ...btnGhost, marginTop: 6 }}>刷新状态</button>
        </div>
      </Card>

      <Card title="撤销历史（最近 20 批）">
        <div style={{ fontSize: 12 }}>
          {undoList.length === 0 && <span style={{ opacity: 0.7 }}>暂无应用记录。</span>}
          {undoList.slice(0, 8).map((u) => (
            <div key={u.batchId} style={{ display: 'flex', gap: 8, padding: '3px 0', flexWrap: 'wrap' }}>
              <code>{u.batchId}</code>
              <span>{u.locale}</span>
              <span style={{ opacity: 0.6 }}>{u.at.replace('T', ' ').slice(0, 19)}</span>
              <span style={{ opacity: 0.6, wordBreak: 'break-all' }}>{u.files.length} 文件</span>
            </div>
          ))}
          <button onClick={() => void refreshUndo()} style={{ ...btnGhost, marginTop: 6 }}>刷新</button>
        </div>
      </Card>

      <Card title="数据与隐私">
        <div style={{ fontSize: 12, lineHeight: 1.8, opacity: 0.85 }}>
          纯本地零外联：扫描/落盘全在本机；翻译由宿主对话 AI 完成（不额外配置密钥）。
          设置与术语表存 cap.kv（i18n.settings / i18n.glossary）；撤销快照存应用配置目录 i18n-sync-undo/（保留最近 20 批）。
          插件永不删除/覆盖非 locale 文件，应用只写「扫描发现的 locale 文件」。
        </div>
      </Card>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--polaris-border, #3f3f46)', background: 'var(--polaris-surface, rgba(127,127,127,.05))' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--polaris-border, #3f3f46)',
  background: 'transparent', color: 'inherit',
}
const btnPrimary: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: 'var(--polaris-accent, #6366f1)', color: '#fff',
}
const btnGhost: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: '1px solid var(--polaris-border, #3f3f46)',
  background: 'transparent', color: 'inherit', cursor: 'pointer',
}
