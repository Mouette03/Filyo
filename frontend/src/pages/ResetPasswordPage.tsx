import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, LogIn, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { resetPassword } from '../api/client'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { t } = useT()

  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(92, 107, 250, 0.12), transparent), #0d0e1a' }}>
        <div className="absolute top-4 right-4"><LanguageSwitcher /></div>
        <div className="card w-full max-w-sm text-center space-y-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert size={22} className="text-red-400" />
          </div>
          <p className="text-white/70 text-sm">{t('resetpwd.invalidToken')}</p>
          <button onClick={() => navigate('/login')}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
            <LogIn size={15} /> {t('resetpwd.loginBtn')}
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return toast.error(t('toast.passwordTooShort'))
    if (password !== confirmPwd) return toast.error(t('toast.passwordMismatch'))
    setLoading(true)
    try {
      await resetPassword(token, password)
      setSuccess(true)
      toast.success(t('toast.passwordResetDone'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'INVALID_RESET_TOKEN') toast.error(t('error.invalidResetToken'))
      else toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(92, 107, 250, 0.12), transparent), #0d0e1a' }}>
      <div className="absolute top-4 right-4"><LanguageSwitcher /></div>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl shadow-brand-500/30 mb-3">
            <KeyRound size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t('resetpwd.title')}</h1>
          <p className="text-white/50 text-sm mt-1">{t('resetpwd.subtitle')}</p>
        </div>

        {success ? (
          <div className="card space-y-4 text-center">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto">
              <KeyRound size={22} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">{t('resetpwd.success')}</h3>
              <p className="text-sm text-white/50">{t('resetpwd.successHint')}</p>
            </div>
            <button onClick={() => navigate('/login')}
              className="btn-primary w-full flex items-center justify-center gap-2">
              <LogIn size={16} /> {t('resetpwd.loginBtn')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
                {t('resetpwd.newPwdLabel')}
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  className="input pr-11"
                  autoFocus
                  required
                  minLength={8}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
                {t('login.confirmPassword')}
              </label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder={t('login.confirmPasswordPlaceholder')}
                className="input"
                required
              />
            </div>
            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <KeyRound size={16} />}
              {t('resetpwd.btn')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
