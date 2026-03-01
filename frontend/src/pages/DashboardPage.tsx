import { useEffect, useState } from 'react'
import { Trash2, Download, RefreshCw, Copy, Check, Eye, ToggleLeft, ToggleRight, HardDrive, Clock, Mail, Send, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  listFiles, deleteFile, listUploadRequests,
  deleteUploadRequest, toggleUploadRequest, getStats,
  runCleanup, getReceivedFiles, downloadReceivedFile,
  sendShareByEmail, updateFileExpiry
} from '../api/client'
import { formatBytes, formatDate, getFileIcon, downloadBlob, copyToClipboard } from '../lib/utils'

interface FileItem {
  id: string; originalName: string; mimeType: string; size: string
  uploadedAt: string; expiresAt: string | null; downloads: number
  shares: { token: string }[]
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

  const load = async () => {
    setLoading(true)
    try {
      const [filesRes, reqRes, statsRes] = await Promise.all([
        listFiles(), listUploadRequests(), getStats()
      ])
      setFiles(filesRes.data)
      setRequests(reqRes.data)
      setStats(statsRes.data)
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
          <button onClick={handleCleanup} className="btn-secondary flex items-center gap-2 text-sm">
            <Trash2 size={14} /> Nettoyer expirés
          </button>
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
              <div className="card mb-8 flex items-center gap-5">
                <div className="w-10 h-10 bg-brand-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
                  <HardDrive size={18} className="text-brand-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium">Espace disque</p>
                    <p className="text-xs text-white/40">
                      {stats.disk.used} / {stats.disk.total} utilisés
                      &nbsp;·&nbsp;
                      <span className="text-brand-300">{stats.disk.free} libres</span>
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className={`text-sm font-semibold flex-shrink-0 ${ pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-brand-400' }`}>{pct}%</span>
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
          Demandes de dépôt ({requests.length})
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
                <div className="flex items-center gap-4">
                  <span className="text-2xl flex-shrink-0">{getFileIcon(f.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{f.originalName}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {formatBytes(f.size)} · {formatDate(f.uploadedAt)} · {f.downloads} téléchargement(s)
                      {f.expiresAt ? ` · Expire ${formatDate(f.expiresAt)}` : ' · Sans expiration'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {share && (
                      <>
                        <button
                          onClick={() => window.open(`${window.location.origin}/s/${share.token}`, '_blank')}
                          className="btn-secondary flex items-center gap-1 text-xs px-2.5 py-1.5"
                          title="Voir la page de partage">
                          <ExternalLink size={12} /> Voir
                        </button>
                        <button
                          onClick={() => copyShareLink(share.token)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                            ${copiedToken === share.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                          {copiedToken === share.token ? <Check size={12} /> : <Copy size={12} />}
                          Copier
                        </button>
                        <button
                          onClick={() => { setEmailingFileId(emailingFileId === f.id ? null : f.id); setEmailToFile('') }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                            ${emailingFileId === f.id ? 'bg-brand-500/20 text-brand-400' : 'btn-secondary'}`}
                          title="Envoyer par email">
                          <Mail size={12} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setExpiryEditId(expiryEditId === f.id ? null : f.id)
                        setExpiryValue(f.expiresAt ? f.expiresAt.substring(0, 10) : '')
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${expiryEditId === f.id ? 'bg-brand-500/20 text-brand-400' : 'btn-secondary'}`}
                      title="Modifier l'expiration">
                      <Clock size={12} />
                    </button>
                    <button onClick={() => handleDeleteFile(f.id)} className="btn-danger flex items-center gap-1 text-xs px-2.5 py-1.5">
                      <Trash2 size={12} />
                    </button>
                  </div>
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
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                  ${r.active ? 'bg-brand-500/20' : 'bg-white/5'}`}>
                  <Download size={18} className={r.active ? 'text-brand-400' : 'text-white/30'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{r.title}</p>
                    <span className={r.active ? 'badge-green' : 'badge-red'}>
                      {r.active ? 'Actif' : 'Désactivé'}
                    </span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">
                    {r.filesCount} fichier(s) reçu(s) · Créé {formatDate(r.createdAt)}
                    {r.expiresAt && ` · Expire ${formatDate(r.expiresAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleExpandRequest(r.id)}
                    className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1.5">
                    <Eye size={12} /> Fichiers
                  </button>
                  <button onClick={() => copyRequestLink(r.token)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                      ${copiedToken === r.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                    {copiedToken === r.token ? <Check size={12} /> : <Copy size={12} />}
                    Lien
                  </button>
                  <button onClick={() => handleToggleRequest(r.id)}
                    className="btn-secondary flex items-center gap-1 text-xs px-2.5 py-1.5">
                    {r.active ? <ToggleRight size={14} className="text-brand-400" /> : <ToggleLeft size={14} />}
                  </button>
                  <button onClick={() => handleDeleteRequest(r.id)} className="btn-danger flex items-center gap-1 text-xs px-2.5 py-1.5">
                    <Trash2 size={12} />
                  </button>
                </div>
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
                    <div key={f.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                      <span className="text-lg">{getFileIcon(f.originalName.split('.').pop() || '')}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.originalName}</p>
                        <p className="text-xs text-white/40">
                          {formatBytes(f.size)}
                          {f.uploaderName ? ` · De : ${f.uploaderName}` : ''}
                          {f.uploaderEmail ? ` (${f.uploaderEmail})` : ''}
                          {` · ${formatDate(f.uploadedAt)}`}
                        </p>
                        {f.message && <p className="text-xs text-white/50 italic mt-0.5">"{f.message}"</p>}
                      </div>
                      <button onClick={() => handleDownloadReceived(r.id, f.id, f.originalName)}
                        className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1.5">
                        <Download size={12} /> Télécharger
                      </button>
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
