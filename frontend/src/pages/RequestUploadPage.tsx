import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload, ArrowDownUp, AlertTriangle, Clock, Check, Lock, User, Mail, MessageSquare, X } from 'lucide-react'
import toast from 'react-hot-toast'
import * as tus from 'tus-js-client'
import { getUploadRequestInfo, getSettings } from '../api/client'
import { formatBytes, formatDate, getFileIcon, formatSpeed } from '../lib/utils'
import { useT } from '../i18n'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'
import LanguageSwitcher from '../components/LanguageSwitcher'
import type { FieldReq } from '../types/common'

interface RequestInfo {
  token: string
  title: string
  message: string | null
  expiresAt: string | null
  hasPassword: boolean
  maxFiles: number | null
  maxSizeBytes: string | null
}

type Status = 'loading' | 'ready' | 'uploading' | 'done' | 'error' | 'expired'

export default function RequestUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<RequestInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index))
  const [uploaderName, setUploaderName] = useState('')
  const [uploaderEmail, setUploaderEmail] = useState('')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const uploadExpiresAtRef = useRef<string | null>(null)
  const tusUploadRef = useRef<tus.Upload | null>(null)
  const [pendingResumes, setPendingResumes] = useState<{ url: string; filename: string; remaining: number; expiry: string }[]>([])

  const tusExpiryKey = (url: string) => `tus-expiry:${url}`
  const storeTusExpiry = (url: string | null | undefined, expiry: string) => {
    if (!url) return
    try { localStorage.setItem(tusExpiryKey(url), expiry) } catch {}
  }
  const storeTusInfo = (url: string | null | undefined, info: { filename: string; totalSize: number; bytesUploaded: number }) => {
    if (!url) return
    try { localStorage.setItem(`tus-info:${url}`, JSON.stringify(info)) } catch {}
  }
  const removeTusInfo = (url: string | null | undefined) => {
    if (!url) return
    try {
      localStorage.removeItem(`tus-info:${url}`)
      localStorage.removeItem(tusExpiryKey(url))
      // Supprimer aussi la clé tus-js-client (sinon bannière réapparaît au refresh)
      const reqPrefix = `tus::tus::filyo::req::${token}::`
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k?.startsWith(reqPrefix)) continue
        try {
          const stored = JSON.parse(localStorage.getItem(k) ?? '{}')
          if (stored.uploadUrl === url) { localStorage.removeItem(k); break }
        } catch {}
      }
    } catch {}
  }

  // Vérifier au montage si un upload a été interrompu
  useEffect(() => {
    const now = Date.now()
    const seen = new Set<string>()

    // 1. Entrées complètes (tus-expiry + tus-info écrits par nos handlers)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith('tus-expiry:')) continue
      const url = key.slice('tus-expiry:'.length)
      const expiry = localStorage.getItem(key)
      if (!expiry) continue
      if (new Date(expiry).getTime() <= now) { localStorage.removeItem(key); continue }
      const infoRaw = localStorage.getItem(`tus-info:${url}`)
      if (!infoRaw) continue
      try {
        const info2 = JSON.parse(infoRaw)
        seen.add(url)
        setPendingResumes(prev => [...prev, { url, filename: info2.filename, remaining: info2.totalSize - info2.bytesUploaded, expiry }])
      } catch {}
    }

    // 2. Fallback : clés tus-js-client (refresh page pendant upload — nos handlers n'ont pas tourné)
    const reqPrefix = `tus::tus::filyo::req::${token}::`
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith(reqPrefix)) continue
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
        const url: string | undefined = stored.uploadUrl
        if (!url || seen.has(url)) continue
        const filename: string = stored.metadata?.filename ?? ''
        const totalSize: number = stored.size ?? 0
        const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        seen.add(url)
        setPendingResumes(prev => [...prev, { url, filename, remaining: totalSize, expiry }])
      } catch {}
    }
  }, [])
  const [nameReq, setNameReq] = useState<FieldReq>('optional')
  const [emailReq, setEmailReq] = useState<FieldReq>('optional')
  const [msgReq, setMsgReq] = useState<FieldReq>('optional')
  const { t } = useT()
  const { settings, setSettings } = useAppSettingsStore()
  const appName = settings.appName || 'Filyo'

  useEffect(() => {
    // Charger config champs déposant + paramètres app
    getSettings().then(r => {
      setNameReq(r.data.uploaderNameReq || 'optional')
      setEmailReq(r.data.uploaderEmailReq || 'optional')
      setMsgReq(r.data.uploaderMsgReq || 'optional')
      setSettings(r.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) return
    getUploadRequestInfo(token)
      .then(r => { setInfo(r.data); setStatus('ready') })
      .catch(err => {
        const code = err.response?.data?.code
        if (code === 'REQUEST_EXPIRED') {
          setError('request.expiredDesc')
          setStatus('expired')
        } else if (code === 'REQUEST_LIMIT_REACHED') {
          setError('request.limitReachedDesc')
          setStatus('expired')
        } else {
          setError('request.invalidDesc')
          setStatus('error')
        }
      })
  }, [token])

  // Bloquer navigation pendant upload en cours
  useEffect(() => {
    if (status !== 'uploading') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(prev => {
      const merged = [...prev, ...accepted]
      if (info?.maxFiles && merged.length > info.maxFiles) {
        toast.error(t('request.tooManyFiles', { count: String(info.maxFiles) }))
        return merged.slice(0, info.maxFiles)
      }
      return merged
    })
  }, [info, t])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  const handleSubmit = async () => {
    if (!files.length || !token) return
    // Validation champs obligatoires
    if (nameReq === 'required' && !uploaderName.trim()) {
      return toast.error(t('toast.nameRequired'))
    }
    if (emailReq === 'required' && !uploaderEmail.trim()) {
      return toast.error(t('toast.emailFieldRequired'))
    }
    if (msgReq === 'required' && !message.trim()) {
      return toast.error(t('toast.messageRequired'))
    }

    // Validation taille max (limite par requête + limite globale)
    const maxPerRequest = info?.maxSizeBytes ? parseInt(info.maxSizeBytes) : null
    const maxGlobal = settings.maxFileSizeBytes ? parseInt(settings.maxFileSizeBytes) : null
    const maxBytes = maxPerRequest !== null && maxGlobal !== null
      ? Math.min(maxPerRequest, maxGlobal)
      : (maxPerRequest ?? maxGlobal)
    if (maxBytes !== null) {
      const tooBig = files.filter(f => f.size > maxBytes)
      if (tooBig.length > 0) {
        toast.error(t('error.fileTooLargeGlobal', { name: tooBig[0].name, max: formatBytes(maxBytes) }))
        return
      }
    }

    setStatus('uploading')
    setProgress(0)
    setProgressLabel('')
    uploadExpiresAtRef.current = null

    // Upload TUS (resumable) — toujours utilisé désormais
    try {
      const startTime = Date.now()

      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi]
        let lastBytesUploaded = 0
        let lastInfoWriteTime = 0

        await new Promise<void>((resolve, reject) => {
          let offlineHandled = false

          const handleOffline = () => {
            if (offlineHandled) return
            offlineHandled = true
            const currentUrl = (tusUpload as any).url as string | null
            const expiry = uploadExpiresAtRef.current ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
            if (currentUrl) {
              storeTusInfo(currentUrl, { filename: file.name, totalSize: file.size, bytesUploaded: lastBytesUploaded })
              storeTusExpiry(currentUrl, expiry)
              setPendingResumes(prev => prev.some(r => r.url === currentUrl) ? prev : [...prev, { url: currentUrl, filename: file.name, remaining: file.size - lastBytesUploaded, expiry }])
            }
            tusUpload.abort().catch(() => {})
            window.removeEventListener('offline', handleOffline)
            setStatus('ready')
            reject(new Error('offline'))
          }
          window.addEventListener('offline', handleOffline)

          const tusUpload = new tus.Upload(file, {
            endpoint: '/api/upload-requests/tus',
            retryDelays: [0, 1000, 3000, 5000],
            storeFingerprintForResuming: true,
            removeFingerprintOnSuccess: true,
            fingerprint: async (f: File) => `tus::filyo::req::${token}::${f.name}::${f.size}::${f.lastModified}`,
            chunkSize: settings.cfBypassEnabled ? settings.cfBypassChunkMb * 1024 * 1024 : Infinity,
            metadata: {
              requestToken: token!,
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              uploaderName: uploaderName || '',
              uploaderEmail: uploaderEmail || '',
              message: message || '',
              password: password || '',
            },
            onProgress: (bytesUploaded: number, bytesTotal: number) => {
              lastBytesUploaded = bytesUploaded
              const filePct = bytesTotal > 0 ? bytesUploaded / bytesTotal : 0
              const globalPct = Math.round(((fi + filePct) / files.length) * 100)
              setProgress(globalPct)
              const elapsed = (Date.now() - startTime) / 1000
              const speed = elapsed > 0.5 ? bytesUploaded / elapsed : 0
              const speedStr = speed > 0 ? ` · ${formatSpeed(speed)}` : ''
              setProgressLabel(`${globalPct}%${speedStr}`)
              const now2 = Date.now()
              if (now2 - lastInfoWriteTime > 2000 && tusUploadRef.current?.url) {
                storeTusInfo(tusUploadRef.current.url, { filename: file.name, totalSize: file.size, bytesUploaded })
                lastInfoWriteTime = now2
              }
            },
            onAfterResponse: (_req: unknown, res: { getHeader: (h: string) => string | undefined }) => {
              const exp = res.getHeader('Upload-Expires')
              if (exp) {
                uploadExpiresAtRef.current = exp
                const url = (tusUpload as any).url as string | null
                if (url) storeTusExpiry(url, exp)
              }
            },
            onSuccess: () => {
              window.removeEventListener('offline', handleOffline)
              const doneUrl = (tusUpload as any).url as string | null
              removeTusInfo(doneUrl)
              setPendingResumes(prev => prev.filter(r => r.url !== doneUrl))
              resolve()
            },
            onError: (err: Error) => {
              window.removeEventListener('offline', handleOffline)
              if (offlineHandled) return
              const httpStatus = (err as any).originalResponse?.getStatus?.()
              if (httpStatus === 429) {
                toast.error(t('toast.tooManyRequests'))
                reject(err)
                return
              }
              if (httpStatus === 401) {
                toast.error(t(!password.trim() ? 'toast.unauthorized' : 'toast.passwordWrong'))
                reject(err)
                return
              }
              const errUrl = (tusUpload as any).url as string | null
              const remainingBytes = file.size - lastBytesUploaded
              const expiry = uploadExpiresAtRef.current ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
              if (errUrl) {
                storeTusInfo(errUrl, { filename: file.name, totalSize: file.size, bytesUploaded: lastBytesUploaded })
                storeTusExpiry(errUrl, expiry)
                setPendingResumes(prev => prev.some(r => r.url === errUrl) ? prev : [...prev, { url: errUrl, filename: file.name, remaining: remainingBytes, expiry }])
              } else {
                toast(t('home.uploadPaused'), { duration: 8000, icon: '\u23f8' })
              }
              reject(err)
            }
          })
          tusUploadRef.current = tusUpload
          tusUpload.findPreviousUploads().then((prev: tus.PreviousUpload[]) => {
            if (prev.length > 0) {
              tusUpload.resumeFromPreviousUpload(prev[0])
              toast(t('request.resuming'), { duration: 5000, icon: '⏸' })
            }
            tusUpload.start()
          })
        })
      }

      setStatus('done')
      toast.success(t('toast.filesDeposited'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'WRONG_PASSWORD') toast.error(t('toast.passwordWrong'))
      else if (code === 'REQUEST_LIMIT_REACHED') toast.error(t('request.limitReachedDesc'))
      else if (code === 'FILE_TOO_LARGE') toast.error(t('error.fileTooLarge'))
      else if (code === 'QUOTA_EXCEEDED') toast.error(t('error.quotaExceeded'))
      else if (err.response?.status === 429) toast.error(t('toast.tooManyRequests'))
      // erreur TUS d\u00e9j\u00e0 affich\u00e9e dans onError
      setStatus('ready')
    } finally {
      setProgressLabel('')
    }
  }

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

      <div className="w-full max-w-md space-y-5">
        {status === 'loading' && (
          <div className="card text-center py-12">
            <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="[color:var(--text-50)]">{t('common.loading')}</p>
          </div>
        )}

        {(status === 'error' || status === 'expired') && (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{status === 'expired' ? t('request.expired') : t('request.invalid')}</h2>
            <p className="[color:var(--text-50)] text-sm">{t(error)}</p>
          </div>
        )}

        {status === 'done' && (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t('request.doneTitle')}</h2>
            <p className="[color:var(--text-50)] text-sm">{t('request.doneMsg')}</p>
          </div>
        )}

        {(status === 'ready' || status === 'uploading') && info && (
          <>
            {/* Request info */}
            <div className="card">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
                  <Upload size={20} className="text-brand-400" />
                </div>
                <div>
                  <h1 className="font-bold text-lg leading-tight">{info.title}</h1>
                  <p className="text-xs [color:var(--text-40)]">{t('request.depositRequest')}</p>
                </div>
              </div>
              {info.message && (
                <p className="[color:var(--text-70)] text-sm [background:var(--surface-700)] rounded-xl px-4 py-3">{info.message}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {info.expiresAt && (
                  <span className="badge-orange flex items-center gap-1">
                    <Clock size={10} /> {t('dash.expires')} {formatDate(info.expiresAt)}
                  </span>
                )}
                {info.maxFiles && (
                  <span className="badge-blue flex items-center gap-1">
                    {t('request.maxFiles', { count: String(info.maxFiles) })}
                  </span>
                )}
                {info.maxSizeBytes && (
                  <span className="badge-blue">{t('request.maxSize', { size: formatBytes(info.maxSizeBytes) })}</span>
                )}
              </div>
            </div>

            {/* Sender info */}
            {(nameReq !== 'hidden' || emailReq !== 'hidden' || msgReq !== 'hidden') && (
              <div className="card space-y-3">
                {/* Titre dynamique */}
                {(() => {
                  const hasRequired = nameReq === 'required' || emailReq === 'required' || msgReq === 'required'
                  const hasOptional = nameReq === 'optional' || emailReq === 'optional' || msgReq === 'optional'
                  const allRequired = [nameReq, emailReq, msgReq].filter(r => r !== 'hidden').every(r => r === 'required')
                  return (
                    <h3 className="text-sm font-semibold [color:var(--text-60)] uppercase tracking-wider">
                      {t('request.uploaderInfo')}
                      {!allRequired && hasOptional && hasRequired && (
                        <span className="ml-2 [color:var(--text-30)] normal-case tracking-normal font-normal text-xs">{t('request.requiredNote')}</span>
                      )}
                    </h3>
                  )
                })()}
                {(nameReq !== 'hidden' || emailReq !== 'hidden') && (
                  <div className={`grid gap-3 ${
                    nameReq !== 'hidden' && emailReq !== 'hidden' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                  }`}>
                    {nameReq !== 'hidden' && (
                      <div>
                        <label htmlFor="uploader-name" className="text-xs [color:var(--text-50)] mb-1.5 flex items-center gap-1">
                          <User size={11} /> {t('request.nameLabel')}
                          {nameReq === 'required' && <span className="text-red-400 ml-0.5">*</span>}
                        </label>
                        <input id="uploader-name" type="text" value={uploaderName} onChange={e => setUploaderName(e.target.value)}
                          placeholder={nameReq === 'required' ? t('request.namePlaceholderReq') : t('request.namePlaceholderOpt')}
                          className="input text-sm py-2.5" required={nameReq === 'required'} />
                      </div>
                    )}
                    {emailReq !== 'hidden' && (
                      <div>
                        <label htmlFor="uploader-email" className="text-xs [color:var(--text-50)] mb-1.5 flex items-center gap-1">
                          <Mail size={11} /> Email
                          {emailReq === 'required' && <span className="text-red-400 ml-0.5">*</span>}
                        </label>
                        <input id="uploader-email" type="email" value={uploaderEmail} onChange={e => setUploaderEmail(e.target.value)}
                          placeholder={emailReq === 'required' ? t('request.emailPlaceholderReq') : t('request.emailPlaceholderOpt')}
                          className="input text-sm py-2.5" required={emailReq === 'required'} />
                      </div>
                    )}
                  </div>
                )}
                {msgReq !== 'hidden' && (
                  <div>
                    <label htmlFor="uploader-message" className="text-xs [color:var(--text-50)] mb-1.5 flex items-center gap-1">
                      <MessageSquare size={11} /> {t('request.messageLabel')}
                      {msgReq === 'required' && <span className="text-red-400 ml-0.5">*</span>}
                      {msgReq === 'optional' && <span className="[color:var(--text-20)] ml-1">{t('request.messageOptional')}</span>}
                    </label>
                    <textarea id="uploader-message" value={message} onChange={e => setMessage(e.target.value)}
                      placeholder={msgReq === 'required' ? t('request.messagePlaceholderReq') : t('request.messagePlaceholderOpt')}
                      rows={2} className="input text-sm py-2.5 resize-none" />
                  </div>
                )}
                {info.hasPassword && (
                  <div>
                    <label htmlFor="uploader-password" className="text-xs [color:var(--text-50)] mb-1.5 block flex items-center gap-1">
                      <Lock size={11} /> {t('request.passwordLabel')}
                    </label>
                    <input id="uploader-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder={t('request.passwordPlaceholder')} className="input text-sm py-2.5" />
                  </div>
                )}
              </div>
            )}
            {/* Mot de passe seul si tous les champs déposant masqués */}
            {nameReq === 'hidden' && emailReq === 'hidden' && msgReq === 'hidden' && info.hasPassword && (
              <div className="card">
                <label htmlFor="uploader-password" className="text-xs [color:var(--text-50)] mb-1.5 block flex items-center gap-1">
                  <Lock size={11} /> {t('request.passwordLabel')}
                </label>
                <input id="uploader-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={t('request.passwordPlaceholder')} className="input text-sm py-2.5" />
              </div>
            )}

            {/* Bannières reprise uploads interrompus */}
            {pendingResumes.length > 0 && status !== 'uploading' && pendingResumes.map(pr => (
              <div key={pr.url} className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-start gap-3">
                <span className="text-lg text-amber-400 mt-0.5">⏸</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-300 truncate">{pr.filename}</p>
                  <p className="text-xs text-white/60 mt-0.5">
                    {t('home.pendingResume', { remaining: formatBytes(pr.remaining), expires: new Date(pr.expiry).toLocaleString() })}
                  </p>
                </div>
                <button onClick={() => { removeTusInfo(pr.url); setPendingResumes(prev => prev.filter(r => r.url !== pr.url)) }} className="text-white/30 hover:text-white/60 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Drop zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300
                ${isDragActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : '[border-color:var(--glass-border)] hover:border-brand-500/50 hover:bg-brand-500/5'}`}
            >
              <input {...getInputProps()} />
              <Upload size={24} className={`mx-auto mb-3 ${isDragActive ? 'text-brand-400' : '[color:var(--text-40)]'}`} />
              <p className="[color:var(--text-70)] font-medium">
                {isDragActive ? t('request.dropActive') : t('request.dropHint')}
              </p>
              <p className="[color:var(--text-30)] text-sm mt-1">{t('request.dropBrowse')}</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="card space-y-2">
                {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 [background:var(--surface-700)] rounded-xl px-3 py-2.5 group">
                    <span className="text-xl">{getFileIcon(f.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs [color:var(--text-40)]">{formatBytes(f.size)}</p>
                    </div>
                    <button
                      onClick={() => removeFile(i)}
                      disabled={status === 'uploading'}
                      aria-label={t('common.delete')}
                      className="focus:opacity-100 text-white/30 hover:text-red-400 transition-all disabled:hidden"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  ))}
              </div>
            )}

            {/* Progress bar */}
            {status === 'uploading' && (
              <div>
                <div className="h-1.5 [background:var(--surface-600)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!files.length || status === 'uploading'}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              {status === 'uploading' ? (
                progressLabel
                  ? <>{progressLabel}</>
                  : t('request.uploading', { pct: String(progress) })
              ) : (
                <>
                  <Upload size={16} />
                  {t('request.submitBtn', { count: String(files.length) })}
                </>
              )}
            </button>
          </>
        )}

        <p className="text-center [color:var(--text-20)] text-xs">
          {t('share.footer', { app: appName })}
        </p>
      </div>
    </div>
  )
}
