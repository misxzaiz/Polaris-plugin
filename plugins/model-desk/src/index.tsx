import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModelProviderTab } from './ModelProviderTab'
import { TokenStatsTab } from './TokenStatsTab'
import { createLogger } from './logger'

const log = createLogger('model-desk')

type View = 'provider' | 'usage'

/**
 * model-desk 面板入口 —— 模型供应商管理台
 *
 * 两个子视图：供应商 Profile 管理（原 Settings ModelProviderTab）+
 * Token 用量看板（原 TokenStatsTab）。数据面：cap.config patch + usage_* 宿主命令。
 */
export default function ModelDeskEntry() {
  const { t } = useTranslation('settings')
  const [view, setView] = useState<View>('provider')

  // 挂载即拉取一次引擎元数据（原 Settings 挂载链路的一部分；失败不阻塞）
  useEffect(() => {
    log.info('model-desk panel mounted')
  }, [])

  const tabs: Array<{ id: View; label: string }> = useMemo(
    () => [
      { id: 'provider', label: t('nav.modelProvider', '模型供应商') },
      { id: 'usage', label: t('nav.tokenStats', 'Token 统计') },
    ],
    [t],
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-border-subtle" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              view === tab.id
                ? 'bg-fill-secondary text-text-primary font-medium'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-fill-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {view === 'provider' ? <ModelProviderTab /> : <TokenStatsTab />}
      </div>
    </div>
  )
}
