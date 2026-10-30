/**
 * 设置 Tab：需求库根目录（探测/保存并创建）+ 服务状态。
 * 源码模式（ZCode --needs-root）下保存会明确拒绝——如实展示来源。
 */
import { useCallback, useEffect, useState } from 'react'
import { apiConfig, apiProbe, type ConfigInfo, type NeedsMeta } from './model'

export default function SettingsTab({ meta }: { meta: NeedsMeta }) {
  const [info, setInfo] = useState<ConfigInfo | null>(null)
  const [root, setRoot] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const c = await apiConfig(meta)
      setInfo(c)
      setRoot(c.root)
    } catch (e) { setError(String((e as Error).message)) }
  }, [meta])

  useEffect(() => { load() }, [load])

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(String((e as Error).message)) } finally { setBusy('') }
  }

  const probe = () => run('probe', async () => {
    const r = await apiProbe(meta, root)
    setNotice(r.exists ? (r.isDir ? '✓ 目录存在可用' : '✗ 路径存在但不是目录') : '目录不存在——保存时会自动创建')
  })

  const save = () => run('save', async () => {
    const c = await apiConfig(meta, root)
    setInfo(c)
    setNotice(`已保存并创建：${c.root}`)
  })

  const sourceLabel: Record<string, string> = {
    arg: '--needs-root 参数（源码/命令行模式）',
    config: 'needs-root.json 配置',
    default: '源码仓缺省探测',
  }

  return (
    <div className="nd-body">
      {notice && <div className="nd-ok">{notice}</div>}
      {error && <div className="nd-alert bad">{error}</div>}
      <div className="nd-card"><div className="nd-card-b">
        <label className="nd-lbl">需求库根目录（公约 README.md 所在地）</label>
        <input className="nd-inp" data-testid="root-input" value={root} onChange={(e) => setRoot(e.target.value)}
          placeholder="如 D:\space\base\Polaris-plugin\needs" />
        <div className="nd-row" style={{ marginTop: 8 }}>
          <button className="nd-btn sm ghost" disabled={busy === 'probe'} onClick={probe}>探测</button>
          <button className="nd-btn sm" disabled={busy === 'save' || !root.trim()} onClick={save}>保存并创建</button>
        </div>
        {info && (
          <div className="nd-sub" style={{ marginTop: 10 }}>
            当前：{info.root}<br />
            来源：{sourceLabel[info.source] || info.source} · 条目 {info.entryCount}
            {info.hasReadme ? '' : ' · ⚠ 缺 README.md 公约'}
            {info.hasPrompts === false ? ' · ⚠ 缺 prompts/ 提示词模板' : ''}
          </div>
        )}
      </div></div>
      <div className="nd-card"><div className="nd-card-b">
        <label className="nd-lbl">服务状态</label>
        <div className="nd-sub">
          数据面：127.0.0.1:{meta.port}（经宿主 cap.http 转发，跨端免跨域；token 已注入 cap.kv needs.meta）<br />
          面板版本：{meta.version || '?'} · MCP 六工具与夜班 automation 共用同一逻辑核<br />
          ZCode 侧不经面板：.zcode/config.json 以 --needs-root 直连源码目录
        </div>
      </div></div>
    </div>
  )
}
