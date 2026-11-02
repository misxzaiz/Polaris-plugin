/**
 * DiagTab.tsx —— 诊断页：引擎连接详情 + 只读自检 + 未安装 Docker 的诚实指引
 */
import { useCallback, useState } from 'react'
import { api, EngineInfo, ServiceError, SelftestResp } from '../model'

interface Props {
  engine: EngineInfo | null
  engineErr: string
  showToast: (t: string, bad?: boolean) => void
  onRefresh: () => void
}

export default function DiagTab({ engine, engineErr, showToast, onRefresh }: Props) {
  const [result, setResult] = useState<SelftestResp['selftest'] | null>(null)
  const [busy, setBusy] = useState(false)

  const runSelftest = useCallback(async () => {
    setBusy(true)
    try {
      const r = await api.selftest()
      setResult(r.selftest || null)
    } catch (e) {
      showToast((e as ServiceError).message || '自检失败', true)
    } finally {
      setBusy(false)
    }
  }, [showToast])

  return (
    <div className="dk-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <section>
        <strong>引擎连接</strong>
        <div className="dk-kv dk-mt8">
          <span className="k">状态</span>
          <span className={engine?.status === 'ok' ? 'dk-ok' : 'dk-err'}>
            {engine?.status === 'ok' ? '已连接' : (engine?.error || engineErr || '探测中…')}
          </span>
          <span className="k">端点</span><span className="dk-mono">{engine?.endpoint?.target || '—'}</span>
          {engine?.status === 'ok' && (
            <>
              <span className="k">引擎版本</span><span>{engine.daemonVersion || '—'}（API {engine.apiVersion || '—'}）</span>
              <span className="k">平台</span><span>{engine.osType || '—'}/{engine.arch || '—'}</span>
            </>
          )}
          <span className="k">插件版本</span><span>{engine?.version || '0.1.0'}</span>
          {engine?.serviceUptimeMs != null && (
            <>
              <span className="k">服务运行</span><span>{Math.floor(engine.serviceUptimeMs / 1000)}s（事件缓冲 {engine.eventsBuffered ?? 0} 条）</span>
            </>
          )}
        </div>
        <div className="dk-row dk-mt8">
          <button type="button" className="dk-btn dk-btn-sm" onClick={onRefresh}>重新探测</button>
        </div>
      </section>

      <section>
        <strong>自检（只读，无副作用）</strong>
        <div className="dk-row dk-mt8">
          <button type="button" className="dk-btn dk-btn-sm" disabled={busy} onClick={runSelftest}>{busy ? '执行中…' : '运行自检'}</button>
          {result && <span className={`dk-small ${result.passed === result.total ? 'dk-ok' : 'dk-err'}`}>{result.passed}/{result.total} 通过{result.engineStatus === 'ok' ? ' · 引擎已连接' : ' · 引擎未连接（纯逻辑部分照常执行）'}</span>}
        </div>
        {result && (
          <div className="dk-pre dk-mt8">
            {result.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` — ${c.detail}`}`).join('\n')}
          </div>
        )}
      </section>

      {engine?.status !== 'ok' && (
        <section>
          <strong>Docker 未连接？按顺序排查</strong>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }} className="dk-dim dk-small">
            <li>本机没装 Docker —— 前往 <span className="dk-mono">docker.com</span> 下载 Docker Desktop（Windows/macOS）或安装 Docker Engine（Linux）。</li>
            <li>装了但没启动 —— 启动 Docker Desktop，等托盘图标变绿（首次启动可能要几十秒）。</li>
            <li>刚启动还没就绪 —— 等几秒点「重新探测」。</li>
            <li>Windows 提示无权限 —— 把当前用户加入 <span className="dk-mono">docker-users</span> 组后注销重登。</li>
            <li>Docker 在别的地址 —— 设置环境变量 <span className="dk-mono">DOCKER_HOST</span>（如 <span className="dk-mono">tcp://192.168.1.10:2375</span>）后重启 Polaris。</li>
          </ol>
        </section>
      )}

      <section>
        <strong>边界说明</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.8 }} className="dk-dim dk-small">
          <li>AI（MCP dk_* 工具）只读：启停/重启/删除只在面板，AI 无入口；删除类操作需精确输入名称确认。</li>
          <li>日志与 inspect 只在内存流转，不落盘、不进 kv；inspect 经 AI 通道时 env 值默认打码。</li>
          <li>不支持：容器 exec 终端、compose 编排命令、镜像构建、swarm/k8s（明确边界）。</li>
          <li>兼容 Docker 20.10+（Engine API ≥ v1.41）。</li>
        </ul>
      </section>
    </div>
  )
}
