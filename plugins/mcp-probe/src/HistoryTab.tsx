/**
 * HistoryTab.tsx —— 调用历史：过滤/展开/重放/清空
 * 历史含工具参数与结果原文（本地数据根存储，不出本机）；上限 200 条由服务端封顶。
 */
import { useEffect, useState } from 'react';
import type { PanelApi } from './Panel';
import type { CallRecord, ProbeState } from './model';
import { timeAgo } from './model';
import { Badge, Btn, Empty, ErrorNote, JsonView, Section } from './ui';

interface Props {
  api: PanelApi['api'];
  state: ProbeState | null;
  gotoWorkbench: (serverId: string, tool?: string, argsText?: string) => void;
}

export default function HistoryTab({ api, state, gotoWorkbench }: Props) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [serverId, setServerId] = useState('');
  const [tool, setTool] = useState('');
  const [openId, setOpenId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (serverId) qs.set('serverId', serverId);
      if (tool.trim()) qs.set('tool', tool.trim());
      qs.set('limit', '200');
      const r = await api<{ calls: CallRecord[]; total: number }>('GET', `/api/history?${qs.toString()}`);
      setCalls(r.calls || []);
      setTotal(r.total || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [serverId]);

  async function clearAll() {
    if (!window.confirm(`清空全部 ${total} 条调用历史？（快照与体检报告不受影响）`)) return;
    setBusy(true);
    try {
      await api('POST', '/api/history/clear', {});
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const serverNames = new Map<string, string>();
  for (const c of calls) serverNames.set(c.serverId, c.serverName);

  return (
    <div>
      <Section
        title="调用历史"
        hint={`${calls.length}/${total} 条（上限 200，先进先出）`}
        actions={(
          <>
            <Btn sm kind="ghost" onClick={load}>刷新</Btn>
            <Btn sm kind="danger" disabled={busy || total === 0} onClick={clearAll}>清空</Btn>
          </>
        )}
      >
        <div className="mp-card"><div className="mp-card-b">
          <div className="mp-row">
            <select className="mp-inp" style={{ maxWidth: 240 }} value={serverId} onChange={(e) => setServerId(e.target.value)}>
              <option value="">全部服务器</option>
              {Array.from(serverNames.entries()).map(([sid, name]) => (
                <option key={sid} value={sid}>{name}</option>
              ))}
            </select>
            <input
              className="mp-inp mono"
              style={{ maxWidth: 200 }}
              placeholder="按工具名过滤"
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
            />
            <Btn sm kind="ghost" onClick={load}>过滤</Btn>
          </div>
        </div></div>

        {err ? <ErrorNote>{err}</ErrorNote> : null}

        {calls.length === 0 ? (
          <Empty>暂无调用记录。在「调试」页调用工具，或让 AI 用 probe_call_tool 调用后出现在这里。</Empty>
        ) : calls.map((c) => (
          <div key={c.id} className="mp-card">
            <div className="mp-card-b" onClick={() => setOpenId(openId === c.id ? '' : c.id)} style={{ cursor: 'pointer' }}>
              <div className="mp-row">
                <Badge tone={c.isError ? 'bad' : 'good'}>{c.isError ? '✗ 失败' : '✓ 成功'}</Badge>
                <b style={{ fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 12 }}>{c.tool}</b>
                <span className="mp-sub mp-grow">{c.serverName}</span>
                <Badge tone="mute">{c.durationMs}ms</Badge>
                <Badge tone="mute">{c.via === 'ai' ? 'AI' : '面板'}</Badge>
                <span className="mp-tag">{timeAgo(c.at)}</span>
              </div>
              <div className="mp-sub mono" style={{ marginTop: 4, fontFamily: 'ui-monospace,Consolas,monospace' }}>
                args: {c.argsText.slice(0, 120)}
              </div>
              {openId === c.id ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="mp-row" style={{ marginTop: 8 }}>
                    <Btn sm onClick={() => gotoWorkbench(c.serverId, c.tool, c.argsText)}>重放进调试台</Btn>
                    <Btn sm kind="ghost" onClick={() => navigator.clipboard?.writeText(c.resultText)}>复制结果</Btn>
                  </div>
                  <JsonView text={c.resultText} maxH={360} />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}
