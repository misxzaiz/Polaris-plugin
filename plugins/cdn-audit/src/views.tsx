/**
 * views.tsx —— 核验 / 镜像 / SRI / 传播 四个工作 Tab 与共享的报告渲染。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { BaseReport, CheckRow, Finding, HistoryItem, MirrorRow, Verdict, Watch } from './types';

/* ── 通用小件 ─────────────────────────────────────────────────────────────── */

export function VerdictBadge({ v }: { v: Verdict | string }) {
  const map: Record<string, { cls: string; text: string }> = {
    match: { cls: 'ok', text: '✅ 与官方一致' },
    'match-origin': { cls: 'ok', text: '✅ 与源仓库一致' },
    mismatch: { cls: 'bad', text: '🚨 与官方不一致' },
    'cdn-generated': { cls: 'warn', text: '⚠️ CDN 现场生成' },
    unreachable: { cls: 'bad', text: '🚫 不可达' },
    unverifiable: { cls: 'warn', text: '❔ 无法权威核验' },
    error: { cls: 'bad', text: '❌ 出错' },
  };
  const m = map[v] || { cls: 'warn', text: String(v) };
  return <span className={`badge ${m.cls}`}>{m.text}</span>;
}

function ScoreRing({ total }: { total: number }) {
  const color = total >= 90 ? 'var(--ok)' : total >= 60 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div className="score-ring" style={{ borderColor: color, color }}>
      <div className="score-num">{total}</div>
      <div className="score-label">健康分</div>
    </div>
  );
}

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (!findings.length) return <div className="muted">无结论项</div>;
  return (
    <div className="findings">
      {findings.map((f, i) => (
        <div key={i} className={`finding sev-${f.sev}`}>
          <div className="finding-title">
            {f.sev === 'red' ? '❌' : f.sev === 'yellow' ? '⚠️' : f.sev === 'green' ? '✓' : '·'} {f.title}
          </div>
          {f.detail ? <div className="finding-detail">{f.detail}</div> : null}
          {f.fix ? <div className="finding-fix">→ {f.fix}</div> : null}
        </div>
      ))}
    </div>
  );
}

function ReportHeader({ rep }: { rep: BaseReport }) {
  return (
    <div className="report-head">
      {rep.score ? <ScoreRing total={rep.score.total} /> : null}
      <div className="report-meta">
        <div className="report-title">{rep.label || rep.kind}</div>
        <div className="muted">
          {rep.runId} · {(rep.durationMs / 1000).toFixed(1)}s ·
          {rep.counts ? ` 红 ${rep.counts.red} / 黄 ${rep.counts.yellow} / 绿 ${rep.counts.green}` : ''}
        </div>
      </div>
    </div>
  );
}

/* ── 核验 Tab ─────────────────────────────────────────────────────────────── */

