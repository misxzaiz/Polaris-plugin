/**
 * actions.js —— cap.git 动作清单的单一来源（供 engine.js / main.js / mcp 共用）
 *
 * 与主仓 src-tauri/src/services/router/git_capability.rs 的 KNOWN_ACTIONS /
 * DESTRUCTIVE_ACTIONS 一一对应。全部为 ASCII 直引号字符串、无任何 npm 依赖。
 * 本插件 package.json 为 "type": "module"，故使用 ESM 导出。
 */

/** 已注册动作全集（77 个），顺序与主仓 KNOWN_ACTIONS 常量一致。 */
export const KNOWN_ACTIONS = Object.freeze([
  'is_repository', 'discover_repositories', 'get_status', 'get_diffs',
  'get_log', 'get_log_with_lanes', 'get_commit_details', 'get_file_history', 'init_repository',
  'commit_changes', 'stage_file', 'unstage_file', 'discard_changes',
  'batch_stage', 'batch_unstage', 'batch_discard', 'commit_group', 'get_worktree_diff', 'get_index_diff',
  'get_worktree_file_diff', 'get_index_file_diff', 'get_branches',
  'create_branch', 'checkout_branch', 'delete_branch', 'rename_branch',
  'merge_branch', 'rebase_branch', 'rebase_abort', 'rebase_continue',
  'start_interactive_rebase', 'plan_interactive_rebase',
  'cherry_pick', 'cherry_pick_abort', 'cherry_pick_continue', 'revert',
  'revert_abort', 'revert_continue', 'reset', 'checkout_commit',
  'get_tags', 'create_tag', 'delete_tag', 'get_remotes', 'add_remote',
  'remove_remote', 'detect_host', 'push_branch', 'push_set_upstream',
  'pull', 'fetch', 'stash_list', 'stash_save', 'stash_pop', 'stash_drop',
  'stash_apply', 'stash_show',
  'amend_commit', 'search_log', 'get_reflog',
  'blame_file', 'get_gitignore', 'save_gitignore', 'add_to_gitignore',
  'get_gitignore_templates', 'create_pr', 'get_pr_status',
  'undo_list', 'undo_restore', 'undo_drop',
  'get_operations', 'clear_operations', 'predict_conflicts',
  'get_conflict_state', 'resolve_conflict_file',
  'scan_commit_risk', 'suggest_rebase_todos',
]);

/** 别名归一（主仓 cap.git：get_stash_list → stash_list）。 */
export const ALIASES = Object.freeze({
  get_stash_list: 'stash_list',
});

/**
 * 写类（破坏性）动作集合（46 个）= 主仓 DESTRUCTIVE_ACTIONS。
 * main.js 据此把动作放进全局 FIFO 写队列（同一时刻最多一个写操作）；
 * 宿主侧也据此对 Plugin 来源做权限 gate（本插件 MCP 直连服务，见 README 风险点）。
 */
export const WRITE_ACTIONS = Object.freeze(new Set([
  'commit_changes',
  'stage_file',
  'resolve_conflict_file',
  'unstage_file',
  'batch_stage',
  'batch_unstage',
  'batch_discard',
  'commit_group',
  'discard_changes',
  'reset',
  'init_repository',
  'create_branch',
  'checkout_branch',
  'delete_branch',
  'rename_branch',
  'merge_branch',
  'rebase_branch',
  'rebase_abort',
  'rebase_continue',
  'start_interactive_rebase',
  'cherry_pick',
  'cherry_pick_abort',
  'cherry_pick_continue',
  'revert',
  'revert_abort',
  'revert_continue',
  'checkout_commit',
  'create_tag',
  'delete_tag',
  'add_remote',
  'remove_remote',
  'push_branch',
  'push_set_upstream',
  'pull',
  'fetch',
  'stash_save',
  'stash_pop',
  'stash_drop',
  'stash_apply',
  'amend_commit',
  'save_gitignore',
  'add_to_gitignore',
  'create_pr',
  'undo_restore',
  'undo_drop',
  'clear_operations',
]));

/**
 * R1 零降级：77/77 全部为真实实现，UNSUPPORTED_REASONS 置空。
 * 历史缺口（13 个动作曾显式返回 UNSUPPORTED: <原因>）与逐条补齐记录见
 * service/UNSUPPORTED.md。保留该常量为空对象供 engine / mcp 共用（接口稳定），
 * 但运行时不再有任何 action 走 UNSUPPORTED 分支；严禁静默假成功或返回空数据。
 */
