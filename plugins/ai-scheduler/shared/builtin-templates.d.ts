/**
 * shared/builtin-templates.js 的类型声明（面板 TS 消费用）。
 * 返回 5 个内置协议模板（数据金标 = 主仓 models/scheduler.rs），字段 camelCase。
 * 注意：params 内类型字段为 paramType（服务侧契约），面板读取时归一化为 type。
 */
export interface BuiltinTemplateParam {
    key: string;
    label: string;
    paramType: 'text' | 'textarea' | 'select' | 'number' | 'date';
    required: boolean;
    defaultValue: string | null;
    placeholder: string | null;
    options: { value: string; label: string }[] | null;
}

export interface BuiltinProtocolTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    builtin: boolean;
    protocolConfig: {
        missionTemplate: string;
        executionRules: string;
        memoryRules: string;
    };
    promptTemplate: string | null;
    customSections: unknown[] | null;
    params: BuiltinTemplateParam[];
    defaultTriggerType: string;
    defaultTriggerValue: string;
    defaultEngineId: string;
    defaultMaxRuns: number | null;
    defaultTimeoutMinutes: number | null;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

export declare function builtinTemplates(nowSec?: number): BuiltinProtocolTemplate[];
