/**
 * terminal-desk 模型层：纯逻辑在 shared/td-core.js（面板/MCP/测试三方同源），
 * 本文件只做 TS 类型声明 + 浏览器侧 base64 编解码（TextEncoder/btoa，同内置终端）。
 */
import * as core from '../shared/td-core.js';

// 类型声明（运行时实现在 td-core）
export interface SessionMeta {
  id: string;
  name: string;
  /** null = 运行中；number = 已退出（exitCode） */
  exitCode: number | null;
  scriptId?: string;
  cwd?: string | null;
}

export interface DiscoveredScript {
  id: string;
  name: string;
  command: string;
  cwd: string;
  source: string;
  sourcePath: string;
  enabled: boolean;
  tags: string[];
}

export interface CustomCommand {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  createdAt: number;
}

export type ScriptRunStatus = 'running' | 'stopped' | 'failed';

export interface ScriptRuntime {
  status: ScriptRunStatus;
  terminalSessionId?: string;
  lastRunAt: number;
  error?: string;
}

// 纯逻辑转发（单一事实来源 shared/td-core.js）
export const upsertSession = core.upsertSession as (
  sessions: SessionMeta[],
  meta: SessionMeta,
) => SessionMeta[];
export const markExited = core.markExited as (
  sessions: SessionMeta[],
  sessionId: string,
  exitCode: number | null,
) => SessionMeta[];
export const removeSession = core.removeSession as (
  sessions: SessionMeta[],
  sessionId: string,
) => SessionMeta[];
export const nextSessionName = core.nextSessionName as (sessions: SessionMeta[]) => string;
export const isDangerousCommand = core.isDangerousCommand as (command: string) => boolean;
export const confirmMessageFor = core.confirmMessageFor as (command: string) => string;
export const isCustomScript = core.isCustomScript as (script: { id: string }) => boolean;
export const makeCustomCommand = core.makeCustomCommand as (
  name: string,
  command: string,
  cwd?: string,
) => CustomCommand;
export const parseCustomCommands = core.parseCustomCommands as (config: unknown) => CustomCommand[];
export const setRuntime = core.setRuntime as (
  runtimes: Record<string, ScriptRuntime>,
  scriptId: string,
  patch: Partial<ScriptRuntime>,
) => Record<string, ScriptRuntime>;
export const CUSTOM_COMMANDS_KEY = core.CUSTOM_COMMANDS_KEY as string;

// ---------------------------------------------------------------------------
// base64（UTF-8 安全：TextEncoder → btoa；解码侧 atob → Uint8Array 直喂 xterm.write）
// ---------------------------------------------------------------------------

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
