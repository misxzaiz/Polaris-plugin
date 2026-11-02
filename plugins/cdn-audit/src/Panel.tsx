/**
 * Panel.tsx —— 面板外壳：六个 Tab（核验/镜像/SRI/传播/历史/设置）+ 服务状态条。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { BaseReport, HistoryItem, MirrorInfo, Settings, StatusInfo } from './types';
import { CheckTab, FindingsList, MirrorTab, SriTab, WatchTab } from './views';

type TabId = 'check' | 'mirror' | 'sri' | 'watch' | 'history' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'check', label: '核验' },
  { id: 'mirror', label: '镜像' },
  { id: 'sri', label: 'SRI' },
  { id: 'watch', label: '传播' },
  { id: 'history', label: '历史' },
  { id: 'settings', label: '设置' },
];

export default function Panel() {
  const [tab, setTab] = useState<TabId>('check');
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [svcError, setSvcError] = useState('');
  const [lastReport, setLastReport] = useState<BaseReport | null>(null);
  const [historyJump, setHistoryJump] = useState(0);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setSvcError('');
    } catch (e) {
      setSvcError(String((e as Error).message || e));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 8000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  const openReport = useCallback((r: BaseReport) => {
    setLastReport(r);
    void refreshStatus();
  }, [refreshStatus]);

  const openFromHistory = useCallback(async (id: string) => {
    try {
      const r = await api.report(id);
      setLastReport(r);
      setTab(r.kind === 'mirror' ? 'mirror' : r.kind === 'sri' ? 'sri' : 'check');
    } catch (e) {
      setSvcError(String((e as Error).message || e));
    }
  }, []);

  return (
    <div className="panel">
      <div className="statusbar">
        <span className={`dot ${svcError ? 'dot-bad' : status?.running ? 'dot-warn' : 'dot-ok'}`} />
        <span className="small">
          {svcError
            ? `服务不可达：${svcError.slice(0, 80)}`
            : status
              ? `v${status.version} · 端口 ${status.port}${status.running ? ` · ${status.running.kind} 进行中（${status.running.step}）` : ' · 空闲'}${status.watchesRunning ? ` · ${status.watchesRunning} 个观测运行中` : ''}`
              : '连接中…'}
        </span>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'check' ? <CheckTab initialReport={lastReport && lastReport.kind === 'check' ? lastReport : null} onReportDone={openReport} /> : null}
      {tab === 'mirror' ? <MirrorTab /> : null}
      {tab === 'sri' ? <SriTab /> : null}
      {tab === 'watch' ? <WatchTab /> : null}
      {tab === 'history' ? <HistoryTab onOpen={openFromHistory} refreshKey={historyJump} /> : null}
      {tab === 'settings' ? <SettingsTab onSaved={() => { setHistoryJump(historyJump + 1); void refreshStatus(); }} onSelftest={(items) => { void items; }} /> : null}
    </div>
  );
}

/* ── 历史 ─────────────────────────────────────────────────────────────────── */

