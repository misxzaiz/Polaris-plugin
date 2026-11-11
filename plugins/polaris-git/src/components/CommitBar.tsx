/**
 * CommitBar —— 提交区（spec GP-04）：
 * - 范围文案与后端请求参数一致：选择集全为暂存文件 → selectedFiles 定向；否则提交整个 index
 * - 非空 message 才可提交（amend 不在本轮范围）；Ctrl/Cmd+Enter 提交
 * - 写操作执行中禁用并防重；成功清空草稿与选择集；失败保留草稿（草稿按仓库持有于 ChangesTab）
 */
import { useState } from 'react';
import { repoStore } from '../model/repoStore.ts';
import { useRepoState } from '../hooks.ts';

export function CommitBar({
  draft,
  onDraftChange,
  stagedCount,
  selectedStagedPaths,
  onCommitted,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  stagedCount: number;
  selectedStagedPaths: string[];
  onCommitted: () => void;
}) {
  const state = useRepoState();
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const busy = state.writeBusy !== null;

  const useSelection = selectedStagedPaths.length > 0;
  const scopeCount = useSelection ? selectedStagedPaths.length : stagedCount;
  const canCommit = !busy && draft.trim().length > 0 && scopeCount > 0;
  const scopeText =
    scopeCount === 0
      ? '暂无已暂存变更'
      : useSelection
        ? `提交已选 ${selectedStagedPaths.length} 个文件`
        : `提交 ${stagedCount} 个已暂存文件`;

  const submit = (): void => {
    if (!canCommit) return;
    void (async () => {
      const sha = await repoStore.commit(draft, selectedStagedPaths);
      if (sha) {
        onDraftChange('');
        onCommitted();
        setNotice({ kind: 'ok', text: `已提交 ${sha.slice(0, 7)}` });
      } else if (!state.writeError) {
        setNotice({ kind: 'err', text: '提交未完成' });
        return;
      } else {
        return; // writeError 由 ChangesTab 顶部横幅展示
      }
      window.setTimeout(() => setNotice(null), 6000);
    })();
  };

  return (
    <div className="pg-commitbar">
      {notice && (
        <div className={notice.kind === 'ok' ? 'pg-okbar' : 'pg-errorbar'} role="status">
          {notice.text}
        </div>
      )}
      <textarea
        className="pg-commit-input"
        rows={2}
        placeholder={`${scopeText}（Ctrl+Enter 提交）`}
        value={draft}
        disabled={busy}
        aria-label="提交信息"
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="pg-commitbar-row">
        <span className="pg-commit-scope">{scopeText}</span>
        <button
          type="button"
          className="pg-primary-btn"
          disabled={!canCommit}
          title={
            !canCommit
              ? stagedCount === 0 && selectedStagedPaths.length === 0
                ? '先暂存要提交的文件'
                : draft.trim()
                  ? busy
                    ? '正在执行其他操作'
                    : '无可提交内容'
                  : '请输入提交信息'
              : undefined
          }
          onClick={submit}
        >
          {busy ? '提交中…' : '提交'}
        </button>
      </div>
    </div>
  );
}
