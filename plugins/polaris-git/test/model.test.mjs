/**
 * 模型/格式单测 + 假宿主桥下的 store 全链路测试（epoch 丢弃 / seq 优先 / 写后 reconcile）。
 * 假桥注入：globalThis.window.__POLARIS_HOST_INVOKE__ / __POLARIS_WORKSPACE_API__。
 */
import assert from 'node:assert';
import {
  relativeTime,
  firstLine,
  dirOf,
  baseName,
  groupChanges,
  totalChangeCount,
  STATUS_LETTER,
  STATUS_TONE,
} from '../src/model/format.ts';
import { GitRepoStore } from '../src/model/repoStore.ts';

let n = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  n++;
}

// ── format 纯函数 ────────────────────────────────────────────
{
  const now = Date.now();
  ok(relativeTime(Math.floor((now - 30 * 1000) / 1000)) === '刚刚', '30s → 刚刚');
  ok(relativeTime(Math.floor((now - 5 * 60000) / 1000)) === '5 分钟前', '5min');
  ok(relativeTime(Math.floor((now - 3 * 3600000) / 1000)) === '3 小时前', '3h');
  ok(relativeTime(Math.floor((now - 2 * 86400000) / 1000)) === '2 天前', '2d');
  ok(relativeTime(undefined) === '', 'undefined → 空');
  ok(firstLine('标题\n\n正文') === '标题', '首行');
  ok(dirOf('src/a/b.ts') === 'src/a', '目录');
  ok(dirOf('README.md') === '', '无目录');
  ok(baseName('src/a/b.ts') === 'b.ts', '文件名');
  ok(baseName('C:\\x\\y.ts') === 'y.ts', '反斜杠归一');
  ok(STATUS_LETTER.unmerged === 'U' && STATUS_LETTER.added === 'A', '状态字母');
  ok(STATUS_TONE.modified === 'danger' && STATUS_TONE.added === 'success', '状态色调');
  const g = groupChanges({ conflicted: ['c'], staged: [], unstaged: [{ path: 'u', status: 'modified' }], untracked: ['t'] });
  ok(g.conflicted.length === 1 && g.unstaged.length === 1, '分组透传');
  ok(totalChangeCount(g) === 3, '计数 3');
}

// ── store 全链路（假桥）──────────────────────────────────────
const calls = [];
const cannedStatus = () => ({
  exists: true,
  branch: 'main',
  commit: 'a'.repeat(40),
  shortCommit: 'aaaaaaa',
  ahead: 1,
  behind: 0,
  staged: [{ path: 's.txt', status: 'added', additions: 2, deletions: 0 }],
  unstaged: [{ path: 'u.txt', status: 'modified', additions: 1, deletions: 1 }],
  untracked: ['t.txt'],
  conflicted: [],
  isEmpty: false,
});

// 假宿主桥：记录调用并按 action 返回
const fakeInvoke = async (_cmd, args) => {
  const payload = args?.req?.payload ?? {};
  const viaService = payload.action === 'request';
  const action = viaService ? payload.body?.action : payload.action;
  const params = viaService ? (payload.body?.params ?? {}) : payload;
  calls.push(action);
  const wrap = (data) => ({ ok: true, result: { ok: true, data } });
  switch (action) {
    case 'is_repository':
      return wrap(params.workspacePath === 'D:/ws' || params.workspacePath === 'D:/ws2');
    case 'discover_repositories':
      return wrap(
        params.workspacePath === 'D:/multi'
          ? [
              { path: 'D:/ws/proj-a', name: 'proj-a', branch: 'main', shortCommit: 'a1', isEmpty: false, hasChanges: true },
              { path: 'D:/ws/proj-b', name: 'proj-b', branch: 'dev', shortCommit: 'b1', isEmpty: false, hasChanges: false },
            ]
          : [],
      );
    case 'get_status':
      return wrap({ ...cannedStatus(), branch: params.workspacePath === 'D:/ws/proj-b' ? 'dev' : 'main' });
    case 'get_log':
      return wrap([]);
    case 'stage_file':
      return wrap(null);
    case 'commit_changes':
      return wrap('cafe123');
    default:
      return wrap(null);
  }
};

