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

// ── 样式（窄容器 200-600px，深色主题）──────────────────────────────────
const CSS = `
.cb-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.cb-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.cb-tabs{display:flex;gap:2px;padding:8px 10px 0;flex-shrink:0}
.cb-tab{flex:1;background:transparent;border:none;color:#8B95A7;font-size:11.5px;padding:6px 4px;border-radius:7px;cursor:pointer;font-weight:600}
.cb-tab:hover{color:#E6EAF2}
.cb-tab.on{background:#1C2330;color:#E6EAF2}
.cb-body{flex:1;overflow-y:auto;padding:10px 12px;min-height:0}
.cb-body::-webkit-scrollbar{width:8px;height:8px}
.cb-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:4px;border:2px solid transparent;background-clip:content-box}
.cb-sec{font-size:11px;font-weight:700;color:#8B95A7;padding:8px 0 4px;display:flex;align-items:center;gap:6px}
.cb-bar{width:3px;height:12px;border-radius:2px;background:linear-gradient(180deg,#5EA8FF,#3B6FE0);flex-shrink:0}
.cb-field{margin-bottom:10px}
.cb-label{font-size:11.5px;color:#B8C0CC;display:block;margin-bottom:3px}
.cb-hint{font-size:10px;color:#5C6678;margin-top:2px;line-height:1.4}
.cb-input,.cb-select{width:100%;background:#161B22;border:1px solid #242C3A;border-radius:7px;color:#E6EAF2;font-size:12px;padding:6px 9px;outline:none}
.cb-input:focus,.cb-select:focus{border-color:#3B6FE0}
.cb-btn{background:#2E5FC0;border:none;color:#fff;border-radius:7px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.cb-btn:hover{filter:brightness(1.12)}
.cb-btn:disabled{opacity:.45;cursor:not-allowed}
.cb-quick{display:flex;flex-direction:column;gap:6px;padding-bottom:8px}
.cb-quick button{background:#161B22;border:1px solid #242C3A;color:#E6EAF2;border-radius:9px;padding:9px 12px;font-size:12px;cursor:pointer;text-align:left;line-height:1.45}
.cb-quick button:hover{border-color:#3B6FE0;background:#1C2330}
.cb-quick button b{display:block;font-size:12px;margin-bottom:2px}
.cb-quick button small{color:#8B95A7;font-size:10.5px}
.cb-card{background:#161B22;border:1px solid #242C3A;border-radius:9px;padding:8px 10px;margin-bottom:8px;font-size:11.5px;color:#B8C0CC;line-height:1.6}
.cb-card b{color:#E6EAF2}
`

type Tab = 'quick' | 'config' | 'sessions' | 'tools'

/** 快捷指令（发送到主对话，经 onSendToChat 桥） */
const QUICK_PROMPTS: Array<{ title: string; desc: string; prompt: string }> = [
  { title: '代码审查', desc: '审查当前工作区最近改动', prompt: '审查当前工作区最近的代码改动，按严重度列出问题与修复建议。' },
  { title: '写单元测试', desc: '为指定文件生成测试', prompt: '为以下文件编写单元测试，覆盖边界条件：\n\n（指定文件路径）' },
  { title: '重构建议', desc: '指定文件的重构方案', prompt: '分析以下文件的结构问题并给出重构方案（保持行为不变）：\n\n（指定文件路径）' },
  { title: '排查报错', desc: '粘贴报错信息定位问题', prompt: '帮我排查这个报错，给出根因与修复步骤：\n\n（粘贴报错信息）' },
]

