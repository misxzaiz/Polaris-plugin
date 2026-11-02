/**
 * ConnectionsTab.tsx —— 连接管理：列表 + 新建/编辑 + 测试 + 删除
 * 密码只在提交时提交给 service（存本地文件或一次性使用），面板不持久化。
 */
import { useState } from 'react'
import type { SvcClient, Profile } from './model'
import { fmtTime } from './model'
import type { Toast } from './Panel'

const TYPE_META: Record<string, { label: string; color: string; defPort: number; userLabel: string; needDb: boolean }> = {
  mysql: { label: 'MySQL', color: '#00758F', defPort: 3306, userLabel: '用户名', needDb: true },
  postgres: { label: 'PostgreSQL', color: '#336791', defPort: 5432, userLabel: '用户名', needDb: true },
  redis: { label: 'Redis', color: '#DC382D', defPort: 6379, userLabel: '用户名(ACL 可空)', needDb: false },
}

interface FormState {
  id?: string
  type: 'mysql' | 'postgres' | 'redis'
  name: string
  host: string
  port: string
  username: string
  database: string
  password: string
  readonly: boolean
  allowWrite: boolean
  rememberPass: boolean
  note: string
}

function blankForm(type: FormState['type']): FormState {
  return {
    type,
    name: '',
    host: '127.0.0.1',
    port: String(TYPE_META[type].defPort),
    username: type === 'redis' ? '' : 'root',
    database: '',
    password: '',
    readonly: true,
    allowWrite: false,
    rememberPass: false,
    note: '',
  }
}

