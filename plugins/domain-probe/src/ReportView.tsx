/**
 * ReportView.tsx —— 体检报告渲染（体检/邮件/历史三处共用）
 * 评分环（内联 SVG，零图表依赖）+ findings 分级列表 + 分区明细（DNS 记录 / 邮件身份 / 证书 / 查询对比）。
 */
import { useState } from 'react'
import type { Report, Finding } from './model'

const SEV_COLOR: Record<string, string> = { red: '#F85149', yellow: '#E3B341', info: '#8B95A7', green: '#3FB950' }
const SEV_BG: Record<string, string> = { red: 'rgba(248,81,73,.08)', yellow: 'rgba(227,179,65,.08)', info: 'transparent', green: 'rgba(63,185,80,.06)' }
const SEV_TEXT: Record<string, string> = { red: '红', yellow: '黄', info: '信息', green: '正常' }
const KIND_CN: Record<string, string> = { full: '全面体检', email: '邮件身份', cert: '证书', lookup: '单查询' }

function ScoreRing({ total, tone }: { total: number; tone: string }) {
  const R = 26
  const C = 2 * Math.PI * R
  const color = tone === 'good' ? '#3FB950' : tone === 'ok' ? '#58A6FF' : tone === 'warn' ? '#E3B341' : '#F85149'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <svg width="66" height="66" viewBox="0 0 66 66">
        <circle cx="33" cy="33" r={R} fill="none" stroke="#242C3A" strokeWidth="6" />
        <circle
          cx="33" cy="33" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(C * Math.max(0, Math.min(100, total))) / 100} ${C}`}
          transform="rotate(-90 33 33)"
        />
        <text x="33" y="38" textAnchor="middle" fill={color} fontSize="17" fontWeight="700">{total}</text>
      </svg>
    </div>
  )
}

function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!(f.detail || f.fix)
  return (
    <div style={{ background: SEV_BG[f.sev], borderLeft: `3px solid ${SEV_COLOR[f.sev]}`, borderRadius: 7, padding: '8px 10px', marginBottom: 6 }}>
      <div
        style={{ display: 'flex', gap: 7, alignItems: 'baseline', cursor: hasDetail ? 'pointer' : 'default' }}
        onClick={() => hasDetail && setOpen(!open)}
      >
        <span style={{ color: SEV_COLOR[f.sev], fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
          {f.sev === 'red' ? '红' : f.sev === 'yellow' ? '黄' : f.sev === 'green' ? '✓' : '·'}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, wordBreak: 'break-word' }}>{f.title}</span>
        {hasDetail && <span style={{ color: '#5C6678', fontSize: 10 }}>{open ? '收起' : '展开'}</span>}
      </div>
      {open && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: '#AEB7C6', lineHeight: 1.65, wordBreak: 'break-word' }}>
          {f.detail && <div>{f.detail}</div>}
          {f.fix && <div style={{ color: '#7EE2A8' }}>→ 修复：{f.fix}</div>}
        </div>
      )}
    </div>
  )
}

function Sec({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid #242C3A', borderRadius: 10, marginBottom: 8, overflow: 'hidden', background: '#12151C' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span style={{ color: '#5C6678', fontSize: 10 }}>{open ? '▾' : '▸'}</span>{title}
      </div>
      {open && <div style={{ padding: '2px 12px 10px' }}>{children}</div>}
    </div>
  )
}

function KvRows({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 11.5 }}>
      {rows.filter(([, v]) => v != null && v !== '').map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <span style={{ color: '#5C6678', whiteSpace: 'nowrap' }}>{k}</span>
          <span className="dp-mono" style={{ wordBreak: 'break-all' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function MailDetail({ mail }: { mail: any }) {
  const spf = mail?.spf || {}
  const lookup = spf.lookup || null
  const dmarc = mail?.dmarc || {}
  const dkim = mail?.dkim || []
  const mx = mail?.mx || {}
  return (
    <>
      <Sec title={`SPF${spf.records && spf.records.length ? `（${spf.records.length} 条）` : ''}`} defaultOpen={!!(spf.records && spf.records.length)}>
        {(spf.records || []).length === 0 && <div style={{ color: '#5C6678', fontSize: 11.5 }}>未发布 v=spf1 记录</div>}
        {(spf.records || []).map((r: string, i: number) => (
          <div key={i} className="dp-mono" style={{ fontSize: 11, wordBreak: 'break-all', padding: '3px 0' }}>{r}</div>
        ))}
        {lookup && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: '#8B95A7' }}>
              DNS 查询计数 <b style={{ color: lookup.overLimit ? '#F85149' : lookup.atLimit ? '#E3B341' : '#3FB950' }}>{lookup.count}/10</b>
              {lookup.overLimit ? '（超限，收件方会按 permerror 处理）' : lookup.atLimit ? '（恰好达上限）' : ''}
            </div>
            <div style={{ height: 5, background: '#1C2330', borderRadius: 3, marginTop: 4, maxWidth: 320 }}>
              <div style={{
                height: 5, borderRadius: 3,
                width: `${Math.min(100, lookup.count * 10)}%`,
                background: lookup.overLimit ? '#F85149' : lookup.atLimit ? '#E3B341' : '#3FB950',
              }} />
            </div>
          </div>
        )}
      </Sec>
      <Sec title="DMARC" defaultOpen>
        {dmarc.record ? (
          <KvRows rows={[
            ['记录', dmarc.record.raw],
            ['策略 p', dmarc.record.tags?.p || '（缺失）'],
            ['报告 rua', dmarc.record.tags?.rua || '（未配置）'],
            ['pct', dmarc.record.tags?.pct || '100（默认）'],
            ['对齐', `adkim=${dmarc.record.tags?.adkim || 'r（默认）'} / aspf=${dmarc.record.tags?.aspf || 'r（默认）'}`],
            ...(dmarc.orgGuess ? [['父域', `${dmarc.orgGuess}（${dmarc.orgRecord ? '有记录，子域未发布时继承' : '无记录'}）`] as [string, string]] : []),
          ]} />
        ) : (
          <div style={{ color: '#5C6678', fontSize: 11.5 }}>
            本域未发布 DMARC{dmarc.orgGuess ? `；父域 ${dmarc.orgGuess} ${dmarc.orgRecord ? '有记录（子域继承）' : '也无记录'}` : ''}
          </div>
        )}
      </Sec>
      <Sec title={`DKIM（探测 ${dkim.length} 个 selector）`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {dkim.map((x: any) => (
            <span key={x.selector} className="dp-badge" style={{
              background: x.found ? (x.record?.revoked ? '#2a2410' : '#122b1a') : '#12151C',
              color: x.found ? (x.record?.revoked ? '#E3B341' : '#3FB950') : '#5C6678',
              border: '1px solid #242C3A', borderRadius: 5, padding: '1px 7px', fontSize: 10.5,
            }}>
              {x.found ? `✓ ${x.selector}${x.record?.revoked ? '（已撤销）' : ''}` : x.selector}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: '#5C6678', marginTop: 6 }}>
          selector 是发信方自定义的；灰色=常见清单里未发现，可在「设置」补充自己的 selector 后重测
        </div>
      </Sec>
      <Sec title={`MX（${(mx.answers || []).length || 0} 条）`}>
        {(mx.answers || []).length === 0 && <div style={{ color: '#5C6678', fontSize: 11.5 }}>无 MX 记录{mx.statusCn ? `（解析器返回 ${mx.statusCn}）` : ''}</div>}
        {(mx.answers || []).map((a: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 11.5, padding: '3px 0' }}>
            <span style={{ color: '#58A6FF', width: 26 }}>{a.pref ?? '?'}</span>
            <span className="dp-mono" style={{ wordBreak: 'break-all' }}>{a.data}</span>
            <span style={{ color: '#5C6678', marginLeft: 'auto' }}>TTL {a.ttl}</span>
          </div>
        ))}
      </Sec>
    </>
  )
}

function LookupDetail({ sections }: { sections: any }) {
  const per = sections?.per || []
  const diff = sections?.diff
  return (
    <>
      <Sec title={`各解析器答案（${(sections?.query?.type) || ''}）`} defaultOpen>
        {per.map((p: any, i: number) => (
          <div key={i} style={{ padding: '6px 0', borderTop: i ? '1px solid #1d2330' : 'none' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <b style={{ fontSize: 12 }}>{p.resolver}</b>
              {p.ok
                ? <span style={{ fontSize: 10.5, color: p.status === 0 ? '#3FB950' : '#E3B341' }}>{p.statusCn}{p.ad ? ' · DNSSEC验证✓' : ''}</span>
                : <span style={{ fontSize: 10.5, color: '#F85149' }}>不可达</span>}
            </div>
            {p.ok && (p.answers || []).length > 0 && (
              <div className="dp-mono" style={{ fontSize: 11, color: '#AEB7C6', marginTop: 3, wordBreak: 'break-all' }}>
                {p.answers.slice(0, 12).map((a: any) => (a.typeName === 'MX' && a.pref != null ? `${a.pref} ${a.data}` : a.data)).join('  |  ')}
              </div>
            )}
            {!p.ok && <div style={{ fontSize: 10.5, color: '#F85149', marginTop: 2 }}>{p.error}</div>}
          </div>
        ))}
      </Sec>
      {diff && (
        <div className="dp-card-b" style={{ padding: '9px 13px', border: '1px solid #242C3A', borderRadius: 10, marginBottom: 8, background: '#12151C' }}>
          <b style={{ fontSize: 12 }}>一致性：{diff.consistent ? <span style={{ color: '#3FB950' }}>各解析器答案一致 ✓</span> : <span style={{ color: '#E3B341' }}>不一致（{diff.groups.length} 组）</span>}</b>
          {!diff.consistent && diff.groups.length > 0 && (
            <div style={{ fontSize: 11, color: '#8B95A7', marginTop: 4 }}>
              {diff.groups.map((g: any, i: number) => `${g.resolvers.join(' + ')} → ${g.answers.map((a: any) => a.data).join(' | ')}`).join('；')}
            </div>
          )}
          {diff.unreachable && diff.unreachable.length > 0 && (
            <div style={{ fontSize: 10.5, color: '#5C6678', marginTop: 4 }}>
              不可达：{diff.unreachable.map((u: any) => u.id).join(', ')}（网络受限环境下全球解析器可能超时，属正常现象）
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default function ReportView({ rep, compact = false }: { rep: Report; compact?: boolean }) {
  const c = rep.score?.counts
  return (
    <div>
      <div className="dp-card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {rep.score && <ScoreRing total={rep.score.total} tone={rep.score.verdict?.tone || 'warn'} />}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }} className="dp-mono">{rep.domain}</b>
            <span className="dp-tag">{KIND_CN[rep.kind] || rep.kind}</span>
            {rep.finishedAt && <span style={{ fontSize: 10, color: '#5C6678' }}>{rep.finishedAt.replace('T', ' ').slice(0, 16)} · {((rep.durationMs || 0) / 1000).toFixed(1)}s</span>}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B95A7', marginTop: 3 }}>{rep.score?.verdict?.cn || ''}</div>
          {c && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {(['red', 'yellow', 'info', 'green'] as const).map((k) => (
                <span key={k} style={{ fontSize: 10, color: SEV_COLOR[k], background: SEV_BG[k], borderRadius: 5, padding: '1px 7px', border: `1px solid ${SEV_COLOR[k]}33` }}>
                  {SEV_TEXT[k]} {c[k] || 0}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {rep.fatal && (
        <div className="dp-card" style={{ padding: 12, borderColor: '#67252e' }}>
          <div style={{ color: '#F85149', fontWeight: 600, fontSize: 12.5 }}>{rep.fatal.cn}</div>
          {rep.fatal.detail && <div style={{ fontSize: 11, color: '#AEB7C6', marginTop: 4, wordBreak: 'break-all' }}>{rep.fatal.detail}</div>}
        </div>
      )}

      {(rep.findings || []).length > 0 && (
        <div style={{ margin: '10px 0' }}>
          {(rep.findings || []).map((f, i) => <FindingRow key={i} f={f} />)}
        </div>
      )}

      {rep.sections && rep.kind === 'lookup' && <LookupDetail sections={rep.sections} />}
      {rep.sections && rep.sections.mail && rep.kind !== 'lookup' && <MailDetail mail={rep.sections.mail} />}

      {rep.sections && rep.sections.cert && (rep.kind === 'cert' || rep.kind === 'full') && (
        <Sec title="证书" defaultOpen={rep.kind === 'cert'}>
          {rep.sections.cert.refused
            ? <div style={{ color: '#8B95A7', fontSize: 11.5 }}>未探测：{rep.sections.cert.refused}</div>
            : (
              <KvRows rows={[
                ['持有者', rep.sections.cert.subjectCn],
                ['签发方', rep.sections.cert.issuer],
                ['有效至', `${String(rep.sections.cert.validTo).slice(0, 10)}（剩 ${rep.sections.cert.daysLeft} 天）`],
                ['SAN 覆盖', rep.sections.cert.coversDomain ? '✓ 包含本域' : `✗ ${((rep.sections.cert.sans || []) as string[]).slice(0, 6).join(', ') || '无 SAN'}`],
                ['链校验', rep.sections.cert.authorizationError ? `✗ ${rep.sections.cert.authorizationError}` : '✓ 通过'],
                ['TLS', rep.sections.cert.tlsVersion || ''],
                ['核验 IP', rep.sections.cert.verifiedIp || ''],
              ]} />
            )}
        </Sec>
      )}

      {rep.sections && rep.sections.dns && !compact && (
        <Sec title="DNS 原始记录">
          {(() => {
            const dns = rep.sections!.dns
            return (['ns', 'soa', 'a', 'aaaa', 'caa', 'ds'] as const).map((k) => {
              const p = dns[k]
              if (!p) return null
              const rows = (p.answers || []).slice(0, 12).map((a: any) => a.data as string)
              return (
                <div key={k} style={{ marginBottom: 7 }}>
                  <div style={{ fontSize: 10.5, color: '#5C6678' }}>{k.toUpperCase()}（{(p.statusCn || '')}）</div>
                  {rows.length
                    ? rows.map((r: string, i: number) => <div key={i} className="dp-mono" style={{ fontSize: 11, wordBreak: 'break-all' }}>{r}</div>)
                    : <div style={{ fontSize: 10.5, color: '#5C6678' }}>无记录</div>}
                </div>
              )
            })
          })()}
        </Sec>
      )}

      {rep.resolverFailures && rep.resolverFailures.length > 0 && (
        <div style={{ fontSize: 10.5, color: '#5C6678', margin: '6px 2px 0' }}>
          解析器失败记录：{rep.resolverFailures.slice(0, 4).map((f) => `${f.id}(${f.error.slice(0, 60)})`).join('；')}
        </div>
      )}
    </div>
  )
}
