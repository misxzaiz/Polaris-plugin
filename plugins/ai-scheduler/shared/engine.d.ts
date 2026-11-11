/**
 * shared/engine.js 的类型声明（面板 TS 消费用；实现金标见 engine.js 文件头）
 */
export declare function parseInterval(value: string): number | null;
export declare function parseCron(expr: string): {
    sec: Set<number>;
    min: Set<number>;
    hour: Set<number>;
    dom: Set<number>;
    mon: Set<number>;
    dow: Set<number>;
    years: Set<number> | null;
} | null;
export declare function cronNext(expr: string, nowSec?: number): number | null;
/** triggerType: "once" | "cron" | "interval" | "after_completion" */
export declare function calculateNextRun(triggerType: string, triggerValue: string, now: number): number | null;
export declare function applyTemplate(template: string, taskName: string, userPrompt: string, nowMs?: number): string;
export declare function recalcNextOnUpdate(task: { triggerType: string; triggerValue: string; lastRunStatus?: string | null }, updatedAt: number, explicitNext?: number | null): number | null;
export declare function recalcNextOnStatus(task: { triggerType: string; triggerValue: string }, now: number, status: string): number | null;
export declare function isDue(task: { enabled: boolean; lastRunStatus?: string | null; lastRunAt?: number | null; nextRunAt?: number | null; timeoutMinutes?: number | null }, now: number): boolean | 'stale';
export declare const STALE_RUNNING_SECS: number;
export declare function parseRfc3339Ts(v: string): number | null;
export declare function weekdayNameCn(jsDow: number): string;
export declare function jsDowToCron(jsDow: number): number;
