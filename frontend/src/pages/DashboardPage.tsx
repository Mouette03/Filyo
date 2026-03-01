import { useEffect, useState } from 'react'
import { Trash2, Download, RefreshCw, Copy, Check, Eye, ToggleLeft, ToggleRight, HardDrive, Clock, Mail, Send, ExternalLink, User, TimerOff, AlertTriangle, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/useAuthStore'
import {
  listFiles, deleteFile, listUploadRequests,
  deleteUploadRequest, toggleUploadRequest, getStats,
  runCleanup, getReceivedFiles, downloadReceivedFile,
  sendShareByEmail, updateFileExpiry
} from '../api/client'
import { formatBytes, formatDate, getFileIcon, downloadBlob, copyToClipboard } from '../lib/utils'

interface FileItem {
  id: string; originalName: string; mimeType: string; size: string
  uploadedAt: string; expiresAt: string | null; downloads: number; maxDownloads: number | null
  shares: { token: string; downloads: number; maxDownloads: number | null }[]
}
interface UploadRequest {
  id: string; token: string; title: string; message: string | null
  createdAt: string; expiresAt: string | null; active: boolean
  filesCount: number
}
interface ReceivedFile {
  id: string; originalName: string; size: string; uploadedAt: string
  uploaderName: string | null; uploaderEmail: string | null; message: string | null
}
interface DiskInfo { total: string; used: string; free: string; totalBytes: number; usedBytes: number; freeBytes: number }
interface Stats {
  filesCount: number; sharesCount: number; uploadRequestsCount: number
  receivedFilesCount: number; totalSize: string; totalReceivedSize: string
  disk?: DiskInfo
}

type Tab = 'sent' | 'requests'

export default function DashboardPage() {
  const isAdmin = useAuthStore(s => s.isAdmin())
  const [tab, setTab] = useState<Tab>('sent')
  const [files, setFiles] = useState<FileItem[]>([])
  const [requests, setRequests] = useState<UploadRequest[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null)
  const [receivedFiles, setReceivedFiles] = useState<Record<string, ReceivedFile[]>>({})
  const [emailingFileId, setEmailingFileId] = useState<string | null>(null)
  const [emailToFile, setEmailToFile] = useState('')
  const [emailSendingToken, setEmailSendingToken] = useState<string | null>(null)
  const [expiryEditId, setExpiryEditId] = useState<string | null>(null)
  const [expiryValue, setExpiryValue] = useState('')
  const [savingExpiryId, setSavingExpiryId] = useState<string | null>(null)
  const [expiringNowId, setExpiringNowId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [filesRes, reqRes, statsRes] = await Promise.all([
        listFiles(), listUploadRequests(), ...(isAdmin ? [getStats()] : [Promise.resolve(null)])
      ])
      setFiles(filesRes.data)
      setRequests(reqRes.data)
      if (statsRes) setStats((statsRes as any).data)
    } catch { toast.error('Erreur de chargement') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDeleteFile = async (id: string) => {
    try {
      await deleteFile(id)
      setFiles(prev => prev.filter(f => f.id !== id))
      toast.success('Fichier supprimé')
    } catch { toast.error('Erreur lors de la suppression') }
  }

  const handleDeleteRequest = async (id: string) => {
    try {
      await deleteUploadRequest(id)
      setRequests(prev => prev.filter(r => r.id !== id))
      toast.success('Demande supprimée')
    } catch { toast.error('Erreur lors de la suppression') }
  }

  const handleToggleRequest = async (id: string) => {
    try {
      const res = await toggleUploadRequest(id)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, active: res.data.active } : r))
    } catch { toast.error('Erreur') }
  }

  const copyShareLink = async (token: string) => {
    try {
      await copyToClipboard(`${window.location.origin}/s/${token}`)
      setCopiedToken(token)
      toast.success('Lien copié !')
      setTimeout(() => setCopiedToken(null), 2000)
    } catch { toast.error('Impossible de copier le lien') }
  }

  const copyRequestLink = async (token: string) => {
    try {
      await copyToClipboard(`${window.location.origin}/r/${token}`)
      setCopiedToken(token)
      toast.success('Lien copié !')
      setTimeout(() => setCopiedToken(null), 2000)
    } catch { toast.error('Impossible de copier le lien') }
  }

  const toggleExpandRequest = async (id: string) => {
    if (expandedRequest === id) { setExpandedRequest(null); return }
    setExpandedRequest(id)
    if (!receivedFiles[id]) {
      try {
        const res = await getReceivedFiles(id)
        setReceivedFiles(prev => ({ ...prev, [id]: res.data }))
      } catch { toast.error('Impossible de charger les fichiers reçus') }
    }
  }

  const handleDownloadReceived = async (requestId: string, fileId: string, filename: string) => {
    try {
      const res = await downloadReceivedFile(requestId, fileId)
      downloadBlob(res.data, filename)
    } catch { toast.error('Erreur de téléchargement') }
  }

  const handleSendFileEmail = async (token: string) => {
    if (!emailToFile.trim()) return toast.error('Entrez une adresse email')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToFile)) return toast.error('Adresse email invalide')
    setEmailSendingToken(token)
    try {
      await sendShareByEmail(emailToFile.trim(), [token])
      toast.success(`Lien envoyé à ${emailToFile}`)
      setEmailingFileId(null)
      setEmailToFile('')
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Erreur lors de l'envoi")
    }
    setEmailSendingToken(null)
  }

  const handleExpireNow = async (fileId: string) => {
    setExpiringNowId(fileId)
    try {
      const expiresAt = new Date().toISOString()
      await updateFileExpiry(fileId, expiresAt)
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, expiresAt } : f))
      toast.success('Fichier expiré immédiatement')
    } catch { toast.error('Erreur lors de l\'expiration') }
    setExpiringNowId(null)
  }

  const handleSaveExpiry = async (fileId: string, clear = false) => {
    setSavingExpiryId(fileId)
    try {
      const expiresAt = (!clear && expiryValue) ? new Date(expiryValue).toISOString() : null
      await updateFileExpiry(fileId, expiresAt)
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, expiresAt } : f))
      setExpiryEditId(null)
      toast.success(expiresAt ? 'Expiration mise à jour' : 'Expiration supprimée')
    } catch { toast.error('Erreur lors de la mise à jour') }
    setSavingExpiryId(null)
  }

  const handleCleanup = async () => {
    try {
      const res = await runCleanup()
      toast.success(`Nettoyage : ${res.data.deletedFiles} fichier(s) supprimé(s)`)
      load()
    } catch { toast.error('Erreur lors du nettoyage') }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={handleCleanup} className="btn-secondary flex items-center gap-2 text-sm">
              <Trash2 size={14} /> Nettoyer expirés
            </button>
          )}
          <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { label: 'Fichiers envoyés', value: stats.filesCount },
              { label: 'Partages actifs', value: stats.sharesCount },
              { label: 'Demandes de dépôt', value: stats.uploadRequestsCount },
              { label: 'Fichiers reçus', value: stats.receivedFilesCount },
              { label: 'Volume envoyé', value: formatBytes(stats.totalSize) },
              { label: 'Volume reçu', value: formatBytes(stats.totalReceivedSize) }
            ].map(s => (
              <div key={s.label} className="card py-4 text-center">
                <p className="text-2xl font-bold text-brand-400">{s.value}</p>
                <p className="text-xs text-white/40 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Espace disque */}
          {stats.disk && (() => {
            const totalBytes = stats.disk.totalBytes || 1
            const usedBytes = stats.disk.usedBytes
            const pct = Math.round((usedBytes / totalBytes) * 100)
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500'
            return (
              <div className="card mb-8">
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className="w-10 h-10 bg-brand-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <HardDrive size={18} className="text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-sm font-medium flex-shrink-0">Espace disque</p>
                      <p className="text-xs text-white/40 truncate text-right hidden sm:block">
                        {stats.disk.used} / {stats.disk.total} utilisés
                        &nbsp;·&nbsp;
                        <span className="text-brand-300">{stats.disk.free} libres</span>
                      </p>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    {/* Infos mobile sous la barre */}
                    <p className="text-xs text-white/40 mt-1.5 sm:hidden">
                      {stats.disk.used} / {stats.disk.total}
                      &nbsp;·&nbsp;
                      <span className="text-brand-300">{stats.disk.free} libres</span>
                    </p>
                  </div>
                  <span className={`text-2xl font-bold flex-shrink-0 tabular-nums ${
                    pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-brand-400'
                  }`}>{pct}%</span>
                </div>
              </div>
            )
          })()}
          {!stats.disk && <div className="mb-8" />}
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6 w-fit">
        <button onClick={() => setTab('sent')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all
            ${tab === 'sent' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>
          Fichiers envoyés ({files.length})
        </button>
        <button onClick={() => setTab('requests')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all
            ${tab === 'requests' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>
          Partages inversés ({requests.length})
        </button>
      </div>

      {loading && (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/40">Chargement…</p>
        </div>
      )}

      {/* Sent files */}
      {!loading && tab === 'sent' && (
        <div className="space-y-3">
          {files.length === 0 && (
            <div className="card text-center py-12 text-white/40">Aucun fichier envoyé pour l'instant.</div>
          )}
          {files.map(f => {
            const share = f.shares[0]
            return (
              <div key={f.id} className="card overflow-hidden">
                {/* Ligne principale */}
                <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                  <span className="text-2xl flex-shrink-0 mt-0.5 sm:mt-0">{getFileIcon(f.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <p className="font-medium truncate">{f.originalName}</p>
                      {f.maxDownloads !== null && f.downloads >= f.maxDownloads && (
                        <span className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={10} /> Limite atteinte
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">
                      {formatBytes(f.size)} · {formatDate(f.uploadedAt)} ·{' '}
                      {f.maxDownloads !== null
                        ? <span className={f.downloads >= f.maxDownloads ? 'text-red-400' : ''}>{f.downloads}/{f.maxDownloads} téléchargement(s)</span>
                        : <>{f.downloads} téléchargement(s)</>}
                      {f.expiresAt
                        ? new Date(f.expiresAt) <= new Date()
                          ? <span className="text-red-400"> · Expiré</span>
                          : ` · Expire ${formatDate(f.expiresAt)}`
                        : ' · Sans expiration'}
                    </p>
                  </div>
                  {/* Boutons desktop */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    {share && (
                      <>
                        <button
                          onClick={() => window.open(`${window.location.origin}/s/${share.token}`, '_blank')}
                          className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8 flex-shrink-0"
                          title="Voir la page de partage">
                          <ExternalLink size={12} /> Voir
                        </button>
                        <button
                          onClick={() => copyShareLink(share.token)}
                          className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-shrink-0
                            ${copiedToken === share.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                          {copiedToken === share.token ? <Check size={12} /> : <Copy size={12} />}
                          Copier
                        </button>
                        <button
                          onClick={() => { setEmailingFileId(emailingFileId === f.id ? null : f.id); setEmailToFile('') }}
                          className={`btn-icon ${emailingFileId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                          title="Envoyer par email">
                          <Mail size={13} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setExpiryEditId(expiryEditId === f.id ? null : f.id)
                        setExpiryValue(f.expiresAt ? f.expiresAt.substring(0, 10) : '')
                      }}
                      className={`btn-icon ${expiryEditId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                      title="Modifier l'expiration">
                      <Clock size={13} />
                    </button>
                    <button
                      onClick={() => handleExpireNow(f.id)}
                      disabled={expiringNowId === f.id}
                      className="btn-icon"
                      title="Faire expirer maintenant">
                      {expiringNowId === f.id
                        ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                        : <TimerOff size={13} />}
                    </button>
                    <button onClick={() => handleDeleteFile(f.id)} className="btn-icon-danger" title="Supprimer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Barre de boutons mobile */}
                <div className="flex sm:hidden items-center gap-1.5 mt-3 pt-3 border-t border-white/5 overflow-x-auto">
                  {share && (
                    <>
                      <button
                        onClick={() => window.open(`${window.location.origin}/s/${share.token}`, '_blank')}
                        className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8 flex-shrink-0">
                        <ExternalLink size={12} /> Voir
                      </button>
                      <button
                        onClick={() => copyShareLink(share.token)}
                        className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-shrink-0
                          ${copiedToken === share.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                        {copiedToken === share.token ? <Check size={12} /> : <Copy size={12} />}
                        Copier
                      </button>
                      <button
                        onClick={() => { setEmailingFileId(emailingFileId === f.id ? null : f.id); setEmailToFile('') }}
                        className={`btn-icon flex-shrink-0 ${emailingFileId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                        <Mail size={13} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setExpiryEditId(expiryEditId === f.id ? null : f.id)
                      setExpiryValue(f.expiresAt ? f.expiresAt.substring(0, 10) : '')
                    }}
                    className={`btn-icon flex-shrink-0 ${expiryEditId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                    <Clock size={13} />
                  </button>
                  <button
                    onClick={() => handleExpireNow(f.id)}
                    disabled={expiringNowId === f.id}
                    className="btn-icon flex-shrink-0">
                    {expiringNowId === f.id
                      ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                      : <TimerOff size={13} />}
                  </button>
                  <button onClick={() => handleDeleteFile(f.id)} className="btn-icon-danger flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Inline : envoyer par email */}
                {emailingFileId === f.id && share && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex gap-2 items-center">
                    <Mail size={13} className="text-white/30 flex-shrink-0" />
                    <input
                      type="email"
                      value={emailToFile}
                      onChange={e => setEmailToFile(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendFileEmail(share.token)}
                      placeholder="destinataire@exemple.fr"
                      className="input text-sm py-1.5 flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSendFileEmail(share.token)}
                      disabled={emailSendingToken === share.token || !emailToFile.trim()}
                      className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                      {emailSendingToken === share.token
                        ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Send size={12} />}
                      Envoyer
                    </button>
                    <button onClick={() => setEmailingFileId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                  </div>
                )}

                {/* Inline : modifier expiration */}
                {expiryEditId === f.id && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
                    <Clock size={13} className="text-white/30 flex-shrink-0" />
                    <input
                      type="date"
                      value={expiryValue}
                      onChange={e => setExpiryValue(e.target.value)}
                      min={new Date().toISOString().substring(0, 10)}
                      className="input text-sm py-1.5 flex-1 min-w-36"
                    />
                    <button
                      onClick={() => handleSaveExpiry(f.id)}
                      disabled={savingExpiryId === f.id || !expiryValue}
                      className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                      {savingExpiryId === f.id
                        ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Check size={12} />}
                      Enregistrer
                    </button>
                    <button
                      onClick={() => handleSaveExpiry(f.id, true)}
                      disabled={savingExpiryId === f.id}
                      className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">
                      Sans expiration
                    </button>
                    <button onClick={() => setExpiryEditId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload requests (partage inversé) */}
      {!loading && tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 && (
            <div className="card text-center py-12 text-white/40">Aucune demande de dépôt créée.</div>
          )}
          {requests.map(r => (
            <div key={r.id} className="card space-y-0 overflow-hidden">
              {/* Ligne principale */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                  ${r.active ? 'bg-brand-500/20' : 'bg-white/5'}`}>
                  <Download size={18} className={r.active ? 'text-brand-400' : 'text-white/30'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate text-sm">{r.title}</p>
                    <span className={`flex-shrink-0 ${r.active ? 'badge-green' : 'badge-red'}`}>
                      {r.active ? 'Actif' : 'Désactivé'}
                    </span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5 truncate">
                    {r.filesCount} fichier(s) · {formatDate(r.createdAt)}
                    {r.expiresAt && ` · Expire ${formatDate(r.expiresAt)}`}
                  </p>
                </div>
                {/* Boutons desktop */}
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => toggleExpandRequest(r.id)}
                    className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8">
                    <Eye size={12} /> Fichiers
                  </button>
                  <button onClick={() => copyRequestLink(r.token)}
                    className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all
                      ${copiedToken === r.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                    {copiedToken === r.token ? <Check size={12} /> : <Copy size={12} />}
                    Lien
                  </button>
                  <button onClick={() => handleToggleRequest(r.id)}
                    className="btn-icon"
                    title={r.active ? 'Désactiver' : 'Activer'}>
                    {r.active ? <ToggleRight size={15} className="text-brand-400" /> : <ToggleLeft size={15} />}
                  </button>
                  <button onClick={() => handleDeleteRequest(r.id)} className="btn-icon-danger" title="Supprimer">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Boutons mobile */}
              <div className="flex sm:hidden items-center gap-1.5 mt-3 pt-3 border-t border-white/5">
                <button onClick={() => toggleExpandRequest(r.id)}
                  className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8 flex-1 justify-center">
                  <Eye size={12} /> Fichiers
                </button>
                <button onClick={() => copyRequestLink(r.token)}
                  className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-1 justify-center
                    ${copiedToken === r.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                  {copiedToken === r.token ? <Check size={12} /> : <Copy size={12} />}
                  Lien
                </button>
                <button onClick={() => handleToggleRequest(r.id)}
                  className="btn-icon flex-shrink-0"
                  title={r.active ? 'Désactiver' : 'Activer'}>
                  {r.active ? <ToggleRight size={15} className="text-brand-400" /> : <ToggleLeft size={15} />}
                </button>
                <button onClick={() => handleDeleteRequest(r.id)} className="btn-icon-danger flex-shrink-0" title="Supprimer">
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Expanded received files */}
              {expandedRequest === r.id && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  {!receivedFiles[r.id] && (
                    <p className="text-white/40 text-sm text-center py-2">Chargement…</p>
                  )}
                  {receivedFiles[r.id]?.length === 0 && (
                    <p className="text-white/40 text-sm text-center py-2">Aucun fichier reçu pour l'instant.</p>
                  )}
                  {receivedFiles[r.id]?.map(f => (
                    <div key={f.id} className="bg-white/5 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-lg flex-shrink-0">{getFileIcon(f.originalName.split('.').pop() || '')}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.originalName}</p>
                          <p className="text-xs text-white/40">{formatBytes(f.size)} · {formatDate(f.uploadedAt)}</p>
                        </div>
                        <button onClick={() => handleDownloadReceived(r.id, f.id, f.originalName)}
                          className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1.5 flex-shrink-0">
                          <Download size={12} /> Télécharger
                        </button>
                      </div>
                      {/* Infos déposant */}
                      {(f.uploaderName || f.uploaderEmail) && (
                        <div className="mt-2 flex items-center gap-2 pt-2 border-t border-white/5">
                          <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                            <User size={10} className="text-brand-400" />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {f.uploaderName && (
                              <span className="text-xs font-medium text-white/70">{f.uploaderName}</span>
                            )}
                            {f.uploaderEmail && (
                              <a href={`mailto:${f.uploaderEmail}`}
                                className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-mono">
                                {f.uploaderEmail}
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      {f.message && (
                        <div className="mt-2 flex items-start gap-2 pt-2 border-t border-white/5">
                          <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <MessageSquare size={10} className="text-white/50" />
                          </div>
                          <p className="text-xs text-white/60 italic">"{f.message}"</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
