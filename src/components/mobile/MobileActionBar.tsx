import { Bot, FilePlus2, PanelLeft, Save, Settings, type LucideIcon } from 'lucide-react'
import { useI18n } from '../../i18n'

interface MobileActionBarProps {
  sidebarOpen: boolean
  aiOpen: boolean
  isModified: boolean
  onToggleSidebar: () => void
  onNewTextFile: () => void
  onSave: () => void
  onToggleAi: () => void
  onOpenSettings: () => void
}

type MobileAction = {
  key: string
  label: string
  title: string
  active?: boolean
  dirty?: boolean
  icon: LucideIcon
  onClick: () => void
}

export function MobileActionBar({
  sidebarOpen,
  aiOpen,
  isModified,
  onToggleSidebar,
  onNewTextFile,
  onSave,
  onToggleAi,
  onOpenSettings,
}: MobileActionBarProps) {
  const { t } = useI18n()
  const actions: MobileAction[] = [
    {
      key: 'files',
      label: t('mobile.nav.files'),
      title: t('topbar.toggleSidebar'),
      active: sidebarOpen,
      icon: PanelLeft,
      onClick: onToggleSidebar,
    },
    {
      key: 'new',
      label: t('mobile.nav.new'),
      title: t('topbar.newTextFile'),
      icon: FilePlus2,
      onClick: onNewTextFile,
    },
    {
      key: 'save',
      label: t('mobile.nav.save'),
      title: t('topbar.save'),
      dirty: isModified,
      icon: Save,
      onClick: onSave,
    },
    {
      key: 'ai',
      label: t('mobile.nav.ai'),
      title: t(aiOpen ? 'ai.topbar.close' : 'ai.topbar.open'),
      active: aiOpen,
      icon: Bot,
      onClick: onToggleAi,
    },
    {
      key: 'settings',
      label: t('mobile.nav.settings'),
      title: t('topbar.settings'),
      icon: Settings,
      onClick: onOpenSettings,
    },
  ]

  return (
    <nav className="mobile-action-bar" aria-label={t('mobile.nav.aria')}>
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <button
            key={action.key}
            type="button"
            className={`mobile-action-bar__button ${action.active ? 'active' : ''} ${action.dirty ? 'dirty' : ''}`.trim()}
            onClick={action.onClick}
            title={action.title}
            aria-label={action.title}
            aria-pressed={action.active}
          >
            <span className="mobile-action-bar__icon">
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              {action.dirty && <span className="mobile-action-bar__dirty-dot" aria-hidden="true" />}
            </span>
            <span className="mobile-action-bar__label">{action.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
