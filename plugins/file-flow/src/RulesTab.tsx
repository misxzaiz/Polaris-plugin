/**
 * 规则页：规则列表（启停/编辑/删除/排序）+ 规则编辑器 + 预置起步包
 *
 * 规则一律经命令信箱由服务规范化后落 kv（服务是唯一写者，
 * 面板提交的脏数据会被 lib.normalizeRule 挡下并回显错误）。
 */
import { useMemo, useState } from 'react'
import { callService, ruleSummary, type PanelData, type Rule, type Toast } from './model'

interface Props {
  data: PanelData
  refresh: () => Promise<void>
  showToast: (t: Toast) => void
}

const EMPTY_FORM = {
  id: '',
  name: '',
  rootId: '',
  priority: 100,
  exts: '',
  nameRegex: '',
  minAgeDays: '',
  maxAgeDays: '',
  minSizeMB: '',
  maxSizeMB: '',
  subDir: '',
  type: 'move' as Rule['action']['type'],
  dest: '',
  pattern: '',
  allowOutsideRoot: false,
  enabled: true,
}

export default function RulesTab({ data, refresh, showToast }: Props) {
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState<typeof EMPTY_FORM | null>(null)
  const rules = data.rules
  const roots = useMemo(() => data.snapshot?.roots || [], [data.snapshot])
  const rootName = useMemo(() => new Map(roots.map((r) => [r.id, r.label])), [roots])

  function openNew() {
    setEditing({ ...EMPTY_FORM, rootId: roots[0]?.id || '' })
  }

  function openEdit(r: Rule) {
    setEditing({
      id: r.id,
      name: r.name,
      rootId: r.rootId,
      priority: r.priority,
      exts: (r.match.exts || []).join(', '),
      nameRegex: r.match.nameRegex || '',
      minAgeDays: r.match.minAgeDays != null ? String(r.match.minAgeDays) : '',
      maxAgeDays: r.match.maxAgeDays != null ? String(r.match.maxAgeDays) : '',
      minSizeMB: r.match.minSizeMB != null ? String(r.match.minSizeMB) : '',
      maxSizeMB: r.match.maxSizeMB != null ? String(r.match.maxSizeMB) : '',
      subDir: r.match.subDir || '',
      type: r.action.type,
      dest: r.action.dest || '',
      pattern: r.action.pattern || '',
      allowOutsideRoot: r.action.allowOutsideRoot,
      enabled: r.enabled,
    })
  }

  async function save() {
    if (!editing) return
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s))
    const rule = {
      ...(editing.id ? {} : {}),
      name: editing.name.trim() || '未命名规则',
      rootId: editing.rootId,
      priority: num(String(editing.priority)) ?? 100,
      enabled: editing.enabled,
      stopOnMatch: true,
      match: {
        exts: editing.exts.split(/[,，\s]+/).map((x) => x.trim().replace(/^\./, '').toLowerCase()).filter(Boolean),
        nameRegex: editing.nameRegex.trim() || undefined,
        minAgeDays: num(editing.minAgeDays),
        maxAgeDays: num(editing.maxAgeDays),
        minSizeMB: num(editing.minSizeMB),
        maxSizeMB: num(editing.maxSizeMB),
        subDir: editing.subDir.trim() || undefined,
      },
      action: {
        type: editing.type,
        dest: editing.type === 'move' ? editing.dest.trim() : editing.type === 'dedupe' ? editing.dest.trim() : '',
        pattern: editing.type === 'rename' ? editing.pattern.trim() : '',
        allowOutsideRoot: editing.allowOutsideRoot,
      },
    }
    setBusy('save')
    try {
      if (editing.id) {
        await callService('rules_update', { id: editing.id, patch: rule })
      } else {
        await callService('rules_add', { rule })
      }
      setEditing(null)
      await refresh()
      showToast({ msg: '规则已保存。建议对目标文件夹「立即整理」空跑一次预览。' })
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  async function toggle(r: Rule) {
    setBusy(`t-${r.id}`)
    try {
      await callService('rules_update', { id: r.id, patch: { enabled: !r.enabled } })
      await refresh()
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  async function del(r: Rule) {
    if (!window.confirm(`删除规则「${r.name}」？文件不会动。`)) return
    setBusy(`d-${r.id}`)
    try {
      await callService('rules_delete', { id: r.id })
      await refresh()
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  async function loadPreset(rootId: string) {
    setBusy(`p-${rootId}`)
    try {
      const r = await callService<{ added: number }>('rules_preset', { rootId, packId: 'downloads' })
      await refresh()
      showToast({ msg: `起步包已载入：新增 ${r.added} 条规则（同根同名自动跳过）。` })
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  const rootsWithoutPack = roots // 预置包幂等，重复载入只会跳过

  return (
    <>
      {roots.length > 0 && (
        <div className="ff-card">
          <div className="ff-card-b ff-row" style={{ flexWrap: 'wrap' }}>
            <span className="ff-sub ff-grow">一键载入「下载夹起步包」：重复下载收走 → 安装包/压缩包/文档/图片/媒体归档 → 30 天旧文件冷存（幂等，重复载入自动跳过）。</span>
            {rootsWithoutPack.map((r) => (
              <button key={r.id} className="ff-btn sm" disabled={busy === `p-${r.id}`} onClick={() => loadPreset(r.id)}>载入到「{r.label}」</button>
            ))}
          </div>
        </div>
      )}

      <div className="ff-card">
        <div className="ff-card-b ff-row">
          <span className="ff-sub ff-grow">规则共 {rules.length} 条，按优先级从小到大执行，先命中先得（stopOnMatch）。</span>
          <button className="ff-btn sm" onClick={openNew} disabled={!roots.length}>+ 新建规则</button>
        </div>
        {rules.length === 0 && <div className="ff-empty">还没有规则。载入起步包或在对话里让 AI 帮你写（MCP 工具 flow_rules）。</div>}
        {rules.map((r) => (
          <div className="ff-rule" key={r.id}>
            <div className="ff-rule-h">
              <button
                className={`ff-toggle ${r.enabled ? 'on' : ''}`}
                disabled={busy === `t-${r.id}`}
                title={r.enabled ? '点击停用' : '点击启用'}
                onClick={() => toggle(r)}
              ><i /></button>
              <b>{r.name}</b>
              <span className="ff-tag">#{r.priority}</span>
              <span className="ff-tag">{rootName.get(r.rootId) || '全部根'}</span>
              {r.action.allowOutsideRoot && <span className="ff-tag warn">根外</span>}
              <button className="ff-btn sm ghost" onClick={() => openEdit(r)}>编辑</button>
              <button className="ff-btn sm danger" disabled={busy === `d-${r.id}`} onClick={() => del(r)}>删</button>
            </div>
            <div className="ff-rule-sum">{ruleSummary(r)}</div>
          </div>
        ))}
      </div>

      <div className="ff-card">
        <div className="ff-card-b ff-sub">
          💡 在 Polaris 对话里说「帮我把下载的安装包按月归档、截图单独放」——AI 会用 flow_rules 生成规则、flow_dryrun 预览、确认后 flow_apply。
          目的目录支持变量：{'{yyyy} {mm} {dd} {name} {base} {ext}'}，如 <code>安装包\{'{yyyy}'}-{'{mm}'}</code>。
        </div>
      </div>

      {editing && (
        <div className="ff-modal" onClick={() => setEditing(null)}>
          <div className="ff-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="ff-modal-h">
              <b>{editing.id ? '编辑规则' : '新建规则'}</b>
              <div style={{ flex: 1 }} />
              <button className="ff-btn sm ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="ff-btn sm" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? '保存中…' : '保存'}</button>
            </div>
            <div className="ff-modal-b">
              <div className="ff-grid">
                <div><label className="ff-lab">规则名</label>
                  <input className="ff-inp" value={editing.name} placeholder="安装包按月归档" onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><label className="ff-lab">作用于根目录</label>
                  <select className="ff-sel" style={{ width: '100%' }} value={editing.rootId} onChange={(e) => setEditing({ ...editing, rootId: e.target.value })}>
                    {roots.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select></div>
              </div>
              <div className="ff-grid3">
                <div><label className="ff-lab">优先级（小者先）</label>
                  <input className="ff-inp" type="number" min={1} max={999} value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) || 100 })} /></div>
                <div><label className="ff-lab">最小年龄（天）</label>
                  <input className="ff-inp" type="number" min={0} placeholder="不限" value={editing.minAgeDays} onChange={(e) => setEditing({ ...editing, minAgeDays: e.target.value })} /></div>
                <div><label className="ff-lab">最大年龄（天）</label>
                  <input className="ff-inp" type="number" min={0} placeholder="不限" value={editing.maxAgeDays} onChange={(e) => setEditing({ ...editing, maxAgeDays: e.target.value })} /></div>
              </div>
              <div className="ff-grid">
                <div><label className="ff-lab">扩展名（逗号分隔）</label>
                  <input className="ff-inp" value={editing.exts} placeholder="exe, msi, zip" onChange={(e) => setEditing({ ...editing, exts: e.target.value })} /></div>
                <div><label className="ff-lab">名称正则（可选）</label>
                  <input className="ff-inp" value={editing.nameRegex} placeholder="^(截图|屏幕快照)" onChange={(e) => setEditing({ ...editing, nameRegex: e.target.value })} /></div>
              </div>
              <div className="ff-grid3">
                <div><label className="ff-lab">最小大小（MB）</label>
                  <input className="ff-inp" type="number" min={0} placeholder="不限" value={editing.minSizeMB} onChange={(e) => setEditing({ ...editing, minSizeMB: e.target.value })} /></div>
                <div><label className="ff-lab">最大大小（MB）</label>
                  <input className="ff-inp" type="number" min={0} placeholder="不限" value={editing.maxSizeMB} onChange={(e) => setEditing({ ...editing, maxSizeMB: e.target.value })} /></div>
                <div><label className="ff-lab">仅子目录（可选）</label>
                  <input className="ff-inp" value={editing.subDir} placeholder="未整理" onChange={(e) => setEditing({ ...editing, subDir: e.target.value })} /></div>
              </div>
              <div className="ff-grid">
                <div><label className="ff-lab">动作</label>
                  <select className="ff-sel" style={{ width: '100%' }} value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as Rule['action']['type'] })}>
                    <option value="move">移动到</option>
                    <option value="recycle">移入回收站（_FileFlow回收站）</option>
                    <option value="dedupe">去重（同内容保留最新，其余进回收站）</option>
                    <option value="rename">原地改名</option>
                  </select></div>
                {editing.type === 'rename' ? (
                  <div><label className="ff-lab">改名模板</label>
                    <input className="ff-inp" value={editing.pattern} placeholder="{yyyy}{mm}{dd}-{name}{ext}" onChange={(e) => setEditing({ ...editing, pattern: e.target.value })} /></div>
                ) : (
                  <div><label className="ff-lab">目的目录（move/dedupe 可填，支持变量）</label>
                    <input className="ff-inp" value={editing.dest} placeholder="安装包\{yyyy}-{mm}" disabled={editing.type === 'recycle'} onChange={(e) => setEditing({ ...editing, dest: e.target.value })} /></div>
                )}
              </div>
              <div className="ff-field">
                <div className="ff-field-l">
                  <b>允许根外目的路径</b>
                  <small>关闭=目的目录必须在受管文件夹内（推荐）。开启后这些动作不会被自动模式执行，仅手动确认时执行。</small>
                </div>
                <button className={`ff-toggle ${editing.allowOutsideRoot ? 'on' : ''}`} onClick={() => setEditing({ ...editing, allowOutsideRoot: !editing.allowOutsideRoot })}><i /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