function CheckRowTable({ rows }: { rows: CheckRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rows">
      {rows.map((r, i) => (
        <div key={i} className="row-card">
          <div className="row-line" onClick={() => setOpen(open === String(i) ? null : String(i))}>
            <VerdictBadge v={r.verdict} />
            <div className="row-main">
              <div className="row-url" title={r.url}>{r.url}</div>
              <div className="muted">
                {r.cdnLabel || r.host || '?'}{r.pkg ? ` · ${r.pkg}@${r.ver || '?'}` : ''} · {r.tag}
                {r.fetch && r.fetch.ok ? ` · ${(r.fetch.byteLength / 1024).toFixed(1)}KB · ${r.fetch.elapsedMs}ms` : ''}
              </div>
            </div>
            <div className="row-caret">{open === String(i) ? '▾' : '▸'}</div>
          </div>
          {open === String(i) ? (
            <div className="row-detail">
              {r.note ? <div className="finding-detail">{r.note}</div> : null}
              {r.auth ? (
                <div className="muted small">
                  权威口径：{r.auth.tarball ? 'npm tarball ✓' : 'npm tarball ✗'} / {r.auth.dataapi ? 'jsDelivr 口径 ✓' : 'jsDelivr 口径 ✗'}
                  {r.auth.ver ? ` · 版本 ${r.auth.ver}` : ''}
                  {r.auth.sourceNote ? ` · ${r.auth.sourceNote}` : ''}
                </div>
              ) : null}
              {r.sri ? (
                <div className={`small ${r.sri.check === 'match' ? 'ok-text' : 'bad-text'}`}>
                  页面 integrity：{r.sri.check === 'match' ? '与实际内容一致 ✓' : r.sri.check === 'mismatch' ? '与实际内容不符 ✗' : r.sri.check}
                </div>
              ) : null}
              {r.fetch && r.fetch.digests ? (
                <div className="muted small mono">sha256: {r.fetch.digests.sha256}</div>
              ) : null}
              {r.sriTagSuggestion ? (
                <div className="sri-suggest">
                  <span className={`badge ${r.sriTagSuggestion.source === 'official' ? 'ok' : 'warn'}`}>
                    {r.sriTagSuggestion.source === 'official' ? '官方口径 SRI' : '基于本次抓取（无权威源）'}
                  </span>
                  <code className="mono">integrity="{r.sriTagSuggestion.integrity}"</code>
                  <button
                    className="btn btn-mini"
                    onClick={() => {
                      navigator.clipboard?.writeText(r.sriTagSuggestion!.integrity).catch(() => {});
                    }}
                  >复制</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function CheckTab({ initialReport, onReportDone }: { initialReport?: BaseReport | null; onReportDone?: (r: BaseReport) => void }) {
  const [mode, setMode] = useState<'urls' | 'html'>('urls');
  const [urls, setUrls] = useState('');
  const [htmlUrl, setHtmlUrl] = useState('');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rep, setRep] = useState<BaseReport | null>(initialReport || null);

  useEffect(() => { if (initialReport) setRep(initialReport); }, [initialReport]);

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const p = mode === 'urls'
        ? { mode: 'urls' as const, urls: urls.split('\n').map((x) => x.trim()).filter(Boolean) }
        : htmlUrl.trim() ? { mode: 'html' as const, htmlUrl: htmlUrl.trim() } : { mode: 'html' as const, html };
      if (mode === 'urls' && (!p.urls || !p.urls.length)) throw new Error('请先粘贴至少一个资源 URL');
      if (mode === 'html' && !htmlUrl.trim() && !html.trim()) throw new Error('请填页面 URL 或粘贴 HTML');
      const r = await api.check(p);
      setRep(r.report);
      onReportDone?.(r.report);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [mode, urls, htmlUrl, html, onReportDone]);

  const rows = (rep?.rows || []) as CheckRow[];
  const isCheck = rep?.kind === 'check';

  return (
    <div className="tab-body">
      <div className="card">
        <div className="seg">
          <button className={`seg-btn ${mode === 'urls' ? 'on' : ''}`} onClick={() => setMode('urls')}>URL 列表</button>
          <button className={`seg-btn ${mode === 'html' ? 'on' : ''}`} onClick={() => setMode('html')}>HTML 页面</button>
        </div>
        {mode === 'urls' ? (
          <textarea
            className="input"
            rows={5}
            placeholder={'每行一个资源 URL，例：\nhttps://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js\nhttps://cdnjs.cloudflare.com/ajax/libs/vue/3.4.0/vue.global.prod.min.js'}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
          />
        ) : (
          <>
            <input className="input" placeholder="页面 URL（抓取后审计其中的外链；留空则用下方粘贴内容）" value={htmlUrl} onChange={(e) => setHtmlUrl(e.target.value)} />
            <textarea
              className="input"
              rows={5}
              placeholder="或直接粘贴 HTML 片段"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
            />
          </>
        )}
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? '核验中…' : '开始核验'}</button>
          <span className="muted small">逐个抓取并与官方发布内容（npm tarball / jsDelivr 口径 / cdnjs SRI）哈希比对</span>
        </div>
        {error ? <div className="error-line">✗ {error}</div> : null}
      </div>

      {rep && isCheck ? (
        <div className="card">
          <ReportHeader rep={rep} />
          <FindingsList findings={rep.findings} />
          {rep.summary ? (
            <div className="muted small summary-line">
              资源 {rep.summary.total}：一致 {rep.summary.match} · 不一致 {rep.summary.mismatch} · 不可达 {rep.summary.unreachable} · 无法核验 {rep.summary.unverifiable} · CDN 生成 {rep.summary.cdnGenerated}
            </div>
          ) : null}
          <CheckRowTable rows={rows} />
        </div>
      ) : null}
    </div>
  );
}

/* ── 镜像 Tab ─────────────────────────────────────────────────────────────── */

export function MirrorTab() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rep, setRep] = useState<BaseReport | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!input.trim()) throw new Error('请先粘贴一个资源 URL（推荐带版本号）');
      const r = await api.mirror({ url: input.trim() });
      setRep(r.report);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [input]);

  const rows = (rep?.rows || []) as MirrorRow[];
  return (
    <div className="tab-body">
      <div className="card">
        <input
          className="input"
          placeholder="资源 URL，例：https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) run(); }}
        />
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? '探测中…' : '镜像矩阵'}</button>
          <span className="muted small">同一文件在各公共 CDN 的可达性（ms）与内容一致性（从你的网络实测）</span>
        </div>
        {error ? <div className="error-line">✗ {error}</div> : null}
      </div>
      {rep && rep.kind === 'mirror' ? (
        <div className="card">
          <ReportHeader rep={rep} />
          {rep.summary ? (
            <div className="muted small summary-line">
              可达 {rep.summary.reachable}/{rep.summary.total} · 与官方一致 {rep.summary.match} · 不一致 {rep.summary.mismatch}
            </div>
          ) : null}
          <table className="table">
            <thead><tr><th>镜像</th><th>状态</th><th>延迟</th><th>大小</th><th>结论</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.verdict === 'mismatch' ? 'tr-bad' : ''}>
                  <td>{r.label}{r.crossFamily ? <span className="muted small">（跨族）</span> : null}</td>
                  <td className="mono">{r.status || '-'}</td>
                  <td className="mono">{r.elapsedMs != null ? `${r.elapsedMs}ms` : '-'}</td>
                  <td className="mono">{r.byteLength ? `${(r.byteLength / 1024).toFixed(1)}K` : '-'}</td>
                  <td><VerdictBadge v={r.verdict} /></td>
                  <td className="muted small">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <FindingsList findings={rep.findings} />
        </div>
      ) : null}
    </div>
  );
}

