import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Download, RefreshCw, Copy, Check, Eye, ToggleLeft, ToggleRight, HardDrive, Clock, Mail, Send, ExternalLink, User, TimerOff, AlertTriangle, MessageSquare, Package, EyeOff, ChevronDown, ChevronUp, Hash } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/useAuthStore'
import {
  listFiles, deleteFile, listUploadRequests,
  deleteUploadRequest, toggleUploadRequest, getStats,
  runCleanup, getReceivedFiles, getReceivedFileDlToken,
  sendShareByEmail, sendRequestByEmail, updateFileExpiry,
  updateFileMaxDownloads, updateRequestExpiry
} from '../api/client'
import { formatBytes, formatDate, getFileIcon, copyToClipboard, isValidEmail, formatCountdown, toLocalDatetimeValue } from '../lib/utils'
import { useT } from '../i18n'

interface FileItem {
  id: string; originalName: string; mimeType: string; size: string
  uploadedAt: string; expiresAt: string | null; downloads: number; maxDownloads: number | null
  shares: { token: string; downloads: number; maxDownloads: number | null }[]
  batchToken?: string | null
  hideFilenames?: boolean
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
  const { t, lang } = useT()
  const [tab, setTab] = useState<Tab>('sent')
  const [files, setFiles] = useState<FileItem[]>([])
  const [requests, setRequests] = useState<UploadRequest[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null)
  const expandedRequestRef = useRef<string | null>(null)
  const [receivedFiles, setReceivedFiles] = useState<Record<string, ReceivedFile[]>>({})
  const [emailingFileId, setEmailingFileId] = useState<string | null>(null)
  const [emailToFile, setEmailToFile] = useState('')
  const [emailSendingToken, setEmailSendingToken] = useState<string | null>(null)
  const [expiryEditId, setExpiryEditId] = useState<string | null>(null)
  const [expiryValue, setExpiryValue] = useState('')
  const [savingExpiryId, setSavingExpiryId] = useState<string | null>(null)
  const [expiringNowId, setExpiringNowId] = useState<string | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [downloadingReceived, setDownloadingReceived] = useState<Record<string, boolean>>({})
  const [maxDlEditId, setMaxDlEditId] = useState<string | null>(null)
  const [maxDlValue, setMaxDlValue] = useState('')
  const [savingMaxDlId, setSavingMaxDlId] = useState<string | null>(null)
  const [requestExpiryEditId, setRequestExpiryEditId] = useState<string | null>(null)
  const [requestExpiryValue, setRequestExpiryValue] = useState('')
  const [savingRequestExpiryId, setSavingRequestExpiryId] = useState<string | null>(null)
  const [emailingRequestId, setEmailingRequestId] = useState<string | null>(null)
  const [emailToRequest, setEmailToRequest] = useState('')
  const [emailSendingRequestId, setEmailSendingRequestId] = useState<string | null>(null)

  // Grouper les fichiers par batchToken pour l'affichage
  type DisplayItem =
    | { type: 'single'; file: FileItem }
    | { type: 'batch'; batchToken: string; files: FileItem[] }

  const displayItems = useMemo<DisplayItem[]>(() => {
    const batchMap = new Map<string, FileItem[]>()
    for (const f of files) {
      if (f.batchToken) {
        const arr = batchMap.get(f.batchToken) ?? []
        arr.push(f)
        batchMap.set(f.batchToken, arr)
      }
    }
    const result: DisplayItem[] = []
    // Lots (ordre d'apparition : premier fichier du lot)
    const seenBatch = new Set<string>()
    for (const f of files) {
      if (f.batchToken && !seenBatch.has(f.batchToken)) {
        seenBatch.add(f.batchToken)
        result.push({ type: 'batch', batchToken: f.batchToken, files: batchMap.get(f.batchToken)! })
      } else if (!f.batchToken) {
        result.push({ type: 'single', file: f })
      }
    }
    return result
  }, [files])

