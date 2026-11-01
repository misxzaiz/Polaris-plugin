/**
 * RunTab —— 矩阵运行配置与发起：变体编辑器（模型/模板/参数）+ 数据集选择
 * + 可选 LLM 评判 + 格子数预估与花费确认。
 *
 * 本地预览用 shared/matrix-core（与服务的同一实现打包进面板）：
 * 样本数、变量插值警告、检查器覆盖都在发起前可见——诚实优先。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/matrix-core'
import {
  sendCommand, loadMeta, type MaskedProfile, type DatasetHead, type PmSettings, type RunProgress,
} from './model'
import type { PanelProps, TabKey } from './Panel'

interface VariantDraft {
  name: string
  profileId: string
  systemTemplate: string
  userTemplate: string
  maxTokens: string
  temperature: string
}

const SAMPLE_USER = '把下面这句话翻译成英文，只输出译文：\n{{text}}'

function newVariant(profiles: MaskedProfile[]): VariantDraft {
  return {
    name: '',
    profileId: profiles.length ? profiles[0].id : '',
    systemTemplate: '',
    userTemplate: SAMPLE_USER,
    maxTokens: '1024',
    temperature: '',
  }
}

export default function RunTab({ profiles, datasets, settings, running, onDone, goTab }: PanelProps & {
  profiles: MaskedProfile[]
  datasets: DatasetHead[]
  settings: PmSettings | null
  running: RunProgress | null
  onDone: () => void
  goTab: (t: TabKey) => void
  onSendToChat?: (message: string) => void | Promise<void>
}) {
  const [variants, setVariants] = useState<VariantDraft[]>(() => [newVariant(profiles)])
  const [datasetId, setDatasetId] = useState('')
  const [inlineJsonl, setInlineJsonl] = useState('')
  const [useInline, setUseInline] = useState(false)
  const [concurrency, setConcurrency] = useState(String(settings?.concurrency ?? 3))
  const [retries, setRetries] = useState(String(settings?.retries ?? 1))
  const [useJudge, setUseJudge] = useState(false)
  const [judgeProfileId, setJudgeProfileId] = useState(settings?.judgeProfileId || '')
  const [judgeTemplate, setJudgeTemplate] = useState('')
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const jsonlText = useInline ? inlineJsonl : ''

  const parsed = useMemo(() => {
    if (useInline) {
      if (!inlineJsonl.trim()) return null
      return core.parseDataset(inlineJsonl)
    }
    return null
  }, [useInline, inlineJsonl])

  const sampleCount = useInline ? (parsed ? parsed.samples.length : 0) : (datasets.find((d) => d.id === datasetId)?.count ?? 0)
  const cellCount = sampleCount * variants.length
  const judgeCells = useJudge && judgeProfileId ? sampleCount * variants.length : 0

  // 模板变量警告预览（取第一条有效样本试插值）
  const tplWarn = useMemo(() => {
    const sampleVars = parsed && parsed.samples.length ? parsed.samples[0].vars : null
    if (!sampleVars) return [] as string[]
    const out: string[] = []
    for (const [i, v] of variants.entries()) {
      for (const [field, tpl] of [['system', v.systemTemplate], ['user', v.userTemplate]] as const) {
        if (!tpl) continue
        const r = core.renderTemplate(tpl, sampleVars)
        for (const w of r.warnings) out.push(`变体${i + 1}${field === 'system' ? '系统词' : '用户词'}：${w}`)
      }
    }
    return out.slice(0, 6)
  }, [parsed, variants])

  const updateVariant = (i: number, patch: Partial<VariantDraft>) => {
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  }

  const startRun = async () => {
    setErr('')
    setOkMsg('')
    if (running) { setErr('已有矩阵在运行，等它完成或先取消'); return }
    if (!profiles.length) { setErr('没有模型档案：先到「档案」页导入宿主档案或手动添加'); return }
    const vDefs = variants.map((v) => ({
      name: v.name,
      profileId: v.profileId,
      systemTemplate: v.systemTemplate,
      userTemplate: v.userTemplate,
      maxTokens: Number(v.maxTokens) || 1024,
      temperature: v.temperature.trim() === '' ? null : Number(v.temperature),
    }))
    if (!vDefs.every((v) => v.userTemplate.trim())) { setErr('每个变体的用户提示词模板不能为空'); return }
    if (!useInline && !datasetId) { setErr('选择数据集（或切到「临时 JSONL」直接粘贴）'); return }
    if (useInline && !inlineJsonl.trim()) { setErr('临时 JSONL 为空'); return }
    if (useJudge && !judgeProfileId) { setErr('开启了 LLM 评判但未选择评判档案'); return }
    if (cellCount <= 0) { setErr('格子数为 0：数据集没有有效样本'); return }
    const spend = window.confirm(
      `即将发起矩阵：${sampleCount} 样本 × ${variants.length} 变体 = ${cellCount} 格真实 LLM 请求`
      + (judgeCells ? ` + ${judgeCells} 格评判` : '')
      + `\n每次调用都产生 token 费用，确认执行？`,
    )
    if (!spend) return
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        variants: vDefs,
        concurrency: Number(concurrency) || 3,
        retries: Number(retries) ?? 1,
      }
      if (useInline) payload.jsonl = inlineJsonl
      else payload.datasetId = datasetId
      if (useJudge) payload.judge = { profileId: judgeProfileId, userTemplate: judgeTemplate }
      const r = await sendCommand('run_start', payload, 20000)
      if (r.ok) {
        setOkMsg(`矩阵已启动（${r.cells} 格）。进度见顶部进度条，完成后自动切到「结果」。`)
        onDone()
        // 轮询到完成自动切结果页
        const t = setInterval(async () => {
          const m = await loadMeta().catch(() => null)
          if (!m || !m.running) {
            clearInterval(t)
            goTab('results')
          }
        }, 3000)
      } else {
        setErr(r.error || '发起失败')
      }
    } catch (e) {
      setErr(String((e as Error).message || e))
    } finally {
      setBusy(false)
    }
  }

  const cancelRun = async () => {
    setBusy(true)
    try {
      const r = await sendCommand('run_cancel', {}, 12000)
      if (!r.ok) setErr(r.error || '取消失败')
      else setOkMsg('已请求取消（正在跑的格子会中止，已完成格子保留落盘）')
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="pm-sec"><span className="pm-bar" />数据集<span className="pm-hint">一组输入样本，逐行 JSONL</span></div>
      <div className="pm-card"><div className="pm-card-b">
        <div className="pm-row">
          <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
            <input type="checkbox" checked={!useInline} onChange={() => setUseInline(false)} />
            已保存数据集
          </label>
          <select className="pm-sel" style={{ flex: 1, minWidth: 180 }} value={datasetId} disabled={useInline}
            onChange={(e) => setDatasetId(e.target.value)}>
            <option value="">— 选择 —</option>
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}（{d.count} 条）</option>)}
          </select>
          <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
            <input type="checkbox" checked={useInline} onChange={() => setUseInline(true)} />
            临时 JSONL
          </label>
          <button className="pm-btn ghost sm" onClick={() => goTab('datasets')}>管理数据集 →</button>
        </div>
        {useInline ? (
          <textarea className="pm-ta" rows={5} style={{ marginTop: 8 }} value={inlineJsonl}
            placeholder={'每行一个样本对象：\n{"vars": {"text": "你好世界"}}\n或直接 {"text": "你好世界"}\n可选 expect 检查器：{"vars": {...}, "expect": [{"type": "json_valid", "extract": true}]}'}
            onChange={(e) => setInlineJsonl(e.target.value)} />
        ) : null}
        {parsed && parsed.errors.length ? (
          <div className="pm-warn">{parsed.errors.length} 行有问题（运行时跳过）：{parsed.errors.slice(0, 3).map((x) => `${x.line}行 ${x.msg}`).join('；')}</div>
        ) : null}
        {tplWarn.length ? (
          <div className="pm-warn">模板警告：{tplWarn.join('；')}</div>
        ) : null}
      </div></div>

      <div className="pm-sec"><span className="pm-bar" />变体（列）<span className="pm-hint">同一模板配多个模型 = 模型对比；同一模型配不同模板 = 提示词 A/B</span></div>
      {variants.map((v, i) => {
        const p = profiles.find((x) => x.id === v.profileId)
        return (
          <div className="pm-card" key={i}><div className="pm-card-b">
            <div className="pm-row" style={{ marginBottom: 7 }}>
              <span className="pm-tag">变体 {i + 1}</span>
              <input className="pm-inp" style={{ width: 150 }} placeholder={`名称（默认档案名）`} value={v.name}
                onChange={(e) => updateVariant(i, { name: e.target.value })} />
              <select className="pm-sel" style={{ flex: 1, minWidth: 160 }} value={v.profileId}
                onChange={(e) => updateVariant(i, { profileId: e.target.value })}>
                {profiles.length ? profiles.map((p2) => (
                  <option key={p2.id} value={p2.id}>{p2.name}（{p2.model || '未设模型'}）</option>
                )) : <option value="">— 无档案，先去「档案」页 —</option>}
              </select>
              {variants.length > 1 ? (
                <button className="pm-del" title="删除此变体" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}>✕</button>
              ) : null}
            </div>
            {p ? <div className="pm-sub" style={{ marginBottom: 6 }}>{p.baseUrl}｜key {p.keyMask || '无'}｜{p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'} 线路</div> : null}
            <textarea className="pm-ta" rows={2} style={{ marginBottom: 7 }} placeholder="系统提示词模板（可选，支持 {{变量}}）"
              value={v.systemTemplate} onChange={(e) => updateVariant(i, { systemTemplate: e.target.value })} />
            <textarea className="pm-ta" rows={3} placeholder="用户提示词模板（必填，支持 {{变量}}）"
              value={v.userTemplate} onChange={(e) => updateVariant(i, { userTemplate: e.target.value })} />
            <div className="pm-row" style={{ marginTop: 7 }}>
              <span className="pm-sub">max_tokens</span>
              <input className="pm-inp" style={{ width: 90 }} value={v.maxTokens} onChange={(e) => updateVariant(i, { maxTokens: e.target.value })} />
              <span className="pm-sub">temperature</span>
              <input className="pm-inp" style={{ width: 90 }} placeholder="默认" value={v.temperature}
                onChange={(e) => updateVariant(i, { temperature: e.target.value })} />
            </div>
          </div></div>
        )
      })}
      <div style={{ padding: '0 16px 8px' }}>
        <button className="pm-btn ghost sm" disabled={variants.length >= 8}
          onClick={() => setVariants((vs) => [...vs, newVariant(profiles)])}>+ 加一个变体（≤8）</button>
      </div>

      <div className="pm-sec"><span className="pm-bar" />执行与评判</div>
      <div className="pm-card"><div className="pm-card-b">
        <div className="pm-row">
          <span className="pm-sub">并发</span>
          <select className="pm-sel" value={concurrency} onChange={(e) => setConcurrency(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="pm-sub">失败重试（限流/5xx/网络）</span>
          <select className="pm-sel" value={retries} onChange={(e) => setRetries(e.target.value)}>
            {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="pm-row" style={{ marginTop: 9 }}>
          <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}>
            <input type="checkbox" checked={useJudge} onChange={(e) => setUseJudge(e.target.checked)} />
            LLM 评判（逐格 1-10 分，额外 {sampleCount * variants.length} 次调用）
          </label>
          {useJudge ? (
            <select className="pm-sel" style={{ flex: 1, minWidth: 160 }} value={judgeProfileId}
              onChange={(e) => setJudgeProfileId(e.target.value)}>
              <option value="">— 评判档案 —</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.model}）</option>)}
            </select>
          ) : null}
        </div>
        {useJudge ? (
          <textarea className="pm-ta" rows={2} style={{ marginTop: 7 }}
            placeholder="评判提示词模板（可选；可用 {{output}} 与样本变量；留空用内置模板）"
            value={judgeTemplate} onChange={(e) => setJudgeTemplate(e.target.value)} />
        ) : null}
      </div></div>

      <div style={{ padding: '2px 16px 14px' }}>
        <div className="pm-sub" style={{ marginBottom: 8 }}>
          预估：<b style={{ color: '#E6EAF2' }}>{sampleCount} 样本 × {variants.length} 变体 = {cellCount} 格</b>
          {judgeCells ? ` + ${judgeCells} 格评判` : ''}
          {cellCount > 200 ? '（大规模运行：结果投影会截断展示，全文仍完整落盘）' : ''}
        </div>
        {err ? <div className="pm-err">{err}</div> : null}
        {okMsg ? <div className="pm-ok">{okMsg}</div> : null}
        {running ? (
          <button className="pm-btn danger" disabled={busy} onClick={cancelRun}>⏹ 取消当前矩阵（{running.done}/{running.total}）</button>
        ) : (
          <button className="pm-btn" disabled={busy || !profiles.length} onClick={startRun}>▶ 发起矩阵运行</button>
        )}
      </div>
    </div>
  )
}
