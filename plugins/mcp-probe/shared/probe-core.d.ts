/** shared/probe-core.js 的类型声明（实现见 probe-core.js） */

export declare function newId(prefix?: string): string;
export declare function stableStringify(value: unknown): string;

export interface FormField {
  name: string;
  path: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'json';
  required: boolean;
  enum?: unknown[];
  default?: unknown;
  description: string;
  placeholder: string;
}
export interface FormModel {
  mode: 'fields' | 'json';
  fields: FormField[];
  placeholder: string;
}
export declare function deriveFormModel(schema: unknown): FormModel;
export declare function sampleJson(schema: unknown): string;

export interface ToolsetDiff {
  added: string[];
  removed: string[];
  changed: Array<{ name: string; fields: Array<'description' | 'schema'> }>;
  unchangedCount: number;
}
export declare function diffToolsets(
  a: Array<{ name: string; description?: string; inputSchema?: unknown }>,
  b: Array<{ name: string; description?: string; inputSchema?: unknown }>,
): ToolsetDiff;

export interface ToolIssue {
  tool: string;
  level: 'error' | 'warn';
  msg: string;
}
export declare function assessToolset(
  tools: Array<{ name?: string; description?: string; inputSchema?: unknown }>,
): ToolIssue[];

export declare function parseSseMessages(text: string): unknown[];

export declare const CMD_SHIMS: Set<string>;
export type SpawnPlan =
  | { mode: 'direct'; file: string; args: string[] }
  | { mode: 'shell'; commandline: string };
export declare function buildSpawnPlan(command: string, args: string[], platform: string): SpawnPlan;
export declare function quoteWinArg(s: string): string;

export interface ClaudeCandidate {
  key: string;
  name: string;
  transport: 'stdio' | 'http';
  legacy: boolean;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}
export declare function parseClaudeConfig(
  text: string,
  sourcePath?: string,
): { servers: ClaudeCandidate[]; skipped: Array<{ name: string; reason: string }> };

export declare function isSecretKey(k: string): boolean;
export declare function redactValue<T>(obj: T): T;
export declare function capList<X>(list: X[], max: number): X[];
