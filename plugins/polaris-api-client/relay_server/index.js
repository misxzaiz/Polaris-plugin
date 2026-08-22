// relay_server/index.js — 组装并导出 createHandler（替代 __init__.py 的 Handler 导出角色）。
// createHandler({root}) 返回一个 (req,res) 请求监听器；root 默认 = 项目根（relay_server 的父目录）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatch } from './handler.js';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function createHandler({ root = REPO_ROOT } = {}) {
  return (req, res) => dispatch(req, res, root);
}

export { REPO_ROOT };
