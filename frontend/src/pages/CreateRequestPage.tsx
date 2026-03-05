import { useState } from 'react'
import { Copy, Check, Plus, ArrowDownUp, Clock, FileUp, Lock, Hash } from 'lucide-react'
import toast from 'react-hot-toast'
import { createUploadRequest } from '../api/client'
import { copyToClipboard } from '../lib/utils'
import { useT } from '../i18n'

interface CreatedRequest {
  id: string
  token: string
  title: string
  expiresAt: string | null
}

export default function CreateRequestPage() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [expiresIn, setExpiresIn] = useState('604800')
  const [maxFiles, setMaxFiles] = useState('')
  const [maxSizeMb, setMaxSizeMb] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CreatedRequest | null>(null)
  const [copied, setCopied] = useState(false)
  const { t } = useT()

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error(t('create.titleRequired'))
      return
    }
    setLoading(true)
    try {
      const res = await createUploadRequest({
        title,
        message: message || undefined,
        password: password || undefined,
        expiresIn: expiresIn || undefined,
        maxFiles: maxFiles || undefined,
        maxSizeMb: maxSizeMb || undefined
      })
      setResult(res.data)
      toast.success(t('toast.depositLinkCreated'))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const link = result ? `${window.location.origin}/r/${result.token}` : ''

  const copyLink = async () => {
    try {
      await copyToClipboard(link)
      setCopied(true)
      toast.success(t('toast.linkCopied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('toast.cannotCopy'))
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ArrowDownUp size={28} className="text-brand-400" />
        </div>
        <h1 className="text-3xl font-bold mb-2">{t('create.title')}</h1>
        <p className="text-white/50">
          {t('create.subtitle')}
        </p>
      </div>

      {!result ? (
        <div className="card space-y-5">
          {/* Title */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
              {t('create.titleLabel')}
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('create.titlePlaceholder')}
              className="input"
              autoFocus
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
              {t('create.messageLabel')}
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('create.messagePlaceholder')}
              rows={3}
              className="input resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Expiry */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Clock size={11} /> {t('create.expiryLabel')}
              </label>
              <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                className="input bg-surface-700">
                <option value="3600">{t('time.1h')}</option>
                <option value="86400">{t('time.24h')}</option>
                <option value="604800">{t('time.7d')}</option>
                <option value="2592000">{t('time.30d')}</option>
                <option value="">{t('common.never')}</option>
              </select>
            </div>

            {/* Max files */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Hash size={11} /> {t('create.maxFilesLabel')}
              </label>
              <input type="number" min="1" value={maxFiles}
                onChange={e => setMaxFiles(e.target.value)}
                placeholder={t('create.maxFilesPlaceholder')} className="input" />
            </div>

            {/* Max size */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <FileUp size={11} /> {t('create.maxSizeLabel')}
              </label>
              <input type="number" min="1" value={maxSizeMb}
                onChange={e => setMaxSizeMb(e.target.value)}
                placeholder={t('create.maxSizePlaceholder')} className="input" />
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Lock size={11} /> {t('create.passwordLabel')}
              </label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('create.passwordPlaceholder')} className="input" />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('create.creating')}
              </>
            ) : (
              <>
                <Plus size={16} />
                {t('create.createBtn')}
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Success */}
          <div className="card text-center py-6">
            <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-1">{t('create.successTitle')}</h2>
            <p className="text-white/50 text-sm">{t('create.successMsg')}</p>
          </div>

          {/* Link */}
          <div className="card">
            <p className="text-xs text-white/50 mb-2 font-medium uppercase tracking-wider">{t('create.linkLabel')}</p>
            <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
              <p className="flex-1 text-sm text-brand-300 truncate font-mono">{link}</p>
              <button onClick={copyLink}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? t('common.copied') : t('common.copy')}
              </button>
            </div>
          </div>

          <button onClick={() => { setResult(null); setTitle(''); setMessage('') }}
            className="btn-secondary w-full flex items-center justify-center gap-2">
            <Plus size={16} /> {t('create.anotherLink')}
          </button>
        </div>
      )}
    </div>
  )
}
