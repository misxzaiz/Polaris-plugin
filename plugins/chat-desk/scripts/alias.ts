/**
 * chat-desk P3 重构 —— 路径别名映射
 *
 * 真实 Chat 组件树（src/host/**）源码里保留 `@/...` 宿主别名。esbuild 构建时
 * 按本表把 `@/xxx` 改写为插件内对应 shim：
 *  - host 树内部（stores/conversationStore、session-v2、ai-runtime、engines、
 *    components/Chat、types、services、utils、hooks、plugin-system 纯类型）→ 相对路径
 *  - 宿主共享单例（sessionStoreManager、configStore、...）→ src/shims/*（从
 *    window.__POLARIS_APP_CORE__ 取宿主同一实例）
 *  - react/react-dom → external（宿主 shim）
 *
 * 这里只导出「别名 → shim 文件」的解析函数，具体改写在 build.mjs 的 onResolve。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** shim 目录（每个映射目标一个 .ts，内容 = 从 appCore 取宿主实例再 re-export） */
const SHIM_DIR = path.join(srcRoot, 'shims');

/** @/xxx → 插件内路径解析。返回绝对文件路径；不可解析返回 null（构建报错）。 */
export function resolveAlias(importPath: string, fromFile: string): string | null {
  if (!importPath.startsWith('@/')) return null;
  const sub = importPath.slice(2);

  // 1. host 树内部相对化
  const hostPrefixes = [
    'stores/conversationStore/',
    'stores/agentStore',
    'stores/cliInfoStore',
    'stores/engineMetadataStore',
    'stores/modelProfileStore',
    'stores/sessionConfigStore',
    'ai-runtime',
    'engines/',
    'session-v2',
    'components/Chat/',
    'plugin-system/uiFrameTypes',
  ];
  // 注意：stores/ 根（configStore/viewStore/toastStore 等）与 services/、utils/、
  // hooks/ 走 shims；components/Chat 下的相对引用自然命中 host 树。
  for (const prefix of hostPrefixes) {
    if (sub === prefix || sub.startsWith(prefix)) {
      // host 树内对应文件
      const rel = sub
        .replace('stores/conversationStore/', 'conversationStore/')
        .replace('components/Chat/', 'Chat/');
      const candidate = path.join(srcRoot, 'host', rel);
      return tryExt(candidate);
    }
  }

  // 2. types/* → host 外共享类型：Chat 域类型已随 host 树（types/chat 等）
  //    但 config/workspace/errors 等混合类型仍从宿主取（经 appCore.types）——
  //    简化：types/ 全部走 shims/types.ts re-export（宿主 index.css 类型无运行时）。
  if (sub.startsWith('types')) {
    return path.join(SHIM_DIR, 'types.ts');
  }

  // 3. services/* → shims（宿主服务单例，桥内已挂）
  if (sub.startsWith('services/') || sub === 'services') {
    return path.join(SHIM_DIR, 'services.ts');
  }

  // 4. utils/* → shims/utils.ts（logger/uuid/path/... 纯函数本地实现 + 宿主共享）
  if (sub.startsWith('utils/')) {
    return path.join(SHIM_DIR, 'utils.ts');
  }

  // 5. hooks/* → shims/hooks.ts
  if (sub.startsWith('hooks/')) {
    return path.join(SHIM_DIR, 'hooks.ts');
  }

  // 6. stores/*（非 conversationStore）→ shims/stores.ts
  if (sub.startsWith('stores/') || sub === 'stores') {
    return path.join(SHIM_DIR, 'stores.ts');
  }

  // 7. i18n / plugin-system / components（非 Chat）/ mobile → shims/misc.ts
  return path.join(SHIM_DIR, 'misc.ts');
}

function tryExt(base: string): string {
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '.js']) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('node:fs').accessSync(base + ext);
      return base + ext;
    } catch { /* next */ }
  }
  try {
    require('node:fs').accessSync(base);
    return base;
  } catch {
    return base + '.ts';
  }
}