const EFFORT_OPTIONS = ['', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
const PERM_OPTIONS = ['bypassPermissions', 'acceptEdits', 'default', 'plan', 'dontAsk', 'auto']
const AUTOCOMPACT_OPTIONS = ['', 'auto', '400k', '1m']
const FALLBACK_OPTIONS = ['', 'hy4free', 'hy4std', 'hy3', 'deepseek-v4.1-flash']

export default function CodeBuddyPanel({ onSendToChat }: { pluginId: string; onSendToChat?: (message: string) => void | Promise<void> }): JSX.Element {
  const [tab, setTab] = useState<Tab>('quick')
  const [cfg, setCfg] = useState<PanelConfig>({
    model: '', effort: '', permissionMode: 'bypassPermissions',
    maxTurns: '', autocompact: '', fallbackModel: '', daemonEnabled: false,
  })
  const [loaded, setLoaded] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    void loadPanelConfig().then((c) => { setCfg(c); setLoaded(true) })
  }, [])

  const update = (patch: Partial<PanelConfig>) => setCfg((prev) => ({ ...prev, ...patch }))

  const handleSave = useCallback(async () => {
    setSaveMsg('保存中…')
    try {
      await savePanelConfig(cfg)
      setSaveMsg('✓ 已保存（新会话生效）')
    } catch (e) {
      setSaveMsg('✗ ' + String((e as Error).message).slice(0, 60))
    }
    setTimeout(() => setSaveMsg(''), 2500)
  }, [cfg])

  const sendToChatSafe = (text: string) => {
    if (onSendToChat) void onSendToChat(text)
  }

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} className={`cb-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{label}</button>
  )

  // ── Tab：快捷指令 ────────────────────────────────────────────────────
  const quickTab = (
    <div className="cb-body">
      <div className="cb-card">
        <b>当前配置摘要</b><br />
        模型：<b>{cfg.model || '引擎默认'}</b> · 努力级别：<b>{cfg.effort || '默认'}</b> · 权限：<b>{cfg.permissionMode}</b>
        {cfg.fallbackModel ? <> · 备用：<b>{cfg.fallbackModel}</b></> : null}
      </div>
      <div className="cb-sec"><span className="cb-bar" />快捷指令<span className="cb-hint">点击发送到主对话</span></div>
      <div className="cb-quick">
        {QUICK_PROMPTS.map((q) => (
          <button key={q.title} onClick={() => sendToChatSafe(q.prompt)}>
            <b>{q.title}</b><small>{q.desc}</small>
          </button>
        ))}
      </div>
      <div className="cb-sec"><span className="cb-bar" />自定义指令</div>
      <textarea className="cb-textarea" id="cb-custom" rows={3} placeholder="输入自定义指令，点下方按钮发送到主对话" />
      <div style={{ padding: '6px 0' }}>
        <button className="cb-btn" id="cb-send-custom" style={{ width: '100%' }} onClick={() => {
          const el = document.getElementById('cb-custom') as HTMLTextAreaElement | null
          const text = el?.value.trim()
          if (text) { sendToChatSafe(text); if (el) el.value = '' }
        }}>发送到主对话</button>
      </div>
    </div>
  )

  // ── Tab：配置 ────────────────────────────────────────────────────────
  const configTab = (
    <div className="cb-body">
      <div className="cb-field">
        <label className="cb-label">模型（--model）</label>
        <input className="cb-input" value={cfg.model} placeholder="hy4free（空=引擎默认）"
          onChange={(e) => update({ model: e.target.value })} />
        <div className="cb-hint">常用：hy4free / hy4std / hy3 / deepseek-v4.1-flash</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">努力级别（--effort）</label>
        <select value={cfg.effort} onChange={(e) => update({ effort: e.target.value })}>
          {EFFORT_OPTIONS.map((v) => <option key={v} value={v}>{v || '不设置'}</option>)}
        </select>
        <div className="cb-hint">思考力度：minimal 最快，max 最高质量</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">权限模式（--permission-mode）</label>
        <select value={cfg.permissionMode} onChange={(e) => update({ permissionMode: e.target.value })}>
          {PERM_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <div className="cb-hint">跳过权限（高风险）仅建议隔离环境使用</div>
      </div>
      <div className="cb-sec"><span className="cb-bar" />上下文与容错</div>
      <div className="cb-field">
        <label className="cb-label">最大轮数（--max-turns）</label>
        <input className="cb-input" value={cfg.maxTurns} placeholder="不限" inputMode="numeric"
          onChange={(e) => update({ maxTurns: e.target.value.replace(/\D/g, '') })} />
        <div className="cb-hint">限制 agent 自动执行轮数，防失控</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">自动压缩窗口（--autocompact）</label>
        <select value={cfg.autocompact} onChange={(e) => update({ autocompact: e.target.value })}>
          {AUTOCOMPACT_OPTIONS.map((v) => <option key={v} value={v}>{v || '不设置'}</option>)}
        </select>
        <div className="cb-hint">上下文达到阈值自动压缩</div>
      </div>
      <div className="cb-field">
        <label className="cb-label">备用模型（--fallback-model）</label>
        <select value={cfg.fallbackModel} onChange={(e) => update({ fallbackModel: e.target.value })}>
          {FALLBACK_OPTIONS.map((v) => <option key={v} value={v}>{v || '不设置'}</option>)}
        </select>
        <div className="cb-hint">主模型过载/限流时自动切换（缓解 429）</div>
      </div>
      <button className="cb-btn" style={{ width: '100%' }} onClick={() => void handleSave()}>保存配置</button>
      <div className="cb-hint" style={{ textAlign: 'center', minHeight: 14 }}>{saveMsg}</div>
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

  if (!loaded) {
    return (
      <div className="cb-root">
        <style>{CSS}</style>
        <div className="cb-empty"><span className="cb-spin" />加载配置…</div>
      </div>
    )
  }

  return (
    <div className="cb-root">
      <style>{CSS}</style>
      <div className="cb-tabs">
        {tabBtn('quick', '快捷')}{tabBtn('config', '配置')}{tabBtn('sessions', '会话')}{tabBtn('tools', '工具')}
      </div>
      {tab === 'quick' ? quickTab : tab === 'config' ? configTab : tab === 'sessions' ? sessionsTab : toolsTab}
    </div>
  )
}
