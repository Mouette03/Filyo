import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Lock, AlertTriangle, ArrowDownUp, Clock, Shield, EyeOff, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { getShareInfo, downloadShare, getSettings } from '../api/client'
import { formatBytes, formatDate, getFileIcon, downloadBlob, formatSpeed } from '../lib/utils'
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
  const { t } = useT()
  const { settings, setSettings } = useAppSettingsStore()
  const appName = settings.appName || 'Filyo'

  useEffect(() => {
    getSettings().then(r => setSettings(r.data)).catch(() => {})
  }, [])

  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Pour le mode batch : état de téléchargement par shareToken
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({})
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  const [downloadSpeed, setDownloadSpeed] = useState<Record<string, number>>({})

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
        } else {
          setError('share.invalidDesc')
          setStatus('error')
        }
      })
  }, [token])

  // Téléchargement d'un fichier unique
  const handleDownloadSingle = async () => {
    if (!token || !info) return
    setDownloading(p => ({ ...p, [token]: true }))
    setDownloadProgress(p => ({ ...p, [token]: 0 }))
    try {
      const res = await downloadShare(token, password || undefined,
        (pct, speed) => {
          setDownloadProgress(p => ({ ...p, [token]: pct }))
          setDownloadSpeed(p => ({ ...p, [token]: speed }))
        }
      )
      downloadBlob(res.data, info.filename)
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
    setDownloadProgress(p => ({ ...p, [shareToken]: 0 }))
    try {
      const res = await downloadShare(shareToken, password || undefined,
        (pct, speed) => {
          setDownloadProgress(p => ({ ...p, [shareToken]: pct }))
          setDownloadSpeed(p => ({ ...p, [shareToken]: speed }))
        }
      )
      downloadBlob(res.data, filename)
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
      setDownloadProgress(p => ({ ...p, [bf.shareToken]: 0 }))
      try {
        const res = await downloadShare(bf.shareToken, password || undefined,
          (pct, speed) => {
            setDownloadProgress(p => ({ ...p, [bf.shareToken]: pct }))
            setDownloadSpeed(p => ({ ...p, [bf.shareToken]: speed }))
          }
        )
        downloadBlob(res.data, info.hideFilenames ? `fichier-${i + 1}` : bf.filename)
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
                  <div className="grid grid-cols-2 gap-3">
                    {info.expiresAt && (
                      <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5">
                        <p className="text-xs [color:var(--text-40)] flex items-center gap-1 mb-0.5">
                          <Clock size={10} /> {t('share.expires')}
                        </p>
                        <p className="text-sm font-medium">{formatDate(info.expiresAt)}</p>
                      </div>
                    )}
                    {info.maxDownloads && (
                      <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5">
                        <p className="text-xs [color:var(--text-40)] flex items-center gap-1 mb-0.5">
                          <Download size={10} /> {t('share.downloads')}
                        </p>
                        <p className="text-sm font-medium">{info.downloads} / {info.maxDownloads}</p>
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
                      const currentPct = allFiles.reduce((acc, bf) =>
                        downloading[bf.shareToken] ? downloadProgress[bf.shareToken] ?? 0 : acc
                      , 0)
                      const overallPct = Math.round(((doneCount + currentPct / 100) / allFiles.length) * 100)
                      return (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs [color:var(--text-40)] mb-1">
                            <span>{doneCount} / {allFiles.length} fichier(s)</span>
                            <span>{overallPct}%</span>
                          </div>
                          <div className="h-1.5 [background:var(--surface-600)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                              style={{ width: `${overallPct}%` }}
                            />
                          </div>
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
                            {downloading[bf.shareToken]
                              ? `${downloadProgress[bf.shareToken] ?? 0}%${downloadSpeed[bf.shareToken] > 0 ? ` · ${formatSpeed(downloadSpeed[bf.shareToken])}` : ''}`
                              : t('share.batchDownloadBtn')}
                          </button>
                        )}
                      </div>
                      {downloading[bf.shareToken] && (
                        <div className="mt-2 h-1 [background:var(--surface-600)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-200"
                            style={{ width: `${downloadProgress[bf.shareToken] ?? 0}%` }}
                          />
                        </div>
                      )}
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
                <div className="grid grid-cols-2 gap-3">
                  {info.expiresAt && (
                    <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5">
                      <p className="text-xs [color:var(--text-40)] flex items-center gap-1 mb-0.5">
                        <Clock size={10} /> {t('share.expires')}
                      </p>
                      <p className="text-sm font-medium">{formatDate(info.expiresAt)}</p>
                    </div>
                  )}
                  {info.maxDownloads && (
                    <div className="[background:var(--surface-700)] rounded-xl px-3 py-2.5">
                      <p className="text-xs [color:var(--text-40)] flex items-center gap-1 mb-0.5">
                        <Download size={10} /> {t('share.downloads')}
                      </p>
                      <p className="text-sm font-medium">{info.downloads} / {info.maxDownloads}</p>
                    </div>
                  )}
                  {info.hasPassword && (
                    <div className="col-span-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5 flex items-center gap-2">
                      <Lock size={14} className="text-orange-400" />
                      <p className="text-sm text-orange-300">{t('share.passwordProtected')}</p>
                    </div>
                  )}
                </div>

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
                          {downloadProgress[token!] > 0
                            ? `${downloadProgress[token!]}%${downloadSpeed[token!] > 0 ? ` · ${formatSpeed(downloadSpeed[token!])}` : ''}`
                            : t('share.downloading')}
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          {t('share.downloadBtn')}
                        </>
                      )}
                    </button>
                    {downloading[token!] && (
                      <div className="mt-2">
                        <div className="h-1.5 [background:var(--surface-600)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                            style={{ width: `${downloadProgress[token!] ?? 0}%` }}
                          />
                        </div>
                      </div>
                    )}
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
