/**
 * bridge.ts —— im-bridge 面板宿主桥（对齐 browser-desk 的宿主桥契约）
 *
 * 通道：
 * - 服务调用：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.pluginServiceManager.request
 *   （宿主按 serviceId 转发到本机 127.0.0.1:<port>/dispatch，面板无需知道端口）
 */

type HostInvoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
}

function globals(): HostGlobals {
  return window as unknown as HostGlobals;
}

export function getHostInvoke(): HostInvoke {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__');
  return fn;
}

/** service dispatch 响应形状（cap.pluginServiceManager.request → HTTP JSON） */
interface DispatchResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

/** 经宿主转发调用 im-bridge-service 的 /dispatch */
export async function callService<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const invoke = getHostInvoke();
  const res = await invoke<{ ok?: boolean; result?: DispatchResponse<T> | null; error?: string | null }>(
    'router_dispatch',
    {
      req: {
        target: 'cap.pluginServiceManager',
        payload: {
          action: 'request',
          serviceId: 'im-bridge-service',
          path: '/dispatch',
          body: { action, ...params },
        },
      },
    },
  );
  if (!res.ok) throw new Error(res.error || '宿主转发失败');
  const inner = res.result;
  if (!inner) throw new Error('服务无响应');
  if (!inner.ok) throw new Error(inner.error || '服务调用失败');
  return (inner.result ?? ({} as T)) as T;
}

// ── 类型（与 service/main.js /dispatch 协议对齐）────────────────────────────

export type Platform = 'qqbot' | 'feishu' | 'dingtalk';

export interface PlatformStatus {
  platform: Platform;
  instanceId?: string;
  instanceName?: string;
  connected: boolean;
  connectionState: string;
  error?: string | null;
  errorDetail?: string | null;
  lastActivity?: number | null;
  stats: { received: number; sent: number; errors: number };
  retryCount?: number;
}

export interface PlatformInstance {
  id: string;
  name: string;
  platform: Platform;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  lastActive?: string | null;
}

export interface SessionView {
  conversationId: string;
  engineId: string;
  lastActivity: number;
  messageCount: number;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  qqbot: 'QQ Bot',
  feishu: '飞书',
  dingtalk: '钉钉',
};

/** 各平台配置字段（面板表单用；与 service 适配器消费字段一致） */
export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
}

export const PLATFORM_FIELDS: Record<Platform, FieldDef[]> = {
  qqbot: [
    { key: 'appId', label: 'App ID', type: 'text', placeholder: 'QQ 开放平台应用的 App ID' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'QQ 开放平台应用的 Client Secret' },
    { key: 'sandbox', label: '沙箱环境', type: 'text', placeholder: 'true / false（默认 false）' },
    { key: 'workDir', label: '工作目录', type: 'text', placeholder: '新会话默认工作目录（可选）' },
  ],
  feishu: [
    { key: 'appId', label: 'App ID', type: 'text', placeholder: '飞书开放平台应用的 App ID' },
    { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '飞书开放平台应用的 App Secret' },
    { key: 'workDir', label: '工作目录', type: 'text', placeholder: '新会话默认工作目录（可选）' },
  ],
  dingtalk: [
    { key: 'appId', label: 'App Key', type: 'text', placeholder: '钉钉开放平台应用的 App Key' },
    { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '钉钉开放平台应用的 App Secret' },
    { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: '群机器人 Webhook 地址（可选，回复通道）' },
    { key: 'workDir', label: '工作目录', type: 'text', placeholder: '新会话默认工作目录（可选）' },
  ],
};

/** 连接状态 → 显示文本（对齐宿主 ConnectionStateLabels） */
export function connectionLabel(state: string): string {
  switch (state) {
    case 'disconnected': return '未连接';
    case 'connecting': return '连接中';
    case 'authenticating': return '鉴权中';
    case 'ready': return '已就绪';
    case 'failed': return '连接失败';
    case 'reconnecting': return '重连中';
    default: return state;
  }
}
