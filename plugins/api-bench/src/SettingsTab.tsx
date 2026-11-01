/**
 * 设置页：默认参数（连接/时长/超时）+ 服务状态 + 护栏说明。
 * 默认参数写 cap.kv api-bench.settings（服务启动时读取，运行中也可改）。
 */
import { useEffect, useState } from 'react'
import { opAction, type BenchSettings, type ServiceMeta } from './model'

interface SettingsTabProps {
  meta: ServiceMeta | null
  settings: BenchSettings | null
  onRefresh: () => void
}

export default function SettingsTab({ meta, settings, onRefresh }: SettingsTabProps) {
  const [local, setLocal] = useState<BenchSettings>(settings || { connections: 10, durationS: 10, timeoutS: 10 })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (settings) setLocal(settings)
  }, [settings])

  const save = async () => {
    if (!meta) return
    try {
      const r = await opAction(meta, 'settings_set', local)
      setMsg(r.ok ? '已保存（下一次压测的默认值）' : (r.error || '保存失败'))
      onRefresh()
    } catch (e) {
      setMsg(String((e as Error).message || e))
    }
  }

  return (
    <>
      <div className="ab-sec">服务状态</div>
      <div className="ab-card"><div className="ab-card-b ab-kv">
        <dt>状态</dt><dd>{meta ? (meta.degraded ? <span className="ab-warn">降级：{meta.lastBridgeErr || '桥不可达（健康端点仍在线）'}</span> : <span className="ab-ok">在线</span>) : '未连接（打开面板等待心跳，或首次使用先在宿主中启用本插件）'}</dd>
        <dt>版本</dt><dd className="ab-num">{meta?.version || '—'}</dd>
        <dt>端口</dt><dd className="ab-num">{meta ? `127.0.0.1:${meta.port}` : '—'}</dd>
        <dt>token</dt><dd className="ab-num">{meta ? `****${meta.token.slice(-4)}（存于 cap.kv api-bench.meta）` : '—'}</dd>
      </div></div>

      <div className="ab-sec">默认压测参数<span className="ab-hint">新压测的初始值；AI 压测未指定参数时也用这套</span></div>
      <div className="ab-card"><div className="ab-card-b">
        <div className="ab-fmgrid">
          <label>并发连接</label>
          <input className="ab-inp" type="number" min={1} max={1000} value={local.connections}
            onChange={(e) => setLocal({ ...local, connections: Number(e.target.value) || 1 })} />
          <label>持续秒数</label>
          <input className="ab-inp" type="number" min={1} max={300} value={local.durationS}
            onChange={(e) => setLocal({ ...local, durationS: Number(e.target.value) || 1 })} />
          <label>请求超时</label>
          <div className="ab-unitwrap"><input className="ab-inp" type="number" min={0.5} max={60} step={0.5} value={local.timeoutS}
            onChange={(e) => setLocal({ ...local, timeoutS: Number(e.target.value) || 10 })} /><span>秒</span></div>
        </div>
        <div className="ab-btnrow">
          <button className="ab-btn" onClick={save} disabled={!meta}>保存</button>
          {msg && <span className="ab-sub">{msg}</span>}
        </div>
      </div></div>

      <div className="ab-sec">护栏与边界</div>
      <div className="ab-card"><div className="ab-card-b ab-sub" style={{ lineHeight: 1.8 }}>
        · 护栏：连接数 ≤ 1000、时长 ≤ 300s、body ≤ 1MB、同一时刻只跑一个压测（可中止）。<br />
        · 敏感头（Authorization/Cookie 等）在报告与历史中自动掩码（****后4位）；完整值只在服务内存中用于当次请求。<br />
        · 服务只监听 127.0.0.1 + token；压测目标不限本机，但公网目标请确认你拥有压测授权（工具与 ab/wrk/JMeter 同类，滥用责任在使用者）。<br />
        · 内置试金石端点压的是本插件服务进程自己：极高并发会让面板轮询变慢（同一 node 进程），属预期现象，不代表真实目标的表现。<br />
        · 不做：分布式压测、脚本化场景编排、WebSocket/gRPC、定时自动重压。
      </div></div>
    </>
  )
}
