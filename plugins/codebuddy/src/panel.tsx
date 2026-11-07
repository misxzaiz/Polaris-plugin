/**
 * CodeBuddy 面板（activityBar 侧边栏，React 组件）
 *
 * 定位：CodeBuddy 引擎的配置中心 + 快捷指令入口 + 会话/工具观察。
 * 完整流式对话仍走主对话流（面板经 onSendToChat 桥把指令注入主对话；
 * 面板内独立流式对话需宿主开放 chat-event 订阅桥，另行评审）。
 *
 * Tab：快捷指令 / 配置 / 会话 / 工具
 * 数据通道：cap.kv codebuddy.panel.*（配置持久化，host.ts）
 */
import { useCallback, useEffect, useState } from 'react'
import { loadPanelConfig, savePanelConfig, type PanelConfig } from './host'

// ── 样式（生产级：间距节奏/信息层级/交互反馈；深底面板容器）────────────
const CSS = `
.cb-root{position:relative;font:12.5px/1.6 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#DEE4EE;height:100%;display:flex;flex-direction:column;background:transparent}
.cb-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cb-tabs{display:flex;gap:1px;padding:10px 10px 0;flex-shrink:0;border-bottom:1px solid #1E242E}
.cb-tab{flex:1;background:transparent;border:none;color:#7A8496;font-size:11.5px;padding:7px 4px 9px;cursor:pointer;font-weight:600;position:relative;letter-spacing:.02em}
.cb-tab:hover{color:#C9D2DE}
.cb-tab.on{color:#FFFFFF}
.cb-tab.on::after{content:'';position:absolute;left:20%;right:20%;bottom:-1px;height:2px;border-radius:1px;background:#5EA8FF}
.cb-body{flex:1;overflow-y:auto;padding:12px 14px;min-height:0}
.cb-body::-webkit-scrollbar{width:8px;height:8px}
.cb-body::-webkit-scrollbar-thumb{background:#242C3A;border-radius:4px;border:2px solid transparent;background-clip:content-box}
.cb-sec{display:flex;align-items:center;gap:7px;padding:14px 2px 7px;font-size:10.5px;font-weight:700;color:#7A8496;text-transform:uppercase;letter-spacing:.08em}
.cb-sec:first-child{padding-top:2px}
.cb-bar{width:3px;height:11px;border-radius:2px;background:#5EA8FF;flex-shrink:0;opacity:.85}
.cb-field{margin-bottom:12px}
.cb-label{font-size:11.5px;color:#AEB8C4;display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.cb-label .cb-arg{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:#5C6678}
.cb-hint{font-size:10px;color:#5C6678;margin-top:3px;line-height:1.5}
.cb-input,.cb-select{width:100%;background:#12161E;border:1px solid #232A36;border-radius:8px;color:#E6EAF2;font-size:12px;padding:7px 10px;outline:none;transition:border-color .12s}
.cb-input:focus,.cb-select:focus{border-color:#3B6FE0;box-shadow:0 0 0 2px rgba(62,111,224,.18)}
.cb-input:hover,.cb-select:hover{border-color:#2E3644}
.cb-btn{background:linear-gradient(135deg,#3B6FE0,#2E5FC0);border:none;color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;cursor:pointer;font-weight:600;transition:filter .12s, transform .06s;width:100%}
.cb-btn:hover{filter:brightness(1.15)}
.cb-btn:active{transform:scale(.985)}
.cb-btn:disabled{opacity:.45;cursor:not-allowed}
.cb-quick{display:flex;flex-direction:column;gap:7px;padding:2px 0 10px}
.cb-quick button{background:#141922;border:1px solid #232A36;color:#DEE4EE;border-radius:10px;padding:10px 13px;font-size:12px;cursor:pointer;text-align:left;line-height:1.5;transition:border-color .12s, background .12s}
.cb-quick button:hover{border-color:#3B6FE0;background:#181F2A}
.cb-quick button:active{transform:scale(.99)}
.cb-quick b{display:block;font-size:12px;margin-bottom:2px;font-weight:600}
.cb-quick small{color:#7A8496;font-size:10.5px}
.cb-card{background:#12161E;border:1px solid #1E242E;border-radius:11px;padding:11px 13px;margin-bottom:10px;font-size:11.5px;color:#AEB8C4;line-height:1.7}
.cb-card b{color:#DEE4EE;font-weight:600}
.cb-summary{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 6px}
.cb-chip{background:#141922;border:1px solid #232A36;border-radius:7px;padding:4px 9px;font-size:10.5px;color:#AEB8C4}
.cb-chip b{color:#E6EAF2;font-weight:600}
.cb-empty{color:#5C6678;font-size:11.5px;text-align:center;padding:28px 12px;line-height:1.7}
.cb-divider{height:1px;background:#1E242E;margin:4px 0 2px}
`

type Tab = 'quick' | 'config' | 'sessions' | 'tools'

