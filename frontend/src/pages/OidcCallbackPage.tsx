import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Link2, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMe, linkOidcAccount } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useT } from '../i18n'

/**
 * Page de callback OIDC — montée sur /oidc/callback
 *
 * Le backend a déjà posé le cookie JWT après le callback, mais
 * dans le cas d'un compte à lier (OIDC_LINK_REQUIRED), il pose
 * un cookie temporaire et retourne ?link=1&email=xxx dans le
 * redirect_uri.
 *
 * Scénarios :
 *   ?success=1           → authentification complète, on charge /auth/me et on redirige
 *   ?link=1&email=xxx    → le backend a trouvé un compte local avec ce mail,
 *                          demander le mot de passe pour confirmer la liaison
 *   ?error=xxx           → afficher l'erreur
 */
export default function OidcCallbackPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const { t } = useT()
  const params = new URLSearchParams(window.location.search)

  const success = params.get('success') === '1'
  const linkNeeded = params.get('link') === '1'
  const linkEmail = params.get('email') ?? ''
  const linkToken = params.get('token') ?? ''
  const errorCode = params.get('error')

  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  // ── Cas succès direct ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!success) return
    getMe()
      .then(r => {
        setAuth(r.data)
        toast.success(t('toast.welcome', { name: r.data.name }))
        navigate('/')
      })
      .catch(() => {
        toast.error(t('error.oidcFailed'))
        navigate('/login')
      })
  }, [success]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cas erreur directe ────────────────────────────────────────────────────
  if (errorCode) {
    const key: Record<string, string> = {
      oidc_disabled: 'oidc.errorDisabled',
      invalid_state: 'oidc.errorInvalidState',
      account_disabled: 'oidc.errorAccountDisabled',
      email_required: 'oidc.errorEmailRequired',
      registration_disabled: 'oidc.errorRegistrationDisabled',
      server_error: 'oidc.errorServerError',
    }
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-sm w-full space-y-4 text-center">
          <p className="text-red-400 font-semibold text-lg">{t('oidc.failed')}</p>
          <p className="text-sm [color:var(--text-50)]">{t(key[errorCode] ?? 'oidc.errorServerError')}</p>
          <button onClick={() => navigate('/login')} className="btn-secondary w-full flex items-center justify-center gap-2">
            <LogIn size={15} /> {t('oidc.backToLogin')}
          </button>
        </div>
      </div>
    )
  }

  // ── Loader pendant succès ─────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0e1a' }}>
        <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  // ── Liaison compte local ───────────────────────────────────────────────────
  if (linkNeeded) {
    const handleLink = async (e: React.FormEvent) => {
      e.preventDefault()
      setLoading(true)
      try {
        await linkOidcAccount(password, linkToken)
        const r = await getMe()
        setAuth(r.data)
        toast.success(t('oidc.linkSuccess'))
        navigate('/')
      } catch (err: any) {
        const code = err.response?.data?.code
        if (code === 'INVALID_PASSWORD') toast.error(t('oidc.linkPasswordIncorrect'))
        else toast.error(t('oidc.linkFailed'))
      } finally {
        setLoading(false)
      }
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl shadow-brand-500/30 mb-3">
              <Link2 size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight [color:var(--text-base)]">{t('oidc.linkTitle')}</h1>
            <p className="[color:var(--text-50)] text-sm mt-1 text-center" dangerouslySetInnerHTML={{ __html: t('oidc.linkDescription', { email: linkEmail }) }} />
          </div>
          <form onSubmit={handleLink} className="card space-y-4">
            <div>
              <label htmlFor="link-password" className="text-xs [color:var(--text-50)] mb-1.5 block font-medium uppercase tracking-wider">
                {t('oidc.linkCurrentPassword')}
              </label>
              <div className="relative">
                <input
                  id="link-password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-11"
                  autoFocus
                  required
                />
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
                : <Link2 size={16} />}
              {t('oidc.linkConfirm')}
            </button>
            <button type="button" onClick={() => navigate('/login')}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
              <LogIn size={15} /> {t('login.backToLogin')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Fallback — ne devrait pas arriver
  navigate('/login')
  return null
}
