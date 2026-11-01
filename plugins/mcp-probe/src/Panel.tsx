/**
 * Panel.tsx —— MCP 调试台面板外壳
 *
 * 自举顺序：读 probe.meta（服务自注册，最多等 ~12s）→ 拉 /api/state + /api/host/tools。
 * 服务离线 → 横幅 + 「重启服务」自救（cap.pluginServiceManager restart）。
 * 轮询：可见时每 8s 拉轻量 state；页面隐藏即暂停（省电，不做后台写入）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readServiceInfo, restartOwnService, svcApi, SvcError, workspacePath, type SvcInfo,
} from './host';
import { TABS, type HostServer, type ProbeState, type TabKey } from './model';
import ServersTab from './ServersTab';
import WorkbenchTab, { type Prefill } from './WorkbenchTab';
import HealthTab from './HealthTab';
import HistoryTab from './HistoryTab';
import { Badge, Btn, Dot } from './ui';

const css = `
.mp-root{position:relative;font:13px/1.55 -apple-system,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#E6EAF2;height:100%;display:flex;flex-direction:column;background:transparent}
.mp-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.mp-body{flex:1;overflow-y:auto;padding:0 0 24px}
.mp-body::-webkit-scrollbar{width:9px;height:9px}
.mp-body::-webkit-scrollbar-thumb{background:#2a2f3a;border-radius:5px;border:2px solid transparent;background-clip:content-box}

.mp-top{position:sticky;top:0;z-index:20;padding:13px 16px 10px;display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,#10141C 75%,rgba(16,20,28,0))}
.mp-logo{width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#3FB950,#58A6FF);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0}
.mp-tt{flex:1;min-width:0}
.mp-tt b{font-size:15px;display:block}
.mp-tt small{color:#8B95A7;font-size:10.5px;display:flex;align-items:center;gap:5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.mp-dot.ok{background:#3FB950;box-shadow:0 0 6px rgba(63,185,80,.7)}
.mp-dot.warn{background:#D29922}
.mp-dot.bad{background:#F85149}
.mp-dot.idle{background:#4d5566}
.mp-tabs{display:flex;gap:4px;overflow-x:auto;max-width:62%}
.mp-tabs::-webkit-scrollbar{display:none}
.mp-tab{background:transparent;border:none;color:#8B95A7;font-size:12px;padding:6px 9px;border-radius:8px;cursor:pointer;position:relative;white-space:nowrap;flex-shrink:0}
.mp-tab:hover{color:#E6EAF2}
.mp-tab.on{background:#1C2330;color:#E6EAF2;font-weight:600}

.mp-banner{margin:0 16px 10px;border:1px solid #5a4316;background:rgba(210,153,34,.08);color:#D29922;border-radius:11px;padding:10px 12px;font-size:12px;line-height:1.6}
.mp-banner .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

.mp-sec-wrap{margin:0 16px 10px}
.mp-sec{display:flex;align-items:center;gap:8px;padding:8px 2px 6px;font-size:13px;font-weight:700}
.mp-sec-bar{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,#3FB950,#58A6FF);flex-shrink:0}
.mp-hint{margin-left:auto;font-size:10.5px;color:#5C6678;font-weight:400}
.mp-sec-actions{margin-left:auto;display:flex;gap:6px}
.mp-sec + .mp-hint{margin-left:0}
.mp-card{background:#161B22;border:1px solid #242C3A;border-radius:13px;margin-bottom:8px;overflow:hidden;min-width:0}
.mp-card-b{padding:11px 13px}
.mp-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.mp-grow{flex:1;min-width:0}
.mp-sub{font-size:10.5px;color:#8B95A7;line-height:1.6;word-break:break-all}
.mp-tag{background:#1C2330;border:1px solid #242C3A;border-radius:5px;padding:1px 7px;font-size:9.5px;color:#8B95A7;white-space:nowrap}
.mp-badge{border-radius:5px;padding:1px 7px;font-size:9.5px;white-space:nowrap;border:1px solid transparent}
.mp-badge.good{background:rgba(63,185,80,.1);color:#3FB950;border-color:#2a5a38}
.mp-badge.warn{background:rgba(210,153,34,.12);color:#D29922;border-color:#5a4316}
.mp-badge.bad{background:rgba(248,81,73,.1);color:#F85149;border-color:#54262c}
.mp-badge.mute{background:#1C2330;color:#8B95A7;border-color:#242C3A}

.mp-btn{background:#2b6cb0;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
.mp-btn:hover{filter:brightness(1.1)}
.mp-btn:disabled{opacity:.45;cursor:not-allowed}
.mp-btn.ghost{background:#232834;color:#E6EAF2;border:1px solid #2a2f3a}
.mp-btn.danger{background:#3a1d22;color:#F85149;border:1px solid #54262c}
.mp-btn.amber{background:#3a2d12;color:#D29922;border:1px solid #5a4316}
.mp-btn.sm{padding:3px 9px;font-size:11px;border-radius:7px}
.mp-inp{background:#12151c;border:1px solid #2a2f3a;border-radius:8px;color:#E6EAF2;padding:7px 10px;font-size:12px;width:100%;min-width:0}
.mp-inp:focus{outline:none;border-color:#2b6cb0}
.mp-inp::placeholder{color:#4d5566}
.mp-inp.mono{font-family:ui-monospace,Consolas,monospace;font-size:11.5px}
textarea.mp-inp{resize:vertical;min-height:64px}
select.mp-inp{appearance:auto}
.mp-field{display:block;margin-bottom:9px}
.mp-field-l{display:flex;align-items:baseline;gap:6px;font-size:11px;color:#8B95A7;margin-bottom:4px}
.mp-field-h{font-style:normal;color:#4d5566;font-size:10px}

.mp-json{background:#0D1117;border:1px solid #21283a;border-radius:9px;padding:9px 11px;font:11px/1.5 ui-monospace,Consolas,monospace;color:#C9D1D9;overflow:auto;max-height:320px;margin:6px 0 0;white-space:pre-wrap;word-break:break-all}
.mp-empty{color:#5C6678;font-size:12px;text-align:center;padding:18px 10px;border:1px dashed #2a2f3a;border-radius:11px;margin:0 2px}
.mp-err{background:rgba(248,81,73,.08);border:1px solid #54262c;color:#F85149;border-radius:9px;padding:8px 11px;font-size:11.5px;margin:6px 0;word-break:break-all}

.mp-tools{display:flex;flex-direction:column;gap:4px}
.mp-tool{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:9px;border:1px solid transparent;cursor:pointer;min-width:0}
.mp-tool:hover{background:#1A2029}
.mp-tool.on{background:#1C2330;border-color:#2b6cb0}
.mp-tool b{font-size:12px;font-family:ui-monospace,Consolas,monospace;flex-shrink:0}
.mp-tool span{font-size:10.5px;color:#8B95A7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-split{display:flex;gap:10px;align-items:flex-start}
.mp-left{width:260px;flex-shrink:0}
.mp-right{flex:1;min-width:0}
@media (max-width:720px){.mp-split{flex-direction:column}.mp-left{width:100%}}
.mp-issues{display:flex;flex-direction:column;gap:5px;margin-top:6px}
.mp-issue{font-size:11.5px;padding:6px 9px;border-radius:8px;line-height:1.5}
.mp-issue.warn{background:rgba(210,153,34,.1);color:#D29922}
.mp-issue.error{background:rgba(248,81,73,.08);color:#F85149}
.mp-kv{font-size:11px;color:#8B95A7}
.mp-kv b{color:#E6EAF2;font-weight:600}
`;

export interface PanelApi {
  api: <T>(method: 'GET' | 'POST', route: string, body?: unknown) => Promise<T>;
  refresh: () => Promise<void>;
  gotoWorkbench: (prefill: Prefill) => void;
  workspace: string;
}

export default function Panel() {
  const [svc, setSvc] = useState<SvcInfo | null>(null);
  const [svcErr, setSvcErr] = useState<string>('');
  const [booting, setBooting] = useState(true);
  const [state, setState] = useState<ProbeState | null>(null);
  const [hostServers, setHostServers] = useState<HostServer[]>([]);
  const [hostErr, setHostErr] = useState<string>('');
  const [tab, setTab] = useState<TabKey>('servers');
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);

  const loadAll = useCallback(async (info: SvcInfo) => {
    try {
      const s = await svcApi<ProbeState>(info, 'GET', '/api/state');
      setState(s);
      setSvcErr('');
    } catch (e) {
      if (e instanceof SvcError && e.offline) { setSvc(null); setSvcErr(e.message); return; }
      setSvcErr(e instanceof Error ? e.message : String(e));
    }
    try {
      const h = await svcApi<{ servers: HostServer[] }>(info, 'GET', '/api/host/tools');
      setHostServers(h.servers || []);
      setHostErr('');
    } catch (e) {
      setHostErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // 自举：等服务自注册 probe.meta（autoStart 冷启动最多 ~10s）
  useEffect(() => {
    aliveRef.current = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (!aliveRef.current) return;
      const info = await readServiceInfo();
      if (info) {
        setSvc(info);
        setBooting(false);
        await loadAll(info);
        return;
      }
      tries += 1;
      if (tries >= 5) { setBooting(false); return; }
      timer = setTimeout(attempt, 2400);
    };
    attempt();
    return () => { aliveRef.current = false; if (timer) clearTimeout(timer); };
  }, [loadAll]);

  // 可见时轻量轮询
  useEffect(() => {
    if (!svc) return undefined;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll(svc);
    }, 8000);
    return () => clearInterval(t);
  }, [svc, loadAll]);

  const api = useCallback(async <T,>(method: 'GET' | 'POST', route: string, body?: unknown): Promise<T> => {
    if (!svc) throw new SvcError('调试台服务未连接', true);
    const r = await svcApi<T>(svc, method, route, body);
    // 关键动作后顺带刷新（不阻塞调用方）
    loadAll(svc);
    return r;
  }, [svc, loadAll]);

  const gotoWorkbench = useCallback((p: Prefill) => {
    setPrefill(p);
    setTab('workbench');
  }, []);
  // Tab 侧通用签名：(serverId, tool?, argsText?) —— 折叠成 Prefill
  const gotoWorkbenchFromTab = useCallback((serverId: string, tool?: string, argsText?: string) => {
    setPrefill({ serverId, tool, argsText });
    setTab('workbench');
  }, []);

  async function onRestartService() {
    setBusy(true);
    try {
      await restartOwnService();
      setSvcErr('');
      setBooting(true);
      let tries = 0;
      const attempt = async () => {
        const info = await readServiceInfo();
        if (info) {
          setSvc(info); setBooting(false); await loadAll(info);
          return;
        }
        tries += 1;
        if (tries < 5) setTimeout(attempt, 2400);
        else setBooting(false);
      };
      setTimeout(attempt, 2000);
    } catch (e) {
      setSvcErr(`重启服务失败：${e instanceof Error ? e.message : String(e)}——请到 设置→插件 里手动启动「MCP 调试台」的服务`);
    } finally {
      setBusy(false);
    }
  }

  const poolById = new Map((state?.pool || []).map((p) => [p.serverId, p]));
  const degraded = !!state?.degraded;

  return (
    <div className="mp-root">
      <style>{css}</style>
      <div className="mp-top">
        <div className="mp-logo">MCP</div>
        <div className="mp-tt">
          <b>MCP 调试台</b>
          <small>
            {booting ? '正在连接调试台服务…' : svc ? (
              <>
                <Dot status={degraded ? 'warn' : 'ok'} />
                服务 v{svc.version}·pid {svc.pid}
                {state ? `·档案 ${state.profiles.length}·历史 ${state.counts.history}` : ''}
              </>
            ) : <Dot status="bad" />}
            {!booting && !svc ? '服务离线' : ''}
            {degraded ? '·kv 降级（内存态）' : ''}
          </small>
        </div>
        <div className="mp-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`mp-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mp-body">
        {!booting && !svc ? (
          <div className="mp-banner">
            <b>调试台服务未运行。</b>
            <div className="mp-sub">服务负责连接池与 MCP 客户端（面板与 AI 工具都委托它）。安装后首次启动约需数秒。</div>
            <div className="row" style={{ marginTop: 8 }}>
              <Btn onClick={onRestartService} disabled={busy}>重启服务</Btn>
              <span className="mp-sub">{svcErr || '若重启无效，请到 设置→插件 确认插件已启用'}</span>
            </div>
          </div>
        ) : null}
        {svc && degraded ? (
          <div className="mp-banner">
            <b>宿主 kv 暂不可达</b>
            <div className="mp-sub">档案/历史来自服务启动时的内存副本，期间的修改不会持久化。恢复后自动回到落库模式。</div>
          </div>
        ) : null}
        {hostErr ? (
          <div className="mp-banner">
            <b>宿主插件工具清单读取失败</b>
            <div className="mp-sub">{hostErr}</div>
          </div>
        ) : null}

        {tab === 'servers' ? (
          <ServersTab
            state={state}
            hostServers={hostServers}
            api={api as PanelApi['api']}
            gotoWorkbench={gotoWorkbenchFromTab}
            workspace={workspacePath()}
          />
        ) : null}
        {tab === 'workbench' ? (
          <WorkbenchTab
            state={state}
            hostServers={hostServers}
            api={api as PanelApi['api']}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
          />
        ) : null}
        {tab === 'health' ? (
          <HealthTab
            state={state}
            hostServers={hostServers}
            api={api as PanelApi['api']}
            poolById={poolById}
            gotoWorkbench={gotoWorkbenchFromTab}
          />
        ) : null}
        {tab === 'history' ? (
          <HistoryTab api={api as PanelApi['api']} state={state} gotoWorkbench={gotoWorkbenchFromTab} />
        ) : null}

        {tab === 'servers' && state ? (
          <div style={{ margin: '2px 16px' }}>
            <Badge tone="mute">
              连接池 {state.pool.length} · 快照 {state.counts.snapshots} · 体检报告 {state.counts.reports}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
}
