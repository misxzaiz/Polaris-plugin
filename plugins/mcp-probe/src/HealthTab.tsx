/**
 * HealthTab.tsx —— 体检报告 + 快照 diff（体检绝不执行工具调用，零副作用）
 */
import { useEffect, useState } from 'react';
import type { PanelApi } from './Panel';
import type { HealthReport, HostServer, ProbeState, Snapshot, PoolInfo } from './model';
import { prettyMs, timeAgo } from './model';
import { Badge, Btn, Dot, Empty, ErrorNote, Section } from './ui';

interface Props {
  state: ProbeState | null;
  hostServers: HostServer[];
  api: PanelApi['api'];
  poolById: Map<string, PoolInfo>;
  gotoWorkbench: (serverId: string, tool?: string, argsText?: string) => void;
}

interface DiffResult {
  baseAt?: string;
  added: string[];
  removed: string[];
  changed: Array<{ name: string; fields: string[] }>;
  unchangedCount: number;
  note?: string;
}

export default function HealthTab({ state, hostServers, api, poolById, gotoWorkbench }: Props) {
  const [reports, setReports] = useState<HealthReport[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [diffServerId, setDiffServerId] = useState('');
  const [diff, setDiff] = useState<DiffResult | null>(null);

  async function loadLists() {
    try {
      const [r, s] = await Promise.all([
        api<{ reports: HealthReport[] }>('GET', '/api/reports'),
        api<{ snapshots: Snapshot[] }>('GET', '/api/snapshots'),
      ]);
      setReports(r.reports || []);
      setSnapshots(s.snapshots || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { loadLists(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function check(serverId?: string) {
    setBusy(serverId || '_all');
    setErr('');
    try {
      await api<{ reports: HealthReport[] }>('POST', '/api/health-check', serverId ? { serverId } : {});
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function snapshot(serverId: string) {
    setBusy(serverId);
    setErr('');
    try {
      await api('POST', '/api/snapshot', { serverId });
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function runDiff(serverId: string) {
    setBusy(serverId);
    setErr('');
    setDiff(null);
    try {
      const r = await api<DiffResult & { ok: boolean }>('POST', '/api/diff', { serverId });
      setDiff(r);
      await loadLists();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  const externalIds = (state?.profiles || []).map((p) => ({ id: p.id, name: p.name }));
  const hostIds = hostServers.map((s) => ({ id: `host:${s.server || s.pluginId}`, name: s.server || s.pluginId }));
  const allServers = [...hostIds, ...externalIds];

  return (
    <div>
      <Section
        title="体检"
        hint="握手/清单延迟 + schema 卫生检查，绝不调用工具"
        actions={<Btn sm disabled={busy !== '' || externalIds.length === 0} onClick={() => check()}>体检全部外部档案</Btn>}
      >
        {allServers.length === 0 ? <Empty>没有可体检的服务器</Empty> : (
          <div className="mp-card"><div className="mp-card-b">
            {allServers.map((s) => (
              <div key={s.id} className="mp-row" style={{ padding: '4px 0' }}>
                <span className="mp-grow mp-sub"><b style={{ color: '#E6EAF2' }}>{s.name}</b> {s.id.startsWith('host:') ? '[宿主]' : ''}</span>
                {s.id.startsWith('host:') ? (
                  <Btn sm kind="ghost" disabled={busy !== ''} onClick={() => check(s.id)}>体检</Btn>
                ) : (
                  <>
                    <Btn sm kind="ghost" disabled={busy !== ''} onClick={() => check(s.id)}>体检</Btn>
                    <Btn sm kind="ghost" disabled={busy !== ''} onClick={() => snapshot(s.id)}>拍快照</Btn>
                    <Btn sm disabled={busy !== ''} onClick={() => runDiff(s.id)}>对比漂移</Btn>
                  </>
                )}
              </div>
            ))}
          </div></div>
        )}
        {err ? <ErrorNote>{err}</ErrorNote> : null}
        {diff ? (
          <div className="mp-card" style={{ borderColor: diff.added.length + diff.removed.length + diff.changed.length > 0 ? '#5a4316' : undefined }}>
            <div className="mp-card-b">
              <div className="mp-row">
                <b style={{ fontSize: 12.5 }}>漂移对比结果</b>
                {diff.baseAt ? <Badge tone="mute">基准 {timeAgo(diff.baseAt)}</Badge> : null}
                <Badge tone={diff.added.length + diff.removed.length + diff.changed.length ? 'warn' : 'good'}>
                  +{diff.added.length} / -{diff.removed.length} / ~{diff.changed.length} / = {diff.unchangedCount}
                </Badge>
              </div>
              {diff.added.length ? <div className="mp-sub" style={{ marginTop: 5 }}>新增: {diff.added.join(', ')}</div> : null}
              {diff.removed.length ? <div className="mp-sub" style={{ marginTop: 3 }}>移除: {diff.removed.join(', ')}</div> : null}
              {diff.changed.map((c) => (
                <div key={c.name} className="mp-sub" style={{ marginTop: 3 }}>变更: <b style={{ color: '#D29922' }}>{c.name}</b>（{c.fields.join(' + ')}）</div>
              ))}
              {diff.note ? <div className="mp-sub" style={{ marginTop: 5 }}>{diff.note}</div> : null}
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="体检报告" hint={`保存最近 ${reports.length} 份`}>
        {reports.length === 0 ? <Empty>尚未体检。体检只读元数据，不会执行任何工具。</Empty> : reports.map((rep) => (
          <div key={rep.id} className="mp-card">
            <div className="mp-card-b">
              <div className="mp-row">
                <Dot status={rep.ok ? 'ok' : 'bad'} />
                <b className="mp-grow" style={{ fontSize: 12.5 }}>{rep.serverName}</b>
                <Badge tone="mute">{rep.kind === 'host' ? '宿主' : '外部'}</Badge>
                <span className="mp-tag">{timeAgo(rep.at)}</span>
              </div>
              <div className="mp-sub" style={{ marginTop: 4 }}>
                {rep.error ? `连接失败: ${rep.error}` : (
                  <>
                    工具 {rep.toolCount} 个
                    {rep.kind === 'host' ? ` · cap.mcp 往返 ${prettyMs(rep.roundtripMs)}` : ` · 握手 ${prettyMs(rep.initLatencyMs)} · 清单 ${prettyMs(rep.listLatencyMs)} · 协议 ${rep.protocolVersion || '?'}`}
                    {rep.reusedConnection ? ' · 复用连接' : ''}
                  </>
                )}
              </div>
              {rep.issues.length ? (
                <div className="mp-issues">
                  {rep.issues.map((i, idx) => (
                    <div key={`${i.tool}:${idx}`} className={`mp-issue ${i.level}`}>
                      [{i.level}] {i.tool}: {i.msg}
                    </div>
                  ))}
                </div>
              ) : null}
              {rep.note ? <div className="mp-sub" style={{ marginTop: 5 }}>{rep.note}</div> : null}
            </div>
          </div>
        ))}
      </Section>

      <Section title="快照" hint="工具清单留档，供漂移对比">
        {snapshots.length === 0 ? <Empty>尚无快照。对外部档案「拍快照」或「对比漂移」后生成。</Empty> : (
          <div className="mp-card"><div className="mp-card-b">
            {snapshots.map((s) => (
              <div key={s.id} className="mp-row" style={{ padding: '4px 0' }}>
                <span className="mp-grow mp-sub"><b style={{ color: '#E6EAF2' }}>{s.serverName}</b> · {s.toolCount} 工具{s.truncated ? '（schema 已截断）' : ''} · {timeAgo(s.at)} · via {s.via}</span>
                <Btn sm kind="ghost" onClick={() => gotoWorkbench(s.serverId)}>调试</Btn>
              </div>
            ))}
          </div></div>
        )}
      </Section>
    </div>
  );
}
