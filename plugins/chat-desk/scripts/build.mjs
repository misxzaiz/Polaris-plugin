#!/usr/bin/env node
/**
 * chat-desk 构建脚本（P3 重构）：
 * 1. esbuild bundle src/index.tsx → dist/panel.js
 *    - react/react-dom external（宿主 shim）
 *    - `@/...` 别名经 scripts/alias.ts 解析：host 树内部相对化；
 *      宿主共享单例（stores/services/types/...）→ src/shims/* 转发
 * 2. 按 styles[].id 覆盖 plugin.json / update.json 的内联 CSS
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(root);
const srcRoot = join(pluginRoot, 'src');

// alias.ts 是 TS —— 用 esbuild 先转译成可 import 的模块（或直接内联最小实现）。
// 这里内联最小实现，避免构建期额外产物。
const srcRootNorm = srcRoot.split(String.fromCharCode(92)).join('/');
const HOST_PREFIXES = [
  'stores/conversationStore/sessionStoreManager.ts',
  'stores/conversationStore/useActiveSession.ts',
  'stores/conversationStore/conversationStoreUtils.ts',
  'stores/conversationStore/types.ts',
  'stores/conversationStore/',
  'ai-runtime',
  'engines/',
  'session-v2',
  'components/Chat/',
  'plugin-system/uiFrameTypes',
];
function exists(p) { try { readFileSync(p); return true } catch { return false } }
function resolveHostFile(base) {
  for (const cand of [base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx']) {
    if (exists(cand)) return cand
  }
  return base + '.ts'
}
function resolveAlias(sub) {
  // 会话域单实例：manager/hooks/utils 一律走 shims/stores（宿主桥单例），
  // 防止 host/ 拷贝模块被打进面板造成第二实例（状态分裂）。
  if (sub === 'stores/conversationStore/sessionStoreManager' || sub.startsWith('stores/conversationStore/sessionStoreManager')) return join(srcRoot, 'shims', 'stores.ts');
  if (sub === 'stores/conversationStore/useActiveSession' || sub.startsWith('stores/conversationStore/useActiveSession')) return join(srcRoot, 'shims', 'stores.ts');
  if (sub === 'stores/conversationStore/conversationStoreUtils') return join(srcRoot, 'shims', 'stores.ts');
  if (sub === 'stores/conversationStore/types') return join(srcRoot, 'shims', 'stores.ts');
  // 会话域单实例：sessionStoreManager/useActiveSession/... 一律走 shims/stores（宿主桥单例），
  // 不指 host/ 拷贝（否则面板树与宿主各持一份 manager，状态分裂）。
  if (sub.startsWith('stores/conversationStore/')) return join(srcRoot, 'shims', 'stores.ts');
  if (sub === 'stores') return join(srcRoot, 'shims', 'stores.ts');
  // P6：插件自持的本地 store/服务（host/stores、host/services）直接解析到实现文件
  if (sub.startsWith('host/stores/') || sub.startsWith('host/services/') || sub.startsWith('host/utils/')) {
    const p2 = join(srcRoot, sub)
    for (const cand of [p2, p2 + '.ts', p2 + '.tsx', join(p2, 'index.ts')]) {
      if (exists(cand)) return cand
    }
    return p2 + '.ts'
  }
  for (const prefix of HOST_PREFIXES) {
    if (sub === prefix || sub.startsWith(prefix)) {
      const rel = sub
        .replace('stores/conversationStore/', 'conversationStore/')
        .replace('components/Chat/', 'Chat/');
      return resolveHostFile(join(srcRoot, 'host', rel.replace('/', '__sep__')).split('__sep__').join('/'));
    }
  }
  // host/conversationStore 内的根级 store 相对引用已被 onResolve endsWith 分流；
  // 这里兜底 @/stores/<x>（非 conversationStore）→ shims/stores.ts（宿主单例）。
  if (sub.startsWith('types')) return join(srcRoot, 'shims', 'types.ts');
  if (sub.startsWith('services/')) return join(srcRoot, 'shims', 'services.ts');
  // utils 细分：有同名 shim 文件的走专用 shim（避免 barrel 循环依赖），其余回 utils.ts
  if (sub.startsWith('utils/')) {
    const name = sub.slice('utils/'.length);
    const shim = join(srcRoot, 'shims', name + '.ts');
    const shimTsx = join(srcRoot, 'shims', name + '.tsx');
    if (exists(shim)) return shim;
    if (exists(shimTsx)) return shimTsx;
    return join(srcRoot, 'shims', 'utils.ts');
  }
  if (sub.startsWith('hooks/')) return join(srcRoot, 'shims', 'hooks.ts');
  if (sub.startsWith('stores/') || sub === 'stores') return join(srcRoot, 'shims', 'stores.ts');
  return join(srcRoot, 'shims', 'misc.ts');
}

/** host 树内互相引用使用绝对 @/ 别名；tsconfig paths 的 esbuild 等价 = alias plugin */
const aliasPlugin = {
  name: 'chat-desk-alias',
  setup(build) {
    build.onResolve({ filter: /^(react-i18next|i18next)$/ }, () => ({ path: join(srcRoot, 'shims', 'i18n.ts'), external: false }));
    build.onResolve({ filter: /^@\/.*/ }, (args) => {
      const sub = args.path.slice(2);
      return { path: resolveAlias(sub), external: false };
    });
    // host 树源码内的相对引用（../configStore、../../Common/Icons 等）→ shims/host
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      // K-F2：域内统一依赖出口 —— 任何目录里的 `./deps` / `../deps` 都指 src/deps.ts
      //（host/Chat/**、QuickSwitchPanel/、Session/ 等多个目录都这样引）。
      // 必须在 norm 计算前拦：importer 是文件路径，resolve(file, './deps') 会得到错误路径。
      const base = args.path.split('/').pop();
      if (base === 'deps') return { path: join(srcRoot, 'deps.ts'), external: false };
      // K-F2：newSessionPrefsService 在插件根（src/newSessionPrefsService.ts，宿主
      // services 同源拷贝，invoke 改走 deps 桥）。host/Chat/session、Session/ 的
      // `./newSessionPrefsService` 相对引用统一指过去。
      if (base === 'newSessionPrefsService') return { path: join(srcRoot, 'newSessionPrefsService.ts'), external: false };
      // K-F2：session-config 域（engineDisplay/engineCapabilities/五个 store 等）
      // 已随会话域迁入插件 src/session-config（本地同源实现 + bridgeTransport 直连）。
      // host/Chat/**、host/conversationStore、host/services/**、Session/ 的
      // `../session-config/*` 相对引用统一解析到该目录；否则 resolve(file, '../..') 会算错层级。
      if (base !== undefined && args.path.endsWith('session-config') === false && /(^|\/)\.\.\/session-config\//.test(args.path)) {
        const sub = args.path.replace(/^(\.\.\/)+session-config\//, '');
        return { path: resolveHostFile(join(srcRoot, 'session-config', sub)), external: false };
      }
      // 根修：importer 是文件路径，resolve(file, rel) 会把相对段拼到文件名后
      //（src/index.tsx/Session/...），必须先取目录再 resolve。
      const norm = resolve(dirname(args.importer), args.path).split(String.fromCharCode(92)).join('/');
      const srcNorm = srcRoot.split(String.fromCharCode(92)).join('/');
      if (!norm.startsWith(srcNorm)) return null;
      const tail = norm.slice(srcNorm.length + 1);
      // P6：插件自持实现目录（host/services|stores|utils 等）内的相对引用
      // 交还 esbuild 默认解析（这些目录已从宿主拷贝进来，不再转发 shims）。
      if (tail.startsWith('host/services/')
        || tail.startsWith('host/stores/')
        || tail.startsWith('host/utils/')) return null;
      // 宿主共享面 → shims（host/conversationStore 内的根级 store 相对引用、
      // 非 Chat 域组件 Common/Diff/Session/Workspace）
      const hit = tail.startsWith('host/stores/')
        || tail.endsWith('/configStore')
        || tail.endsWith('/workspaceStore')
        || tail.endsWith('/viewStore')
        || tail.endsWith('/sessionConfigStore')
        || tail.endsWith('/toastStore')
        || tail.endsWith('/pluginStore')
        || tail.endsWith('/cliInfoStore')
        || tail.endsWith('/agentStore')
        || tail.endsWith('/engineMetadataStore')
        || tail.endsWith('/modelProfileStore')
        || tail.endsWith('/overlayStore')
        || tail.endsWith('/uiSlotStore')
        || tail.endsWith('/snippetStore')
        || tail.endsWith('/skillStore')
        || tail.endsWith('/compactHandoffStore')
        || tail.endsWith('/dispatchStore')
        || tail.endsWith('/fileEditorStore')
        || tail.endsWith('/index')
        || tail.startsWith('host/conversationStore/configStore')
        || tail.startsWith('host/conversationStore/workspaceStore')
        || tail.startsWith('host/conversationStore/viewStore')
        || tail.startsWith('host/conversationStore/sessionConfigStore')
        || tail.startsWith('host/conversationStore/toastStore')
        || tail.includes('/Common/')
        || tail.includes('/Diff/')
        // K-F2：src/Session/、src/QuickSwitchPanel/ 已是插件本地实现目录，
        // 相对引用交还 esbuild 默认解析（不再转发 shims/misc）。
        || (tail.includes('/Session/') && !tail.startsWith('Session/') && !tail.startsWith('QuickSwitchPanel/') && !tail.startsWith('host/Chat/session/'))
        || (tail.includes('/Workspace/') && !tail.startsWith('Session/') && !tail.startsWith('QuickSwitchPanel/'));
      if (hit) {
        // store 单例 → shims/stores.ts；其余（Common/Diff/...）→ shims/misc.ts
        const isStore = /\/(configStore|workspaceStore|viewStore|sessionConfigStore|toastStore|pluginStore|cliInfoStore|agentStore|engineMetadataStore|modelProfileStore|overlayStore|uiSlotStore|snippetStore|skillStore|compactHandoffStore|dispatchStore|fileEditorStore)\.ts$/.test(tail)
          || tail === 'host/stores/sessionConfigStore.ts'
          || tail.startsWith('host/stores/');
        return { path: join(srcRoot, 'shims', isStore ? 'stores.ts' : 'misc.ts') };
      }
      // 其余相对引用（host 树内部/entry 等）交还 esbuild 默认解析
      return null;
    });
  },
};

