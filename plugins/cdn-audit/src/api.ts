/**
 * api.ts —— 服务端口自发现（kv cda.meta → manifest 9891 回退）+ 端点封装。
 * 传输一律走宿主 cap.http 通道（host.ts）。
 */
import { kvGet, svcHttp } from './host';
import type { BaseReport, HistoryItem, MirrorInfo, Settings, StatusInfo, Watch } from './types';

const MANIFEST_PORT = 9891;
let cachedPort = 0;

async function servicePort(): Promise<number> {
  if (cachedPort) return cachedPort;
  const meta = await kvGet<{ port?: number }>('cda.meta');
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

export interface TaskResult {
  ok: boolean;
  runId: string;
  report: BaseReport;
}

export const api = {
  status: () => call<StatusInfo>('GET', '/api/status'),
  settings: () => call<Settings & { mirrors: MirrorInfo[] }>('GET', '/api/settings'),
  saveSettings: (s: Partial<Settings>) => call<Settings & { mirrors: MirrorInfo[] }>('POST', '/api/settings_set', s),
  check: (p: { mode: 'urls' | 'html'; urls?: string[]; html?: string; htmlUrl?: string }) =>
    call<TaskResult>('POST', '/api/check', p),
  mirror: (p: { url?: string; pkg?: string; ver?: string; file?: string }) => call<TaskResult>('POST', '/api/mirror', p),
  sri: (p: { url: string }) => call<TaskResult>('POST', '/api/sri', p),
  watch: (p: { originUrl: string; edgeUrl: string; intervalSec?: number; maxMinutes?: number }) =>
    call<{ ok: boolean; id: string; watch: Watch }>('POST', '/api/watch', p),
  watchList: () => call<{ items: Watch[] }>('GET', '/api/watch_list'),
  watchCancel: (id: string) => call<{ ok: boolean; watch: Watch }>('POST', '/api/watch_cancel', { id }),
  watchDelete: (id: string) => call<{ ok: boolean }>('POST', '/api/watch_delete', { id }),
  purge: (url: string) => call<{ ok: boolean; result: { httpStatus: number; body: string; note: string } }>('POST', '/api/purge', { url }),
  history: () => call<{ items: HistoryItem[] }>('GET', '/api/history'),
  report: (id: string) => call<BaseReport>('POST', '/api/report', { id }),
  historyClear: () => call<{ cleared: boolean }>('POST', '/api/history_clear', {}),
  selftest: () => call<{ ok: boolean; items: { name: string; ok: boolean; detail?: string }[] }>('POST', '/api/selftest', {}),
};
