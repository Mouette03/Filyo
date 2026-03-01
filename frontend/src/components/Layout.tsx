import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Upload, LayoutDashboard, ArrowDownUp, Plus, Settings, Users, LogOut, ChevronDown, User } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import { getSettings } from '../api/client'
import toast from 'react-hot-toast'

export default function Layout() {
  const { user, isAdmin, logout } = useAuthStore()
  const { settings, setSettings } = useAppSettingsStore()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
    toast.success('Déconnecté')
    navigate('/login')
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
     ${isActive ? 'text-white bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/5'}`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo + Nom */}
          <NavLink to="/" className="flex items-center gap-2.5 group">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="logo" className="h-8 w-auto object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30 group-hover:shadow-brand-500/50 transition-shadow">
                <ArrowDownUp size={16} className="text-white" />
              </div>
            )}
            <span className="font-bold text-lg tracking-tight">{settings.appName}</span>
          </NavLink>

          {/* Nav links - actions utilisateur seulement */}
          <nav className="flex items-center gap-1">
            <NavLink to="/dashboard" className={navClass}>
              <LayoutDashboard size={15} />
              <span className="hidden sm:inline">Dashboard</span>
            </NavLink>
            <NavLink to="/" end className={navClass}>
              <Upload size={15} />
              <span className="hidden sm:inline">Envoyer</span>
            </NavLink>
            <NavLink to="/request/new" className={navClass}>
              <Plus size={15} />
              <span className="hidden sm:inline">Partage inversé</span>
            </NavLink>
          </nav>

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 glass-hover rounded-xl px-3 py-2"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-7 h-7 rounded-lg object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-brand-500/30 flex items-center justify-center text-brand-400 text-xs font-bold">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:block text-sm font-medium text-white/80">{user?.name}</span>
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
                    {user?.role === 'ADMIN' ? 'Administrateur' : 'Utilisateur'}
                  </span>
                </div>
                <NavLink to="/profile" onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  <User size={14} /> Mon profil
                </NavLink>
                {isAdmin() && (
                  <>
                    <NavLink to="/users" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                      <Users size={14} /> Utilisateurs
                    </NavLink>
                    <NavLink to="/settings" onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                      <Settings size={14} /> Réglages
                    </NavLink>
                  </>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={14} /> Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-white/5 py-4 text-center text-white/25 text-xs">
        {settings.appName} — Transfert de fichiers local &amp; privé
      </footer>
    </div>
  )
}
