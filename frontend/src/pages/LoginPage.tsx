import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownUp, Eye, EyeOff, LogIn, Mail, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { login, getSettings, checkSetup, registerUser, forgotPassword } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

type Mode = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [name, setName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null)
  const [mode, setMode] = useState<Mode>('login')
  const [forgotEmail, setForgotEmail] = useState('')
  const [loadingForgot, setLoadingForgot] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const { setAuth, isAuthenticated } = useAuthStore()
  const { setSettings, settings } = useAppSettingsStore()
  const navigate = useNavigate()
  const { t, lang } = useT()

  useEffect(() => {
    if (isAuthenticated) navigate('/')
    getSettings().then(r => setSettings(r.data)).catch(() => {})
    checkSetup().then(r => setSetupNeeded(r.data.setupNeeded)).catch(() => setSetupNeeded(false))
  }, [isAuthenticated, navigate])

  const resetForm = () => {
    setEmail(''); setPassword(''); setConfirmPwd(''); setName(''); setShowPwd(false)
    setForgotEmail(''); setForgotSent(false)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      const res = await login(email, password)
      setAuth(res.data.token, res.data.user)
      toast.success(t('toast.welcome', { name: res.data.user.name }))
      navigate('/')
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'INVALID_CREDENTIALS') toast.error(t('error.invalidCredentials'))
      else if (err.response?.status === 429) toast.error(t('toast.tooManyRequests'))
      else toast.error(t('toast.incorrectCredentials'))
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !name || !confirmPwd) return
    if (password.length < 8) return toast.error(t('toast.passwordTooShort'))
    if (password !== confirmPwd) return toast.error(t('toast.passwordMismatch'))
    setLoading(true)
    try {
      await registerUser({ email, name, password })
      const res = await login(email, password)
      setAuth(res.data.token, res.data.user)
      toast.success(t('toast.adminCreated', { name: res.data.user.name }))
      navigate('/')
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'EMAIL_TAKEN') toast.error(t('error.emailTaken'))
      else toast.error(t('toast.accountError'))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !name || !confirmPwd) return
    if (password.length < 8) return toast.error(t('toast.passwordTooShort'))
    if (password !== confirmPwd) return toast.error(t('toast.passwordMismatch'))
    setLoading(true)
    try {
      await registerUser({ email, name, password })
      const res = await login(email, password)
      setAuth(res.data.token, res.data.user)
      toast.success(t('toast.welcome', { name: res.data.user.name }))
      navigate('/')
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'EMAIL_TAKEN') toast.error(t('error.emailTaken'))
      else if (code === 'REGISTRATION_DISABLED') toast.error(t('error.registrationDisabled'))
      else toast.error(t('toast.accountError'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoadingForgot(true)
    try {
      await forgotPassword(forgotEmail, lang)
      setForgotSent(true)
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'SMTP_NOT_CONFIGURED') toast.error(t('toast.smtpNotConfigured'))
      else toast.error(t('toast.sendError'))
    } finally {
      setLoadingForgot(false)
    }
  }

  if (setupNeeded === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0e1a' }}>
        <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  const logoBlock = (
    <div className="flex flex-col items-center mb-10">
      {settings.logoUrl ? (
        <img src={settings.logoUrl} alt="logo" className="h-12 w-auto mb-3 object-contain" />
      ) : (
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl shadow-brand-500/30 mb-3">
          <ArrowDownUp size={26} className="text-white" />
        </div>
      )}
      <h1 className="text-2xl font-bold tracking-tight [color:var(--text-base)]">
        {settings.appName}
      </h1>
      <p className="[color:var(--text-50)] text-sm mt-1">
        {setupNeeded
          ? t('login.subtitleSetup')
          : mode === 'register'
            ? t('login.subtitleRegister')
            : t('login.subtitleLogin')}
      </p>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Sélecteur de langue en haut à droite */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm">
        {logoBlock}

        {setupNeeded ? (
          /* ── Premier lancement : création compte admin ── */
          <form onSubmit={handleSetup} className="card space-y-4">
            <div className="text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2">
              {t('login.setupNotice')}
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.fullName')}</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder={t('login.fullNamePlaceholder')} className="input" autoFocus required />
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')} className="input" required />
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.password')}</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')} className="input pr-11" required minLength={8} />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 [color:var(--text-30)] hover:[color:var(--text-60)] transition-colors">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.confirmPassword')}</label>
              <input type={showPwd ? 'text' : 'password'} value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder={t('login.confirmPasswordPlaceholder')} className="input" required />
            </div>
            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <UserPlus size={16} />}
              {t('login.createAdminBtn')}
            </button>
          </form>

        ) : mode === 'forgot' ? (
          /* ── Mot de passe oublié ── */
          <div className="card space-y-4">
            {forgotSent ? (
              <>
                <div className="text-center py-2">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Mail size={22} className="text-emerald-400" />
                  </div>
                  <h3 className="font-bold text-lg mb-1">{t('login.forgotSent')}</h3>
                  <p className="text-sm [color:var(--text-50)]">{t('login.forgotSentHint')}</p>
                </div>
                <button type="button" onClick={() => { resetForm(); setMode('login') }}
                  className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                  <LogIn size={15} /> {t('login.backToLogin')}
                </button>
              </>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-sm [color:var(--text-50)]">{t('login.forgotSubtitle')}</p>
                <div>
                  <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.email')}</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    placeholder={t('login.emailPlaceholder')} className="input" autoFocus required />
                </div>
                <button type="submit" disabled={loadingForgot}
                  className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
                  {loadingForgot
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Mail size={16} />}
                  {t('login.forgotBtn')}
                </button>
                <button type="button" onClick={() => { resetForm(); setMode('login') }}
                  className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                  <LogIn size={15} /> {t('login.backToLogin')}
                </button>
              </form>
            )}
          </div>

        ) : mode === 'login' ? (
          /* ── Connexion ── */
          <form onSubmit={handleLogin} className="card space-y-4">
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')} className="input" autoFocus required />
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.password')}</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className="input pr-11" required />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 [color:var(--text-30)] hover:[color:var(--text-60)] transition-colors">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <LogIn size={16} />}
              {t('login.loginBtn')}
            </button>
            <button type="button"
              onClick={() => { resetForm(); setMode('forgot') }}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors w-full text-center">
              {t('login.forgotPassword')}
            </button>
            {settings.allowRegistration && (
              <button type="button"
                onClick={() => { resetForm(); setMode('register') }}
                className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
                <UserPlus size={15} /> {t('login.registerLinkBtn')}
              </button>
            )}
          </form>

        ) : (
          /* ── Inscription libre ── */
          <form onSubmit={handleRegister} className="card space-y-4">
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.fullName')}</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder={t('login.fullNamePlaceholder')} className="input" autoFocus required />
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')} className="input" required />
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.password')}</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')} className="input pr-11" required minLength={8} />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 [color:var(--text-30)] hover:[color:var(--text-60)] transition-colors">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">{t('login.confirmPassword')}</label>
              <input type={showPwd ? 'text' : 'password'} value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder={t('login.confirmPasswordPlaceholder')} className="input" required />
            </div>
            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <UserPlus size={16} />}
              {t('login.createAccountBtn')}
            </button>
            <button type="button"
              onClick={() => { resetForm(); setMode('login') }}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
              <LogIn size={15} /> {t('login.alreadyAccount')}
            </button>
          </form>
        )}

        <p className="text-center [color:var(--text-40)] text-xs mt-6">
          {settings.appName} — {t('login.footer')}
        </p>
      </div>
    </div>
  )
}
