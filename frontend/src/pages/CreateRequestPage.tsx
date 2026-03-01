import { useState } from 'react'
import { Copy, Check, Plus, ArrowDownUp, Clock, FileUp, Lock, Hash } from 'lucide-react'
import toast from 'react-hot-toast'
import { createUploadRequest } from '../api/client'
import { copyToClipboard } from '../lib/utils'

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

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Veuillez donner un titre à votre demande')
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
      toast.success('Lien de dépôt créé !')
    } catch {
      toast.error('Erreur lors de la création')
    } finally {
      setLoading(false)
    }
  }

  const link = result ? `${window.location.origin}/r/${result.token}` : ''

  const copyLink = async () => {
    try {
      await copyToClipboard(link)
      setCopied(true)
      toast.success('Lien copié !')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier le lien')
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ArrowDownUp size={28} className="text-brand-400" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Partage inversé</h1>
        <p className="text-white/50">
          Créez un lien à partager avec quelqu'un pour qu'il vous dépose des fichiers.
        </p>
      </div>

      {!result ? (
        <div className="card space-y-5">
          {/* Title */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
              Titre de la demande *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Photos de vacances, Documents RH…"
              className="input"
              autoFocus
            />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block font-medium uppercase tracking-wider">
              Message pour le déposant (optionnel)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Expliquez ce que vous souhaitez recevoir…"
              rows={3}
              className="input resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Expiry */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Clock size={11} /> Expiration du lien
              </label>
              <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                className="input bg-surface-700">
                <option value="3600">1 heure</option>
                <option value="86400">24 heures</option>
                <option value="604800">7 jours</option>
                <option value="2592000">30 jours</option>
                <option value="">Jamais</option>
              </select>
            </div>

            {/* Max files */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Hash size={11} /> Nb max de fichiers
              </label>
              <input type="number" min="1" value={maxFiles}
                onChange={e => setMaxFiles(e.target.value)}
                placeholder="Illimité" className="input" />
            </div>

            {/* Max size */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <FileUp size={11} /> Taille max / fichier (MB)
              </label>
              <input type="number" min="1" value={maxSizeMb}
                onChange={e => setMaxSizeMb(e.target.value)}
                placeholder="Illimitée" className="input" />
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Lock size={11} /> Mot de passe (optionnel)
              </label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Aucun" className="input" />
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
                Création…
              </>
            ) : (
              <>
                <Plus size={16} />
                Créer le lien de dépôt
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
            <h2 className="text-xl font-bold mb-1">Lien créé !</h2>
            <p className="text-white/50 text-sm">Partagez ce lien pour recevoir des fichiers.</p>
          </div>

          {/* Link */}
          <div className="card">
            <p className="text-xs text-white/50 mb-2 font-medium uppercase tracking-wider">Votre lien de dépôt</p>
            <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
              <p className="flex-1 text-sm text-brand-300 truncate font-mono">{link}</p>
              <button onClick={copyLink}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
          </div>

          <button onClick={() => { setResult(null); setTitle(''); setMessage('') }}
            className="btn-secondary w-full flex items-center justify-center gap-2">
            <Plus size={16} /> Créer un autre lien
          </button>
        </div>
      )}
    </div>
  )
}
