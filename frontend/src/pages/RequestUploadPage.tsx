import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload, ArrowDownUp, AlertTriangle, Clock, Check, Lock, User, Mail, MessageSquare, RotateCcw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUploadRequestInfo, submitToUploadRequest, getSettings, initChunkedUpload, getChunkUploadStatus, uploadChunk, finalizeChunkedUpload } from '../api/client'
import { formatBytes, formatDate, getFileIcon } from '../lib/utils'
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

interface PendingResume {
  key: string
  filename: string
  fileSize: number
  uploadId: string
  receivedChunks: number
  totalChunks: number
}

type Status = 'loading' | 'ready' | 'uploading' | 'done' | 'error' | 'expired'

export default function RequestUploadPage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<RequestInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploaderName, setUploaderName] = useState('')
  const [uploaderEmail, setUploaderEmail] = useState('')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [pendingResumes, setPendingResumes] = useState<PendingResume[]>([])
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

  // Scanner localStorage pour les uploads interrompus
  useEffect(() => {
    if (status !== 'ready' || !token) return
    const prefix = `filyo-upload-${token}-`
    const found: Omit<PendingResume, 'receivedChunks' | 'totalChunks'>[] = []
    console.debug('[Filyo resume] scan prefix:', prefix, '— localStorage keys:', localStorage.length)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      console.debug('[Filyo resume] key:', key)
      if (!key?.startsWith(prefix)) continue
      const uploadId = localStorage.getItem(key)
      if (!uploadId) continue
      const rest = key.slice(prefix.length)
      const lastDash = rest.lastIndexOf('-')
      if (lastDash === -1) continue
      const filename = rest.slice(0, lastDash)
      const fileSize = parseInt(rest.slice(lastDash + 1))
      if (isNaN(fileSize)) continue
      console.debug('[Filyo resume] found pending:', { key, filename, fileSize, uploadId })
      found.push({ key, filename, fileSize, uploadId })
    }
    if (!found.length) { console.debug('[Filyo resume] nothing found in localStorage'); return }
    Promise.all(
      found.map(async item => {
        // Placeholder "pending" = init démarré mais pas encore terminé (ou serveur relancé)
        if (item.uploadId === 'pending') {
          console.debug('[Filyo resume] pending placeholder found (init never completed):', item.key)
          return { ...item, receivedChunks: 0, totalChunks: 0 } as PendingResume
        }
        try {
          const res = await getChunkUploadStatus(token, item.uploadId)
          console.debug('[Filyo resume] status OK:', res.data)
          return { ...item, receivedChunks: res.data.receivedChunks, totalChunks: res.data.totalChunks } as PendingResume
        } catch (e: any) {
          // Supprimer la clé UNIQUEMENT si le serveur confirme que l'upload n'existe plus (404)
          // Pour les erreurs réseau ou erreurs serveur transitoires, conserver la clé et afficher le bandeau
          if (e?.response?.status === 404) {
            console.debug('[Filyo resume] upload not found (404), removing key:', item.key)
            localStorage.removeItem(item.key)
            return null
          }
          console.debug('[Filyo resume] transient error, keeping key:', item.key, e?.message)
          return { ...item, receivedChunks: 0, totalChunks: 0 } as PendingResume
        }
      })
    ).then(results => {
      console.debug('[Filyo resume] pendingResumes set:', results)
      setPendingResumes(results.filter(Boolean) as PendingResume[])
    })
  }, [status, token])

  // Bloquer navigation pendant upload en cours
  useEffect(() => {
    if (status !== 'uploading') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  const handleAbandon = (item: PendingResume) => {
    localStorage.removeItem(item.key)
    setPendingResumes(prev => prev.filter(r => r.key !== item.key))
  }

  const getResumeInfo = (file: { name: string; size: number }) =>
    pendingResumes.find(r => r.filename === file.name && r.fileSize === file.size) ?? null

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(prev => {
      const merged = [...prev, ...accepted]
      if (info?.maxFiles) return merged.slice(0, info.maxFiles)
      return merged
    })
  }, [info])

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

    const chunkSizeMb = settings.uploadChunkSizeMb
    const chunkSizeBytes = chunkSizeMb ? chunkSizeMb * 1024 * 1024 : null

    console.debug('[Filyo chunk] chunkSizeMb:', chunkSizeMb, 'chunkSizeBytes:', chunkSizeBytes)
    console.debug('[Filyo chunk] files:', files.map(f => ({ name: f.name, size: f.size })))
    console.debug('[Filyo chunk] will use chunked path:', !!(chunkSizeBytes && files.some(f => f.size >= chunkSizeBytes)))

    // Upload chunked si activé et AU MOINS un fichier atteint ou dépasse la taille d'un chunk
    if (chunkSizeBytes && files.some(f => f.size >= chunkSizeBytes)) {
      try {
        for (let fi = 0; fi < files.length; fi++) {
          const file = files[fi]
          const totalChunks = Math.ceil(file.size / chunkSizeBytes)
          const RESUME_KEY = `filyo-upload-${token}-${file.name}-${file.size}`

          // Écrire un placeholder avant l'init pour survivre à un refresh pendant l'appel réseau
          if (!localStorage.getItem(RESUME_KEY)) {
            localStorage.setItem(RESUME_KEY, 'pending')
            console.debug('[Filyo chunk] localStorage placeholder set:', RESUME_KEY)
          }

          // Vérifier si un upload est en cours pour ce fichier
          let uploadId: string | null = localStorage.getItem(RESUME_KEY)
          let startChunk = 0

          if (uploadId && uploadId !== 'pending') {
            try {
              setProgressLabel(t('request.chunkResuming'))
              const statusRes = await getChunkUploadStatus(token, uploadId)
              startChunk = statusRes.data.receivedChunks
              console.debug('[Filyo chunk] resuming from chunk', startChunk, '/', totalChunks)
            } catch {
              // Upload introuvable — recommencer
              uploadId = null
              startChunk = 0
            }
          } else {
            uploadId = null  // "pending" ou null : init requis
          }

          if (!uploadId) {
            const initRes = await initChunkedUpload(
              token,
              { filename: file.name, mimeType: file.type || 'application/octet-stream', totalSize: file.size, totalChunks,
                uploaderName: uploaderName || undefined, uploaderEmail: uploaderEmail || undefined,
                message: message || undefined, password: password || undefined }
            )
            uploadId = initRes.data.uploadId as string
            localStorage.setItem(RESUME_KEY, uploadId)
            console.debug('[Filyo chunk] init OK, uploadId:', uploadId, '— localStorage updated')
          }

          for (let ci = startChunk; ci < totalChunks; ci++) {
            const start = ci * chunkSizeBytes
            const chunk = file.slice(start, start + chunkSizeBytes)
            setProgressLabel(t('request.uploadingChunk', { current: String(ci + 1), total: String(totalChunks), pct: '0' }))
            await uploadChunk(token, uploadId, ci, chunk, pct => {
              setProgressLabel(t('request.uploadingChunk', { current: String(ci + 1), total: String(totalChunks), pct: String(pct) }))
              // Progression globale inter-fichiers
              const filePct = (ci + pct / 100) / totalChunks
              const globalPct = ((fi + filePct) / files.length) * 100
              setProgress(Math.round(globalPct))
            })
          }

          setProgressLabel(t('home.finalizing'))
          await finalizeChunkedUpload(token, uploadId)
          localStorage.removeItem(RESUME_KEY)
          setPendingResumes(prev => prev.filter(r => r.key !== RESUME_KEY))
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
        else toast.error(t('toast.sendError'))
        setStatus('ready')
      }
      return
    }

    // Upload classique (pas chunked ou tous les fichiers plus petits qu'un chunk)
    const formData = new FormData()
    if (uploaderName) formData.append('uploaderName', uploaderName)
    if (uploaderEmail) formData.append('uploaderEmail', uploaderEmail)
    if (message) formData.append('message', message)
    files.forEach(f => formData.append('files', f))

    try {
      await submitToUploadRequest(token, formData, setProgress, password || undefined)
      setStatus('done')
      toast.success(t('toast.filesDeposited'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'WRONG_PASSWORD') toast.error(t('toast.passwordWrong'))
      else if (code === 'REQUEST_LIMIT_REACHED') toast.error(t('request.limitReachedDesc'))
      else if (code === 'FILE_TOO_LARGE') toast.error(t('error.fileTooLarge'))
      else if (code === 'QUOTA_EXCEEDED') toast.error(t('error.quotaExceeded'))
      else if (err.response?.status === 429) toast.error(t('toast.tooManyRequests'))
      else toast.error(t('toast.sendError'))
      setStatus('ready')
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
            {/* Bandeau uploads interrompus */}
            {pendingResumes.length > 0 && status !== 'uploading' && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
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
                {files.map((f, i) => {
                    const resume = getResumeInfo(f)
                    return (
                    <div key={i} className="flex items-center gap-3 [background:var(--surface-700)] rounded-xl px-3 py-2.5">
                    <span className="text-xl">{getFileIcon(f.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs [color:var(--text-40)]">{formatBytes(f.size)}</p>
                      {resume && (
                        <p className="text-xs text-amber-400/80 mt-0.5">
                          {t('request.resumeMatched', { done: String(resume.receivedChunks), total: String(resume.totalChunks) })}
                        </p>
                      )}
                    </div>
                  </div>
                    )
                  })}
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
                {progressLabel && (
                  <p className="text-xs text-brand-300/80 mt-1.5 text-center font-medium">{progressLabel}</p>
                )}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!files.length || status === 'uploading'}
              className="btn-primary w-full flex flex-col items-center justify-center gap-1 py-3"
            >
              {status === 'uploading' ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('request.uploading', { pct: String(progress) })}
                  </div>
                </>
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
