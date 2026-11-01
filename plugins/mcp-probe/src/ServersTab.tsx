/**
 * ServersTab.tsx —— 服务器清单：宿主插件 MCP（只读直查）+ 外部档案 CRUD + Claude 配置导入
 */
import { useState } from 'react';
import type { PanelApi } from './Panel';
import type { HostServer, ProbeState, ScanCandidate, ScanFile, Transport } from './model';
import { Btn, Dot, Empty, ErrorNote, Field, Section, statusDot } from './ui';

interface Props {
  state: ProbeState | null;
  hostServers: HostServer[];
  api: PanelApi['api'];
  gotoWorkbench: (serverId: string, tool?: string) => void;
  workspace: string;
}

interface Draft {
  id?: string;
  name: string;
  transport: Transport;
  command: string;
  argsText: string;
  envText: string;
  url: string;
  headersText: string;
  timeoutMs: string;
}

const EMPTY_DRAFT: Draft = {
  name: '', transport: 'stdio', command: '', argsText: '', envText: '', url: '', headersText: '', timeoutMs: '30000',
};

function linesToMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function mapToLines(m: Record<string, string> | undefined): string {
  if (!m) return '';
  return Object.entries(m).map(([k, v]) => `${k}=${v}`).join('\n');
}

export default function ServersTab({ state, hostServers, api, gotoWorkbench, workspace }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [scan, setScan] = useState<{ found: ScanCandidate[]; files: ScanFile[] } | null>(null);
  const [wsPath, setWsPath] = useState(workspace);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const poolById = new Map((state?.pool || []).map((p) => [p.serverId, p]));

  function editProfile(id: string) {
    const p = state?.profiles.find((x) => x.id === id);
    if (!p) return;
    setErr('');
    setDraft({
      id: p.id, name: p.name, transport: p.transport, command: p.command,
      argsText: (p.args || []).join('\n'), envText: mapToLines(p.env),
      url: p.url, headersText: mapToLines(p.headers), timeoutMs: String(p.timeoutMs || 30000),
    });
  }

  async function saveDraft() {
    if (!draft) return;
    setErr('');
    const body: Record<string, unknown> = {
      id: draft.id, name: draft.name.trim(), transport: draft.transport,
      command: draft.command.trim(), url: draft.url.trim(),
      args: draft.argsText.split('\n').map((s) => s.trim()).filter(Boolean),
      env: linesToMap(draft.envText), headers: linesToMap(draft.headersText),
      timeoutMs: parseInt(draft.timeoutMs, 10) || 30000,
    };
    try {
      await api('POST', '/api/profiles/save', body);
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeProfile(id: string) {
    setBusyId(id);
    setErr('');
    try {
      await api('POST', '/api/profiles/delete', { id });
      if (draft?.id === id) setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId('');
    }
  }

  async function connectProfile(id: string) {
    setBusyId(id);
    setErr('');
    try {
      await api('POST', '/api/connect', { serverId: id, force: false });
      gotoWorkbench(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId('');
    }
  }

  async function runScan(apply: boolean, keys?: string[]) {
    setErr('');
    try {
      const r = await api<{ found: ScanCandidate[]; files: ScanFile[]; applied: number }>('POST', '/api/profiles/import-claude', {
        workspace: wsPath.trim(), apply, keys,
      });
      setScan({ found: r.found || [], files: r.files || [] });
      if (apply) setChecked(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <Section title="宿主插件 MCP" hint="经 cap.mcp 直查注册表，零重复 spawn">
        {hostServers.length === 0 ? (
          <Empty>宿主未注册任何插件 MCP 工具（启用带 MCP 的插件后出现）</Empty>
        ) : hostServers.map((s) => {
          const sid = `host:${s.server || s.pluginId}`;
          return (
            <div key={sid} className="mp-card">
              <div className="mp-card-b">
                <div className="mp-row">
                  <Dot status="ok" />
                  <b className="mp-grow" style={{ fontSize: 12.5 }}>{s.server || s.pluginId}</b>
                  <span className="mp-tag">{s.pluginId}</span>
                  <span className="mp-tag">{s.tools.length} 工具</span>
                  {s.injected ? <span className="mp-tag">{s.injected}</span> : null}
                  <Btn sm kind="ghost" onClick={() => gotoWorkbench(sid)}>调试</Btn>
                </div>
                {s.tools.length ? (
                  <div className="mp-sub" style={{ marginTop: 5 }}>
                    {s.tools.slice(0, 6).map((t) => t.name).join(' · ')}
                    {s.tools.length > 6 ? ` · …共 ${s.tools.length}` : ''}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </Section>

      <Section
        title="外部服务器档案"
        hint="stdio / streamable HTTP，连接唯一所有者是后台服务"
        actions={(
          <>
            <Btn sm kind="ghost" onClick={() => { setErr(''); setDraft({ ...EMPTY_DRAFT }); }}>+ 新建</Btn>
            <Btn sm kind="ghost" onClick={() => runScan(false)}>扫描 Claude 配置</Btn>
          </>
        )}
      >
        {!state || state.profiles.length === 0 ? (
          <Empty>
            暂无外部档案。新建一个，或「扫描 Claude 配置」一键导入 ~/.claude、.mcp.json 里的 MCP 服务器。
          </Empty>
        ) : state.profiles.map((p) => {
          const pool = poolById.get(p.id);
          return (
            <div key={p.id} className="mp-card">
              <div className="mp-card-b">
                <div className="mp-row">
                  <Dot status={statusDot(pool?.status, pool?.poisoned)} />
                  <b className="mp-grow" style={{ fontSize: 12.5 }}>{p.name}</b>
                  <span className="mp-tag">{p.transport}</span>
                  {p.legacy ? <span className="mp-tag">legacy-sse</span> : null}
                  {pool?.status === 'ready' ? <span className="mp-tag">{pool.toolCount} 工具</span> : null}
                  {p.origin !== 'manual' ? <span className="mp-tag">{p.origin}</span> : null}
                </div>
                <div className="mp-sub" style={{ marginTop: 4 }}>
                  {p.transport === 'stdio' ? `${p.command} ${(p.args || []).join(' ')}`.slice(0, 160) : p.url}
                </div>
                {pool?.lastError ? <ErrorNote>{pool.lastError}</ErrorNote> : null}
                <div className="mp-row" style={{ marginTop: 7 }}>
                  <Btn sm disabled={busyId === p.id} onClick={() => connectProfile(p.id)}>连接</Btn>
                  {pool && pool.status !== 'closed' ? (
                    <Btn sm kind="ghost" disabled={busyId === p.id} onClick={async () => { setBusyId(p.id); try { await api('POST', '/api/disconnect', { serverId: p.id }); } finally { setBusyId(''); } }}>断开</Btn>
                  ) : null}
                  <Btn sm kind="ghost" onClick={() => editProfile(p.id)}>编辑</Btn>
                  <Btn sm kind="danger" disabled={busyId === p.id} onClick={() => removeProfile(p.id)}>删除</Btn>
                </div>
              </div>
            </div>
          );
        })}

        {draft ? (
          <div className="mp-card" style={{ borderColor: '#2b6cb0' }}>
            <div className="mp-card-b">
              <Field label="名称">
                <input className="mp-inp" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="我的 MCP 服务器" />
              </Field>
              <Field label="传输类型">
                <select className="mp-inp" value={draft.transport} onChange={(e) => setDraft({ ...draft, transport: e.target.value as Transport })}>
                  <option value="stdio">stdio（本地命令）</option>
                  <option value="http">streamable HTTP（远程端点）</option>
                </select>
              </Field>
              {draft.transport === 'stdio' ? (
                <>
                  <Field label="命令" hint="npx/uvx 等已做 Windows 兼容">
                    <input className="mp-inp mono" value={draft.command} onChange={(e) => setDraft({ ...draft, command: e.target.value })} placeholder="npx -y @modelcontextprotocol/server-everything 拆成命令与参数填" />
                  </Field>
                  <Field label="参数" hint="每行一个">
                    <textarea className="mp-inp mono" value={draft.argsText} onChange={(e) => setDraft({ ...draft, argsText: e.target.value })} placeholder={'-y\n@modelcontextprotocol/server-everything'} />
                  </Field>
                  <Field label="环境变量" hint="KEY=value 每行一条；含 token/key 的值展示时脱敏">
                    <textarea className="mp-inp mono" value={draft.envText} onChange={(e) => setDraft({ ...draft, envText: e.target.value })} placeholder={'API_KEY=xxx'} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="URL" hint="streamable HTTP 端点">
                    <input className="mp-inp mono" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://example.com/mcp" />
                  </Field>
                  <Field label="请求头" hint="KEY=value 每行一条（如 Authorization=Bearer xxx，展示时脱敏）">
                    <textarea className="mp-inp mono" value={draft.headersText} onChange={(e) => setDraft({ ...draft, headersText: e.target.value })} placeholder="Authorization=Bearer xxx" />
                  </Field>
                </>
              )}
              <Field label="调用超时" hint="毫秒（3s~300s）">
                <input className="mp-inp" value={draft.timeoutMs} onChange={(e) => setDraft({ ...draft, timeoutMs: e.target.value })} />
              </Field>
              {err ? <ErrorNote>{err}</ErrorNote> : null}
              <div className="mp-row">
                <Btn onClick={saveDraft} disabled={!draft.name.trim()}>保存</Btn>
                <Btn kind="ghost" onClick={() => { setDraft(null); setErr(''); }}>取消</Btn>
              </div>
            </div>
          </div>
        ) : null}

        {scan ? (
          <div className="mp-card" style={{ borderColor: '#5a4316' }}>
            <div className="mp-card-b">
              <b style={{ fontSize: 12.5 }}>Claude 配置扫描结果</b>
              <Field label="工作区路径" hint="留空只扫全局（~/.claude）">
                <input className="mp-inp mono" value={wsPath} onChange={(e) => setWsPath(e.target.value)} placeholder="D:\\path\\to\\workspace" />
              </Field>
              {scan.found.length === 0 ? (
                <Empty>未发现可导入的服务器</Empty>
              ) : scan.found.map((c) => (
                <label key={c.key} className="mp-row" style={{ padding: '4px 2px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked.has(c.key)}
                    onChange={(e) => {
                      const next = new Set(checked);
                      if (e.target.checked) next.add(c.key); else next.delete(c.key);
                      setChecked(next);
                    }}
                  />
                  <span className="mp-grow mp-sub">
                    <b style={{ color: '#E6EAF2' }}>{c.name}</b> [{c.scope}] {c.transport}
                    {c.legacy ? ' (legacy-sse)' : ''} — {c.transport === 'stdio' ? `${c.command} ${(c.args || []).join(' ')}` : c.url}
                  </span>
                </label>
              ))}
              {scan.files.filter((f) => f.error).map((f) => (
                <div key={`${f.path}:${f.error}`} className="mp-sub" style={{ color: '#D29922' }}>! {f.path}: {f.error}</div>
              ))}
              <div className="mp-row" style={{ marginTop: 8 }}>
                <Btn
                  sm
                  disabled={scan.found.length === 0}
                  onClick={() => runScan(true, checked.size ? Array.from(checked) : undefined)}
                >
                  导入{checked.size ? `所选 ${checked.size} 项` : '全部'}
                </Btn>
                <Btn sm kind="ghost" onClick={() => runScan(false)}>重新扫描</Btn>
                <Btn sm kind="ghost" onClick={() => setScan(null)}>关闭</Btn>
              </div>
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
