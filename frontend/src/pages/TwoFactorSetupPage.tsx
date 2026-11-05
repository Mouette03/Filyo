import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowDownUp, LogOut, ShieldCheck } from 'lucide-react'
import { getMe, getSettings, logoutApi } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'
import TwoFactorSetup from '../components/TwoFactorSetup'

/**
 * Page de configuration obligatoire de la 2FA.
 * Affichée quand l'administrateur impose la 2FA et que le compte ne l'a pas encore configurée,
 * notamment juste après une auto-inscription. Aucune autre page n'est accessible avant la fin.
 */
export default function TwoFactorSetupPage() {
  const { user, setAuth, logout } = useAuthStore()
  const { settings, setSettings } = useAppSettingsStore()
  const navigate = useNavigate()
  const { t } = useT()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSettings().then(r => setSettings(r.data)).catch(() => {})
    getMe()
      .then(res => {
        if (cancelled) return
        setAuth(res.data)
        // Rien à configurer : 2FA déjà active, ou plus obligatoire
        if (!res.data.twoFactorSetupRequired) navigate('/', { replace: true })
        else setReady(true)
      })
      .catch(() => { if (!cancelled) navigate('/login', { replace: true }) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = async () => {
    try { await logoutApi() } catch { /* ignore */ }
    logout()
    navigate('/login', { replace: true })
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="logo" className="h-12 w-auto mb-3 object-contain" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl shadow-brand-500/30 mb-3">
              <ArrowDownUp size={26} className="text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight [color:var(--text-base)] flex items-center gap-2">
            <ShieldCheck size={20} className="text-brand-400" /> {t('setup2fa.title')}
          </h1>
          <p className="[color:var(--text-50)] text-sm mt-2">
            {t('setup2fa.subtitle', { appName: settings.appName || 'Filyo' })}
          </p>
          {user?.email && <p className="[color:var(--text-40)] text-xs mt-1">{user.email}</p>}
        </div>

        <div className="card">
          <TwoFactorSetup onDone={() => navigate('/', { replace: true })} />
        </div>

        <button type="button" onClick={handleLogout}
          className="mt-4 w-full flex items-center justify-center gap-2 text-xs [color:var(--text-50)] hover:[color:var(--text-base)] transition-colors">
          <LogOut size={13} /> {t('setup2fa.logout')}
        </button>
      </div>
    </div>
  )
}
