import { useEffect, useState } from 'react'
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { getTwoFactorStatus, disableTwoFactor, regenerateRecoveryCodes } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useT } from '../i18n'
import TwoFactorSetup from './TwoFactorSetup'
import RecoveryCodesPanel from './RecoveryCodesPanel'

type View = 'status' | 'setup' | 'disable' | 'regenerate' | 'codes'

interface Status {
  enabled: boolean
  required: boolean
  recoveryCodesRemaining: number
}

/** Section « Sécurité » de Mon profil : état, activation, codes de secours, désactivation. */
export default function TwoFactorProfileSection() {
  const { t } = useT()
  const { setTwoFactorState } = useAuthStore()
  const [status, setStatus] = useState<Status | null>(null)
  const [view, setView] = useState<View>('status')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [newCodes, setNewCodes] = useState<string[]>([])

  const load = () => getTwoFactorStatus()
    .then(res => setStatus(res.data))
    .catch(() => setStatus(null))

  useEffect(() => { load() }, [])

  const resetForm = () => { setPassword(''); setCode('') }
  const backToStatus = () => { resetForm(); setView('status'); load() }

  const errorToast = (err: any) => {
    const c = err?.response?.data?.code
    if (c === 'WRONG_PASSWORD') toast.error(t('error.wrongPassword'))
    else if (c === 'INVALID_TWO_FACTOR_CODE') toast.error(t('twofa.invalidCode'))
    else if (c === 'TWO_FACTOR_REQUIRED_BY_POLICY') toast.error(t('twofa.requiredByPolicy'))
    else if (err?.response?.status === 429) toast.error(t('toast.tooManyRequests'))
    else toast.error(t('common.error'))
  }

  const handleReauthAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || !code.trim()) return
    setLoading(true)
    try {
      if (view === 'disable') {
        await disableTwoFactor(password, code.trim())
        setTwoFactorState({ twoFactorEnabled: false })
        toast.success(t('twofa.disabledToast'))
        backToStatus()
      } else {
        const res = await regenerateRecoveryCodes(password, code.trim())
        resetForm()
        setNewCodes(res.data.recoveryCodes)
        setView('codes')
        toast.success(t('twofa.regeneratedToast'))
      }
    } catch (err) { errorToast(err) }
    setLoading(false)
  }

  return (
    <div className="card mb-5">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={16} className="text-brand-400" />
        <h3 className="font-semibold">{t('twofa.sectionTitle')}</h3>
        {status && (
          <span className={`badge ml-auto ${status.enabled ? 'badge-green' : 'badge-orange'}`}>
            {status.enabled ? t('twofa.statusEnabled') : t('twofa.statusDisabled')}
          </span>
        )}
      </div>
      <p className="text-xs text-white/40 mb-4">{t('twofa.sectionHint')}</p>

      {status?.required && view === 'status' && (
        <div className="text-xs text-brand-300 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 mb-4">
          {t('twofa.requiredByAdmin')}
        </div>
      )}

      {!status ? (
        <RefreshCw size={16} className="text-brand-400 animate-spin" />
      ) : view === 'setup' ? (
        <TwoFactorSetup onDone={backToStatus} onCancel={backToStatus} />
      ) : view === 'codes' ? (
        <RecoveryCodesPanel codes={newCodes} onDone={() => { setNewCodes([]); backToStatus() }} />
      ) : view === 'disable' || view === 'regenerate' ? (
        <form onSubmit={handleReauthAction} className="space-y-4">
          <p className="text-xs text-white/50">{t('twofa.reauthHint')}</p>
          <div>
            <label htmlFor="twofa-reauth-password" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('login.password')}</label>
            <input id="twofa-reauth-password" name="current-password" type="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} className="input" autoFocus required />
          </div>
          <div>
            <label htmlFor="twofa-reauth-code" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('twofa.codeOrRecoveryLabel')}</label>
            <input id="twofa-reauth-code" name="one-time-code" autoComplete="one-time-code" spellCheck={false} maxLength={16}
              value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="123456 / XXXXX-XXXXX" className="input font-mono tracking-wider" required />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={backToStatus} className="btn-secondary flex-1 py-2.5">{t('common.cancel')}</button>
            <button type="submit" disabled={loading}
              className={`${view === 'disable' ? 'btn-danger' : 'btn-primary'} flex-1 flex items-center justify-center gap-2 py-2.5`}>
              {loading ? <RefreshCw size={14} className="animate-spin" /> : view === 'disable' ? <ShieldOff size={14} /> : <KeyRound size={14} />}
              {view === 'disable' ? t('twofa.confirmDisable') : t('twofa.regenerateBtn')}
            </button>
          </div>
        </form>
      ) : status.enabled ? (
        <div className="space-y-3">
          <p className="text-sm text-white/60">{t('twofa.recoveryRemaining', { count: String(status.recoveryCodesRemaining) })}</p>
          {status.recoveryCodesRemaining <= 3 && (
            <p className="text-xs text-yellow-400">{t('twofa.recoveryLow')}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => { resetForm(); setView('regenerate') }}
              className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm py-2.5">
              <KeyRound size={14} /> {t('twofa.regenerateBtn')}
            </button>
            {!status.required && (
              <button onClick={() => { resetForm(); setView('disable') }}
                className="btn-danger flex-1 flex items-center justify-center gap-2 text-sm py-2.5">
                <ShieldOff size={14} /> {t('twofa.disableBtn')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => setView('setup')} className="btn-primary flex items-center gap-2 py-2.5 px-6">
          <ShieldCheck size={14} /> {t('twofa.enableBtn')}
        </button>
      )}
    </div>
  )
}
