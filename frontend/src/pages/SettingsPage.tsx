import { useEffect, useState, useRef } from 'react'
import { Settings, Upload, Trash2, Check, Type, Image, RefreshCw, Mail, Eye, EyeOff, Wifi, Globe, Users, Palette, Moon, Sun, Monitor, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateAppName, uploadLogo, deleteLogo, getSmtpSettings, updateSmtpSettings, testSmtp, updateSiteUrl, updateUploaderFields, updateAllowRegistration, updateCleanupSetting, updateMaxFileSize } from '../api/client'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import { usePreferencesStore, ACCENT_PRESETS, BG_PRESETS, type ThemeMode, type AccentKey, type BgColorKey } from '../stores/usePreferencesStore'
import { useT } from '../i18n'
import type { FieldReq } from '../types/common'

/**
 * Render the application settings page with controls for app name, logo, appearance (theme/accent/background),
 * site URL, registration toggle, cleanup automation, uploader form field requirements, and SMTP configuration.
 *
 * @returns The settings page React element
 */
export default function SettingsPage() {
  const { settings, setSettings } = useAppSettingsStore()
  const { theme, accentColor, bgColorKey, setTheme, setAccentColor, setBgColor } = usePreferencesStore()
  const { t } = useT()
  const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Moon }[] = [
    { value: 'dark',  label: t('settings.themeDark'),  icon: Moon },
    { value: 'light', label: t('settings.themeLight'), icon: Sun },
    { value: 'auto',  label: t('settings.themeAuto'),  icon: Monitor },
  ]

  const [appName, setAppName] = useState(settings.appName || 'Filyo')
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '')
  const [saving, setSaving] = useState(false)
  const [siteUrl, setSiteUrl] = useState(settings.siteUrl || '')
  useEffect(() => { setSiteUrl(settings.siteUrl || '') }, [settings.siteUrl])
  const [savingUrl, setSavingUrl] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // SMTP
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)

  // Champs déposant
  const [uploaderNameReq, setUploaderNameReq] = useState<FieldReq>(settings.uploaderNameReq)
  const [uploaderEmailReq, setUploaderEmailReq] = useState<FieldReq>(settings.uploaderEmailReq)
  const [uploaderMsgReq, setUploaderMsgReq] = useState<FieldReq>(settings.uploaderMsgReq)
  const [savingFields, setSavingFields] = useState(false)

  // Inscription
  const [allowRegistration, setAllowRegistration] = useState(settings.allowRegistration)
  const [savingRegistration, setSavingRegistration] = useState(false)

  // Nettoyage automatique
  const [cleanupAfterDays, setCleanupAfterDays] = useState<number | null>(settings.cleanupAfterDays)
  const [savingCleanup, setSavingCleanup] = useState(false)

  // Taille max fichier
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(
    settings.maxFileSizeBytes ? String(Math.round(parseInt(settings.maxFileSizeBytes) / (1024 * 1024))) : ''
  )
  const [savingMaxFileSize, setSavingMaxFileSize] = useState(false)
  useEffect(() => {
    setMaxFileSizeMb(settings.maxFileSizeBytes ? String(Math.round(parseInt(settings.maxFileSizeBytes) / (1024 * 1024))) : '')
  }, [settings.maxFileSizeBytes])

  useEffect(() => {
    getSmtpSettings().then(res => {
      setSmtpHost(res.data.smtpHost || '')
      setSmtpPort(String(res.data.smtpPort || 587))
      setSmtpFrom(res.data.smtpFrom || '')
      setSmtpUser(res.data.smtpUser || '')
      setSmtpPass(res.data.smtpPass || '')
      setSmtpSecure(res.data.smtpSecure ?? true)
    }).catch(() => {})
  }, [])

  const handleSaveName = async () => {
    if (!appName.trim()) return toast.error(t('toast.nameEmpty'))
    setSaving(true)
    try {
      const res = await updateAppName(appName.trim())
      setSettings({ appName: res.data.appName, logoUrl: logoUrl || null })
      toast.success(t('toast.appNameSaved'))
    } catch { toast.error(t('toast.saveError')) }
    setSaving(false)
  }

  const handleSaveUrl = async () => {
    setSavingUrl(true)
    try {
      await updateSiteUrl(siteUrl.trim())
      setSettings({ siteUrl: siteUrl.trim() })
      toast.success(t('toast.siteUrlSaved'))
    } catch { toast.error(t('toast.saveError')) }
    setSavingUrl(false)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error(t('toast.imageRequired'))
    if (file.size > 2 * 1024 * 1024) return toast.error(t('toast.imageTooLarge2'))

    setUploading(true)
    try {
      const form = new FormData()
      form.append('logo', file)
      const res = await uploadLogo(form)
      const newLogoUrl = res.data.logoUrl
      setLogoUrl(newLogoUrl)
      setSettings({ appName, logoUrl: newLogoUrl })
      toast.success(t('toast.logoUpdated'))
    } catch (err: any) {
      const status = err?.response?.status
      const code = err?.response?.data?.code
      if (status === 413 || code === 'FILE_TOO_LARGE') {
        toast.error(t('toast.imageTooLarge2'))
      } else {
        toast.error(t('toast.uploadError'))
      }
    }
    setUploading(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleDeleteLogo = async () => {
    setDeleting(true)
    try {
      await deleteLogo()
      setLogoUrl('')
      setSettings({ appName, logoUrl: null })
      toast.success(t('toast.logoDeleted'))
    } catch { toast.error(t('toast.deleteError')) }
    setDeleting(false)
  }

  const handleSaveSmtp = async () => {
    setSavingSmtp(true)
    try {
      await updateSmtpSettings({
        smtpHost: smtpHost.trim() || undefined,
        smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
        smtpFrom: smtpFrom.trim() || undefined,
        smtpUser: smtpUser.trim() || undefined,
        smtpPass: smtpPass || undefined,
        smtpSecure,
      })
      toast.success(t('toast.smtpSaved'))
    } catch { toast.error(t('toast.saveError')) }
    setSavingSmtp(false)
  }

  const handleSaveFields = async () => {
    setSavingFields(true)
    try {
      await updateUploaderFields({ uploaderNameReq, uploaderEmailReq, uploaderMsgReq })
      toast.success(t('toast.fieldsSaved'))
    } catch { toast.error(t('toast.saveError')) }
    setSavingFields(false)
  }

  const handleTestSmtp = async () => {
    setTestingSmtp(true)
    try {
      const res = await testSmtp({
        smtpHost,
        smtpPort: Number(smtpPort) || 587,
        smtpFrom,
        smtpUser,
        smtpPass,
      })
      void res
      toast.success(t('toast.smtpOk'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'SMTP_INCOMPLETE') {
        toast.error(t('toast.smtpIncomplete'))
      } else {
        toast.error(t('toast.smtpFailed', { detail: err.response?.data?.detail || '' }))
      }
    }
    setTestingSmtp(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Titre */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <Settings size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
          <p className="text-white/40 text-sm">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* Section : Nom de l'application */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Type size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.appNameSection')}</h3>
        </div>
        <div className="flex gap-3">
          <input
            value={appName}
            onChange={e => setAppName(e.target.value)}
            className="input flex-1"
            placeholder={t('settings.appNamePlaceholder')}
            maxLength={64}
          />
          <button onClick={handleSaveName} disabled={saving}
            className="btn-primary flex items-center gap-2 px-5 whitespace-nowrap">
            {saving
              ? <RefreshCw size={14} className="animate-spin" />
              : <Check size={14} />}
            {t('common.save')}
          </button>
        </div>
        <p className="text-xs text-white/30 mt-2">{t('settings.appNameHint')}</p>
      </div>

      {/* Section : Logo */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Image size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.logoSection')}</h3>
        </div>

        {logoUrl ? (
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
            </div>
            <div className="space-y-2">
              <button onClick={() => fileInput.current?.click()}
                className="btn-secondary flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center">
                <Upload size={14} /> {t('settings.replace')}
              </button>
              <button onClick={handleDeleteLogo} disabled={deleting}
                className="btn-danger flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center">
                {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t('common.delete')}
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInput.current?.click()}
            className="border-2 border-dashed border-white/15 rounded-xl p-10 text-center cursor-pointer hover:border-brand-500/50 hover:bg-brand-500/5 transition-all group"
          >
            <div className="w-12 h-12 bg-brand-500/15 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:bg-brand-500/25 transition-colors">
              {uploading
                ? <RefreshCw size={22} className="text-brand-400 animate-spin" />
                : <Upload size={22} className="text-brand-400" />}
            </div>
            <p className="font-medium text-white/70 mb-1">
              {uploading ? t('settings.uploading') : t('settings.clickLogo')}
            </p>
            <p className="text-xs text-white/30">{t('settings.logoHint')}</p>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={handleLogoUpload}
          className="hidden"
        />
        <p className="text-xs text-white/30 mt-3">{t('settings.logoRecommended')}</p>
      </div>

      {/* Section : Apparence */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Palette size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.appearanceSection')}</h3>
          <span className="text-xs text-white/30 ml-auto">{t('settings.appliesToAll')}</span>
        </div>

        {/* Thème */}
        <div className="mb-6">
          <label className="text-xs text-white/50 mb-3 block uppercase tracking-wider">{t('settings.themeLabel')}</label>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(opt => {
              const Icon = opt.icon
              const active = theme === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex flex-col items-center gap-2 py-3 px-2 rounded-xl border transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                      : 'border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-white/30 mt-2">
            {theme === 'auto' ? t('settings.themeAutoHint') : ''}
          </p>
        </div>

        {/* Couleur d'accent */}
        <div>
          <label className="text-xs text-white/50 mb-3 block uppercase tracking-wider">{t('settings.accentLabel')}</label>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(ACCENT_PRESETS) as [AccentKey, typeof ACCENT_PRESETS[AccentKey]][]).map(([key, preset]) => {
              const active = accentColor === key
              return (
                <button
                  key={key}
                  onClick={() => setAccentColor(key)}
                  title={preset.name}
                  className={`w-9 h-9 rounded-xl transition-all ${
                    active ? 'scale-110 ring-2 ring-offset-2 ring-offset-surface-800' : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ background: preset.hex }}
                >
                  {active && (
                    <span className="flex items-center justify-center w-full h-full">
                      <Check size={14} className="text-white drop-shadow" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-white/30 mt-3">
            {t('settings.accentCurrent', { name: ACCENT_PRESETS[accentColor].name })}
          </p>
        </div>

        {/* Couleur de fond */}
        <div className="mt-6">
          <label className="text-xs text-white/50 mb-3 block uppercase tracking-wider">{t('settings.bgLabel')}</label>
          <div className="flex flex-wrap gap-3 mb-3">
            <button
              onClick={() => setBgColor(null)}
              title="Défaut"
              className={`w-9 h-9 rounded-xl border-2 transition-all flex items-center justify-center bg-surface-700 ${
                !bgColorKey
                  ? 'border-brand-500 ring-2 ring-offset-2 ring-offset-surface-800 ring-brand-500'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              {!bgColorKey && <Check size={14} className="text-white" />}
            </button>
            {(Object.entries(BG_PRESETS) as [BgColorKey, typeof BG_PRESETS[BgColorKey]][]).filter(([, p]) => p.theme === (isDark ? 'dark' : 'light')).map(([key, preset]) => {
              const active = bgColorKey === key
              return (
                <button
                  key={key}
                  onClick={() => setBgColor(key)}
                  title={preset.label}
                  className={`w-9 h-9 rounded-xl transition-all ${
                    active ? 'scale-110 ring-2 ring-offset-2 ring-offset-surface-800' : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ background: preset.s900, border: '2px solid', borderColor: active ? 'white' : 'transparent' }}
                >
                  {active && (
                    <span className="flex items-center justify-center w-full h-full">
                      <Check size={14} className="text-white drop-shadow" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-white/30">{t('settings.bgHint')}</p>
        </div>
      </div>
      {/* Section : Adresse du site */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.siteUrlSection')}</h3>
        </div>
        <div className="flex gap-3">
          <input
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            className="input flex-1"
            placeholder={t('settings.siteUrlPlaceholder')}
          />
          <button onClick={handleSaveUrl} disabled={savingUrl}
            className="btn-primary flex items-center gap-2 px-5 whitespace-nowrap">
            {savingUrl ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {t('common.save')}
          </button>
        </div>
        {siteUrl && (
          <p className="text-xs text-white/30 mt-2">
            Exemple : <span className="text-brand-400 font-mono">{siteUrl}/s/xK9mPqR3</span>
          </p>
        )}
        <p className="text-xs text-white/30 mt-1">{t('settings.siteUrlHint')}</p>
      </div>
      {/* Section : Authentification */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Users size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.authSection')}</h3>
        </div>
        <div className="flex items-center justify-between py-3 px-4 bg-white/3 rounded-xl">
          <div>
            <p className="text-sm font-medium">{t('settings.freeReg')}</p>
            <p className="text-xs text-white/40 mt-0.5">{t('settings.freeRegHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            {savingRegistration && <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />}
            <div
              onClick={async () => {
                const next = !allowRegistration
                setSavingRegistration(true)
                try {
                  await updateAllowRegistration(next)
                  setAllowRegistration(next)
                  toast.success(next ? t('settings.freeRegEnabled') : t('settings.freeRegDisabled'))
                } catch { toast.error(t('toast.saveError')) }
                setSavingRegistration(false)
              }}
              className={`w-11 h-6 rounded-full cursor-pointer transition-colors relative flex-shrink-0 ${allowRegistration ? 'bg-brand-500' : 'bg-white/20'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${allowRegistration ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Section : Nettoyage automatique */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Clock size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.cleanupSection')}</h3>
          <span className="text-xs text-white/30 ml-auto">{t('settings.cleanupHint')}</span>
        </div>
        <div className="flex items-center justify-between py-3 px-4 bg-white/3 rounded-xl">
          <p className="text-sm font-medium">{t('settings.cleanupLabel')}</p>
          <div className="flex items-center gap-2">
            {savingCleanup && <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />}
            <select
              value={cleanupAfterDays === null ? 'never' : String(cleanupAfterDays)}
              onChange={async e => {
                const val = e.target.value === 'never' ? null : Number(e.target.value)
                setSavingCleanup(true)
                try {
                  await updateCleanupSetting(val)
                  setCleanupAfterDays(val)
                  toast.success(t('settings.cleanupSaved'))
                } catch { toast.error(t('toast.saveError')) }
                setSavingCleanup(false)
              }}
              className="input py-1.5 text-sm w-44"
            >
              <option value="never">{t('settings.cleanupNever')}</option>
              <option value="0">{t('settings.cleanupAtExpiry')}</option>
              <option value="1">{t('settings.cleanup1d')}</option>
              <option value="3">{t('settings.cleanup3d')}</option>
              <option value="7">{t('settings.cleanup7d')}</option>
              <option value="30">{t('settings.cleanup30d')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section : Taille max fichier */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Upload size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.maxFileSizeSection')}</h3>
          <span className="text-xs text-white/30 ml-auto">{t('settings.maxFileSizeHint')}</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1"
            value={maxFileSizeMb}
            onChange={e => setMaxFileSizeMb(e.target.value)}
            placeholder={t('settings.maxFileSizePlaceholder')}
            className="input w-40"
          />
          <span className="text-sm text-white/50">MB</span>
          <button
            onClick={async () => {
              setSavingMaxFileSize(true)
              try {
                const bytes = maxFileSizeMb ? Math.round(parseFloat(maxFileSizeMb) * 1024 * 1024) : null
                await updateMaxFileSize(bytes)
                setSettings({ maxFileSizeBytes: bytes ? String(bytes) : null })
                toast.success(t('settings.maxFileSizeSaved'))
              } catch { toast.error(t('toast.saveError')) }
              setSavingMaxFileSize(false)
            }}
            disabled={savingMaxFileSize}
            className="btn-primary flex items-center gap-2 py-2 px-4"
          >
            {savingMaxFileSize ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {t('common.save')}
          </button>
          {maxFileSizeMb && (
            <button
              onClick={async () => {
                setSavingMaxFileSize(true)
                try {
                  await updateMaxFileSize(null)
                  setSettings({ maxFileSizeBytes: null })
                  setMaxFileSizeMb('')
                  toast.success(t('settings.maxFileSizeRemoved'))
                } catch { toast.error(t('toast.saveError')) }
                setSavingMaxFileSize(false)
              }}
              disabled={savingMaxFileSize}
              className="btn-secondary flex items-center gap-2 py-2 px-4 text-sm"
            >
              {t('settings.maxFileSizeUnlimited')}
            </button>
          )}
        </div>
      </div>

      {/* Section : Champs formulaire déposant */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Users size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.uploaderFieldsSection')}</h3>
          <span className="text-xs text-white/30 ml-auto">{t('settings.uploaderFormHint')}</span>
        </div>

        {([
          { label: t('settings.nameField'), key: 'uploaderNameReq', value: uploaderNameReq, set: setUploaderNameReq },
          { label: t('settings.emailField'), key: 'uploaderEmailReq', value: uploaderEmailReq, set: setUploaderEmailReq },
          { label: t('settings.messageField'), key: 'uploaderMsgReq', value: uploaderMsgReq, set: setUploaderMsgReq },
        ] as { label: string; key: string; value: string; set: (v: any) => void }[]).map(field => (
          <div key={field.key} className="flex items-center justify-between py-3 px-4 bg-white/3 rounded-xl mb-3">
            <div>
              <p className="text-sm font-medium">{field.label}</p>
              <p className="text-xs text-white/40 mt-0.5">
                {field.value === 'hidden' && t('settings.fieldDescHidden')}
                {field.value === 'optional' && t('settings.fieldDescOptional')}
                {field.value === 'required' && t('settings.fieldDescRequired')}
              </p>
            </div>
            <select
              value={field.value}
              onChange={e => field.set(e.target.value)}
              className="input text-sm py-1.5 w-40"
            >
              <option value="hidden">{t('settings.hidden')}</option>
              <option value="optional">{t('settings.optional')}</option>
              <option value="required">{t('settings.required')}</option>
            </select>
          </div>
        ))}

        <button
          onClick={handleSaveFields}
          disabled={savingFields}
          className="btn-primary flex items-center gap-2 py-2.5 px-5 mt-2">
          {savingFields ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          {t('common.save')}
        </button>
      </div>

      {/* Section : Serveur SMTP */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Mail size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.smtpSection')}</h3>
          <span className="text-xs text-white/30 ml-auto">{t('settings.smtpHint')}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpHost')}</label>
            <input
              value={smtpHost}
              onChange={e => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              className="input"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpPort')}</label>
            <input
              value={smtpPort}
              onChange={e => setSmtpPort(e.target.value)}
              placeholder="587"
              type="number"
              className="input"
            />
          </div>
          <div className="col-span-2 flex items-center justify-between py-2 px-3 rounded-xl border border-white/10 bg-white/5">
            <div>
              <p className="text-sm font-medium">{t('settings.smtpStarttls')}</p>
              <p className="text-xs text-white/40 mt-0.5">{t('settings.smtpStarttlsHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => setSmtpSecure(v => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                smtpSecure ? 'bg-brand-500' : 'bg-white/20'
              }`}
              role="switch"
              aria-checked={smtpSecure}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                smtpSecure ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpFrom')}</label>
            <input
              value={smtpFrom}
              onChange={e => setSmtpFrom(e.target.value)}
              placeholder="noreply@mondomaine.fr"
              type="email"
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpUser')}</label>
            <input
              value={smtpUser}
              onChange={e => setSmtpUser(e.target.value)}
              placeholder="smtp_user"
              autoComplete="off"
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpPassword')}</label>
            <div className="relative">
              <input
                value={smtpPass}
                onChange={e => setSmtpPass(e.target.value)}
                placeholder="••••••••"
                type={showSmtpPass ? 'text' : 'password'}
                autoComplete="new-password"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSmtpPass(!showSmtpPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {showSmtpPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Boutons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleSaveSmtp}
            disabled={savingSmtp}
            className="btn-primary flex items-center gap-2 py-2.5 px-5"
          >
            {savingSmtp ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {t('common.save')}
          </button>
          <button
            onClick={handleTestSmtp}
            disabled={testingSmtp || !smtpHost}
            className="btn-secondary flex items-center gap-2 py-2.5 px-5 disabled:opacity-40"
          >
            {testingSmtp ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
            {t('settings.smtpTest')}
          </button>
        </div>
        <p className="text-xs text-white/30 mt-3">{t('settings.smtpTestHint')}</p>
      </div>

    </div>
  )
}
