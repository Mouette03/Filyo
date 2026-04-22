import { useEffect, useState, useRef } from 'react'
import { Settings, Upload, Trash2, Check, Type, Image, RefreshCw, Mail, Eye, EyeOff, Wifi, Globe, Users, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { updateAppName, uploadLogo, deleteLogo, getSmtpSettings, updateSmtpSettings, testSmtp, updateSiteUrl, updateUploaderFields, updateAllowRegistration, updateCleanupSetting, updateMaxFileSize, updateProxyUpload } from '../api/client'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
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
  const { t } = useT()

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
  const [smtpPassSet, setSmtpPassSet] = useState(false)
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)

  // Champs déposant
  const [uploaderNameReq, setUploaderNameReq] = useState<FieldReq>(settings.uploaderNameReq)
  const [uploaderEmailReq, setUploaderEmailReq] = useState<FieldReq>(settings.uploaderEmailReq)
  const [uploaderMsgReq, setUploaderMsgReq] = useState<FieldReq>(settings.uploaderMsgReq)
  const [savingFields, setSavingFields] = useState(false)
  useEffect(() => {
    setUploaderNameReq(settings.uploaderNameReq)
    setUploaderEmailReq(settings.uploaderEmailReq)
    setUploaderMsgReq(settings.uploaderMsgReq)
  }, [settings.uploaderNameReq, settings.uploaderEmailReq, settings.uploaderMsgReq])

  // Inscription
  const [allowRegistration, setAllowRegistration] = useState(settings.allowRegistration)
  const [savingRegistration, setSavingRegistration] = useState(false)
  useEffect(() => { setAllowRegistration(settings.allowRegistration) }, [settings.allowRegistration])

  // Nettoyage automatique
  const [cleanupAfterDays, setCleanupAfterDays] = useState<number | null>(settings.cleanupAfterDays)
  const [savingCleanup, setSavingCleanup] = useState(false)
  useEffect(() => { setCleanupAfterDays(settings.cleanupAfterDays) }, [settings.cleanupAfterDays])

  // Taille max fichier
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(
    settings.maxFileSizeBytes ? String(Math.round(parseInt(settings.maxFileSizeBytes) / (1024 * 1024))) : ''
  )
  const [savingMaxFileSize, setSavingMaxFileSize] = useState(false)
  useEffect(() => {
    setMaxFileSizeMb(settings.maxFileSizeBytes ? String(Math.round(parseInt(settings.maxFileSizeBytes) / (1024 * 1024))) : '')
  }, [settings.maxFileSizeBytes])

  // Mode upload proxy-compatible
  const [proxyUploadEnabled, setProxyUploadEnabled] = useState<boolean>(settings.proxyUploadEnabled ?? false)
  const [savingProxyUpload, setSavingProxyUpload] = useState(false)
  useEffect(() => { setProxyUploadEnabled(settings.proxyUploadEnabled ?? false) }, [settings.proxyUploadEnabled])

  const handleToggleProxyUpload = async () => {
    const next = !proxyUploadEnabled
    setSavingProxyUpload(true)
    try {
      await updateProxyUpload(next)
      setProxyUploadEnabled(next)
      setSettings({ proxyUploadEnabled: next })
      toast.success(t('settings.proxyUploadSaved'))
    } catch { toast.error(t('toast.saveError')) }
    setSavingProxyUpload(false)
  }

  useEffect(() => {
    getSmtpSettings().then(res => {
      setSmtpHost(res.data.smtpHost || '')
      setSmtpPort(String(res.data.smtpPort || 587))
      setSmtpFrom(res.data.smtpFrom || '')
      setSmtpUser(res.data.smtpUser || '')
      setSmtpPassSet(res.data.smtpPassSet ?? false)
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
      const hasNewPassword = smtpPass.trim().length > 0
      await updateSmtpSettings({
        smtpHost: smtpHost.trim() || undefined,
        smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
        smtpFrom: smtpFrom.trim() || undefined,
        smtpUser: smtpUser.trim() || undefined,
        smtpPass: smtpPass || undefined,
        smtpSecure,
      })
      if (hasNewPassword) {
        setSmtpPassSet(true)
        setSmtpPass('')
      }
      toast.success(t('toast.smtpSaved'))
    } catch { toast.error(t('toast.saveError')) }
    setSavingSmtp(false)
  }

  const handleSaveFields = async () => {
    setSavingFields(true)
    try {
      await updateUploaderFields({ uploaderNameReq, uploaderEmailReq, uploaderMsgReq })
      setSettings({ uploaderNameReq, uploaderEmailReq, uploaderMsgReq })
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
            id="settings-app-name"
            name="appName"
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
          accept="image/*,.svg"
          onChange={handleLogoUpload}
          className="hidden"
        />
      </div>

      {/* Section : Adresse du site */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('settings.siteUrlSection')}</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="settings-site-url"
            name="siteUrl"
            value={siteUrl}
            onChange={e => setSiteUrl(e.target.value)}
            className="input flex-1"
            placeholder={t('settings.siteUrlPlaceholder')}
          />
          <button onClick={handleSaveUrl} disabled={savingUrl}
            className="btn-primary flex items-center justify-center gap-2 px-5 whitespace-nowrap">
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
          <div className="min-w-0 mr-4">
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
                  setSettings({ allowRegistration: next })
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-5">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-brand-400" />
            <h3 className="font-semibold">{t('settings.cleanupSection')}</h3>
          </div>
          <span className="text-xs text-white/30 sm:ml-auto">{t('settings.cleanupHint')}</span>
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
                  setSettings({ cleanupAfterDays: val })
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
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Upload size={16} className="text-brand-400" />
            <h3 className="font-semibold">{t('settings.maxFileSizeSection')}</h3>
          </div>
          <p className="text-xs text-white/30">{t('settings.maxFileSizeHint')}</p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              id="settings-max-file-size"
              name="maxFileSizeMb"
              type="number"
              min="1"
              value={maxFileSizeMb}
              onChange={e => setMaxFileSizeMb(e.target.value)}
              placeholder={t('settings.maxFileSizePlaceholder')}
              className="input flex-1"
            />
            <span className="text-sm text-white/50 flex-shrink-0">MB</span>
          </div>
          <div className="flex gap-3">
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
      </div>

      {/* Section : Mode upload proxy-compatible */}
      <div className="card mb-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Upload size={16} className="text-brand-400" />
            <h3 className="font-semibold">{t('settings.proxyUploadSection')}</h3>
          </div>
          <p className="text-xs text-white/30">{t('settings.proxyUploadHint')}</p>
        </div>
        <div className="flex items-center justify-between py-3 px-4 bg-white/3 rounded-xl">
          <div>
            <p className="text-sm font-medium">
              {proxyUploadEnabled ? t('settings.proxyUploadEnabled') : t('settings.proxyUploadDisabled')}
            </p>
            {proxyUploadEnabled && (
              <p className="text-xs text-white/40 mt-0.5">{settings.proxyUploadChunkMb} MB / morceau</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {savingProxyUpload && <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />}
            <div
              onClick={handleToggleProxyUpload}
              className={`w-11 h-6 rounded-full cursor-pointer transition-colors relative flex-shrink-0 ${proxyUploadEnabled ? 'bg-brand-500' : 'bg-white/20'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${proxyUploadEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Section : Champs formulaire déposant */}
      <div className="card mb-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-brand-400" />
            <h3 className="font-semibold">{t('settings.uploaderFieldsSection')}</h3>
          </div>
          <p className="text-xs text-white/30">{t('settings.uploaderFormHint')}</p>
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
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Mail size={16} className="text-brand-400" />
            <h3 className="font-semibold">{t('settings.smtpSection')}</h3>
          </div>
          <p className="text-xs text-white/30">{t('settings.smtpHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="smtp-host" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpHost')}</label>
            <input
              id="smtp-host"
              name="smtpHost"
              value={smtpHost}
              onChange={e => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              className="input"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="smtp-port" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpPort')}</label>
            <input
              id="smtp-port"
              name="smtpPort"
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
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
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
            <label htmlFor="smtp-from" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpFrom')}</label>
            <input
              id="smtp-from"
              name="smtpFrom"
              value={smtpFrom}
              onChange={e => setSmtpFrom(e.target.value)}
              placeholder="noreply@mondomaine.fr"
              type="email"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="smtp-user" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpUser')}</label>
            <input
              id="smtp-user"
              name="smtpUser"
              value={smtpUser}
              onChange={e => setSmtpUser(e.target.value)}
              placeholder="smtp_user"
              autoComplete="off"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="smtp-password" className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('settings.smtpPassword')}</label>
            <div className="relative">
              <input
                id="smtp-password"
                name="smtpPassword"
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
            {smtpPassSet && !smtpPass && (
              <p className="text-xs text-white/40 mt-1">{t('settings.smtpPasswordSet')}</p>
            )}
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