/* ── SRI Tab ──────────────────────────────────────────────────────────────── */

export function SriTab() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rep, setRep] = useState<BaseReport | null>(null);
  const [copied, setCopied] = useState('');

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    }).catch(() => {});
  };

  const run = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!input.trim()) throw new Error('请先粘贴资源 URL');
      const r = await api.sri({ url: input.trim() });
      setRep(r.report);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [input]);

  return (
    <div className="tab-body">
      <div className="card">
        <input
          className="input"
          placeholder="资源 URL（带版本号的 npm 系/cdnj s 系可获得官方口径）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) run(); }}
        />
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? '生成中…' : '生成 SRI 标签'}</button>
          <span className="muted small">内容与官方一致时哈希即官方哈希；不一致时明确警告，绝不给篡改内容背书</span>
        </div>
        {error ? <div className="error-line">✗ {error}</div> : null}
      </div>
      {rep && rep.kind === 'sri' && rep.tags ? (
        <div className="card">
          <ReportHeader rep={rep} />
          <div className={`sri-source ${rep.tagSource === 'mismatch' ? 'bad-text' : ''}`}>
            {rep.tagSource === 'official' ? '✅ 官方口径（与权威源一致）' : rep.tagSource === 'mismatch' ? '🚨 内容与官方不一致——以下标签仅供取证，切勿引用！' : '⚠️ 基于本次抓取（未获得权威源）'}
            <div className="muted small">{rep.tagNote}</div>
          </div>
          <div className="tag-block">
            <div className="tag-line">
              <span className="muted small">integrity 属性</span>
              <button className="btn btn-mini" onClick={() => copy('i', rep.tags!.integrity)}>{copied === 'i' ? '已复制' : '复制'}</button>
            </div>
            <code className="mono block">{rep.tags.integrity}</code>
          </div>
          <div className="tag-block">
            <div className="tag-line">
              <span className="muted small">script 标签</span>
              <button className="btn btn-mini" onClick={() => copy('s', rep.tags!.script)}>{copied === 's' ? '已复制' : '复制'}</button>
            </div>
            <code className="mono block">{rep.tags.script}</code>
          </div>
          <div className="tag-block">
            <div className="tag-line">
              <span className="muted small">link 标签</span>
              <button className="btn btn-mini" onClick={() => copy('l', rep.tags!.link)}>{copied === 'l' ? '已复制' : '复制'}</button>
            </div>
            <code className="mono block">{rep.tags.link}</code>
          </div>
          <FindingsList findings={rep.findings} />
        </div>
      ) : null}
    </div>
  );
}

/* ── 传播观测 Tab ─────────────────────────────────────────────────────────── */