export const UNSUPPORTED_REASONS = Object.freeze({});

/**
 * 真危险动作集（写动作执行前自动创建撤销快照），对齐主仓 SNAPSHOT_ACTIONS。
 * reset 仅 mode=hard 触发（soft/mixed 保留工作区，可由 reset 自身回退），
 * 该额外判定在 main.js 的 needsUndoSnapshot 中完成。
 */
export const SNAPSHOT_ACTIONS = Object.freeze(new Set([
  'discard_changes', 'batch_discard', 'reset', 'checkout_branch',
  'checkout_commit', 'delete_branch', 'rebase_branch', 'start_interactive_rebase',
]));

/** 快照上下文标识（写入 UndoSnapshotMeta.context），对齐主仓 snapshot_context。 */
export const SNAPSHOT_CONTEXTS = Object.freeze({
  discard_changes: 'discard', batch_discard: 'discard',
  reset: 'reset_hard', checkout_branch: 'checkout', checkout_commit: 'checkout',
  delete_branch: 'branch_delete', rebase_branch: 'rebase',
  start_interactive_rebase: 'rebase',
});

/** 动作 → 中文展示名（与主仓 action_label 一致，MCP 工具描述用）。 */
export const ACTION_LABELS = Object.freeze({
  commit_changes: '提交变更', commit_group: '分组提交', stage_file: '暂存文件', unstage_file: '取消暂存',
  batch_stage: '批量暂存', batch_unstage: '批量取消暂存', batch_discard: '批量丢弃变更', discard_changes: '丢弃变更',
  reset: '重置', checkout_branch: '切换分支', checkout_commit: '检出提交', create_branch: '创建分支',
  delete_branch: '删除分支', rename_branch: '重命名分支', merge_branch: '合并分支', rebase_branch: '变基',
  rebase_abort: '中止变基', rebase_continue: '继续变基', start_interactive_rebase: '面板化 Interactive Rebase',
  plan_interactive_rebase: '预览 Interactive Rebase 计划', scan_commit_risk: '提交前风险扫描（Review 门）',
  suggest_rebase_todos: 'fixup!/squash! 整理建议（AI-8）', cherry_pick: 'Cherry-pick',
  cherry_pick_abort: '中止 Cherry-pick', cherry_pick_continue: '继续 Cherry-pick', revert: 'Revert 提交',
  revert_abort: '中止 Revert', revert_continue: '继续 Revert', create_tag: '创建标签', delete_tag: '删除标签',
  add_remote: '添加远程', remove_remote: '删除远程', push_branch: '推送分支', push_set_upstream: '设置上游',
  pull: '拉取', fetch: 'Fetch', stash_save: '保存 Stash', stash_pop: '应用并删除 Stash',
  stash_apply: '应用 Stash', stash_drop: '删除 Stash', amend_commit: '修改提交', init_repository: '初始化仓库',
  save_gitignore: '保存 .gitignore', create_pr: '创建 PR', undo_restore: '撤销恢复', undo_drop: '清理快照',
  clear_operations: '清空操作流水', is_repository: '是否 Git 仓库', discover_repositories: '发现嵌套仓库',
  get_status: '读取仓库状态', get_diffs: '提交间差异', get_log: '提交日志', get_log_with_lanes: '泳道日志',
  get_commit_details: '提交详情', get_file_history: '文件历史', get_worktree_diff: '工作区差异',
  get_index_diff: '暂存区差异', get_worktree_file_diff: '工作区单文件差异', get_index_file_diff: '暂存区单文件差异',
  get_branches: '分支列表', get_tags: '标签列表', get_remotes: '远程列表', detect_host: '识别 Git 托管主机',
  stash_list: 'Stash 列表', stash_show: '查看 Stash 内容', search_log: '搜索提交历史', get_reflog: 'Reflog',
  blame_file: '文件 Blame', get_gitignore: '读取 .gitignore', add_to_gitignore: '追加 .gitignore 规则',
  get_gitignore_templates: '.gitignore 模板', get_pr_status: 'PR 状态', undo_list: '撤销快照列表',
  get_operations: '操作流水', predict_conflicts: '冲突预测', get_conflict_state: '冲突/序列状态',
  resolve_conflict_file: '解决冲突文件',
});

export default {
  KNOWN_ACTIONS,
  ALIASES,
  WRITE_ACTIONS,
  UNSUPPORTED_REASONS,
  ACTION_LABELS,
  SNAPSHOT_ACTIONS,
  SNAPSHOT_CONTEXTS,
};
