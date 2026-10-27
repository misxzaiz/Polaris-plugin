/**
 * 菜谱 Tab：检索 + 详情（用料对照库存）+ URL 导入（命令邮箱→服务端抓取）
 * + 手动/半自动表单。抓取的正文可「发给 AI 提取」或「填入表单」。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/stove-core.js'
import { importUrl, parseIngredientLine, type Api, type Overview, type Toast } from './model'

interface Preview { title: string; text: string; url: string }

export default function RecipeTab(props: {
  ov: Overview
  api: Api
  toast: Toast
  onSendToChat?: (message: string) => void | Promise<void>
  goTab: (t: 'today' | 'pantry' | 'recipes' | 'plan' | 'shopping' | 'settings') => void
}) {
  const { ov, api, toast, onSendToChat, goTab } = props
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [maxMin, setMaxMin] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)

  // 手动/填入表单状态
  const [fName, setFName] = useState('')
  const [fMinutes, setFMinutes] = useState('30')
  const [fTags, setFTags] = useState('')
  const [fIngredients, setFIngredients] = useState('')
  const [fSteps, setFSteps] = useState('')
  const [fUrl, setFUrl] = useState('')

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const id of ov.recipes.order) for (const t of ov.recipes.byId[id].tags) s.add(t)
    return [...s].slice(0, 12)
  }, [ov.recipes])

  const list = useMemo(() => {
    const nq = core.normName(q)
    let ids = ov.recipes.order.slice().reverse()
    if (nq) ids = ids.filter((id) => core.normName(ov.recipes.byId[id].name).includes(nq))
    if (tag) ids = ids.filter((id) => ov.recipes.byId[id].tags.includes(tag))
    if (maxMin) ids = ids.filter((id) => ov.recipes.byId[id].minutes <= Number(maxMin))
    return ids
  }, [ov.recipes, q, tag, maxMin])

  const sel = selId ? ov.recipes.byId[selId] : null

  const doImport = async () => {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) { toast('请输入 http(s) 菜谱链接', true); return }
    setImporting(true)
    setPreview(null)
    const r = await importUrl(u, () => {})
    setImporting(false)
    if (!r.ok) { toast(r.error || '抓取失败', true); return }
    setPreview({ title: r.title || '', text: r.text || '', url: r.url || u })
    toast('抓好了，正文在下面')
  }

  const fillFormFromPreview = (p: Preview) => {
    setFName(p.title.replace(/[-_|·].{0,20}(菜谱|食谱|做法).*$/i, '').trim() || p.title.slice(0, 30))
    setFIngredients('')
    setFSteps('')
    setFUrl(p.url)
    setShowForm(true)
    toast('标题已填，用料步骤请照正文抄或交给 AI')
  }

  const sendToAi = async (p: Preview) => {
    if (!onSendToChat) { toast('当前环境不支持发给聊天（onSendToChat 缺失）', true); return }
    const prompt = [
      `请从下面的菜谱网页正文提取结构化菜谱，并用 stove_recipe_save 保存：`,
      `标题：${p.title}`,
      `来源：${p.url}`,
      `要求：minutes=制作分钟数（估）；tags 起两个（如 快手/下饭/素食/硬菜）；ingredients 全部主辅料（qty/unit 能提取就提取）；steps 按原文精简为编号步骤。`,
      `正文：`,
      p.text.slice(0, 4000),
    ].join('\n')
    await onSendToChat(prompt)
    toast('已发给 AI 提取')
  }

  const submitForm = () => {
    if (!fName.trim()) { toast('菜谱名必填', true); return }
    const ingredients = fIngredients.split('\n').map(parseIngredientLine).filter(Boolean)
    const steps = fSteps.split('\n').map((s) => s.trim()).filter(Boolean)
    if (ingredients.length === 0) { toast('用料至少一行（如：番茄 2 个）', true); return }
    if (steps.length === 0) { toast('步骤至少一行', true); return }
    api.recipeSave({
      name: fName.trim(),
      minutes: Number(fMinutes) || 30,
      tags: fTags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
      ingredients,
      steps,
      url: fUrl.trim() || undefined,
      source: fUrl.trim() ? 'import' : 'manual',
    }, toast)
    setFName(''); setFTags(''); setFIngredients(''); setFSteps(''); setFUrl(''); setFMinutes('30')
    setShowForm(false)
    setPreview(null)
  }

  return (
    <>
      <div className="as-sec">
        <span className="as-bar" />菜谱
        <span className="as-hint">{ov.recipes.order.length} 道</span>
        <button className="as-btn sm" style={{ marginLeft: 8 }} onClick={() => setShowForm(!showForm)}>{showForm ? '收起表单' : '+ 手动/导入'}</button>
      </div>

      <div className="as-card"><div className="as-card-b">
        <div className="as-row">
          <input className="as-inp" style={{ flex: 1 }} placeholder="贴菜谱 URL，服务端代抓（绕开跨域）" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="as-btn" disabled={importing} onClick={doImport}>{importing ? '抓取中…' : '抓取'}</button>
        </div>
        {preview && (
          <div style={{ marginTop: 10 }}>
            <div className="as-sub"><b style={{ color: '#FFC98A' }}>{preview.title || '（无标题）'}</b></div>
            <div className="as-sub" style={{ maxHeight: 120, overflow: 'hidden', marginTop: 4, whiteSpace: 'pre-wrap' }}>
              {preview.text.slice(0, 400)}…
            </div>
            <div className="as-row" style={{ marginTop: 8 }}>
              <button className="as-btn sm" onClick={() => sendToAi(preview)} disabled={!onSendToChat}>发给 AI 提取</button>
              <button className="as-btn sm ghost" onClick={() => fillFormFromPreview(preview)}>填入手动表单</button>
            </div>
          </div>
        )}
      </div></div>

      {showForm && (
        <div className="as-card"><div className="as-card-b">
          <div className="as-row">
            <input className="as-inp" style={{ flex: 2 }} placeholder="菜谱名" value={fName} onChange={(e) => setFName(e.target.value)} />
            <input className="as-inp d" style={{ width: 80 }} placeholder="分钟" value={fMinutes} onChange={(e) => setFMinutes(e.target.value)} inputMode="numeric" />
            <input className="as-inp" style={{ flex: 1 }} placeholder="标签，逗号分隔" value={fTags} onChange={(e) => setFTags(e.target.value)} />
          </div>
          <span className="as-lbl">用料（每行一条：名 数量 单位，如「番茄 2 个」，数量可省）</span>
          <textarea className="as-txa" rows={4} value={fIngredients} onChange={(e) => setFIngredients(e.target.value)} placeholder={'番茄 2 个\n鸡蛋 3 个\n盐'} />
          <span className="as-lbl">步骤（每行一步）</span>
          <textarea className="as-txa" rows={4} value={fSteps} onChange={(e) => setFSteps(e.target.value)} placeholder={'番茄切块\n热油下蛋炒散'} />
          <div className="as-row" style={{ marginTop: 10 }}>
            <button className="as-btn" onClick={submitForm}>保存菜谱</button>
            {fUrl && <span className="as-sub">来源：{fUrl.slice(0, 40)}…</span>}
          </div>
        </div></div>
      )}

      <div className="as-card"><div className="as-card-b">
        <div className="as-row">
          <input className="as-inp" style={{ flex: 1 }} placeholder="搜菜名/用料…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="as-sel" value={maxMin} onChange={(e) => setMaxMin(e.target.value)}>
            <option value="">任意时长</option>
            <option value="15">≤15 分钟</option>
            <option value="30">≤30 分钟</option>
            <option value="60">≤60 分钟</option>
          </select>
        </div>
        {allTags.length > 0 && (
          <div className="as-row" style={{ marginTop: 8 }}>
            {allTags.map((t) => (
              <button key={t} className={`as-chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>
            ))}
          </div>
        )}
      </div></div>

      {sel && (
        <div className="as-card"><div className="as-card-b">
          <div className="as-row">
            <b style={{ flex: 1, fontSize: 14 }}>{sel.name}</b>
            <button className="as-btn sm" onClick={() => { api.planSet(core.dayKey(Date.now()), { recipeId: sel.id }, toast); goTab('plan'); }}>排进今日</button>
            <button className="as-btn sm danger" onClick={() => { api.recipeRemove(sel.id, toast); setSelId(null); }}>删除</button>
            <button className="as-btn sm ghost" onClick={() => setSelId(null)}>收起</button>
          </div>
          <span className="as-lbl">用料（对照库存）</span>
          {sel.ingredients.map((ing, i) => {
            const have = core.findPantryHits(ov.pantry, ing.norm, Date.now()).length > 0
            return (
              <div key={i} className="as-item">
                <span className={`as-badge ${have ? 'ok' : ''}`}>{have ? '有' : '缺'}</span>
                <span style={{ fontSize: 12.5 }}>
                  {ing.name}{ing.qty != null ? ` ${ing.qty}${ing.unit || ''}` : ''}
                </span>
              </div>
            )
          })}
          <span className="as-lbl">步骤</span>
          {sel.steps.map((s, i) => (
            <div key={i} className="as-sub" style={{ padding: '3px 0' }}>{i + 1}. {s}</div>
          ))}
          <div className="as-row" style={{ marginTop: 8 }}>
            {sel.tags.map((t) => <span key={t} className="as-badge">{t}</span>)}
            <span className="as-hint">{sel.minutes} 分钟{sel.url ? ` · 来源 ${sel.url.slice(0, 30)}…` : ''}</span>
          </div>
        </div></div>
      )}

      {list.length === 0 ? (
        <div className="as-empty">没有匹配的菜谱。手动加一道，或贴个 URL 让服务代抓。</div>
      ) : list.map((id) => {
        const r = ov.recipes.byId[id]
        const missingN = r.ingredients.filter((ing) => core.findPantryHits(ov.pantry, ing.norm, Date.now()).length === 0).length
        return (
          <div className="as-card" key={id} style={{ cursor: 'pointer' }} onClick={() => setSelId(selId === id ? null : id)}>
            <div className="as-card-b as-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{r.name}</b>
                <div className="as-sub">{r.minutes} 分钟 · {r.ingredients.length} 种用料{missingN > 0 ? ` · 缺 ${missingN}` : ' · 料全'}{r.tags.length ? ` · ${r.tags.join('/')}` : ''}</div>
              </div>
              {missingN === 0 && <span className="as-badge ok">能做</span>}
            </div>
          </div>
        )
      })}
    </>
  )
}