export function WatchTab() {
  const [originUrl, setOriginUrl] = useState('');
  const [edgeUrl, setEdgeUrl] = useState('');
  const [intervalSec, setIntervalSec] = useState(20);
  const [maxMinutes, setMaxMinutes] = useState(120);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [purgeUrl, setPurgeUrl] = useState('');
  const [purgeMsg, setPurgeMsg] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.watchList();
      setWatches(r.items || []);
    } catch (_) { /* 服务未起时静默 */ }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      if (!originUrl.trim() || !edgeUrl.trim()) throw new Error('请填写 origin 与 edge 两个 URL');
      await api.watch({ originUrl: originUrl.trim(), edgeUrl: edgeUrl.trim(), intervalSec, maxMinutes });
      setOriginUrl('');
      setEdgeUrl('');
      await refresh();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    setPurgeMsg('');
    try {
      if (!purgeUrl.trim()) throw new Error('请填写要 purge 的 jsDelivr URL');
      const r = await api.purge(purgeUrl.trim());
      setPurgeMsg(`✅ ${r.result.note}`);
      setPurgeUrl('');
    } catch (e) {
      setPurgeMsg(`✗ ${String((e as Error).message || e)}`);
    }
  };

  const statusCls: Record<string, string> = {
    running: 'warn', equal: 'ok', timeout: 'bad', cancelled: 'muted', interrupted: 'bad',
  };

  return (
    <div className="tab-body">
      <div className="card">
        <div className="form-title">新建传播观测（origin vs edge 哈希对账）</div>
        <input className="input" placeholder="源端 URL（发布真相，如 https://raw.githubusercontent.com/user/repo/main/file.json）" value={originUrl} onChange={(e) => setOriginUrl(e.target.value)} />
        <input className="input" placeholder="CDN 边缘 URL（如 https://cdn.jsdelivr.net/gh/user/repo@main/file.json）" value={edgeUrl} onChange={(e) => setEdgeUrl(e.target.value)} />
        <div className="inline-fields">
          <label className="small">间隔 <input className="input inline-num" type="number" min={5} max={300} value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value) || 20)} /> 秒</label>
          <label className="small">最长 <input className="input inline-num" type="number" min={1} max={720} value={maxMinutes} onChange={(e) => setMaxMinutes(Number(e.target.value) || 120)} /> 分钟</label>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? '建立中…' : '开始观测'}</button>
          <span className="muted small">两侧内容哈希一致即自动判「已同步」并结束</span>
        </div>
        {error ? <div className="error-line">✗ {error}</div> : null}
      </div>

      <div className="card">
        <div className="form-title">进行中 / 最近观测</div>
        {!watches.length ? <div className="muted">暂无观测。典型用法：插件发版后，对 index.json 的 raw.githubusercontent 与 cdn.jsdelivr.net 各建一端，等边缘同步。</div> : null}
        {watches.map((w) => (
          <div key={w.id} className="watch-card">
            <div className="watch-head">
              <span className={`badge ${statusCls[w.status] || 'warn'}`}>{w.status}</span>
              <span className="muted small">{new Date(w.startedAt).toLocaleString()}{w.finishedAt ? ` → ${new Date(w.finishedAt).toLocaleTimeString()}` : ''}</span>
              {w.status === 'running' ? (
                <button className="btn btn-mini" onClick={async () => { await api.watchCancel(w.id); refresh(); }}>取消</button>
              ) : (
                <button className="btn btn-mini" onClick={async () => { await api.watchDelete(w.id); refresh(); }}>删除</button>
              )}
            </div>
            <div className="watch-urls">
              <div className="small mono" title={w.originUrl}>origin：{w.originUrl}</div>
              <div className="small mono" title={w.edgeUrl}>edge：{w.edgeUrl}</div>
            </div>
            {w.samples.length ? (
              <div className="watch-samples">
                <div className="muted small">最近采样：</div>
                {w.samples.slice(-4).map((s, i) => (
                  <div key={i} className="small mono">
                    {new Date(s.t).toLocaleTimeString()} · origin {s.o.status || '✗'}/{s.o.bytes}B · edge {s.e.status || '✗'}/{s.e.bytes}B {s.equal ? '· ✅ 一致' : '· ×'}
                  </div>
                ))}
              </div>
            ) : <div className="muted small">等待首采…</div>}
            {w.note ? <div className="muted small">{w.note}</div> : null}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="form-title">jsDelivr purge（单发 + 冷却防呆）</div>
        <div className="btn-row">
          <input className="input" placeholder="https://cdn.jsdelivr.net/gh/... 或 /npm/..." value={purgeUrl} onChange={(e) => setPurgeUrl(e.target.value)} />
          <button className="btn" onClick={purge}>Purge</button>
        </div>
        <div className="muted small">冷却期内连发只会被 jsDelivr 静默限流（实测 39~43 分钟），本台默认 10 分钟冷却；purge 后用上方观测对账边缘同步。</div>
        {purgeMsg ? <div className="small">{purgeMsg}</div> : null}
      </div>
    </div>
  );
}