/** 快捷指令（发送到主对话，经 onSendToChat 桥） */
const QUICK_PROMPTS: Array<{ title: string; desc: string; prompt: string }> = [
  { title: '代码审查', desc: '审查当前工作区最近改动', prompt: '审查当前工作区最近的代码改动，按严重度列出问题与修复建议。' },
  { title: '写单元测试', desc: '为指定文件生成测试', prompt: '为以下文件编写单元测试，覆盖边界条件：\n\n（指定文件路径）' },
  { title: '重构建议', desc: '指定文件的重构方案', prompt: '分析以下文件的结构问题并给出重构方案（保持行为不变）：\n\n（指定文件路径）' },
  { title: '排查报错', desc: '粘贴报错信息定位问题', prompt: '帮我排查这个报错，给出根因与修复步骤：\n\n（粘贴报错信息）' },
]

const EFFORT_OPTIONS = [
  { v: '', label: '不设置（引擎默认）' },
  { v: 'minimal', label: 'minimal — 极简' },
  { v: 'low', label: 'low — 低' },
  { v: 'medium', label: 'medium — 中' },
  { v: 'high', label: 'high — 高' },
  { v: 'xhigh', label: 'xhigh — 极高' },
  { v: 'max', label: 'max — 最高' },
]
const PERM_OPTIONS = [
  { v: 'bypassPermissions', label: 'bypassPermissions — 跳过权限（高风险）' },
  { v: 'acceptEdits', label: 'acceptEdits — 自动接受编辑' },
  { v: 'default', label: 'default — 默认确认' },
  { v: 'plan', label: 'plan — 仅规划' },
  { v: 'dontAsk', label: 'dontAsk — 拒绝危险' },
  { v: 'auto', label: 'auto — 自动' },
]
const AUTOCOMPACT_OPTIONS = [
  { v: '', label: '不设置' },
  { v: 'auto', label: 'auto — 跟随模型窗口' },
  { v: '400k', label: '400k — 40 万 token' },
  { v: '1m', label: '1m — 100 万 token' },
]
const FALLBACK_OPTIONS = [
  { v: '', label: '不设置' },
  { v: 'hy4free', label: 'hy4free' },
  { v: 'hy4std', label: 'hy4std' },
  { v: 'hy3', label: 'hy3' },
  { v: 'deepseek-v4.1-flash', label: 'deepseek-v4.1-flash' },
]

