import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { Upload, ArrowDownUp, AlertTriangle, Clock, Check, Lock, User, Mail, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUploadRequestInfo, submitToUploadRequest, getSettings } from '../api/client'
import { formatBytes, formatDate, getFileIcon } from '../lib/utils'
import { useT } from '../i18n'

type FieldReq = 'hidden' | 'optional' | 'required'

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
  const [uploaderName, setUploaderName] = useState('')
  const [uploaderEmail, setUploaderEmail] = useState('')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [progress, setProgress] = useState(0)
  const [nameReq, setNameReq] = useState<FieldReq>('optional')
  const [emailReq, setEmailReq] = useState<FieldReq>('optional')
  const [msgReq, setMsgReq] = useState<FieldReq>('optional')
  const { t } = useT()

  useEffect(() => {
    // Charger config champs déposant
    getSettings().then(r => {
      setNameReq(r.data.uploaderNameReq || 'optional')
      setEmailReq(r.data.uploaderEmailReq || 'optional')
      setMsgReq(r.data.uploaderMsgReq || 'optional')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!token) return
    getUploadRequestInfo(token)
      .then(r => { setInfo(r.data); setStatus('ready') })
      .catch(err => {
        const code = err.response?.data?.code
        if (code === 'REQUEST_EXPIRED') {
          setError(t('request.expiredDesc'))
          setStatus('expired')
        } else if (code === 'REQUEST_LIMIT_REACHED') {
          setError(t('request.limitReachedDesc'))
          setStatus('expired')
        } else {
          setError(t('request.invalidDesc'))
          setStatus('error')
        }
      })
  }, [token])

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
    setStatus('uploading')
    setProgress(0)

    const formData = new FormData()
    // Les champs texte DOIVENT être ajoutés avant les fichiers pour être lus
    // avant le traitement des fichiers dans le stream multipart backend
    if (uploaderName) formData.append('uploaderName', uploaderName)
    if (uploaderEmail) formData.append('uploaderEmail', uploaderEmail)
    if (message) formData.append('message', message)
    if (password) formData.append('password', password)
    files.forEach(f => formData.append('files', f))

    try {
      await submitToUploadRequest(token, formData, setProgress)
      setStatus('done')
      toast.success(t('toast.filesDeposited'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'WRONG_PASSWORD') toast.error(t('toast.passwordWrong'))
      else if (code === 'REQUEST_LIMIT_REACHED') toast.error(t('request.limitReachedDesc'))
      else if (code === 'FILE_TOO_LARGE') toast.error(t('error.fileTooLarge'))
      else toast.error(t('toast.sendError'))
      setStatus('ready')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{
        background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(92, 107, 250, 0.12), transparent), #0d0e1a'
      }}>
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/30">
          <ArrowDownUp size={16} className="text-white" />
        </div>
        <span className="font-bold text-lg tracking-tight">
          Fil<span className="text-brand-400">yo</span>
        </span>
      </div>

      <div className="w-full max-w-md space-y-5">
        {status === 'loading' && (
          <div className="card text-center py-12">
            <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/50">{t('common.loading')}</p>
          </div>
        )}

        {(status === 'error' || status === 'expired') && (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{status === 'expired' ? t('request.expired') : t('request.invalid')}</h2>
            <p className="text-white/50 text-sm">{error}</p>
          </div>
        )}

        {status === 'done' && (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{t('request.doneTitle')}</h2>
            <p className="text-white/50 text-sm">{t('request.doneMsg')}</p>
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
                  <p className="text-xs text-white/40">{t('request.depositRequest')}</p>
                </div>
              </div>
              {info.message && (
                <p className="text-white/70 text-sm bg-white/5 rounded-xl px-4 py-3">{info.message}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {info.expiresAt && (
                  <span className="badge-orange flex items-center gap-1">
                    <Clock size={10} /> Expire {formatDate(info.expiresAt)}
                  </span>
                )}
                {info.maxFiles && (
                  <span className="badge-blue flex items-center gap-1">
                    {t('request.maxFiles', { count: String(info.maxFiles) })}
                  </span>
                )}
                {info.maxSizeBytes && (
                  <span className="badge-blue">Max {formatBytes(info.maxSizeBytes)} / fichier</span>
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
                    <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
                      {t('request.uploaderInfo')}
                      {!allRequired && hasOptional && hasRequired && (
                        <span className="ml-2 text-white/30 normal-case tracking-normal font-normal text-xs">{t('request.requiredNote')}</span>
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
                        <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1">
                          <User size={11} /> {t('request.nameLabel')}
                          {nameReq === 'required' && <span className="text-red-400 ml-0.5">*</span>}
                        </label>
                        <input type="text" value={uploaderName} onChange={e => setUploaderName(e.target.value)}
                          placeholder={nameReq === 'required' ? t('request.namePlaceholderReq') : t('request.namePlaceholderOpt')}
                          className="input text-sm py-2.5" required={nameReq === 'required'} />
                      </div>
                    )}
                    {emailReq !== 'hidden' && (
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1">
                          <Mail size={11} /> Email
                          {emailReq === 'required' && <span className="text-red-400 ml-0.5">*</span>}
                        </label>
                        <input type="email" value={uploaderEmail} onChange={e => setUploaderEmail(e.target.value)}
                          placeholder={emailReq === 'required' ? t('request.emailPlaceholderReq') : t('request.emailPlaceholderOpt')}
                          className="input text-sm py-2.5" required={emailReq === 'required'} />
                      </div>
                    )}
                  </div>
                )}
                {msgReq !== 'hidden' && (
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1">
                      <MessageSquare size={11} /> {t('request.messageLabel')}
                      {msgReq === 'required' && <span className="text-red-400 ml-0.5">*</span>}
                      {msgReq === 'optional' && <span className="text-white/25 ml-1">{t('request.messageOptional')}</span>}
                    </label>
                    <textarea value={message} onChange={e => setMessage(e.target.value)}
                      placeholder={msgReq === 'required' ? t('request.messagePlaceholderReq') : t('request.messagePlaceholderOpt')}
                      rows={2} className="input text-sm py-2.5 resize-none" />
                  </div>
                )}
                {info.hasPassword && (
                  <div>
                    <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                      <Lock size={11} /> {t('request.passwordLabel')}
                    </label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      placeholder={t('request.passwordPlaceholder')} className="input text-sm py-2.5" />
                  </div>
                )}
              </div>
            )}
            {/* Mot de passe seul si tous les champs déposant masqués */}
            {nameReq === 'hidden' && emailReq === 'hidden' && msgReq === 'hidden' && info.hasPassword && (
              <div className="card">
                <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                  <Lock size={11} /> {t('request.passwordLabel')}
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={t('request.passwordPlaceholder')} className="input text-sm py-2.5" />
              </div>
            )}

            {/* Drop zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300
                ${isDragActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-white/20 hover:border-brand-500/50 hover:bg-brand-500/5'}`}
            >
              <input {...getInputProps()} />
              <Upload size={24} className={`mx-auto mb-3 ${isDragActive ? 'text-brand-400' : 'text-white/40'}`} />
              <p className="text-white/70 font-medium">
                {isDragActive ? t('request.dropActive') : t('request.dropHint')}
              </p>
              <p className="text-white/30 text-sm mt-1">{t('request.dropBrowse')}</p>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="card space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                    <span className="text-xl">{getFileIcon(f.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-white/40">{formatBytes(f.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {status === 'uploading' && (
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!files.length || status === 'uploading'}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {status === 'uploading' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('request.uploading', { pct: String(progress) })}
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

        <p className="text-center text-white/20 text-xs">
          {t('share.footer', { app: 'Filyo' })}
        </p>
      </div>
    </div>
  )
}
