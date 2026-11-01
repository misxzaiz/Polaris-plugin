/**
 * WorkbenchTab.tsx —— 调试工作台：选源 → 连接 → 工具清单 → schema 表单/JSON → 调用 → 结果
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { deriveFormModel, type FormField } from '../shared/probe-core';
import type { PanelApi } from './Panel';
import type { ConnectInfo, HostServer, ProbeState, ToolInfo } from './model';
import { prettyMs } from './model';
import { Badge, Btn, Empty, ErrorNote, Field, JsonView } from './ui';

export interface Prefill {
  serverId: string;
  tool?: string;
  argsText?: string;
}

interface Props {
  state: ProbeState | null;
  hostServers: HostServer[];
  api: PanelApi['api'];
  prefill: Prefill | null;
  onPrefillConsumed: () => void;
}

interface CallResult {
  isError: boolean;
  durationMs: number;
  text: string;
  source: 'host' | 'external';
}

interface ToolArgsState {
  mode: 'form' | 'json';
  values: Record<string, string>;
  jsonText: string;
}

function initialArgsState(schema: unknown): ToolArgsState {
  const model = deriveFormModel(schema);
  if (model.mode === 'json') {
    return { mode: 'json', values: {}, jsonText: model.placeholder || '{}' };
  }
  const values: Record<string, string> = {};
  for (const f of model.fields) {
    if (f.default !== undefined) {
      values[f.name] = typeof f.default === 'string' ? f.default : JSON.stringify(f.default);
    } else if (f.type === 'boolean') values[f.name] = 'false';
    else if (f.type === 'enum' && f.enum && f.enum.length) values[f.name] = String(f.enum[0]);
  }
  return { mode: 'form', values, jsonText: '{}' };
}

function argsToPayload(st: ToolArgsState, schema: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (st.mode === 'json') {
    try {
      return { ok: true, value: st.jsonText.trim() ? JSON.parse(st.jsonText) : {} };
    } catch (e) {
      return { ok: false, error: `参数 JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const model = deriveFormModel(schema);
  const out: Record<string, unknown> = {};
  for (const f of model.fields) {
    const raw = (st.values[f.name] || '').trim();
    if (!raw) {
      if (f.required) return { ok: false, error: `缺少必填参数: ${f.name}` };
      continue;
    }
    try {
      if (f.type === 'json') out[f.name] = JSON.parse(raw);
      else if (f.type === 'number' || f.type === 'integer') out[f.name] = Number(raw);
      else if (f.type === 'boolean') out[f.name] = raw === 'true' || raw === '1';
      else out[f.name] = raw;
    } catch (e) {
      return { ok: false, error: `参数 ${f.name} 解析失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { ok: true, value: out };
}

function FieldInput({ f, value, onChange }: { f: FormField; value: string; onChange: (v: string) => void }) {
  if (f.type === 'enum' && f.enum) {
    return (
      <select className="mp-inp" value={value} onChange={(e) => onChange(e.target.value)}>
        {f.enum.map((opt) => <option key={String(opt)} value={String(opt)}>{String(opt)}</option>)}
      </select>
    );
  }
  if (f.type === 'boolean') {
    return (
      <select className="mp-inp" value={value || 'false'} onChange={(e) => onChange(e.target.value)}>
        <option value="false">false</option>
        <option value="true">true</option>
      </select>
    );
  }
  if (f.type === 'json') {
    return (
      <textarea
        className="mp-inp mono"
        value={value}
        placeholder={f.placeholder || '{}'}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="mp-inp"
      type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function WorkbenchTab({ state, hostServers, api, prefill, onPrefillConsumed }: Props) {
  const profiles = state?.profiles || [];
  const [serverId, setServerId] = useState<string>('');
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [hostTools, setHostTools] = useState<ToolInfo[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [toolName, setToolName] = useState('');
  const [argsStates, setArgsStates] = useState<Record<string, ToolArgsState>>({});
  const [argMode, setArgMode] = useState<'form' | 'json'>('form');
  const [result, setResult] = useState<CallResult | null>(null);
  const [calling, setCalling] = useState(false);
  const consumedPrefillRef = useRef<Prefill | null>(null);

  const tools: ToolInfo[] = info?.tools || hostTools || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => `${t.name} ${t.description || ''}`.toLowerCase().includes(q));
  }, [tools, search]);

  const currentTool = tools.find((t) => t.name === toolName) || null;
  const argsState = argsStates[toolName] || initialArgsState(currentTool?.inputSchema);

  function updateArgs(next: ToolArgsState) {
    setArgsStates((m) => ({ ...m, [toolName]: next }));
  }

  async function connect(sid: string, force = false) {
    if (!sid) return;
    setConnecting(true);
    setErr('');
    setInfo(null);
    setHostTools(null);
    setToolName('');
    setResult(null);
    try {
      const r = await api<{ source: 'host' | 'external'; info?: ConnectInfo; tools?: ToolInfo[] }>(
        'POST', '/api/connect', { serverId: sid, force },
      );
      if (r.source === 'host') {
        setHostTools(r.tools || []);
      } else {
        setInfo(r.info || null);
      }
      setServerId(sid);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  // 选中档案变化（面板刷新时池状态变化不重连；仅 serverId 为空或有 prefill 时动作）
  useEffect(() => {
    if (prefill && prefill !== consumedPrefillRef.current) {
      consumedPrefillRef.current = prefill;
      onPrefillConsumed();
      if (prefill.serverId !== serverId) {
        connect(prefill.serverId).then(() => {
          if (prefill.tool) {
            const toolName2 = prefill.tool;
            setToolName(toolName2);
            if (prefill.argsText) {
              setArgsStates((m) => ({
                ...m,
                [toolName2]: { mode: 'json', values: {}, jsonText: prefill.argsText as string },
              }));
              setArgMode('json');
            }
          }
        });
      } else if (prefill.tool) {
        const toolName2 = prefill.tool;
        setToolName(toolName2);
        if (prefill.argsText) {
          setArgsStates((m) => ({
            ...m,
            [toolName2]: { mode: 'json', values: {}, jsonText: prefill.argsText as string },
          }));
          setArgMode('json');
        }
      }
    } else if (!serverId && !connecting && !err) {
      // 无选择时自动带出第一个 host 源的清单（零 spawn，无副作用）
      const first = hostServers[0];
      if (first) {
        const sid = `host:${first.server || first.pluginId}`;
        consumedPrefillRef.current = null;
        setServerId(sid);
        setHostTools(first.tools);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, hostServers.length, profiles.length]);

  async function call() {
    if (!currentTool || !serverId) return;
    setErr('');
    const payload = argsToPayload(argMode === 'json'
      ? (argsStates[toolName] || initialArgsState(currentTool.inputSchema))
      : (argsStates[toolName] || initialArgsState(currentTool.inputSchema)), currentTool.inputSchema);
    if (!payload.ok) { setErr(payload.error); return; }
    setCalling(true);
    setResult(null);
    try {
      const r = await api<{
        result?: unknown; resultJson?: unknown; isError?: boolean; durationMs: number;
      }>('POST', '/api/call', {
        serverId, tool: currentTool.name, arguments: payload.value, via: 'panel',
      });
      if (r.resultJson !== undefined && r.result === undefined) {
        setResult({ isError: false, durationMs: r.durationMs, text: String(r.resultJson), source: 'host' });
      } else {
        setResult({
          isError: !!r.isError, durationMs: r.durationMs,
          text: JSON.stringify(r.result, null, 2), source: 'external',
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCalling(false);
    }
  }

  function selectTool(name: string) {
    setToolName(name);
    setResult(null);
    setErr('');
    const t = tools.find((x) => x.name === name);
    if (t && !argsStates[name]) {
      const init = initialArgsState(t.inputSchema);
      setArgsStates((m) => ({ ...m, [name]: init }));
      setArgMode(init.mode);
    } else if (argsStates[name]) {
      setArgMode(argsStates[name].mode);
    }
  }

  const model = currentTool ? deriveFormModel(currentTool.inputSchema) : null;
  const effectiveState = argsStates[toolName] || initialArgsState(currentTool?.inputSchema);

  return (
    <div>
      <div className="mp-sec-wrap">
        <div className="mp-card">
          <div className="mp-card-b">
            <div className="mp-row">
              <select
                className="mp-inp mp-grow"
                value={serverId}
                onChange={(e) => connect(e.target.value)}
              >
                <option value="">— 选择要调试的服务器 —</option>
                <optgroup label="宿主插件 MCP">
                  {hostServers.map((s) => {
                    const sid = `host:${s.server || s.pluginId}`;
                    return <option key={sid} value={sid}>{s.server || s.pluginId}（{s.tools.length} 工具）</option>;
                  })}
                </optgroup>
                <optgroup label="外部档案">
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}（{p.transport}）</option>)}
                </optgroup>
              </select>
              {info ? (
                <>
                  <Badge tone="good">已连接 {prettyMs(info.initLatencyMs)}</Badge>
                  <Badge tone="mute">{info.protocolVersion || '?'}</Badge>
                </>
              ) : null}
              {hostTools ? <Badge tone="good">注册表直查</Badge> : null}
              {serverId && (info || hostTools) ? (
                <Btn sm kind="ghost" disabled={connecting} onClick={() => connect(serverId, true)}>重连</Btn>
              ) : null}
            </div>
            {info ? (
              <div className="mp-sub" style={{ marginTop: 5 }}>
                serverInfo: {info.serverInfo ? `${info.serverInfo.name || '?'}${info.serverInfo.version ? `@${info.serverInfo.version}` : ''}` : '?'}
                · tools {info.tools.length} · resources {info.resources.length} · prompts {info.prompts.length}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {err ? <div style={{ margin: '0 16px' }}><ErrorNote>{err}</ErrorNote></div> : null}

      {!serverId ? (
        <div style={{ margin: '0 16px' }}>
          <Empty>先在上方选择服务器（宿主插件直查注册表；外部档案由服务建立连接）</Empty>
        </div>
      ) : (
        <div className="mp-sec-wrap">
          <div className="mp-split">
            <div className="mp-left">
              <input className="mp-inp" placeholder="搜索工具…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="mp-tools" style={{ marginTop: 6 }}>
                {connecting ? <Empty>连接中…</Empty> : null}
                {!connecting && filtered.length === 0 ? <Empty>{tools.length ? '无匹配工具' : '该服务器没有工具'}</Empty> : null}
                {filtered.map((t) => (
                  <div key={t.name} className={`mp-tool ${toolName === t.name ? 'on' : ''}`} onClick={() => selectTool(t.name)}>
                    <b>{t.name}</b>
                    <span>{(t.description || '').replace(/\s+/g, ' ').slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mp-right">
              {!currentTool ? (
                <Empty>左侧选择一个工具</Empty>
              ) : (
                <div className="mp-card">
                  <div className="mp-card-b">
                    <b style={{ fontFamily: 'ui-monospace,Consolas,monospace', fontSize: 13 }}>{currentTool.name}</b>
                    {currentTool.description ? <div className="mp-sub" style={{ marginTop: 4 }}>{currentTool.description}</div> : (
                      <div className="mp-sub" style={{ marginTop: 4, color: '#D29922' }}>⚠ 该工具没有 description——模型难以判断何时选用（体检会标记）</div>
                    )}

                    <div className="mp-row" style={{ marginTop: 10 }}>
                      <Btn sm kind={argMode === 'form' ? 'primary' : 'ghost'} onClick={() => setArgMode('form')} disabled={model?.mode !== 'fields'}>表单</Btn>
                      <Btn sm kind={argMode === 'json' ? 'primary' : 'ghost'} onClick={() => {
                        if (argMode === 'form' && model?.mode === 'fields') {
                          const payload = argsToPayload(effectiveState, currentTool.inputSchema);
                          updateArgs({ ...effectiveState, mode: 'json', jsonText: payload.ok ? JSON.stringify(payload.value, null, 2) : effectiveState.jsonText || '{}' });
                        }
                        setArgMode('json');
                      }}>JSON</Btn>
                      <span className="mp-hint">{model?.mode === 'fields' ? `${model.fields.length} 个参数` : '复杂 schema，用 JSON 编辑'}</span>
                    </div>

                    {argMode === 'form' && model?.mode === 'fields' ? (
                      <div style={{ marginTop: 8 }}>
                        {model.fields.map((f) => (
                          <Field key={f.name} label={`${f.name}${f.required ? ' *' : ''}`} hint={`${f.type}${f.description ? ` · ${f.description.slice(0, 60)}` : ''}`}>
                            <FieldInput
                              f={f}
                              value={effectiveState.values[f.name] || ''}
                              onChange={(v) => updateArgs({ ...effectiveState, values: { ...effectiveState.values, [f.name]: v } })}
                            />
                          </Field>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          className="mp-inp mono"
                          style={{ minHeight: 110 }}
                          value={effectiveState.jsonText}
                          onChange={(e) => updateArgs({ ...effectiveState, mode: argMode, jsonText: e.target.value })}
                          placeholder="{}"
                        />
                      </div>
                    )}

                    <div className="mp-row" style={{ marginTop: 10 }}>
                      <Btn onClick={call} disabled={calling || connecting}>
                        {calling ? '调用中…' : '调用'}
                      </Btn>
                      <span className="mp-hint">调用会记入历史（可重放）</span>
                    </div>

                    {result ? (
                      <div style={{ marginTop: 10 }}>
                        <div className="mp-row">
                          <Badge tone={result.isError ? 'bad' : 'good'}>{result.isError ? 'isError' : '成功'}</Badge>
                          <Badge tone="mute">{prettyMs(result.durationMs)}</Badge>
                          <Badge tone="mute">{result.source === 'host' ? 'cap.mcp 聚合文本' : '原始结果'}</Badge>
                        </div>
                        <JsonView text={result.text} maxH={420} />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
