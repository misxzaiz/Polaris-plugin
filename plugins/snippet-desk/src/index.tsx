import { useTranslation } from 'react-i18next'
import { PromptSnippetTab } from './PromptSnippetTab'

/**
 * snippet-desk 面板入口 —— 提示词工作台
 * 快捷片段 CRUD / 变量试填 / skill 路径配置与已发现 Skill 列表。
 */
export default function SnippetDeskEntry() {
  const { t } = useTranslation('settings')
  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      <div className="px-4 pt-3 pb-1 text-sm font-medium text-text-primary">
        {t('nav.promptSnippet', '快捷片段')}
      </div>
      <PromptSnippetTab />
    </div>
  )
}
