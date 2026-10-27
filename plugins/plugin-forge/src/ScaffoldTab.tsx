/**
 * 脚手架 Tab：填表 → 生成生产级骨架 → 预览/复制单文件。
 * 落盘走 MCP 工具 forge_scaffold（面板无 fs）；本页给出可直接发给 AI 的指令。
 */
import React, { useEffect, useMemo, useState } from 'react'
import { buildManifest, buildScaffold, VALID_PLUGIN_ICONS } from '../shared/forge-core'
import { TEMPLATES, TPL_MAP } from './scaffoldTpls'
import { copyText, loadForgeSettings, saveForgeSettings, type ForgeSettings } from './model'

const S = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' as const },
  input: {
    padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--p-border, rgba(128,128,128,.3))',
    background: 'transparent', color: 'inherit', fontSize: 13,
  },
  btn: {
    padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'var(--p-accent, #4a7dff)', color: '#fff',
  },
  btnGhost: {
    padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--p-border, rgba(128,128,128,.3))', background: 'transparent', color: 'inherit',
  },
  fileList: { display: 'flex', flexWrap: 'wrap' as const, gap: 6 },
  fileChip: {
    padding: '3px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
    background: 'var(--p-chip, rgba(128,128,128,.15))', fontFamily: 'monospace',
  },
  fileChipActive: {
    padding: '3px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
    background: 'var(--p-accent, #4a7dff)', color: '#fff', fontFamily: 'monospace',
  },
  content: {
    padding: 12, borderRadius: 8, background: 'var(--p-panel, rgba(128,128,128,.08))',
    whiteSpace: 'pre-wrap' as const, fontFamily: 'monospace', fontSize: 11.5,
    lineHeight: 1.6, maxHeight: 320, overflowY: 'auto' as const,
  },
  label: { fontSize: 12, color: 'var(--p-text-dim, #999)' },
}

export interface ScaffoldSpec {
  id: string
  name: string
  prefix: string
  icon: string
  order: number
  withService: boolean
  withMcp: boolean
  description: string
}

export function buildScaffoldFiles(spec: ScaffoldSpec) {
  const camel = spec.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  const manifest = buildManifest({ ...spec, panelType: camel, labelKey: `plugins.${camel}` })
  const templates: Record<string, string> = { ...TEMPLATES }
  // plugin.json 由 buildManifest 程序化生成（与体检规则自洽），不走模板
  const { files, warnings } = buildScaffold(
    { ...templates, 'plugin.json': JSON.stringify(manifest, null, 2) },
    {
      id: spec.id, name: spec.name, prefix: spec.prefix, icon: spec.icon,
      order: spec.order, withService: spec.withService, withMcp: spec.withMcp,
      panelType: camel,
      labelKey: `plugins.${camel}`,
    },
  )
  // 模板集里 plugin.json 不走模板（程序化生成）；其余模板文件名经 TPL_MAP 映射为目标路径
  return {
    files: files.map((f) => (f.path === 'plugin.json'
      ? { path: 'plugin.json', content: f.content }
      : { path: TPL_MAP[f.path] || f.path, content: f.content })),
    warnings,
    manifest,
  }
}

