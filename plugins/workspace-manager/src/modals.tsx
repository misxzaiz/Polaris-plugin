/**
 * 弹窗集合:新建工作区 / 重命名 / 元数据编辑(图标/分组/置顶/备注) / 新建分组 / 批量移入分组
 */

import { useState } from 'react'
import type { Workspace, WorkspaceMeta, ModalState, HostWorkspaceApi } from './types'

const ICON_CHOICES = ['📁', '🏠', '📱', '🔧', '🎨', '📊', '🧪', '🚀', '📚', '🎮', '💼', '🌱', '⚡', '🧠', '🏷️', '⭐']

interface ModalsProps {
  modal: ModalState
  workspaces: Workspace[]
  groups: string[]
  selectedIds: Set<string>
  api: HostWorkspaceApi | null
  onClose: () => void
  onCreate: (name: string, path: string, switchAfter: boolean) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onUpdateMeta: (patch: WorkspaceMeta, id: string) => Promise<void>
  onBatchGroup: (group: string) => Promise<void>
  onSaveGroup: (name: string) => void
}

export function WorkspaceModals(props: ModalsProps) {
  const { modal, workspaces, groups, selectedIds, api, onClose } = props
  if (!modal) return null

  if (modal.kind === 'create') {
    return <CreateModal {...props} />
  }
  if (modal.kind === 'rename') {
    const ws = workspaces.find((w) => w.id === modal.id)
    return <RenameModal key={modal.id} workspace={ws} onClose={onClose} onRename={props.onRename} />
  }
  if (modal.kind === 'editMeta') {
    const ws = workspaces.find((w) => w.id === modal.id)
    return <MetaModal key={modal.id} workspace={ws} initialMeta={modal.initialMeta} groups={groups} onClose={onClose} onUpdate={props.onUpdateMeta} />
  }
  if (modal.kind === 'newGroup') {
    return <NewGroupModal onClose={onClose} onSave={props.onSaveGroup} />
  }
  if (modal.kind === 'batchGroup') {
    return <BatchGroupModal groups={groups} count={selectedIds.size} onClose={onClose} onApply={props.onBatchGroup} />
  }
  return null
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="wm-overlay" onClick={(e) => { if (e.target === e.currentTarget) return }}>
      <div className="wm-modal">{children}</div>
    </div>
  )
}

function Actions({ onClose, onConfirm, confirmLabel, busy, disabled }: {
  onClose: () => void
  onConfirm: () => void
  confirmLabel: string
  busy?: boolean
  disabled?: boolean
}) {
  return (
    <div className="wm-modal-actions">
      <button className="wm-btn" onClick={onClose}>取消</button>
      <button className="wm-btn wm-btn-primary" onClick={onConfirm} disabled={busy || disabled}>
        {busy ? '...' : confirmLabel}
      </button>
    </div>
  )
}

