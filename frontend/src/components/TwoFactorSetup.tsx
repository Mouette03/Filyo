import { useState } from 'react'
import { Lock, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { startTwoFactorSetup, enableTwoFactor } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useT } from '../i18n'
import RecoveryCodesPanel from './RecoveryCodesPanel'

interface Props {
  /** Appelé après l'affichage et la confirmation des codes de secours */
  onDone: () => void
  /** Affiche un bouton Annuler (profil) — absent sur la page de configuration obligatoire */
  onCancel?: () => void
}

type Step = 'password' | 'scan' | 'codes'

/**
 * Assistant d'activation de la 2FA, partagé entre « Mon profil → Sécurité »
 * et la page de configuration obligatoire (/setup-2fa).
 * 1. Confirmation du mot de passe  2. QR code + premier code  3. Codes de secours
 */
export default function TwoFactorSetup({ onDone, onCancel }: Props) {
  const { t } = useT()
  const { setTwoFactorState } = useAuthStore()
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])

  const errorToast = (err: any) => {
    const c = err?.response?.data?.code
    if (c === 'WRONG_PASSWORD') toast.error(t('error.wrongPassword'))
    else if (c === 'INVALID_TWO_FACTOR_CODE') toast.error(t('twofa.invalidCode'))
    else if (c === 'TWO_FACTOR_SETUP_EXPIRED') { toast.error(t('twofa.setupExpired')); setStep('password'); setCode('') }
    else if (c === 'ENCRYPTION_KEY_MISSING') toast.error(t('twofa.encryptionKeyMissing'))
    else if (err?.response?.status === 429) toast.error(t('toast.tooManyRequests'))
    else toast.error(t('common.error'))
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    try {
      const res = await startTwoFactorSetup(password)
      setSetup({ secret: res.data.secret, qrSvg: res.data.qrSvg })
      setPassword('')
      setStep('scan')
    } catch (err) { errorToast(err) }
    setLoading(false)
  }

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(clean)) return toast.error(t('twofa.invalidCode'))
    setLoading(true)
    try {
      const res = await enableTwoFactor(clean)
      setRecoveryCodes(res.data.recoveryCodes)
      setSetup(null)
      setStep('codes')
    } catch (err) { errorToast(err) }
    setLoading(false)
  }

  const handleDone = () => {
    // Le store n'est mis à jour qu'ici : la page /setup-2fa reste affichée tant que les codes ne sont pas confirmés
    setTwoFactorState({ twoFactorEnabled: true, twoFactorSetupRequired: false })
    toast.success(t('twofa.enabledToast'))
    onDone()
  }

  if (step === 'codes') return <RecoveryCodesPanel codes={recoveryCodes} onDone={handleDone} />

  if (step === 'scan' && setup) {
    // Secret groupé par 4 caractères pour faciliter la saisie manuelle
    const grouped = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret
    return (
      <form onSubmit={handleEnable} className="space-y-4">
        <div className="flex items-center gap-2">
          <QrCode size={16} className="text-brand-400" />
          <h4 className="font-semibold">{t('twofa.step2Title')}</h4>
        </div>
        <p className="text-xs [color:var(--text-50)]">{t('twofa.step2Hint')}</p>
        <div className="flex justify-center">
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
            alt={t('twofa.step2Title')}
            className="w-48 h-48 rounded-xl bg-white p-2"
          />
        </div>
        <div>
          <p className="text-xs [color:var(--text-50)] mb-1">{t('twofa.manualKey')}</p>
          <code className="block text-center font-mono text-xs sm:text-sm tracking-wider break-words rounded-lg bg-white/5 border border-white/10 px-3 py-2 select-all">{grouped}</code>
        </div>
        <div>
          <label htmlFor="twofa-setup-code" className="text-xs [color:var(--text-50)] mb-1.5 block uppercase tracking-wider">{t('twofa.codeLabel')}</label>
          <input
            id="twofa-setup-code"
            name="one-time-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^\d\s]/g, ''))}
            placeholder="123456"
            className="input text-center font-mono tracking-[0.4em]"
            autoFocus
            required
          />
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2.5">{t('common.cancel')}</button>
          )}
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {t('twofa.verifyBtn')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handlePassword} className="space-y-4">
      <div className="flex items-center gap-2">
        <Lock size={16} className="text-brand-400" />
        <h4 className="font-semibold">{t('twofa.step1Title')}</h4>
      </div>
      <p className="text-xs [color:var(--text-50)]">{t('twofa.step1Hint')}</p>
      <div>
        <label htmlFor="twofa-setup-password" className="text-xs [color:var(--text-50)] mb-1.5 block uppercase tracking-wider">{t('login.password')}</label>
        <input
          id="twofa-setup-password"
          name="current-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          className="input"
          autoFocus
          required
        />
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2.5">{t('common.cancel')}</button>
        )}
        <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {t('twofa.continue')}
        </button>
      </div>
    </form>
  )
}
