import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DiffResult, DirResult, JsonChange, Row, Span, UrlSideMeta } from './types';

/* ---------- 主题变量（宿主 token 优先，回退内置色） ---------- */

const C = {
  text: 'var(--p-text, #d4d4d8)',
  dim: 'var(--p-dim, #9ca3af)',
  accent: 'var(--p-accent, #4a7dff)',
  border: 'var(--p-border, rgba(128,128,128,0.25))',
  panelBg: 'var(--p-bg-2, rgba(128,128,128,0.08))',
  insBg: 'rgba(63,185,80,0.16)',
  insFg: 'var(--p-success, #3fb950)',
  delBg: 'rgba(248,81,73,0.14)',
  delFg: 'var(--p-danger, #f85149)',
  modFg: 'var(--p-warning, #d29922)',
  orderFg: 'var(--p-info, #58a6ff)',
};

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
.dfx-wrap { color: ${C.text}; font-size: 13px; }
.dfx-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dfx-btn { background: ${C.accent}; color: #fff; border: none; border-radius: 6px;
  padding: 6px 14px; font-size: 13px; cursor: pointer; }
.dfx-btn:disabled { opacity: 0.5; cursor: default; }
.dfx-btn2 { background: transparent; color: ${C.text}; border: 1px solid ${C.border};
  border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
.dfx-btn2:disabled { opacity: 0.5; cursor: default; }
.dfx-input { flex: 1; min-width: 120px; background: transparent; color: ${C.text};
  border: 1px solid ${C.border}; border-radius: 6px; padding: 6px 8px; font-size: 13px;
  font-family: ui-monospace, Consolas, monospace; }
.dfx-area { width: 100%; box-sizing: border-box; min-height: 120px; resize: vertical;
  background: transparent; color: ${C.text}; border: 1px solid ${C.border};
  border-radius: 6px; padding: 8px; font-size: 12.5px; line-height: 1.5;
  font-family: ui-monospace, Consolas, monospace; }
.dfx-label { color: ${C.dim}; font-size: 12px; }
.dfx-badge { display: inline-block; border-radius: 10px; padding: 1px 8px; font-size: 11.5px; }
.dfx-badge-ins { background: ${C.insBg}; color: ${C.insFg}; }
.dfx-badge-del { background: ${C.delBg}; color: ${C.delFg}; }
.dfx-badge-mod { color: ${C.modFg}; border: 1px solid ${C.modFg}; }
.dfx-badge-order { color: ${C.orderFg}; border: 1px solid ${C.orderFg}; }
.dfx-err { border: 1px solid ${C.delFg}; color: ${C.delFg}; border-radius: 6px;
  padding: 8px 10px; font-size: 12.5px; white-space: pre-wrap; }
.dfx-note { color: ${C.dim}; font-size: 11.5px; }
.dfx-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.dfx-table td { border-top: 1px solid ${C.border}; padding: 5px 8px;
  vertical-align: top; word-break: break-all; font-family: ui-monospace, Consolas, monospace; }
.dfx-hunkhead { background: ${C.panelBg}; color: ${C.dim}; font-family: ui-monospace, Consolas, monospace;
  font-size: 11.5px; padding: 2px 8px; }
.dfx-line { display: flex; font-family: ui-monospace, Consolas, monospace;
  font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; word-break: break-all; }
.dfx-gutter { flex: 0 0 46px; text-align: right; padding-right: 6px; color: ${C.dim};
  user-select: none; font-size: 11px; }
.dfx-sign { flex: 0 0 14px; user-select: none; }
`;
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}

// 模块加载即注入（面板所有 Tab 共用这套类名）
if (typeof document !== 'undefined') injectStyle();

/* ---------- 通用小组件 ---------- */

export function ErrBanner({ message }: { message: string }) {
  return <div className="dfx-err">{message}</div>;
}

function StatsBadgesText({ stats, truncated }: { stats: { additions: number; deletions: number; modifies: number }; truncated?: boolean }) {
  return (
    <span className="dfx-row">
      <span className="dfx-badge dfx-badge-ins">+{stats.additions}</span>
      <span className="dfx-badge dfx-badge-del">-{stats.deletions}</span>
      <span className="dfx-badge dfx-badge-mod">~{stats.modifies}</span>
      {truncated ? <span className="dfx-note">（输出超上限已截断）</span> : null}
    </span>
  );
}

function StatsBadgesJson({ stats, truncated }: { stats: { changed: number; added: number; removed: number; order: number }; truncated?: boolean }) {
  return (
    <span className="dfx-row">
      <span className="dfx-badge dfx-badge-mod">改 {stats.changed}</span>
      <span className="dfx-badge dfx-badge-ins">增 {stats.added}</span>
      <span className="dfx-badge dfx-badge-del">删 {stats.removed}</span>
      {stats.order ? <span className="dfx-badge dfx-badge-order">顺序 {stats.order}</span> : null}
      {truncated ? <span className="dfx-note">（差异超上限已截断）</span> : null}
    </span>
  );
}

function renderSpans(spans: Span[] | null, baseType: 'delete' | 'insert' | 'modify') {
  if (!spans || !spans.length) return null;
  return spans.map((sp, i) => {
    const color = sp.type === 'equal' ? undefined : baseType === 'insert' ? C.insFg : C.delFg;
    const bg = sp.type === 'equal' ? undefined : baseType === 'insert' ? C.insBg : C.delBg;
    return (
      <span key={i} style={{ color, background: bg, borderRadius: 2 }}>
        {sp.text}
      </span>
    );
  });
}

/* ---------- 文本 diff 视图 ---------- */

export function TextDiffView({ result }: { result: DiffResult }) {
  const [view, setView] = useState<'unified' | 'side'>('side');
  const [hunkIdx, setHunkIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hunks = result.hunks || [];
  const stats = { additions: result.stats.additions || 0, deletions: result.stats.deletions || 0, modifies: result.stats.modifies || 0 };

  const jump = (idx: number) => {
    if (!hunks.length) return;
    const next = ((idx % hunks.length) + hunks.length) % hunks.length;
    setHunkIdx(next);
    const el = hunkRefs.current[next];
    if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const copyPatch = async () => {
    if (!result.patch) return;
    try {
      await navigator.clipboard.writeText(result.patch);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* 剪贴板不可用静默 */ }
  };

  return (
    <div>
      <div className="dfx-row" style={{ marginBottom: 8 }}>
        <StatsBadgesText stats={stats} truncated={result.truncated} />
        <span style={{ flex: 1 }} />
        <button className="dfx-btn2" onClick={() => setView(view === 'side' ? 'unified' : 'side')}>
          {view === 'side' ? '切统一视图' : '切并排视图'}
        </button>
        {hunks.length > 1 ? (
          <>
            <button className="dfx-btn2" onClick={() => jump(hunkIdx - 1)}>上一处</button>
            <span className="dfx-note">{hunkIdx + 1}/{hunks.length}</span>
            <button className="dfx-btn2" onClick={() => jump(hunkIdx + 1)}>下一处</button>
          </>
        ) : null}
        <button className="dfx-btn2" onClick={copyPatch}>{copied ? '已复制 ✓' : '复制 patch'}</button>
      </div>
      {hunks.length === 0 ? (
        <div className="dfx-note">两份内容没有差异。</div>
      ) : (
        hunks.map((h, hi) => (
          <div key={hi} ref={(el) => { hunkRefs.current[hi] = el; }} style={{ marginBottom: 14 }}>
            <div className="dfx-hunkhead">@@ A:{h.aStart} B:{h.bStart} @@</div>
            {view === 'side' ? <SideRows rows={h.rows} /> : <UnifiedLines lines={h.lines} />}
          </div>
        ))
      )}
    </div>
  );
}

function SideRows({ rows }: { rows: Row[] }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
      {rows.map((r, i) => {
        const bgL = r.left && r.left.type !== 'equal' ? (r.left.type === 'delete' ? C.delBg : C.insBg) : undefined;
        const bgR = r.right && r.right.type !== 'equal' ? (r.right.type === 'insert' ? C.insBg : C.delBg) : undefined;
        // modify 左右都是改：左视为删视角、右视为增视角
        return (
          <div key={i} style={{ display: 'flex' }}>
            <div className="dfx-line" style={{ flex: 1, background: bgL, borderRight: `1px solid ${C.border}` }}>
              <span className="dfx-gutter">{r.left ? r.left.no : ''}</span>
              <span className="dfx-sign" style={{ color: C.delFg }}>{r.left && r.left.type !== 'equal' ? '-' : ''}</span>
              <span style={{ flex: 1 }}>
                {r.left ? (r.left.type === 'modify' ? renderSpans(r.left.spans, 'delete') : r.left.text) : ''}
              </span>
            </div>
            <div className="dfx-line" style={{ flex: 1, background: bgR }}>
              <span className="dfx-gutter">{r.right ? r.right.no : ''}</span>
              <span className="dfx-sign" style={{ color: C.insFg }}>{r.right && r.right.type !== 'equal' ? '+' : ''}</span>
              <span style={{ flex: 1 }}>
                {r.right ? (r.right.type === 'modify' ? renderSpans(r.right.spans, 'insert') : r.right.text) : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UnifiedLines({ lines }: { lines: import('./types').LineItem[] }) {
  const out: Array<{ key: string; sign: string; color?: string; bg?: string; aNo?: number; bNo?: number; body: ReactNode }> = [];
  for (const it of lines) {
    if (it.type === 'equal') {
      out.push({ key: `e${it.aNo}`, sign: ' ', aNo: it.aNo, bNo: it.bNo, body: it.text || '' });
    } else if (it.type === 'delete') {
      out.push({ key: `d${it.aNo}`, sign: '-', color: C.delFg, bg: C.delBg, aNo: it.aNo, body: it.text || '' });
    } else if (it.type === 'insert') {
      out.push({ key: `i${it.bNo}`, sign: '+', color: C.insFg, bg: C.insBg, bNo: it.bNo, body: it.text || '' });
    } else {
      out.push({ key: `ma${it.aNo}`, sign: '-', color: C.delFg, bg: C.delBg, aNo: it.aNo, body: renderSpans(it.spans ? it.spans.left : null, 'delete') || it.aText || '' });
      out.push({ key: `mb${it.aNo}`, sign: '+', color: C.insFg, bg: C.insBg, bNo: it.bNo, body: renderSpans(it.spans ? it.spans.right : null, 'insert') || it.bText || '' });
    }
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
      {out.map((l) => (
        <div key={l.key} className="dfx-line" style={{ background: l.bg }}>
          <span className="dfx-gutter">{l.aNo ?? ''}</span>
          <span className="dfx-gutter" style={{ flexBasis: 40 }}>{l.bNo ?? ''}</span>
          <span className="dfx-sign" style={{ color: l.color }}>{l.sign}</span>
          <span style={{ flex: 1 }}>{l.body}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- JSON diff 视图 ---------- */

const TYPE_LABEL: Record<JsonChange['type'], string> = {
  changed: '值变更',
  added: '新增',
  removed: '删除',
  order: '顺序',
};

export function JsonDiffView({ result }: { result: DiffResult }) {
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | JsonChange['type']>('all');
  const changes = result.changes || [];

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return changes.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (!q) return true;
      return c.path.toLowerCase().includes(q) || (c.oldText || '').toLowerCase().includes(q) || (c.newText || '').toLowerCase().includes(q);
    });
  }, [changes, filter, typeFilter]);

  const copyMd = async () => {
    const md = changes.map((c) => {
      if (c.type === 'added') return `- \`${c.path}\` 新增：${c.newText ?? ''}`;
      if (c.type === 'removed') return `- \`${c.path}\` 删除（原 ${c.oldText ?? ''}）`;
      if (c.type === 'order') return `- \`${c.path}\` ${c.note || '顺序变化'}`;
      return `- \`${c.path}\`：${c.oldText ?? ''} → ${c.newText ?? ''}${c.note ? `（${c.note}）` : ''}`;
    }).join('\n');
    try {
      await navigator.clipboard.writeText(md);
    } catch (_) { /* 静默 */ }
  };

  return (
    <div>
      <div className="dfx-row" style={{ marginBottom: 8 }}>
        <StatsBadgesJson stats={{ changed: result.stats.changed || 0, added: result.stats.added || 0, removed: result.stats.removed || 0, order: result.stats.order || 0 }} truncated={result.truncated} />
        <span style={{ flex: 1 }} />
        <input className="dfx-input" style={{ maxWidth: 220, flex: 'none' }} placeholder="按路径/值过滤…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="dfx-btn2" onClick={copyMd}>复制清单</button>
      </div>
      <div className="dfx-row" style={{ marginBottom: 8 }}>
        {(['all', 'changed', 'added', 'removed', 'order'] as const).map((t) => (
          <button
            key={t}
            className="dfx-btn2"
            style={typeFilter === t ? { borderColor: C.accent, color: C.accent } : undefined}
            onClick={() => setTypeFilter(t)}
          >
            {t === 'all' ? '全部' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {!changes.length ? (
        <div className="dfx-note">两个 JSON 在语义上完全一致（键序/数组顺序差异不计）。</div>
      ) : (
        <table className="dfx-table">
          <tbody>
            {shown.map((c, i) => (
              <tr key={i}>
                <td style={{ width: 64, whiteSpace: 'nowrap' }}>
                  <span
                    className={`dfx-badge ${c.type === 'added' ? 'dfx-badge-ins' : c.type === 'removed' ? 'dfx-badge-del' : c.type === 'order' ? 'dfx-badge-order' : 'dfx-badge-mod'}`}
                  >
                    {TYPE_LABEL[c.type]}
                  </span>
                </td>
                <td style={{ width: '38%', color: C.orderFg }}>{c.path}</td>
                <td>
                  {c.type === 'added' ? (
                    <span style={{ color: C.insFg }}>{c.newText}</span>
                  ) : c.type === 'removed' ? (
                    <span style={{ color: C.delFg }}>（原 {c.oldText}）</span>
                  ) : c.type === 'order' ? (
                    <span style={{ color: C.orderFg }}>{c.note}</span>
                  ) : (
                    <>
                      <span style={{ color: C.delFg, textDecoration: 'line-through' }}>{c.oldText}</span>
                      {' → '}
                      <span style={{ color: C.insFg }}>{c.newText}</span>
                      {c.note ? <span className="dfx-note">（{c.note}）</span> : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------- 目录 diff 视图 ---------- */

export function DirDiffView({ result, onOpenPair }: { result: DirResult; onOpenPair: (aPath: string, bPath: string, rel: string) => void }) {
  const lists: Array<{ tag: string; title: string; list: { items: string[]; total: number; truncated: boolean }; color: string }> = [
    { tag: 'Δ', title: '内容有差异', list: result.changed, color: C.modFg },
    { tag: '<', title: '仅 A 有', list: result.onlyLeft, color: C.delFg },
    { tag: '>', title: '仅 B 有', list: result.onlyRight, color: C.insFg },
  ];
  return (
    <div>
      <div className="dfx-row" style={{ marginBottom: 8 }}>
        <span className="dfx-badge dfx-badge-mod">差异 {result.changed.total}</span>
        <span className="dfx-badge dfx-badge-del">仅A {result.onlyLeft.total}</span>
        <span className="dfx-badge dfx-badge-ins">仅B {result.onlyRight.total}</span>
        <span className="dfx-badge" style={{ color: C.dim }}>相同 {result.same}</span>
        {result.unknown ? <span className="dfx-note">未知 {result.unknown}（同大小未哈希）</span> : null}
        <span style={{ flex: 1 }} />
        <span className="dfx-note">
          A {result.aMeta.entries} 项 / B {result.bMeta.entries} 项
          {result.aMeta.skipped || result.bMeta.skipped ? `（跳过不可读 ${(result.aMeta.skipped || 0) + (result.bMeta.skipped || 0)}）` : ''}
        </span>
      </div>
      {lists.map(({ tag, title, list, color }) => (
        <div key={tag} style={{ marginBottom: 12 }}>
          <div className="dfx-label" style={{ color, marginBottom: 4 }}>
            {tag} {title}（{list.total}{list.truncated ? '，截断' : ''}）{tag === 'Δ' ? '— 点击进文件对比' : ''}
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, maxHeight: 260, overflow: 'auto' }}>
            {list.items.length === 0 ? <div className="dfx-note" style={{ padding: '6px 8px' }}>无</div> : list.items.map((p) => (
              <div
                key={p}
                className="dfx-line"
                style={{ padding: '2px 8px', cursor: tag === 'Δ' ? 'pointer' : 'default' }}
                onClick={() => {
                  if (tag !== 'Δ') return; // 单侧独有文件没有配对，不可点
                  onOpenPair(p, p, p);
                }}
              >
                <span style={{ color, marginRight: 8 }}>{tag}</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- URL 对比侧卡 ---------- */

export function UrlSideCard({ tag, side }: { tag: string; side: UrlSideMeta }) {
  const statusColor = side.status >= 200 && side.status < 300 ? C.insFg : side.status === 0 ? C.delFg : C.modFg;
  return (
    <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', minWidth: 240 }}>
      <div className="dfx-row">
        <span className="dfx-badge" style={{ color: statusColor, border: `1px solid ${statusColor}` }}>HTTP {side.status}</span>
        <span className="dfx-label">{tag}</span>
      </div>
      <div className="dfx-note" style={{ marginTop: 4, wordBreak: 'break-all' }}>{side.url}</div>
      <div className="dfx-note" style={{ marginTop: 2 }}>
        {(side.byteLength / 1024).toFixed(1)}KB · {side.elapsedMs}ms
        {side.redirects ? ` · 重定向 ${side.redirects} 跳` : ''}
        {side.contentType ? ` · ${side.contentType.split(';')[0]}` : ''}
        {side.truncated ? ' · 已截断' : ''}
      </div>
    </div>
  );
}
