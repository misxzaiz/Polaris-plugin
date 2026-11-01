/**
 * SettingsTab —— 全局设置（cpk.settings，面板写/服务读）+ 服务管理
 */
import { useEffect, useState } from 'react'
import {
  saveSettings, listServiceStatus, startServiceBootstrapped, stopService, restartService,
  type CpkMeta, type ServiceStatus, type Settings,
} from '../model'

type Toast = (msg: string, kind?: 'good' | 'bad' | 'info') => void

export default function SettingsTab({ meta, settings, running, showToast }: {
  meta: CpkMeta | null
  settings: Settings | null
  running: boolean
  showToast: Toast
}) {
  const [form, setForm] = useState<Settings>({
    version: 1,
    ignoreExtra: '',
    includeLockfiles: false,
    maxFileKb: 512,
    format: 'xml',
    headerText: '',
  })
  const [svc, setSvc] = useState<ServiceStatus | null>(null)
  const [svcBusy, setSvcBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (settings) setForm({ ...form, ...settings })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])
  useEffect(() => {
    void listServiceStatus().then(setSvc)
  }, [running])

  const save = async () => {
    try {
      await saveSettings(form)
      setDirty(false)
      showToast('设置已保存（服务 3s 内热更）', 'good')
    } catch (e) {
      showToast(`保存失败：${(e as Error).message}`, 'bad')
    }
  }
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const svcAction = async (kind: 'start' | 'stop' | 'restart') => {
    setSvcBusy(true)
    try {
      if (kind === 'start') {
        const err = await startServiceBootstrapped()
        if (err) showToast(err, 'bad')
        else showToast('服务启动中…', 'good')
      } else if (kind === 'stop') {
        await stopService()
        showToast('已停止', 'good')
      } else {
        await restartService()
        showToast('重启中…', 'good')
      }
    } catch (e) {
      showToast(`${kind} 失败：${(e as Error).message}`, 'bad')
    } finally {
      setTimeout(async () => { setSvc(await listServiceStatus()); setSvcBusy(false) }, 1500)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 服务状态 */}
      <section style={cardStyle}>
        <div style={sectionTitle}>后台服务</div>
        <div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 8,
            background: running ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
            color: running ? '#3fb950' : '#f85149',
          }}>{running ? '运行中' : '离线'}</span>
          {svc?.status && <span>状态: {svc.status}</span>}
          {meta?.dataDir && <span style={{ wordBreak: 'break-all' }}>产物目录: {meta.dataDir}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => void svcAction('start')} disabled={svcBusy || running} style={{ ...btn, opacity: svcBusy || running ? 0.4 : 1 }}>启动</button>
          <button onClick={() => void svcAction('restart')} disabled={svcBusy} style={btn}>重启</button>
          <button onClick={() => void svcAction('stop')} disabled={svcBusy || !running} style={{ ...btn, opacity: svcBusy || !running ? 0.4 : 1 }}>停止</button>
        </div>
      </section>

      {/* 打包设置 */}
      <section style={cardStyle}>
        <div style={sectionTitle}>打包设置</div>
        <label style={rowStyle}>
          <span style={labelStyle}>包格式</span>
          <select
            value={form.format}
            onChange={(e) => set('format', e.target.value === 'md' ? 'md' : 'xml')}
            style={inputStyle}
          >
            <option value="xml">XML（&lt;file path&gt; 包裹，推荐）</option>
            <option value="md">Markdown（代码围栏）</option>
          </select>
        </label>
        <label style={rowStyle}>
          <span style={labelStyle}>单文件上限 (KB)</span>
          <input
            type="number"
            value={form.maxFileKb}
            min={16}
            max={4096}
            onChange={(e) => set('maxFileKb', Math.max(16, Math.min(4096, parseInt(e.target.value, 10) || 512)))}
            style={{ ...inputStyle, width: 100 }}
          />
        </label>
        <label style={{ ...rowStyle, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.includeLockfiles} onChange={(e) => set('includeLockfiles', e.target.checked)} />
          <span style={labelStyle}>包含锁文件（package-lock.json / Cargo.lock 等，默认排除）</span>
        </label>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, alignSelf: 'flex-start' }}>追加忽略规则</span>
          <textarea
            value={form.ignoreExtra}
            onChange={(e) => set('ignoreExtra', e.target.value)}
            placeholder={'每行一条，.gitignore 语法；如：\n*.snap\nfixtures/\npackages/foo/dist'}
            rows={4}
            style={{ ...inputStyle, flex: 1, resize: 'vertical' }}
          />
        </div>
        <div style={rowStyle}>
          <span style={{ ...labelStyle, alignSelf: 'flex-start' }}>包头说明</span>
          <textarea
            value={form.headerText}
            onChange={(e) => set('headerText', e.target.value)}
            placeholder="自定义包头文字（如任务背景），替换默认说明；留空用默认"
            rows={2}
            style={{ ...inputStyle, flex: 1, resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => void save()}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: dirty ? '#3b82f6' : '#27272a', color: dirty ? '#fff' : '#a1a1aa',
              fontSize: 12, cursor: 'pointer',
            }}
          >保存设置{dirty ? ' *' : ''}</button>
          <span style={{ fontSize: 10, color: '#52525b' }}>内置恒忽略：.git、node_modules；其余默认忽略 dist/build/target 等</span>
        </div>
      </section>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  padding: 12, borderRadius: 8, border: '1px solid #27272a', background: '#131316',
  display: 'flex', flexDirection: 'column', gap: 8,
}
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#e4e4e7' }
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: '#a1a1aa' }
const labelStyle: React.CSSProperties = { width: 130, flexShrink: 0 }
const inputStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid #3f3f46',
  background: '#09090b', color: '#e4e4e7', fontSize: 11, minWidth: 0,
}
const btn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, border: '1px solid #3f3f46',
  background: '#27272a', color: '#d4d4d8', fontSize: 11, cursor: 'pointer',
}
