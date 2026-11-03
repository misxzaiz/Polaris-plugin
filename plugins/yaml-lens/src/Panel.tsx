/**
 * yaml-lens 面板：YAML → 解析预览（多文档/锚点）+ 坑检测（跨实现语义漂移）+ YAML↔JSON 转换。
 * 引擎与 MCP 同一权威：shared/yaml-core.js（扫描）+ js-yaml 4.1.0（解析基座）。
 * 纯本地零外联零 kv。
 */
import { useMemo, useState } from 'react'
import * as core from '../shared/yaml-core.js'
import yaml from 'js-yaml'

type View = 'parse' | 'lint' | 'convert'
/** js-yaml 异常归一后的结构化错误（shared/yaml-core.js 无 TS 类型，本地对齐） */
type YamlErrorInfo = { line: number | null; column: number | null; message: string; hint: string }

const CSS = `
.yl-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.yl-head{padding:10px 13px;border-bottom:1px solid #1c2333;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.yl-head b{font-size:13px}
.yl-head .sub{color:#5C6678;font-size:11px}
.yl-body{flex:1;overflow:auto;padding:10px 13px;display:flex;flex-direction:column;gap:10px}
.yl-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.yl-chip{cursor:pointer;background:#161c2a;border:1px solid #2b3348;border-radius:6px;color:#8B94A9;font:11px ui-monospace,Consolas,monospace;padding:3px 8px}
.yl-chip:hover{color:#E6EAF2;border-color:#4fd1a0}
.yl-chip.on{color:#4fd1a0;border-color:#4fd1a0}
.yl-chip.sample{border-style:dashed}
.yl-gap{flex:1}
.yl-area{width:100%;box-sizing:border-box;background:#161c2a;border:1px solid #2b3348;border-radius:8px;color:#E6EAF2;font:12px/1.7 ui-monospace,Consolas,monospace;padding:9px 10px;outline:none;resize:vertical}
.yl-area:focus{border-color:#4fd1a0}
.yl-line{font-size:12px;color:#c9cede}
.yl-line b{color:#4fd1a0}
.yl-line .muted,.muted{color:#5C6678}
.yl-card{border:1px solid #1c2333;border-radius:8px;overflow:hidden}
.yl-card h3{margin:0;padding:7px 12px;font-size:11px;color:#8B94A9;font-weight:600;border-bottom:1px solid #1c2333;background:#1a2030}
.yl-pre{margin:0;padding:10px 12px;font:11.5px/1.6 ui-monospace,Consolas,monospace;color:#c9cede;white-space:pre-wrap;word-break:break-all;max-height:420px;overflow:auto}
.yl-err{border-radius:8px;padding:10px 13px;font-size:12.5px;border:1px solid #e03131;background:#2b1215;color:#f1a0a0}
.yl-err .ttl{font-weight:600;margin-bottom:4px}
.yl-err .hint{color:#8B94A9;margin-top:4px;font-size:11.5px}
.yl-empty{border:1px dashed #2b3348;border-radius:8px;padding:10px 13px;color:#8B94A9;font-size:12px}
.yl-issue{border:1px solid #1c2333;border-left:3px solid #2b3348;border-radius:8px;padding:8px 11px}
.yl-issue.sev-error{border-left-color:#e03131}
.yl-issue.sev-warn{border-left-color:#f08c00}
.yl-issue.sev-info{border-left-color:#3b5bdb}
.yl-issue .row1{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.yl-issue .badge{font-size:10.5px;border:1px solid #2b3348;border-radius:5px;padding:1px 6px}
.yl-issue.sev-error .badge{color:#f1a0a0;border-color:#e03131}
.yl-issue.sev-warn .badge{color:#f3b377;border-color:#f08c00}
.yl-issue.sev-info .badge{color:#8B94A9;border-color:#3b5bdb}
.yl-issue .pos{font:11px ui-monospace,Consolas,monospace;color:#5C6678}
.yl-issue .rule{font:11px ui-monospace,Consolas,monospace;color:#4fd1a0}
.yl-issue .msg{font-size:12px;color:#c9cede;margin-top:3px}
.yl-issue .hint{font-size:11.5px;color:#5C6678;margin-top:2px}
.sev-err{color:#f1a0a0}
.sev-warn{color:#f3b377}
.sev-info{color:#8B94A9}
.yl-opt{display:flex;align-items:center;gap:4px;color:#8B94A9;font-size:11px}
.yl-opt select{background:#161c2a;color:#E6EAF2;border:1px solid #2b3348;border-radius:5px;font-size:11px;padding:1px 4px}
`

