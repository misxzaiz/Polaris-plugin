/**
 * 插件配置单例：所有组件共享同一份快照，避免「各自 read → 各自 patch」互相覆盖。
 * 写路径统一走 plugin_set_config；写入成功后本地快照立即对账并广播。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { readPluginConfig, writePluginConfig } from './bridge';
import {
  parsePluginConfig,
  type AutoRunRule,
  type CustomCommand,
  type PluginConfig,
  type UiState,
} from './model';

type Listener = () => void;

class PluginConfigStore {
  private raw: Record<string, unknown> = {};
  private state: PluginConfig = parsePluginConfig({});
  private listeners = new Set<Listener>();
  private loading: Promise<void> | null = null;

  snapshot(): PluginConfig {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 幂等加载：多个组件并发挂载只发一次 IPC */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = readPluginConfig()
      .then((raw) => {
        this.raw = raw;
        this.state = parsePluginConfig(raw);
        this.emit();
      })
      .catch(() => {
        this.raw = {};
        this.state = parsePluginConfig({});
        this.emit();
      });
    return this.loading;
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private async commit(patch: Record<string, unknown>): Promise<PluginConfig> {
    await writePluginConfig(patch);
    const nextRaw = { ...this.raw, ...patch };
    this.raw = nextRaw;
    this.state = parsePluginConfig(nextRaw);
    this.emit();
    return this.state;
  }

  setCustomCommands = (customCommands: CustomCommand[]) => this.commit({ customCommands });
  setHiddenScriptIds = (hiddenScriptIds: string[]) => this.commit({ hiddenScriptIds });
  setAutoRunRules = (autoRunRules: Record<string, AutoRunRule>) => this.commit({ autoRunRules });
  setSessionNames = (sessionNames: Record<string, string>) => this.commit({ sessionNames });
  setUiState = (patch: Partial<UiState>) =>
    this.commit({ uiState: { ...this.state.uiState, ...patch } });
  markLegacyMigration = (legacyMigration: string) => this.commit({ legacyMigration });

  /** 一次性导入旧数据：自定义命令 + 隐藏项 + 迁移标记一起写，保证原子观感 */
  importLegacy = (
    customCommands: CustomCommand[],
    hiddenScriptIds: string[],
    legacyMigration = 'v1',
  ) => this.commit({ customCommands, hiddenScriptIds, legacyMigration });
}

export const pluginConfig = new PluginConfigStore();

/** React 绑定：挂载触发加载，订阅快照变化，返回带错误冒泡的动作集 */
export function usePluginConfig(onError?: (message: string) => void) {
  const [state, setState] = useState<PluginConfig>(() => pluginConfig.snapshot());

  useEffect(() => {
    const off = pluginConfig.subscribe(() => setState(pluginConfig.snapshot()));
    void pluginConfig.load();
    return off;
  }, []);

  const wrap = useCallback(
    <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) =>
      async (...args: A): Promise<void> => {
        try {
          await fn(...args);
        } catch (e) {
          onError?.(`配置保存失败：${e instanceof Error ? e.message : String(e)}`);
        }
      },
    [onError],
  );

  // 动作集引用稳定：避免作为 effect 依赖时每帧重跑（自动运行/快捷键）
  const actions = useMemo(
    () => ({
      setCustomCommands: wrap(pluginConfig.setCustomCommands),
      setHiddenScriptIds: wrap(pluginConfig.setHiddenScriptIds),
      setAutoRunRules: wrap(pluginConfig.setAutoRunRules),
      setSessionNames: wrap(pluginConfig.setSessionNames),
      setUiState: wrap(pluginConfig.setUiState),
      markLegacyMigration: wrap(pluginConfig.markLegacyMigration),
      importLegacy: wrap(pluginConfig.importLegacy),
    }),
    [wrap],
  );

  return useMemo(() => ({ config: state, ...actions }), [state, actions]);
}
