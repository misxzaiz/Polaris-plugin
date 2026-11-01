/**
 * 任务 Tab：任务列表 + 新建/编辑表单
 *
 * 写路径全部走命令键（commands.*），面板不直接写 taskrun.jobs（服务单写者）。
 * command 类型创建强制勾选确认（与 MCP confirm 闸双保险）。
 */
import { useMemo, useState } from 'react'
import { commands, type Job, type JobType, type Schedule } from './model'
import { fmtTime, fmtCountdown, describeScheduleClient, type PanelData, type Notifier } from './ui'

interface FormState {
  editingId: string | null
  name: string
  type: JobType
  // schedule
  schedType: Schedule['type']
  everyMinutes: string
  time: string
  dows: number[]
  cronExpr: string
  // payload
  message: string
  url: string
  method: string
  headersText: string
  body: string
  allowPrivate: boolean
  providerId: string
  prompt: string
  system: string
  maxTokens: string
  shell: 'powershell' | 'cmd'
  command: string
  commandConfirm: boolean
}

const EMPTY_FORM: FormState = {
  editingId: null,
  name: '',
  type: 'notify',
  schedType: 'daily',
  everyMinutes: '30',
  time: '08:00',
  dows: [1],
  cronExpr: '0 8 * * *',
  message: '',
  url: 'https://',
  method: 'GET',
  headersText: '',
  body: '',
  allowPrivate: false,
  providerId: '',
  prompt: '',
  system: '',
  maxTokens: '1024',
  shell: 'powershell',
  command: '',
  commandConfirm: false,
}

const TYPE_LABEL: Record<JobType, string> = {
  notify: '提醒', http: 'HTTP 探测', ai: 'AI 提示词', command: '命令行',
}