export default function ScaffoldTab({ onSendToChat }: { onSendToChat?: (m: string) => void | Promise<void> }) {
  const [spec, setSpec] = useState<ScaffoldSpec>({
    id: '', name: '', prefix: '', icon: 'Beaker', order: 80,
    withService: true, withMcp: true, description: '',
  })
  const [dir, setDir] = useState('')
  const [sel, setSel] = useState('')
  const [copied, setCopied] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    loadForgeSettings().then((s: ForgeSettings) => {
      setDir(s.scaffoldDir)
      setSpec((p) => ({ ...p, icon: s.defaultIcon || p.icon, order: s.defaultOrder || p.order }))
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [])

  const idOk = /^[a-z][a-z0-9-]*$/.test(spec.id)
  const built = useMemo(() => (idOk && spec.id ? buildScaffoldFiles(spec) : null), [spec, idOk])

  const persist = async (next: Partial<ForgeSettings>) => {
    try {
      const cur = await loadForgeSettings()
      await saveForgeSettings({ ...cur, ...next })
    } catch (_) { /* 设置记忆失败不影响主功能 */ }
  }

  const files = built?.files ?? []
  const selFile = files.find((f) => f.path === sel) || files[0]
  const dirLine = dir ? dir.replace(/[\\/]+$/, '') + '\\' + spec.id : `<仓库根>\\plugins\\${spec.id || '<id>'}`

  const aiMsg = `请用 forge_scaffold 工具生成插件骨架并落盘：id=${spec.id || '<id>'}，name=${spec.name || '<名>'}，icon=${spec.icon}，withService=${spec.withService}，withMcp=${spec.withMcp}，dir=${dirLine}，confirm=true。生成后按插件工坊知识库 workflow 主题继续实现业务。`

  return (
    <div style={S.wrap}>
      <div style={S.row}>
        <span style={S.label}>插件 id</span>
        <input style={{ ...S.input, width: 150, fontFamily: 'monospace' }} placeholder="my-plugin" value={spec.id}
          onChange={(e) => setSpec({ ...spec, id: e.target.value.trim().toLowerCase() })} />
        <span style={S.label}>名称</span>
        <input style={{ ...S.input, width: 110 }} placeholder="中文名" value={spec.name}
          onChange={(e) => setSpec({ ...spec, name: e.target.value })} />
        <span style={S.label}>kv 前缀</span>
        <input style={{ ...S.input, width: 110, fontFamily: 'monospace' }} placeholder="默认取 id" value={spec.prefix}
          onChange={(e) => setSpec({ ...spec, prefix: e.target.value.trim() })} />
        <span style={S.label}>图标</span>
        <select style={S.input} value={spec.icon} onChange={(e) => { setSpec({ ...spec, icon: e.target.value }); persist({ defaultIcon: e.target.value }) }}>
          {VALID_PLUGIN_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={spec.withService} onChange={(e) => setSpec({ ...spec, withService: e.target.checked })} />
          <span style={S.label}>后台服务</span>
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={spec.withMcp} onChange={(e) => setSpec({ ...spec, withMcp: e.target.checked })} />
          <span style={S.label}>MCP</span>
        </label>
      </div>
      <div style={S.row}>
        <span style={S.label}>目标目录（落盘用，面板只预览）</span>
        <input style={{ ...S.input, flex: 1, minWidth: 220, fontFamily: 'monospace' }}
          placeholder="D:\space\base\Polaris-plugin\plugins" value={dir}
          onChange={(e) => { setDir(e.target.value); persist({ scaffoldDir: e.target.value }) }} />
      </div>
      {!idOk && spec.id && <div style={{ color: 'rgba(220,80,80,.9)', fontSize: 12 }}>id 必须是小写字母开头，仅小写字母/数字/连字符</div>}
      {built && (
        <>
          <div style={S.row}>
            <span style={S.label}>{files.length} 个文件</span>
            {built.warnings.map((w, i) => <span key={i} style={{ color: 'rgba(230,170,40,.9)', fontSize: 12 }}>⚠ {w}</span>)}
          </div>
          <div style={S.fileList}>
            {files.map((f) => (
              <span key={f.path} style={f.path === selFile?.path ? S.fileChipActive : S.fileChip}
                onClick={() => setSel(f.path)}>{f.path}</span>
            ))}
          </div>
          <div style={S.content}>{selFile?.content}</div>
          <div style={S.row}>
            <button style={S.btnGhost} onClick={async () => {
              if (!selFile) return
              const r = await copyText(selFile.content)
              setCopied(r === 'copied' ? `已复制 ${selFile.path}` : '弹窗复制')
            }}>复制当前文件</button>
            {copied && <span style={S.label}>{copied}</span>}
            {onSendToChat && (
              <button style={S.btn} onClick={() => onSendToChat(aiMsg)}>发给 AI 落盘生成</button>
            )}
          </div>
          {onSendToChat && settingsLoaded && (
            <div style={{ ...S.label, lineHeight: 1.6 }}>
              落盘指令（也可在聊天里直接说）：「{aiMsg.length > 90 ? aiMsg.slice(0, 90) + '…' : aiMsg}」
            </div>
          )}
        </>
      )}
    </div>
  )
}