  const load = async () => {
    setLoading(true)
    // On vide le cache local puis on refetch pour les panels déjà ouverts
    setReceivedFiles({})
    try {
      const [filesRes, reqRes, statsRes] = await Promise.all([
        listFiles(), listUploadRequests(), ...(isAdmin ? [getStats()] : [Promise.resolve(null)])
      ])
      setFiles(filesRes.data)
      setRequests(reqRes.data)
      if (statsRes) setStats((statsRes as any).data)
      // Refetch uniquement si la demande ouverte existe toujours
      const currentExpanded = expandedRequestRef.current
      const expandedStillExists =
        !!currentExpanded &&
        reqRes.data.some((r: UploadRequest) => r.id === currentExpanded)

      if (expandedStillExists && currentExpanded) {
        const requestId = currentExpanded
        try {
          const res = await getReceivedFiles(requestId)
          setReceivedFiles(prev => ({ ...prev, [requestId]: res.data }))
        } catch (err: any) {
          console.error('Failed to fetch received files for request', requestId, err)
          setReceivedFiles(prev => ({ ...prev, [requestId]: [] }))
          toast.error(t('toast.cannotLoadReceived'))
        }
      } else if (currentExpanded) {
        setExpandedRequest(null)
        expandedRequestRef.current = null
      }
    } catch {
      toast.error(t('toast.loadError'))
      setExpandedRequest(null)
      expandedRequestRef.current = null
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDeleteFile = async (id: string) => {
    try {
      await deleteFile(id)
      toast.success(t('toast.fileDeleted'))
      await load()
    } catch { toast.error(t('toast.deleteError')) }
  }

  const handleDeleteBatch = async (batchFiles: FileItem[]) => {
    try {
      await Promise.all(batchFiles.map(f => deleteFile(f.id)))
      toast.success(t('toast.fileDeleted'))
      await load()
    } catch { toast.error(t('toast.deleteError')) }
  }

  const handleDeleteRequest = async (id: string) => {
    try {
      await deleteUploadRequest(id)
      toast.success(t('toast.requestDeleted'))
      await load()
    } catch { toast.error(t('toast.deleteError')) }
  }

  const handleToggleRequest = async (id: string) => {
    try {
      const res = await toggleUploadRequest(id)
      setRequests(prev => prev.map(r => r.id === id ? { ...r, active: res.data.active } : r))
    } catch { toast.error(t('common.error')) }
  }

  const copyLink = async (prefix: 's' | 'r', token: string) => {
    try {
      await copyToClipboard(`${window.location.origin}/${prefix}/${token}`)
      setCopiedToken(token)
      toast.success(t('toast.linkCopied'))
      setTimeout(() => setCopiedToken(null), 2000)
    } catch { toast.error(t('toast.cannotCopy')) }
  }

  const toggleExpandRequest = async (id: string) => {
    if (expandedRequest === id) { setExpandedRequest(null); expandedRequestRef.current = null; return }
    setExpandedRequest(id)
    expandedRequestRef.current = id
    if (!receivedFiles[id]) {
      const requestId = id
      try {
        const res = await getReceivedFiles(requestId)
        if (expandedRequestRef.current !== requestId) return
        setReceivedFiles(prev => ({ ...prev, [requestId]: res.data }))
      } catch {
        if (expandedRequestRef.current !== requestId) return
        setReceivedFiles(prev => ({ ...prev, [requestId]: [] }))
        toast.error(t('toast.cannotLoadReceived'))
      }
    }
  }

  const handleDownloadReceived = async (requestId: string, fileId: string, filename: string) => {
    const key = `${requestId}:${fileId}`
    setDownloadingReceived(p => ({ ...p, [key]: true }))
    try {
      const res = await getReceivedFileDlToken(requestId, fileId)
      const a = document.createElement('a')
      a.href = `/api/upload-requests/dl/${res.data.dlToken}`
      a.download = filename
      a.click()
    } catch { toast.error(t('toast.loadError')) }
    finally { setDownloadingReceived(p => { const next = { ...p }; delete next[key]; return next }) }
  }

  const handleSendFileEmail = async (token: string) => {
    const addresses = emailToFile.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (addresses.length === 0) return toast.error(t('toast.emailRequired'))
    if (addresses.some(a => !isValidEmail(a))) return toast.error(t('toast.emailInvalid'))
    setEmailSendingToken(token)
    try {
      await sendShareByEmail(addresses.join(','), [token], lang)
      if (addresses.length === 1) {
        toast.success(t('toast.linkEmailSent', { email: addresses[0] }))
      } else {
        toast.success(t('toast.requestEmailsSent', { count: String(addresses.length) }))
      }
      setEmailingFileId(null)
      setEmailToFile('')
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'SMTP_NOT_CONFIGURED') toast.error(t('toast.smtpNotConfigured'))
      else if (code === 'EMAIL_SEND_FAILED') toast.error(t('toast.emailSendFailed', { detail: err.response?.data?.detail || '' }))
      else toast.error(t('toast.emailSendError'))
    }
    setEmailSendingToken(null)
  }

  const handleExpireNow = async (fileId: string) => {
    setExpiringNowId(fileId)
    try {
      const expiresAt = new Date().toISOString()
      await updateFileExpiry(fileId, expiresAt)
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, expiresAt } : f))
      toast.success(t('toast.expiredNow'))
    } catch { toast.error(t('toast.deleteError')) }
    setExpiringNowId(null)
  }

  const handleExpireNowBatch = async (batchFiles: FileItem[]) => {
    const key = batchFiles[0]?.batchToken || batchFiles[0]?.id
    setExpiringNowId(key)
    try {
      const expiresAt = new Date().toISOString()
      await Promise.all(batchFiles.map(f => updateFileExpiry(f.id, expiresAt)))
      const ids = new Set(batchFiles.map(f => f.id))
      setFiles(prev => prev.map(f => ids.has(f.id) ? { ...f, expiresAt } : f))
      toast.success(t('toast.expiredNow'))
    } catch { toast.error(t('toast.deleteError')) }
    setExpiringNowId(null)
  }

  const handleSaveExpiry = async (fileId: string, clear = false) => {
    setSavingExpiryId(fileId)
    try {
      const expiresAt = (!clear && expiryValue) ? new Date(expiryValue).toISOString() : null
      await updateFileExpiry(fileId, expiresAt)
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, expiresAt } : f))
      setExpiryEditId(null)
      toast.success(expiresAt ? t('toast.expiryUpdated') : t('toast.expiryRemoved'))
    } catch { toast.error(t('toast.updateError')) }
    setSavingExpiryId(null)
  }

  const handleSaveBatchExpiry = async (batchFiles: FileItem[], clear = false) => {
    const key = batchFiles[0]?.batchToken || batchFiles[0]?.id
    setSavingExpiryId(key)
    try {
      const expiresAt = (!clear && expiryValue) ? new Date(expiryValue).toISOString() : null
      await Promise.all(batchFiles.map(f => updateFileExpiry(f.id, expiresAt)))
      const ids = new Set(batchFiles.map(f => f.id))
      setFiles(prev => prev.map(f => ids.has(f.id) ? { ...f, expiresAt } : f))
      setExpiryEditId(null)
      toast.success(expiresAt ? t('toast.expiryUpdated') : t('toast.expiryRemoved'))
    } catch { toast.error(t('toast.updateError')) }
    setSavingExpiryId(null)
  }

  const handleCleanup = async () => {
    try {
      const res = await runCleanup()
      toast.success(t('toast.cleanupDone', { count: String(res.data.deletedFiles) }))
      await load()
    } catch { toast.error(t('common.error')) }
  }

  const handleSaveMaxDl = async (fileId: string, clear = false) => {
    setSavingMaxDlId(fileId)
    try {
      const maxDownloads = (!clear && maxDlValue) ? parseInt(maxDlValue, 10) : null
      if (maxDownloads !== null && (isNaN(maxDownloads) || maxDownloads < 1)) {
        toast.error(t('common.error')); setSavingMaxDlId(null); return
      }
      await updateFileMaxDownloads(fileId, maxDownloads)
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, maxDownloads } : f))
      setMaxDlEditId(null)
      toast.success(maxDownloads !== null ? t('toast.maxDlUpdated') : t('toast.maxDlRemoved'))
    } catch { toast.error(t('toast.updateError')) }
    setSavingMaxDlId(null)
  }

  const handleSaveBatchMaxDl = async (batchFiles: FileItem[], clear = false) => {
    const key = batchFiles[0]?.batchToken || batchFiles[0]?.id
    setSavingMaxDlId(key)
    try {
      const maxDownloads = (!clear && maxDlValue) ? parseInt(maxDlValue, 10) : null
      if (maxDownloads !== null && (isNaN(maxDownloads) || maxDownloads < 1)) {
        toast.error(t('common.error')); setSavingMaxDlId(null); return
      }
      await Promise.all(batchFiles.map(f => updateFileMaxDownloads(f.id, maxDownloads)))
      const ids = new Set(batchFiles.map(f => f.id))
      setFiles(prev => prev.map(f => ids.has(f.id) ? { ...f, maxDownloads } : f))
      setMaxDlEditId(null)
      toast.success(maxDownloads !== null ? t('toast.maxDlUpdated') : t('toast.maxDlRemoved'))
    } catch { toast.error(t('toast.updateError')) }
    setSavingMaxDlId(null)
  }

  const handleSaveRequestExpiry = async (requestId: string, clear = false) => {
    setSavingRequestExpiryId(requestId)
    try {
      const expiresAt = (!clear && requestExpiryValue) ? new Date(requestExpiryValue).toISOString() : null
      await updateRequestExpiry(requestId, expiresAt)
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, expiresAt } : r))
      setRequestExpiryEditId(null)
      toast.success(expiresAt ? t('toast.expiryUpdated') : t('toast.expiryRemoved'))
    } catch { toast.error(t('toast.updateError')) }
    setSavingRequestExpiryId(null)
  }

  const handleSendRequestEmail = async (requestId: string) => {
    const addresses = emailToRequest.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (addresses.length === 0) return toast.error(t('toast.emailRequired'))
    if (addresses.some(a => !isValidEmail(a))) return toast.error(t('toast.emailInvalid'))
    setEmailSendingRequestId(requestId)
    try {
      await sendRequestByEmail(requestId, addresses.join(','), lang)
      if (addresses.length === 1) {
        toast.success(t('toast.linkEmailSent', { email: addresses[0] }))
      } else {
        toast.success(t('toast.requestEmailsSent', { count: String(addresses.length) }))
      }
      setEmailingRequestId(null)
      setEmailToRequest('')
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'SMTP_NOT_CONFIGURED') toast.error(t('toast.smtpNotConfigured'))
      else if (code === 'EMAIL_SEND_FAILED') toast.error(t('toast.emailSendFailed', { detail: err.response?.data?.detail || '' }))
      else toast.error(t('toast.emailSendError'))
    }
    setEmailSendingRequestId(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-2">
        <h1 className="text-3xl sm:text-2xl font-bold text-center sm:text-left">{t('dash.title')}</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          {isAdmin && (
            <button onClick={handleCleanup} className="btn-secondary flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2.5 py-2 sm:px-3 sm:py-2 w-full sm:w-auto">
              <Trash2 size={13} /> {t('dash.cleanExpired')}
            </button>
          )}
          <button onClick={load} className="btn-secondary flex items-center justify-center gap-1.5 text-xs sm:text-sm px-2.5 py-2 sm:px-3 sm:py-2 w-full sm:w-auto">
            <RefreshCw size={13} /> {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { label: t('dash.statFilesSent'), value: stats.filesCount },
              { label: t('dash.statShares'), value: stats.sharesCount },
              { label: t('dash.statRequests'), value: stats.uploadRequestsCount },
              { label: t('dash.statReceived'), value: stats.receivedFilesCount },
              { label: t('dash.statSizeSent'), value: formatBytes(stats.totalSize) },
              { label: t('dash.statSizeReceived'), value: formatBytes(stats.totalReceivedSize) }
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
                      <p className="text-sm font-medium flex-shrink-0">{t('dash.disk')}</p>
                      <p className="text-xs text-white/40 truncate text-right hidden sm:block">
                        {stats.disk.used} / {stats.disk.total} {t('dash.diskUsed')}
                        &nbsp;·&nbsp;
                        <span className="text-brand-300">{stats.disk.free} {t('dash.diskFree')}</span>
                      </p>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    {/* Infos mobile sous la barre */}
                    <p className="text-xs text-white/40 mt-1.5 sm:hidden">
                      {stats.disk.used} / {stats.disk.total}
                      &nbsp;·&nbsp;
                      <span className="text-brand-300">{stats.disk.free} {t('dash.diskFree')}</span>
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
          {t('dash.tabSent')} ({displayItems.length})
        </button>
        <button onClick={() => setTab('requests')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all
            ${tab === 'requests' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>
          {t('dash.tabRequests')} ({requests.length})
        </button>
      </div>

      {loading && (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-white/40">{t('common.loading')}</p>
        </div>
      )}

      {/* Sent files */}
      {!loading && tab === 'sent' && (
        <div className="space-y-3">
          {files.length === 0 && (
            <div className="card text-center py-12 text-white/40">{t('dash.noFiles')}</div>
          )}
          {displayItems.map(item => {
            if (item.type === 'batch') {
              const { batchToken, files: bf } = item
              const firstShare = bf[0]?.shares?.[0]
              const isCollapsed = !expandedBatches.has(batchToken)
              const totalSize = bf.reduce((acc, f) => acc + Number(f.size), 0)
              const firstFile = bf[0]
              return (
                <div key={batchToken} className="card overflow-hidden border border-brand-500/20">
                  {/* Entête du lot */}
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 bg-brand-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Package size={18} className="text-brand-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{t('dash.batchGroupTitle', { count: String(bf.length) })}</p>
                        {firstFile?.hideFilenames && (
                          <span className="flex items-center gap-1 text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                            <EyeOff size={10} /> {t('dash.batchHideFilenames')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">
                        {t('dash.batchGroupSize', { count: String(bf.length), size: formatBytes(String(totalSize)) })}
                        {' · '}{formatDate(firstFile.uploadedAt)}
                        {firstFile.expiresAt
                          ? new Date(firstFile.expiresAt) <= new Date()
                            ? <span className="text-red-400"> · {t('dash.expired')}</span>
                            : ` · ${t('dash.expires')} ${formatDate(firstFile.expiresAt)}${formatCountdown(firstFile.expiresAt, lang) ? ` (${t('dash.expiresIn')} ${formatCountdown(firstFile.expiresAt, lang)})` : ''}`
                          : ` · ${t('dash.noExpiry')}`}
                      </p>
                    </div>
                    {/* Boutons desktop lot */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      {firstShare && (
                        <>
                          <button
                            onClick={() => window.open(`${window.location.origin}/s/${firstShare.token}`, '_blank')}
                            className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8 flex-shrink-0">
                            <ExternalLink size={12} /> {t('common.view')}
                          </button>
                          <button
                            onClick={() => copyLink('s', firstShare.token)}
                            className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-shrink-0
                              ${copiedToken === firstShare.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                            {copiedToken === firstShare.token ? <Check size={12} /> : <Copy size={12} />}
                            {t('dash.link')}
                          </button>
                          <button
                            onClick={() => { setEmailingFileId(emailingFileId === batchToken ? null : batchToken); setEmailToFile('') }}
                            className={`btn-icon ${emailingFileId === batchToken ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                            <Mail size={13} />
                          </button>
                          <button
                            onClick={() => {
                              setMaxDlEditId(maxDlEditId === batchToken ? null : batchToken)
                              setMaxDlValue(firstFile.shares?.[0]?.maxDownloads != null ? String(firstFile.shares[0].maxDownloads) : '')
                            }}
                            className={`btn-icon ${maxDlEditId === batchToken ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                            title={t('dash.maxDlEdit')}>
                            <Hash size={13} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setExpiryEditId(expiryEditId === batchToken ? null : batchToken)
                          setExpiryValue(firstFile.expiresAt ? toLocalDatetimeValue(firstFile.expiresAt) : '')
                        }}
                        className={`btn-icon ${expiryEditId === batchToken ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                        title={t('dash.expiryEdit')}>
                        <Clock size={13} />
                      </button>
                      <button
                        onClick={() => handleExpireNowBatch(bf)}
                        disabled={expiringNowId === batchToken}
                        className="btn-icon"
                        title={t('dash.expiresNow')}>
                        {expiringNowId === batchToken
                          ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                          : <TimerOff size={13} />}
                      </button>
                      <button onClick={() => handleDeleteBatch(bf)} className="btn-icon-danger" title={t('common.delete')}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {/* Bouton expand/collapse */}
                    <button
                      onClick={() => setExpandedBatches(s => {
                        const n = new Set(s)
                        n.has(batchToken) ? n.delete(batchToken) : n.add(batchToken)
                        return n
                      })}
                      className="btn-icon flex-shrink-0">
                      {isCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                    </button>
                  </div>
                  {/* Boutons mobile lot */}
                  <div className="flex sm:hidden items-center gap-1.5 mt-3 pt-3 border-t border-white/5 overflow-x-auto">
                    {firstShare && (
                      <>
                        <button
                          onClick={() => window.open(`${window.location.origin}/s/${firstShare.token}`, '_blank')}
                          className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8 flex-shrink-0">
                          <ExternalLink size={12} /> {t('common.view')}
                        </button>
                        <button
                          onClick={() => copyLink('s', firstShare.token)}
                          className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-shrink-0
                            ${copiedToken === firstShare.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                          {copiedToken === firstShare.token ? <Check size={12} /> : <Copy size={12} />}
                          {t('dash.link')}
                        </button>
                        <button
                          onClick={() => { setEmailingFileId(emailingFileId === batchToken ? null : batchToken); setEmailToFile('') }}
                          className={`btn-icon flex-shrink-0 ${emailingFileId === batchToken ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                          <Mail size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setMaxDlEditId(maxDlEditId === batchToken ? null : batchToken)
                            setMaxDlValue(firstFile.shares?.[0]?.maxDownloads != null ? String(firstFile.shares[0].maxDownloads) : '')
                          }}
                          className={`btn-icon flex-shrink-0 ${maxDlEditId === batchToken ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                          <Hash size={13} />
                        </button>
                        <button onClick={() => handleDeleteBatch(bf)} className="btn-icon-danger flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setExpiryEditId(expiryEditId === batchToken ? null : batchToken)
                        setExpiryValue(firstFile.expiresAt ? toLocalDatetimeValue(firstFile.expiresAt) : '')
                      }}
                      className={`btn-icon flex-shrink-0 ${expiryEditId === batchToken ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                      <Clock size={13} />
                    </button>
                    <button
                      onClick={() => handleExpireNowBatch(bf)}
                      disabled={expiringNowId === batchToken}
                      className="btn-icon flex-shrink-0">
                      {expiringNowId === batchToken
                        ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                        : <TimerOff size={13} />}
                    </button>
                  </div>
                  {/* Expiration inline lot */}
                  {expiryEditId === batchToken && (
                    <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
                      <Clock size={13} className="text-white/30 flex-shrink-0" />
                      <input
                        type="datetime-local"
                        id="dash-expiry-date"
                        name="expiresAt"
                        value={expiryValue}
                        onChange={e => setExpiryValue(e.target.value)}
                        min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16)}
                        className="input text-sm py-1.5 flex-1 min-w-36"
                      />
                      <button
                        onClick={() => handleSaveBatchExpiry(bf)}
                        disabled={savingExpiryId === batchToken || !expiryValue}
                        className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                        {savingExpiryId === batchToken
                          ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <Check size={12} />}
                        {t('common.save')}
                      </button>
                      <button
                        onClick={() => handleSaveBatchExpiry(bf, true)}
                        disabled={savingExpiryId === batchToken}
                        className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">
                        {t('dash.noExpiry')}
                      </button>
                      <button onClick={() => setExpiryEditId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                    </div>
                  )}
                  {maxDlEditId === batchToken && (
                    <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
                      <Hash size={13} className="text-white/30 flex-shrink-0" />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={maxDlValue}
                        onChange={e => setMaxDlValue(e.target.value)}
                        placeholder={t('common.unlimited')}
                        className="input text-sm py-1.5 flex-1 min-w-24"
                      />
                      <button
                        onClick={() => handleSaveBatchMaxDl(bf)}
                        disabled={savingMaxDlId === batchToken || !maxDlValue}
                        className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                        {savingMaxDlId === batchToken
                          ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <Check size={12} />}
                        {t('common.save')}
                      </button>
                      <button
                        onClick={() => handleSaveBatchMaxDl(bf, true)}
                        disabled={savingMaxDlId === batchToken}
                        className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">
                        {t('common.unlimited')}
                      </button>
                      <button onClick={() => setMaxDlEditId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                    </div>
                  )}
                  {/* Email inline lot */}
                  {emailingFileId === batchToken && firstShare && (
                    <div className="mt-3 pt-3 border-t border-white/10 flex gap-2 items-center">
                      <Mail size={13} className="text-white/30 flex-shrink-0" />
                      <input
                        type="email"
                        id="dash-batch-email"
                        name="emailTo"
                        value={emailToFile}
                        onChange={e => setEmailToFile(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendFileEmail(firstShare.token)}
                        placeholder={t('dash.emailPlaceholder')}
                        className="input text-sm py-1.5 flex-1"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSendFileEmail(firstShare.token)}
                        disabled={emailSendingToken === firstShare.token || !emailToFile.trim()}
                        className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                        {emailSendingToken === firstShare.token
                          ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <Send size={12} />}
                        {t('common.send')}
                      </button>
                      <button onClick={() => setEmailingFileId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                    </div>
                  )}
                  {/* Liste des fichiers du lot */}
                  {!isCollapsed && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                      {bf.map((f, idx) => (
                        <div key={f.id} className="flex items-center gap-2 px-1 py-1.5">
                          <span className="text-base flex-shrink-0">{getFileIcon(f.mimeType)}</span>
                          <p className="flex-1 min-w-0 text-sm truncate text-white/80">
                            {firstFile.hideFilenames
                              ? `Fichier ${idx + 1}`
                              : f.originalName}
                          </p>
                          <span className="text-xs text-white/40 flex-shrink-0">{formatBytes(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            // Fichier individuel
            const f = item.file
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
                          <AlertTriangle size={10} /> {t('dash.limitReached')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">
                      {formatBytes(f.size)} · {formatDate(f.uploadedAt)} ·{' '}
                      {f.maxDownloads !== null
                        ? <span className={f.downloads >= f.maxDownloads ? 'text-red-400' : ''}>{f.downloads}/{f.maxDownloads} {t('dash.dl')}</span>
                        : <>{f.downloads} {t('dash.dl')}</>}
                      {f.expiresAt
                        ? new Date(f.expiresAt) <= new Date()
                          ? <span className="text-red-400"> · {t('dash.expired')}</span>
                          : ` · ${t('dash.expires')} ${formatDate(f.expiresAt)}${formatCountdown(f.expiresAt, lang) ? ` (${t('dash.expiresIn')} ${formatCountdown(f.expiresAt, lang)})` : ''}`
                        : ` · ${t('dash.noExpiry')}`}
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
                          <ExternalLink size={12} /> {t('common.view')}
                        </button>
                        <button
                          onClick={() => copyLink('s', share.token)}
                          className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-shrink-0
                            ${copiedToken === share.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                          {copiedToken === share.token ? <Check size={12} /> : <Copy size={12} />}
                          {t('dash.link')}
                        </button>
                        <button
                          onClick={() => { setEmailingFileId(emailingFileId === f.id ? null : f.id); setEmailToFile('') }}
                          className={`btn-icon ${emailingFileId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                          title="Envoyer par email">
                          <Mail size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setMaxDlEditId(maxDlEditId === f.id ? null : f.id)
                            setMaxDlValue(f.shares?.[0]?.maxDownloads != null ? String(f.shares[0].maxDownloads) : '')
                          }}
                          className={`btn-icon ${maxDlEditId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                          title={t('dash.maxDlEdit')}>
                          <Hash size={13} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        setExpiryEditId(expiryEditId === f.id ? null : f.id)
                        setExpiryValue(f.expiresAt ? toLocalDatetimeValue(f.expiresAt) : '')
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
                        <ExternalLink size={12} /> {t('common.view')}
                      </button>
                      <button
                        onClick={() => copyLink('s', share.token)}
                        className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-shrink-0
                          ${copiedToken === share.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                        {copiedToken === share.token ? <Check size={12} /> : <Copy size={12} />}
                        {t('dash.link')}
                      </button>
                      <button
                        onClick={() => { setEmailingFileId(emailingFileId === f.id ? null : f.id); setEmailToFile('') }}
                        className={`btn-icon flex-shrink-0 ${emailingFileId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                        <Mail size={13} />
                      </button>
                      <button
                        onClick={() => {
                          setMaxDlEditId(maxDlEditId === f.id ? null : f.id)
                          setMaxDlValue(f.shares?.[0]?.maxDownloads != null ? String(f.shares[0].maxDownloads) : '')
                        }}
                        className={`btn-icon flex-shrink-0 ${maxDlEditId === f.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                        <Hash size={13} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setExpiryEditId(expiryEditId === f.id ? null : f.id)
                      setExpiryValue(f.expiresAt ? toLocalDatetimeValue(f.expiresAt) : '')
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
                      id="dash-file-email"
                      name="emailTo"
                      value={emailToFile}
                      onChange={e => setEmailToFile(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendFileEmail(share.token)}
                      placeholder={t('dash.emailPlaceholder')}
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
                      {t('common.send')}
                    </button>
                    <button onClick={() => setEmailingFileId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                  </div>
                )}

                {/* Inline : modifier expiration */}
                {expiryEditId === f.id && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
                    <Clock size={13} className="text-white/30 flex-shrink-0" />
                    <input
                      type="datetime-local"
                      id="dash-file-expiry"
                      name="expiresAt"
                      value={expiryValue}
                      onChange={e => setExpiryValue(e.target.value)}
                      min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16)}
                      className="input text-sm py-1.5 flex-1 min-w-36"
                    />
                    <button
                      onClick={() => handleSaveExpiry(f.id)}
                      disabled={savingExpiryId === f.id || !expiryValue}
                      className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                      {savingExpiryId === f.id
                        ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Check size={12} />}
                      {t('common.save')}
                    </button>
                    <button
                      onClick={() => handleSaveExpiry(f.id, true)}
                      disabled={savingExpiryId === f.id}
                      className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">
                      {t('dash.noExpiry')}
                    </button>
                    <button onClick={() => setExpiryEditId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                  </div>
                )}
                {maxDlEditId === f.id && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
                    <Hash size={13} className="text-white/30 flex-shrink-0" />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={maxDlValue}
                      onChange={e => setMaxDlValue(e.target.value)}
                      placeholder={t('common.unlimited')}
                      className="input text-sm py-1.5 flex-1 min-w-24"
                    />
                    <button
                      onClick={() => handleSaveMaxDl(f.id)}
                      disabled={savingMaxDlId === f.id || !maxDlValue}
                      className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                      {savingMaxDlId === f.id
                        ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Check size={12} />}
                      {t('common.save')}
                    </button>
                    <button
                      onClick={() => handleSaveMaxDl(f.id, true)}
                      disabled={savingMaxDlId === f.id}
                      className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">
                      {t('common.unlimited')}
                    </button>
                    <button onClick={() => setMaxDlEditId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
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
            <div className="card text-center py-12 text-white/40">{t('dash.noRequests')}</div>
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
                      {r.active ? t('common.active') : t('common.inactive')}
                    </span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                    {t('users.filesCount', { count: String(r.filesCount) })} · {formatDate(r.createdAt)}
                    {r.expiresAt && <><br className="sm:hidden" /><span>{` · ${t('dash.expires')} ${formatDate(r.expiresAt)}${formatCountdown(r.expiresAt, lang) ? ` (${t('dash.expiresIn')} ${formatCountdown(r.expiresAt, lang)})` : ''}`}</span></>}
                  </p>
                </div>
                {/* Boutons desktop */}
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => toggleExpandRequest(r.id)}
                    className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8">
                    <Eye size={12} /> {t('dash.filesBtn')}
                  </button>
                  <button onClick={() => copyLink('r', r.token)}
                    className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all
                      ${copiedToken === r.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                    {copiedToken === r.token ? <Check size={12} /> : <Copy size={12} />}
                    {t('dash.link')}
                  </button>
                  <button onClick={() => handleToggleRequest(r.id)}
                    className="btn-icon"
                    title={r.active ? t('dash.disable') : t('dash.enable')}>
                    {r.active ? <ToggleRight size={15} className="text-brand-400" /> : <ToggleLeft size={15} />}
                  </button>
                  <button
                    onClick={() => { setRequestExpiryEditId(requestExpiryEditId === r.id ? null : r.id); setRequestExpiryValue(r.expiresAt ? toLocalDatetimeValue(r.expiresAt) : '') }}
                    className={`btn-icon ${requestExpiryEditId === r.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                    title={t('dash.expiryEdit')}>
                    <Clock size={13} />
                  </button>
                  <button
                    onClick={() => { setEmailingRequestId(emailingRequestId === r.id ? null : r.id); setEmailToRequest('') }}
                    className={`btn-icon ${emailingRequestId === r.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}
                    title={t('dash.sendEmail')}>
                    <Mail size={13} />
                  </button>
                  <button onClick={() => handleDeleteRequest(r.id)} className="btn-icon-danger" title={t('common.delete')}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Boutons mobile */}
              <div className="flex sm:hidden items-center gap-1.5 mt-3 pt-3 border-t border-white/5">
                <button onClick={() => toggleExpandRequest(r.id)}
                  className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 h-8 flex-1 justify-center">
                  <Eye size={12} /> {t('dash.filesBtn')}
                </button>
                <button onClick={() => copyLink('r', r.token)}
                  className={`flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-all flex-1 justify-center
                    ${copiedToken === r.token ? 'bg-emerald-500/20 text-emerald-400' : 'btn-secondary'}`}>
                  {copiedToken === r.token ? <Check size={12} /> : <Copy size={12} />}
                  {t('dash.link')}
                </button>
                <button onClick={() => handleToggleRequest(r.id)}
                  className="btn-icon flex-shrink-0"
                  title={r.active ? t('dash.disable') : t('dash.enable')}>
                  {r.active ? <ToggleRight size={15} className="text-brand-400" /> : <ToggleLeft size={15} />}
                </button>
                <button
                  onClick={() => { setRequestExpiryEditId(requestExpiryEditId === r.id ? null : r.id); setRequestExpiryValue(r.expiresAt ? toLocalDatetimeValue(r.expiresAt) : '') }}
                  className={`btn-icon flex-shrink-0 ${requestExpiryEditId === r.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                  <Clock size={13} />
                </button>
                <button
                  onClick={() => { setEmailingRequestId(emailingRequestId === r.id ? null : r.id); setEmailToRequest('') }}
                  className={`btn-icon flex-shrink-0 ${emailingRequestId === r.id ? '!bg-brand-500/20 !text-brand-400 !border-brand-500/30' : ''}`}>
                  <Mail size={13} />
                </button>
                <button onClick={() => handleDeleteRequest(r.id)} className="btn-icon-danger flex-shrink-0" title={t('common.delete')}>
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Expanded received files */}
              {expandedRequest === r.id && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                  {!receivedFiles[r.id] && (
                    <p className="text-white/40 text-sm text-center py-2">{t('common.loading')}</p>
                  )}
                  {receivedFiles[r.id]?.length === 0 && (
                    <p className="text-white/40 text-sm text-center py-2">{t('dash.noReceived')}</p>
                  )}
                  {(() => {
                    // Grouper les fichiers par envoi (même déposant + message = même dépôt)
                    const groups: { key: string; uploaderName: string | null; uploaderEmail: string | null; message: string | null; files: ReceivedFile[] }[] = []
                    for (const f of receivedFiles[r.id] || []) {
                      const key = `${f.uploaderName ?? ''}|${f.uploaderEmail ?? ''}|${f.message ?? ''}`
                      const existing = groups.find(g => g.key === key)
                      if (existing) existing.files.push(f)
                      else groups.push({ key, uploaderName: f.uploaderName, uploaderEmail: f.uploaderEmail, message: f.message, files: [f] })
                    }
                    return groups.map(group => (
                      <div key={group.key} className="bg-white/5 rounded-xl overflow-hidden">
                        {/* Infos déposant — affichées une seule fois par groupe */}
                        {(group.uploaderName || group.uploaderEmail || group.message) && (
                          <div className="px-3 py-2 border-b border-white/8 bg-white/3 flex flex-col gap-1.5">
                            {(group.uploaderName || group.uploaderEmail) && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                                  <User size={10} className="text-brand-400" />
                                </div>
                                {group.uploaderName && (
                                  <span className="text-xs font-medium text-white/70">{group.uploaderName}</span>
                                )}
                                {group.uploaderEmail && (
                                  <a href={`mailto:${group.uploaderEmail}`}
                                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-mono">
                                    {group.uploaderEmail}
                                  </a>
                                )}
                              </div>
                            )}
                            {group.message && (
                              <div className="flex items-start gap-2">
                                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <MessageSquare size={10} className="text-white/50" />
                                </div>
                                <p className="text-xs text-white/60 italic">"{group.message}"</p>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Fichiers du groupe */}
                        {group.files.map((f, i) => {
                          const dlKey = `${r.id}:${f.id}`
                          const isDl = !!downloadingReceived[dlKey]
                          return (
                          <div key={f.id} className={`flex items-center gap-3 px-3 py-2.5 ${i < group.files.length - 1 ? 'border-b border-white/5' : ''}`}>
                            <span className="text-lg flex-shrink-0">{getFileIcon(f.originalName.split('.').pop() || '')}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{f.originalName}</p>
                              <p className="text-xs text-white/40">{formatBytes(f.size)} · {formatDate(f.uploadedAt)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <button
                                onClick={() => !isDl && handleDownloadReceived(r.id, f.id, f.originalName)}
                                disabled={isDl}
                                className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1.5 disabled:opacity-60">
                                {isDl
                                  ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('share.downloading')}</>
                                  : <><Download size={12} /> {t('common.download')}</>}
                              </button>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    ))
                  })()}
                </div>
              )}

              {/* Inline : modifier expiration de la request */}
              {requestExpiryEditId === r.id && (
                <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
                  <Clock size={13} className="text-white/30 flex-shrink-0" />
                  <input
                    type="datetime-local"
                    value={requestExpiryValue}
                    onChange={e => setRequestExpiryValue(e.target.value)}
                    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16)}
                    className="input text-sm py-1.5 flex-1 min-w-36"
                  />
                  <button
                    onClick={() => handleSaveRequestExpiry(r.id)}
                    disabled={savingRequestExpiryId === r.id || !requestExpiryValue}
                    className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                    {savingRequestExpiryId === r.id
                      ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Check size={12} />}
                    {t('common.save')}
                  </button>
                  <button
                    onClick={() => handleSaveRequestExpiry(r.id, true)}
                    disabled={savingRequestExpiryId === r.id}
                    className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-40">
                    {t('dash.noExpiry')}
                  </button>
                  <button onClick={() => setRequestExpiryEditId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                </div>
              )}

              {/* Inline : envoyer le lien par email */}
              {emailingRequestId === r.id && (
                <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2 items-center">
                  <Mail size={13} className="text-white/30 flex-shrink-0" />
                  <input
                    type="email"
                    value={emailToRequest}
                    onChange={e => setEmailToRequest(e.target.value)}
                    placeholder={t('dash.emailPlaceholder')}
                    className="input text-sm py-1.5 flex-1 min-w-48"
                  />
                  <button
                    onClick={() => handleSendRequestEmail(r.id)}
                    disabled={emailSendingRequestId === r.id || !isValidEmail(emailToRequest)}
                    className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40">
                    {emailSendingRequestId === r.id
                      ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Send size={12} />}
                    {t('common.send')}
                  </button>
                  <button onClick={() => setEmailingRequestId(null)} className="btn-secondary text-xs px-2.5 py-1.5">✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
