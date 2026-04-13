import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Copy, Check, Lock, Clock, Download, Plus, Trash2, Share2, Mail, Send, EyeOff, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { uploadFiles, sendShareByEmail, getMyQuota, initFileChunkedUpload, getFileChunkUploadStatus, uploadFileChunk, finalizeFileChunkedUpload } from '../api/client'
import { formatBytes, getFileIcon, copyToClipboard, isValidEmail, formatSpeed } from '../lib/utils'
import { useT } from '../i18n'
import { useAppSettingsStore } from '../stores/useAppSettingsStore'

interface PendingResume {
  key: string
  filename: string
  fileSize: number
  uploadId: string
  receivedChunks: number
  totalChunks: number
}

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
  const [pendingResumes, setPendingResumes] = useState<PendingResume[]>([])
  const [emailTo, setEmailTo] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // Scanner localStorage pour les uploads admin interrompus
  useEffect(() => {
    const prefix = 'filyo-file-'
    const found: Omit<PendingResume, 'receivedChunks' | 'totalChunks'>[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const uploadId = localStorage.getItem(key)
      if (!uploadId) continue
      const rest = key.slice(prefix.length)
      // Format : ${fi}-${file.name}-${file.size}
      const firstDash = rest.indexOf('-')
      if (firstDash === -1) continue
      const restAfterIndex = rest.slice(firstDash + 1)
      const lastDash = restAfterIndex.lastIndexOf('-')
      if (lastDash === -1) continue
      const filename = restAfterIndex.slice(0, lastDash)
      const fileSize = parseInt(restAfterIndex.slice(lastDash + 1))
      if (isNaN(fileSize)) continue
      found.push({ key, filename, fileSize, uploadId })
    }
    if (!found.length) return
    Promise.all(
      found.map(async item => {
        if (item.uploadId === 'pending') {
          return { ...item, receivedChunks: 0, totalChunks: 0 } as PendingResume
        }
        try {
          const res = await getFileChunkUploadStatus(item.uploadId)
          return { ...item, receivedChunks: res.data.receivedChunks, totalChunks: res.data.totalChunks } as PendingResume
        } catch (e: any) {
          if (e?.response?.status === 404) {
            localStorage.removeItem(item.key)
            return null
          }
          return { ...item, receivedChunks: 0, totalChunks: 0 } as PendingResume
        }
      })
    ).then(results => {
      setPendingResumes(results.filter(Boolean) as PendingResume[])
    })
  }, [])

  const handleAbandon = (item: PendingResume) => {
    localStorage.removeItem(item.key)
    setPendingResumes(prev => prev.filter(r => r.key !== item.key))
  }

  const getResumeInfo = (file: { name: string; size: number }) =>
    pendingResumes.find(r => r.filename === file.name && r.fileSize === file.size) ?? null

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(prev => [...prev, ...accepted])
    setResults([])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true
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

    const chunkSizeMb = settings.uploadChunkSizeMb
    const chunkSizeBytes = chunkSizeMb ? chunkSizeMb * 1024 * 1024 : null

    // Chemin chunked si activé et au moins un fichier atteint la taille du chunk
    if (chunkSizeBytes && files.some(f => f.size >= chunkSizeBytes)) {
      // batchToken partagé entre tous les fichiers du lot (null si fichier unique)
      const sessionBatchToken = files.length > 1 ? (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 16) : null

      try {
        const globalStartTime = Date.now()
        let globalUploadedBytes = 0
        const totalBytes = files.reduce((acc, f) => acc + f.size, 0)
        const accumulated: UploadedResult[] = []
        for (let fi = 0; fi < files.length; fi++) {
          const file = files[fi]
          const totalChunks = Math.ceil(file.size / chunkSizeBytes)
          const RESUME_KEY = `filyo-file-${fi}-${file.name}-${file.size}`

          // Placeholder avant init pour survivre à un refresh
          if (!localStorage.getItem(RESUME_KEY)) {
            localStorage.setItem(RESUME_KEY, 'pending')
          }

          let uploadId: string | null = localStorage.getItem(RESUME_KEY)
          let startChunk = 0

          if (uploadId && uploadId !== 'pending') {
            try {
              setProgressLabel(t('request.chunkResuming'))
              const statusRes = await getFileChunkUploadStatus(uploadId)
              startChunk = statusRes.data.receivedChunks
            } catch {
              uploadId = null
              startChunk = 0
            }
          } else {
            uploadId = null
          }

          if (!uploadId) {
            const initRes = await initFileChunkedUpload({
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              totalSize: file.size,
              totalChunks,
              expiresIn: expiresIn || undefined,
              maxDownloads: maxDownloads || undefined,
              password: password || undefined,
              hideFilenames: hideFilenames || undefined,
              batchToken: sessionBatchToken || undefined
            })
            uploadId = initRes.data.uploadId as string
            localStorage.setItem(RESUME_KEY, uploadId)
          }

          if (startChunk > 0) globalUploadedBytes += startChunk * chunkSizeBytes
          for (let ci = startChunk; ci < totalChunks; ci++) {
            const start = ci * chunkSizeBytes
            const chunkBlob = file.slice(start, start + chunkSizeBytes)
            const chunkStart = globalUploadedBytes
            setProgressLabel(t('request.uploadingChunk', { current: String(ci + 1), total: String(totalChunks), pct: '0' }))
            await uploadFileChunk(uploadId, ci, chunkBlob, (pct) => {
              const chunkLoaded = Math.round((chunkBlob.size * pct) / 100)
              const totalLoaded = chunkStart + chunkLoaded
              const elapsed = (Date.now() - globalStartTime) / 1000
              const avgSpeed = elapsed > 0.5 ? totalLoaded / elapsed : 0
              const speedStr = avgSpeed > 0 ? ` · ${formatSpeed(avgSpeed)}` : ''
              setProgressLabel(t('request.uploadingChunk', { current: String(ci + 1), total: String(totalChunks), pct: String(pct) }) + speedStr)
              const filePct = (ci + pct / 100) / totalChunks
              const globalPct = ((fi + filePct) / files.length) * 100
              setProgress(Math.round(globalPct))
            })
            globalUploadedBytes += chunkBlob.size
          }

          setProgressLabel(t('home.finalizing'))
          const finalRes = await finalizeFileChunkedUpload(uploadId)
          localStorage.removeItem(RESUME_KEY)
          setPendingResumes(prev => prev.filter(r => r.key !== RESUME_KEY))
          accumulated.push(finalRes.data)
        }

        setResults(accumulated)
        setFiles([])
        setShowShareModal(true)
        toast.success(t('toast.uploadSuccess', { count: String(accumulated.length) }))
      } catch (err: any) {
        const code = err?.response?.data?.code
        if (code === 'QUOTA_EXCEEDED') toast.error(t('error.quotaExceeded'))
        else if (code === 'FILE_TOO_LARGE') toast.error(t('error.fileTooLarge'))
        else toast.error(t('toast.uploadFailed'))
      } finally {
        setUploading(false)
        setProgressLabel('')
      }
      return
    }

    // Chemin classique (chunked désactivé ou tous les fichiers < seuil)
    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    if (password) formData.append('password', password)
    if (expiresIn) formData.append('expiresIn', expiresIn)
    if (maxDownloads) formData.append('maxDownloads', maxDownloads)
    if (hideFilenames) formData.append('hideFilenames', 'true')

    try {
      const res = await uploadFiles(formData, (pct, speed) => {
        setProgress(pct)
        const speedStr = speed > 0 ? ` · ${formatSpeed(speed)}` : ''
        setProgressLabel(`${pct}%${speedStr}`)
      })
      setResults(res.data)
      setFiles([])
      setShowShareModal(true)
      toast.success(t('toast.uploadSuccess', { count: String(res.data.length) }))
    } catch (err: any) {
      const code = err?.response?.data?.code
      if (code === 'QUOTA_EXCEEDED') toast.error(t('error.quotaExceeded'))
      else if (code === 'FILE_TOO_LARGE') toast.error(t('error.fileTooLarge'))
      else toast.error(t('toast.uploadFailed'))
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

  const closeModal = () => { setShowShareModal(false); setResults([]); setEmailTo(''); setEmailSent(false) }

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
                          {hideFilenames ? `Fichier ${idx + 1}` : r.originalName}
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
            <div className="flex gap-3">
              <button
                onClick={closeModal}
                className="btn-secondary flex items-center justify-center gap-2 flex-1 py-2.5">
                <Plus size={15} /> {t('home.modal.newUpload')}
              </button>
              <button
                onClick={closeModal}
                className="btn-primary flex items-center justify-center gap-2 flex-1 py-2.5">
                <Check size={15} /> {t('home.modal.done')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bandeau uploads admin interrompus */}
      {pendingResumes.length > 0 && !uploading && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3 mb-6">
          <div className="flex items-center gap-2">
            <RotateCcw size={15} className="text-amber-400 shrink-0" />
            <p className="text-sm font-semibold text-amber-300">{t('request.resumeTitle')}</p>
          </div>
          {pendingResumes.map(item => (
            <div key={item.key} className="flex items-center gap-3 [background:var(--surface-700)] rounded-xl px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.filename}</p>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  {item.totalChunks > 0
                    ? t('request.resumeProgress', { done: String(item.receivedChunks), total: String(item.totalChunks) })
                    : t('request.resumePending')}
                </p>
                <p className="text-xs [color:var(--text-30)] mt-0.5">{t('request.resumeHint')}</p>
              </div>
              <button
                onClick={() => handleAbandon(item)}
                className="shrink-0 flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
              >
                <X size={12} /> {t('request.resumeAbandon')}
              </button>
            </div>
          ))}
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

      {/* Drop Zone */}
      {!results.length && (
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 mb-6
            ${isDragActive
              ? 'border-brand-500 bg-brand-500/10 scale-[1.01]'
              : 'border-white/20 bg-white/3 hover:border-brand-500/50 hover:bg-brand-500/5'
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
                {(() => { const r = getResumeInfo(file); return r ? (
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    {t('request.resumeMatched', { done: String(r.receivedChunks), total: String(r.totalChunks) })}
                  </p>
                ) : null })()}
              </div>
              <button
                onClick={() => removeFile(i)}
                className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {/* Options */}
          <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
            <div>
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
            <div className="col-span-2">
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
              {progressLabel && (
                <p className="text-xs text-brand-300/80 mt-1.5 text-center font-medium">{progressLabel}</p>
              )}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary w-full flex flex-col items-center justify-center gap-1 py-3 mt-2"
          >
            {uploading ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('home.uploading', { pct: String(progress) })}
                </div>
              </>
            ) : (
              <>
                <Upload size={16} />
                {files.length > 1 ? t('home.uploadBtnMultiple', { count: String(files.length) }) : t('home.uploadBtnSingle')}
              </>
            )}
          </button>
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
