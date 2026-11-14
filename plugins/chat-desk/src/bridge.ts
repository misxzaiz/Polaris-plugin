/**
 * chat-desk bridge.ts —— 宿主桥封装（P2 骨架）
 *
 * 通道（对齐 terminal-desk/multichat 范式）：
 * - 命令：__POLARIS_HOST_INVOKE__('router_dispatch') → cap.ai.chat（宿主引擎运行时）
 * - 事件：__POLARIS_HOST_INVOKE__('router_dispatch_stream') + __POLARIS_HOST_LISTEN__('chat-event')
 *   （chatEvents=full 授权：宿主桥对本插件透传正文 token/thinking/工具流，spec P1.3）
 *
 * 硬约束：禁止直调 __TAURI_INTERNALS__ / 未在白名单的命令。
 */

export type HostInvoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

interface HostGlobals {
  __POLARIS_HOST_INVOKE__?: HostInvoke;
  __POLARIS_HOST_LISTEN__?: (event: string, handler: (payload: unknown) => void) => Promise<() => void>;
}

function globals(): HostGlobals {
  return window as unknown as HostGlobals;
}

export function getHostInvoke(): HostInvoke {
  const fn = globals().__POLARIS_HOST_INVOKE__;
  if (!fn) throw new Error('宿主 invoke 不可用：需要主应用提供 __POLARIS_HOST_INVOKE__（请更新 Polaris 主应用）');
  return fn;
}

export function getHostListen(): NonNullable<HostGlobals['__POLARIS_HOST_LISTEN__']> {
  const fn = globals().__POLARIS_HOST_LISTEN__;
  if (!fn) throw new Error('宿主 listen 不可用：需要主应用提供 __POLARIS_HOST_LISTEN__（请更新 Polaris 主应用）');
  return fn;
}

/** router_dispatch 返回形态（与 commands/router.rs RouterDispatchResponse 对应） */
interface DispatchResponse {
  msgId: string
  ok: boolean
  result: unknown
  error: string | null
  trace: string
}

/** 同步动作：interrupt / answer_question / respond_plugin_card 等 */
export async function aiChatDispatch<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const invoke = getHostInvoke();
  const res = await invoke<DispatchResponse>('router_dispatch', {
    req: { target: 'cap.ai.chat', payload },
  }) as DispatchResponse;
  if (!res.ok) {
    throw new Error(res.error || ('cap.ai.chat ' + String(payload.action ?? '') + ' 失败'));
  }
  return res.result as T;
}

/** 流式动作 ack：start / continue（事件经 chat-event 推送） */
export interface StreamAck {
  msgId: string
  trace: string
}

export async function aiChatDispatchStream(payload: Record<string, unknown>): Promise<StreamAck> {
  const invoke = getHostInvoke();
  const res = await invoke<StreamAck>('router_dispatch_stream', {
    req: { target: 'cap.ai.chat', payload },
  }) as StreamAck;
  return res;
}

/**
 * 订阅 chat-event（宿主 main.tsx 桥按插件 chatEvents=full 授权透传正文流）。
 * 返回 unlisten（异步注册；StrictMode 双挂载安全由调用方处理）。
 */
export function subscribeChatEvent(handler: (envelope: unknown) => void): Promise<() => void> {
  const listen = getHostListen();
  return listen('chat-event', handler);
}
