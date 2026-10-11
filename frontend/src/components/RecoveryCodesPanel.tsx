import { useState } from 'react'
import { Check, Copy, Download, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { useT } from '../i18n'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import { useAuthStore } from '../stores/useAuthStore'

interface Props {
  codes: string[]
  onDone: () => void
}

/**
 * Affiche les codes de secours une seule fois, avec copie / téléchargement,
 * et exige une confirmation explicite avant de fermer.
 */
export default function RecoveryCodesPanel({ codes, onDone }: Props) {
  const { t } = useT()
  const { settings } = useAppSettingsStore()
  const { user } = useAuthStore()
  const [saved, setSaved] = useState(false)

  const asText = () => [
    t('twofa.codesFileHeader', { appName: settings.appName || 'Filyo', email: user?.email ?? '' }),
    '',
    ...codes,
    ''
  ].join('\n')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(asText())
      toast.success(t('common.copied'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleDownload = () => {
    const blob = new Blob([asText()], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(settings.appName || 'filyo').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-recovery-codes.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-brand-400" />
        <h4 className="font-semibold">{t('twofa.step3Title')}</h4>
      </div>
      <p className="text-xs [color:var(--text-50)]">{t('twofa.step3Hint')}</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm rounded-xl bg-white/5 border border-white/10 p-3" aria-label={t('twofa.step3Title')}>
        {codes.map(code => (
          <li key={code} className="text-center tracking-wider select-all">{code}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={handleCopy} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm py-2">
          <Copy size={14} /> {t('twofa.copyCodes')}
        </button>
        <button type="button" onClick={handleDownload} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm py-2">
          <Download size={14} /> {t('twofa.downloadCodes')}
        </button>
      </div>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} className="mt-0.5 accent-brand-500" />
        <span>{t('twofa.savedConfirm')}</span>
      </label>
      <button type="button" onClick={onDone} disabled={!saved} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
        <Check size={14} /> {t('twofa.done')}
      </button>
    </div>
  )
}
