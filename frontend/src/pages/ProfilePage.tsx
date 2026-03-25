import { useState, useRef, useEffect } from 'react'
import { User, Camera, Trash2, Lock, RefreshCw, Check, Pencil, Eraser } from 'lucide-react'
import toast from 'react-hot-toast'
import { uploadAvatar, deleteAvatar, changePassword, updateProfile, updateCleanupPreference, getSettings } from '../api/client'
import { useAuthStore } from '../stores/useAuthStore'
import { useT } from '../i18n'

export default function ProfilePage() {
  const { user, updateAvatar, updateName, updateCleanupPref } = useAuthStore()
  const { t } = useT()

  // --- Avatar ---
  const avatarInput = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [deletingAvatar, setDeletingAvatar] = useState(false)

  // --- Nom ---
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(user?.name || '')
  const [savingName, setSavingName] = useState(false)

  // --- Mot de passe ---
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  // --- Nettoyage automatique ---
  const [cleanupAfterDays, setCleanupAfterDays] = useState<number | null>(user?.cleanupAfterDays ?? null)
  const [savingCleanup, setSavingCleanup] = useState(false)
  const [adminMax, setAdminMax] = useState<number | null>(null)

  useEffect(() => {
    getSettings().then((res: any) => setAdminMax(res.data.cleanupAfterDays ?? null)).catch(() => {})
  }, [])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error(t('toast.imageRequired'))
    if (file.size > 3 * 1024 * 1024) return toast.error(t('toast.imageTooLarge3'))
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res = await uploadAvatar(form)
      updateAvatar(res.data.avatarUrl)
      toast.success(t('toast.avatarUpdated'))
    } catch (err: any) {
      const status = err?.response?.status
      const code = err?.response?.data?.code
      if (status === 413 || code === 'FILE_TOO_LARGE') {
        toast.error(t('toast.imageTooLarge3'))
      } else {
        toast.error(t('toast.uploadError'))
      }
    }
    setUploadingAvatar(false)
    if (avatarInput.current) avatarInput.current.value = ''
  }

  const handleDeleteAvatar = async () => {
    setDeletingAvatar(true)
    try {
      await deleteAvatar()
      updateAvatar(null)
      toast.success(t('toast.avatarDeleted'))
    } catch {
      toast.error(t('toast.deleteError'))
    }
    setDeletingAvatar(false)
  }

  const handleSaveName = async () => {
    if (!newName.trim()) return toast.error(t('toast.nameEmpty'))
    setSavingName(true)
    try {
      const res = await updateProfile({ name: newName.trim() })
      updateName(res.data.name)
      setEditingName(false)
      toast.success(t('toast.nameUpdated'))
    } catch {
      toast.error(t('toast.updateError'))
    }
    setSavingName(false)
  }

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd) return toast.error(t('toast.allPwdFieldsRequired'))
    if (newPwd.length < 8) return toast.error(t('toast.passwordMin8'))
    if (newPwd !== confirmPwd) return toast.error(t('toast.passwordMismatch'))
    setSavingPwd(true)
    try {
      await changePassword(currentPwd, newPwd)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      toast.success(t('toast.passwordUpdated'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'WRONG_PASSWORD') toast.error(t('error.wrongPassword'))
      else toast.error(t('toast.updateError'))
    }
    setSavingPwd(false)
  }

  const handleSaveCleanup = async (value: number | null) => {
    setSavingCleanup(true)
    try {
      await updateCleanupPreference(value)
      setCleanupAfterDays(value)
      updateCleanupPref(value)
      toast.success(t('profile.cleanupSaved'))
    } catch (err: any) {
      const code = err.response?.data?.code
      if (code === 'CLEANUP_DISABLED') toast.error(t('profile.cleanupDisabled'))
      else if (code === 'CLEANUP_EXCEEDS_MAX') toast.error(t('error.cleanupExceedsMax', { max: String(err.response?.data?.max ?? '') }))
      else toast.error(t('toast.saveError'))
    }
    setSavingCleanup(false)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <User size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
          <p className="text-white/40 text-sm">{user?.email}</p>
        </div>
      </div>

      {/* Section Avatar */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-5">
          <Camera size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.avatarSection')}</h3>
        </div>

        <div className="flex items-center gap-6">
          {/* Avatar preview */}
          <div className="relative flex-shrink-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Avatar"
                className="w-20 h-20 rounded-2xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-brand-500/20 flex items-center justify-center text-brand-400 text-3xl font-bold border border-white/10">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                <RefreshCw size={20} className="text-white animate-spin" />
              </div>
            )}
          </div>

          {/* Boutons */}
          <div className="space-y-2 flex-1">
            <button
              onClick={() => avatarInput.current?.click()}
              disabled={uploadingAvatar}
              className="btn-secondary flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center"
            >
              <Camera size={14} />
              {user?.avatarUrl ? t('profile.changePhoto') : t('profile.choosePhoto')}
            </button>
            {user?.avatarUrl && (
              <button
                onClick={handleDeleteAvatar}
                disabled={deletingAvatar}
                className="btn-danger flex items-center gap-2 text-sm py-2.5 px-4 w-full justify-center"
              >
                {deletingAvatar ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t('profile.removePhoto')}
              </button>
            )}
            <p className="text-xs text-white/30 text-center">{t('profile.avatarHint')}</p>
          </div>
        </div>

        <input ref={avatarInput} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
      </div>

      {/* Section Informations */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Pencil size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.infoSection')}</h3>
        </div>

        <div className="space-y-4">
          {/* Nom */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.displayName')}</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input flex-1"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                />
                <button onClick={handleSaveName} disabled={savingName} className="btn-primary flex items-center gap-1.5 px-4">
                  {savingName ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                </button>
                <button onClick={() => { setEditingName(false); setNewName(user?.name || '') }} className="btn-secondary px-4">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-white/80 font-medium">{user?.name}</span>
                <button onClick={() => { setEditingName(true); setNewName(user?.name || '') }}
                  className="text-xs text-brand-400 hover:text-brand-300">
                  {t('common.edit')}
                </button>
              </div>
            )}
          </div>

          {/* Email (lecture seule) */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.emailLabel')}</label>
            <p className="text-white/60 text-sm">{user?.email}</p>
            <p className="text-xs text-white/30 mt-0.5">{t('profile.emailReadonly')}</p>
          </div>

          {/* Rôle */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.roleLabel')}</label>
            <span className={`badge ${user?.role === 'ADMIN' ? 'badge-blue' : 'badge-green'}`}>
              {user?.role === 'ADMIN' ? t('role.admin') : t('role.user')}
            </span>
          </div>
        </div>
      </div>

      {/* Section Mot de passe */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.passwordSection')}</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.currentPassword')}</label>
            <input
              type="password"
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder={t('profile.currentPassword')}
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.newPassword')}</label>
            <input
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              className="input"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider">{t('profile.confirmNewPassword')}</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder={t('login.confirmPasswordPlaceholder')}
              className="input"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPwd}
            className="btn-primary flex items-center gap-2 py-2.5 px-6"
          >
            {savingPwd ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {t('profile.updatePassword')}
          </button>
        </div>
      </div>

      {/* Section Nettoyage automatique */}
      <div className="card mt-5">
        <div className="flex items-center gap-2 mb-4">
          <Eraser size={16} className="text-brand-400" />
          <h3 className="font-semibold">{t('profile.cleanupSection')}</h3>
        </div>
        {adminMax == null ? (
          <p className="text-sm text-white/40 italic">{t('profile.cleanupDisabled')}</p>
        ) : (
          <div className="space-y-3">
            {/* Info : délai par défaut du serveur */}
            <div className="flex items-center gap-2 rounded-lg bg-brand-500/10 border border-brand-500/20 px-3 py-2">
              <Eraser size={13} className="text-brand-400 flex-shrink-0" />
              <p className="text-xs text-brand-300">
                {t('profile.cleanupServerDefault', { days: String(adminMax) })}
              </p>
            </div>
            <p className="text-xs text-white/50">{t('profile.cleanupHint')}</p>
            <div className="flex items-center gap-3">
              <select
                value={cleanupAfterDays == null ? '' : String(cleanupAfterDays)}
                onChange={e => {
                  const v = e.target.value
                  handleSaveCleanup(v === '' ? null : Number(v))
                }}
                disabled={savingCleanup}
                className="input bg-surface-700 flex-1"
              >
                <option value="">{t('profile.cleanupDefault', { days: String(adminMax) })}</option>
                {adminMax >= 0 && <option value="0">{t('settings.cleanupAtExpiry')}</option>}
                {adminMax >= 1 && <option value="1">{t('settings.cleanup1d')}</option>}
                {adminMax >= 3 && <option value="3">{t('settings.cleanup3d')}</option>}
                {adminMax >= 7 && <option value="7">{t('settings.cleanup7d')}</option>}
                {adminMax >= 30 && <option value="30">{t('settings.cleanup30d')}</option>}
              </select>
              {savingCleanup && <RefreshCw size={16} className="text-brand-400 animate-spin flex-shrink-0" />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