const SAMPLE_NORWAY = `# Norway problem：同一份文件在不同实现里类型相反
services:
  web:
    enabled: no        # js-yaml(1.2): "no" 字符串 / PyYAML(1.1): false
    debug: on          # 1.1 实现解析为 true
    replicas: 3
    fallback: "no"     # 加引号才是稳定字符串`

const SAMPLE_NUMBERS = `# 数字形态陷阱：前导零 / 版本号塌陷 / 六十进制
zip: 02134            # PyYAML 八进制 → 1116；js-yaml 十进制 → 2134
chmod: 0755           # 文件权限必须加引号
version: 1.10         # 解析成数值 1.1，尾零丢失
duration: 12:34:56    # PyYAML 解析为整数 45296
big_id: 9007199254740993   # 超 2^53，js-yaml → 9007199254740992`

const SAMPLE_TS = `# 时间戳漂移：长得像日期的值会被解析成 Date
build: 2024-01-02
released: 2024-01-02T03:04:05Z
build_code: "2024-01-02"   # 加引号保持字符串`

const SAMPLE_ANCHORS = `# 锚点与合并键
defaults: &d
  image: nginx
  restart: always
web:
  <<: *d
  ports: [80]
worker:
  <<: *d
  command: run
broken: *missing      # 未定义别名 → 解析报错`

const SAMPLE_WRITING = `# 书写陷阱：Tab / 智能引号 / 注释吞值 / 空值
good: value # 这里开始是注释，"它不是注释" 这段不会进入数据
empty:
tilde: ~
quoted: "x # y"       # 引号内的 # 安全
url: http://x#frag    # 无空格前缀的 # 也安全`

const SAMPLES: Array<{ label: string; text: string }> = [
  { label: 'Norway problem', text: SAMPLE_NORWAY },
  { label: '数字形态', text: SAMPLE_NUMBERS },
  { label: '时间戳漂移', text: SAMPLE_TS },
  { label: '锚点合并键', text: SAMPLE_ANCHORS },
  { label: '书写陷阱', text: SAMPLE_WRITING },
]

const SEV_LABEL: Record<string, string> = { error: '错误', warn: '警告', info: '提示' }

function tryParse(text: string): { ok: boolean; docs?: any[]; empty?: boolean; error?: YamlErrorInfo } {
  if (String(text).trim() === '') return { ok: true, docs: [], empty: true }
  try {
    const docs = yaml.loadAll(text) as unknown[]
    return { ok: true, docs: docs.map((d) => core.jsonSafe(d as any)) }
  } catch (e: any) {
    return { ok: false, error: core.normalizeYamlError(e) }
  }
}

function jsonPreview(value: unknown, limit = 4000): string {
  let s: string
  try {
    s = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    s = String(value)
  }
  if (s.length > limit) s = s.slice(0, limit) + `\n…（已截断，原文 ${s.length} 字符）`
  return s
}