function parseHeadersText(text: string): Record<string, string> | { error: string } {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const i = t.indexOf(':')
    if (i === -1) return { error: `请求头行缺少冒号：${t}` }
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function buildSchedule(f: FormState): Schedule | { error: string } {
  if (f.schedType === 'interval') {
    const n = parseInt(f.everyMinutes, 10)
    if (!Number.isFinite(n) || n < 1) return { error: '间隔分钟须 ≥ 1' }
    return { type: 'interval', everyMinutes: n }
  }
  if (f.schedType === 'daily') return { type: 'daily', time: f.time }
  if (f.schedType === 'weekly') {
    if (!f.dows.length) return { error: '至少选一个周几' }
    return { type: 'weekly', time: f.time, dows: [...f.dows].sort((a, b) => a - b) }
  }
  return { type: 'cron', expr: f.cronExpr.trim() }
}

function buildPayload(f: FormState, hasProvider: (id: string) => boolean): Record<string, unknown> | { error: string } {
  if (f.type === 'notify') {
    if (!f.message.trim()) return { error: '提醒内容不能为空' }
    return { message: f.message.trim() }
  }
  if (f.type === 'http') {
    const headers = f.headersText.trim() ? parseHeadersText(f.headersText) : {}
    if ('error' in headers) return headers
    return {
      url: f.url.trim(), method: f.method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: ['POST', 'PUT', 'PATCH'].includes(f.method) ? f.body : '',
      allowPrivate: f.allowPrivate,
    }
  }
  if (f.type === 'ai') {
    if (!f.providerId) return { error: '请选择 AI 供应商（设置页可导入/新增）' }
    if (!hasProvider(f.providerId)) return { error: '所选 AI 供应商不存在，请重新选择' }
    if (!f.prompt.trim()) return { error: '提示词不能为空' }
    return {
      providerId: f.providerId,
      prompt: f.prompt.trim(),
      system: f.system.trim(),
      maxTokens: parseInt(f.maxTokens, 10) || 1024,
    }
  }
  if (!f.command.trim()) return { error: '命令不能为空' }
  if (!f.commandConfirm) return { error: '命令行任务须勾选「我确认」' }
  return { shell: f.shell, command: f.command.trim() }
}

function formFromJob(j: Job): FormState {
  const s = j.schedule
  const p = (j.payload || {}) as Record<string, unknown>
  const headers = p.headers && typeof p.headers === 'object' ? p.headers as Record<string, string> : {}
  return {
    editingId: j.id,
    name: j.name,
    type: j.type,
    schedType: s.type,
    everyMinutes: String(Math.max(1, Math.round((s.everyMs || 1800000) / 60000))),
    time: s.time || '08:00',
    dows: s.dows || [1],
    cronExpr: s.expr || '0 8 * * *',
    message: String(p.message || ''),
    url: String(p.url || 'https://'),
    method: String(p.method || 'GET'),
    headersText: Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n'),
    body: String(p.body || ''),
    allowPrivate: p.allowPrivate === true,
    providerId: String(p.providerId || ''),
    prompt: String(p.prompt || ''),
    system: String(p.system || ''),
    maxTokens: String(p.maxTokens || 1024),
    shell: p.shell === 'cmd' ? 'cmd' : 'powershell',
    command: String(p.command || ''),
    commandConfirm: false,
  }
}

export default function JobsTab({ data, notify, refresh, initialForm = null }: {
  data: PanelData
  notify: Notifier
  refresh: () => Promise<void>
  /** 测试注入口：SSR 断言表单护栏文案用（正常使用恒为 null） */
  initialForm?: FormState | null
}) {
  const [form, setForm] = useState<FormState | null>(initialForm)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const providerName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of data.providers) m.set(p.id, p.name)
    return m
  }, [data.providers])

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))

  const submit = async () => {
    if (!form || busy) return
    const sched = buildSchedule(form)
    if ('error' in sched) { notify(sched.error, true); return }
    const payload = buildPayload(form, (id) => providerName.has(id))
    if ('error' in payload) { notify((payload as { error: string }).error, true); return }
    setBusy(true)
    try {
      const jobBody = { name: form.name.trim(), type: form.type, schedule: sched, payload }
      if (!jobBody.name) { notify('任务名不能为空', true); return }
      const r = form.editingId
        ? await commands.updateJob(form.editingId, jobBody)
        : await commands.addJob(jobBody)
      if (!r.ok) { notify(r.error || '保存失败（服务可能未运行）', true); return }
      notify(form.editingId ? '任务已更新' : '任务已创建')
      setForm(null)
      await refresh()
    } catch (e) {
      notify((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (j: Job) => {
    try {
      const r = await commands.setEnabled(j.id, !j.enabled)
      if (!r.ok) { notify(r.error || '操作失败', true); return }
      await refresh()
    } catch (e) { notify((e as Error).message, true) }
  }

  const runNow = async (j: Job) => {
    notify(`已提交执行：${j.name}（结果稍后进历史）`)
    try {
      const r = await commands.runNow(j.id)
      if (!r.ok) { notify(r.error || '执行失败', true); return }
      if (r.status) notify(`执行完成（${r.status}）：${(r.summary || '').slice(0, 80)}`)
    } catch (e) { notify((e as Error).message, true) }
  }

  const remove = async (j: Job) => {
    if (confirmRemove !== j.id) { setConfirmRemove(j.id); return }
    setConfirmRemove(null)
    try {
      const r = await commands.removeJob(j.id)
      if (!r.ok) { notify(r.error || '删除失败', true); return }
      notify(`已删除：${j.name}`)
      await refresh()
    } catch (e) { notify((e as Error).message, true) }
  }

  const editingCommand = form?.type === 'command'

  return (
    <div>
      {!form ? (
        <div style={{ margin: '0 16px 10px' }}>
          <button className="tr-btn" onClick={() => setForm({ ...EMPTY_FORM })}>＋ 新建任务</button>
        </div>
      ) : null}

      {form ? (
        <div className="tr-card">
          <div className="tr-card-b">
            <b style={{ fontSize: 13 }}>{form.editingId ? '编辑任务' : '新建任务'}</b>
            <label className="tr-lbl">任务名</label>
            <input className="tr-inp" value={form.name} maxLength={80} placeholder="如：早报摘要 / 接口心跳" onChange={(e) => set({ name: e.target.value })} />
            <label className="tr-lbl">任务类型</label>
            <div className="tr-row">
              {(Object.keys(TYPE_LABEL) as JobType[]).map((t) => (
                <button
                  key={t}
                  className={`tr-btn sm ${form.type === t ? 'ok' : 'ghost'}`}
                  onClick={() => set({ type: t, commandConfirm: false })}
                >{TYPE_LABEL[t]}</button>
              ))}
            </div>

            <label className="tr-lbl">调度</label>
            <div className="tr-row">
              <select className="tr-sel" value={form.schedType} onChange={(e) => set({ schedType: e.target.value as Schedule['type'] })}>
                <option value="interval">每 N 分钟</option>
                <option value="daily">每天</option>
                <option value="weekly">每周几</option>
                <option value="cron">cron 表达式</option>
              </select>
              {form.schedType === 'interval' ? (
                <span className="tr-row">
                  <input className="tr-inp" style={{ width: 70 }} value={form.everyMinutes} onChange={(e) => set({ everyMinutes: e.target.value })} />
                  <span className="tr-sub">分钟（≥1）</span>
                </span>
              ) : null}
              {(form.schedType === 'daily' || form.schedType === 'weekly') ? (
                <input className="tr-inp" style={{ width: 90 }} value={form.time} placeholder="08:00" onChange={(e) => set({ time: e.target.value })} />
              ) : null}
              {form.schedType === 'weekly' ? (
                <span className="tr-row">
                  {['日', '一', '二', '三', '四', '五', '六'].map((n, i) => (
                    <button
                      key={i}
                      className={`tr-btn sm ${form.dows.includes(i) ? 'ok' : 'ghost'}`}
                      onClick={() => set({
                        dows: form.dows.includes(i) ? form.dows.filter((d) => d !== i) : [...form.dows, i],
                      })}
                    >{n}</button>
                  ))}
                </span>
              ) : null}
              {form.schedType === 'cron' ? (
                <input className="tr-inp" style={{ width: 170 }} value={form.cronExpr} placeholder="分 时 日 月 周" onChange={(e) => set({ cronExpr: e.target.value })} />
              ) : null}
            </div>
            <div className="tr-sub" style={{ marginTop: 4 }}>
              {form.schedType === 'cron' ? '五字段：分 时 日 月 周（支持 * , - / 数字，0=周日）' : '分钟粒度触发；宿主关闭期间错过只在下次启动补跑一次'}
            </div>

            {form.type === 'notify' ? (
              <>
                <label className="tr-lbl">提醒内容</label>
                <textarea className="tr-inp" rows={3} value={form.message} maxLength={2000} placeholder="到点记录这条提醒（手机打开同一面板可见）" onChange={(e) => set({ message: e.target.value })} />
              </>
            ) : null}

            {form.type === 'http' ? (
              <>
                <label className="tr-lbl">URL</label>
                <input className="tr-inp" value={form.url} placeholder="https://api.example.com/health" onChange={(e) => set({ url: e.target.value })} />
                <div className="tr-row" style={{ marginTop: 6 }}>
                  <select className="tr-sel" value={form.method} onChange={(e) => set({ method: e.target.value })}>
                    {['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <label className="tr-row" style={{ gap: 4 }}>
                    <input type="checkbox" className="tr-check" checked={form.allowPrivate} onChange={(e) => set({ allowPrivate: e.target.checked })} />
                    <span className="tr-sub">允许私网/本机地址</span>
                  </label>
                </div>
                <label className="tr-lbl">请求头（每行一个，Key: Value）</label>
                <textarea className="tr-inp" rows={2} value={form.headersText} placeholder="Authorization: Bearer xxx" onChange={(e) => set({ headersText: e.target.value })} />
                {['POST', 'PUT', 'PATCH'].includes(form.method) ? (
                  <>
                    <label className="tr-lbl">请求体（≤64KB）</label>
                    <textarea className="tr-inp" rows={3} value={form.body} onChange={(e) => set({ body: e.target.value })} />
                  </>
                ) : null}
              </>
            ) : null}

            {form.type === 'ai' ? (
              <>
                <label className="tr-lbl">AI 供应商（设置页导入/新增）</label>
                <select className="tr-sel" value={form.providerId} onChange={(e) => set({ providerId: e.target.value })}>
                  <option value="">— 选择 —</option>
                  {data.providers.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.model || '未设模型'}）</option>)}
                </select>
                <label className="tr-lbl">系统提示（可选）</label>
                <textarea className="tr-inp" rows={2} value={form.system} maxLength={4000} onChange={(e) => set({ system: e.target.value })} />
                <label className="tr-lbl">提示词</label>
                <textarea className="tr-inp" rows={4} value={form.prompt} maxLength={8000} placeholder="到点发给模型的内容（定时任务没有对话上下文，提示词要自包含）" onChange={(e) => set({ prompt: e.target.value })} />
                <label className="tr-lbl">max_tokens</label>
                <input className="tr-inp" style={{ width: 110 }} value={form.maxTokens} onChange={(e) => set({ maxTokens: e.target.value })} />
              </>
            ) : null}

            {form.type === 'command' ? (
              <>
                <label className="tr-lbl">Shell</label>
                <select className="tr-sel" value={form.shell} onChange={(e) => set({ shell: e.target.value as 'powershell' | 'cmd' })}>
                  <option value="powershell">PowerShell</option>
                  <option value="cmd">cmd</option>
                </select>
                <label className="tr-lbl">命令</label>
                <textarea className="tr-inp" rows={3} value={form.command} placeholder="到点真实执行的命令（超时/输出有护栏）" onChange={(e) => set({ command: e.target.value })} />
                <label className="tr-row" style={{ gap: 6, marginTop: 8 }}>
                  <input type="checkbox" className="tr-check" checked={form.commandConfirm} onChange={(e) => set({ commandConfirm: e.target.checked })} />
                  <span className="tr-sub" style={{ color: '#D29922' }}>
                    我确认：该命令可无人值守自动执行（本机副作用自负）
                  </span>
                </label>
              </>
            ) : null}

            <div className="tr-row" style={{ marginTop: 12 }}>
              <button className="tr-btn" disabled={busy} onClick={submit}>{busy ? '保存中…' : '保存'}</button>
              <button className="tr-btn ghost" disabled={busy} onClick={() => setForm(null)}>取消</button>
            </div>
          </div>
        </div>
      ) : null}

      {data.jobs.length === 0 && !form ? (
        <div className="tr-empty">
          还没有定时任务。<br />
          点「新建任务」建一个，或在对话里对 AI 说：<span className="tr-kbd">每天早上八点提醒我站会</span>
        </div>
      ) : null}

      {data.jobs.map((j) => (
        <div className="tr-card" key={j.id}>
          <div className="tr-card-b">
            <div className="tr-row" style={{ justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>
                  {j.name}
                  {' '}
                  <span className="tr-tag">{TYPE_LABEL[j.type] || j.type}</span>
                  {!j.enabled ? <span className="tr-tag warn">已停用</span> : null}
                </b>
                <div className="tr-sub" style={{ marginTop: 3 }}>
                  {describeScheduleClient(j.schedule)}
                  {j.enabled ? ` · 下次 ${fmtTime(j.nextRunAt)}（${fmtCountdown(j.nextRunAt)}）` : ' · 不触发'}
                </div>
                {j.type === 'ai' && providerName.get(String((j.payload as Record<string, unknown>).providerId)) ? (
                  <div className="tr-sub">供应商：{providerName.get(String((j.payload as Record<string, unknown>).providerId))}</div>
                ) : null}
                {j.type === 'command' ? (
                  <div className="tr-sub" style={{ fontFamily: 'Consolas,monospace' }}>
                    {String((j.payload as Record<string, unknown>).command || '').slice(0, 90)}
                  </div>
                ) : null}
                {j.lastStatus ? (
                  <div className="tr-row" style={{ marginTop: 5, gap: 5 }}>
                    <span className={`tr-tag ${j.lastStatus === 'ok' ? 'ok' : j.lastStatus === 'timeout' ? 'timeout' : 'fail'}`}>{j.lastStatus}</span>
                    <span className="tr-sub">{fmtTime(j.lastRunAt)} · {j.lastSummary}</span>
                  </div>
                ) : null}
              </div>
              <div className="tr-row" style={{ gap: 6 }}>
                <button className="tr-btn sm ok" onClick={() => runNow(j)}>执行</button>
                <button className="tr-btn sm ghost" onClick={() => toggle(j)}>{j.enabled ? '停用' : '启用'}</button>
                <button className="tr-btn sm ghost" onClick={() => setForm(formFromJob(j))}>编辑</button>
                <button className="tr-btn sm danger" onClick={() => remove(j)}>{confirmRemove === j.id ? '确认删除?' : '删除'}</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
