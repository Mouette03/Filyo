import { Outlet, NavLink, useNavigate } from 'react-router'
import { Upload, LayoutDashboard, ArrowDownUp, Plus, Settings, Users, LogOut, ChevronDown, User, Github, ArrowUpCircle, BookOpen } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import { getSettings, logoutApi } from '../api/client'
import toast from 'react-hot-toast'
import { useT } from '../i18n'

declare const __APP_VERSION__: string

export default function Layout() {
  const { user, isAdmin, logout } = useAuthStore()
  const { settings, setSettings } = useAppSettingsStore()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { t } = useT()
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  const currentVersion = __APP_VERSION__
  const hasUpdate = latestVersion && latestVersion !== `v${currentVersion}` && latestVersion !== currentVersion

  useEffect(() => {
    getSettings().then(r => setSettings(r.data)).catch(() => {})

    // Vérification de la dernière version GitHub (silencieux si réseau indisponible)
    fetch('https://api.github.com/repos/Mouette03/Filyo/releases/latest')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tag_name) { setLatestVersion(data.tag_name); return }
        // Fallback : API tags si aucune Release publiée
        return fetch('https://api.github.com/repos/Mouette03/Filyo/tags?per_page=1')
          .then(r => r.ok ? r.json() : null)
          .then(tags => { if (tags?.[0]?.name) setLatestVersion(tags[0].name) })
      })
      .catch(() => {})

    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    try { await logoutApi() } catch { /* ignore */ }
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

          {/* Droite : menu utilisateur */}
          <div className="flex items-center gap-1">
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
                <a
                  href="https://github.com/Mouette03/Filyo/blob/main/AIDE.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <BookOpen size={14} /> {t('nav.help')}
                </a>
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

      <footer className="border-t border-white/5 py-4 px-6 text-white/25 text-xs flex items-center justify-between gap-2">
        {/* Gauche : version + alerte mise à jour */}
        <div className="flex w-32 shrink-0 items-center gap-2">
          <span>v{currentVersion}</span>
          {hasUpdate && (
            <a
              href="https://github.com/Mouette03/Filyo/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brand-400 hover:text-brand-300 transition-colors"
              title={`${t('nav.updateAvailable')} ${latestVersion}`}
            >
              <ArrowUpCircle size={13} />
              <span>{latestVersion}</span>
            </a>
          )}
        </div>

        {/* Centre : nom de l'app + slogan (slogan masqué sur mobile) */}
        <span className="flex-1 min-w-0 truncate text-center">
          {settings.appName}<span className="hidden sm:inline"> — {t('nav.footer')}</span>
        </span>

        {/* Droite : Discord + GitHub */}
        <div className="flex w-32 shrink-0 items-center justify-end gap-1.5">
          <a
            href="https://discord.gg/XnYaXu8HKt"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/60 transition-colors"
            title="Rejoindre le Discord"
            aria-label="Discord Filyo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.317 4.369A19.79 19.79 0 0 0 16.227 3c-.2.36-.44.85-.6 1.23a18.18 18.18 0 0 0-5.25 0c-.16-.38-.4-.87-.6-1.23A19.74 19.74 0 0 0 3.68 4.37a19.66 19.66 0 0 0-3.11 15.35 19.88 19.88 0 0 0 5.99 3.02c.48-.65.9-1.34 1.26-2.06a13.36 13.36 0 0 1-1.99-.95l.42-.31a13.6 13.6 0 0 0 11.5 0l.42.31c-.6.36-1.27.68-1.99.95.36.72.78 1.41 1.26 2.06a19.88 19.88 0 0 0 5.99-3.02A19.66 19.66 0 0 0 20.317 4.37Zm-8.07 12.59c-1.07 0-1.96-.98-1.96-2.19s.87-2.19 1.96-2.19 1.96.98 1.96 2.19-.88 2.19-1.96 2.19Zm6.25 0c-1.07 0-1.96-.98-1.96-2.19s.87-2.19 1.96-2.19 1.96.98 1.96 2.19-.88 2.19-1.96 2.19Z" />
            </svg>
          </a>
          <a
            href="https://github.com/Mouette03/Filyo"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/60 transition-colors"
            title="Voir sur GitHub"
          >
            <Github size={14} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
