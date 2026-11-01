/**
 * 报告 Tab：健康分环 + 评语归因 + 问题分组（details 可折叠）+ 慢页 TOP +
 * 状态码分布 + 外链失效域名 + robots/sitemap 覆盖 + 导出（JSON/CSV/发送到聊天）
 */
import { useMemo } from 'react'
import {
  core, downloadText,
  type AuditReport, type IssueGroup,
} from './model'

function scoreColor(v: number): string {
  return v >= 90 ? '#3FB950' : v >= 70 ? '#E3B341' : '#F85149'
}

function ScoreRing({ value }: { value: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(100, value)) / 100
  const color = scoreColor(value)
  return (
    <div className="sa-ring">
      <svg width="74" height="74" viewBox="0 0 74 74">
        <circle cx="37" cy="37" r={r} fill="none" stroke="#242C3A" strokeWidth="7" />
        <circle cx="37" cy="37" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${(c * filled).toFixed(1)} ${c.toFixed(1)}`} strokeLinecap="round" />
      </svg>
      <b style={{ color }}>{value}</b>
    </div>
  )
}

export function IssueCard({ group, defaultOpen }: { group: IssueGroup; defaultOpen: boolean }) {
  return (
    <details className="sa-issue" open={defaultOpen}>
      <summary className="sa-issue-h">
        <span className={`sa-badge ${group.severity === 'error' ? 'bad' : group.severity === 'warn' ? 'warn' : 'info'}`}>
          {group.severity === 'error' ? '错误' : group.severity === 'warn' ? '警告' : '提示'}
        </span>
        <b>{group.label}</b>
        <span className="sa-issue-n">×{group.count}{group.truncated ? `（明细截取前 ${group.items.length}）` : ''}</span>
      </summary>
      <div className="sa-issue-items">
        <div className="sa-detail">{group.hint}</div>
        {group.items.map((it, i) => (
          <div className="sa-issue-item" key={`${it.url}-${i}`}>
            <div className="sa-mono">{it.url}</div>
            {it.detail && <div className="sa-detail">{it.detail}</div>}
            {it.source && it.source !== it.url && <div className="sa-src">来源页：{it.source}</div>}
            {it.dupUrls && it.dupUrls.length > 1 && <div className="sa-src">同款页面：{it.dupUrls.join(' · ')}</div>}
          </div>
        ))}
      </div>
    </details>
  )
}

export function ReportView({ report, onSendToChat }: { report: AuditReport | null; onSendToChat?: (message: string) => void | Promise<void> }) {
  const csv = useMemo(() => (report ? core.issuesToCsv(report) : ''), [report])
  if (!report) {
    return (
      <div className="sa-empty">
        还没有体检报告。<br />
        在「体检」Tab 输入种子 URL 发起，或先点「填入内置试金石站」体验完整链路。
      </div>
    )
  }
  const s = report.stats
  const statusChips = Object.entries(s.statusDist).sort((a, b) => b[1] - a[1])
  const extDomains = Object.entries(report.externalByDomain || {})
  const slug = report.seed.url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'site-audit'
  return (
    <>
      <div className="sa-card">
        <div className="sa-card-b">
          <div className="sa-score">
            <ScoreRing value={report.score.value} />
            <div style={{ minWidth: 0 }}>
              <div className="sa-row-h">
                <b style={{ fontSize: 13 }}>{report.score.verdict.oneLine}</b>
                {report.aborted && <span className="sa-badge warn">已中止·部分结果</span>}
                {report.fatal && <span className="sa-badge bad">启动失败</span>}
              </div>
              <div className="sa-mono sa-sub" style={{ wordBreak: 'break-all' }}>{report.seed.url}</div>
              <div className="sa-sub">范围 host：{(report.seed.scopeHosts || []).join(' + ') || '—'} · {s.pagesCrawled} 页 / {s.assetsChecked} 资源 / {s.externalChecked} 外链 · 耗时 {(s.durationMs / 1000).toFixed(1)}s{s.avgPageMs != null ? ` · 平均页响应 ${s.avgPageMs}ms` : ''}</div>
            </div>
          </div>
          {report.fatal && <div className="sa-err">体检未能正常开始：{report.fatal}</div>}
          <div style={{ marginTop: 8 }}>
            {report.score.verdict.notes.map((n, i) => <div className="sa-sub" key={i}>· {n}</div>)}
          </div>
          <div className="sa-btnrow">
            <button className="sa-btn ghost sm" onClick={() => downloadText(`site-audit-${slug}-${report.auditId}.json`, JSON.stringify(report, null, 2), 'application/json')}>导出 JSON</button>
            <button className="sa-btn ghost sm" onClick={() => downloadText(`site-audit-${slug}-${report.auditId}.csv`, csv, 'text/csv')}>导出 CSV（问题明细）</button>
            {onSendToChat && (
              <button className="sa-btn ghost sm" onClick={() => onSendToChat(`请帮我解读这份站点体检报告并提出修复建议：\n\n${core.renderReportText(report)}`)}>
                发给 AI 解读
              </button>
            )}
          </div>
        </div>
      </div>

      {report.issues.length > 0 && (
        <>
          <div className="sa-sec"><span className="sa-bar" />问题清单<span className="sa-hint">{report.issues.length} 类 · 点开看明细与来源页</span></div>
          <div className="sa-card">
            <div className="sa-card-b" style={{ padding: 0 }}>
              {report.issues.map((g) => <IssueCard key={g.type} group={g} defaultOpen={g.severity === 'error'} />)}
            </div>
          </div>
        </>
      )}

      <div className="sa-sec"><span className="sa-bar" />状态码分布与最慢页面<span className="sa-hint">平均页响应 {s.avgPageMs != null ? `${s.avgPageMs}ms` : '—'}</span></div>
      <div className="sa-card">
        <div className="sa-card-b">
          <div className="sa-chiprow" style={{ marginBottom: 8 }}>
            {statusChips.length === 0 && <span className="sa-sub">无请求记录</span>}
            {statusChips.map(([code, n]) => (
              <span key={code} className={`sa-badge ${code === '200' ? 'good' : code.startsWith('3') ? 'info' : code === 'error' ? 'bad' : 'warn'}`}>{code} × {n}</span>
            ))}
          </div>
          {report.slowest.length > 0 && (
            <table className="sa-tb">
              <thead><tr><th>页面</th><th>响应</th><th>体积</th></tr></thead>
              <tbody>
                {report.slowest.map((x) => (
                  <tr key={x.url}><td className="sa-mono" style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.url}>{x.url}</td><td className="sa-num">{x.ms}ms</td><td className="sa-num">{core.fmtBytes(x.bytes)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {extDomains.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="sa-sub" style={{ marginBottom: 4 }}>外链失效按域聚合：</div>
              {extDomains.slice(0, 10).map(([d, urls]) => (
                <div className="sa-evrow" key={d}>
                  <span className="sa-badge warn">{d}</span>
                  <span className="sa-muted">{urls.length} 条，如 {urls[0]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sa-sec"><span className="sa-bar" />robots 与 sitemap</div>
      <div className="sa-card">
        <div className="sa-card-b">
          <dl className="sa-kv">
            <dt>robots.txt</dt><dd>{report.robots.fetched ? '已读取' : '未读到（未开启遵守或目标无此文件）'}{report.robots.crawlDelayMs ? ` · Crawl-delay ${report.robots.crawlDelayMs}ms` : ''}{report.robots.disallowCount ? ` · ${report.robots.disallowCount} 条 Disallow 规则` : ''}</dd>
            <dt>排除明细</dt><dd>{report.robots.fetched && s.robotsBlocked > 0 ? `${s.robotsBlocked} 个被链接地址被 robots 排除（见问题清单）` : '无被排除的被链接地址'}</dd>
            <dt>sitemap</dt><dd>{report.sitemap.fetched ? `${report.sitemap.urlCount} 个地址（${report.sitemap.url}）` : '未读到 sitemap（robots 也未声明）——无法做覆盖对比'}</dd>
            <dt>本次范围</dt><dd>{s.pagesCrawled} 页 · 外链核查 {s.externalChecked}{s.externalSkipped ? `（超出上限跳过 ${s.externalSkipped}）` : ''}</dd>
          </dl>
        </div>
      </div>
    </>
  )
}

export default function ReportTab({ report, onSendToChat }: { report: AuditReport | null; onSendToChat?: (message: string) => void | Promise<void> }) {
  return <ReportView report={report} onSendToChat={onSendToChat} />
}
