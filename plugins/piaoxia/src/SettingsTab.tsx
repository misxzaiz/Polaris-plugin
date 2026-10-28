/**
 * SettingsTab —— 抬头管理 / CSV·JSON 导入 / 服务状态 / 口径与边界。
 */
import { useRef, useState } from 'react'
import * as core from '../shared/core'
import type { PanelCtx } from './Panel'
import { saveTitle, deleteTitle, importAllJSON, importInvoicesCSV, probeService } from './model'

export default function SettingsTab({ ctx }: { ctx: PanelCtx }) {
  return (
    <div>
      <TitlesCard ctx={ctx} />
      <ImportCard ctx={ctx} />
      <ServiceCard ctx={ctx} />
      <div className="px-card">
        <h3>口径与边界（务必了解）</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: '#7d8590', fontSize: 12, lineHeight: 1.9 }}>
          <li><b style={{ color: '#d7dde6' }}>纯本地</b>：票据数据存宿主 cap.kv，原件归档到数据根 piaoxia/ 目录，全程零外网请求。</li>
          <li><b style={{ color: '#d7dde6' }}>判重口径</b>：发票号码（数电票 20 位 / 旧票 8 位+12 位代码）全局唯一；手录无号码的票按「日期+销方+金额+品名」内容寻址。</li>
          <li><b style={{ color: '#d7dde6' }}>不做 OCR</b>：扫描件/图片型 PDF/纸质票无法解析，请手动录入；OFD 版式暂不支持（请从电子税务局下载 PDF 或 XML）。</li>
          <li><b style={{ color: '#d7dde6' }}>不做发票查验</b>：不对接税务查验接口；真伪请走官方查验平台，票匣只做本地台账。</li>
          <li><b style={{ color: '#d7dde6' }}>解析不确定时会明说</b>：带 ⚠ 提示的票请人工核对金额与号码；解析失败的票不会被静默丢弃。</li>
          <li><b style={{ color: '#d7dde6' }}>删除双保险</b>：面板两击确认；AI 删除必须先向你确认。归档原件不随台账删除。</li>
        </ul>
      </div>
    </div>
  )
}