export default function CodeBuddyPanel({ onSendToChat }: { pluginId: string; onSendToChat?: (message: string) => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('quick')
  const [cfg, setCfg] = useState<PanelConfig>({
    model: '', effort: '', permissionMode: 'bypassPermissions',
    maxTurns: '', autocompact: '', fallbackModel: '', daemonEnabled: false,
  })
  const [loaded, setLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    void loadPanelConfig().then((c) => { setCfg(c); setLoaded(true) })
  }, [])

  const update = (patch: Partial<PanelConfig>) => setCfg((prev) => ({ ...prev, ...patch }))

  const handleSave = useCallback(async () => {
    setSaveMsg({ text: '保存中…', ok: true })
    try {
      await savePanelConfig(cfg)
      setSaveMsg({ text: '✓ 已保存（新会话生效）', ok: true })
    } catch (e) {
      setSaveMsg({ text: '✗ ' + String((e as Error).message).slice(0, 60), ok: false })
    }
    setTimeout(() => setSaveMsg(null), 2600)
  }, [cfg])

  const sendToChatSafe = (text: string) => {
    if (onSendToChat) void onSendToChat(text)
  }

  const Section = ({ title }: { title: string }) => (
    <div className="cb-sec"><span className="cb-bar" />{title}</div>
  )

  // ── Tab：快捷指令 ────────────────────────────────────────────────────
  const quickTab = (
    <div className="cb-body">
      <div className="cb-summary">
        <span className="cb-chip">模型 <b>{cfg.model || '引擎默认'}</b></span>
        <span className="cb-chip">effort <b>{cfg.effort || '默认'}</b></span>
        <span className="cb-chip">权限 <b>{cfg.permissionMode}</b></span>
        {cfg.fallbackModel ? <span className="cb-chip">备用 <b>{cfg.fallbackModel}</b></span> : null}
      </div>
      <Section title="快捷指令" />
      <div style={{ fontSize: 10, color: '#5C6678', padding: '0 0 6px' }}>
        点击发送到主对话（CodeBuddy 引擎接手，按当前配置执行）
      </div>
      <div className="cb-quick">
        {QUICK_PROMPTS.map((q) => (
          <button key={q.title} onClick={() => sendToChatSafe(q.prompt)}>
            <b>{q.title}</b><small>{q.desc}</small>
          </button>
        ))}
      </div>
      <Section title="自定义指令" />
      <textarea
        id="cb-custom" rows={3}
        style={{ width: '100%', background: '#12161E', border: '1px solid #232A36', borderRadius: 9, color: '#DEE4EE', fontSize: 12, padding: '8px 10px', outline: 'none', resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }}
        placeholder="输入自定义指令…"
      />
      <button className="cb-btn" onClick={() => {
        const el = document.getElementById('cb-custom') as HTMLTextAreaElement | null
        const text = el?.value.trim()
        if (text) { sendToChatSafe(text); if (el) el.value = '' }
      }}>发送到主对话</button>
    </div>
  )

  // ── Tab：配置 ────────────────────────────────────────────────────────
  const configTab = (
    <div className="cb-body">
      <Section title="核心" />
      <div className="cb-field">
        <label className="cb-label">模型 <span className="cb-arg">--model</span></label>
        <input className="cb-input" value={cfg.model} placeholder="hy4free（空=引擎默认）"
          onChange={(e) => update({ model: e.target.value })} />
        <div className="cb-hint">常用：hy4free / hy4std / hy3 / hy3-x / deepseek-v4.1-flash</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">努力级别 <span className="cb-arg">--effort</span></label>
        <select className="cb-select" value={cfg.effort} onChange={(e) => update({ effort: e.target.value })}>
          {EFFORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div className="cb-hint">思考力度：minimal 最快响应，max 最高质量</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">权限模式 <span className="cb-arg">--permission-mode</span></label>
        <select className="cb-select" value={cfg.permissionMode} onChange={(e) => update({ permissionMode: e.target.value })}>
          {PERM_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div className="cb-hint">跳过权限（高风险）仅建议隔离环境使用</div>
      </div>
      <Section title="上下文与容错" />
      <div className="cb-field">
        <label className="cb-label">最大轮数 <span className="cb-arg">--max-turns</span></label>
        <input className="cb-input" value={cfg.maxTurns} placeholder="不限" inputMode="numeric"
          onChange={(e) => update({ maxTurns: e.target.value.replace(/\D/g, '') })} />
        <div className="cb-hint">限制 agent 自动执行轮数，防失控</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">自动压缩窗口 <span className="cb-arg">--autocompact</span></label>
        <select className="cb-select" value={cfg.autocompact} onChange={(e) => update({ autocompact: e.target.value })}>
          {AUTOCOMPACT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div className="cb-hint">上下文达到阈值自动压缩（100k-1M 范围）</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">备用模型 <span className="cb-arg">--fallback-model</span></label>
        <select className="cb-select" value={cfg.fallbackModel} onChange={(e) => update({ fallbackModel: e.target.value })}>
          {FALLBACK_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <div className="cb-hint">主模型过载/限流时自动切换（缓解 429，仅 -p 模式）</div>
      </div>
      <button className="cb-btn" onClick={() => void handleSave()}>保存配置（新会话生效）</button>
      <div className="cb-hint" style={{ textAlign: 'center', minHeight: 16, marginTop: 6 }}>
        {saveMsg ? <span style={{ color: saveMsg.ok ? '#7BC47F' : '#FF8A9A' }}>{saveMsg.text}</span> : ''}
      </div>
    </div>
  )

  // ── Tab：会话（P2 提供）──────────────────────────────────────────────
  const sessionsTab = (
    <div className="cb-body">
      <div className="cb-card"><b>会话管理（P2 提供）</b><br />
        将包含：CLI 活动会话列表（codebuddy ps）、历史会话浏览与 resume 快捷入口、
        会话保留期提示（过期 resume 会静默新开）。</div>
      <div className="cb-card"><b>主对话的 CodeBuddy 会话</b><br />
        在对话流内管理——面板不复制主对话状态，避免双写分裂。</div>
    </div>
  )

  // ── Tab：工具（P2 提供）──────────────────────────────────────────────
  const toolsTab = (
    <div className="cb-body">
      <div className="cb-card"><b>工具集观察（P2 提供）</b><br />
        将包含：66 个内置工具的分类清单、各工具会话内调用统计、
        toolOverrides 声明编辑（icon/分类/标签精确化）。</div>
      <div className="cb-card"><b>当前已精确适配</b><br />
        Read / Write / Edit / Bash / Glob / Grep / WebFetch / WebSearch /<br />
        TaskCreate / TaskUpdate / TaskList / EnterPlanMode / ExitPlanMode / AskUserQuestion</div>
    </div>
  )

  const tabBody =
    tab === 'quick' ? quickTab : tab === 'config' ? configTab : tab === 'sessions' ? sessionsTab : toolsTab

  return (
    <div className="cb-root">
      <style>{CSS}</style>
      <div className="cb-tabs">
        {([['quick', '快捷'], ['config', '配置'], ['sessions', '会话'], ['tools', '工具']] as Array<[Tab, string]>).map(([t, label]) => (
          <button key={t} className={`cb-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tabBody}
    </div>
  )
}