function HistoryTab({ onOpen }: { onOpen: (id: string) => void; refreshKey: number }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await api.history();
      setItems(r.items || []);
      setError('');
    } catch (e) {
      setError(String((e as Error).message || e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="tab-body">
      <div className="card">
        <div className="btn-row">
          <button className="btn" onClick={async () => { await api.historyClear().catch(() => {}); refresh(); }}>清空历史</button>
          <span className="muted small">报告保留最近 8 份（记录保留 60 条），经 cap.kv 投影三端可看</span>
        </div>
        {error ? <div className="error-line">✗ {error}</div> : null}
        {!items.length ? <div className="muted">还没有体检记录。</div> : null}
        <div className="history-list">
          {items.map((it) => (
            <div key={it.runId} className="history-item" onClick={() => onOpen(it.runId)}>
              <span className={`badge ${it.counts && it.counts.red ? 'bad' : it.counts && it.counts.yellow ? 'warn' : 'ok'}`}>
                {it.kind === 'check' ? '核验' : it.kind === 'mirror' ? '镜像' : it.kind === 'sri' ? 'SRI' : it.kind}
              </span>
              <div className="history-main">
                <div className="history-label">{it.label}</div>
                <div className="muted small">
                  {new Date(it.at).toLocaleString()}
                  {it.counts ? ` · 红${it.counts.red}/黄${it.counts.yellow}/绿${it.counts.green}` : ''}
                </div>
              </div>
              {it.score != null ? <div className="history-score">{it.score}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 设置 ─────────────────────────────────────────────────────────────────── */

function SettingsTab({ onSaved, onSelftest }: { onSaved: () => void; onSelftest: (items: { name: string; ok: boolean; detail?: string }[]) => void }) {
  const [settings, setSettings] = useState<(Settings & { mirrors?: MirrorInfo[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [selftest, setSelftest] = useState<{ ok: boolean; items: { name: string; ok: boolean; detail?: string }[] } | null>(null);

  useEffect(() => {
    api.settings().then(setSettings).catch((e) => setError(String((e as Error).message || e)));
  }, []);

  if (!settings) return <div className="tab-body"><div className="card">{error ? `✗ ${error}` : '加载中…'}</div></div>;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const s = await api.saveSettings(settings);
      setSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const runSelftest = async () => {
    setBusy(true);
    try {
      const r = await api.selftest();
      setSelftest(r);
      onSelftest(r.items);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const toggleMirror = (id: string) => {
    const has = settings.enabledMirrors.includes(id);
    setSettings({
      ...settings,
      enabledMirrors: has ? settings.enabledMirrors.filter((x) => x !== id) : [...settings.enabledMirrors, id],
    });
  };

  return (
    <div className="tab-body">
      <div className="card">
        <div className="form-title">抓取参数</div>
        <div className="inline-fields">
          <label className="small">超时 <input className="input inline-num" type="number" min={3} max={60} value={Math.round(settings.timeoutMs / 1000)} onChange={(e) => setSettings({ ...settings, timeoutMs: (Number(e.target.value) || 15) * 1000 })} /> 秒</label>
          <label className="small">单资源上限 <input className="input inline-num" type="number" min={1} max={100} value={settings.maxBytesMB} onChange={(e) => setSettings({ ...settings, maxBytesMB: Number(e.target.value) || 25 })} /> MB</label>
          <label className="small">purge 冷却 <input className="input inline-num" type="number" min={0} max={120} value={settings.purgeCooldownMin} onChange={(e) => setSettings({ ...settings, purgeCooldownMin: Number(e.target.value) || 0 })} /> 分钟</label>
        </div>
        <label className="small">
          出网代理（直连失败/CN 网络用，如 127.0.0.1:7890，留空走系统代理探测）
          <input className="input" placeholder="留空 = 自动（系统代理）" value={settings.proxy} onChange={(e) => setSettings({ ...settings, proxy: e.target.value })} />
        </label>
        <div className="form-title">镜像矩阵启用项</div>
        <div className="mirror-chips">
          {(settings.mirrors || []).map((m) => (
            <button
              key={m.id}
              className={`chip ${settings.enabledMirrors.includes(m.id) ? 'on' : ''}`}
              onClick={() => toggleMirror(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={save}>{saved ? '已保存 ✓' : busy ? '保存中…' : '保存设置'}</button>
          <button className="btn" disabled={busy} onClick={runSelftest}>跑自检</button>
        </div>
        {error ? <div className="error-line">✗ {error}</div> : null}
        {selftest ? (
          <div className="selftest">
            <div className={selftest.ok ? 'ok-text' : 'bad-text'}>{selftest.ok ? '自检全绿 ✅' : '自检存在失败 ❌'}</div>
            <FindingsList findings={selftest.items.map((x) => ({ sev: x.ok ? 'green' : 'red', code: 'selftest', title: x.name, detail: x.ok ? '' : x.detail }))} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
