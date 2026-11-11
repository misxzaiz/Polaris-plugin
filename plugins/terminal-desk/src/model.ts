/**
 * terminal-desk 模型层：纯逻辑在 shared/td-core.js（面板/MCP/测试三方同源），
 * 本文件只做 TS 类型声明 + 转发 + 浏览器侧 base64 编解码。
 */
import * as core from '../shared/td-core.js';

export type AutoRunTrigger = 'app_start' | 'workspace_open' | 'terminal_open';
export type ScriptTab = 'project' | 'custom';

export interface SessionMeta {
  id: string;
  name: string;
  /** null = 运行中；number = 已退出（exitCode） */
  exitCode: number | null;
  scriptId?: string;
  cwd?: string | null;
}

/** 宿主 cap.terminal list 返回的会话结构（Rust TerminalSession，camelCase） */
export interface HostSession {
  id: string;
  name: string;
  cwd?: string | null;
  closed?: boolean;
  purpose?: string;
  scriptId?: string;
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

/** 自定义命令（字段与内置 TerminalScript 对齐，便于旧数据迁移） */
export interface CustomCommand {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  tags?: string[];
  source?: string;
  enabled?: boolean;
  autoRun?: boolean;
  autoRunTrigger?: AutoRunTrigger;
  confirmBeforeAutoRun?: boolean;
  createdAt: number;
}

/** 统一脚本行模型（项目发现 + 自定义共用渲染与菜单） */
export interface ScriptRow {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  custom: boolean;
  autoRun?: boolean;
  autoRunTrigger?: AutoRunTrigger;
  confirmBeforeAutoRun?: boolean;
}

export interface AutoRunRule {
  enabled: boolean;
  trigger: AutoRunTrigger;
  confirm: boolean;
}

export interface UiState {
  scriptCenterCollapsed: boolean;
  scriptTab: ScriptTab;
  focusMode: boolean;
}

export interface PluginConfig {
  customCommands: CustomCommand[];
  hiddenScriptIds: string[];
  autoRunRules: Record<string, AutoRunRule>;
  sessionNames: Record<string, string>;
  uiState: UiState;
  legacyMigration: string;
}

export type ScriptRunStatus = 'running' | 'stopped' | 'failed' | 'success';

export interface ScriptRuntime {
  status: ScriptRunStatus;
  terminalSessionId?: string;
  lastRunAt: number;
  exitCode?: number | null;
  error?: string;
}

export interface AutoRunCandidate {
  id: string;
  trigger: AutoRunTrigger;
  key: string;
  needsConfirm: boolean;
}

export interface LegacyImport {
  commands: CustomCommand[];
  hiddenScriptIds: string[];
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
export const mergeRecoveredSessions = core.mergeRecoveredSessions as (
  local: SessionMeta[],
  remote: HostSession[],
) => { sessions: SessionMeta[]; recoveredIds: string[] };
export const isDangerousCommand = core.isDangerousCommand as (command: string) => boolean;
export const confirmMessageFor = core.confirmMessageFor as (command: string) => string;
export const isCustomScript = core.isCustomScript as (script: { id: string }) => boolean;
export const makeCustomCommand = core.makeCustomCommand as (
  name: string,
  command: string,
  cwd?: string,
) => CustomCommand;
export const parseCustomCommands = core.parseCustomCommands as (
  config: unknown,
) => CustomCommand[];
export const parsePluginConfig = core.parsePluginConfig as (config: unknown) => PluginConfig;
export const parseLegacyTerminalScripts = core.parseLegacyTerminalScripts as (
  raw: unknown,
  workspacePath: string | null,
) => LegacyImport;
export const mergeImportedCommands = core.mergeImportedCommands as (
  existing: CustomCommand[],
  imported: CustomCommand[],
) => { commands: CustomCommand[]; addedCount: number };
export const mergeHiddenIds = core.mergeHiddenIds as (
  existing: string[],
  imported: string[],
) => string[];
export const setRuntime = core.setRuntime as (
  runtimes: Record<string, ScriptRuntime>,
  scriptId: string,
  patch: Partial<ScriptRuntime>,
) => Record<string, ScriptRuntime>;
export const selectRecentScript = core.selectRecentScript as <T extends { id: string }>(
  scripts: T[],
  runtimes: Record<string, ScriptRuntime>,
) => T | null;
export const autoRunCandidates = core.autoRunCandidates as (
  commands: CustomCommand[],
  rules: Record<string, AutoRunRule>,
  trigger: AutoRunTrigger,
  workspacePath: string | null,
  seenKeys: Set<string>,
) => AutoRunCandidate[];
export const isLightThemeId = core.isLightThemeId as (themeId: string) => boolean;
export const CUSTOM_COMMANDS_KEY = core.CUSTOM_COMMANDS_KEY as string;
export const HIDDEN_SCRIPTS_KEY = core.HIDDEN_SCRIPTS_KEY as string;
export const AUTO_RUN_KEY = core.AUTO_RUN_KEY as string;
export const SESSION_NAMES_KEY = core.SESSION_NAMES_KEY as string;
export const UI_STATE_KEY = core.UI_STATE_KEY as string;
export const LEGACY_MIGRATION_KEY = core.LEGACY_MIGRATION_KEY as string;
export const AUTO_RUN_TRIGGERS = core.AUTO_RUN_TRIGGERS as AutoRunTrigger[];

// ---------------------------------------------------------------------------
// base64（UTF-8 安全；解码侧一次性转 Uint8Array，避免逐字节字符串拼接）
// ---------------------------------------------------------------------------

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** 大输出批量解码：Uint8Array.from 直接喂 xterm.write，减少 N 次 charCodeAt 循环开销 */
export function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
