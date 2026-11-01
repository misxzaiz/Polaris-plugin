/**
 * SettingsTab —— 全局设置（CORS 模式 / fallback 路由）+ 导入导出 + 使用说明
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { PanelData, Toast } from '../Panel'
import { baseUrl, core, importRoutes, saveSettings, type MockSettings } from '../model'

export default function SettingsTab({ data, reload, showToast, running }: { data: PanelData; reload: () => Promise<PanelData>; showToast: Toast; running: boolean }) {
  const s = data.settings
  const [corsMode, setCorsMode] = useState(s?.cors.mode || 'echo')
  const [fbEnabled, setFbEnabled] = useState(s?.fallback.enabled || false)
  const [fbStatus, setFbStatus] = useState(String(s?.fallback.status || 200))
  const [fbBody, setFbBody] = useState(s?.fallback.body || '{"ok":true}')
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!s) return <div style={{ color: '#71717a', fontSize: 12 }}>设置读取中…</div>

  const persist = async (patch: Partial<MockSettings>) => {
    const next = { ...s, ...patch }
    await saveSettings(next)
    await reload()
  }

  const saveAll = async () => {
    await saveSettings({
      ...s,
      cors: { mode: corsMode as MockSettings['cors']['mode'] },
      fallback: { enabled: fbEnabled, status: parseInt(fbStatus, 10) || 200, bodyType: 'json', body: fbBody },
    })
    showToast('设置已保存（服务 3s 内生效）', 'good')
    await reload()
  }

  const doImport = async () => {
    const t = importText.trim()
    if (!t) { showToast('粘贴 OpenAPI JSON 或路由数组 JSON', 'bad'); return }
    setBusy(true)
    try {
      const parsed = JSON.parse(t)
      if (parsed && parsed.paths) {
        const imp = core.importOpenApi(parsed, {})
        if (!imp.ok) { showToast(imp.error || '导入失败', 'bad'); return }
        const r = await importRoutes(imp.routes || [])
        showToast(`已导入 ${r.added} 条路由（3s 内生效）`, 'good')
        setImportText('')
        await reload()
        return
      }
      if (Array.isArray(parsed)) {
        const r = await importRoutes(parsed)
        showToast(`已导入 ${r.added} 条路由（3s 内生效）`, 'good')
        setImportText('')
        await reload()
        return
      }
      showToast('不是 OpenAPI（缺 paths）也不是路由数组', 'bad')
    } catch (e) {
      showToast(`JSON 解析失败：${(e as Error).message.slice(0, 80)}`, 'bad')
    } finally {
      setBusy(false)
    }
  }

  const doExport = () => {
    const json = JSON.stringify({ routes: s.routes, cors: s.cors, fallback: s.fallback }, null, 2)
    void navigator.clipboard?.writeText(json).then(
      () => showToast('已复制全部路由到剪贴板', 'good'),
      () => showToast('复制失败（剪贴板不可用）', 'bad'),
    )
  }

  const meta = data.meta

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={card()}>
        <div style={title()}>服务状态</div>
        <div style={{ fontSize: 12, lineHeight: 2, color: '#a1a1aa' }}>
          入口：<code style={{ color: '#93c5fd' }}>{baseUrl(meta)}</code>（仅本机 127.0.0.1）
          {meta && <> · 版本 v{meta.version} · 运行 {Math.round((meta.uptimeSec || 0) / 60)} 分钟</>}
          <br />把前端 dev server 的 proxy 或测试的 baseURL 指到上面的地址即可；<b style={{ color: '#d4d4d8' }}>面板不直接发请求</b>，「试一发」由服务侧自发自收。
          <br />服务管理（启动/停止/重启）在 <b>设置 → 插件 → Mock 接口台</b>。
        </div>
      </div>

      <div style={card()}>
        <div style={title()}>CORS 跨域</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {(['echo', 'star', 'off'] as const).map((m) => (
            <button key={m} onClick={() => setCorsMode(m)} style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
              border: '1px solid', minHeight: 26,
              borderColor: corsMode === m ? '#3b82f6' : '#3f3f46',
              background: corsMode === m ? 'rgba(59,130,246,.15)' : 'transparent',
              color: corsMode === m ? '#93c5fd' : '#a1a1aa',
            }}>{m === 'echo' ? 'echo（推荐：回显 Origin + 允许凭据）' : m === 'star' ? 'star（* 无凭据）' : 'off（关闭）'}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#71717a' }}>
          浏览器前端跨源调 mock 必须开 CORS；echo 模式对带 Origin 的请求回显该 Origin 并允许携带凭据，预检（OPTIONS）自动 204 应答。
        </div>
      </div>

      <div style={card()}>
        <div style={title()}>fallback（未匹配时的兜底应答）</div>
        <label style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <input type="checkbox" checked={fbEnabled} onChange={(e) => setFbEnabled(e.target.checked)} />
          启用（默认关闭：未匹配返回 404 诊断体，更早暴露路径拼写问题）
        </label>
        {fbEnabled && (
          <>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>状态码</span>
              <input value={fbStatus} onChange={(e) => setFbStatus(e.target.value)} style={inputStyle(70)} />
            </div>
            <textarea value={fbBody} onChange={(e) => setFbBody(e.target.value)} rows={3} style={{ ...inputStyle(0, 'monospace'), width: '100%', resize: 'vertical' }} />
          </>
        )}
      </div>

      <div style={card()}>
        <div style={title()}>导入 / 导出</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={doExport} style={btn()}>导出全部路由 → 剪贴板</button>
          <button onClick={doImport} disabled={busy} style={btn()}>{busy ? '导入中…' : '从下方 JSON 导入'}</button>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={5}
          placeholder={'粘贴 OpenAPI 3.x JSON（自动按 schema 生成带模板的响应体），或路由数组：\n[{"method":"GET","path":"/api/x","body":"{\\"ok\\":1}"}]'}
          style={{ ...inputStyle(0, 'monospace'), width: '100%', resize: 'vertical' }}
        />
        <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>
          也可以在对话里让 AI 做：「把这份 OpenAPI 导入 mock」（走 mock_import_openapi，先预览后写入）。
        </div>
      </div>

      <div style={card()}>
        <div style={title()}>护栏与已知边界</div>
        <div style={{ fontSize: 11, lineHeight: 2, color: '#71717a' }}>
          · 仅监听 127.0.0.1，局域网/手机不可达（要给手机用请用真接口或内网穿透到本机）<br />
          · 路由 ≤{core.MAX_ROUTES} 条 · 响应体 ≤16KB · 延迟注入 ≤60s · 请求体接收上限 2MB<br />
          · 历史只保留最近 500 条（内存），服务重启清空；路由/设置存本机 kv 持久<br />
          · /__ 开头的路径是系统保留（健康检查等），不能注册<br />
          · 静态路径匹配大小写不敏感（宽容语义）；未识别的模板表达式按字面返回，便于发现拼写错误<br />
          · 请求历史里的敏感请求头（authorization/cookie/token/…）已自动脱敏后入库
        </div>
      </div>

      <button onClick={saveAll} style={{ ...btn(), alignSelf: 'flex-start', minHeight: 32 }}>保存全部设置</button>
    </div>
  )
}

function card(): CSSProperties {
  return { padding: 10, borderRadius: 8, background: 'rgba(39,39,42,.5)', border: '1px solid #3f3f46' }
}
function title(): CSSProperties {
  return { fontSize: 12, fontWeight: 700, color: '#f4f4f5', marginBottom: 8 }
}
function inputStyle(w: number, fontFamily?: string): CSSProperties {
  return {
    width: w || undefined, padding: '6px 8px', fontSize: 12, borderRadius: 6,
    background: '#18181b', border: '1px solid #3f3f46', color: '#e4e4e7', outline: 'none',
    fontFamily: fontFamily || undefined,
  }
}
function btn(): CSSProperties {
  return {
    padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
    background: 'rgba(59,130,246,.2)', border: '1px solid #3b82f6', color: '#93c5fd',
  }
}