function TitlesCard({ ctx }: { ctx: PanelCtx }) {
  const [form, setForm] = useState({ name: '', taxId: '', bank: '', account: '', address: '', phone: '', isDefault: false })
  const [busy, setBusy] = useState(false)
  const titles = Array.from(ctx.data.titles.values()).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name))
  const set = (k: keyof typeof form, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }))

  const add = async () => {
    setBusy(true)
    try {
      const t = core.normalizeTitle(form, null)
      if (ctx.data.titles.has(t.id)) {
        ctx.toast('这个抬头（名称+税号）已经存在', true)
        return
      }
      if (t.isDefault) {
        for (const other of ctx.data.titles.values()) {
          if (other.isDefault) await saveTitle({ ...other, isDefault: false })
        }
      }
      await saveTitle({ ...t, createdAt: new Date().toISOString() })
      ctx.toast('抬头已保存')
      setForm({ name: '', taxId: '', bank: '', account: '', address: '', phone: '', isDefault: false })
      await ctx.reload()
    } catch (e) {
      ctx.toast(String((e as Error).message), true)
    } finally {
      setBusy(false)
    }
  }

  const del = async (t: core.Title) => {
    if (!(window as unknown as { confirm?: (s: string) => boolean }).confirm?.('删除抬头「' + t.name + '」？')) return
    await deleteTitle(t.id)
    ctx.toast('已删除抬头')
    await ctx.reload()
  }

  const copy = async (t: core.Title) => {
    try {
      await navigator.clipboard.writeText(core.titleCopyText(t))
      ctx.toast('开票信息已复制')
    } catch (_) {
      ctx.toast(core.titleCopyText(t).split('\n')[0] + '…（剪贴板不可用，完整文本见下方）', true)
    }
  }

  return (
    <div className="px-card">
      <h3>开票抬头 <span className="px-hint">开发票时一键复制购方信息</span></h3>
      {titles.length > 0 && (
        <table className="px-table" style={{ marginBottom: 10 }}>
          <thead><tr><th>名称</th><th>税号</th><th /></tr></thead>
          <tbody>
            {titles.map((t) => (
              <tr key={t.id}>
                <td>{t.name}{t.isDefault ? <span className="px-tag settled" style={{ marginLeft: 6 }}>默认</span> : ''}</td>
                <td className="px-mono">{t.taxId || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="px-btn sm" onClick={() => void copy(t)}>复制</button>{' '}
                  <button className="px-btn sm" onClick={() => { void saveTitle({ ...t, isDefault: !t.isDefault }).then(() => ctx.reload()) }}>
                    {t.isDefault ? '取消默认' : '设默认'}
                  </button>{' '}
                  <button className="px-btn sm danger" onClick={() => void del(t)}>删</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="px-row">
        <input className="px-input" placeholder="抬头名称*" value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 200 }} />
        <input className="px-input" placeholder="统一社会信用代码" value={form.taxId} onChange={(e) => set('taxId', e.target.value)} style={{ width: 190 }} />
        <input className="px-input" placeholder="开户行" value={form.bank} onChange={(e) => set('bank', e.target.value)} style={{ width: 130 }} />
        <input className="px-input" placeholder="账号" value={form.account} onChange={(e) => set('account', e.target.value)} style={{ width: 130 }} />
        <input className="px-input" placeholder="地址" value={form.address} onChange={(e) => set('address', e.target.value)} style={{ width: 120 }} />
        <input className="px-input" placeholder="电话" value={form.phone} onChange={(e) => set('phone', e.target.value)} style={{ width: 110 }} />
        <label className="px-dim" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} /> 设为默认
        </label>
        <button className="px-btn primary" disabled={busy || !form.name.trim()} onClick={() => void add()}>添加抬头</button>
      </div>
    </div>
  )
}

function ImportCard({ ctx }: { ctx: PanelCtx }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    setBusy(true)
    try {
      const text = await file.text()
      if (/\.json$/i.test(file.name)) {
        const r = await importAllJSON(text)
        ctx.toast(`恢复完成：票据 ${r.invoices} 条、抬头 ${r.titles} 条${r.warns.length ? '，跳过 ' + r.warns.length + ' 条' : ''}${r.warns.length ? '（首条：' + r.warns[0] + '）' : ''}`, r.warns.length > 0)
        await ctx.reload()
      } else {
        const r = await importInvoicesCSV(text, ctx.data.invoices)
        ctx.toast(`CSV 导入：新增 ${r.added}，跳过已有 ${r.skipped}${r.warns.length ? '，提示 ' + r.warns.length + ' 条（首条：' + r.warns[0] + '）' : ''}`, r.warns.length > 0)
        await ctx.reload()
      }
    } catch (e) {
      ctx.toast(String((e as Error).message), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-card">
      <h3>导入 <span className="px-hint">JSON = 票匣备份恢复；CSV = 从其他台账迁移（表头须匹配票匣导出格式）</span></h3>
      <div className="px-row">
        <button className="px-btn" disabled={busy} onClick={() => fileRef.current?.click()}>选择 .json / .csv 文件</button>
        <span className="px-dim">导入按发票号码自动判重，已有票不会被覆盖。</span>
      </div>
      <input ref={fileRef} type="file" accept=".json,.csv" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0]
          e.target.value = ''
          if (f) void onFile(f)
        }} />
    </div>
  )
}

function ServiceCard({ ctx }: { ctx: PanelCtx }) {
  const [probe, setProbe] = useState('')
  const meta = ctx.data.meta

  const doProbe = async () => {
    if (!meta) { setProbe('服务 meta 不存在：宿主还没有拉起 piaoxia 服务'); return }
    try {
      const r = await probeService(meta)
      setProbe(`在线 · 引擎 v${r.version || '?'} · 归档目录 ${r.archiveDir || '未定位（原件不归档）'}`)
    } catch (e) {
      setProbe('探测失败：' + String((e as Error).message))
    }
  }

  return (
    <div className="px-card">
      <h3>解析服务</h3>
      <div className="px-row" style={{ fontSize: 12 }}>
        {meta
          ? <span className="px-ok"><span className="px-dot ok" />meta 在档 · 端口 {meta.port} · v{meta.version || '?'}</span>
          : <span className="px-warn"><span className="px-dot warn" />meta 不在档（服务未启动或宿主桥未就绪）</span>}
        <button className="px-btn sm" onClick={() => void doProbe()}>探测</button>
        {probe && <span className="px-dim">{probe}</span>}
      </div>
      <div className="px-dim" style={{ marginTop: 6, fontSize: 11 }}>
        服务只绑 127.0.0.1 + token；面板拖拽与目录扫描经它解析（PDF 文本层 + 数电票 XML），AI 收票走 MCP 通道（同一引擎）。
      </div>
    </div>
  )
}