export default function YamlLensPanel(props: {
  pluginId?: string
  initialText?: string
  initialView?: View
  initialDir?: 'y2j' | 'j2y'
  onSendToChat?: (m: string) => void
}) {
  const [text, setText] = useState<string>(props.initialText !== undefined ? props.initialText : SAMPLE_NORWAY)
  const [view, setView] = useState<View>(props.initialView !== undefined ? props.initialView : 'parse')
  const [dir, setDir] = useState<'y2j' | 'j2y'>(props.initialDir !== undefined ? props.initialDir : 'y2j')
  const [indent, setIndent] = useState(2)
  const [sortKeys, setSortKeys] = useState(false)

  const scan = useMemo(() => core.lintYaml(text), [text])
  const parsed = useMemo(() => tryParse(text), [text])

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 }
    for (const i of scan.issues) {
      // severity 来自 JS 核心（any），显式收窄避免 TS7053
      const key = i.severity as 'error' | 'warn' | 'info'
      if (key === 'error' || key === 'warn' || key === 'info') c[key]++
    }
    return c
  }, [scan])

  const convert = useMemo(() => {
    if (dir === 'y2j') {
      const r = parsed
      if (!r.ok) return { ok: false as const, text: '', error: r.error! }
      if (r.empty) return { ok: false as const, text: '', error: { line: null, column: null, message: '空文本没有可转换的文档', hint: '' } }
      const value = r.docs!.length === 1 ? r.docs![0] : r.docs!
      const note = r.docs!.length === 1 ? '' : `\n# 注：${r.docs!.length} 个文档已输出为 JSON 数组（按文档顺序）`
      return { ok: true as const, text: JSON.stringify(value, null, indent) + note, error: null }
    }
    try {
      const value = JSON.parse(text)
      const out = yaml.dump(value, { indent, sortKeys, lineWidth: -1, noRefs: true })
      return { ok: true as const, text: out, error: null }
    } catch (e: any) {
      return { ok: false as const, text: '', error: { line: null, column: null, message: `输入不是合法 JSON：${e?.message ?? String(e)}`, hint: '' } }
    }
  }, [dir, parsed, text, indent, sortKeys])

  const invParts: string[] = []
  if (scan.anchors.length) invParts.push(`锚点 ${scan.anchors.length}`)
  if (scan.aliases.length) invParts.push(`别名 ${scan.aliases.length}（${scan.aliases.filter((a) => a.resolved).length} 已解析）`)
  if (scan.merges > 0) invParts.push(`合并键 ×${scan.merges}`)

  return (
    <div className="yl-root">
      <style>{CSS}</style>
      <div className="yl-head">
        <b>YAML 调试台</b>
        <span className="sub">解析预览 · 坑检测 · JSON 互转（js-yaml 4.1.0，纯本地零外联）</span>
      </div>
      <div className="yl-body">
        <div className="yl-chips">
          {(['parse', 'lint', 'convert'] as View[]).map((v) => (
            <button key={v} className={'yl-chip' + (view === v ? ' on' : '')} onClick={() => setView(v)}>
              {v === 'parse' ? '解析预览' : v === 'lint' ? `坑检测${scan.issues.length ? ` (${scan.issues.length})` : ''}` : '转换'}
            </button>
          ))}
          <span className="yl-gap" />
          {SAMPLES.map((s) => (
            <button key={s.label} className="yl-chip sample" onClick={() => setText(s.text)}>
              {s.label}
            </button>
          ))}
        </div>

        <textarea
          className="yl-area"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'粘贴 YAML 文本…\n支持多文档（--- 分隔）'}
          rows={10}
        />

        {view === 'parse' && (
          <div className="yl-section" data-view="parse">
            {parsed.ok ? (
              parsed.empty ? (
                <div className="yl-empty">空文本：无文档。</div>
              ) : (
                <>
                  <div className="yl-line">
                    解析成功：<b>{parsed.docs!.length}</b> 个文档（{scan.stats.lines} 行 / {scan.stats.bytes} 字节）
                    {invParts.length > 0 && <span className="muted"> ｜ {invParts.join(' ｜ ')}</span>}
                  </div>
                  {scan.aliases.some((a) => !a.resolved) && (
                    <div className="yl-err">
                      存在未解析别名：{scan.aliases.filter((a) => !a.resolved).map((a) => `*${a.name}(${a.line}:${a.col})`).join(' ')}——见坑检测视图。
                    </div>
                  )}
                  {parsed.docs!.map((d: unknown, i: number) => (
                    <div className="yl-card" key={i}>
                      <h3>文档 {i + 1}{parsed.docs!.length === 1 ? '' : `（共 ${parsed.docs!.length} 个）`}</h3>
                      <pre className="yl-pre">{jsonPreview(d)}</pre>
                    </div>
                  ))}
                </>
              )
            ) : (
              <div className="yl-err">
                <div className="ttl">解析失败{parsed.error!.line ? `：第 ${parsed.error!.line} 行第 ${parsed.error!.column} 列` : ''}</div>
                <div>{parsed.error!.message}</div>
                {parsed.error!.hint && <div className="hint">{parsed.error!.hint}</div>}
              </div>
            )}
          </div>
        )}

        {view === 'lint' && (
          <div className="yl-section" data-view="lint">
            <div className="yl-line">
              静态扫描 <b>{scan.stats.lines}</b> 行 ——
              <span className="sev-err"> 错误 {counts.error}</span> ·<span className="sev-warn"> 警告 {counts.warn}</span> ·
              <span className="sev-info"> 提示 {counts.info}</span>
            </div>
            <div className="yl-line muted">
              解析状态：{parsed.empty ? '空文本' : parsed.ok ? '成功（js-yaml 4.1.0，YAML 1.2 core 语义）' : `失败${parsed.error!.line ? `（${parsed.error!.line}:${parsed.error!.column}）` : ''} —— 与坑扫描是两道独立闸`}
            </div>
            {scan.issues.length === 0 ? (
              <div className="yl-empty">未发现已知坑模式。注意：覆盖跨实现语义漂移与常见书写陷阱，不等于「语义正确」。</div>
            ) : (
              [...scan.issues]
                .slice()
                .sort((a, b) => {
                  const o = (s: string) => (s === 'error' ? 0 : s === 'warn' ? 1 : 2)
                  return o(a.severity) - o(b.severity) || a.line - b.line || a.col - b.col
                })
                .map((i, idx) => (
                  <div className={'yl-issue sev-' + i.severity} key={`${i.rule}-${idx}`}>
                    <div className="row1">
                      <span className="badge">{SEV_LABEL[i.severity]}</span>
                      <span className="pos">{i.line}:{i.col}</span>
                      <code className="rule">{i.rule}</code>
                    </div>
                    <div className="msg">{i.message}</div>
                    {i.hint && <div className="hint">→ {i.hint}</div>}
                  </div>
                ))
            )}
          </div>
        )}

        {view === 'convert' && (
          <div className="yl-section" data-view="convert">
            <div className="yl-chips">
              <button className={'yl-chip' + (dir === 'y2j' ? ' on' : '')} onClick={() => setDir('y2j')}>YAML → JSON</button>
              <button className={'yl-chip' + (dir === 'j2y' ? ' on' : '')} onClick={() => setDir('j2y')}>JSON → YAML</button>
              <span className="yl-gap" />
              <label className="yl-opt">
                缩进
                <select value={indent} onChange={(e) => setIndent(Number(e.target.value))}>
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                </select>
              </label>
              {dir === 'j2y' && (
                <label className="yl-opt">
                  <input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} />
                  按键排序
                </label>
              )}
            </div>
            {convert.ok ? (
              <div className="yl-card">
                <h3>{dir === 'y2j' ? 'JSON 输出' : 'YAML 输出'}（dump：不折行 / noRefs 展开共享引用）</h3>
                <pre className="yl-pre">{convert.text}</pre>
              </div>
            ) : (
              <div className="yl-err">
                <div className="ttl">转换失败</div>
                <div>{convert.error!.message}</div>
                {convert.error!.hint && <div className="hint">{convert.error!.hint}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
