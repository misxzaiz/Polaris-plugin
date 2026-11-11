/**
 * DiffView —— 插件自包含 diff 渲染（unified，词级高亮，spec GP-06）。
 *
 * 数据来源两态：
 * - entry：GitDiffEntry（old/new 全文）→ computeLineDiff 现算
 * - patchText：unified patch 文本（stash_show）→ parseUnifiedPatch
 * 专用状态：二进制 / 内容省略 / 大文件截断 / 加载失败 —— 不渲染空白。
 *
 * 【本轮偏差声明】宿主中央 Tab 契约（contributes.tabRenderers）未在本轮范围，
 * 窄宽度下不提供「放大到中央」出口，diff 横向滚动在面板内自持（spec GP-06 的
 * narrow→中央 Tab 规则待 H4 契约落地后补齐）。
 */
import { useMemo } from 'react';
import { computeLineDiff, parseUnifiedPatch } from '../model/diffEngine.ts';
import type { DiffLine, LineDiffResult } from '../model/diffEngine.ts';
import type { GitDiffEntry } from '../types.ts';
import { baseName } from '../model/format.ts';
import { LoadingSkeleton, ErrorNote } from './states.tsx';

const EMPTY_DIFF: LineDiffResult = { hunks: [], additions: 0, deletions: 0, truncated: false };

export function DiffView({
  entry,
  patchText,
  loading,
  error,
  filePath,
}: {
  entry?: GitDiffEntry | null;
  patchText?: string | null;
  loading?: boolean;
  error?: string | null;
  filePath?: string;
}) {
  // hooks 必须无条件调用：patch 解析与 entry 计算在分支前完成
  const parsedPatch = useMemo(
    () => (patchText !== undefined && patchText !== null ? parseUnifiedPatch(patchText) : null),
    [patchText],
  );
  const entryDiff = useMemo(
    () =>
      entry && !entry.is_binary && !entry.content_omitted
        ? computeLineDiff(entry.old_content, entry.new_content)
        : null,
    [entry],
  );

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error) return <ErrorNote message={`diff 加载失败：${error}`} />;
  if (parsedPatch) return <HunkTable filePath={filePath} result={parsedPatch} />;
  if (!entry) return <div className="pg-diff-missing">无 diff 数据</div>;
  if (entry.is_binary) {
    return <div className="pg-diff-special">二进制文件，不渲染内容差异。</div>;
  }
  if (entry.content_omitted) {
    return (
      <div className="pg-diff-special">
        文件过大，宿主已省略内容（+{entry.additions ?? '?'} / -{entry.deletions ?? '?'}）。
      </div>
    );
  }
  return <HunkTable filePath={filePath} result={entryDiff ?? EMPTY_DIFF} />;
}

function HunkTable({ filePath, result }: { filePath?: string; result: LineDiffResult }) {
  if (result.truncated) {
    return (
      <div className="pg-diff-special">
        文件差异过大（{result.additions} 增 / {result.deletions} 删），已跳过逐行渲染。
      </div>
    );
  }
  if (result.hunks.length === 0) {
    return <div className="pg-diff-special">无内容差异。</div>;
  }
  return (
    <div className="pg-diff">
      {filePath && <div className="pg-diff-file" title={filePath}>{baseName(filePath)}</div>}
      <div className="pg-diff-scroll">
        <table className="pg-diff-table">
          <tbody>
            {result.hunks.map((hunk, hi) => (
              <HunkRows key={hi} lines={hunk.lines} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HunkRows({ lines }: { lines: DiffLine[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <tr key={i} className={`pg-dl pg-dl-${line.type}`}>
          <td className="pg-dl-no">{line.aLine ?? ''}</td>
          <td className="pg-dl-no">{line.bLine ?? ''}</td>
          <td className="pg-dl-sign">{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</td>
          <td className="pg-dl-text">
            {line.segments
              ? line.segments.map((seg, si) =>
                  seg.changed ? (
                    <span key={si} className="pg-dl-word">{seg.text}</span>
                  ) : (
                    <span key={si}>{seg.text}</span>
                  ),
                )
              : line.text}
          </td>
        </tr>
      ))}
    </>
  );
}
