import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownUp, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { login, getSettings, checkSetup, registerUser } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [setupNeeded, setSetupNeeded] = useState<boolean | null>(null)
  const { setAuth, isAuthenticated } = useAuthStore()
  const { setSettings, settings } = useAppSettingsStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/')
    getSettings().then(r => setSettings(r.data)).catch(() => {})
    checkSetup().then(r => setSetupNeeded(r.data.setupNeeded)).catch(() => setSetupNeeded(false))
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      const res = await login(email, password)
      setAuth(res.data.token, res.data.user)
      toast.success(`Bienvenue, ${res.data.user.name} !`)
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Identifiants incorrects')
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !name) return
    if (password.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    setLoading(true)
    try {
      await registerUser({ email, name, password })
      // Auto-login après création
      const res = await login(email, password)
      setAuth(res.data.token, res.data.user)
      toast.success(`Compte administrateur créé. Bienvenue, ${res.data.user.name} !`)
      navigate('/')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur lors de la création du compte')
    } finally {
      setLoading(false)
    }
  }

  // Attendre la réponse du serveur avant d'afficher quoi que ce soit
  if (setupNeeded === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0e1a' }}>
        <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(92, 107, 250, 0.12), transparent), #0d0e1a'
      }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="logo" className="h-12 w-auto mb-3 object-contain" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl shadow-brand-500/30 mb-3">
              <ArrowDownUp size={26} className="text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {settings.appName}
          </h1>
          <p className="text-white/50 text-sm mt-1">
            {setupNeeded ? 'Créez votre compte administrateur' : 'Connectez-vous pour continuer'}
          </p>
        </div>

        {setupNeeded ? (
          /* ── Formulaire de premier lancement ── */
          <form onSubmit={handleSetup} className="card space-y-4">
            <div className="text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2">
              Aucun utilisateur n'existe encore. Créez le compte administrateur.
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">Nom complet</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jean Dupont"
                className="input"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">Adresse email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                className="input"
                required
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  className="input pr-11"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserPlus size={16} />
              )}
              Créer le compte administrateur
            </button>
          </form>
        ) : (
          /* ── Formulaire de connexion ── */
          <form onSubmit={handleLogin} className="card space-y-4">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
                Adresse email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vous@exemple.fr"
                className="input"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn size={16} />
              )}
              Se connecter
            </button>
          </form>
        )}

        <p className="text-center text-white/40 text-xs mt-6">
          {settings.appName} — Hébergé localement &amp; privé
        </p>
      </div>
    </div>
  )
}
