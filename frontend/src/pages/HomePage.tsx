import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Copy, Check, Lock, Clock, Download, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { uploadFiles } from '../api/client'
import { formatBytes, getFileIcon } from '../lib/utils'

interface UploadedResult {
  id: string
  originalName: string
  size: string
  shareToken: string
  expiresAt: string | null
}

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([])
  const [password, setPassword] = useState('')
  const [expiresIn, setExpiresIn] = useState('86400') // 24h par défaut
  const [maxDownloads, setMaxDownloads] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<UploadedResult[]>([])
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

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
    setUploading(true)
    setProgress(0)

    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    if (password) formData.append('password', password)
    if (expiresIn) formData.append('expiresIn', expiresIn)
    if (maxDownloads) formData.append('maxDownloads', maxDownloads)

    try {
      const res = await uploadFiles(formData, setProgress)
      setResults(res.data)
      setFiles([])
      toast.success(`${res.data.length} fichier(s) envoyé(s) !`)
    } catch {
      toast.error("Échec de l'envoi, veuillez réessayer.")
    } finally {
      setUploading(false)
    }
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/s/${token}`
    navigator.clipboard.writeText(url)
    setCopiedToken(token)
    toast.success('Lien copié !')
    setTimeout(() => setCopiedToken(null), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-3">
          Partagez vos fichiers
          <span className="block text-brand-400">simplement.</span>
        </h1>
        <p className="text-white/50 text-lg">
          Déposez, configurez et partagez en quelques secondes. Hébergé chez vous.
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
              <p className="text-brand-400 font-semibold text-lg">Relâchez pour ajouter !</p>
            ) : (
              <>
                <p className="text-white/70 font-medium text-lg">
                  Glissez-déposez vos fichiers ici
                </p>
                <p className="text-white/30 text-sm">ou cliquez pour parcourir</p>
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
              <Trash2 size={12} /> Tout supprimer
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
                className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {/* Options */}
          <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Lock size={11} /> Mot de passe (optionnel)
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Aucun"
                className="input text-sm py-2"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Clock size={11} /> Expiration
              </label>
              <select
                value={expiresIn}
                onChange={e => setExpiresIn(e.target.value)}
                className="input text-sm py-2 bg-surface-700"
              >
                <option value="3600">1 heure</option>
                <option value="86400">24 heures</option>
                <option value="604800">7 jours</option>
                <option value="2592000">30 jours</option>
                <option value="">Jamais</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                <Download size={11} /> Téléchargements max (optionnel)
              </label>
              <input
                type="number"
                min="1"
                value={maxDownloads}
                onChange={e => setMaxDownloads(e.target.value)}
                placeholder="Illimité"
                className="input text-sm py-2"
              />
            </div>
          </div>

          {/* Barre de progression */}
          {uploading && (
            <div className="pt-2">
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-white/40 mt-1 text-right">{progress}%</p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Envoi en cours…
              </>
            ) : (
              <>
                <Upload size={16} />
                Envoyer {files.length > 1 ? `${files.length} fichiers` : 'le fichier'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Résultats */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Check size={28} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold mb-1">Fichiers envoyés !</h2>
            <p className="text-white/50 text-sm">Partagez ces liens avec vos destinataires.</p>
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
                {copiedToken === r.shareToken ? 'Copié !' : 'Copier'}
              </button>
            </div>
          ))}

          <button
            onClick={() => { setResults([]); setFiles([]) }}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Envoyer d'autres fichiers
          </button>
        </div>
      )}
    </div>
  )
}