export default function ConnectionsTab({ svc, profiles, reloadProfiles, selectedId, setSelectedId, showToast }: {
  svc: SvcClient
  profiles: Profile[]
  reloadProfiles: () => Promise<Profile[]>
  selectedId: string
  setSelectedId: (id: string) => void
  showToast: Toast
}) {
  const [editing, setEditing] = useState<FormState | null>(null)
  const [busy, setBusy] = useState('')
  const [testing, setTesting] = useState<Record<string, { ok: boolean; msg: string }>>({})

  const startEdit = (p: Profile) => {
    setEditing({
      id: p.id,
      type: p.type,
      name: p.name,
      host: p.host,
      port: String(p.port),
      username: p.username,
      database: p.database,
      password: '',
      readonly: p.readonly,
      allowWrite: p.allowWrite,
      rememberPass: p.rememberPass,
      note: p.note,
    })
  }

  const submit = async () => {
    if (!editing) return
    const meta = TYPE_META[editing.type]
    if (!editing.name.trim()) { showToast('名称必填', true); return }
    if (!editing.host.trim()) { showToast('主机必填', true); return }
    if (meta.needDb && !editing.database.trim()) { showToast(`${meta.label} 需要填写 database`, true); return }
    if (editing.type !== 'redis' && !editing.username.trim()) { showToast(meta.userLabel + ' 必填', true); return }
    setBusy('save')
    try {
      const r = await svc.saveProfile(
        {
          id: editing.id,
          type: editing.type,
          name: editing.name.trim(),
          host: editing.host.trim(),
          port: parseInt(editing.port, 10) || meta.defPort,
          username: editing.username.trim(),
          database: editing.database.trim(),
          readonly: editing.readonly,
          allowWrite: editing.allowWrite,
          rememberPass: editing.rememberPass,
          note: editing.note,
        },
        editing.password || undefined,
      )
      if (!r.ok) { showToast(r.error || '保存失败', true); return }
      showToast(editing.id ? '已保存' : '连接已创建')
      await reloadProfiles()
      if (!editing.id && r.profile) setSelectedId(r.profile.id)
      setEditing(null)
    } catch (e: any) {
      showToast(e.message || '保存失败', true)
    } finally {
      setBusy('')
    }
  }

  const doTest = async (p: Profile) => {
    setTesting((m) => ({ ...m, [p.id]: { ok: false, msg: '测试中…' } }))
    try {
      const r = await svc.testProfile(p.id)
      setTesting((m) => ({ ...m, [p.id]: r.ok
        ? { ok: true, msg: `✓ ${r.serverVersion || '连通'}` }
        : { ok: false, msg: `✗ ${r.error || '失败'}` } }))
    } catch (e: any) {
      setTesting((m) => ({ ...m, [p.id]: { ok: false, msg: `✗ ${e.message}` } }))
    }
  }

  const doDelete = (p: Profile) => {
    if (!window.confirm(`删除连接「${p.name}」？（本机保存的密码也会一并删除；数据库本身不受影响）`)) return
    setBusy(p.id)
    svc.deleteProfile(p.id)
      .then(async (r) => {
        if (!r.ok) { showToast(r.error || '删除失败', true); return }
        showToast('已删除')
        if (selectedId === p.id) setSelectedId('')
        await reloadProfiles()
      })
      .catch((e) => showToast(e.message, true))
      .finally(() => setBusy(''))
  }

  const meta = editing ? TYPE_META[editing.type] : null

  return (
    <div>
      <div className="dbw-sec">
        <div className="dbw-bar" />
        连接
        <span className="dbw-hint">数据不出本机；AI 通道永远只读</span>
      </div>

      {profiles.length === 0 && (
        <div className="dbw-empty">
          还没有连接。<br />
          点击下方按钮添加 MySQL / PostgreSQL / Redis 连接。
        </div>
      )}

      <div className="dbw-card">
        {profiles.map((p) => {
          const m = TYPE_META[p.type]
          const t = testing[p.id]
          return (
            <div
              key={p.id}
              className={`dbw-pcard ${selectedId === p.id ? 'on' : ''}`}
              onClick={() => setSelectedId(p.id)}
            >
              <div className="dbw-picon" style={{ background: m.color }}>{m.label[0]}</div>
              <div className="dbw-pinfo">
                <b>
                  {p.name}
                  {p.readonly
                    ? <span className="dbw-tag g" style={{ marginLeft: 6 }}>只读</span>
                    : <span className="dbw-tag y" style={{ marginLeft: 6 }}>可写</span>}
                  {p.type === 'redis' && <span className="dbw-tag r" style={{ marginLeft: 4 }}>Redis</span>}
                </b>
                <small>
                  {p.host}:{p.port}{p.database ? `/${p.database}` : ''} · {p.hasStoredPass ? '已存密码' : '无存密码'} · {p.lastUsedAt ? `上次使用 ${fmtTime(p.lastUsedAt)}` : '未使用'}
                </small>
                {t && <small style={{ color: t.ok ? '#3FB950' : '#F85149' }}>{t.msg}</small>}
              </div>
              <div className="dbw-row" onClick={(e) => e.stopPropagation()}>
                <button className="dbw-btn ghost sm" onClick={() => void doTest(p)}>测试</button>
                <button className="dbw-btn ghost sm" onClick={() => startEdit(p)}>编辑</button>
                <button className="dbw-btn danger sm" disabled={busy === p.id} onClick={() => doDelete(p)}>删除</button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '2px 16px' }}>
        <button className="dbw-btn" onClick={() => setEditing(blankForm('mysql'))}>+ 新建连接</button>
      </div>

      {editing && meta && (
        <div className="dbw-modal" onClick={() => setEditing(null)}>
          <div className="dbw-modal-c" onClick={(e) => e.stopPropagation()}>
            <div className="dbw-h3">{editing.id ? '编辑连接' : '新建连接'}</div>
            <div className="dbw-row" style={{ marginBottom: 9 }}>
              {(['mysql', 'postgres', 'redis'] as const).map((tp) => (
                <button
                  key={tp}
                  className={`dbw-btn sm ${editing.type === tp ? '' : 'ghost'}`}
                  onClick={() => setEditing({ ...editing, type: tp, port: String(TYPE_META[tp].defPort), username: tp === 'redis' ? '' : editing.username || 'root', database: tp === 'redis' ? '' : editing.database })}
                >
                  {TYPE_META[tp].label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div className="dbw-lbl">名称 *</div>
                <input className="dbw-inp" value={editing.name} placeholder="本地开发库" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <div className="dbw-lbl">主机 *</div>
                <input className="dbw-inp" value={editing.host} onChange={(e) => setEditing({ ...editing, host: e.target.value })} />
              </div>
              <div>
                <div className="dbw-lbl">端口</div>
                <input className="dbw-inp" value={editing.port} onChange={(e) => setEditing({ ...editing, port: e.target.value })} />
              </div>
              <div>
                <div className="dbw-lbl">{editing.type === 'redis' ? 'DB 编号(0-15,可空)' : 'Database *'}</div>
                <input className="dbw-inp" value={editing.database} onChange={(e) => setEditing({ ...editing, database: e.target.value })} placeholder={editing.type === 'redis' ? '0' : 'dbname'} />
              </div>
              <div>
                <div className="dbw-lbl">{meta.userLabel}</div>
                <input className="dbw-inp" value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} placeholder={editing.type === 'redis' ? 'default' : 'root'} />
              </div>
              <div>
                <div className="dbw-lbl">密码</div>
                <input className="dbw-inp" type="password" value={editing.password} placeholder={editing.id ? '留空=沿用已存密码' : '未填则每次使用时输入'} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="dbw-chk">
                <input type="checkbox" checked={editing.rememberPass} onChange={(e) => setEditing({ ...editing, rememberPass: e.target.checked })} />
                记住密码（存本机服务侧文件，不进 kv / 不给 AI）
              </label>
              <label className="dbw-chk">
                <input type="checkbox" checked={editing.readonly} onChange={(e) => setEditing({ ...editing, readonly: e.target.checked, allowWrite: e.target.checked ? false : editing.allowWrite })} />
                只读连接（推荐；写语句一律拦截）
              </label>
              {!editing.readonly && (
                <label className="dbw-chk">
                  <input type="checkbox" checked={editing.allowWrite} onChange={(e) => setEditing({ ...editing, allowWrite: e.target.checked })} />
                  允许写模式（面板可临时开写；AI 通道仍永远只读）
                </label>
              )}
            </div>
            <div style={{ marginTop: 9 }}>
              <div className="dbw-lbl">备注</div>
              <input className="dbw-inp" value={editing.note} placeholder="如：测试环境只读账号" onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
            <div className="dbw-row" style={{ marginTop: 13, justifyContent: 'flex-end' }}>
              <button className="dbw-btn ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="dbw-btn" disabled={busy === 'save'} onClick={() => void submit()}>{busy === 'save' ? '保存中…' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
