import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownUp, Eye, EyeOff, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import { login, getSettings } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const { setAuth, isAuthenticated } = useAuthStore()
  const { setSettings, settings } = useAppSettingsStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/')
    // Charger le nom/logo de l'app
    getSettings().then(r => setSettings(r.data)).catch(() => {})
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
          <h1 className="text-2xl font-bold tracking-tight">
            {settings.appName}
          </h1>
          <p className="text-white/40 text-sm mt-1">Connectez-vous pour continuer</p>
        </div>

        {/* Form */}
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

        <p className="text-center text-white/20 text-xs mt-6">
          {settings.appName} — Hébergé localement &amp; privé
        </p>
      </div>
    </div>
  )
}
