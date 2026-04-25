import { useState, useCallback, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Copy, Check, Lock, Clock, Download, Plus, Trash2, Share2, Mail, Send, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import * as tus from 'tus-js-client'
import { sendShareByEmail, getMyQuota, getTusFileResult } from '../api/client'
import { formatBytes, getFileIcon, copyToClipboard, isValidEmail, formatSpeed } from '../lib/utils'
import { useT } from '../i18n'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'

interface UploadedResult {
  id: string
  originalName: string
  mimeType: string
  size: string
  shareToken: string
  expiresAt: string | null
  batchToken?: string | null
}

export default function HomePage() {
  const { t, lang } = useT()
  const { settings } = useAppSettingsStore()
  const tusExpiryMs = settings.tusExpiryMs ?? 3600000
  const [files, setFiles] = useState<File[]>([])
  const [password, setPassword] = useState('')
  const [expiresIn, setExpiresIn] = useState('86400') // 24h par défaut
  const [maxDownloads, setMaxDownloads] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [results, setResults] = useState<UploadedResult[]>([])
  const [hideFilenames, setHideFilenames] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const uploadExpiresAtRef = useRef<string | null>(null)
  const tusUploadRef = useRef<tus.Upload | null>(null)
  const [pendingResumes, setPendingResumes] = useState<{ url: string; filename: string; remaining: number; expiry: string }[]>([])

  // Bloquer navigation pendant upload en cours
  useEffect(() => {
    if (!uploading) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [uploading])

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
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k?.startsWith('tus::tus::filyo::')) continue
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
    const knownKeys: { url: string; filename: string; totalSize: number; bytesUploaded: number }[] = []
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith('tus-expiry:')) continue
      const url = key.slice('tus-expiry:'.length)
      const expiry = localStorage.getItem(key)
      if (!expiry) continue
      const expiryMs = new Date(expiry).getTime()
      if (expiryMs <= now) {
        localStorage.removeItem(key)
        localStorage.removeItem(`tus-info:${url}`)
        continue
      }
      const infoRaw = localStorage.getItem(`tus-info:${url}`)
      if (!infoRaw) continue
      try {
        const info = JSON.parse(infoRaw)
        seen.add(url)
        setPendingResumes(prev => [...prev, { url, filename: info.filename, remaining: info.totalSize - info.bytesUploaded, expiry }])
        knownKeys.push({ url, filename: info.filename, totalSize: info.totalSize, bytesUploaded: info.bytesUploaded })
      } catch {}
    }
    // HEAD sur les entrées connues : nettoyer si supprimé, mettre à jour l'offset
    knownKeys.forEach(({ url, filename, totalSize }) => {
      fetch(url, { method: 'HEAD', credentials: 'include', headers: { 'Tus-Resumable': '1.0.0' } })
        .then(res => {
          if (!res.ok) {
            removeTusInfo(url)
            setPendingResumes(prev => prev.filter(r => r.url !== url))
            return
          }
          const offset = parseInt(res.headers.get('Upload-Offset') ?? '0', 10)
          if (isNaN(offset)) return
          storeTusInfo(url, { filename, totalSize, bytesUploaded: offset })
          const remaining = totalSize - offset
          setPendingResumes(prev => prev.map(r => r.url === url ? { ...r, remaining } : r))
        })
        .catch(() => {})
    })

    // 2. Fallback : clés tus-js-client (refresh page pendant upload — nos handlers n'ont pas tourné)
    const tusKeys: { url: string; filename: string; totalSize: number; creationTime: number }[] = []
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (!key?.startsWith('tus::tus::filyo::')) continue
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
        const url: string | undefined = stored.uploadUrl
        if (!url || seen.has(url)) continue
        const filename: string = stored.metadata?.filename ?? ''
        const totalSize: number = stored.size ?? 0
        const creationTime: number = stored.creationTime ? new Date(stored.creationTime).getTime() : Date.now()
        seen.add(url)
        tusKeys.push({ url, filename, totalSize, creationTime })
      } catch {}
    }
    // HEAD request : vérifier existence + offset réel. Expiry calculée via creationTime + tusExpiryMs
    tusKeys.forEach(({ url, filename, totalSize, creationTime }) => {
      const expiry = new Date(creationTime + tusExpiryMs).toISOString()
      if (new Date(expiry).getTime() <= Date.now()) { removeTusInfo(url); return }
      fetch(url, { method: 'HEAD', credentials: 'include', headers: { 'Tus-Resumable': '1.0.0' } })
        .then(res => {
          if (!res.ok) { removeTusInfo(url); return }
          const offset = parseInt(res.headers.get('Upload-Offset') ?? '0', 10)
          const bytesUploaded = isNaN(offset) ? 0 : offset
          storeTusExpiry(url, expiry)
          storeTusInfo(url, { filename, totalSize, bytesUploaded })
          const remaining = totalSize - bytesUploaded
          setPendingResumes(prev => prev.some(r => r.url === url) ? prev : [...prev, { url, filename, remaining, expiry }])
        })
        .catch(() => {})
    })
  }, [])

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(prev => [...prev, ...accepted])
    setResults([])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled: uploading
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const totalSize = files.reduce((acc, f) => acc + f.size, 0)

  const handleUpload = async () => {
    if (!files.length) return

    // Validation taille max globale
    if (settings.maxFileSizeBytes) {
      const maxBytes = parseInt(settings.maxFileSizeBytes)
      const tooBig = files.filter(f => f.size > maxBytes)
      if (tooBig.length > 0) {
        toast.error(t('error.fileTooLargeGlobal', { name: tooBig[0].name, max: formatBytes(maxBytes) }))
        return
      }
    }

    // Validation quota utilisateur côté client (évite d'uploader pour rien)
    try {
      const { data: quota } = await getMyQuota()
      if (quota.storageQuotaBytes !== null) {
        const quotaBytes = BigInt(quota.storageQuotaBytes)
        const usedBytes = BigInt(quota.storageUsedBytes)
        const totalUploadBytes = BigInt(totalSize)
        if (usedBytes + totalUploadBytes > quotaBytes) {
          toast.error(t('error.quotaExceeded'))
          return
        }
      }
    } catch {
      // En cas d'échec de l'appel quota, on laisse le serveur trancher
    }

    setUploading(true)
    setProgress(0)
    setProgressLabel('')
    uploadExpiresAtRef.current = null

    // Chemin TUS (resumable) — toujours utilisé désormais
    const sessionBatchToken = files.length > 1
      ? (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 16)
      : null

    try {
      const startTime = Date.now()
      const accumulated: UploadedResult[] = []

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
            setUploading(false)
            reject(new Error('offline'))
          }
          window.addEventListener('offline', handleOffline)

          const tusUpload = new tus.Upload(file, {
            endpoint: '/api/files/tus',
            retryDelays: [0, 1000, 3000, 5000],
            storeFingerprintForResuming: true,
            removeFingerprintOnSuccess: true,
            fingerprint: async (f: File) => `tus::filyo::${f.name}::${f.size}::${f.lastModified}`,
            chunkSize: settings.proxyUploadEnabled ? settings.proxyUploadChunkMb * 1024 * 1024 : Infinity,
            metadata: {
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              expiresIn: expiresIn || '',
              maxDownloads: maxDownloads || '',
              password: password || '',
              hideFilenames: hideFilenames ? 'true' : 'false',
              batchToken: sessionBatchToken || '',
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
            onSuccess: async () => {
              window.removeEventListener('offline', handleOffline)
              const tusUrl = (tusUpload as any).url as string
              removeTusInfo(tusUrl)
              setPendingResumes(prev => prev.filter(r => r.url !== tusUrl))
              const uploadId = tusUrl.split('/').filter(Boolean).pop() ?? ''
              try {
                const res = await getTusFileResult(uploadId)
                accumulated.push(res.data)
              } catch {
                // résultat non trouvé — ignorer
              }
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
              const errUrl = (tusUpload as any).url as string | null
              const remainingBytes = file.size - lastBytesUploaded
              const expiry = uploadExpiresAtRef.current ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()
              if (errUrl) {
                storeTusInfo(errUrl, { filename: file.name, totalSize: file.size, bytesUploaded: lastBytesUploaded })
                storeTusExpiry(errUrl, expiry)
                setPendingResumes(prev => prev.some(r => r.url === errUrl) ? prev : [...prev, { url: errUrl, filename: file.name, remaining: remainingBytes, expiry }])
              } else {
                toast.error(t('toast.uploadFailed'))
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

      setResults(accumulated)
      setFiles([])
      setShowShareModal(true)
      toast.success(t('toast.uploadSuccess', { count: String(accumulated.length) }))
    } catch (err: any) {
      const code = err?.response?.data?.code
      if (code === 'QUOTA_EXCEEDED') toast.error(t('error.quotaExceeded'))
      else if (code === 'FILE_TOO_LARGE') toast.error(t('error.fileTooLarge'))
      // erreur TUS déjà affichée dans onError
    } finally {
      setUploading(false)
      setProgressLabel('')
    }
  }

  const handleSendEmail = async () => {
    const addresses = emailTo.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (addresses.length === 0) return toast.error(t('toast.emailRequired'))
    if (addresses.some(a => !isValidEmail(a))) return toast.error(t('toast.emailInvalid'))
    setEmailSending(true)
    try {
      // Si lot : envoyer un seul token (le backend renvoie tous les fichiers)
      const batchToken = results.length > 1 && results.every(r => r.batchToken && r.batchToken === results[0].batchToken)
        ? results[0].batchToken : null
      const tokens = batchToken ? [results[0].shareToken] : results.map(r => r.shareToken)
      await sendShareByEmail(addresses.join(','), tokens, lang)
      setEmailSent(true)
      if (addresses.length === 1) {
        toast.success(t('toast.linkEmailSent', { email: addresses[0] }))
      } else {
        toast.success(t('toast.requestEmailsSent', { count: String(addresses.length) }))
      }
      setTimeout(() => setEmailSent(false), 3000)
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'SMTP_NOT_CONFIGURED') toast.error(t('toast.smtpNotConfigured'))
      else if (code === 'EMAIL_SEND_FAILED') toast.error(t('toast.emailSendFailed', { detail: err.response?.data?.detail || '' }))
      else toast.error(t('toast.emailSendError'))
    }
    setEmailSending(false)
  }

  const closeModal = () => {
    setShowShareModal(false)
    setResults([])
    setEmailTo('')
    setEmailSent(false)
    setFiles([])
    setPassword('')
    setExpiresIn('86400')
    setMaxDownloads('')
    setHideFilenames(false)
  }

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/s/${token}`
    try {
      await copyToClipboard(url)
      setCopiedToken(token)
      toast.success(t('toast.linkCopied'))
      setTimeout(() => setCopiedToken(null), 2000)
    } catch { toast.error(t('toast.cannotCopy')) }
  }

  const isBatch = results.length > 1 && results.every(r => r.batchToken && r.batchToken === results[0].batchToken)
  const batchShareToken = isBatch ? results[0].shareToken : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {/* Modale de partage post-upload */}
      {showShareModal && results.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="card w-full max-w-md relative animate-fadeIn">
            {/* En-tête */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Share2 size={20} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold">{t('home.modal.title')}</h2>
                <p className="text-xs text-white/40">
                  {isBatch
                    ? t('home.modal.linksBatch', { count: String(results.length) })
                    : results.length === 1 ? t('home.modal.linkSingle') : t('home.modal.linksMultiple', { count: String(results.length) })}

                </p>
              </div>
              <button onClick={closeModal}
                className="text-white/30 hover:text-white/70 transition-colors ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Liste des liens */}
            <div className="space-y-2 mb-5 max-h-72 overflow-y-auto pr-1">
              {isBatch && batchShareToken ? (
                /* Mode lot : un seul lien pour tous les fichiers */
                <>
                  <div className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                    <Share2 size={18} className="text-brand-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t('home.batchLinkLabel')}</p>
                      <p className="text-xs text-white/30 truncate font-mono">
                        {`${window.location.origin}/s/${batchShareToken}`}
                      </p>
                    </div>
                    <button
                      onClick={() => copyLink(batchShareToken)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0
                        ${copiedToken === batchShareToken ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                      {copiedToken === batchShareToken ? <Check size={12} /> : <Copy size={12} />}
                      {copiedToken === batchShareToken ? t('common.copied') : t('common.copy')}
                    </button>
                  </div>
                  <div className="px-1 pt-1 space-y-1">
                    {results.map((r, idx) => (
                      <div key={r.id} className="flex items-center gap-2 text-xs text-white/50">
                        <span>{getFileIcon(r.mimeType)}</span>
                        <span className="truncate">
                          {hideFilenames ? t('share.hiddenFilename', { index: String(idx + 1) }) : r.originalName}
                        </span>
                        <span className="flex-shrink-0 text-white/30">{formatBytes(r.size)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Mode individuel : un lien par fichier */
                results.map(r => {
                  const url = `${window.location.origin}/s/${r.shareToken}`
                  return (
                    <div key={r.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                      <span className="text-xl flex-shrink-0">{getFileIcon(r.mimeType)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.originalName}</p>
                        <p className="text-xs text-white/30 truncate font-mono">{url}</p>
                      </div>
                      <button
                        onClick={() => copyLink(r.shareToken)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0
                          ${copiedToken === r.shareToken ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                        {copiedToken === r.shareToken ? <Check size={12} /> : <Copy size={12} />}
                        {copiedToken === r.shareToken ? t('common.copied') : t('common.copy')}
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {/* Envoi par email */}
            <div className="pt-4 border-t border-white/10 mb-4">
              <label htmlFor="home-modal-email" className="text-xs text-white/50 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
                <Mail size={11} /> {t('home.modal.emailLabel')}
              </label>
              <div className="flex gap-2">
                <input
                  id="home-modal-email"
                  name="email"
                  type="email"
                  value={emailTo}
                  onChange={e => { setEmailTo(e.target.value); setEmailSent(false) }}
                  onKeyDown={e => e.key === 'Enter' && handleSendEmail()}
                  placeholder={t('home.modal.emailPlaceholder')}
                  className="input text-sm py-2 flex-1"
                />
                <button
                  onClick={handleSendEmail}
                  disabled={emailSending || !emailTo.trim()}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40
                    ${ emailSent
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'btn-primary' }`}
                >
                  {emailSending
                    ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : emailSent ? <Check size={14} /> : <Send size={14} />}
                  {emailSent ? t('common.sent') : t('common.send')}
                </button>
              </div>
              <p className="text-xs text-white/40 mt-1.5">{t('home.modal.emailHint')}</p>
            </div>

            {/* Actions */}
            <div className="flex">
              <button
                onClick={closeModal}
                className="btn-primary flex items-center justify-center gap-2 w-full py-2.5">
                <Check size={15} /> {t('home.modal.done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-3">
          {t('home.title')}
          <span className="block text-brand-400">{t('home.titleHighlight')}</span>
        </h1>
        <p className="text-white/50 text-lg">
          {t('home.subtitle')}
        </p>
      </div>

      {/* Bannières reprise uploads interrompus */}
      {!uploading && pendingResumes.map(pr => (
        <div key={pr.url} className="mb-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-start gap-3">
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

      {/* Drop Zone */}
      {!results.length && (
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 mb-6
            ${uploading
              ? 'border-white/10 bg-white/2 opacity-50 cursor-not-allowed'
              : isDragActive
                ? 'border-brand-500 bg-brand-500/10 scale-[1.01] cursor-pointer'
                : 'border-white/20 bg-white/3 hover:border-brand-500/50 hover:bg-brand-500/5 cursor-pointer'
            }`}
          style={{ animation: isDragActive ? 'borderPulse 1s infinite' : undefined }}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all
              ${isDragActive ? 'bg-brand-500/30 scale-110' : 'bg-white/5'}`}>
              <Upload size={28} className={isDragActive ? 'text-brand-400' : 'text-white/40'} />
            </div>
            {isDragActive ? (
              <p className="text-brand-400 font-semibold text-lg">{t('home.dropActive')}</p>
            ) : (
              <>
                <p className="text-white/70 font-medium text-lg">
                  {t('home.dropHint')}
                </p>
                <p className="text-white/30 text-sm">{t('home.dropBrowse')}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Liste des fichiers */}
      {files.length > 0 && (
        <div className="card mb-6 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-white/60">{files.length} fichier(s) — {formatBytes(totalSize)}</span>
            <button onClick={() => setFiles([])} className="text-white/30 hover:text-red-400 transition-colors text-xs flex items-center gap-1">
              <Trash2 size={12} /> {t('home.removeAll')}
            </button>
          </div>
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5 group">
              <span className="text-xl">{getFileIcon(file.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-white/40">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={() => removeFile(i)}
                aria-label={t('common.delete')}
                className="focus:opacity-100 text-white/30 hover:text-red-400 transition-all"
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {/* Options */}
          <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="home-password" className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Lock size={11} /> {t('home.passwordLabel')}
              </label>
              <input
                id="home-password"
                name="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('common.none')}
                className="input text-sm py-2"
              />
            </div>
            <div>
              <label htmlFor="home-expiry" className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Clock size={11} /> {t('home.expiryLabel')}
              </label>
              <select
                id="home-expiry"
                name="expiresIn"
                value={expiresIn}
                onChange={e => setExpiresIn(e.target.value)}
                className="input text-sm py-2 bg-surface-700"
              >
                <option value="3600">{t('time.1h')}</option>
                <option value="86400">{t('time.24h')}</option>
                <option value="604800">{t('time.7d')}</option>
                <option value="2592000">{t('time.30d')}</option>
                <option value="">{t('common.never')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="home-max-downloads" className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Download size={11} /> {t('home.maxDlLabel')}
              </label>
              <input
                id="home-max-downloads"
                name="maxDownloads"
                type="number"
                min="1"
                value={maxDownloads}
                onChange={e => setMaxDownloads(e.target.value)}
                placeholder={t('common.unlimited')}
                className="input text-sm py-2"
              />
            </div>
            <div className="col-span-2">
              <div className="flex items-center gap-3 cursor-pointer group">
                <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0
                  ${hideFilenames ? 'bg-brand-500' : 'bg-white/10'}`}
                  onClick={() => setHideFilenames(v => !v)}>
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                    ${hideFilenames ? 'translate-x-4' : ''}`} />
                </div>
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <EyeOff size={13} className="text-white/50" /> {t('home.hideFilenames')}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">{t('home.hideFilenamesHint')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Barre de progression */}
          {uploading && (
            <div className="pt-2">
              <div className="h-1.5 [background:var(--surface-600)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {uploading ? (
            <div className="flex gap-2 mt-2">
              <button
                disabled
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 opacity-80 cursor-not-allowed"
              >
                {progressLabel
                  ? <>{progressLabel}</>
                  : t('home.uploading', { pct: String(progress) })}
              </button>
            </div>
          ) : (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="btn-primary w-full flex flex-col items-center justify-center gap-1 py-3 mt-2"
            >
              <Upload size={16} />
              {files.length > 1 ? t('home.uploadBtnMultiple', { count: String(files.length) }) : t('home.uploadBtnSingle')}
            </button>
          )}
        </div>
      )}

      {/* Résultats inline (fallback si la modale est fermée sans réinitialiser) */}
      {!showShareModal && results.length > 0 && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-1">{t('home.resultTitle')}</h2>
            <p className="text-white/50 text-sm">{t('home.resultSubtitle')}</p>
          </div>

          {results.map(r => (
            <div key={r.id} className="card flex items-center gap-4">
              <span className="text-2xl">{getFileIcon(r.originalName.split('.').pop() || '')}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{r.originalName}</p>
                <p className="text-xs text-white/40">{formatBytes(r.size)}</p>
              </div>
              <button
                onClick={() => copyLink(r.shareToken)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                  ${copiedToken === r.shareToken
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'btn-secondary'
                  }`}
              >
                {copiedToken === r.shareToken ? <Check size={14} /> : <Copy size={14} />}
                {copiedToken === r.shareToken ? t('common.copied') : t('common.copy')}
              </button>
            </div>
          ))}

          <button
            onClick={() => { setResults([]); setFiles([]) }}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Plus size={16} /> {t('home.modal.newUpload')}
          </button>
        </div>
      )}
    </div>
  )
}
