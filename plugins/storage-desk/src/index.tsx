import { useTranslation } from 'react-i18next'
import { DataStorageCard } from './DataStorageCard'

/**
 * storage-desk 面板入口 —— 数据与存储管理台
 * 数据根信息/OPFS 迁移/旧数据扫描/数据根切换向导。
 */
export default function StorageDeskEntry() {
  const { t } = useTranslation('settings')
  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 gap-3">
      <div className="text-sm font-medium text-text-primary">
        {t('nav.storageDesk', '存储管理')}
      </div>
      <DataStorageCard />
    </div>
  )
}
