import { LayoutGrid, AudioLines, FileAudio, Megaphone, Music2, MessageCircle, MessageSquareText, Radio, Menu, Search, Bell, Sun, Moon, LogOut, Users as UsersIcon, Settings as SettingsIcon } from 'lucide-react'
import { useDarkTheme } from '../lib/uiSettings.js'
import logo from '../../assets/logo.jpeg'

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'sms', label: 'SMS', icon: MessageSquareText, alwaysVisible: true },
  { key: 'rcs', label: 'RCS', icon: Radio, alwaysVisible: true },
  { key: 'tts', label: 'Text to Speech', icon: AudioLines },
  { key: 'stt', label: 'Speech to Text', icon: FileAudio },
  { key: 'voices', label: 'Manage Voices', icon: Music2 },
  { key: 'users', label: 'User Management', icon: UsersIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, alwaysVisible: true },
]

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', user: 'User' }


const ICON_BTN = 'relative flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0 border border-white/10 bg-white/5 text-[#E7E9F5] transition-all hover:bg-white/[0.12] hover:-translate-y-px'

export default function Sidebar({ active, setActive, collapsed, onToggleCollapse, searchActive, onToggleSearch, user, onLogout, visibleModules, role }) {
  const [dark, setDark] = useDarkTheme()

  return (
    <aside
      className={[
        'flex flex-col shrink-0 min-h-screen sticky top-0 z-30 text-text-inverse',
        'rounded-r-[26px] border-r border-purple/35',
        'shadow-[10px_0_40px_rgba(11,14,31,0.38),0_0_0_1px_rgba(255,255,255,0.04)_inset]',
        'transition-[width,padding] duration-[250ms]',
        collapsed ? 'w-[78px] p-2.5 overflow-hidden' : 'w-[272px] p-[24px_18px]',
        'tablet:w-[78px] tablet:p-2.5 tablet:overflow-hidden',
        'mobile:w-full mobile:min-h-0 mobile:h-auto mobile:flex-row mobile:items-center mobile:flex-nowrap mobile:p-2 mobile:rounded-b-[18px] mobile:rounded-tr-none mobile:gap-1.5',
      ].join(' ')}
      style={{ background: 'linear-gradient(165deg, #232A52 0%, #181E3D 55%, #0F1330 100%)' }}
    >
      <div className={`flex items-center gap-1.5 pb-3.5 px-2 ${collapsed ? 'flex-col p-0 pb-3.5' : ''} mobile:p-0 mobile:shrink-0`}>
        <button className={ICON_BTN} onClick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label="Toggle sidebar">
          <Menu size={17} />
        </button>
        <button
          className={`${ICON_BTN} ${searchActive ? 'bg-[rgba(76,141,255,0.28)] border-[rgba(76,141,255,0.5)]' : ''}`}
          onClick={onToggleSearch}
          title="Search campaigns"
          aria-label="Search"
        >
          <Search size={16} />
        </button>
      </div>

      <div className={`flex items-center gap-2.5 px-2 pb-[26px] pt-1 ${collapsed ? 'justify-center pb-[22px] px-0' : ''} tablet:justify-center tablet:pb-[22px] tablet:px-0 mobile:px-1.5 mobile:pr-1.5 mobile:pl-0 mobile:py-0 mobile:shrink-0`}>
        <img
          src={logo}
          alt="Buzz Connect"
          className="w-11 h-11 rounded-[13px] shrink-0 object-cover bg-white shadow-[0_8px_20px_rgba(124,92,252,0.5)]"
        />
        <div className={`${collapsed ? 'hidden' : ''} tablet:hidden mobile:hidden`}>
          <div className="font-extrabold text-[17px] tracking-tight text-white">Buzz Connect</div>
          <div className="text-xs text-[#A3A8CE] mt-px">Platform</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 mobile:flex-row mobile:gap-1 mobile:overflow-x-auto mobile:flex-1 mobile:min-w-0">
        {NAV_ITEMS.filter((item) => item.alwaysVisible || visibleModules.includes(item.key)).map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              title={item.label}
              className={[
                'relative flex items-center w-full py-[12.5px] px-3.5 rounded-[11px] border-none bg-transparent text-[#CACEEA]',
                'text-[14.5px] font-semibold text-left gap-2.5 transition-all',
                'hover:bg-white/10 hover:text-white hover:translate-x-0.5',
                collapsed ? 'justify-center p-3' : '',
                'tablet:justify-center tablet:p-3',
                'mobile:p-2 mobile:justify-center',
                isActive
                  ? "text-white font-extrabold shadow-[inset_0_0_0_1.5px_rgba(120,165,255,0.55)] hover:translate-x-0 before:content-[''] before:absolute before:-left-4 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-[22px] before:rounded before:bg-[#4C8DFF] before:shadow-[0_0_10px_2px_rgba(76,141,255,0.75)] tablet:before:left-auto tablet:before:-right-2.5 mobile:before:hidden"
                  : '',
              ].join(' ')}
              style={isActive ? { background: 'linear-gradient(135deg, rgba(59,130,246,0.36), rgba(124,92,252,0.28))' } : undefined}
            >
              <Icon size={17} className="shrink-0 transition-opacity" style={{ opacity: isActive ? 1 : 0.75 }} />
              <span className={`flex-1 whitespace-nowrap overflow-hidden text-ellipsis ${collapsed ? 'hidden' : ''} tablet:hidden mobile:hidden`}>{item.label}</span>
              <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${collapsed ? 'hidden' : ''} tablet:hidden mobile:hidden`} style={{ background: item.dot }} />
            </button>
          )
        })}
      </nav>

      <div className="flex items-center gap-2 py-2.5 px-2 mt-auto border-t border-white/[0.08] tablet:flex-col tablet:gap-2.5 mobile:shrink-0 mobile:mt-0 mobile:p-0 mobile:border-t-0 mobile:gap-1">
        <button className={ICON_BTN} onClick={() => setDark(!dark)} title="Toggle theme" aria-label="Toggle theme">
          {dark ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button className={ICON_BTN} title="Notifications" aria-label="Notifications">
          <Bell size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2.5 py-1 pt-2.5 px-2.5 mobile:hidden">
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.email || 'admin')}`}
          alt={user?.displayName || 'Admin'}
          className="w-[34px] h-[34px] rounded-full bg-[#333] shrink-0"
        />
        <div className={`${collapsed ? 'hidden' : ''} tablet:hidden`}>
          <div className="text-[13px] font-semibold">{user?.displayName || user?.email || 'Admin User'}</div>
          <div className="text-[11px] text-[#8A8FB3]">{ROLE_LABEL[role] || 'User'}</div>
        </div>
        <button className={`${ICON_BTN} ml-auto shrink-0`} onClick={onLogout} title="Log out" aria-label="Log out">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}
