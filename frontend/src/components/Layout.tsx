import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Upload, LayoutDashboard, ArrowDownUp, Plus, Settings, Users, LogOut, ChevronDown, User, Github } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import { getSettings } from '../api/client'
import toast from 'react-hot-toast'
import { useT } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'

export default function Layout() {
  const { user, isAdmin, logout } = useAuthStore()
  const { settings, setSettings } = useAppSettingsStore()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { t } = useT()

  useEffect(() => {
    getSettings().then(r => setSettings(r.data)).catch(() => {})

    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => {
    logout()
    toast.success(t('toast.loggedOut'))
    navigate('/login')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-2 py-2 sm:px-3 rounded-lg text-sm font-medium transition-all
     ${isActive ? 'text-white bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/5'}`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between relative">
          {/* Logo + Nom */}
          <NavLink to="/" className="flex items-center gap-2.5 group">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="logo" className="h-8 w-auto object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition-shadow">
                <ArrowDownUp size={16} className="text-white" />
              </div>
            )}
            <span className="hidden sm:inline font-bold text-lg tracking-tight">{settings.appName}</span>
          </NavLink>

          {/* Nav links — centré en absolu */}
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
            <NavLink to="/dashboard" className={navClass}>
              <LayoutDashboard size={15} />
              <span className="hidden sm:inline">Dashboard</span>
            </NavLink>
            <NavLink to="/" end className={navClass}>
              <Upload size={15} />
              <span className="hidden sm:inline">{t('nav.send')}</span>
            </NavLink>
            <NavLink to="/request/new" className={navClass}>
              <Plus size={15} />
              <span className="hidden sm:inline">{t('nav.reverseShare')}</span>
            </NavLink>
          </nav>

          {/* Droite : sélecteur de langue + menu utilisateur */}
          <div className="flex items-center gap-1">
            <LanguageSwitcher />
            <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 glass-hover rounded-xl px-3 py-2"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name?.charAt(0).toUpperCase()}
                  className="w-7 h-7 rounded-lg object-cover"
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                    (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex')
                  }}
                />
              ) : null}
              <div
                className="w-7 h-7 rounded-lg bg-brand-500/30 items-center justify-center text-brand-400 text-xs font-bold"
                style={{ display: user?.avatarUrl ? 'none' : 'flex' }}
              >
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <span className="hidden md:block text-sm font-medium text-white/80">{user?.name}</span>
              <ChevronDown size={14} className={`text-white/40 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl py-1 overflow-hidden shadow-xl border border-white/10 z-50"
                style={{ background: 'var(--surface-800)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                <div className="px-4 py-3 border-b border-white/10">
                  {user?.avatarUrl && (
                    <img src={user.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-xl object-cover mb-2" />
                  )}
                  <p className="text-sm font-semibold">{user?.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">{user?.email}</p>
                  <span className={`mt-1.5 inline-block badge ${user?.role === 'ADMIN' ? 'badge-blue' : 'badge-green'}`}>
                    {user?.role === 'ADMIN' ? t('role.admin') : t('role.user')}
                  </span>
                </div>
                <NavLink to="/profile" onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  <User size={14} /> {t('nav.myProfile')}
                </NavLink>
                {isAdmin() && (
                  <>
                    <NavLink to="/users" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                      <Users size={14} /> {t('nav.users')}
                    </NavLink>
                    <NavLink to="/settings" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                      <Settings size={14} /> {t('nav.settings')}
                    </NavLink>
                  </>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={14} /> {t('nav.logout')}
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/5 py-4 px-6 text-white/25 text-xs relative flex items-center justify-center">
        <span>{settings.appName} — {t('nav.footer')}</span>
        <a
          href="https://github.com/Mouette03/Filyo"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-6 flex items-center gap-1.5 hover:text-white/60 transition-colors"
          title="Voir sur GitHub"
        >
          <Github size={14} />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </footer>
    </div>
  )
}
