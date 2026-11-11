/**
 * 展示格式化与状态语义（纯函数）。颜色不是唯一信息通道：状态字母恒显（spec §8.1）。
 */

import type { GitFileStatusKind, GitFileChange } from '../types.ts';

export const STATUS_LETTER: Record<GitFileStatusKind, string> = {
  untracked: 'U',
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  unmerged: 'U',
};

export const STATUS_LABEL: Record<GitFileStatusKind, string> = {
  untracked: '未跟踪',
  modified: '已修改',
  added: '已添加',
  deleted: '已删除',
  renamed: '重命名',
  copied: '复制',
  unmerged: '冲突',
};

/** 语义 token 类名（danger/success/primary；字母恒显，颜色只是辅助） */
export const STATUS_TONE: Record<GitFileStatusKind, 'danger' | 'success' | 'primary'> = {
  untracked: 'danger',
  modified: 'danger',
  added: 'success',
  deleted: 'danger',
  renamed: 'primary',
  copied: 'primary',
  unmerged: 'danger',
};

export function statusLetterOf(change: GitFileChange): string {
  return STATUS_LETTER[change.status] ?? '?';
}

/** 相对时间：秒级 Unix 时间戳 → 「3 分钟前」 */
export function relativeTime(timestampSec?: number | null): string {
  if (!timestampSec || timestampSec <= 0) return '';
  const ms = timestampSec * 1000;
  const diff = Date.now() - ms;
  if (diff < 0) return new Date(ms).toLocaleDateString();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

/** 提交信息首行 */
export function firstLine(message: string): string {
  const idx = message.indexOf('\n');
  return idx === -1 ? message : message.slice(0, idx);
}

/** 路径 → 目录部分（文件名之前的路径）；无目录返回 '' */
export function dirOf(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

/** 路径 → 文件名部分 */
export function baseName(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/**
 * 变更列表分组顺序（spec GP-02，固定）：冲突 → 已暂存 → 未暂存 → 未跟踪。
 * 返回值同时供测试断言。
 */
export interface StatusGroups {
  conflicted: string[];
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}

export function groupChanges(status: {
  conflicted: string[];
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}): StatusGroups {
  return {
    conflicted: status.conflicted,
    staged: status.staged,
    unstaged: status.unstaged,
    untracked: status.untracked,
  };
}

export function totalChangeCount(status: {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: string[];
}): number {
  return status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length;
}
