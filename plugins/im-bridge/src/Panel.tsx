/**
 * Panel.tsx —— IM 机器人管理面板
 *
 * 顶部 Tab 切换 QQ Bot / 飞书 / 钉钉；实例列表 + 配置编辑 + 连接控制。
 * 数据全部经 callService（cap.pluginServiceManager.request → service /dispatch），
 * 面板不直接触达平台或后端命令层。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  callService,
  PLATFORM_FIELDS,
  PLATFORM_LABELS,
  connectionLabel,
  type Platform,
  type PlatformInstance,
  type PlatformStatus,
  type SessionView,
} from './bridge';

type Tab = Platform;

interface Props {
  pluginId?: string;
  onSendToChat?: (message: string) => void | Promise<void>;
}

function stateDotClass(state: string): string {
  if (state === 'ready') return 'dot dot-ready';
  if (state === 'connecting' || state === 'authenticating' || state === 'reconnecting') return 'dot dot-starting';
  return 'dot dot-stopped';
}

export function Panel(_props: Props) {
  const [tab, setTab] = useState<Tab>('qqbot');
  const [statuses, setStatuses] = useState<Record<string, PlatformStatus>>({});
  const [instances, setInstances] = useState<PlatformInstance[]>([]);
  const [activeMap, setActiveMap] = useState<Record<string, string | null>>({});
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PlatformInstance | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [st, inst] = await Promise.all([
        callService<{ platforms: Record<string, PlatformStatus>; sessions: SessionView[] }>('status'),
        callService<{ instances: PlatformInstance[]; activeByPlatform: Record<string, string | null> }>('instances.list'),
      ]);
      setStatuses(st.platforms || {});
      setSessions(st.sessions || []);
      setInstances(inst.instances || []);
      setActiveMap(inst.activeByPlatform || {});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => { refresh(); }, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const tabInstances = useMemo(
    () => instances.filter((i) => i.platform === tab),
    [instances, tab],
  );
  const activeId = activeMap[tab] || null;
  const status = statuses[tab];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(inst: PlatformInstance | null) {
    if (inst) {
      setEditing(JSON.parse(JSON.stringify(inst)));
    } else {
      setEditing({
        id: `${tab}_${Date.now().toString(36)}`,
        name: PLATFORM_LABELS[tab],
        platform: tab,
        enabled: true,
        config: {},
        createdAt: new Date().toISOString(),
      });
    }
  }

  async function saveEditing() {
    if (!editing) return;
    // 沙箱字段规范化
    if (editing.platform === 'qqbot') {
      editing.config.sandbox = String(editing.config.sandbox ?? '').trim().toLowerCase() === 'true';
    }
    const exists = instances.some((i) => i.id === editing.id);
    await run(async () => {
      if (exists) {
        await callService('instances.update', { instance: editing });
      } else {
        await callService('instances.add', { instance: editing });
      }
    });
    setEditing(null);
  }

  const cfgValue = (key: string): string => {
    if (!editing) return '';
    const v = (editing.config as Record<string, unknown>)[key];
    return v == null ? '' : String(v);
  };
  const cfgSet = (key: string, v: string) => {
    if (!editing) return;
    (editing.config as Record<string, unknown>)[key] = v;
    setEditing({ ...editing });
  };

  return (
    <div className="im-root">
      <div className="im-header">
        {(['qqbot', 'feishu', 'dingtalk'] as Tab[]).map((p) => (
          <button
            key={p}
            className={`im-tab${tab === p ? ' on' : ''}`}
            onClick={() => setTab(p)}
            type="button"
          >
            {PLATFORM_LABELS[p]}
            <span className={stateDotClass(statuses[p]?.connectionState || 'disconnected')} />
          </button>
        ))}
        <span className="im-spacer" />
        <button className="im-action" disabled={busy} onClick={() => refresh()} type="button">刷新</button>
      </div>

      {error && <div className="im-error">{error}</div>}

      <div className="im-body">
        {/* 状态卡 */}
        <div className="im-card">
          <div className="im-card-title">
            <span className={stateDotClass(status?.connectionState || 'disconnected')} />
            {PLATFORM_LABELS[tab]} · {connectionLabel(status?.connectionState || 'disconnected')}
          </div>
          <div className="im-kv">
            <span>实例</span><b>{status?.instanceName || '—'}</b>
            <span>收 / 发</span><b>{status?.stats?.received ?? 0} / {status?.stats?.sent ?? 0}</b>
            {status?.error && (<><span>错误</span><b className="im-err-text">{status.error}</b></>)}
          </div>
          <div className="im-row">
            <button className="im-btn" disabled={busy || !activeId} onClick={() => run(() => callService('platform.start', { platform: tab }))} type="button">连接</button>
            <button className="im-btn" disabled={busy || !activeId} onClick={() => run(() => callService('platform.stop', { platform: tab }))} type="button">断开</button>
            <span className="im-spacer" />
            <button className="im-btn primary" disabled={busy} onClick={() => startEdit(null)} type="button">＋ 新增实例</button>
          </div>
        </div>

        {/* 实例列表 */}
        <div className="im-card">
          <div className="im-card-title">实例（{tabInstances.length}）</div>
          {tabInstances.length === 0 && <div className="im-empty">暂无实例，点「新增实例」配置</div>}
          {tabInstances.map((i) => (
            <div className="im-inst" key={i.id}>
              <span className={stateDotClass(i.id === activeId && status?.connected ? 'ready' : 'disconnected')} />
              <span className="im-inst-name">{i.name}</span>
              <span className="im-inst-meta">{i.enabled ? '启用' : '停用'}{i.id === activeId ? ' · 激活' : ''}</span>
              <span className="im-spacer" />
              {!i.enabled && (
                <button className="im-action" disabled={busy} onClick={() => run(async () => {
                  await callService('instances.update', { instance: { ...i, enabled: true } });
                })} type="button">启用</button>
              )}
              {i.enabled && (
                <button className="im-action" disabled={busy} onClick={() => run(async () => {
                  await callService('instances.update', { instance: { ...i, enabled: false } });
                })} type="button">停用</button>
              )}
              {i.id !== activeId && (
                <button className="im-action" disabled={busy} onClick={() => run(() => callService('instances.switch', { instanceId: i.id }))} type="button">激活</button>
              )}
              <button className="im-action" disabled={busy} onClick={() => startEdit(i)} type="button">编辑</button>
              <button className="im-action danger" disabled={busy} onClick={() => run(() => callService('instances.remove', { instanceId: i.id }))} type="button">删除</button>
            </div>
          ))}
        </div>

        {/* 会话概览 */}
        <div className="im-card">
          <div className="im-card-title">最近会话（{sessions.length}）</div>
          {sessions.length === 0 && <div className="im-empty">暂无会话</div>}
          {sessions.slice(0, 8).map((s) => (
            <div className="im-inst" key={s.conversationId}>
              <span className="im-inst-name">{s.conversationId}</span>
              <span className="im-inst-meta">{s.engineId} · {s.messageCount} 条</span>
            </div>
          ))}
        </div>
      </div>

      {/* 编辑弹层 */}
      {editing && (
        <div className="im-mask" onClick={() => setEditing(null)} role="presentation">
          <div className="im-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="im-card-title">
              {instances.some((i) => i.id === editing.id) ? '编辑实例' : '新增实例'} · {PLATFORM_LABELS[editing.platform]}
            </div>
            <div className="im-form">
              <label className="im-field">
                <span>名称</span>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </label>
              {PLATFORM_FIELDS[editing.platform].map((f) => (
                <label className="im-field" key={f.key}>
                  <span>{f.label}</span>
                  <input
                    placeholder={f.placeholder}
                    type={f.type === 'password' ? 'password' : 'text'}
                    value={cfgValue(f.key)}
                    onChange={(e) => cfgSet(f.key, e.target.value)}
                  />
                </label>
              ))}
              <label className="im-field">
                <span>启用</span>
                <input
                  checked={editing.enabled}
                  type="checkbox"
                  onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                />
              </label>
            </div>
            <div className="im-row">
              <span className="im-spacer" />
              <button className="im-btn" disabled={busy} onClick={() => setEditing(null)} type="button">取消</button>
              <button className="im-btn primary" disabled={busy} onClick={saveEditing} type="button">保存并应用</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
