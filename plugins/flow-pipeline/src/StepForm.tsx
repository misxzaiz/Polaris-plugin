/**
 * StepForm.tsx —— 单步骤编辑表单（按 type 渲染对应字段组）
 */
import React from 'react'
import type { Step, Provider } from './model'
import { MASK } from './model'
import { Field } from './ui'

const STEP_TYPES: Array<{ v: Step['type']; label: string }> = [
  { v: 'http', label: 'HTTP 请求' },
  { v: 'mcp', label: 'MCP 工具' },
  { v: 'ai', label: 'AI 调用' },
  { v: 'extract', label: '提取字段' },
  { v: 'template', label: '模板文本' },
  { v: 'script', label: '脚本片段' },
  { v: 'kv', label: 'KV 存储' },
  { v: 'file', label: '写文件' },
  { v: 'notify', label: 'Webhook 通知' },
]

function jsonText(v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch (_) { return '' }
}

export default function StepForm({ step, onChange, providers, allowLocal }: {
  step: Step
  onChange: (patch: Partial<Step>) => void
  providers: Provider[]
  allowLocal: boolean
}): JSX.Element {
  const t = step.type
  return (
    <div>
      <div className="fp-row">
        <div style={{ width: 150 }}>
          <Field label="步骤类型">
            <select
              value={t}
              onChange={(e) => {
                const v = e.target.value as Step['type']
                const next: Step = { ...step, type: v }
                // 换类型时清掉不通用字段，保留 id/name/when/saveAs/continueOnError
                for (const k of ['method', 'url', 'headers', 'body', 'timeoutSec', 'serverId', 'tool', 'arguments', 'providerId', 'prompt', 'system', 'from', 'paths', 'text', 'code', 'action', 'key', 'value', 'path', 'content', 'payload'] as const) {
                  delete next[k]
                }
                onChange(next as Partial<Step>)
              }}
            >
              {STEP_TYPES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="步骤名（可选）">
            <input value={step.name || ''} onChange={(e) => onChange({ name: e.target.value })} placeholder="给这步起个名字" />
          </Field>
        </div>
      </div>

      {t === 'http' && (
        <>
          <div className="fp-grid3">
            <Field label="Method">
              <select value={step.method || 'GET'} onChange={(e) => onChange({ method: e.target.value })}>
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <div style={{ gridColumn: 'span 2' }}>
              <Field label="URL" hint="支持 {{占位符}}">
                <input value={step.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://api.example.com/v1/data" />
              </Field>
            </div>
          </div>
          <Field label="Headers（JSON，可选）" hint='{"Authorization": "Bearer {{vars.token}}"}'>
            <textarea rows={2} value={jsonText(step.headers)} onChange={(e) => { try { onChange({ headers: e.target.value.trim() ? JSON.parse(e.target.value) : undefined }) } catch (_) { /* 输入中暂不报错 */ } }} />
          </Field>
          {!['GET', 'HEAD'].includes(step.method || 'GET') && (
            <Field label="Body（JSON 对象或字符串，可选）">
              <textarea rows={3} value={step.body ?? ''} onChange={(e) => onChange({ body: e.target.value })} />
            </Field>
          )}
          <div className="fp-grid2">
            <Field label="超时（秒，2-120）">
              <input type="number" min={2} max={120} value={step.timeoutSec ?? 30} onChange={(e) => onChange({ timeoutSec: Number(e.target.value) })} />
            </Field>
            <Field label="失败时继续" hint="开启后此步失败不中断流水线">
              <select value={step.continueOnError ? '1' : '0'} onChange={(e) => onChange({ continueOnError: e.target.value === '1' })}>
                <option value="0">失败即停（默认）</option>
                <option value="1">继续执行后续步骤</option>
              </select>
            </Field>
          </div>
          {!allowLocal && <div className="fp-muted" style={{ marginBottom: 6 }}>⚠ 默认禁止私网/环回目标（SSRF 围栏）；要调本机服务请在流水线级开「允许本机/内网目标」。</div>}
        </>
      )}

      {t === 'mcp' && (
        <>
          <Field label="serverId" hint="宿主已注册的 MCP server 标识（cap.mcp 可查）">
            <input value={step.serverId || ''} onChange={(e) => onChange({ serverId: e.target.value })} placeholder="如 domain-probe" />
          </Field>
          <Field label="工具名 tool">
            <input value={step.tool || ''} onChange={(e) => onChange({ tool: e.target.value })} placeholder="如 domain_probe_scan" />
          </Field>
          <Field label="arguments（JSON 对象，支持 {{占位符}}）">
            <textarea rows={3} value={jsonText(step.arguments)} onChange={(e) => { try { onChange({ arguments: e.target.value.trim() ? JSON.parse(e.target.value) : {} }) } catch (_) { /* 输入中 */ } }} />
          </Field>
          <div className="fp-muted" style={{ marginBottom: 6 }}>宿主任意已装插件的 MCP 工具都可直接当步骤调；工具名/参数可在聊天里问 AI（flow 系工具）或 MCP 调试台。</div>
        </>
      )}

      {t === 'ai' && (
        <>
          <Field label="供应商（设置 → AI 供应商里配置/导入）">
            <select value={step.providerId || ''} onChange={(e) => onChange({ providerId: e.target.value })}>
              <option value="">— 选择供应商 —</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.model}）</option>)}
            </select>
          </Field>
          <Field label="Prompt" hint="支持 {{占位符}}，如 {{resp.json}}">
            <textarea rows={4} value={step.prompt || ''} onChange={(e) => onChange({ prompt: e.target.value })} placeholder="总结以下内容的核心信息：{{resp.body}}" />
          </Field>
          <div className="fp-grid2">
            <Field label="System（可选）">
              <input value={step.system || ''} onChange={(e) => onChange({ system: e.target.value })} />
            </Field>
            <Field label="maxTokens">
              <input type="number" min={16} max={8192} value={step.maxTokens ?? 2048} onChange={(e) => onChange({ maxTokens: Number(e.target.value) })} />
            </Field>
          </div>
        </>
      )}

      {t === 'extract' && (
        <>
          <Field label="来源 from" hint="某个前置步骤的 saveAs 名">
            <input value={step.from || ''} onChange={(e) => onChange({ from: e.target.value })} placeholder="resp" />
          </Field>
          <Field label="提取路径（JSON：输出名: 路径）" hint={'路径支持 a.b.0 / items[*].id / list[?status=open]'}>
            <textarea rows={3} value={jsonText(step.paths)} onChange={(e) => { try { onChange({ paths: e.target.value.trim() ? JSON.parse(e.target.value) : {} }) } catch (_) { /* 输入中 */ } }} />
          </Field>
        </>
      )}

      {t === 'template' && (
        <Field label="模板文本" hint="整串 {{var}} 保留原类型；嵌入文本会字符串化">
          <textarea rows={4} value={step.text || ''} onChange={(e) => onChange({ text: e.target.value })} placeholder={'今日数据：{{resp.json}}\n日期：{{env.today}}'} />
        </Field>
      )}

      {t === 'script' && (
        <Field label="JS 片段（vm 沙箱，2s 超时；可用 vars/params/steps，最后 return）">
          <textarea rows={5} value={step.code || ''} onChange={(e) => onChange({ code: e.target.value })} placeholder={'const n = (steps.resp && steps.resp.json && steps.resp.json.count) || 0\nreturn { count: n, flag: n > 10 }'} />
        </Field>
      )}

      {t === 'kv' && (
        <div className="fp-grid3">
          <Field label="action">
            <select value={step.action || 'get'} onChange={(e) => onChange({ action: e.target.value })}>
              <option value="get">get</option>
              <option value="set">set</option>
              <option value="del">del</option>
            </select>
          </Field>
          <Field label="key">
            <input value={step.key || ''} onChange={(e) => onChange({ key: e.target.value })} placeholder="flowpipe 命名空间外的键请自担冲突" />
          </Field>
          {step.action !== 'get' && step.action !== 'del' && (
            <Field label="value">
              <input value={typeof step.value === 'string' ? step.value : jsonText(step.value)} onChange={(e) => onChange({ value: e.target.value })} />
            </Field>
          )}
        </div>
      )}

      {t === 'file' && (
        <>
          <div className="fp-grid3">
            <Field label="action">
              <select value={step.action || 'write'} onChange={(e) => onChange({ action: e.target.value })}>
                <option value="write">write</option>
                <option value="append">append</option>
              </select>
            </Field>
            <div style={{ gridColumn: 'span 2' }}>
              <Field label="路径" hint="白名单：面板输出目录 / 桌面 / 临时目录；相对路径默认落输出目录">
                <input value={step.path || ''} onChange={(e) => onChange({ path: e.target.value })} placeholder="reports/daily-{{env.today}}.md" />
              </Field>
            </div>
          </div>
          <Field label="内容" hint="字符串原样；对象自动 JSON 美化；支持 {{占位符}}">
            <textarea rows={4} value={typeof step.content === 'string' ? step.content : jsonText(step.content)} onChange={(e) => onChange({ content: e.target.value })} />
          </Field>
        </>
      )}

      {t === 'notify' && (
        <>
          <Field label="Webhook URL" hint="钉钉/企微/飞书/Bark 机器人地址">
            <input value={step.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
          </Field>
          <Field label="payload（JSON）" hint="钉钉: {msgtype:'text',text:{content:'...'}}">
            <textarea rows={3} value={jsonText(step.payload)} onChange={(e) => { try { onChange({ payload: e.target.value.trim() ? JSON.parse(e.target.value) : undefined }) } catch (_) { /* 输入中 */ } }} />
          </Field>
        </>
      )}

      <div className="fp-grid2">
        <Field label="输出保存为 saveAs" hint="后续步骤用 {{这个名字}} 引用">
          <input value={step.saveAs || ''} onChange={(e) => onChange({ saveAs: e.target.value })} placeholder="resp" />
        </Field>
        <Field label="执行门控 when（可选）" hint={'如 {{resp.ok}} == false'}>
          <input value={step.when || ''} onChange={(e) => onChange({ when: e.target.value })} placeholder="留空 = 总是执行" />
        </Field>
      </div>
      {step.saveAs === MASK && <div className="fp-err">saveAs 不允许使用保留字</div>}
    </div>
  )
}
