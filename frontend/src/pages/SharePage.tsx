import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Lock, AlertTriangle, ArrowDownUp, Clock, Shield, EyeOff, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { getShareInfo, getShareDlToken, getSettings } from '../api/client'
import { formatBytes, formatDate, getFileIcon, formatCountdown } from '../lib/utils'
import { useT } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'

interface BatchFile {
  shareToken: string
  filename: string
  mimeType: string
  size: string
  downloads: number
  maxDownloads: number | null
}

interface ShareInfo {
  token: string
  filename: string
  mimeType: string
  size: string
  expiresAt: string | null
  hasPassword: boolean
  downloads: number
  maxDownloads: number | null
  batchFiles: BatchFile[] | null
  batchToken: string | null
  hideFilenames: boolean
}

type Status = 'loading' | 'ready' | 'error' | 'expired'

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const { t, lang } = useT()
  const { settings, setSettings } = useAppSettingsStore()
  const appName = settings.appName || 'Filyo'

  useEffect(() => {
    getSettings().then(r => setSettings(r.data)).catch(() => {})
  }, [])

  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Pour le mode batch : état de téléchargement par shareToken
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({})
  const [downloadingAll, setDownloadingAll] = useState(false)

  useEffect(() => {
    if (!token) return
    getShareInfo(token)
      .then(r => {
        setInfo(r.data)
        setStatus('ready')
        if (r.data.hasPassword) setShowPassword(true)
      })
      .catch(err => {
        const code = err.response?.data?.code
        if (code === 'SHARE_EXPIRED') {
          setError('share.expiredDesc')
          setStatus('expired')
        } else if (code === 'SHARE_LIMIT_REACHED') {
          setError('share.limitReachedDesc')
          setStatus('expired')
        } else if (code === 'SHARE_INACTIVE') {
          setError('share.inactiveDesc')
          setStatus('expired')
        } else {
          setError('share.invalidDesc')
          setStatus('error')
        }
      })
  }, [token, retryCount])

  // Téléchargement d'un fichier unique
  const handleDownloadSingle = async () => {
    if (!token || !info) return
    setDownloading(p => ({ ...p, [token]: true }))
    try {
      const res = await getShareDlToken(token, password || undefined)
      const a = document.createElement('a')
      a.href = `/api/shares/dl/${res.data.dlToken}`
      a.download = info.filename
      a.click()
      setDownloaded(p => ({ ...p, [token]: true }))
      toast.success(t('toast.downloadStarted'))
    } catch (err: any) {
      if (err.response?.status === 429) {
        toast.error(t('toast.tooManyRequests'))
      } else if (err.response?.status === 401) {
        toast.error(t('toast.passwordWrong'))
      } else if (err.response?.data?.code === 'FILE_MISSING') {
        toast.error(t('error.fileMissing'))
      } else {
        toast.error(t('common.error'))
      }
    }
    setDownloading(p => ({ ...p, [token]: false }))
  }

  // Téléchargement d'un fichier dans un lot
  const handleDownloadBatch = async (shareToken: string, filename: string) => {
    setDownloading(p => ({ ...p, [shareToken]: true }))
    try {
      const res = await getShareDlToken(shareToken, password || undefined)
      const a = document.createElement('a')
      a.href = `/api/shares/dl/${res.data.dlToken}`
      a.download = filename
      a.click()
      setDownloaded(p => ({ ...p, [shareToken]: true }))
      toast.success(t('toast.downloadStarted'))
    } catch (err: any) {
      if (err.response?.status === 429) {
        toast.error(t('toast.tooManyRequests'))
      } else if (err.response?.status === 401) {
        toast.error(t('toast.passwordWrong'))
      } else if (err.response?.data?.code === 'FILE_MISSING') {
        toast.error(t('error.fileMissing'))
      } else {
        toast.error(t('common.error'))
      }
    }
    setDownloading(p => ({ ...p, [shareToken]: false }))
  }

  // Téléchargement de tous les fichiers du lot séquentiellement
  const handleDownloadAll = async () => {
    if (!info?.batchFiles) return
    const files = info.batchFiles.filter(bf => bf.shareToken)
    setDownloadingAll(true)
    let failures = 0
    for (let i = 0; i < files.length; i++) {
      const bf = files[i]
      if (downloaded[bf.shareToken]) continue
      setDownloading(p => ({ ...p, [bf.shareToken]: true }))
      try {
        const res = await getShareDlToken(bf.shareToken, password || undefined)
        const a = document.createElement('a')
        a.href = `/api/shares/dl/${res.data.dlToken}`
        a.download = info.hideFilenames ? `fichier-${i + 1}` : bf.filename
        a.click()
        setDownloaded(p => ({ ...p, [bf.shareToken]: true }))
      } catch (err: any) {
        if (err.response?.status === 429) {
          toast.error(t('toast.tooManyRequests'))
          setDownloading(p => ({ ...p, [bf.shareToken]: false }))
          setDownloadingAll(false)
          return
        } else if (err.response?.status === 401) {
          toast.error(t('toast.passwordWrong'))
          setDownloading(p => ({ ...p, [bf.shareToken]: false }))
          setDownloadingAll(false)
          return
        }
        failures++
        toast.error(t('common.error'))
      }
      setDownloading(p => ({ ...p, [bf.shareToken]: false }))
    }
    setDownloadingAll(false)
    if (failures === 0) toast.success(t('toast.downloadStarted'))
  }

  const isBatch = info?.batchFiles && info.batchFiles.filter(bf => bf.shareToken).length > 1

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">

      {/* Sélecteur de langue — coin haut droit */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        {settings.logoUrl ? (
          <img src={settings.logoUrl} alt="logo" className="h-8 w-auto object-contain" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <ArrowDownUp size={16} className="text-white" />
          </div>
        )}
        <span className="font-bold text-lg tracking-tight">{appName}</span>
      </div>

      <div className="w-full max-w-md">
        {/* Loading */}
        {status === 'loading' && (
          <div className="card text-center py-12">
            <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="[color:var(--text-50)]">{t('common.loading')}</p>
          </div>
        )}

        {/* Error / Expired */}
        {(status === 'error' || status === 'expired') && (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{status === 'expired' ? t('share.expired') : t('share.invalid')}</h2>
            <p className="[color:var(--text-50)] text-sm">{t(error)}</p>
            {status === 'expired' && (
              <button
                onClick={() => { setStatus('loading'); setRetryCount(c => c + 1) }}
                className="mt-4 btn btn-secondary text-sm"
              >{t('common.refresh')}</button>
            )}
          </div>
        )}

        {/* Prêt */}
        {status === 'ready' && info && (
          <div className="card space-y-6">

            {/* ── Mode LOT ── */}
            {isBatch ? (
              <>
                {/* Entête lot */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-500/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Package size={26} className="text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-lg leading-tight">
                      {t('share.batchTitle', { count: String(info.batchFiles!.length) })}
                    </h2>
                    <p className="[color:var(--text-50)] text-sm mt-0.5">{t('share.batchSubtitle')}</p>
                  </div>
                </div>

                {/* Badge noms masqués */}
                {info.hideFilenames && (
                  <div className="flex items-center gap-2 [background:var(--surface-700)] rounded-xl px-3 py-2">
                    <EyeOff size={13} className="[color:var(--text-40)]" />
                    <p className="text-xs [color:var(--text-50)]">{t('share.batchHideFilenamesNote')}</p>
                  </div>
                )}

                {/* Meta expiration / téléchargements */}
                {(info.expiresAt || info.maxDownloads) && (
                  <div className="space-y-2">
                    {info.expiresAt && (
                      <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Clock size={13} className="[color:var(--text-40)] flex-shrink-0" />
                        <span className="text-xs [color:var(--text-40)]">{t('share.expires')}</span>
                        <span className="text-sm font-medium">{formatDate(info.expiresAt)}</span>
                        {formatCountdown(info.expiresAt, lang) && (
                          <span className="text-xs [color:var(--text-40)]">· {t('share.expiresIn')} {formatCountdown(info.expiresAt, lang)}</span>
                        )}
                      </div>
                    )}
                    {info.maxDownloads && (
                      <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5 flex items-center gap-2">
                        <Download size={13} className="[color:var(--text-40)] flex-shrink-0" />
                        <span className="text-sm font-medium">{info.downloads} / {info.maxDownloads} {t('share.downloads')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Badge protégé */}
                {info.hasPassword && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <Lock size={14} className="text-orange-400" />
                    <p className="text-sm text-orange-300">{t('share.batchPasswordProtected')}</p>
                  </div>
                )}

                {/* Saisie mot de passe (une seule fois pour tout le lot) */}
                {showPassword && (
                  <div>
                    <label className="text-xs [color:var(--text-50)] mb-1.5 flex items-center gap-1">
                      <Shield size={11} /> {t('share.passwordLabel')}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={t('share.passwordPlaceholder')}
                      className="input"
                      autoFocus
                    />
                  </div>
                )}

                {/* Bouton Tout télécharger */}
                {info.batchFiles!.filter(bf => bf.shareToken && !downloaded[bf.shareToken]).length > 0 && (
                  <div>
                    <button
                      onClick={handleDownloadAll}
                      disabled={downloadingAll}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
                      {downloadingAll
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('share.downloading')}</>
                        : <><Download size={16} /> {t('share.batchDownloadAll')}</>}
                    </button>
                    {downloadingAll && (() => {
                      const allFiles = info.batchFiles!.filter(bf => bf.shareToken)
                      const doneCount = allFiles.filter(bf => downloaded[bf.shareToken]).length
                      return (
                        <div className="mt-2 text-xs [color:var(--text-40)] text-center">
                          {doneCount} / {allFiles.length} fichier(s)
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Liste des fichiers */}
                <div className="space-y-2">
                  {info.batchFiles!.filter(bf => bf.shareToken).map((bf, idx) => (
                    <div key={bf.shareToken}
                      className="flex flex-col [background:var(--surface-700)] hover:[background:var(--surface-600)] rounded-xl px-3 py-2.5 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-xl flex-shrink-0">{getFileIcon(bf.mimeType)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {info.hideFilenames
                              ? t('share.hiddenFilename', { index: String(idx + 1) })
                              : bf.filename}
                          </p>
                          <p className="text-xs [color:var(--text-40)] mt-0.5">{formatBytes(bf.size)}</p>
                        </div>
                        {downloaded[bf.shareToken] ? (
                          <span className="text-xs text-emerald-400 flex-shrink-0">✓</span>
                        ) : (
                          <button
                            onClick={() => handleDownloadBatch(bf.shareToken, bf.filename)}
                            disabled={downloading[bf.shareToken]}
                            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 flex-shrink-0 disabled:opacity-50">
                            {downloading[bf.shareToken]
                              ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <Download size={13} />}
                            {downloading[bf.shareToken] ? t('share.downloading') : t('share.batchDownloadBtn')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* ── Mode FICHIER UNIQUE ── */
              <>
                {/* File info */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-brand-500/20 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                    {getFileIcon(info.mimeType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-lg leading-tight truncate">{info.filename}</h2>
                    <p className="[color:var(--text-50)] text-sm mt-0.5">{formatBytes(info.size)}</p>
                  </div>
                </div>

                {/* Meta */}
                {(info.expiresAt || info.maxDownloads || info.hasPassword) && (
                  <div className="space-y-2">
                    {info.expiresAt && (
                      <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Clock size={13} className="[color:var(--text-40)] flex-shrink-0" />
                        <span className="text-xs [color:var(--text-40)]">{t('share.expires')}</span>
                        <span className="text-sm font-medium">{formatDate(info.expiresAt)}</span>
                        {formatCountdown(info.expiresAt, lang) && (
                          <span className="text-xs [color:var(--text-40)]">· {t('share.expiresIn')} {formatCountdown(info.expiresAt, lang)}</span>
                        )}
                      </div>
                    )}
                    {info.maxDownloads && (
                      <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5 flex items-center gap-2">
                        <Download size={13} className="[color:var(--text-40)] flex-shrink-0" />
                        <span className="text-sm font-medium">{info.downloads} / {info.maxDownloads} {t('share.downloads')}</span>
                      </div>
                    )}
                    {info.hasPassword && (
                      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5 flex items-center gap-2">
                        <Lock size={14} className="text-orange-400 flex-shrink-0" />
                        <p className="text-sm text-orange-300">{t('share.passwordProtected')}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Password input */}
                {showPassword && (
                  <div>
                    <label className="text-xs [color:var(--text-50)] mb-1.5 flex items-center gap-1">
                      <Shield size={11} /> {t('share.passwordLabel')}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleDownloadSingle()}
                      placeholder={t('share.passwordPlaceholder')}
                      className="input"
                      autoFocus
                    />
                  </div>
                )}

                {/* Download button */}
                {downloaded[token!] ? (
                  <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-4 py-3 text-center text-emerald-400 font-medium">
                    {t('share.downloadStarted')}
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={handleDownloadSingle}
                      disabled={downloading[token!]}
                      className="btn-primary w-full flex items-center justify-center gap-2">
                      {downloading[token!] ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t('share.downloading')}
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          {t('share.downloadBtn')}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-center [color:var(--text-20)] text-xs mt-6">
          {t('share.footer', { app: appName })}
        </p>
      </div>
    </div>
  )
}
