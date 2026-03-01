import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, Pencil, Check, X, ShieldCheck, User, Files, FolderInput, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { listUsers, createUser, updateUser, deleteUser, getAllFilesAdmin, getAllUploadRequestsAdmin, deleteFile, deleteUploadRequest } from '../api/client'
import { formatDate, formatBytes, getFileIcon } from '../lib/utils'
import { useAuthStore } from '../stores/useAuthStore'

interface UserItem {
  id: string; name: string; email: string; role: string
  active: boolean; createdAt: string; lastLogin: string | null
}

interface AdminFile {
  id: string; originalName: string; mimeType: string; size: string
  uploadedAt: string; downloads: number
  user: { id: string; name: string; email: string } | null
  shares: { token: string }[]
}

interface AdminUploadRequest {
  id: string; token: string; title: string; active: boolean; createdAt: string; filesCount: number
  user: { id: string; name: string; email: string } | null
}

type Tab = 'users' | 'files' | 'deposits'

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')

  // --- Onglet Utilisateurs ---
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newConfirmPassword, setNewConfirmPassword] = useState('')
  const [newRole, setNewRole] = useState('USER')
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editActive, setEditActive] = useState(true)

  // --- Onglet Fichiers ---
  const [allFiles, setAllFiles] = useState<AdminFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesLoaded, setFilesLoaded] = useState(false)

  // --- Onglet Depots ---
  const [allDeposits, setAllDeposits] = useState<AdminUploadRequest[]>([])
  const [depositsLoading, setDepositsLoading] = useState(false)
  const [depositsLoaded, setDepositsLoaded] = useState(false)

  const load = async () => {
    try {
      const res = await listUsers()
      setUsers(res.data)
    } catch { toast.error('Erreur de chargement') }
    setLoading(false)
  }

  const loadFiles = async () => {
    if (filesLoaded) return
    setFilesLoading(true)
    try {
      const res = await getAllFilesAdmin()
      setAllFiles(res.data)
      setFilesLoaded(true)
    } catch { toast.error('Erreur de chargement des fichiers') }
    setFilesLoading(false)
  }

  const loadDeposits = async () => {
    if (depositsLoaded) return
    setDepositsLoading(true)
    try {
      const res = await getAllUploadRequestsAdmin()
      setAllDeposits(res.data)
      setDepositsLoaded(true)
    } catch { toast.error('Erreur de chargement des depots') }
    setDepositsLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'files') loadFiles() }, [tab])
  useEffect(() => { if (tab === 'deposits') loadDeposits() }, [tab])

  const handleCreate = async () => {
    if (!newName || !newEmail || !newPassword || !newConfirmPassword) return toast.error('Tous les champs sont requis')
    if (newPassword.length < 8) return toast.error('Le mot de passe doit faire au moins 8 caractères')
    if (newPassword !== newConfirmPassword) return toast.error('Les mots de passe ne correspondent pas')
    setCreating(true)
    try {
      const res = await createUser({ name: newName, email: newEmail, password: newPassword, role: newRole })
      setUsers(prev => [...prev, res.data])
      setShowCreate(false)
      setNewName(''); setNewEmail(''); setNewPassword(''); setNewConfirmPassword(''); setNewRole('USER')
      toast.success('Utilisateur cree')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur lors de la creation')
    }
    setCreating(false)
  }

  const startEdit = (u: UserItem) => {
    setEditId(u.id); setEditName(u.name); setEditRole(u.role); setEditActive(u.active)
  }

  const saveEdit = async (id: string) => {
    try {
      const res = await updateUser(id, { name: editName, role: editRole, active: editActive })
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...res.data } : u))
      setEditId(null)
      toast.success('Modifie')
    } catch { toast.error('Erreur') }
  }

  const handleDelete = async (id: string) => {
    if (id === me?.id) return toast.error('Impossible de supprimer votre propre compte')
    try {
      await deleteUser(id)
      setUsers(prev => prev.filter(u => u.id !== id))
      toast.success('Utilisateur supprime')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur')
    }
  }

  const handleDeleteFile = async (id: string) => {
    try {
      await deleteFile(id)
      setAllFiles(prev => prev.filter(f => f.id !== id))
      toast.success('Fichier supprime')
    } catch { toast.error('Erreur') }
  }

  const handleDeleteDeposit = async (id: string) => {
    try {
      await deleteUploadRequest(id)
      setAllDeposits(prev => prev.filter(d => d.id !== id))
      toast.success('Demande supprimee')
    } catch { toast.error('Erreur') }
  }

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: 'users', label: 'Utilisateurs', icon: Users, count: users.length },
    { id: 'files', label: 'Fichiers partages', icon: Files, count: filesLoaded ? allFiles.length : undefined },
    { id: 'deposits', label: 'Demandes de depot', icon: FolderInput, count: depositsLoaded ? allDeposits.length : undefined }
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <ShieldCheck size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Administration</h1>
          <p className="text-white/40 text-sm">Gestion des utilisateurs et des fichiers</p>
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
              <Plus size={15} /> Nouvel utilisateur
            </button>
          </div>

          {showCreate && (
            <div className="card mb-6 space-y-4">
              <h3 className="font-semibold text-white/80">Creer un utilisateur</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Nom</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Prenom Nom" className="input" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Email</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemple.fr" className="input" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Mot de passe</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 caractères" className="input" />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Confirmer le mot de passe</label>
                  <input type="password" value={newConfirmPassword} onChange={e => setNewConfirmPassword(e.target.value)} placeholder="Répétez le mot de passe" className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} className="input bg-surface-700">
                    <option value="USER">Utilisateur standard</option>
                    <option value="ADMIN">Administrateur</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={handleCreate} disabled={creating} className="btn-primary flex items-center gap-2 py-2.5 px-5">
                  {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={15} />}
                  Creer
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-secondary py-2.5 px-5">Annuler</button>
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
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1">
                          <label className="text-xs text-white/50 mb-1.5 block">Nom</label>
                          <input value={editName} onChange={e => setEditName(e.target.value)} className="input text-sm py-2" />
                        </div>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">Role</label>
                          <select value={editRole} onChange={e => setEditRole(e.target.value)} className="input bg-surface-700 text-sm py-2">
                            <option value="USER">Utilisateur</option>
                            <option value="ADMIN">Administrateur</option>
                          </select>
                        </div>
                        <div className="flex items-end gap-3">
                          <label className="flex items-center gap-2 cursor-pointer pb-2">
                            <div onClick={() => setEditActive(!editActive)}
                              className={`w-10 h-5 rounded-full transition-colors relative ${editActive ? 'bg-brand-500' : 'bg-white/20'}`}>
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </div>
                            <span className="text-sm text-white/60">{editActive ? 'Actif' : 'Desactive'}</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(u.id)} className="btn-primary flex items-center gap-1.5 py-2 px-4 text-sm">
                          <Check size={13} /> Enregistrer
                        </button>
                        <button onClick={() => setEditId(null)} className="btn-secondary flex items-center gap-1.5 py-2 px-4 text-sm">
                          <X size={13} /> Annuler
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
                            {u.role === 'ADMIN' ? 'Admin' : 'Utilisateur'}
                          </span>
                          {!u.active && <span className="badge badge-red">Desactive</span>}
                          {u.id === me?.id && <span className="badge badge-orange">Vous</span>}
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">
                          {u.email}
                        </p>
                        <p className="text-xs text-white/30 mt-0.5">
                          Créé {formatDate(u.createdAt)}
                          {u.lastLogin ? ` · Dernière connexion ${formatDate(u.lastLogin)}` : ' · Jamais connecté'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => startEdit(u)} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-2">
                          <Pencil size={12} /> Modifier
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

      {/* Onglet Fichiers partages */}
      {tab === 'files' && (
        <div>
          {filesLoading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/40 text-sm">Chargement des fichiers...</p>
            </div>
          ) : allFiles.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <Files size={40} className="mx-auto mb-3 opacity-30" />
              <p>Aucun fichier envoye</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Proprietaire</th>
                    <th className="text-left px-4 py-3">Fichier</th>
                    <th className="text-left px-4 py-3">Taille</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Telechgt.</th>
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
                          <span className="text-white/30 italic text-xs">Inconnu</span>
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

      {/* Onglet Demandes de depot */}
      {tab === 'deposits' && (
        <div>
          {depositsLoading ? (
            <div className="text-center py-16">
              <div className="w-10 h-10 border-2 border-brand-500/40 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/40 text-sm">Chargement...</p>
            </div>
          ) : allDeposits.length === 0 ? (
            <div className="text-center py-16 text-white/30">
              <FolderInput size={40} className="mx-auto mb-3 opacity-30" />
              <p>Aucune demande de depot</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Proprietaire</th>
                    <th className="text-left px-4 py-3">Titre</th>
                    <th className="text-left px-4 py-3">Statut</th>
                    <th className="text-left px-4 py-3">Fichiers recus</th>
                    <th className="text-left px-4 py-3">Cree le</th>
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
                          <span className="text-white/30 italic text-xs">Inconnu</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/80 text-xs font-medium">{d.title}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${d.active ? 'badge-green' : 'badge-red'}`}>
                          {d.active ? 'Actif' : 'Desactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">{d.filesCount} fichier(s)</td>
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
