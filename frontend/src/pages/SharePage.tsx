import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Lock, AlertTriangle, ArrowDownUp, Clock, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { getShareInfo, downloadShare } from '../api/client'
import { formatBytes, formatDate, getFileIcon, downloadBlob } from '../lib/utils'

interface ShareInfo {
  token: string
  filename: string
  mimeType: string
  size: string
  expiresAt: string | null
  hasPassword: boolean
  downloads: number
  maxDownloads: number | null
}

type Status = 'loading' | 'ready' | 'error' | 'expired' | 'downloading' | 'done'

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!token) return
    getShareInfo(token)
      .then(r => {
        setInfo(r.data)
        setStatus(r.data.hasPassword ? 'ready' : 'ready')
        if (r.data.hasPassword) setShowPassword(true)
      })
      .catch(err => {
        const msg = err.response?.data?.error || 'Lien invalide'
        setError(msg)
        setStatus(err.response?.status === 410 ? 'expired' : 'error')
      })
  }, [token])

  const handleDownload = async () => {
    if (!token || !info) return
    setStatus('downloading')
    try {
      const res = await downloadShare(token, password || undefined)
      downloadBlob(res.data, info.filename)
      setStatus('done')
      toast.success('Téléchargement démarré !')
    } catch (err: any) {
      if (err.response?.status === 401) {
        toast.error('Mot de passe incorrect')
        setStatus('ready')
      } else {
        toast.error('Erreur lors du téléchargement')
        setStatus('ready')
      }
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

      <div className="w-full max-w-md">
        {/* Loading */}
        {status === 'loading' && (
          <div className="card text-center py-12">
            <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/50">Chargement…</p>
          </div>
        )}

        {/* Error / Expired */}
        {(status === 'error' || status === 'expired') && (
          <div className="card text-center py-10">
            <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">{status === 'expired' ? 'Lien expiré' : 'Lien invalide'}</h2>
            <p className="text-white/50 text-sm">{error}</p>
          </div>
        )}

        {/* File ready to download */}
        {(status === 'ready' || status === 'downloading' || status === 'done') && info && (
          <div className="card space-y-6">
            {/* File info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-brand-500/20 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                {getFileIcon(info.mimeType)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg leading-tight truncate">{info.filename}</h2>
                <p className="text-white/50 text-sm mt-0.5">{formatBytes(info.size)}</p>
              </div>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3">
              {info.expiresAt && (
                <div className="bg-white/5 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-white/40 flex items-center gap-1 mb-0.5">
                    <Clock size={10} /> Expire le
                  </p>
                  <p className="text-sm font-medium">{formatDate(info.expiresAt)}</p>
                </div>
              )}
              {info.maxDownloads && (
                <div className="bg-white/5 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-white/40 flex items-center gap-1 mb-0.5">
                    <Download size={10} /> Téléchargements
                  </p>
                  <p className="text-sm font-medium">{info.downloads} / {info.maxDownloads}</p>
                </div>
              )}
              {info.hasPassword && (
                <div className="col-span-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5 flex items-center gap-2">
                  <Lock size={14} className="text-orange-400" />
                  <p className="text-sm text-orange-300">Ce fichier est protégé par mot de passe</p>
                </div>
              )}
            </div>

            {/* Password input */}
            {showPassword && (
              <div>
                <label className="text-xs text-white/50 mb-1.5 block flex items-center gap-1">
                  <Shield size={11} /> Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleDownload()}
                  placeholder="Entrez le mot de passe"
                  className="input"
                  autoFocus
                />
              </div>
            )}

            {/* Download button */}
            {status !== 'done' ? (
              <button
                onClick={handleDownload}
                disabled={status === 'downloading'}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {status === 'downloading' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Téléchargement…
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Télécharger
                  </>
                )}
              </button>
            ) : (
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-4 py-3 text-center text-emerald-400 font-medium">
                ✓ Téléchargement démarré
              </div>
            )}
          </div>
        )}

        <p className="text-center text-white/20 text-xs mt-6">
          Partagé via Filyo — Hébergé localement &amp; privé
        </p>
      </div>
    </div>
  )
}
