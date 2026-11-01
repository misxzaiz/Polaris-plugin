/**
 * 设置 Tab：服务状态 + 执行护栏设置 + AI 供应商（含宿主一键导入）。
 * settings/providers 面板直接写（低频、last-write-wins 可接受，README 注明）。
 */
import { useState } from 'react'
import { saveSettings, saveProviders, importHostProfiles, type Toast } from './model'
import { fmtTime, type PanelData, type Notifier, type Settings, type AiProvider } from './ui'

export default function SettingsTab({ data, notify, refresh }: {
  data: PanelData
  notify: Notifier
  refresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null)

  const meta = data.meta
  const s = data.settings
  const alive = meta && meta.lastTickAt && Date.now() - meta.lastTickAt < 90 * 1000

  const saveS = async (patch: Partial<Settings>) => {
    if (!s || busy) return
    setBusy(true)
    try {
      await saveSettings({ ...s, ...patch })
      notify('设置已保存（服务约 30 秒内热生效）')
      await refresh()
    } catch (e) { notify((e as Error).message, true) } finally { setBusy(false) }
  }

  const startImport = async () => {
    setBusy(true)
    try {
      const hosts = await importHostProfiles()
      if (!hosts.length) { notify('宿主配置里没找到可用供应商（或字段缺失）——可手动新增', true); return }
      // 导入 = 追加（id 重新生成，apiKey 原值落本插件 kv，面板显示掩码）
      const next = [...data.providers, ...hosts]
      await saveProviders(next)
      notify(`已导入 ${hosts.length} 个宿主供应商（密钥只存本机）`)
      await refresh()
    } catch (e) { notify((e as Error).message, true) } finally { setBusy(false) }
  }

  const saveProvider = async (p: AiProvider) => {
    if (!p.name.trim() || !p.baseUrl.trim()) { notify('名称与 baseUrl 必填', true); return }
    setBusy(true)
    try {
      const list = data.providers.slice()
      const i = list.findIndex((x) => x.id === p.id)
      if (i === -1) {
        list.push(p)
      } else {
        // apiKey 留空 = 保持原值（编辑时不想重输密钥）
        list[i] = { ...p, apiKey: p.apiKey || list[i].apiKey }
      }
      await saveProviders(list)
      notify('供应商已保存')
      setEditingProvider(null)
      await refresh()
    } catch (e) { notify((e as Error).message, true) } finally { setBusy(false) }
  }

  const removeProvider = async (p: AiProvider) => {
    if (!window.confirm(`删除供应商「${p.name}」？引用它的任务将无法执行。`)) return
    setBusy(true)
    try {
      await saveProviders(data.providers.filter((x) => x.id !== p.id))
      notify('已删除')
      await refresh()
    } catch (e) { notify((e as Error).message, true) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="tr-card">
        <div className="tr-card-b">
          <b style={{ fontSize: 13 }}>服务状态</b>
          <div className="tr-sub" style={{ marginTop: 4 }}>
            {alive
              ? <>运行中 · 版本 {meta?.version} · 心跳 {fmtTime(meta?.lastTickAt)} · 桥 {meta?.bridge || '?'}</>
              : '未运行或心跳过期——服务由宿主自动拉起（重启 Polaris 或在插件设置里启用）；本机双实例时只有一个实例持有调度租约'}
          </div>
          {meta?.degraded ? <div className="tr-err">桥降级中：结果会延迟落库，恢复后自动续上</div> : null}
        </div>
      </div>

      {s ? (
        <div className="tr-card">
          <div className="tr-card-b">
            <b style={{ fontSize: 13 }}>执行护栏</b>
            <label className="tr-lbl">历史保留条数（50–1000）</label>
            <input
              className="tr-inp" style={{ width: 110 }} defaultValue={s.retentionRuns}
              onBlur={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v !== s.retentionRuns) saveS({ retentionRuns: v }) }}
            />
            <div className="tr-row" style={{ marginTop: 8, gap: 16 }}>
              <label className="tr-sub">
                命令超时
                <input
                  className="tr-inp" style={{ width: 70, marginLeft: 6 }} defaultValue={s.timeoutCommandSec}
                  onBlur={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v !== s.timeoutCommandSec) saveS({ timeoutCommandSec: v }) }}
                />
                秒
              </label>
              <label className="tr-sub">
                HTTP 超时
                <input
                  className="tr-inp" style={{ width: 70, marginLeft: 6 }} defaultValue={s.timeoutHttpSec}
                  onBlur={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v !== s.timeoutHttpSec) saveS({ timeoutHttpSec: v }) }}
                />
                秒
              </label>
              <label className="tr-sub">
                AI 超时
                <input
                  className="tr-inp" style={{ width: 70, marginLeft: 6 }} defaultValue={s.timeoutAiSec}
                  onBlur={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v !== s.timeoutAiSec) saveS({ timeoutAiSec: v }) }}
                />
                秒
              </label>
            </div>
          </div>
        </div>
      ) : null}

      <div className="tr-card">
        <div className="tr-card-b">
          <div className="tr-row" style={{ justifyContent: 'space-between' }}>
            <b style={{ fontSize: 13 }}>AI 供应商</b>
            <div className="tr-row" style={{ gap: 6 }}>
              <button className="tr-btn sm ghost" disabled={busy} onClick={startImport}>从宿主导入</button>
              <button
                className="tr-btn sm"
                disabled={busy}
                onClick={() => setEditingProvider({ id: `prov_${Date.now().toString(36)}`, name: '', baseUrl: '', apiKey: '', model: '', wire: 'openai-chat-completions' })}
              >＋ 手动新增</button>
            </div>
          </div>
          <div className="tr-sub" style={{ marginTop: 4 }}>
            供应商给「AI 提示词」任务用；密钥只存本机（cap.kv，与模型体检台同信任域），面板与 AI 侧一律掩码显示。
          </div>

          {data.providers.length === 0 ? (
            <div className="tr-empty" style={{ padding: '14px 10px' }}>还没有供应商——点「从宿主导入」零重录，或手动新增。</div>
          ) : null}

          {data.providers.map((p) => (
            <div key={p.id} className="tr-row" style={{ justifyContent: 'space-between', marginTop: 8, background: '#12151c', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 12 }}>{p.name}</b>
                <div className="tr-sub">{p.baseUrl}</div>
                <div className="tr-sub">模型 {p.model || '—'} · {p.wire === 'anthropic-messages' ? 'Anthropic' : 'OpenAI'} · key {p.apiKey ? '****' + p.apiKey.slice(-4) : '未设'}</div>
              </div>
              <div className="tr-row" style={{ gap: 6 }}>
                <button className="tr-btn sm ghost" onClick={() => setEditingProvider({ ...p })}>编辑</button>
                <button className="tr-btn sm danger" onClick={() => removeProvider(p)}>删除</button>
              </div>
            </div>
          ))}

          {editingProvider ? (
            <div style={{ marginTop: 10, borderTop: '1px solid #242C3A', paddingTop: 8 }}>
              <label className="tr-lbl">名称</label>
              <input className="tr-inp" value={editingProvider.name} maxLength={40} onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })} />
              <label className="tr-lbl">baseUrl（API 根，如 https://api.openai.com/v1 或 openai 风格网关）</label>
              <input className="tr-inp" value={editingProvider.baseUrl} onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })} />
              <label className="tr-lbl">apiKey</label>
              <input className="tr-inp" type="password" value={editingProvider.apiKey} placeholder="已保存时留空 = 保持原值" onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })} />
              <label className="tr-lbl">模型</label>
              <input className="tr-inp" value={editingProvider.model} placeholder="如 glm-4.7 / deepseek-chat" onChange={(e) => setEditingProvider({ ...editingProvider, model: e.target.value })} />
              <label className="tr-lbl">协议</label>
              <select className="tr-sel" value={editingProvider.wire} onChange={(e) => setEditingProvider({ ...editingProvider, wire: e.target.value as AiProvider['wire'] })}>
                <option value="openai-chat-completions">OpenAI Chat Completions</option>
                <option value="anthropic-messages">Anthropic Messages</option>
              </select>
              <div className="tr-row" style={{ marginTop: 10 }}>
                <button className="tr-btn" disabled={busy} onClick={() => saveProvider(editingProvider)}>保存供应商</button>
                <button className="tr-btn ghost" onClick={() => setEditingProvider(null)}>取消</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="tr-card">
        <div className="tr-card-b">
          <b style={{ fontSize: 13 }}>已知限制（如实）</b>
          <div className="tr-sub" style={{ marginTop: 4 }}>
            · 宿主关闭期间任务不执行，错过只补一次（不回放积压）<br />
            · 分钟粒度调度（无秒级）；执行顺序为队列串行<br />
            · AI 任务为非流式单轮调用（无工具/无多轮）；提示词要自包含<br />
            · 数据全部存本机 cap.kv，不外发（AI 任务按你配置的供应商直连）
          </div>
        </div>
      </div>
    </div>
  )
}