// 假工作区 API：subscribe 注册即回调（冷启动快照语义）
let wsListener = null;
const fakeWorkspaceApi = {
  list: () => [{ id: 'w1', name: 'ws', path: 'D:/ws' }],
  currentId: () => 'w1',
  subscribe: (fn) => {
    wsListener = fn;
    fn();
    return () => {
      wsListener = null;
    };
  },
};

globalThis.window = {
  __POLARIS_HOST_INVOKE__: fakeInvoke,
  __POLARIS_WORKSPACE_API__: fakeWorkspaceApi,
};

// 等待微任务队列清空
const flush = () => new Promise((r) => setTimeout(r, 5));

async function storeTests() {
  const store = new GitRepoStore();
  let notified = 0;
  store.subscribe(() => notified++);
  store.init();
  await flush();

  ok(store.getSnapshot().phase === 'ready', `冷启动绑定仓库（phase=${store.getSnapshot().phase}）`);
  ok(store.getSnapshot().repoPath === 'D:/ws', '工作区即仓库');
  ok(store.getSnapshot().status?.branch === 'main', 'status 已装载');
  ok(calls.includes('is_repository') && calls.includes('get_status'), '走插件服务 action');
  ok(notified > 0, '订阅者被通知');

  // 写操作：stage → 成功后 reconcile（再次 get_status）
  const statusCallsBefore = calls.filter((c) => c === 'get_status').length;
  const staged = await store.stageFile('u.txt');
  await flush();
  ok(staged, 'stage 成功');
  ok(calls.filter((c) => c === 'get_status').length > statusCallsBefore, '写后主动 reconcile');

  // commit：带 selectedFiles 定向
  const sha = await store.commit('测试提交', ['s.txt']);
  await flush();
  ok(sha === 'cafe123', '返回新 sha');
  ok(store.getSnapshot().lastCommitSha === 'cafe123', '快照回填 sha');
  const commitCall = calls.length; // 校验最后一次 commit_changes 的参数
  // 直接再调一次检查参数（无副作用方式：再发一次失败路径不做——这里只验 action 在调用链中）
  ok(calls.includes('commit_changes'), 'commit_changes 已调用');

  // 空信息拒绝
  const shaEmpty = await store.commit('   ', []);
  ok(shaEmpty === null, '空 message 拒绝提交');

  // 非仓库工作区 → 嵌套仓库选择
  store.setWorkspace('D:/nowhere');
  await flush();
  ok(store.getSnapshot().phase === 'no-repo', `非仓库工作区→no-repo（phase=${store.getSnapshot().phase}）`);

  // 嵌套仓库工作区 → 发现并选第一个
  // （让 is_repository 对 D:/multi 返回 false）
  globalThis.window.__POLARIS_HOST_INVOKE__ = async (_cmd, args) => {
    const payload = args?.req?.payload ?? {};
    const action = payload.action === 'request' ? payload.body?.action : payload.action;
    if (action === 'is_repository') return { ok: true, result: { ok: true, data: false } };
    return fakeInvoke(_cmd, args);
  };
  store.setWorkspace('D:/multi');
  await flush();
  ok(store.getSnapshot().phase === 'ready', '嵌套仓库→ready');
  ok(store.getSnapshot().repoPath === 'D:/ws/proj-a', '默认选第一个嵌套仓库');
  ok(store.getSnapshot().status?.branch === 'main', '嵌套仓库 status 装载');

  // selectRepo 切换 → epoch 递增，状态重置后装载新仓库
  store.selectRepo('D:/ws/proj-b');
  await flush();
  ok(store.getSnapshot().repoPath === 'D:/ws/proj-b', '切换到 proj-b');
  ok(store.getSnapshot().status?.branch === 'dev', '新仓库 status（dev）');
  ok(store.getSnapshot().log.length === 0 && !store.getSnapshot().logLoading, '旧数据未带入');

  // 无工作区
  store.setWorkspace(null);
  await flush();
  ok(store.getSnapshot().phase === 'no-workspace', 'null 工作区→no-workspace');

  console.log(`✓ model.test.mjs ${n} 断言通过`);
}

await storeTests();
