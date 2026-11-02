/**
 * api.ts —— 服务端口自发现（kv dfx.meta → manifest 9877 回退）+ 各端点封装。
 * 传输一律走宿主 cap.http 通道（host.ts），面板不直连端口。
 */
import { kvGet, svcHttp } from './host';
import type { DiffResult, DirResult, HistoryItem, SelftestItem } from './types';

const MANIFEST_PORT = 9877;
let cachedPort = 0;

async function servicePort(): Promise<number> {
  if (cachedPort) return cachedPort;
  const meta = await kvGet<{ port?: number }>('dfx.meta');
  cachedPort = meta && typeof meta.port === 'number' && meta.port > 0 ? meta.port : MANIFEST_PORT;
  return cachedPort;
}

function invalidatePort() {
  cachedPort = 0;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const port = await servicePort();
  const url = `http://127.0.0.1:${port}${path}`;
  try {
    return await svcHttp<T>(method, url, body);
  } catch (e) {
    // 端口可能漂移（服务重启换端口）：失效缓存重试一次
    invalidatePort();
    const port2 = await servicePort();
    if (port2 === port) throw e;
    return svcHttp<T>(method, `http://127.0.0.1:${port2}${path}`, body);
  }
}

export interface DiffOpts {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  contextLines?: number;
  ignorePaths?: string[];
  arrayAlign?: boolean;
}

export const api = {
  status: () => call<{ version: string; port: number; pid: number; uptimeMs: number; historyCount: number }>('GET', '/api/status'),
  settings: () => call<{ proxy: string; proxyNote: string }>('GET', '/api/settings'),
  saveSettings: (s: { proxy: string }) => call<{ proxy: string }>('POST', '/api/settings', s),
  diffText: (a: string, b: string, mode: 'text' | 'json' | undefined, opts: DiffOpts) =>
    call<DiffResult>('POST', '/api/diff_text', { a, b, mode, opts }),
  diffFiles: (aPath: string, bPath: string, mode: 'text' | 'json' | undefined, opts: DiffOpts) =>
    call<DiffResult>('POST', '/api/diff_files', { aPath, bPath, mode, opts }),
  diffDirs: (aPath: string, bPath: string, opts: { includeNodeModules?: boolean; maxEntries?: number }) =>
    call<DirResult>('POST', '/api/diff_dirs', { aPath, bPath, opts }),
  diffUrls: (
    aUrl: string,
    bUrl: string,
    args: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; mode?: 'text' | 'json'; opts?: DiffOpts },
  ) => call<DiffResult>('POST', '/api/diff_urls', { aUrl, bUrl, ...args }),
  history: () => call<{ items: HistoryItem[] }>('GET', '/api/history'),
  historyClear: () => call<{ cleared: boolean }>('POST', '/api/history_clear'),
  selftest: () => call<{ items: SelftestItem[]; allGreen: boolean }>('POST', '/api/selftest', {}),
};
