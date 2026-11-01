/**
 * 设置 Tab：超时调参（存 llmprobe.settings，服务 30s 内生效）+ 说明与安全边界。
 */
import { useEffect, useState } from 'react'
import { loadSettings, sendCommand, type ServiceMeta, type LlmProbeSettings } from './model'

interface Props {
  meta: ServiceMeta | null
  onRefresh: () => Promise<void>
}

const DEFAULTS: LlmProbeSettings = { chatMs: 30000, streamMs: 60000, modelsMs: 15000 }

export default function SettingsTab({ meta, onRefresh }: Props) {
  const [s, setS] = useState<LlmProbeSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    loadSettings().then((v) => { if (v) setS({ ...DEFAULTS, ...v }) }).catch(() => { /* 默认 */ })
  }, [])

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      await sendCommand('settings_set', { ...s }, 15000).catch(() => null)
      setMsg('已保存（服务侧下一次读设置时生效；未支持的动作会被服务忽略，不影响使用）')
      await onRefresh()
    } finally { setBusy(false) }
  }

  const num = (label: string, key: keyof LlmProbeSettings, hint: string) => (
    <>
      <div className="lp-row-h" style={{ borderTop: 'none', paddingTop: 0 }}>
        <b style={{ fontSize: 12 }}>{label}</b>
        <input
          className="lp-inp lp-num" style={{ width: 110 }} type="number" min={2000} step={1000}
          value={Math.round(s[key] / 1000)}
          onChange={(e) => setS({ ...s, [key]: Math.max(2, Number(e.target.value) || 2) * 1000 })}
        />
        <span className="lp-sub" style={{ marginLeft: 8 }}>{hint}</span>
      </div>
    </>
  )

  return (
    <>
      <div className="lp-sec"><span className="lp-bar" />探针超时</div>
      <div className="lp-card"><div className="lp-card-b">
        {num('对话超时', 'chatMs', '非流式对话与工具调用单次上限（秒）')}
        <div style={{ height: 8 }} />
        {num('流式总时长', 'streamMs', '流式探针全程上限（秒）')}
        <div style={{ height: 8 }} />
        {num('模型表超时', 'modelsMs', 'GET /models 上限（秒）')}
        <div style={{ marginTop: 10 }}>
          <button className="lp-btn" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存超时设置'}</button>
          {msg && <span className="lp-sub" style={{ marginLeft: 10 }}>{msg}</span>}
        </div>
      </div></div>

      <div className="lp-sec"><span className="lp-bar" />服务与安全边界</div>
      <div className="lp-card"><div className="lp-card-b">
        <dl className="lp-kv">
          <dt>服务版本</dt><dd>{meta ? meta.version : '—'}</dd>
          <dt>心跳</dt><dd>{meta ? meta.ts.replace('T', ' ').slice(0, 19) : '—'}{meta && meta.degraded ? <span className="lp-err">（降级：{meta.lastBridgeErr}）</span> : null}</dd>
          <dt>档案数</dt><dd>{meta ? meta.profileCount : '—'}</dd>
          <dt>密钥存储</dt><dd>完整 apiKey 只存本机服务目录 profiles.json 与内存；kv/报告/AI 返回一律 ****后4位 掩码</dd>
          <dt>成本护栏</dt><dd>体检每步 ≤16 token；基准测试显式发起；无定时任务，一切花费由你手动触发</dd>
          <dt>网络边界</dt><dd>探针仅访问你登记的档案 URL；不做端口扫描、不做并发压测、不自动重试花费型请求</dd>
        </dl>
      </div></div>

      <div className="lp-sec"><span className="lp-bar" />使用提示</div>
      <div className="lp-card"><div className="lp-card-b">
        <div className="lp-sub" style={{ lineHeight: 1.9 }}>
          · 本地 Ollama 连不上？大概率是只监听 127.0.0.1 —— 设置 <code>OLLAMA_HOST=0.0.0.0</code> 后重启 Ollama；<br />
          · Base URL 不知道该不该带 /v1？探针会自动归一并在报告里展示「解析终点」，极端情况用 <code>#</code> 结尾逐字指定；<br />
          · 404 但模型表正常？多半是模型名 tag 不匹配（llama3 vs llama3:8b）；<br />
          · 手机/Web 端打开同一面板可看掩码报告与历史，发起体检同样走桌面服务执行。
        </div>
      </div></div>
    </>
  )
}