await build({
  entryPoints: [join(srcRoot, 'index.tsx')],
  bundle: true,
  format: 'esm',
  outfile: join(pluginRoot, 'dist/panel.js'),
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  plugins: [aliasPlugin],
  sourcemap: false,
  logLevel: 'info',
  metafile: process.env.METAFILE === '1',
}).then((res) => {
  if (process.env.METAFILE === '1') {
    const inputs = Object.keys(res.metafile.inputs)
    // eslint-disable-next-line no-console
    console.log('[metafile] total=', inputs.length)
    // eslint-disable-next-line no-console
    console.log('[metafile] sessionStoreManager inputs=', inputs.filter((k) => k.includes('sessionStoreManager')))
    // eslint-disable-next-line no-console
    console.log('[metafile] useActiveSession inputs=', inputs.filter((k) => k.includes('useActiveSession')))
  }
});

// 样式合成：esbuild 会把组件内 side-effect import 的 CSS（DynamicIsland.css 等）
// 产出到 dist/panel.css；manifest 内联必须合并它与 src/styles.css（全局主题/共享样式），
// 否则组件样式（如悬浮岛）在运行时缺失。
const esbuildCssPath = join(pluginRoot, 'dist/panel.css');
const esbuildCss = exists(esbuildCssPath) ? readFileSync(esbuildCssPath, 'utf8') : '';
const stylesCss = readFileSync(join(srcRoot, 'styles.css'), 'utf8');
const panelCss = [esbuildCss, stylesCss].join(String.fromCharCode(10));
const byId = { panel: panelCss };

for (const filename of ['plugin.json', 'update.json']) {
  const manifestPath = join(pluginRoot, filename);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const styles = manifest?.contributes?.styles;
  if (!Array.isArray(styles) || styles.length === 0) {
    throw new Error(`${filename}: contributes.styles 缺失`);
  }
  const seen = new Set();
  for (const style of styles) {
    if (typeof style?.id !== 'string') continue;
    if (Object.prototype.hasOwnProperty.call(byId, style.id)) {
      style.css = byId[style.id];
      seen.add(style.id);
    }
  }
  for (const id of Object.keys(byId)) {
    if (!seen.has(id)) throw new Error(`${filename}: 未找到 styles[].id="${id}"`);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log('[chat-desk] build ok');
