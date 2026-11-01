/**
 * 设置页：数值参数（经命令信箱由服务规范化落 kv）+ 安全说明
 */
import { useState } from 'react'
import { callService, type FlowSettings, type PanelData, type Toast } from './model'

interface Props {
  data: PanelData
  refresh: () => Promise<void>
  showToast: (t: Toast) => void
}

const FIELDS: { key: keyof FlowSettings; label: string; hint: string; min: number; max: number }[] = [
  { key: 'guardMinutes', label: '新文件护栏（分钟）', hint: '加入时间不足该值的文件绝不整理——防止正在写入/刚打开的文件被搬走。', min: 1, max: 120 },
  { key: 'maxOpsPerRun', label: '单次动作上限', hint: '一份计划最多执行多少个文件动作，超出部分留到下一轮。', min: 10, max: 2000 },
  { key: 'dedupeMaxFiles', label: '去重候选上限', hint: '每轮最多对多少个文件算内容指纹（防大目录拖慢）。', min: 10, max: 2000 },
  { key: 'dedupeMaxSizeMB', label: '去重单文件上限（MB）', hint: '超过该大小的文件不参与去重。', min: 1, max: 4096 },
  { key: 'sweepMinutes', label: '兜底扫描间隔（分钟）', hint: '文件监听之外的安全网：每该间隔强制扫描一次自动模式根目录。', min: 5, max: 240 },
]

export default function SettingsTab({ data, refresh, showToast }: Props) {
  const [busy, setBusy] = useState('')
  const s = data.snapshot?.settings
  const meta = data.meta

  async function patch(p: Partial<FlowSettings>) {
    setBusy('save')
    try {
      await callService('settings_set', { patch: p })
      await refresh()
    } catch (e) {
      showToast({ msg: String((e as Error).message || e), bad: true })
    } finally {
      setBusy('')
    }
  }

  function numField(key: 'guardMinutes' | 'maxOpsPerRun' | 'dedupeMaxFiles' | 'dedupeMaxSizeMB' | 'sweepMinutes') {
    const f = FIELDS.find((x) => x.key === key)!
    const v = s ? (s[key as 'guardMinutes'] as number) : undefined
    return (
      <div className="ff-field" key={key}>
        <div className="ff-field-l">
          <b>{f.label}</b>
          <small>{f.hint}</small>
        </div>
        <input
          className="ff-inp"
          style={{ width: 88 }}
          type="number"
          min={f.min}
          max={f.max}
          defaultValue={v ?? ''}
          key={`${key}-${v}`}
          disabled={busy === 'save'}
          onBlur={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n) && n >= f.min && n <= f.max && n !== v) patch({ [key]: Math.floor(n) })
          }}
        />
      </div>
    )
  }

  return (
    <>
      <div className="ff-card">
        <div className="ff-card-b ff-row">
          <span className="ff-sub ff-grow">后台文件监听（自动模式的触发器；关掉后仍有兜底周期扫描）</span>
          <button
            className={`ff-toggle ${s?.watchEnabled !== false ? 'on' : ''}`}
            disabled={busy === 'save'}
            onClick={() => patch({ watchEnabled: s?.watchEnabled === false })}
          ><i /></button>
        </div>
        {FIELDS.map((f) => numField(f.key as 'guardMinutes'))}
      </div>

      <div className="ff-card">
        <div className="ff-card-b ff-sub">
          <b style={{ color: '#E6EAF2' }}>安全模型（服务层强制，面板只是入口）</b><br />
          · 永不删除：回收/去重都是移入 <code>{'_FileFlow回收站'}</code> 子文件夹，随时可撤销。<br />
          · 先预览后动手：手动整理必须先出计划；自动模式默认只处理新到文件。<br />
          · 目的子树排除：归档目标文件夹里的内容不会再被其他规则搬走（防递归搬家）。<br />
          · 占用/正在写入的文件自动跳过并记录（EBUSY/新文件护栏），下轮再试。<br />
          · 跨盘移动用「复制→校验大小→删源」，校验不过不动源文件。<br />
          · 全部数据留在本机（cap.kv + 本地 fs），零外网请求。
        </div>
      </div>

      <div className="ff-card">
        <div className="ff-card-b ff-sub">
          服务 v{meta?.version || '?'}｜PID {meta?.pid ?? '—'}｜心跳 {meta?.lastTickAt ? new Date(meta.lastTickAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}｜监听中 {(meta?.watched || []).length} 个根
          {meta?.bridge !== 'ok' && <span style={{ color: '#F85149' }}>（桥不可达：检查 Polaris 主应用是否在运行）</span>}
        </div>
      </div>
    </>
  )
}
