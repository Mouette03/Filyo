import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, Pencil, Check, X, ShieldCheck, User, Files, FolderInput, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { listUsers, createUser, updateUser, deleteUser, getAllFilesAdmin, getAllUploadRequestsAdmin, deleteFile, deleteUploadRequest } from '../api/client'
import { formatDate, formatBytes, getFileIcon } from '../lib/utils'
import { useAuthStore } from '../stores/useAuthStore'
import { useT } from '../i18n'

interface UserItem {
  id: string; name: string; email: string; role: string
  active: boolean; createdAt: string; lastLogin: string | null
  storageQuotaBytes: string | null; storageUsedBytes: string
}

interface AdminFile {
  id: string; originalName: string; mimeType: string; size: string
  uploadedAt: string; downloads: number
  user: { id: string; name: string; email: string } | null
  shares: { token: string }[]
}

interface AdminUploadRequest {
  id: string; token: string; title: string; active: boolean; createdAt: string; expiresAt: string | null; filesCount: number
  user: { id: string; name: string; email: string } | null
}

type Tab = 'users' | 'files' | 'deposits'

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('users')
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // --- Onglet Utilisateurs ---
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newConfirmPassword, setNewConfirmPassword] = useState('')
  const [newRole, setNewRole] = useState('USER')
  const [newQuotaMB, setNewQuotaMB] = useState('')
  const [newQuotaUnit, setNewQuotaUnit] = useState<'MB' | 'GB'>('GB')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editQuotaMB, setEditQuotaMB] = useState('')
  const [editQuotaUnit, setEditQuotaUnit] = useState<'MB' | 'GB'>('GB')

  // --- Onglet Fichiers ---
  const [allFiles, setAllFiles] = useState<AdminFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesLoaded, setFilesLoaded] = useState(false)

  // --- Onglet Dépôts ---
  const [allDeposits, setAllDeposits] = useState<AdminUploadRequest[]>([])
  const [depositsLoading, setDepositsLoading] = useState(false)
  const [depositsLoaded, setDepositsLoaded] = useState(false)

  const load = async () => {
    try {
      const res = await listUsers()
      setUsers(res.data)
    } catch { toast.error(t('toast.loadError')) }
    setLoading(false)
  }

  const loadFiles = async () => {
    if (filesLoaded) return
    setFilesLoading(true)
    try {
      const res = await getAllFilesAdmin()
      setAllFiles(res.data)
      setFilesLoaded(true)
    } catch { toast.error(t('toast.loadError')) }  // files
    setFilesLoading(false)
  }

  const loadDeposits = async () => {
    if (depositsLoaded) return
    setDepositsLoading(true)
    try {
      const res = await getAllUploadRequestsAdmin()
      setAllDeposits(res.data)
      setDepositsLoaded(true)
    } catch { toast.error(t('toast.loadError')) }  // deposits
    setDepositsLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'files') loadFiles() }, [tab])
  useEffect(() => { if (tab === 'deposits') loadDeposits() }, [tab])

  const handleCreate = async () => {
    if (!newName || !newEmail || !newPassword || !newConfirmPassword) return toast.error(t('toast.allFieldsRequired'))
    if (newPassword.length < 8) return toast.error(t('toast.passwordMin8'))
    if (newPassword !== newConfirmPassword) return toast.error(t('toast.passwordMismatch'))
    setCreating(true)
    try {
      const quotaVal = newQuotaMB !== '' ? parseFloat(newQuotaMB) : null
      const quotaMB = quotaVal != null ? (newQuotaUnit === 'GB' ? quotaVal * 1024 : quotaVal) : null
      const res = await createUser({ name: newName, email: newEmail, password: newPassword, role: newRole, storageQuotaMB: quotaMB })
      setUsers(prev => [...prev, res.data])
      setShowCreate(false)
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewConfirmPassword(''); setNewRole('USER'); setNewQuotaMB(''); setNewQuotaUnit('GB')
      toast.success(t('toast.userCreated'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'EMAIL_TAKEN') toast.error(t('error.emailTaken'))
      else toast.error(t('common.error'))
    }
    setCreating(false)
  }

  const startEdit = (u: UserItem) => {
    setEditId(u.id); setEditName(u.name); setEditEmail(u.email); setEditRole(u.role); setEditActive(u.active)
    const quotaBytes = u.storageQuotaBytes ? BigInt(u.storageQuotaBytes) : null
    if (quotaBytes && quotaBytes >= BigInt(1024 * 1024 * 1024) && Number(quotaBytes) % (1024 * 1024 * 1024) === 0) {
      setEditQuotaMB((Number(quotaBytes) / (1024 * 1024 * 1024)).toFixed(0))
      setEditQuotaUnit('GB')
    } else {
      setEditQuotaMB(quotaBytes ? (Number(quotaBytes) / (1024 * 1024)).toFixed(0) : '')
      setEditQuotaUnit('MB')
    }
  }

  const saveEdit = async (id: string) => {
    try {
      const editQuotaVal = editQuotaMB !== '' ? parseFloat(editQuotaMB) : null
      const quotaMB = editQuotaVal != null ? (editQuotaUnit === 'GB' ? editQuotaVal * 1024 : editQuotaVal) : null
      const res = await updateUser(id, { name: editName, email: editEmail, role: editRole, active: editActive, storageQuotaMB: quotaMB })
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...res.data } : u))
      setEditId(null)
      toast.success(t('toast.edited'))
    } catch (err: any) {
      const code = err?.response?.data?.code
      if (code === 'CANNOT_DEMOTE_SELF') toast.error(t('toast.cannotDemoteSelf'))
      else if (code === 'CANNOT_DEACTIVATE_SELF') toast.error(t('toast.cannotDeactivateSelf'))
      else if (code === 'LAST_ADMIN') toast.error(t('toast.lastAdmin'))
      else if (code === 'EMAIL_TAKEN') toast.error(t('error.emailTaken'))
      else toast.error(t('common.error'))
    }
  }

  const handleDelete = async (id: string) => {
    if (id === me?.id) return toast.error(t('toast.cannotDeleteSelf'))
    try {
      await deleteUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
      toast.success(t('toast.userDeleted'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'USER_NOT_FOUND') toast.error(t('error.userNotFound'))
      else toast.error(t('common.error'))
    }
  }

  const handleDeleteFile = async (id: string) => {
    try {
      await deleteFile(id)
      setAllFiles(prev => prev.filter(f => f.id !== id))
      toast.success(t('toast.fileDeleted'))
    } catch { toast.error(t('common.error')) }
  }

  const handleDeleteDeposit = async (id: string) => {
    try {
      await deleteUploadRequest(id)
      setAllDeposits(prev => prev.filter(d => d.id !== id))
      toast.success(t('toast.requestDeleted'))
    } catch { toast.error(t('common.error')) }
  }

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: 'users', label: t('users.tabUsers'), icon: Users, count: users.length },
    { id: 'files', label: t('users.tabFiles'), icon: Files, count: filesLoaded ? allFiles.length : undefined },
    { id: 'deposits', label: t('users.tabDeposits'), icon: FolderInput, count: depositsLoaded ? allDeposits.length : undefined }
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <ShieldCheck size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-white/40 text-sm">{t('users.subtitle')}</p>
        </div>
      </div>

      {/* Onglets — select sur mobile, boutons sur sm+ */}
      <div className="mb-8">
        {/* Select mobile */}
        <div className="sm:hidden relative">
          <select
            value={tab}
            onChange={e => setTab(e.target.value as Tab)}
            className="w-full bg-surface-800 text-white text-sm font-medium rounded-xl px-4 pr-10 py-3 border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer"
          >
            {tabs.map(t => (
              <option key={t.id} value={t.id}>
                {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
        </div>

        {/* Boutons desktop */}
        <div className="hidden sm:block bg-surface-800 rounded-xl p-1.5">
          <div className="flex gap-1">
            {tabs.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    tab === t.id
                      ? 'bg-brand-500 text-white shadow-lg'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  <Icon size={15} />
                  {t.label}
                  {t.count !== undefined && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-white/10'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Onglet Utilisateurs */}
      {tab === 'users' && (
        <>
          <div className="flex justify-end mb-5">
            <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2 py-2.5">
              <Plus size={15} /> {t('users.newUser')}
            </button>
          </div>

          {showCreate && (
            <div className="card mb-6 space-y-4">
              <h3 className="font-semibold text-white/80">{t('users.createUser')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('users.nameLabel')}</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('users.namePlaceholder')} className="input" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('users.emailLabel')}</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t('users.emailPlaceholder')} className="input" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('users.passwordLabel')}</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('users.passwordPlaceholder')} className="input" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('users.confirmPasswordLabel')}</label>
                  <input type="password" value={newConfirmPassword} onChange={e => setNewConfirmPassword(e.target.value)} placeholder={t('users.confirmPasswordPlaceholder')} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('users.roleLabel')}</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input bg-surface-700">
                    <option value="USER">{t('users.roleUser')}</option>
                    <option value="ADMIN">{t('users.roleAdmin')}</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('users.quotaLabel')}</label>
                  <div className="flex gap-2">
                    <input type="number" min="1" value={newQuotaMB} onChange={e => setNewQuotaMB(e.target.value)} placeholder={t('users.quotaPlaceholder')} className="input flex-1" />
                    <select value={newQuotaUnit} onChange={e => setNewQuotaUnit(e.target.value as 'MB' | 'GB')} className="input bg-surface-700 w-20">
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={handleCreate} disabled={creating} className="btn-primary flex items-center gap-2 py-2.5 px-5">
                  {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={15} />}
                  {t('common.create')}
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-secondary py-2.5 px-5">{t('common.cancel')}</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(u => (
                <div key={u.id} className="card">
                  {editId === u.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">{t('users.nameLabel')}</label>
                          <input value={editName} onChange={e => setEditName(e.target.value)} className="input text-sm py-2" />
                        </div>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">{t('users.emailLabel')}</label>
                          <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="input text-sm py-2" />
                        </div>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">{t('users.roleLabel')}</label>
                          <select
                            value={editRole}
                            onChange={e => setEditRole(e.target.value)}
                            disabled={editId === me?.id}
                            className={`input bg-surface-700 text-sm py-2 ${editId === me?.id ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <option value="USER">{t('role.user')}</option>
                            <option value="ADMIN">{t('role.admin')}</option>
                          </select>
                        </div>
                        <div className="flex items-end gap-3">
                          <label className={`flex items-center gap-2 pb-2 ${editId === me?.id ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                            <div
                              onClick={() => editId !== me?.id && setEditActive(!editActive)}
                              className={`w-10 h-5 rounded-full transition-colors relative ${editActive ? 'bg-brand-500' : 'bg-white/20'} ${editId === me?.id ? 'pointer-events-none' : ''}`}>
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </div>
                            <span className="text-sm text-white/60">{editActive ? t('common.active') : t('common.inactive')}</span>
                          </label>
                        </div>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">{t('users.quotaLabel')}</label>
                          <div className="flex gap-2">
                            <input type="number" min="1" value={editQuotaMB} onChange={e => setEditQuotaMB(e.target.value)} placeholder={t('users.quotaPlaceholder')} className="input text-sm py-2 flex-1 min-w-0" />
                            <select value={editQuotaUnit} onChange={e => setEditQuotaUnit(e.target.value as 'MB' | 'GB')} className="input bg-surface-700 text-sm py-2 w-20 flex-shrink-0">
                              <option value="MB">MB</option>
                              <option value="GB">GB</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(u.id)} className="btn-primary flex items-center gap-1.5 py-2 px-4 text-sm">
                          <Check size={13} /> {t('common.save')}
                        </button>
                        <button onClick={() => setEditId(null)} className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-sm">
                          <X size={13} /> {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center text-brand-400 font-bold flex-shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{u.name}</span>
                          <span className={`badge ${u.role === 'ADMIN' ? 'badge-blue' : 'badge-green'} flex items-center gap-1`}>
                            {u.role === 'ADMIN' ? <ShieldCheck size={10} /> : <User size={10} />}
                            {u.role === 'ADMIN' ? 'Admin' : t('role.user')}
                          </span>
                          {!u.active && <span className="badge badge-red">{t('common.inactive')}</span>}
                          {u.id === me?.id && <span className="badge badge-orange">{t('common.you')}</span>}
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">
                          {u.email}
                        </p>
                        <p className="text-xs text-white/30 mt-0.5">
                          {t('users.createdAt', { date: formatDate(u.createdAt) })}
                          {u.lastLogin ? ` · ${t('users.lastLogin', { date: formatDate(u.lastLogin) })}` : ` · ${t('users.neverConnected')}`}
                        </p>
                        {(() => {
                          const usedBytes = parseInt(u.storageUsedBytes || '0')
                          const quotaBytes = u.storageQuotaBytes ? parseInt(u.storageQuotaBytes) : null
                          if (quotaBytes === null) return (
                            <p className="text-xs text-white/25 mt-0.5">{formatBytes(usedBytes)} · {t('users.quotaUnlimited')}</p>
                          )
                          const pct = Math.min(100, Math.round(usedBytes / quotaBytes * 100))
                          return (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-white/30 whitespace-nowrap">{t('users.quotaUsed', { used: formatBytes(usedBytes), quota: formatBytes(quotaBytes) })}</span>
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => startEdit(u)} className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-2">
                          <Pencil size={12} /><span className="hidden sm:inline">{t('common.edit')}</span>
                        </button>
                        {u.id !== me?.id && (
                          <button onClick={() => handleDelete(u.id)} className="btn-danger flex items-center gap-1 text-xs px-2.5 py-2">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Onglet Fichiers partagés */}
      {tab === 'files' && (
        <div>
          {filesLoading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/40 text-sm">{t('common.loading')}</p>
            </div>
          ) : allFiles.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Files size={40} className="mx-auto mb-3 opacity-30" />
              <p>{t('users.noFiles')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">{t('users.colOwner')}</th>
                    <th className="text-left px-4 py-3">{t('users.colFile')}</th>
                    <th className="text-left px-4 py-3">{t('users.colSize')}</th>
                    <th className="text-left px-4 py-3">{t('users.colDate')}</th>
                    <th className="text-left px-4 py-3">{t('users.colDownloads')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {allFiles.map((f, i) => (
                    <tr key={f.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                      <td className="px-4 py-3">
                        {f.user ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-brand-500/15 flex items-center justify-center text-brand-400 text-xs font-bold flex-shrink-0">
                              {f.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-white/80 text-xs">{f.user.name}</p>
                              <p className="text-white/30 text-xs">{f.user.email}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-white/30 italic text-xs">{t('common.unknown')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl" aria-hidden>{getFileIcon(f.mimeType)}</span>
                          <span className="text-white/80 text-xs font-medium truncate max-w-[160px]">{f.originalName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">{formatBytes(parseInt(f.size))}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{formatDate(f.uploadedAt)}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{f.downloads}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteFile(f.id)} className="btn-danger flex items-center gap-1 text-xs px-2.5 py-1.5">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Onglet Demandes de dépôt */}
      {tab === 'deposits' && (
        <div>
          {depositsLoading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/40 text-sm">{t('common.loading')}</p>
            </div>
          ) : allDeposits.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <FolderInput size={40} className="mx-auto mb-3 opacity-30" />
              <p>{t('users.noDeposits')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">{t('users.colOwner')}</th>
                    <th className="text-left px-4 py-3">{t('users.colTitle')}</th>
                    <th className="text-left px-4 py-3">{t('users.colStatus')}</th>
                    <th className="text-left px-4 py-3">{t('users.colReceived')}</th>
                    <th className="text-left px-4 py-3">{t('users.colCreated')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {allDeposits.map((d, i) => (
                    <tr key={d.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                      <td className="px-4 py-3">
                        {d.user ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-brand-500/15 flex items-center justify-center text-brand-400 text-xs font-bold flex-shrink-0">
                              {d.user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-white/80 text-xs">{d.user.name}</p>
                              <p className="text-white/30 text-xs">{d.user.email}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-white/30 italic text-xs">{t('common.unknown')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/80 text-xs font-medium">{d.title}</td>
                      <td className="px-4 py-3">
                        {(() => { const isExpired = d.expiresAt && new Date(d.expiresAt).getTime() <= now; return (
                          <span className={`badge ${d.active && !isExpired ? 'badge-green' : isExpired ? 'badge-orange' : 'badge-red'}`}>
                            {d.active && !isExpired ? t('common.active') : isExpired ? t('dash.expired') : t('common.inactive')}
                          </span>
                        ); })()}
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">{t('users.filesCount', { count: String(d.filesCount) })}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{formatDate(d.createdAt)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteDeposit(d.id)} className="btn-danger flex items-center gap-1 text-xs px-2.5 py-1.5">
                          <Trash2 size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
