/**
 * 设置 Tab：成员档案 CRUD + 提醒/预警参数 + 服务管理（三步自举）+ 数据导出 + 免责声明。
 */
import { useState } from 'react'
import {
  saveProfile, saveSettings, deleteEntity, exportAll, serviceStatus, serviceStart, serviceStop, serviceRestart,
  LOG_WINDOW_DAYS_CONST, type QingData, type Profile, type Settings,
} from './model'
import type { TabProps } from './PanelTypes'

const SERVICE_ID = 'qingnang-service'

export default function SettingsTab({ data, reload, showToast, pluginId, onSendToChat }: TabProps) {
  const [pf, setPf] = useState({ name: '', kind: 'human', note: '' })
  const [editPf, setEditPf] = useState<Profile | null>(null)
  const [confirmDel, setConfirmDel] = useState('')
  const [busy, setBusy] = useState(false)
  const [svc, setSvc] = useState<{ running: boolean; lastError?: string } | null>(null)
  void pluginId

  async function checkService(): Promise<{ running: boolean; lastError?: string } | null> {
    try {
      const st = await serviceStatus('qingnang', SERVICE_ID)
      setSvc(st)
      return st
    } catch (e) {
      setSvc({ running: false, lastError: (e as Error).message })
      return null
    }
  }

  async function submitProfile() {
    setBusy(true)
    try {
      const saved = await saveProfile({ name: pf.name, kind: pf.kind, note: pf.note }, editPf)
      showToast(editPf ? '成员已更新' : `已建档「${saved.name}」`)
      setPf({ name: '', kind: 'human', note: '' })
      setEditPf(null)
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function removeProfile(p: Profile) {
    if (confirmDel !== p.id) { setConfirmDel(p.id); setTimeout(() => setConfirmDel((c) => (c === p.id ? '' : c)), 4000); return }
    setBusy(true)
    try {
      await deleteEntity('profile', p.id, true, data!)
      showToast(`已删除「${p.name}」及其方案与打卡记录`)
      setConfirmDel('')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  async function saveS(patch: Partial<Settings>) {
    if (!data) return
    try {
      await saveSettings({ ...data.settings, ...patch })
      showToast('设置已保存')
      await reload()
    } catch (e) {
      showToast((e as Error).message, true)
    }
  }

  function doExport() {
    if (!data) return
    const blob = new Blob([exportAll(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `qingnang-export-${core_dayKey()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  if (!data) return <div className="qn-empty">载入中…</div>
  const s = data.settings

  return (
    <div>
      {/* 成员档案 */}
      <div className="qn-sec"><span className="qn-bar" />家庭成员（{data.profiles.length}）</div>
      {data.profiles.map((p) => (
        <div key={p.id} className="qn-card">
          <div className="qn-row" style={{ padding: '9px 13px' }}>
            <span className="qn-grow">
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}{p.kind === 'pet' ? ' 🐾' : ''}</span>
              {p.note && <div className="qn-sub">{p.note}</div>}
            </span>
            <button className="qn-btn ghost sm" onClick={() => { setEditPf(p); setPf({ name: p.name, kind: p.kind, note: p.note }) }}>编辑</button>
            <button className="qn-btn danger sm" disabled={busy} onClick={() => removeProfile(p)}>
              {confirmDel === p.id ? '再点确认' : '删除'}
            </button>
          </div>
        </div>
      ))}
      <div className="qn-card"><div className="qn-card-b">
        <label className="qn-lbl">{editPf ? `编辑「${editPf.name}」` : '新成员'}：名称 *</label>
        <input className="qn-inp" value={pf.name} placeholder="如 我 / 妈妈 / 旺财" onChange={(e) => setPf({ ...pf, name: e.target.value })} />
        <div className="qn-row" style={{ marginTop: 6 }}>
          <div style={{ width: 120 }}>
            <label className="qn-lbl">类型</label>
            <select className="qn-sel" value={pf.kind} onChange={(e) => setPf({ ...pf, kind: e.target.value })}>
              <option value="human">人</option>
              <option value="pet">宠物</option>
            </select>
          </div>
          <div className="qn-grow">
            <label className="qn-lbl">备注（如「高血压，遵医嘱」）</label>
            <input className="qn-inp" value={pf.note} onChange={(e) => setPf({ ...pf, note: e.target.value })} />
          </div>
        </div>
        <div className="qn-row" style={{ marginTop: 10, gap: 8 }}>
          <button className="qn-btn" disabled={busy || !pf.name.trim()} onClick={submitProfile}>{editPf ? '保存' : '建档'}</button>
          {editPf && <button className="qn-btn ghost" onClick={() => { setEditPf(null); setPf({ name: '', kind: 'human', note: '' }) }}>取消编辑</button>}
        </div>
      </div></div>

      {/* 提醒与预警 */}
      <div className="qn-sec"><span className="qn-bar" />提醒与预警</div>
      <div className="qn-card"><div className="qn-card-b">
        <div className="qn-row">
          <div className="qn-grow">
            <label className="qn-lbl">到点宽限（分钟）：宽限内算「现在该吃」，过了算「过点未服」</label>
            <input className="qn-inp" defaultValue={String(s.graceMin)} inputMode="numeric" onBlur={(e) => { const v = Number(e.target.value); if (v !== s.graceMin) saveS({ graceMin: v }) }} />
          </div>
          <div className="qn-grow">
            <label className="qn-lbl">补货预警（剩余可用天数 ≤ 此值时亮红）</label>
            <input className="qn-inp" defaultValue={String(s.lowDays)} inputMode="numeric" onBlur={(e) => { const v = Number(e.target.value); if (v !== s.lowDays) saveS({ lowDays: v }) }} />
          </div>
        </div>
        <label className="qn-lbl">效期预警（提前天数，进入黄榜）</label>
        <input className="qn-inp" style={{ width: 140 }} defaultValue={String(s.expiryWarnDays)} inputMode="numeric" onBlur={(e) => { const v = Number(e.target.value); if (v !== s.expiryWarnDays) saveS({ expiryWarnDays: v }) }} />
        <div className="qn-row" style={{ marginTop: 10 }}>
          <label className="qn-sub" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={s.soundOn !== false} onChange={(e) => saveS({ soundOn: e.target.checked })} /> 到点播放提示音（面板内）
          </label>
        </div>
      </div></div>

      {/* 服务 */}
      <div className="qn-sec">
        <span className="qn-bar" />
        后台服务
        <button className="qn-hint qn-btn ghost sm" onClick={() => checkService()}>查状态</button>
      </div>
      <div className="qn-card"><div className="qn-card-b">
        <div className="qn-sub">
          心跳：{data.meta && data.meta.lastTickAt && Date.now() - data.meta.lastTickAt < 180000
            ? `在线（pid ${data.meta.pid}，桥 ${data.meta.bridge}，投影 ${data.meta.counts ? `${data.meta.counts.regimens} 方案 / ${data.meta.counts.logs} 条记录` : ''}）`
            : '未收到心跳——服务未启动或已停止'}
        </div>
        {svc && !svc.running && <div className="qn-sub" style={{ color: '#E3B341' }}>宿主侧状态：未运行{svc.lastError ? ` · ${svc.lastError}` : ''}</div>}
        <div className="qn-row" style={{ marginTop: 8, gap: 6 }}>
          <button className="qn-btn sm" disabled={busy} onClick={async () => {
            setBusy(true)
            try { await serviceStart('qingnang', SERVICE_ID); showToast('启动命令已发出'); await checkService() } catch (e) { showToast((e as Error).message, true) } finally { setBusy(false) }
          }}>启动</button>
          <button className="qn-btn ghost sm" disabled={busy} onClick={async () => {
            setBusy(true)
            try { await serviceRestart('qingnang', SERVICE_ID); showToast('重启命令已发出'); await checkService() } catch (e) { showToast((e as Error).message, true) } finally { setBusy(false) }
          }}>重启</button>
          <button className="qn-btn ghost sm" disabled={busy} onClick={async () => {
            setBusy(true)
            try { await serviceStop('qingnang', SERVICE_ID); showToast('已停止'); await checkService() } catch (e) { showToast((e as Error).message, true) } finally { setBusy(false) }
          }}>停止</button>
        </div>
      </div></div>

      {/* 数据 */}
      <div className="qn-sec"><span className="qn-bar" />数据</div>
      <div className="qn-card"><div className="qn-card-b">
        <button className="qn-btn ghost sm" onClick={doExport}>导出 JSON（近 {LOG_WINDOW_DAYS_CONST} 天打卡 + 全部档案/方案/批次）</button>
        <div className="qn-sub" style={{ marginTop: 6 }}>
          全部数据存在本机 Polaris 数据根（cap.kv `qingnang.*` 键），不上传任何服务器；
          手机/Web 打开同一面板看到同一份（走自家后端）。
        </div>
      </div></div>

      {/* AI 引导 */}
      {onSendToChat && (
        <div className="qn-card"><div className="qn-card-b">
          <div className="qn-sub" style={{ marginBottom: 8 }}>跟 AI 管家说一句话就能建档排方案：</div>
          <div className="qn-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <button className="qn-btn ghost sm" onClick={() => onSendToChat('我妈每天早晚各吃一片氨氯地平，家里还剩一盒24片，效期2027年6月，帮我记到青囊')}>示例：给妈妈排降压药</button>
            <button className="qn-btn ghost sm" onClick={() => onSendToChat('看看青囊里哪些药快过期了、哪些该买了')}>示例：查效期和补货</button>
          </div>
        </div></div>
      )}

      <div className="qn-foot" style={{ fontSize: 11, color: '#8B95A7' }}>
        青囊只做家庭药事记录与提醒，<b>不提供医疗建议</b>；药物相互作用、剂量调整、停药决定请咨询医生或药师。
      </div>
    </div>
  )
}

function core_dayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