function CreateModal({ api, onClose, onCreate }: ModalsProps) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [switchAfter, setSwitchAfter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async () => {
    if (!name.trim() || !path.trim()) { setError('请填写名称与路径'); return }
    setBusy(true)
    setError('')
    try {
      const valid = await api?.validatePath(path.trim())
      if (!valid) { setError('路径无效(需为存在的目录)'); setBusy(false); return }
      await onCreate(name.trim(), path.trim(), switchAfter)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay>
      <h3>新建工作区</h3>
      <div className="wm-field">
        <label>名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如: 我的项目" autoFocus />
      </div>
      <div className="wm-field">
        <label>路径</label>
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="D:\\projects\\my-project" />
      </div>
      <div className="wm-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={switchAfter} onChange={(e) => setSwitchAfter(e.target.checked)} style={{ width: 'auto' }} />
          创建后立即切换
        </label>
      </div>
      <div className="wm-error">{error}</div>
      <Actions onClose={onClose} onConfirm={confirm} confirmLabel="创建" busy={busy} />
    </Overlay>
  )
}

function RenameModal({ workspace, onClose, onRename }: {
  workspace?: Workspace
  onClose: () => void
  onRename: (id: string, name: string) => Promise<void>
}) {
  const [name, setName] = useState(workspace?.name ?? '')
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (!workspace || !name.trim()) return
    setBusy(true)
    try {
      await onRename(workspace.id, name)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay>
      <h3>重命名工作区</h3>
      <div className="wm-field">
        <label>新名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') confirm() }} />
      </div>
      <Actions onClose={onClose} onConfirm={confirm} confirmLabel="重命名" busy={busy} disabled={!name.trim()} />
    </Overlay>
  )
}

function MetaModal({ workspace, initialMeta, groups, onClose, onUpdate }: {
  workspace?: Workspace
  initialMeta?: WorkspaceMeta
  groups: string[]
  onClose: () => void
  onUpdate: (patch: WorkspaceMeta, id: string) => Promise<void>
}) {
  const [icon, setIcon] = useState(initialMeta?.icon ?? '📁')
  const [group, setGroup] = useState(initialMeta?.group ?? '')
  const [newGroup, setNewGroup] = useState('')
  const [pinned, setPinned] = useState(!!initialMeta?.pinned)
  const [notes, setNotes] = useState(initialMeta?.notes ?? '')
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (!workspace) return
    setBusy(true)
    const finalGroup = newGroup.trim() || group
    try {
      await onUpdate({
        icon: icon === '📁' ? undefined : icon,
        group: finalGroup || undefined,
        pinned: pinned || undefined,
        notes: notes.trim() || undefined,
      }, workspace.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay>
      <h3>编辑: {workspace?.name ?? ''}</h3>
      <div className="wm-field">
        <label>图标</label>
        <div className="wm-emoji-row">
          {ICON_CHOICES.map((c) => (
            <button key={c} className={`wm-emoji-opt${icon === c ? ' selected' : ''}`} onClick={() => setIcon(c)}>{c}</button>
          ))}
        </div>
      </div>
      <div className="wm-field">
        <label>分组</label>
        <select
          value={group}
          onChange={(e) => { setGroup(e.target.value); setNewGroup('') }}
          style={{ width: '100%', background: 'var(--background-secondary, #1a1a22)', border: '1px solid var(--border, rgba(255,255,255,0.1))', borderRadius: 5, padding: '6px 9px', color: 'var(--text-primary, #e4e4e7)', fontSize: 12 }}
        >
          <option value="">(未分组)</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="wm-field">
        <label>或新建分组</label>
        <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="输入新分组名" />
      </div>
      <div className="wm-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} style={{ width: 'auto' }} />
          置顶
        </label>
      </div>
      <div className="wm-field">
        <label>备注</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="可选:项目说明/客户名" />
      </div>
      <Actions onClose={onClose} onConfirm={confirm} confirmLabel="保存" busy={busy} />
    </Overlay>
  )
}

function NewGroupModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <Overlay>
      <h3>新建分组</h3>
      <div className="wm-field">
        <label>分组名</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onSave(name.trim()); onClose() } }} />
      </div>
      <Actions onClose={onClose} onConfirm={() => { if (name.trim()) { onSave(name.trim()); onClose() } }} confirmLabel="创建" disabled={!name.trim()} />
    </Overlay>
  )
}

function BatchGroupModal({ groups, count, onClose, onApply }: {
  groups: string[]
  count: number
  onClose: () => void
  onApply: (group: string) => Promise<void>
}) {
  const [group, setGroup] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await onApply(newGroup.trim() || group)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay>
      <h3>移入分组({count} 项)</h3>
      <div className="wm-field">
        <label>目标分组</label>
        <select
          value={group}
          onChange={(e) => { setGroup(e.target.value); setNewGroup('') }}
          style={{ width: '100%', background: 'var(--background-secondary, #1a1a22)', border: '1px solid var(--border, rgba(255,255,255,0.1))', borderRadius: 5, padding: '6px 9px', color: 'var(--text-primary, #e4e4e7)', fontSize: 12 }}
        >
          <option value="">(移出分组)</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="wm-field">
        <label>或新建分组</label>
        <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="输入新分组名" />
      </div>
      <Actions onClose={onClose} onConfirm={confirm} confirmLabel="移入" busy={busy} disabled={!group && !newGroup.trim()} />
    </Overlay>
  )
}
