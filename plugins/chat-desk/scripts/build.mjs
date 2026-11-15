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
      const norm = resolve(args.importer, args.path).split(String.fromCharCode(92)).join('/');
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
        || tail.includes('/Session/')
        || tail.includes('/Workspace/');
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
});

const panelCss = readFileSync(join(srcRoot, 'styles.css'), 'utf8');
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
